import asyncio

import httpx
import pytest

from app.net_guard import BlockedDestination, is_public_ip, safe_post_json, validate_url


def run(c):
    return asyncio.run(c)


def resolver(mapping):
    async def r(host, port):
        if host not in mapping:
            raise OSError('nx')
        return mapping[host]
    return r


PUBLIC = {'hooks.example.com': ['93.184.216.34'], 'example.com': ['93.184.216.34']}


@pytest.mark.parametrize('url', [
    'http://127.0.0.1/', 'http://localhost/', 'http://10.0.0.5/', 'http://172.16.1.1/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/',
    'http://[fe80::1]/', 'http://[fd00:ec2::254]/', 'http://[::ffff:127.0.0.1]/', 'http://[64:ff9b::a00:1]/',
    'http://[2002:7f00:1::]/', 'http://224.0.0.1/', 'http://240.0.0.1/', 'http://2130706433/', 'http://0x7f.1/',
    'http://127.1/', 'ftp://example.com/', 'file:///etc/passwd', 'gopher://x/', 'http://user:pw@example.com/',
    'http://metadata.google.internal/', 'http://printer.local/', '', 'http://exa mple.com/',
])
def test_blocked(url):
    with pytest.raises(BlockedDestination):
        run(validate_url(url, resolver(PUBLIC)))


def test_dns_to_private_blocked():
    with pytest.raises(BlockedDestination):
        run(validate_url('https://evil.test/', resolver({'evil.test': ['10.1.2.3']})))


def test_mixed_answers_blocked():
    with pytest.raises(BlockedDestination):
        run(validate_url('https://evil.test/', resolver({'evil.test': ['93.184.216.34', '127.0.0.1']})))


def test_unresolvable_blocked():
    with pytest.raises(BlockedDestination):
        run(validate_url('https://nx.test/', resolver({})))


def test_permitted():
    t = run(validate_url('https://hooks.example.com:8443/x?y=1', resolver(PUBLIC)))
    assert (t.host, t.port, t.ip) == ('hooks.example.com', 8443, '93.184.216.34')
    assert is_public_ip('2606:4700:4700::1111')


def test_https_only_mode(monkeypatch):
    monkeypatch.setenv('WORKFLOW_WEBHOOK_ALLOW_HTTP', 'false')
    with pytest.raises(BlockedDestination):
        run(validate_url('http://93.184.216.34/'))


def test_port_allowlist(monkeypatch):
    monkeypatch.setenv('WORKFLOW_WEBHOOK_ALLOWED_PORTS', '443')
    with pytest.raises(BlockedDestination):
        run(validate_url('https://93.184.216.34:8080/'))


def test_post_pins_resolved_ip_and_keeps_host():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, text='ok')

    out = run(safe_post_json('https://hooks.example.com/in', {'a': 1}, resolver=resolver(PUBLIC), transport=httpx.MockTransport(handler)))
    assert out == {'http_status': 200, 'body': 'ok'}
    assert seen[0].url.host == '93.184.216.34'
    assert seen[0].headers['host'] == 'hooks.example.com'
    assert seen[0].extensions.get('sni_hostname') == 'hooks.example.com'


def test_rebinding_second_lookup_cannot_change_target():
    calls = {'n': 0}

    async def flip(host, port):
        calls['n'] += 1
        return ['93.184.216.34'] if calls['n'] == 1 else ['127.0.0.1']

    seen = []

    def handler(req):
        seen.append(req.url.host)
        return httpx.Response(204)

    run(safe_post_json('https://rebind.test/', {}, resolver=flip, transport=httpx.MockTransport(handler)))
    assert seen == ['93.184.216.34'] and calls['n'] == 1


def test_redirect_not_followed_by_default():
    def handler(req):
        return httpx.Response(302, headers={'location': 'http://127.0.0.1/'})

    out = run(safe_post_json('https://hooks.example.com/', {}, resolver=resolver(PUBLIC), transport=httpx.MockTransport(handler)))
    assert out['http_status'] == 302


def test_redirect_to_private_blocked_when_following():
    def handler(req):
        return httpx.Response(307, headers={'location': 'http://169.254.169.254/latest'})

    with pytest.raises(BlockedDestination):
        run(safe_post_json('https://hooks.example.com/', {}, max_redirects=3, resolver=resolver(PUBLIC), transport=httpx.MockTransport(handler)))


def test_redirect_to_public_followed_and_revalidated():
    hosts = []

    def handler(req):
        hosts.append(req.headers['host'])
        if len(hosts) == 1:
            return httpx.Response(308, headers={'location': 'https://b.example.com/next'})
        return httpx.Response(200, text='done')

    out = run(safe_post_json('https://a.example.com/', {}, max_redirects=2,
                             resolver=resolver({'a.example.com': ['93.184.216.34'], 'b.example.com': ['93.184.216.35']}),
                             transport=httpx.MockTransport(handler)))
    assert out['body'] == 'done' and hosts == ['a.example.com', 'b.example.com']


def test_http_is_blocked_by_default(monkeypatch):
    monkeypatch.delenv('WORKFLOW_WEBHOOK_ALLOW_HTTP', raising=False)
    with pytest.raises(BlockedDestination):
        run(validate_url('http://93.184.216.34/'))


def test_http_override_is_explicit(monkeypatch):
    monkeypatch.setenv('WORKFLOW_WEBHOOK_ALLOW_HTTP', 'true')
    target = run(validate_url('http://93.184.216.34/'))
    assert target.scheme == 'http'
