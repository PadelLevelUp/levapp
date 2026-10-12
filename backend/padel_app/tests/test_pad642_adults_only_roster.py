"""PAD-642 (owner decision 2026-10-12, "forbid under-18") — a coach confirms every student they add is
18 or older: players.create rule 10 (`/add_player`, `/incomplete_player`), import.confirm rule 9
(`/import/confirm`, `/import/confirm/stream`).

A client declaring `adult-roster-confirmation` must send `confirmsAdults: true` (400
ADULTS_CONFIRMATION_REQUIRED, nothing written); one that does not creates as before.

    pytest padel_app/tests/test_pad642_adults_only_roster.py -v
"""
import pytest

from padel_app.tests.test_player_invitation import _auth_header, make_coach

DECLARING = {"X-LevApp-Capabilities": "open-spots, adult-roster-confirmation"}
CURRENT_BUILD = {"X-LevApp-Capabilities": "open-spots, terms-acceptance"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _players_named(app, name):
    from padel_app.models import User

    with app.app_context():
        return User.query.filter_by(name=name).count()


def _refusal(res):
    assert res.status_code == 400, res.get_data(as_text=True)[:300]
    body = res.get_json()
    assert (body["field"], body["code"]) == ("confirmsAdults", "ADULTS_CONFIRMATION_REQUIRED"), body


def _post(client, app, path, body, caps):
    user_id, coach_id = make_coach(app)
    headers = {**_auth_header(app, user_id), **caps}
    return client.post(path, json={"coachId": coach_id, **body}, headers=headers)


# ── create (players.create rule 10) ──────────────────────────────────────────────

@pytest.mark.parametrize("path", ["/api/app/add_player", "/api/app/incomplete_player"])
def test_creating_a_player_without_the_confirmation_is_refused(client, app, path):
    _refusal(_post(client, app, path, {"name": "Minor Maybe"}, DECLARING))
    assert _players_named(app, "Minor Maybe") == 0


@pytest.mark.parametrize("path", ["/api/app/add_player", "/api/app/incomplete_player"])
def test_creating_a_player_with_the_confirmation_works(client, app, path):
    res = _post(client, app, path, {"name": "Adult Ana", "confirmsAdults": True}, DECLARING)
    assert res.status_code in (200, 201), res.get_json()
    assert _players_named(app, "Adult Ana") == 1


@pytest.mark.parametrize("path", ["/api/app/add_player", "/api/app/incomplete_player"])
def test_a_current_store_build_creates_as_before(client, app, path):
    res = _post(client, app, path, {"name": "Legacy Leo"}, CURRENT_BUILD)
    assert res.status_code in (200, 201), res.get_json()
    assert _players_named(app, "Legacy Leo") == 1


# ── import (import.confirm rule 9) ───────────────────────────────────────────────

PLAYERS = {"Players": [{"name": "Imported Ines"}, {"name": "Imported Igor"}]}


@pytest.mark.parametrize("path", ["/api/app/import/confirm", "/api/app/import/confirm/stream"])
def test_importing_players_without_the_confirmation_imports_nothing(client, app, path):
    _refusal(_post(client, app, path, PLAYERS, DECLARING))
    assert _players_named(app, "Imported Ines") == 0


def test_importing_players_with_the_confirmation_works(client, app):
    res = _post(client, app, "/api/app/import/confirm", {**PLAYERS, "confirmsAdults": True}, DECLARING)
    assert res.status_code == 200, res.get_json()
    assert _players_named(app, "Imported Ines") == 1


def test_an_import_from_a_current_store_build_runs_as_before(client, app):
    res = _post(client, app, "/api/app/import/confirm", PLAYERS, CURRENT_BUILD)
    assert res.status_code == 200, res.get_json()
    assert _players_named(app, "Imported Igor") == 1


def test_an_import_with_no_players_needs_no_confirmation(client, app):
    res = _post(client, app, "/api/app/import/confirm", {"Classes": []}, DECLARING)
    assert res.status_code == 200, res.get_json()
