"""PAD-614 (delivery.api-host): the API on its own host.

- CORS: the web origins each environment lists may call /api cross-origin; nothing else may.
- nginx: api.levapp.app and api.staging.levapp.app proxy only /api (with the SSE and activation
  locations' log protections) to the two-port upstreams, behind a port-80 file that answers the
  certificate challenge.
"""
import re
from pathlib import Path

import pytest

from padel_app.config import DEFAULT_CORS_ORIGINS, cors_allowed_origins

ROOT = Path(__file__).resolve().parents[3]
NGINX = ROOT / "infra" / "nginx" / "sites-available"
BACKEND = ROOT / "backend"


def test_the_allowed_origins_are_the_defaults_plus_the_environment():
    env = {"CORS_ALLOWED_ORIGINS": " https://levapp.app/, https://www.levapp.app,,https://levapp.app, * "}
    assert cors_allowed_origins(env) == [*DEFAULT_CORS_ORIGINS, "https://levapp.app", "https://www.levapp.app"]
    assert cors_allowed_origins({}) == list(DEFAULT_CORS_ORIGINS)
    assert "*" not in cors_allowed_origins(env), "never a wildcard"


@pytest.mark.parametrize(
    "envfile,origins",
    [(".env.prod", "https://levapp.app,https://www.levapp.app"), (".env.staging", "https://staging.levapp.app")],
)
def test_each_environment_lists_its_web_origins(envfile, origins):
    text = (BACKEND / envfile).read_text()
    assert f"CORS_ALLOWED_ORIGINS={origins}\n" in text


@pytest.fixture
def cors_app(monkeypatch):
    from padel_app import create_app
    from padel_app.tests.conftest import BASE_TEST_CONFIG

    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://levapp.app")
    return create_app({**BASE_TEST_CONFIG, "SQLALCHEMY_DATABASE_URI": "sqlite://"})


def _preflight(client, origin):
    return client.options(
        "/api/app/healthz",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization, X-LevApp-Capabilities",
        },
    )


def test_a_listed_web_origin_may_call_the_api_cross_origin(cors_app):
    response = _preflight(cors_app.test_client(), "https://levapp.app")
    assert response.headers.get("Access-Control-Allow-Origin") == "https://levapp.app"
    allowed = response.headers.get("Access-Control-Allow-Headers", "").lower()
    assert "authorization" in allowed and "x-levapp-capabilities" in allowed
    assert response.headers.get("Access-Control-Allow-Credentials") is None, "Bearer tokens, no cookies"
    assert response.headers.get("Access-Control-Max-Age") == "600"


def test_a_foreign_origin_gets_no_cors_grant(cors_app):
    response = _preflight(cors_app.test_client(), "https://evil.example")
    assert response.headers.get("Access-Control-Allow-Origin") is None


@pytest.mark.parametrize(
    "name,host,upstream,events_upstream",
    [("levapp-api", "api.levapp.app", "levapp_api", "levapp_api"),
     # PAD-697: staging's stream goes to the events process (prod after PAD-704).
     ("levapp-api-staging", "api.staging.levapp.app", "levapp_api_staging", "levapp_events_staging")],
)
def test_the_api_host_serves_only_the_api_with_the_log_protections(name, host, upstream, events_upstream):
    https = (NGINX / name).read_text()
    assert f"server_name {host};" in https
    assert "access_log /var/log/nginx/access.log redacted;" in https  # B-182
    assert "listen 443 ssl http2;" in https and "listen 80" not in https
    assert f"/etc/letsencrypt/live/{host}/fullchain.pem" in https
    locations = dict(re.findall(r"location ([^{]+?) \{(.*?)\n    \}", https, re.S))
    assert set(locations) == {"/api/app/events", "/api/app/register/", "/api/", "/"}
    for path in ("/api/app/events", "/api/app/register/", "/api/"):
        want = events_upstream if path == "/api/app/events" else upstream
        assert f"proxy_pass http://{want};" in locations[path], path
        assert "proxy_set_header X-Real-IP $remote_addr;" in locations[path], path  # PAD-554
    for path in ("/api/app/events", "/api/app/register/"):
        assert "error_log /var/log/nginx/error.log crit;" in locations[path], path  # B-182 / B-183
    sse = locations["/api/app/events"]
    assert "proxy_buffering off;" in sse and "proxy_read_timeout 86400s;" in sse
    assert "return 404;" in locations["/"], "nothing but the API on this host"

    http = (NGINX / f"{name}-http").read_text()
    assert "listen 80;" in http and f"server_name {host};" in http
    assert re.search(r"listen[^;]*default_server", http) is None, "levapp.app stays the port-80 default"
    acme = re.search(r"location \^~ /\.well-known/acme-challenge/ \{(.*?)\}", http, re.S)
    assert acme and "root /var/www/letsencrypt;" in acme.group(1)


def test_the_web_build_takes_the_api_base_url_from_a_repository_variable():
    dockerfile = (ROOT / "frontend" / "Dockerfile").read_text()
    assert 'ARG VITE_API_BASE_URL=""' in dockerfile and "ENV VITE_API_BASE_URL=$VITE_API_BASE_URL" in dockerfile
    workflows = ROOT / ".github" / "workflows"
    assert "VITE_API_BASE_URL=${{ vars.API_BASE_URL }}" in (workflows / "deploy-prod.yaml").read_text()
    assert "VITE_API_BASE_URL=${{ vars.API_BASE_URL_STAGING }}" in (workflows / "deploy-staging.yaml").read_text()
