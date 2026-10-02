"""auth.register rule 19 (PAD-485): a self-registration from a client declaring `terms-acceptance` must
accept the Terms (`termsAccepted: true`), and the acceptance is stored with its moment and the Terms
version. A client that does not declare it (App Store 1.2.0 (27), 1.2.1 (28)) registers exactly as
before, with nothing recorded.
"""
import datetime as dt
import pathlib
import re

import pytest
from flask_jwt_extended import create_access_token  # noqa: F401  (the app's JWT setup)

from padel_app.tests.helpers import pin_clock

NOW = dt.datetime(2026, 10, 2, 17, 0, 0)
DECLARING = {"X-LevApp-Capabilities": "open-spots, evaluations, class-type-defaults, coach-invite-email, terms-acceptance"}
OLD_BUILD = {"X-LevApp-Capabilities": "open-spots, evaluations, class-type-defaults"}  # what 27/28 send


@pytest.fixture(autouse=True)
def _setup(app, monkeypatch):
    import padel_app.services.registration_service  # noqa: F401

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    pin_clock(monkeypatch, NOW)


def _body(role="student", username="ana", **extra):
    return {"role": role, "name": "Ana Silva", "username": username, "email": f"{username}@example.com",
            "password": "Segura123", "birthDate": "2000-01-01", "country": "PT", **extra}


def _user(app, username):
    from padel_app.models import User

    with app.app_context():
        u = User.query.filter_by(username=username).first()
        return None if u is None else (u.terms_accepted_at, u.terms_version)


@pytest.mark.parametrize("role", ["student", "coach"])
def test_an_accepted_sign_up_records_when_and_which_terms(app, client, role):
    """Criterion "The acceptance is stored" — both roles share the one form."""
    res = client.post("/api/auth/register", json=_body(role=role, termsAccepted=True), headers=DECLARING)

    assert res.status_code == 201, res.get_json()
    assert _user(app, "ana") == (NOW, "2026-07-14")


@pytest.mark.parametrize("terms", ["absent", False, None, "true", 1])
def test_a_declaring_client_that_does_not_accept_is_refused_and_nothing_is_created(app, client, terms):
    """Criterion "Registration cannot be submitted without accepting"."""
    body = _body() if terms == "absent" else _body(termsAccepted=terms)

    res = client.post("/api/auth/register", json=body, headers=DECLARING)

    assert res.status_code == 400
    assert res.get_json()["field"] == "terms" and res.get_json()["code"] == "TERMS_REQUIRED"
    assert _user(app, "ana") is None


@pytest.mark.parametrize("headers", [OLD_BUILD, {}])
def test_builds_27_and_28_register_exactly_as_before(app, client, headers):
    """Criterion "Older builds still register": no capability, no field — 201, nothing recorded."""
    res = client.post("/api/auth/register", json=_body(), headers=headers)

    assert res.status_code == 201, res.get_json()
    assert _user(app, "ana") == (None, None)
    assert sorted(res.get_json()) == ["accessToken", "user"]


def test_the_version_is_the_effective_date_the_terms_page_states():
    """One date, two places: the server constant and TermsPage.tsx's EFFECTIVE_DATE."""
    from padel_app.services.registration_service import TERMS_VERSION

    page = pathlib.Path(__file__).resolve().parents[3] / "frontend/apps/web/src/pages/TermsPage.tsx"
    stated = re.search(r'EFFECTIVE_DATE = "([^"]+)"', page.read_text(encoding="utf-8")).group(1)

    assert dt.datetime.strptime(stated, "%B %d, %Y").date().isoformat() == TERMS_VERSION


def test_the_capability_spelling_matches_both_shells():
    """Each shell pins its own declaration; this ties both to the server's constant, so a typo in a
    shell cannot put a capable build on the path that records nothing."""
    from padel_app.utils.client_capabilities import TERMS_ACCEPTANCE

    frontend = pathlib.Path(__file__).resolve().parents[3] / "frontend"
    for shell in ("apps/web/src/api/client.ts", "apps/mobile/src/lib/api.ts"):
        assert f'"{TERMS_ACCEPTANCE}"' in (frontend / shell).read_text(), f"{shell} does not declare {TERMS_ACCEPTANCE}"
