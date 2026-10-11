"""Transactional-outbox consumer.

Delivery guarantee: AT-LEAST-ONCE. Events can be delivered more than once (worker
crash after side effects but before completion, lease expiry, network failure on
completion). Duplicate *business effects* are prevented by making every handler
idempotent against a database uniqueness key, and by fencing each claim:

  * Claim: claim_outbox_events (FOR UPDATE SKIP LOCKED) sets locked_by + locked_at + a
    cryptographically unpredictable per-claim claim_token. The token fences RPC updates.
  * Time budget: a handler must finish within HANDLER_BUDGET_SECONDS, which is
    shorter than the SQL reclaim window (LEASE_SECONDS), so a live worker never
    keeps working on an event another worker may have reclaimed.
  * Lease checks: before running effects and before acknowledging, the worker
    re-reads the row and aborts if the fencing token no longer matches.
  * Idempotent effects: inserts use ON CONFLICT DO NOTHING on natural/idempotency
    keys (workflow_runs.idempotency_key, crm_clients.id, ai_configs.automation_id,
    processed_events.event_id); updates are absolute (set-to-value); usage metering
    carries an idempotency key.
  * Retries: exponential backoff with jitter; dead-letter after MAX_ATTEMPTS.

This is NOT exactly-once: effects span four databases and cannot share one
transaction. See AUDIT-REPORT.md for the one remaining check-then-insert effect
(free-trial subscription) and the optional, unapplied migration that closes it.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import random
import socket
from datetime import datetime, timedelta, timezone

from .supabase import db1, db2, db3, db4

WORKER_ID = os.getenv('HOSTNAME') or socket.gethostname()
DBS = {'db1': db1, 'db2': db2, 'db3': db3, 'db4': db4}

LEASE_SECONDS = 300  # must match the reclaim interval in claim_outbox_events ('5 minutes')
HANDLER_BUDGET_SECONDS = 240  # strictly below LEASE_SECONDS, leaves margin for acknowledgement
MAX_ATTEMPTS = 8
BASE_BACKOFF_SECONDS = 15
MAX_BACKOFF_SECONDS = 3600


class LeaseLost(RuntimeError):
    """Another worker now owns the event; this worker must stop without acknowledging."""


def retry_delay_seconds(attempt: int, *, rng: random.Random | None = None) -> float:
    attempt = max(1, int(attempt))
    base = min(MAX_BACKOFF_SECONDS, BASE_BACKOFF_SECONDS * (2 ** (attempt - 1)))
    return min(MAX_BACKOFF_SECONDS, base + (rng or random).uniform(0, base * 0.2))


async def holds_lease(db, event: dict) -> bool:
    row = await db.table('outbox_events', select='id,status,locked_by,locked_at,claim_token',
                         filters=[('id', f"eq.{event['id']}")], single=True)
    if not row:
        return False
    token = event.get('claim_token')
    return bool(token) and (str(row.get('status')) == 'processing'
            and row.get('locked_by') == WORKER_ID
            and str(row.get('locked_at')) == str(event.get('locked_at'))
            and str(row.get('claim_token')) == str(token))


async def already_processed(db, event_id: str) -> bool:
    row = await db.table('processed_events', select='event_id', filters=[('event_id', f'eq.{event_id}')], single=True)
    return bool(row)


async def mark_processed(db, event: dict):
    payload = event.get('payload') or {}
    await db.table('processed_events', insert={
        'event_id': event['id'], 'event_type': str(event.get('event_type')),
        'payload_hash': hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest(),
    }, on_conflict='event_id', ignore_duplicates=True)


async def dispatch_workflow_triggers(event: dict):
    payload = event.get('payload') or {}
    trigger = str(event.get('event_type') or '')
    supported = {'conversation.created', 'message.created', 'lead.captured', 'appointment.created', 'handoff.created', 'support.created'}
    if trigger not in supported:
        return
    aid = str(payload.get('automation_id') or '')
    workflows = await db4.table('workflow_definitions', select='id,client_id,automation_id,status,trigger_type', filters=[('status', 'eq.active'), ('trigger_type', f'eq.{trigger}')], limit=250)
    for workflow in workflows or []:
        wf_aid = str(workflow.get('automation_id') or '')
        if wf_aid and aid and wf_aid != aid:
            continue
        # idempotency_key is UNIQUE: a redelivered event creates no second run.
        await db4.table('workflow_runs', insert={
            'workflow_id': workflow['id'],
            'client_id': workflow['client_id'],
            'automation_id': workflow.get('automation_id') or payload.get('automation_id'),
            'trigger_event_id': event['id'],
            'idempotency_key': f"trigger:{event['id']}:{workflow['id']}",
            'input_payload': payload,
            'status': 'queued',
        }, select='id', on_conflict='idempotency_key', ignore_duplicates=True)


async def handle_event(name: str, event: dict):
    et = str(event['event_type']); payload = event.get('payload') or {}
    if name == 'db4':
        await dispatch_workflow_triggers(event)
    if et == 'user.created' and name == 'db1':
        client_id = str(payload.get('client_id') or payload.get('organization_id') or '')
        if client_id:
            await db4.table('crm_clients', insert={'id': client_id, 'company_name': str(payload.get('company_name') or ''), 'primary_email': str(payload.get('email') or '')}, on_conflict='id', ignore_duplicates=True)
            # Check by plan, not status: an expired/converted trial must not be recreated on redelivery.
            trial = await db2.table('subscriptions', select='id', filters=[('client_id', f'eq.{client_id}'), ('plan_code', 'eq.free-trial')], limit=1)
            if not trial:
                now = datetime.now(timezone.utc)
                period_end = now.replace(hour=23, minute=59, second=59, microsecond=0)
                await db2.table('subscriptions', insert={
                    'client_id': client_id,
                    'product_type': 'platform',
                    'product_name': 'Free Trial',
                    'plan_code': 'free-trial',
                    'status': 'trialing',
                    'amount': 0,
                    'currency': 'USD',
                    'billing_interval': 'monthly',
                    'started_at': now.isoformat(),
                    'current_period_start': now.isoformat(),
                    'current_period_end': period_end.isoformat(),
                    'renewal_at': None,
                    'grace_period_start': None,
                    'grace_period_end': period_end.isoformat(),
                    'auto_renew': False,
                    'metadata': {'source': 'user.created', 'source_event_id': str(event['id'])},
                })
    elif et == 'automation.created' and name == 'db2':
        aid = str(payload.get('automation_id') or event['aggregate_id']); cid = str(payload.get('client_id') or '')
        if aid and cid:
            await db3.table('ai_configs', insert={'automation_id': aid, 'client_id': cid, 'status': 'active'}, select='automation_id', on_conflict='automation_id', ignore_duplicates=True)
            await db4.table('crm_clients', insert={'id': cid}, select='id', on_conflict='id', ignore_duplicates=True)
    elif et in {'subscription.suspended', 'subscription.expired'} and name == 'db2':
        for aid in payload.get('automation_ids') or []:
            await db3.table('ai_configs', update={'status': 'disabled'}, filters=[('automation_id', f'eq.{aid}')])
            await db4.table('conversations', update={'status': 'archived'}, filters=[('automation_id', f'eq.{aid}'), ('status', 'eq.active')])
    elif et == 'lead.captured' and name == 'db4':
        cid = str(payload.get('client_id') or ''); aid = str(payload.get('automation_id') or '')
        if cid and aid:
            await db2.rpc('increment_usage_meter', {'p_client_id': cid, 'p_automation_id': aid, 'p_billing_period': datetime.now(timezone.utc).strftime('%Y-%m'), 'p_metric_name': 'leads', 'p_quantity': 1, 'p_unit': 'lead', 'p_idempotency_key': f"lead:{event['id']}", 'p_metadata': payload})


async def _process_event(name: str, db, event: dict) -> str:
    """Returns 'completed' | 'skipped_duplicate' | 'lease_lost' | 'retry' | 'dead_letter'."""
    event_id = str(event['id'])
    try:
        if await already_processed(db, event_id):
            if not await holds_lease(db, event):
                return 'lease_lost'
            updated = await db.rpc('complete_outbox_event', {
                'p_event_id': event['id'], 'p_worker_id': WORKER_ID,
                'p_claim_token': event.get('claim_token'), 'p_locked_at': event.get('locked_at'),
            })
            return 'skipped_duplicate' if updated is True else 'lease_lost'
        if not await holds_lease(db, event):
            return 'lease_lost'
        await asyncio.wait_for(handle_event(name, event), timeout=HANDLER_BUDGET_SECONDS)
        if not await holds_lease(db, event):
            # Effects are idempotent; the new owner will see them as no-ops and acknowledge.
            raise LeaseLost(event_id)
        await mark_processed(db, event)
        updated = await db.rpc('complete_outbox_event', {
            'p_event_id': event['id'], 'p_worker_id': WORKER_ID,
            'p_claim_token': event.get('claim_token'), 'p_locked_at': event.get('locked_at'),
        })
        if updated is not True:
            return 'lease_lost'
        return 'completed'
    except LeaseLost:
        return 'lease_lost'
    except Exception as exc:
        attempt = int(event.get('attempt_count') or 1)
        dead = attempt >= MAX_ATTEMPTS
        retry_at = datetime.now(timezone.utc) + timedelta(seconds=retry_delay_seconds(attempt))
        try:
            updated = await db.rpc('fail_outbox_event', {
                'p_event_id': event['id'], 'p_worker_id': WORKER_ID,
                'p_error': f'{type(exc).__name__}: {exc}'[:4000],
                'p_retry_at': retry_at.isoformat(), 'p_dead_letter': dead,
                'p_claim_token': event.get('claim_token'), 'p_locked_at': event.get('locked_at'),
            })
            if updated is not True:
                return 'lease_lost'
        except Exception:
            # Lease expires and the event is reclaimed later; idempotent handlers make that safe.
            return 'lease_lost'
        return 'dead_letter' if dead else 'retry'


async def process_once(name: str) -> list[str]:
    db = DBS[name]
    rows = await db.rpc('claim_outbox_events', {'p_worker_id': WORKER_ID, 'p_batch_size': 25})
    return [await _process_event(name, db, event) for event in rows or []]


async def main():
    while True:
        # One failing database must not stop the other consumers.
        await asyncio.gather(*(process_once(name) for name in DBS), return_exceptions=True)
        await asyncio.sleep(1)


if __name__ == '__main__':
    asyncio.run(main())
