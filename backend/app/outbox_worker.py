from __future__ import annotations
import asyncio, os, socket, hashlib, json
from datetime import datetime, timezone
from .supabase import db1, db2, db3, db4

WORKER_ID = os.getenv('HOSTNAME') or socket.gethostname()
DBS = {'db1':db1,'db2':db2,'db3':db3,'db4':db4}

async def already_processed(db, event_id: str) -> bool:
    row = await db.table('processed_events', select='event_id', filters=[('event_id',f'eq.{event_id}')], single=True)
    return bool(row)

async def mark_processed(db, event: dict):
    payload = event.get('payload') or {}
    await db.table('processed_events', insert={'event_id':event['id'],'event_type':str(event.get('event_type')),'payload_hash':hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()})

async def dispatch_workflow_triggers(event: dict):
    payload = event.get('payload') or {}
    trigger = str(event.get('event_type') or '')
    supported = {'conversation.created','message.created','lead.captured','appointment.created','handoff.created','support.created'}
    if trigger not in supported:
        return
    aid = str(payload.get('automation_id') or '')
    workflows = await db4.table('workflow_definitions', select='id,client_id,automation_id,status,trigger_type', filters=[('status','eq.active'),('trigger_type',f'eq.{trigger}')], limit=250)
    for workflow in workflows or []:
        wf_aid = str(workflow.get('automation_id') or '')
        if wf_aid and aid and wf_aid != aid:
            continue
        key = f"trigger:{event['id']}:{workflow['id']}"
        await db4.table('workflow_runs', insert={
            'workflow_id':workflow['id'],
            'client_id':workflow['client_id'],
            'automation_id':workflow.get('automation_id') or payload.get('automation_id'),
            'trigger_event_id':event['id'],
            'idempotency_key':key,
            'input_payload':payload,
            'status':'queued',
        }, select='id')

async def handle_event(name: str, event: dict):
    et = str(event['event_type']); payload = event.get('payload') or {}
    if name == 'db4':
        await dispatch_workflow_triggers(event)
    if et == 'user.created' and name == 'db1':
        client_id = str(payload.get('client_id') or payload.get('organization_id') or '')
        if client_id:
            existing = await db4.table('crm_clients', select='id', filters=[('id',f'eq.{client_id}')], single=True)
            if not existing:
                await db4.table('crm_clients', insert={'id':client_id,'company_name':str(payload.get('company_name') or ''),'primary_email':str(payload.get('email') or '')})
            trial = await db2.table('subscriptions', select='id', filters=[('client_id',f'eq.{client_id}'),('status','eq.trialing')], limit=1)
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
                    'metadata': {'source': 'user.created'},
                })
    elif et == 'automation.created' and name == 'db2':
        aid = str(payload.get('automation_id') or event['aggregate_id']); cid = str(payload.get('client_id') or '')
        if aid and cid:
            existing_ai = await db3.table('ai_configs', select='automation_id', filters=[('automation_id', f'eq.{aid}')], single=True)
            if not existing_ai:
                await db3.table('ai_configs', insert={'automation_id':aid,'client_id':cid,'status':'active'}, select='automation_id')
            crm = await db4.table('crm_clients', select='id', filters=[('id',f'eq.{cid}')], single=True)
            if not crm:
                await db4.table('crm_clients', insert={'id':cid}, select='id')
    elif et in {'subscription.suspended','subscription.expired'} and name == 'db2':
        for aid in payload.get('automation_ids') or []:
            await db3.table('ai_configs', update={'status':'disabled'}, filters=[('automation_id',f'eq.{aid}')])
            await db4.table('conversations', update={'status':'archived'}, filters=[('automation_id',f'eq.{aid}'),('status','eq.active')])
    elif et == 'lead.captured' and name == 'db4':
        cid = str(payload.get('client_id') or ''); aid = str(payload.get('automation_id') or '')
        if cid and aid:
            await db2.rpc('increment_usage_meter', {'p_client_id':cid,'p_automation_id':aid,'p_billing_period':datetime.now(timezone.utc).strftime('%Y-%m'),'p_metric_name':'leads','p_quantity':1,'p_unit':'lead','p_idempotency_key':f"lead:{event['id']}",'p_metadata':payload})

async def process_once(name: str):
    db = DBS[name]
    rows = await db.rpc('claim_outbox_events', {'p_worker_id':WORKER_ID, 'p_batch_size':25})
    for event in rows or []:
        try:
            if await already_processed(db, str(event['id'])):
                await db.rpc('complete_outbox_event', {'p_event_id':event['id'],'p_worker_id':WORKER_ID})
                continue
            await handle_event(name, event)
            await mark_processed(db, event)
            await db.rpc('complete_outbox_event', {'p_event_id':event['id'],'p_worker_id':WORKER_ID})
        except Exception as exc:
            dead = int(event.get('attempt_count') or 0) >= 8
            await db.rpc('fail_outbox_event', {'p_event_id':event['id'],'p_worker_id':WORKER_ID,'p_error':str(exc),'p_retry_at':None,'p_dead_letter':dead})

async def main():
    while True:
        await asyncio.gather(*(process_once(name) for name in DBS))
        await asyncio.sleep(1)

if __name__ == '__main__':
    asyncio.run(main())
