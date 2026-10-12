"""PAD-457 — the guardian/parental-consent flow is gone.

LevApp accepts adults only (PAD-445, auth.register rule 18): no minor can ever sign up, so the
guardian-consent machinery (routes, service, mails) is removed, and PAD-644 dropped its tables and
`users.guardian_consent_status`. Every `/api/auth/guardian-consent/*` route is gone (404). A
`guardianEmail` in a signup body is inert: the account is created as a normal adult.

    pytest padel_app/tests/test_pad457_no_guardian_flow.py -v
"""
from datetime import datetime

import pytest
from padel_app.tests.helpers import pin_clock

@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.mark.parametrize("method,path", [
    ("get", "/api/auth/guardian-consent/anything"),
    ("post", "/api/auth/guardian-consent/anything"),
    ("post", "/api/auth/guardian-consent/resend"),
    ("get", "/api/auth/guardian-consent/debug/last-link"),
    ("get", "/api/auth/guardian-consent/revoke/anything"),
    ("post", "/api/auth/guardian-consent/revoke/anything"),
    ("post", "/api/auth/guardian-consent/anything/decline"),
])
def test_every_guardian_consent_route_is_gone(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 404


def test_register_with_a_guardian_email_in_the_body_is_just_a_normal_adult_signup(client, app, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    res = client.post("/api/auth/register", json={
        "role": "student",
        "name": "Ana Silva",
        "username": "ana457",
        "email": "ana457@example.com",
        "password": "Segura123",
        "birthDate": "1990-01-01",
        "country": "PT",
        "guardianEmail": "mae@example.com",
    })
    assert res.status_code == 201, res.get_json()
    assert res.get_json()["accessToken"]

    from padel_app.models import User

    with app.app_context():
        assert User.query.filter_by(username="ana457").first() is not None
