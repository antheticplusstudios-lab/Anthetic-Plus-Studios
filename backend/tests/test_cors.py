import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.cors import CorsPolicy, ExplicitOriginCORSMiddleware, normalize_origin


def make(env='production', allowed='https://app.example.com,https://customer-site.com', dev='http://localhost:8080', creds=False):
    app = FastAPI()

    @app.get('/v1/thing')
    def thing():
        return {'ok': True}

    @app.post('/v1/widget/chat')
    def chat():
        return {'ok': True}

    app.add_middleware(ExplicitOriginCORSMiddleware, policy=CorsPolicy.from_settings(environment=env, allowed=allowed, dev=dev, allow_credentials=creds))
    return TestClient(app)


def pre(c, path, origin, method='POST', headers='content-type'):
    return c.options(path, headers={'Origin': origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers})


def test_allowed_origin_gets_headers():
    r = make().get('/v1/thing', headers={'Origin': 'https://app.example.com'})
    assert r.headers['access-control-allow-origin'] == 'https://app.example.com'
    assert 'access-control-allow-credentials' not in r.headers


def test_unknown_origin_gets_no_headers_and_never_wildcard():
    r = make().get('/v1/thing', headers={'Origin': 'https://evil.com'})
    assert 'access-control-allow-origin' not in r.headers


def test_preflight_allowed_and_rejected():
    c = make()
    ok = pre(c, '/v1/thing', 'https://app.example.com', headers='authorization, content-type')
    assert ok.status_code == 200 and 'POST' in ok.headers['access-control-allow-methods']
    assert pre(c, '/v1/thing', 'https://evil.com').status_code == 403
    assert pre(c, '/v1/thing', 'https://app.example.com', method='DELETE').status_code == 400
    assert pre(c, '/v1/thing', 'https://app.example.com', headers='x-evil').status_code == 400


def test_dev_origins_only_outside_production():
    assert 'access-control-allow-origin' not in make().get('/v1/thing', headers={'Origin': 'http://localhost:8080'}).headers
    r = make(env='development').get('/v1/thing', headers={'Origin': 'http://localhost:8080'})
    assert r.headers['access-control-allow-origin'] == 'http://localhost:8080'


def test_credentials_only_for_allowlisted():
    c = make(creds=True)
    assert c.get('/v1/thing', headers={'Origin': 'https://app.example.com'}).headers['access-control-allow-credentials'] == 'true'
    w = c.post('/v1/widget/chat', headers={'Origin': 'https://customer-site.com'})
    assert w.headers['access-control-allow-origin'] == 'https://customer-site.com'
    assert 'access-control-allow-credentials' not in w.headers
    denied = c.post('/v1/widget/chat', headers={'Origin': 'https://attacker.example'})
    assert 'access-control-allow-origin' not in denied.headers


def test_widget_preflight_requires_explicit_origin_allowlist():
    c = make()
    r = pre(c, '/v1/widget/chat', 'https://customer-site.com', headers='content-type, x-widget-token')
    assert r.status_code == 200 and r.headers['access-control-allow-origin'] == 'https://customer-site.com'
    denied = pre(c, '/v1/widget/chat', 'https://attacker.example', headers='content-type, x-widget-token')
    assert denied.status_code == 403


def test_empty_allowlist_fails_closed():
    assert pre(make(allowed=''), '/v1/thing', 'https://app.example.com').status_code == 403


@pytest.mark.parametrize('bad', ['*', 'https://*.example.com', 'https://a.com/path', 'ftp://a.com', 'a.com'])
def test_invalid_config_rejected(bad):
    with pytest.raises(ValueError):
        normalize_origin(bad)
