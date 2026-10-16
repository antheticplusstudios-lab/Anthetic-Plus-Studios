from __future__ import annotations
import base64
import hashlib
import random
import time
from datetime import datetime, timezone
from typing import Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import settings
from .supabase import db2, db3

PROVIDERS = {
    'groq': ('https://api.groq.com/openai/v1/chat/completions', 'openai/gpt-oss-120b'),
    'openrouter': ('https://openrouter.ai/api/v1/chat/completions', 'openai/gpt-4o-mini'),
    'openai': ('https://api.openai.com/v1/chat/completions', 'gpt-4o-mini'),
    'anthropic': ('https://api.anthropic.com/v1/messages', 'claude-3-5-haiku-latest'),
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


def _pool_order(keys: list[dict[str, Any]], pool: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not pool or not isinstance(pool.get('members'), list):
        return sorted(keys, key=lambda x: int(x.get('priority') or 100))
    strategy = str(pool.get('strategy') or '')
    members = {
        str(m.get('provider')): m
        for m in pool['members']
        if isinstance(m, dict) and m.get('provider') and m.get('enabled', True) is not False
    }
    allowed = [k for k in keys if str(k.get('provider_key')) in members]
    if strategy == 'priority':
        return sorted(
            allowed,
            key=lambda k: (int(members[str(k['provider_key'])].get('priority') or 100), int(k.get('priority') or 100)),
        )
    if strategy == 'balanced':
        return sorted(allowed, key=lambda k: (int(k.get('request_count') or 0), int(k.get('priority') or 100)))
    if strategy == 'weighted':
        remaining = list(allowed)
        ordered: list[dict[str, Any]] = []
        while remaining:
            weights = [max(0.0, float(members[str(k['provider_key'])].get('weight') or 1)) for k in remaining]
            total = sum(weights) or 1.0
            pick = random.random() * total
            idx = 0
            for i, weight in enumerate(weights):
                pick -= weight
                if pick < 0:
                    idx = i
                    break
            ordered.append(remaining.pop(idx))
        return ordered
    return sorted(keys, key=lambda x: int(x.get('priority') or 100))


async def _provider_pool(automation_id: str | None) -> dict[str, Any] | None:
    if not automation_id:
        return None
    try:
        row = await db2.table(
            'client_automations',
            select='config',
            filters=[('id', f'eq.{automation_id}')],
            single=True,
        )
        config = row.get('config') if isinstance(row, dict) else None
        pool = config.get('provider_pool') if isinstance(config, dict) else None
        return pool if isinstance(pool, dict) else None
    except Exception:
        return None


async def _request_provider(http, provider: str, secret: str, model: str, messages: list[dict], max_tokens: int, temperature: float):
    if provider == 'anthropic':
        system = '\n'.join(str(m.get('content') or '') for m in messages if m.get('role') == 'system')
        body_messages = [m for m in messages if m.get('role') != 'system']
        return await http.post(
            PROVIDERS[provider][0],
            headers={'x-api-key': secret, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'},
            json={'model': model, 'system': system, 'messages': body_messages, 'max_tokens': max_tokens, 'temperature': temperature},
        )
    return await http.post(
        PROVIDERS[provider][0],
        headers={'Authorization': f'Bearer {secret}', 'Content-Type': 'application/json'},
        json={'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': temperature},
    )


def _response_payload(provider: str, payload: dict[str, Any]) -> tuple[str, int, int]:
    if provider == 'anthropic':
        return (
            str(((payload.get('content') or [{}])[0]).get('text') or '').strip(),
            int((payload.get('usage') or {}).get('input_tokens') or 0),
            int((payload.get('usage') or {}).get('output_tokens') or 0),
        )
    return (
        str((((payload.get('choices') or [{}])[0]).get('message') or {}).get('content') or '').strip(),
        int((payload.get('usage') or {}).get('prompt_tokens') or 0),
        int((payload.get('usage') or {}).get('completion_tokens') or 0),
    )


async def completion(client_id: str, automation_id: str, messages: list[dict], max_tokens: int = 600, temperature: float = 0.4) -> dict | None:
    import httpx
    keys = await db3.table(
        'llm_api_keys',
        select='id,provider_key,key_ciphertext,model,priority,cooldown_until,request_count,error_count',
        filters=[('is_active', 'eq.true')], order='priority.asc', limit=50,
    )
    pool = await _provider_pool(automation_id)
    ordered_keys = _pool_order(list(keys or []), pool)
    now = time.time()
    for key_row in ordered_keys:
        provider = str(key_row.get('provider_key') or '')
        endpoint = PROVIDERS.get(provider)
        if not endpoint:
            continue
        cooldown = key_row.get('cooldown_until')
        if cooldown:
            try:
                if float(cooldown if isinstance(cooldown, (int, float)) else datetime.fromisoformat(str(cooldown).replace('Z', '+00:00')).timestamp()) > now:
                    continue
            except Exception:
                pass
        try:
            secret = decrypt(str(key_row['key_ciphertext']))
            member = next((m for m in (pool or {}).get('members', []) if isinstance(m, dict) and m.get('provider') == provider), {})
            model = str(member.get('model') or key_row.get('model') or endpoint[1])
            started = time.monotonic()
            async with httpx.AsyncClient(timeout=25) as http:
                response = await _request_provider(http, provider, secret, model, messages, max_tokens, temperature)
            latency = int((time.monotonic() - started) * 1000)
            payload = response.json() if response.content else {}
            reply, tokens_in, tokens_out = _response_payload(provider, payload)
            if response.is_success and reply:
                await db3.table('llm_api_keys', update={'request_count': int(key_row.get('request_count') or 0) + 1, 'last_used_at': datetime.now(timezone.utc).isoformat(), 'last_error': None}, filters=[('id', f"eq.{key_row['id']}" )])
                await _log({'client_id': client_id, 'automation_id': automation_id, 'provider_key': provider, 'model': model, 'key_id': key_row['id'], 'status': 'success', 'http_status': response.status_code, 'latency_ms': latency, 'tokens_in': tokens_in, 'tokens_out': tokens_out})
                return {'reply': reply, 'provider': provider, 'model': model, 'tokens_in': tokens_in, 'tokens_out': tokens_out}
            error_text = str(payload.get('error') or response.text)[:500]
            await db3.table('llm_api_keys', update={'error_count': int(key_row.get('error_count') or 0) + 1, 'last_error': error_text, 'cooldown_until': datetime.fromtimestamp(time.time() + (60 if response.status_code == 429 else 300), timezone.utc).isoformat()}, filters=[('id', f"eq.{key_row['id']}" )])
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
