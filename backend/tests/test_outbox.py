import asyncio

import pytest

from app import outbox_worker as ow


class FakeDB:
    UNIQUE = {'workflow_runs': 'idempotency_key', 'crm_clients': 'id', 'ai_configs': 'automation_id', 'processed_events': 'event_id'}

    def __init__(self, name):
        self.name = name
        self.tables = {}
        self.rpcs = []
        self.fail_on = None

    def rows(self, t):
        return self.tables.setdefault(t, [])

    async def table(self, t, *, select='*', filters=None, order=None, limit=None, single=False, insert=None,
                    update=None, on_conflict=None, ignore_duplicates=False, **kw):
        await asyncio.sleep(0)  # yield so concurrent workers interleave
        if self.fail_on == t:
            raise RuntimeError('boom')

        def match(r):
            return all(str(r.get(k)) == v[3:] for k, v in (filters or []) if v.startswith('eq.'))

        if insert is not None:
            key = self.UNIQUE.get(t)
            if key and any(r.get(key) == insert.get(key) for r in self.rows(t)):
                if ignore_duplicates:
                    return []
                raise RuntimeError('409 duplicate key')
            self.rows(t).append(dict(insert))
            return [insert]
        if update is not None:
            out = [r for r in self.rows(t) if match(r)]
            for r in out:
                r.update(update)
            return out
        out = [r for r in self.rows(t) if match(r)]
        if limit:
            out = out[:limit]
        return (out[0] if out else None) if single else out

    async def rpc(self, name, payload):
        self.rpcs.append((name, payload))
        for r in self.rows('outbox_events'):
            if r['id'] != payload.get('p_event_id'):
                continue
            if (r.get('status') != 'processing' or r.get('locked_by') != payload.get('p_worker_id')
                    or not payload.get('p_claim_token') or r.get('claim_token') != payload.get('p_claim_token')
                    or str(r.get('locked_at')) != str(payload.get('p_locked_at'))):
                return False
            if name == 'complete_outbox_event':
                r.update(status='processed', locked_by=None, locked_at=None, claim_token=None)
                return True
            if name == 'fail_outbox_event':
                r.update(status='dead_letter' if payload['p_dead_letter'] else 'retryable', locked_by=None, locked_at=None, claim_token=None)
                return True
        return False


@pytest.fixture
def dbs(monkeypatch):
    d = {n: FakeDB(n) for n in ['db1', 'db2', 'db3', 'db4']}
    for n, db in d.items():
        monkeypatch.setattr(ow, n, db)
    monkeypatch.setattr(ow, 'DBS', d)
    d['db4'].rows('workflow_definitions').append({'id': 'wf1', 'client_id': 'c1', 'automation_id': 'a1', 'status': 'active', 'trigger_type': 'conversation.created'})
    return d


def claim(db, eid, et, payload, locked_at='T1', worker=None, attempt=1, token=None):
    ev = {'id': eid, 'event_type': et, 'payload': payload, 'aggregate_id': eid, 'status': 'processing',
          'locked_by': worker or ow.WORKER_ID, 'locked_at': locked_at, 'claim_token': token or f'token-{locked_at}-{worker or ow.WORKER_ID}', 'attempt_count': attempt}
    db.rows('outbox_events')[:] = [r for r in db.rows('outbox_events') if r['id'] != eid] + [dict(ev)]
    return dict(ev)


def run(c):
    return asyncio.run(c)


def test_redelivery_after_crash_creates_one_workflow_run(dbs):
    db4 = dbs['db4']
    ev = claim(db4, 'e1', 'conversation.created', {'automation_id': 'a1'})
    run(ow.handle_event('db4', ev))  # simulated crash: effects done, never acknowledged
    ev2 = claim(db4, 'e1', 'conversation.created', {'automation_id': 'a1'}, locked_at='T2')
    assert run(ow._process_event('db4', db4, ev2)) == 'completed'
    assert len(db4.rows('workflow_runs')) == 1
    assert len(db4.rows('processed_events')) == 1


def test_processed_event_is_skipped(dbs):
    db4 = dbs['db4']
    assert run(ow._process_event('db4', db4, claim(db4, 'e1', 'conversation.created', {'automation_id': 'a1'}))) == 'completed'
    ev2 = claim(db4, 'e1', 'conversation.created', {'automation_id': 'a1'}, locked_at='T2')
    assert run(ow._process_event('db4', db4, ev2)) == 'skipped_duplicate'
    assert len(db4.rows('workflow_runs')) == 1


def test_stale_worker_does_not_act_or_ack(dbs):
    db4 = dbs['db4']
    stale = claim(db4, 'e1', 'conversation.created', {'automation_id': 'a1'}, locked_at='T1')
    claim(db4, 'e1', 'conversation.created', {'automation_id': 'a1'}, locked_at='T2', worker='other')
    assert run(ow._process_event('db4', db4, stale)) == 'lease_lost'
    assert db4.rows('workflow_runs') == []
    assert not any(n == 'complete_outbox_event' for n, _ in db4.rpcs)



def test_reused_worker_id_cannot_complete_or_fail_reclaimed_claim(dbs):
    db = dbs['db4']
    stale = claim(db, 'same-worker-event', 'conversation.created', {'automation_id': 'a1'},
                  locked_at='T1', worker='worker-A', token='unpredictable-old')
    fresh = claim(db, 'same-worker-event', 'conversation.created', {'automation_id': 'a1'},
                  locked_at='T2', worker='worker-A', token='unpredictable-new')
    assert run(ow._process_event('db4', db, stale)) == 'lease_lost'
    # Directly exercise both fenced RPC paths with obsolete claim material.
    common = {'p_event_id': stale['id'], 'p_worker_id': 'worker-A',
              'p_claim_token': stale['claim_token'], 'p_locked_at': stale['locked_at']}
    assert run(db.rpc('complete_outbox_event', common)) is False
    assert run(db.rpc('fail_outbox_event', {**common, 'p_error': 'old', 'p_retry_at': 'T3', 'p_dead_letter': True})) is False
    current = db.rows('outbox_events')[0]
    assert current['status'] == 'processing'
    assert current['claim_token'] == fresh['claim_token']


def test_concurrent_handlers_single_effect(dbs):
    db1, db2, db4 = dbs['db1'], dbs['db2'], dbs['db4']
    ev = claim(db1, 'u1', 'user.created', {'client_id': 'c9', 'email': 'x@y.z'})

    async def both():
        return await asyncio.gather(ow._process_event('db1', db1, dict(ev)), ow._process_event('db1', db1, dict(ev)))

    run(both())
    assert len(db4.rows('crm_clients')) == 1


def test_trial_not_recreated_after_status_change(dbs):
    db1, db2 = dbs['db1'], dbs['db2']
    run(ow._process_event('db1', db1, claim(db1, 'u1', 'user.created', {'client_id': 'c9'})))
    db2.rows('subscriptions')[0]['status'] = 'expired'
    db1.rows('processed_events').clear()
    run(ow._process_event('db1', db1, claim(db1, 'u1', 'user.created', {'client_id': 'c9'}, locked_at='T3')))
    assert len(db2.rows('subscriptions')) == 1


def test_failure_schedules_backoff_and_dead_letters(dbs):
    db2, db3 = dbs['db2'], dbs['db3']
    db3.fail_on = 'ai_configs'
    payload = {'automation_id': 'a1', 'client_id': 'c1'}
    assert run(ow._process_event('db2', db2, claim(db2, 'a', 'automation.created', payload, attempt=1))) == 'retry'
    name, p = db2.rpcs[-1]
    assert name == 'fail_outbox_event' and p['p_retry_at'] and p['p_dead_letter'] is False
    last = claim(db2, 'a', 'automation.created', payload, locked_at='T9', attempt=ow.MAX_ATTEMPTS)
    assert run(ow._process_event('db2', db2, last)) == 'dead_letter'
    assert db2.rpcs[-1][1]['p_dead_letter'] is True


def test_timeout_is_retried(dbs, monkeypatch):
    db4 = dbs['db4']

    async def slow(*a):
        await asyncio.sleep(1)

    monkeypatch.setattr(ow, 'handle_event', slow)
    monkeypatch.setattr(ow, 'HANDLER_BUDGET_SECONDS', 0.01)
    assert run(ow._process_event('db4', db4, claim(db4, 'e', 'x', {}))) == 'retry'


def test_backoff_bounds():
    assert ow.HANDLER_BUDGET_SECONDS < ow.LEASE_SECONDS
    assert 15 <= ow.retry_delay_seconds(1) <= 18
    assert ow.retry_delay_seconds(30) == ow.MAX_BACKOFF_SECONDS


def test_missing_claim_token_cannot_acknowledge(dbs):
    db = dbs['db4']
    ev = claim(db, 'missing-token', 'conversation.created', {'automation_id': 'a1'})
    ev['claim_token'] = None
    assert run(ow._process_event('db4', db, ev)) == 'lease_lost'
    row = db.rows('outbox_events')[0]
    assert row['status'] == 'processing'
    assert row['claim_token'] is not None
