from __future__ import annotations
from datetime import datetime, timezone
import hashlib
import hmac
import base64
import httpx
import time
import redis.asyncio as redis
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from .supabase import db1, db2, db3, db4
from .runtime import resolve_widget, check_origin, eligibility, canonical_widget_config
from .ai import completion, embedding
from .security import current_user, assert_automation_access, assert_conversation_access

app = FastAPI(title='AntheticPlus FastAPI', version='1.2.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=False, allow_methods=['GET','POST','OPTIONS'], allow_headers=['*'], expose_headers=['X-Request-ID'])
_rate_redis = redis.from_url('redis://localhost:6379/0', decode_responses=True)
try:
    from .config import settings as _settings
    _rate_redis = redis.from_url(_settings.redis_url, decode_responses=True)
except Exception:
    pass

async def _rate_limit(key: str, limit: int = 60, window: int = 60) -> bool:
    bucket = f"antheticplus:ratelimit:{hashlib.sha256(key.encode()).hexdigest()}"
    try:
        count = await _rate_redis.incr(bucket)
        if count == 1:
            await _rate_redis.expire(bucket, window)
        return int(count) <= limit
    except Exception as exc:
        # Rate limiting is a security control. Never silently fail open when Redis is down.
        raise HTTPException(503, 'Rate limiting is temporarily unavailable') from exc

async def _subscription_active(client_id: str) -> bool:
    row = await db2.table('subscriptions', select='status,expires_at,grace_period_end', filters=[('client_id',f'eq.{client_id}')], order='created_at.desc', limit=1, single=True)
    if not row:
        return False
    now = datetime.now(timezone.utc)
    grace = row.get('grace_period_end')
    in_grace = False
    if grace:
        try: in_grace = datetime.fromisoformat(str(grace).replace('Z','+00:00')) > now
        except Exception: pass
    if str(row.get('status')) in {'suspended','canceled','expired'} and not in_grace:
        return False
    if row.get('expires_at'):
        try:
            expired = datetime.fromisoformat(str(row['expires_at']).replace('Z','+00:00')) <= now
            if expired and not in_grace: return False
        except Exception: return False
    return True

class WidgetChat(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    token: str = Field(min_length=32, max_length=128)
    message: str = Field(min_length=1, max_length=2000)
    session_id: str = Field(min_length=16, max_length=64, alias="sessionId")

class KnowledgeDocument(BaseModel):
    automation_id: str
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=2_000_000)

def _decrypt_server_secret(payload: str) -> str:
    if not _settings.antheticplus_db3_master_key:
        raise HTTPException(503, 'Webhook signing is not configured')
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = base64.b64decode(_settings.antheticplus_db3_master_key)
    raw = base64.b64decode(payload)
    if len(key) != 32 or len(raw) < 28:
        raise HTTPException(500, 'Invalid webhook secret configuration')
    return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode()

async def _read_webhook(workflow_key: str):
    digest = hashlib.sha256(workflow_key.encode()).hexdigest()
    return await db4.table('workflow_webhooks', select='id,workflow_id,secret_ciphertext,is_active', filters=[('endpoint_key_hash',f'eq.{digest}'),('is_active','eq.true')], single=True)

@app.get('/health')
async def health():
    checks = {}
    for name, db, table in [
        ('db1', db1, 'organizations'),
        ('db2', db2, 'client_automations'),
        ('db3', db3, 'ai_configs'),
        ('db4', db4, 'conversations'),
    ]:
        try:
            await db.table(table, select='*', limit=1)
            checks[name] = True
        except Exception:
            checks[name] = False
    return {'ok': all(checks.values()), 'databases': checks}

@app.post('/v1/runtime/{automation_id}/eligibility')
async def runtime_eligibility(automation_id: str, user: dict = Depends(current_user)):
    await assert_automation_access(user, automation_id)
    return await eligibility(automation_id)

@app.post('/v1/health/automation/{automation_id}')
async def automation_health(automation_id: str, user: dict = Depends(current_user)):
    await assert_automation_access(user, automation_id)
    automation = await db2.table('client_automations', select='id,run_state,is_active,requires_reinstallation,last_seen_at,last_seen_origin,expires_at', filters=[('id',f'eq.{automation_id}')], single=True)
    health = await db2.table('automation_health', select='*', filters=[('automation_id',f'eq.{automation_id}')], single=True)
    recent = await db3.table('llm_requests', select='status,provider_key,latency_ms,created_at', filters=[('automation_id',f'eq.{automation_id}')], order='created_at.desc', limit=50)
    return {'automation': automation, 'health': health, 'recent_ai': recent or []}

@app.get('/v1/widget/config')
async def widget_config(token: str = Query(..., min_length=32, max_length=128), origin: str | None = Header(default=None), x_widget_token: str | None = Header(default=None)):
    flag = await db1.table('feature_flags', select='is_enabled', filters=[('key','eq.public_widget')], single=True)
    if flag and flag.get('is_enabled') is False:
        raise HTTPException(503, 'Assistant is offline')
    if x_widget_token and x_widget_token != token:
        raise HTTPException(403, 'Invalid widget token')
    inst = await resolve_widget(token)
    if not inst:
        raise HTTPException(404, 'Unknown installation')
    if not await check_origin(inst, origin):
        raise HTTPException(403, 'Domain not authorised')
    if not await _subscription_active(str(inst['client_id'])):
        raise HTTPException(403, 'Assistant is not active')
    state = await eligibility(str(inst['automation_id']))
    if state.get('state') != 'active':
        raise HTTPException(403, 'Assistant is not available')
    config = canonical_widget_config(inst.get('widget_config') or {})
    return {'product':inst.get('automation_type'), 'config':config}

@app.post('/v1/widget/resolve')
async def widget_resolve(token: str = Query(..., min_length=32, max_length=128), origin: str | None = Header(default=None)):
    flag = await db1.table('feature_flags', select='is_enabled', filters=[('key','eq.public_widget')], single=True)
    if flag and flag.get('is_enabled') is False:
        raise HTTPException(503, 'Assistant is offline')
    inst = await resolve_widget(token)
    if not inst:
        raise HTTPException(404, 'Unknown installation')
    if not await check_origin(inst, origin):
        raise HTTPException(403, 'Domain not authorised')
    if not await _subscription_active(str(inst['client_id'])):
        raise HTTPException(403, 'Assistant is not active')
    state = await eligibility(str(inst['automation_id']))
    if state.get('state') != 'active':
        raise HTTPException(403, 'Assistant is not available')
    return inst

@app.post('/v1/widget/chat')
async def widget_chat(payload: WidgetChat, origin: str | None = Header(default=None)):
    flag = await db1.table('feature_flags', select='is_enabled', filters=[('key','eq.public_widget')], single=True)
    if flag and flag.get('is_enabled') is False:
        raise HTTPException(503, 'Assistant is offline')
    inst = await resolve_widget(payload.token)
    if not inst:
        raise HTTPException(404, 'Unknown installation')
    if not await check_origin(inst, origin):
        raise HTTPException(403, 'Domain not authorised')
    state = await eligibility(str(inst['automation_id']))
    if state.get('state') != 'active':
        raise HTTPException(403, 'Assistant is not available')
    if not await _subscription_active(str(inst['client_id'])):
        raise HTTPException(403, 'Assistant is not active')
    if not await _rate_limit(f"widget:{inst['automation_id']}:{origin or ''}", limit=60, window=60):
        raise HTTPException(429, 'Too many messages, try again shortly')
    automation_id = str(inst['automation_id'])
    client_id = str(inst['client_id'])
    existing = await db4.table('conversations', select='id,status', filters=[('automation_id',f'eq.{automation_id}'),('visitor_session',f'eq.{payload.session_id}')], single=True)
    if existing:
        conversation_id = str(existing['id'])
    else:
        c = await db4.table('conversations', insert={'client_id':client_id,'automation_id':automation_id,'channel':'web_chat','visitor_session':payload.session_id,'origin':origin or '','status':'active'}, select='id')
        if not c:
            raise HTTPException(500, 'Could not start conversation')
        conversation_id = str(c[0]['id'])
        await db4.rpc('enqueue_outbox', {'p_event_type':'conversation.created','p_aggregate_type':'conversation','p_aggregate_id':conversation_id,'p_idempotency_key':f'conversation.created:{conversation_id}','p_payload':{'conversation_id':conversation_id,'client_id':client_id,'automation_id':automation_id,'origin':origin or ''}})
    message = await db4.table('messages', insert={'conversation_id':conversation_id,'role':'user','content':payload.message,'metadata':{'origin':origin or ''}}, select='id')
    if not message:
        raise HTTPException(500, 'Could not record message')
    user_message_id = str(message[0]['id'])
    await db4.rpc('enqueue_outbox', {'p_event_type':'message.created','p_aggregate_type':'message','p_aggregate_id':user_message_id,'p_idempotency_key':f"message.created:{user_message_id}",'p_payload':{'message_id':user_message_id,'conversation_id':conversation_id,'client_id':client_id,'automation_id':automation_id}})
    history = await db4.table('messages', select='role,content', filters=[('conversation_id',f'eq.{conversation_id}')], order='created_at.desc', limit=12)
    widget_cfg = canonical_widget_config(inst.get('widget_config') or {})
    facts = []
    top_k = max(1, min(20, int(widget_cfg.get('retrievalTopK', 8))))
    try:
        emb = await embedding(payload.message)
        if emb:
            matches = await db3.rpc('match_kb_chunks', {'p_automation_id':automation_id,'p_embedding':f"[{','.join(map(str,emb))}]",'p_match_count':top_k,'p_min_similarity':0.22})
            facts = matches or []
    except Exception:
        facts = []
    if not facts:
        facts = await db3.table('kb_documents', select='source_name,content,priority', filters=[('automation_id',f'eq.{automation_id}'),('status','eq.completed')], order='priority.desc', limit=top_k)
    fact_text = '\n'.join(f"- {x.get('source_name')}: {str(x.get('content') or '')[:1800]}" for x in facts)
    behavior = str(widget_cfg.get('behavior', '')).strip()
    behavior_text = f"\n\nOWNER BEHAVIOR INSTRUCTIONS:\n{behavior}" if behavior else ''
    system = f"You are the AI assistant for {inst.get('domain_url')}. Be concise, warm and accurate.{behavior_text}\n\nKNOWLEDGE:\n{fact_text}\n\nNever invent business facts; offer human handoff when unsure."
    routed = await completion(client_id, automation_id, [{'role':'system','content':system}] + list(reversed(history or [])))
    if not routed:
        raise HTTPException(502, 'The assistant is temporarily unavailable')
    assistant = await db4.table('messages', insert={'conversation_id':conversation_id,'role':'assistant','content':routed['reply'],'tokens_used':routed['tokens_in']+routed['tokens_out'],'provider_key':routed['provider'],'model':routed['model']}, select='id')
    if not assistant:
        raise HTTPException(500, 'Could not record assistant response')
    assistant_message_id = str(assistant[0]['id'])
    await db4.rpc('enqueue_outbox', {'p_event_type':'message.created','p_aggregate_type':'message','p_aggregate_id':assistant_message_id,'p_idempotency_key':f"message.created:{assistant_message_id}",'p_payload':{'message_id':assistant_message_id,'conversation_id':conversation_id,'client_id':client_id,'automation_id':automation_id}})
    now = datetime.now(timezone.utc).isoformat()
    await db4.table('conversations', update={'last_message_at':now}, filters=[('id',f'eq.{conversation_id}')])
    await db2.table('client_automations', update={'last_seen_at':now,'last_seen_origin':origin or ''}, filters=[('id',f'eq.{automation_id}')])
    total_tokens = int(routed['tokens_in'] or 0) + int(routed['tokens_out'] or 0)
    try:
        await db2.rpc('increment_usage_meter', {
            'p_client_id':client_id, 'p_automation_id':automation_id, 'p_billing_period':now[:7],
            'p_metric_name':'tokens', 'p_quantity':total_tokens, 'p_unit':'tokens',
            'p_idempotency_key':f'widget.tokens:{automation_id}:{conversation_id}:{user_message_id}',
            'p_metadata':{'provider':routed['provider'],'model':routed['model'],'conversation_id':conversation_id,'message_id':user_message_id},
        })
    except Exception:
        pass
    return {'reply':routed['reply'],'conversationId':conversation_id,'provider':routed['provider'],'model':routed['model']}

@app.post('/v1/workflows/webhook/{endpoint_key}')
async def workflow_webhook(endpoint_key: str, request: Request, x_antheticplus_timestamp: str | None = Header(default=None), x_antheticplus_signature: str | None = Header(default=None), x_antheticplus_event_id: str | None = Header(default=None)):
    if len(endpoint_key) != 48 or not endpoint_key.isalnum():
        raise HTTPException(404, 'Not found')
    webhook = await _read_webhook(endpoint_key)
    if not webhook:
        raise HTTPException(404, 'Not found')
    raw = await request.body()
    if len(raw) > 1_000_000:
        raise HTTPException(413, 'Webhook payload too large')
    timestamp = x_antheticplus_timestamp or ''
    try:
        ts = int(timestamp)
        if abs(int(time.time()) - ts) > 300:
            raise HTTPException(401, 'Webhook timestamp expired')
    except ValueError:
        raise HTTPException(401, 'Invalid webhook timestamp')
    secret = _decrypt_server_secret(str(webhook['secret_ciphertext']))
    expected = hmac.new(secret.encode(), f'{timestamp}.'.encode() + raw, hashlib.sha256).hexdigest()
    supplied = (x_antheticplus_signature or '').removeprefix('sha256=')
    if not supplied or not hmac.compare_digest(expected, supplied):
        raise HTTPException(401, 'Invalid webhook signature')
    workflow = await db4.table('workflow_definitions', select='id,client_id,automation_id,status', filters=[('id',f"eq.{webhook['workflow_id']}")], single=True)
    if not workflow or str(workflow.get('status')) != 'active':
        raise HTTPException(409, 'Workflow is not active')
    try:
        payload = await request.json() if raw else {}
    except Exception:
        raise HTTPException(400, 'Webhook payload must be JSON')
    event_id = (x_antheticplus_event_id or '').strip() or hashlib.sha256(raw).hexdigest()
    if len(event_id) > 160:
        raise HTTPException(400, 'Invalid event id')
    result = await db4.table('workflow_runs', insert={
        'workflow_id':workflow['id'],'client_id':workflow['client_id'],'automation_id':workflow.get('automation_id'),
        'idempotency_key':f"webhook:{webhook['id']}:{event_id}",'input_payload':payload if isinstance(payload, dict) else {'payload':payload},'status':'queued'
    }, select='id')
    return {'ok': True, 'runId': result[0]['id'] if result else None}

@app.post('/v1/knowledge/documents')
async def knowledge_document(payload: KnowledgeDocument, user: dict = Depends(current_user)):
    ctx = await assert_automation_access(user, payload.automation_id)
    kb = await db3.table('knowledge_bases', select='id,client_id,automation_id', filters=[('automation_id',f'eq.{payload.automation_id}')], single=True)
    if not kb:
        created = await db3.table('knowledge_bases', insert={'client_id':ctx['client_id'],'automation_id':payload.automation_id,'name':'Default Knowledge Base'}, select='id,client_id,automation_id')
        if not created:
            raise HTTPException(500, 'Could not create knowledge base')
        kb = created[0]
    doc = await db3.table('kb_documents', insert={'knowledge_base_id':kb['id'],'client_id':ctx['client_id'],'automation_id':payload.automation_id,'source_type':'manual_text','source_name':payload.title,'content':payload.content,'status':'processing'}, select='id')
    if not doc:
        raise HTTPException(500, 'Could not create knowledge document')
    document_id = str(doc[0]['id'])
    chunks = []
    start = 0
    while start < len(payload.content):
        end = min(len(payload.content), start + 1100)
        text = payload.content[start:end].strip()
        if text:
            chunks.append(text)
        if end >= len(payload.content): break
        start = max(start + 1, end - 140)
    vectors = [await embedding(x) for x in chunks]
    embedded = 0
    for idx, vector in enumerate(vectors):
        if not vector: continue
        await db3.rpc('insert_kb_chunk', {'p_document_id':document_id,'p_knowledge_base_id':kb['id'],'p_client_id':ctx['client_id'],'p_automation_id':payload.automation_id,'p_chunk_index':idx,'p_content':chunks[idx],'p_token_count':None,'p_embedding':f"[{','.join(map(str,vector))}]",'p_metadata':{'source_name':payload.title,'model':'text-embedding-3-small'}})
        embedded += 1
    await db3.table('kb_documents', update={'status':'completed' if embedded else 'error','error':None if embedded else 'No embedding provider available'}, filters=[('id',f'eq.{document_id}')])
    return {'document_id':document_id,'chunks':len(chunks),'embedded':embedded}

@app.websocket('/ws/chat/{conversation_id}')
async def websocket_chat(ws: WebSocket, conversation_id: str, token: str | None = Query(default=None)):
    if not token:
        await ws.close(code=1008, reason='token_required')
        return
    inst = await resolve_widget(token)
    if not inst:
        await ws.close(code=1008, reason='invalid_token')
        return
    conversation = await db4.table('conversations', select='automation_id,client_id,status', filters=[('id',f'eq.{conversation_id}')], single=True)
    if not conversation or str(conversation['automation_id']) != str(inst['automation_id']):
        await ws.close(code=1008, reason='conversation_not_found')
        return
    if str(conversation.get('status') or '') != 'active':
        await ws.close(code=1008, reason='conversation_inactive')
        return
    origin = ws.headers.get('origin')
    if not await check_origin(inst, origin):
        await ws.close(code=1008, reason='domain_not_authorised')
        return
    if (await eligibility(str(inst['automation_id']))).get('state') != 'active':
        await ws.close(code=1008, reason='assistant_unavailable')
        return
    # Parity with POST /v1/widget/chat: an inactive/expired subscription must not be able to consume AI usage over WS.
    if not await _subscription_active(str(conversation['client_id'])):
        await ws.close(code=1008, reason='subscription_inactive')
        return
    await ws.accept()
    try:
        while True:
            payload = await ws.receive_json()
            message = str(payload.get('message') or '').strip()
            if not message or len(message) > 2000:
                await ws.send_json({'error':'invalid_message'}); continue
            try:
                allowed = await _rate_limit(f"ws:{inst['automation_id']}:{conversation_id}", limit=20, window=60)
            except HTTPException as exc:
                await ws.send_json({'error':'service_unavailable','status':exc.status_code})
                await ws.close(code=1013, reason='rate_limiter_unavailable')
                return
            if not allowed:
                await ws.send_json({'error':'rate_limited'}); continue

            user_message = await db4.table('messages', insert={'conversation_id':conversation_id,'role':'user','content':message,'metadata':{'channel':'websocket'}}, select='id')
            if not user_message:
                await ws.send_json({'error':'message_persist_failed'}); continue
            user_message_id = str(user_message[0]['id'])
            await db4.rpc('enqueue_outbox', {'p_event_type':'message.created','p_aggregate_type':'message','p_aggregate_id':user_message_id,'p_idempotency_key':f"message.created:{user_message_id}",'p_payload':{'message_id':user_message_id,'conversation_id':conversation_id,'client_id':conversation['client_id'],'automation_id':conversation['automation_id']}})
            history = await db4.table('messages', select='role,content', filters=[('conversation_id',f'eq.{conversation_id}')], order='created_at.desc', limit=12)
            routed = await completion(str(conversation['client_id']), str(conversation['automation_id']), list(reversed(history or [])))
            if not routed:
                await ws.send_json({'error':'assistant_unavailable'}); continue
            assistant_message = await db4.table('messages', insert={'conversation_id':conversation_id,'role':'assistant','content':routed['reply'],'tokens_used':int(routed.get('tokens_in') or 0)+int(routed.get('tokens_out') or 0),'provider_key':routed.get('provider'),'model':routed.get('model')}, select='id')
            if not assistant_message:
                await ws.send_json({'error':'response_persist_failed'}); continue
            assistant_message_id = str(assistant_message[0]['id'])
            await db4.rpc('enqueue_outbox', {'p_event_type':'message.created','p_aggregate_type':'message','p_aggregate_id':assistant_message_id,'p_idempotency_key':f"message.created:{assistant_message_id}",'p_payload':{'message_id':assistant_message_id,'conversation_id':conversation_id,'client_id':conversation['client_id'],'automation_id':conversation['automation_id']}})
            now = datetime.now(timezone.utc).isoformat()
            await db4.table('conversations', update={'last_message_at':now}, filters=[('id',f'eq.{conversation_id}')])
            await ws.send_json({'reply':routed['reply'],'provider':routed.get('provider'),'model':routed.get('model')})
    except WebSocketDisconnect:
        return
