"""Outbound HTTP guard for user-configured destinations (workflow webhook steps).

Defences:
  * Only HTTPS by default; HTTP is an explicit development/test override.
  * No embedded credentials, no empty hosts, optional port allowlist.
  * Every resolved address must be publicly routable. Loopback, private (RFC1918,
    ULA), link-local (incl. 169.254.169.254 / fd00:ec2::254 metadata), CGNAT,
    multicast, reserved, unspecified, documentation and benchmarking ranges are
    rejected for IPv4 and IPv6, including IPv4-mapped / NAT64 / 6to4 / Teredo
    embedded IPv4 addresses.
  * DNS rebinding: the hostname is resolved once, every answer is validated, and
    the TCP connection is made to that exact validated IP (Host header + TLS SNI
    keep the original hostname so certificate verification still applies).
  * Redirects are never followed automatically. When enabled, each Location is
    re-validated and re-pinned through the same checks.
  * Environment proxies are ignored (trust_env=False) so they cannot bypass pinning.
"""
from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
from dataclasses import dataclass
from typing import Any, Awaitable, Callable
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx


class BlockedDestination(RuntimeError):
    """Raised when an outbound URL is not permitted."""


_BLOCKED_NETWORKS = [ipaddress.ip_network(n) for n in (
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
    '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
    '255.255.255.255/32',
    '::/128', '::1/128', '::ffff:0:0/96', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64',
    '2001::/23', '2001:db8::/32', '2002::/16', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
)]

_BLOCKED_HOSTNAMES = {'localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal'}
_BLOCKED_SUFFIXES = ('.localhost', '.local', '.internal', '.localdomain', '.home.arpa')
_NAT64 = ipaddress.ip_network('64:ff9b::/96')
_V4COMPAT = ipaddress.ip_network('::/96')


def _embedded_ipv4(ip: ipaddress.IPv6Address) -> list[ipaddress.IPv4Address]:
    out: list[ipaddress.IPv4Address] = []
    if ip.ipv4_mapped:
        out.append(ip.ipv4_mapped)
    if ip.sixtofour:
        out.append(ip.sixtofour)
    if ip.teredo:
        out.extend(ip.teredo)
    if ip in _NAT64 or (ip in _V4COMPAT and int(ip) > 1):
        out.append(ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF))
    return out


def is_public_ip(value: str | ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    try:
        ip = ipaddress.ip_address(value) if isinstance(value, str) else value
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.scope_id:
            return False
        for v4 in _embedded_ipv4(ip):
            if not is_public_ip(v4):
                return False
    if any(ip in net for net in _BLOCKED_NETWORKS if net.version == ip.version):
        return False
    return bool(ip.is_global) and not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
        or ip.is_reserved or ip.is_unspecified
    )


def _allowed_schemes() -> set[str]:
    allow_http = os.getenv('WORKFLOW_WEBHOOK_ALLOW_HTTP', 'false').strip().lower() not in {'0', 'false', 'no'}
    return {'https', 'http'} if allow_http else {'https'}


def _allowed_ports() -> set[int] | None:
    raw = os.getenv('WORKFLOW_WEBHOOK_ALLOWED_PORTS', '').strip()
    if not raw:
        return None
    return {int(p) for p in raw.split(',') if p.strip()}


@dataclass(frozen=True)
class ValidatedTarget:
    url: str
    scheme: str
    host: str
    port: int
    ip: str


Resolver = Callable[[str, int], Awaitable[list[str]]]


async def _system_resolve(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [str(info[4][0]) for info in infos]


async def validate_url(url: str, resolver: Resolver | None = None) -> ValidatedTarget:
    if not isinstance(url, str) or not url or len(url) > 2048:
        raise BlockedDestination('webhook url is missing or too long')
    if any(ch in url for ch in ('\r', '\n', '\t', ' ', '\\')):
        raise BlockedDestination('webhook url contains forbidden characters')
    try:
        parts = urlsplit(url)
        port_value = parts.port
    except ValueError as exc:
        raise BlockedDestination('webhook url is malformed') from exc
    scheme = (parts.scheme or '').lower()
    if scheme not in _allowed_schemes():
        raise BlockedDestination(f'webhook url scheme "{scheme}" is not permitted')
    if parts.username is not None or parts.password is not None or '@' in parts.netloc:
        raise BlockedDestination('webhook url must not contain credentials')
    host = (parts.hostname or '').rstrip('.').lower()
    if not host:
        raise BlockedDestination('webhook url has no host')
    if host in _BLOCKED_HOSTNAMES or host.endswith(_BLOCKED_SUFFIXES):
        raise BlockedDestination('webhook host is not permitted')
    port = port_value or (443 if scheme == 'https' else 80)
    ports = _allowed_ports()
    if ports is not None and port not in ports:
        raise BlockedDestination(f'webhook port {port} is not permitted')

    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        addresses = [str(literal)]
    else:
        # Reject numeric shorthand some resolvers expand (e.g. "2130706433", "127.1", "0x7f.1").
        if host.replace('.', '').isdigit() or host.startswith('0x'):
            raise BlockedDestination('webhook host is not permitted')
        try:
            addresses = await (resolver or _system_resolve)(host, port)
        except Exception as exc:
            raise BlockedDestination('webhook host could not be resolved') from exc
    if not addresses:
        raise BlockedDestination('webhook host could not be resolved')
    # Every answer must be public; a mixed answer set is a rebinding signal.
    for addr in addresses:
        if not is_public_ip(addr.split('%', 1)[0]):
            raise BlockedDestination('webhook destination resolves to a non-public address')
    return ValidatedTarget(url=url, scheme=scheme, host=host, port=port, ip=addresses[0].split('%', 1)[0])


def _netloc(host: str, scheme: str, port: int) -> str:
    h = f'[{host}]' if ':' in host else host
    return h if port == (443 if scheme == 'https' else 80) else f'{h}:{port}'


def _pinned_url(target: ValidatedTarget) -> str:
    parts = urlsplit(target.url)
    return urlunsplit((target.scheme, _netloc(target.ip, target.scheme, target.port), parts.path or '/', parts.query, ''))


MAX_BODY_BYTES = 64 * 1024


async def safe_post_json(
    url: str,
    payload: Any,
    *,
    timeout: float = 20.0,
    max_redirects: int | None = None,
    resolver: Resolver | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """POST JSON to a validated, IP-pinned destination. Returns {'http_status','body'}."""
    if max_redirects is None:
        max_redirects = max(0, min(5, int(os.getenv('WORKFLOW_WEBHOOK_MAX_REDIRECTS', '0') or 0)))
    method, body_json, current = 'POST', payload, url
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False, transport=transport) as http:
        for hop in range(max_redirects + 1):
            target = await validate_url(current, resolver)
            request = http.build_request(
                method, _pinned_url(target),
                json=body_json if method == 'POST' else None,
                headers={'Host': _netloc(target.host, target.scheme, target.port), 'User-Agent': 'AntheticPlus-Workflow/1.0'},
                extensions={'sni_hostname': target.host} if target.scheme == 'https' else {},
            )
            response = await http.send(request, stream=True)
            try:
                if response.status_code in (301, 302, 303, 307, 308) and hop < max_redirects:
                    location = response.headers.get('location')
                    if not location:
                        raise BlockedDestination('redirect without Location header')
                    current = urljoin(current, location)
                    if response.status_code in (301, 302, 303):
                        method, body_json = 'GET', None
                    continue
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    chunks.append(chunk)
                    size += len(chunk)
                    if size >= MAX_BODY_BYTES:
                        break
                text = b''.join(chunks)[:MAX_BODY_BYTES].decode(response.encoding or 'utf-8', errors='replace')
                return {'http_status': response.status_code, 'body': text[:2000]}
            finally:
                await response.aclose()
    raise BlockedDestination('too many redirects')
