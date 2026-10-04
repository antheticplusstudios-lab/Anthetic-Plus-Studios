from __future__ import annotations
from typing import Any
import httpx
from .config import settings

class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip('/')
        self.key = key

    def _headers(self, bearer: str | None = None) -> dict[str, str]:
        token = bearer or self.key
        return {
            'apikey': self.key,
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }

    async def table(self, table: str, *, select: str = '*', filters: list[tuple[str, str]] | None = None,
                    order: str | None = None, limit: int | None = None, single: bool = False,
                    insert: dict[str, Any] | None = None, update: dict[str, Any] | None = None,
                    bearer: str | None = None) -> Any:
        params: list[tuple[str, str]] = [('select', select)]
        for k, v in filters or []:
            params.append((k, v))
        if order:
            params.append(('order', order))
        if limit is not None:
            params.append(('limit', str(limit)))
        headers = self._headers(bearer)
        async with httpx.AsyncClient(timeout=20) as c:
            if insert is not None:
                r = await c.post(f'{self.url}/rest/v1/{table}', params=params, headers={**headers, 'Prefer': 'return=representation'}, json=insert)
            elif update is not None:
                r = await c.patch(f'{self.url}/rest/v1/{table}', params=params, headers={**headers, 'Prefer': 'return=representation'}, json=update)
            else:
                r = await c.get(f'{self.url}/rest/v1/{table}', params=params, headers=headers)
        r.raise_for_status()
        data = r.json()
        if single:
            return data[0] if isinstance(data, list) and data else None
        return data

    async def rpc(self, name: str, payload: dict[str, Any], *, bearer: str | None = None) -> Any:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f'{self.url}/rest/v1/rpc/{name}', headers=self._headers(bearer), json=payload)
        r.raise_for_status()
        return r.json()

    async def auth_user(self, token: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f'{self.url}/auth/v1/user', headers=self._headers(token))
        r.raise_for_status()
        return r.json()

db1 = SupabaseRest(settings.db1_url, settings.db1_service_key)
db2 = SupabaseRest(settings.db2_url, settings.db2_service_key)
db3 = SupabaseRest(settings.db3_url, settings.db3_service_key)
db4 = SupabaseRest(settings.db4_url, settings.db4_service_key)
