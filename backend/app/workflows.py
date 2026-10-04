from __future__ import annotations
import asyncio
import os
import uuid
from croniter import croniter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from .supabase import db2, db4
import redis.asyncio as redis
from .ai import completion

WORKER_ID = os.getenv('HOSTNAME') or f"worker-{uuid.uuid4()}"
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
_redis = redis.from_url(REDIS_URL, decode_responses=True)

async def _process_due_schedules(limit: int = 50):
    now = datetime.now(timezone.utc)
    schedules = await db4.table('workflow_schedules', select='id,workflow_id,cron_expression,timezone,is_active,next_run_at', filters=[('is_active','eq.true')], order='next_run_at.asc', limit=limit)
    for schedule in schedules or []:
        expr = str(schedule.get('cron_expression') or '').strip()
        if not expr:
            continue
        try:
            next_run = datetime.fromisoformat(str(schedule.get('next_run_at')).replace('Z','+00:00')) if schedule.get('next_run_at') else None
            if next_run and next_run > now:
                continue
        except Exception:
            next_run = None
        lock_key = f"antheticplus:workflow:schedule:{schedule['id']}"
        try:
            locked = await _redis.set(lock_key, WORKER_ID, nx=True, ex=30)
        except Exception:
            locked = True
        if not locked:
            continue
        try:
            timezone_name = str(schedule.get('timezone') or 'UTC')
            try:
                tz = ZoneInfo(timezone_name)
            except Exception:
                tz = timezone.utc
            base_utc = next_run or now
            base_local = base_utc.astimezone(tz)
            occurrence = croniter(expr, base_local).get_next(datetime)
            if occurrence.tzinfo is None:
                occurrence = occurrence.replace(tzinfo=tz)
            occurrence = occurrence.astimezone(timezone.utc)
            workflow = await db4.table('workflow_definitions', select='id,client_id,automation_id,status', filters=[('id',f"eq.{schedule['workflow_id']}")], single=True)
            if not workflow or str(workflow.get('status')) != 'active':
                continue
            idempotency = f"schedule:{schedule['id']}:{(next_run or now).isoformat()}"
            await db4.table('workflow_runs', insert={
                'workflow_id':workflow['id'],'client_id':workflow['client_id'],'automation_id':workflow.get('automation_id'),
                'idempotency_key':idempotency,'input_payload':{'trigger':'schedule','schedule_id':schedule['id']},'status':'queued'
            }, select='id')
            await db4.table('workflow_schedules', update={'next_run_at':occurrence.isoformat(),'last_run_at':(next_run or now).isoformat()}, filters=[('id',f"eq.{schedule['id']}")])
        except Exception:
            continue
        finally:
            try:
                await _redis.delete(lock_key)
            except Exception:
                pass


async def _ready_runs(limit: int = 25):
    queued = await db4.table('workflow_runs', select='*', filters=[('status','eq.queued')], order='queued_at.asc', limit=limit)
    waiting = await db4.table('workflow_runs', select='*', filters=[('status','eq.waiting')], order='resume_at.asc', limit=limit)
    now = datetime.now(timezone.utc)
    ready_waiting = []
    for row in waiting or []:
        value = row.get('resume_at')
        if value:
            try:
                if datetime.fromisoformat(str(value).replace('Z','+00:00')) <= now:
                    ready_waiting.append(row)
            except Exception:
                continue
    return list(queued or []) + ready_waiting

def _get_context_value(context: dict, key: str):
    value = context
    for part in [p for p in key.split('.') if p]:
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value

async def _step_state(run_id: str, step_id: str, **patch):
    existing = await db4.table('workflow_run_steps', select='id', filters=[('workflow_run_id',f'eq.{run_id}'),('step_id',f'eq.{step_id}')], single=True)
    if existing:
        await db4.table('workflow_run_steps', update=patch, filters=[('id',f"eq.{existing['id']}")])
    else:
        await db4.table('workflow_run_steps', insert={'workflow_run_id':run_id,'step_id':step_id,**patch})

async def _execute_step(run: dict, step: dict, context: dict) -> dict:
    stype = str(step.get('step_type') or '')
    cfg = step.get('config') or {}
    if stype == 'condition':
        key = str(cfg.get('key') or '')
        expected = cfg.get('equals')
        actual = _get_context_value(context, key)
        matched = actual == expected
        jump_key = 'onTrueStepOrder' if matched else 'onFalseStepOrder'
        jump = cfg.get(jump_key)
        return {'matched': matched, 'key': key, 'actual': actual, 'expected': expected, 'next_step_order': int(jump) if jump is not None else None}
    if stype == 'set':
        values = cfg.get('values') or {}
        if isinstance(values, dict): context.update(values)
        return {'set': values}
    if stype == 'create_lead':
        lead = await db4.table('leads', insert={
            'client_id': run['client_id'], 'automation_id': run.get('automation_id'),
            'conversation_id': cfg.get('conversation_id') or context.get('conversation_id'),
            'name': str(cfg.get('name') or context.get('name') or ''),
            'email': str(cfg.get('email') or context.get('email') or ''),
            'phone': str(cfg.get('phone') or context.get('phone') or ''),
            'intent': str(cfg.get('intent') or context.get('intent') or ''),
            'summary': str(cfg.get('summary') or context.get('summary') or ''),
            'source': str(cfg.get('source') or context.get('source') or 'workflow'),
            'lead_score': max(0, min(100, int(cfg.get('lead_score') or context.get('lead_score') or 0))),
        }, select='id')
        return {'lead_id': lead[0]['id']}
    if stype == 'assign_round_robin':
        result = await db4.rpc('assign_round_robin', {
            'p_team_id': cfg.get('team_id'),
            'p_subject_type': str(cfg.get('subject_type') or 'conversation'),
            'p_subject_id': str(cfg.get('subject_id') or run['id']),
            'p_strategy': cfg.get('strategy'),
            'p_manual_member_id': cfg.get('manual_member_id'),
        })
        return result[0] if isinstance(result, list) and result else {'assignment': result}
    if stype == 'send_message':
        conversation_id = str(cfg.get('conversation_id') or context.get('conversation_id') or '')
        content = str(cfg.get('content') or '')
        if not conversation_id or not content:
            raise RuntimeError('send_message requires conversation_id and content')
        result = await db4.table('messages', insert={'conversation_id':conversation_id,'role':'assistant','content':content,'metadata':{'workflow_run_id':run['id']}}, select='id')
        return {'message_id': result[0]['id']}
    if stype == 'ai_completion':
        text = str(cfg.get('prompt') or context.get('prompt') or '')
        if not text:
            raise RuntimeError('ai_completion requires prompt')
        result = await completion(str(run['client_id']), str(run.get('automation_id') or ''), [{'role':'user','content':text}], int(cfg.get('max_tokens') or 600), float(cfg.get('temperature') or 0.4))
        if not result:
            raise RuntimeError('No AI provider available')
        context['ai_reply'] = result['reply']
        return result
    if stype == 'wait':
        seconds = max(1, min(7 * 24 * 3600, int(cfg.get('seconds') or 60)))
        return {'wait_seconds': seconds}
    if stype == 'webhook':
        import httpx
        url = str(cfg.get('url') or '')
        if not url.startswith(('https://','http://')):
            raise RuntimeError('webhook url must use http(s)')
        async with httpx.AsyncClient(timeout=20) as http:
            response = await http.post(url, json={'workflow_run_id':run['id'],'payload':run.get('input_payload') or {},'context':context})
        return {'http_status': response.status_code, 'body': response.text[:2000]}
    if stype == 'increment_usage':
        result = await db2.rpc('increment_usage_meter', {
            'p_client_id': run['client_id'], 'p_automation_id': run.get('automation_id'),
            'p_billing_period': datetime.now(timezone.utc).strftime('%Y-%m'),
            'p_metric_name': str(cfg.get('metric_name') or 'workflow_runs'), 'p_quantity': cfg.get('quantity') or 1,
            'p_unit': str(cfg.get('unit') or 'count'), 'p_idempotency_key': f"workflow:{run['id']}:{step['id']}",
            'p_metadata': {'workflow_run_id':run['id']}
        })
        return {'metered': bool(result)}
    raise RuntimeError(f'Unsupported workflow step type: {stype}')

async def run_once():
    runs = await _ready_runs()
    for run in runs:
        run_id = str(run['id'])
        try:
            await db4.table('workflow_runs', update={'status':'running','started_at':datetime.now(timezone.utc).isoformat(),'updated_at':datetime.now(timezone.utc).isoformat(),'attempt_count':int(run.get('attempt_count') or 0)+1}, filters=[('id',f'eq.{run_id}')])
            steps = await db4.table('workflow_steps', select='*', filters=[('workflow_id',f"eq.{run['workflow_id']}")], order='step_order.asc')
            start_order = int(run.get('current_step_order') or 0)
            context = dict(run.get('output_payload') or {})
            context.update({'run_id':run_id,'input':run.get('input_payload') or {}})
            waiting = False
            ordered_steps = list(steps or [])
            index_by_order = {int(x.get('step_order') or 0): i for i, x in enumerate(ordered_steps)}
            cursor = next((i for i, x in enumerate(ordered_steps) if int(x.get('step_order') or 0) >= start_order), len(ordered_steps))
            while cursor < len(ordered_steps):
                step = ordered_steps[cursor]
                order = int(step.get('step_order') or 0)
                existing_step = await db4.table('workflow_run_steps', select='attempt_count', filters=[('workflow_run_id',f'eq.{run_id}'),('step_id',f"eq.{step['id']}")], single=True)
                step_attempt = int((existing_step or {}).get('attempt_count') or 0)
                retry_policy = step.get('retry_policy') or {}
                max_attempts = max(1, min(10, int(retry_policy.get('maxAttempts') or retry_policy.get('max_attempts') or 1)))
                timeout_seconds = max(1, min(86_400, int(step.get('timeout_seconds') or 300)))
                result = None
                step_error = None
                for attempt in range(step_attempt + 1, max_attempts + 1):
                    await _step_state(run_id, str(step['id']), status='running', attempt_count=attempt, input_payload=context, started_at=datetime.now(timezone.utc).isoformat(), error=None)
                    try:
                        result = await asyncio.wait_for(_execute_step(run, step, context), timeout=timeout_seconds)
                        break
                    except Exception as exc:
                        step_error = str(exc)[:2000]
                        if attempt < max_attempts:
                            backoff = max(1, min(300, int(retry_policy.get('backoffSeconds') or retry_policy.get('backoff_seconds') or 2) * (2 ** (attempt - 1))))
                            await asyncio.sleep(backoff)
                if step_error is not None and result is None:
                    await _step_state(run_id, str(step['id']), status='failed', error=step_error, completed_at=datetime.now(timezone.utc).isoformat())
                    await db4.table('workflow_runs', update={'status':'failed','last_error':step_error,'updated_at':datetime.now(timezone.utc).isoformat()}, filters=[('id',f'eq.{run_id}')])
                    break
                await _step_state(run_id, str(step['id']), status='completed', output_payload=result if isinstance(result, dict) else {'result':result}, completed_at=datetime.now(timezone.utc).isoformat(), error=None)
                await db4.table('workflow_runs', update={'current_step_order':order+1,'output_payload':context,'updated_at':datetime.now(timezone.utc).isoformat()}, filters=[('id',f'eq.{run_id}')])
                if str(step.get('step_type')) == 'wait':
                    resume_at = datetime.now(timezone.utc) + timedelta(seconds=int(result['wait_seconds']))
                    await db4.table('workflow_runs', update={'status':'waiting','resume_at':resume_at.isoformat(),'current_step_order':order+1,'output_payload':context,'updated_at':datetime.now(timezone.utc).isoformat()}, filters=[('id',f'eq.{run_id}')])
                    waiting = True
                    break
                jump = result.get('next_step_order') if isinstance(result, dict) else None
                if jump is not None and int(jump) in index_by_order:
                    cursor = index_by_order[int(jump)]
                else:
                    cursor += 1
            if not waiting:
                await db4.table('workflow_runs', update={'status':'completed','completed_at':datetime.now(timezone.utc).isoformat(),'updated_at':datetime.now(timezone.utc).isoformat(),'resume_at':None}, filters=[('id',f'eq.{run_id}')])
        except Exception as exc:
            await db4.table('workflow_runs', update={'status':'dead_letter' if int(run.get('attempt_count') or 0) >= 5 else 'queued','last_error':str(exc)[:2000],'updated_at':datetime.now(timezone.utc).isoformat()}, filters=[('id',f'eq.{run_id}')])

async def worker_loop():
    schedule_tick = 0
    while True:
        if schedule_tick % 15 == 0:
            await _process_due_schedules()
        await run_once()
        schedule_tick += 1
        await asyncio.sleep(1)

if __name__ == '__main__':
    asyncio.run(worker_loop())
