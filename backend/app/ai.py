from __future__ import annotations
import base64
import hashlib
import time
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import settings
from .supabase import db3

PROVIDERS = {
    'groq': ('https://api.groq.com/openai/v1/chat/completions', 'llama-3.1-8b-instant'),
    'openrouter': ('https://openrouter.ai/api/v1/chat/completions', 'openai/gpt-4o-mini'),
    'openai': ('https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'),
}


def decrypt(payload: str) -> str:
    if not settings.antheticplus_db3_master_key:
        raise RuntimeError('AI encryption key not configured')
    key = base64.b64decode(settings.antheticplus_db3_master_key)
    if len(key) != 32:
        raise RuntimeError('AI encryption key must decode to 32 bytes')
    raw = base64.b64decode(payload)
    if len(raw) < 28:
        raise RuntimeError('Invalid ciphertext')
    iv, ciphertext, tag = raw[:12], raw[12:-16], raw[-16:]
    return AESGCM(key).decrypt(iv, ciphertext + tag, None).decode()

async def _log(row: dict):
    try:
        await db3.table('llm_requests', insert=row)
    except Exception:
        pass

async def completion(client_id: str, automation_id: str, messages: list[dict], max_tokens: int = 600, temperature: float = 0.4) -> dict | None:
    import httpx
    keys = await db3.table(
        'llm_api_keys',
        select='id,provider_key,key_ciphertext,model,priority,cooldown_until,request_count,error_count',
        filters=[('is_active', 'eq.true')], order='priority.asc', limit=50,
    )
    now = time.time()
    for key_row in keys or []:
        provider = str(key_row.get('provider_key') or '')
        endpoint = PROVIDERS.get(provider)
        if not endpoint:
            continue
        cooldown = key_row.get('cooldown_until')
        if cooldown:
            try:
                if float(cooldown if isinstance(cooldown, (int, float)) else __import__('datetime').datetime.fromisoformat(str(cooldown).replace('Z', '+00:00')).timestamp()) > now:
                    continue
            except Exception:
                pass
        try:
            secret = decrypt(str(key_row['key_ciphertext']))
            url, default_model = endpoint
            model = str(key_row.get('model') or default_model)
            started = time.monotonic()
            async with httpx.AsyncClient(timeout=25) as http:
                response = await http.post(
                    url,
                    headers={'Authorization': f'Bearer {secret}', 'Content-Type': 'application/json'},
                    json={'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature},
                )
            latency = int((time.monotonic() - started) * 1000)
            payload = response.json() if response.content else {}
            usage = payload.get('usage') or {}
            reply = str((((payload.get('choices') or [{}])[0]).get('message') or {}).get('content') or '').strip()
            if response.is_success and reply:
                await db3.table('llm_api_keys', update={'request_count': int(key_row.get('request_count') or 0) + 1, 'last_used_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), 'last_error': None}, filters=[('id', f"eq.{key_row['id']}")])
                await _log({'client_id': client_id, 'automation_id': automation_id, 'provider_key': provider, 'model': model, 'key_id': key_row['id'], 'status': 'success', 'http_status': response.status_code, 'latency_ms': latency, 'tokens_in': int(usage.get('prompt_tokens') or 0), 'tokens_out': int(usage.get('completion_tokens') or 0)})
                return {'reply': reply, 'provider': provider, 'model': model, 'tokens_in': int(usage.get('prompt_tokens') or 0), 'tokens_out': int(usage.get('completion_tokens') or 0)}
            error_text = str(payload.get('error') or response.text)[:500]
            await db3.table('llm_api_keys', update={'error_count': int(key_row.get('error_count') or 0) + 1, 'last_error': error_text, 'cooldown_until': __import__('datetime').datetime.fromtimestamp(time.time() + (60 if response.status_code == 429 else 300), __import__('datetime').timezone.utc).isoformat()}, filters=[('id', f"eq.{key_row['id']}")])
            await _log({'client_id': client_id, 'automation_id': automation_id, 'provider_key': provider, 'model': model, 'key_id': key_row['id'], 'status': 'rate_limited' if response.status_code == 429 else 'error', 'http_status': response.status_code, 'latency_ms': latency, 'error': error_text})
        except Exception as exc:
            error = str(exc)[:500]
            await _log({'client_id': client_id, 'automation_id': automation_id, 'provider_key': provider, 'model': str(key_row.get('model') or endpoint[1]), 'key_id': key_row.get('id'), 'status': 'timeout' if 'timeout' in error.lower() else 'error', 'http_status': 0, 'latency_ms': int((time.monotonic() - started) * 1000) if 'started' in locals() else 0, 'error': error})
    return None

async def embedding(text: str) -> list[float] | None:
    import httpx
    keys = await db3.table('llm_api_keys', select='id,key_ciphertext,cooldown_until', filters=[('provider_key','eq.openai'),('is_active','eq.true')], order='priority.asc', limit=10)
    for row in keys or []:
        try:
            key = decrypt(str(row['key_ciphertext']))
            async with httpx.AsyncClient(timeout=20) as http:
                r = await http.post('https://api.openai.com/v1/embeddings', headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'}, json={'model':'text-embedding-3-small','input':text[:8000]})
            if r.is_success:
                emb = (r.json().get('data') or [{}])[0].get('embedding')
                if isinstance(emb, list): return [float(x) for x in emb]
        except Exception:
            continue
    return None


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()
