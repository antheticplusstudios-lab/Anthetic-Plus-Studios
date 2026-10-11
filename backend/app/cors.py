"""Explicit-origin CORS for the FastAPI backend.

Two policies:
  * Application API (everything except the public widget surface): only origins
    listed in CORS_ALLOWED_ORIGINS (plus CORS_DEV_ORIGINS when ENVIRONMENT is not
    production) are allowed. Empty list = no cross-origin browser access (fail closed).
  * Widget routes use the same explicit origin allowlist. Add customer origins to
    CORS_ALLOWED_ORIGINS; never reflect an arbitrary origin before route authorization.
Credentials are only ever allowed for explicitly allowlisted origins, never '*'.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

ALLOWED_METHODS = ('GET', 'POST', 'OPTIONS')
ALLOWED_HEADERS = ('authorization', 'content-type', 'x-request-id', 'x-widget-token')
EXPOSE_HEADERS = ('X-Request-ID',)
WIDGET_PREFIX = '/v1/widget/'
MAX_AGE = '600'


def normalize_origin(value: str) -> str:
    """Validate and canonicalise an origin. Raises ValueError unless it is scheme://host[:port]."""
    raw = (value or '').strip()
    if not raw or '*' in raw:
        raise ValueError(f'wildcard or empty origin is not allowed: {value!r}')
    parts = urlsplit(raw)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise ValueError(f'origin must be http(s)://host[:port]: {value!r}')
    if parts.path not in ('', '/') or parts.query or parts.fragment or parts.username or parts.password:
        raise ValueError(f'origin must not contain path, query, fragment or credentials: {value!r}')
    port = parts.port
    default = 443 if parts.scheme == 'https' else 80
    host = parts.hostname.lower()
    if ':' in host:
        host = f'[{host}]'
    return f'{parts.scheme}://{host}' + (f':{port}' if port and port != default else '')


def parse_origins(raw: str | None) -> list[str]:
    return [normalize_origin(item) for item in (raw or '').split(',') if item.strip()]


@dataclass
class CorsPolicy:
    allowed_origins: frozenset[str] = field(default_factory=frozenset)
    allow_credentials: bool = False

    @classmethod
    def from_settings(cls, *, environment: str, allowed: str | None, dev: str | None, allow_credentials: bool) -> 'CorsPolicy':
        origins = parse_origins(allowed)
        if (environment or 'production').strip().lower() not in ('production', 'prod'):
            origins += parse_origins(dev)
        return cls(frozenset(origins), bool(allow_credentials))

    def is_allowed(self, origin: str | None) -> bool:
        if not origin:
            return False
        try:
            return normalize_origin(origin) in self.allowed_origins
        except ValueError:
            return False


class ExplicitOriginCORSMiddleware:
    def __init__(self, app: ASGIApp, policy: CorsPolicy):
        self.app = app
        self.policy = policy

    def _headers_for(self, origin: str, path: str) -> dict[str, str] | None:
        if self.policy.is_allowed(origin):
            h = {'Access-Control-Allow-Origin': origin, 'Vary': 'Origin'}
            if self.policy.allow_credentials and not path.startswith(WIDGET_PREFIX):
                h['Access-Control-Allow-Credentials'] = 'true'
            return h
        # Do not reflect a caller-controlled widget origin here. The origin must
        # be explicitly configured, even when a route performs installation auth.
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        origin = headers.get('origin')
        if not origin:
            await self.app(scope, receive, send)
            return
        cors = self._headers_for(origin, scope.get('path', ''))
        if scope.get('method', 'GET').upper() == 'OPTIONS' and headers.get('access-control-request-method'):
            await self._preflight(cors, headers, scope, receive, send)
            return
        if cors is None:
            # Not allowed: process normally but emit no CORS headers; the browser blocks the read.
            await self.app(scope, receive, send)
            return
        cors = {**cors, 'Access-Control-Expose-Headers': ', '.join(EXPOSE_HEADERS)}

        async def send_with_cors(message: Message) -> None:
            if message['type'] == 'http.response.start':
                raw = [(k, v) for k, v in message.get('headers', []) if not k.lower().startswith(b'access-control-')]
                raw += [(k.lower().encode(), v.encode()) for k, v in cors.items()]
                message['headers'] = raw
            await send(message)

        await self.app(scope, receive, send_with_cors)

    async def _preflight(self, cors, headers: Headers, scope, receive, send) -> None:
        method = (headers.get('access-control-request-method') or '').upper()
        requested = [h.strip().lower() for h in (headers.get('access-control-request-headers') or '').split(',') if h.strip()]
        if cors is None:
            resp = PlainTextResponse('Disallowed CORS origin', status_code=403, headers={'Vary': 'Origin'})
        elif method not in ALLOWED_METHODS:
            resp = PlainTextResponse('Disallowed CORS method', status_code=400, headers={'Vary': 'Origin'})
        elif any(h not in ALLOWED_HEADERS for h in requested):
            resp = PlainTextResponse('Disallowed CORS headers', status_code=400, headers={'Vary': 'Origin'})
        else:
            resp = PlainTextResponse('OK', status_code=200, headers={
                **cors,
                'Access-Control-Allow-Methods': ', '.join(ALLOWED_METHODS),
                'Access-Control-Allow-Headers': ', '.join(ALLOWED_HEADERS),
                'Access-Control-Max-Age': MAX_AGE,
            })
        await resp(scope, receive, send)
