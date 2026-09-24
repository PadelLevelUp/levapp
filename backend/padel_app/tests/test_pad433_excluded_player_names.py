"""
PAD-433 / B-168 — notifications.config rule 14a: GET /api/app/notify/config names the
excluded players.

The restriction stores Player ids only (`restrictions.excludedPlayers.playerIds`), so a client
that reloads has nothing to put on the chip but the id. The GET now adds a read-only
`excludedPlayerNames` map `{playerId: name}` for the ids that are still the coach's own,
non-deleted players; POST ignores the key.

    pytest padel_app/tests/test_pad433_excluded_player_names.py -v
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world(app):
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    with app.app_context():
        def mk_user(name, username, status="active"):
            u = User(name=name, username=username, email=f"{username}@test.com",
                     password="hashed", status=status)
            db.session.add(u)
            db.session.flush()
            return u

        coach_a_user = mk_user("Coach A", "coach_a")
        coach_b_user = mk_user("Coach B", "coach_b")
        coach_a = Coach(user_id=coach_a_user.id)
        coach_b = Coach(user_id=coach_b_user.id)
        db.session.add_all([coach_a, coach_b])
        db.session.flush()

        players = {}
        for key, name, status in [
            ("alice", "Alice Andrade", "active"),
            ("ghost", "Alva Ghost", "inactive"),
            ("gone", "Deleted Person", "disabled"),
            ("mallory", "Alice Mallory", "active"),
        ]:
            u = mk_user(name, key, status=status)
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            players[key] = p

        for key in ("alice", "ghost", "gone"):
            db.session.add(Association_CoachPlayer(coach_id=coach_a.id, player_id=players[key].id))
        db.session.add(Association_CoachPlayer(coach_id=coach_b.id, player_id=players["mallory"].id))
        db.session.commit()

        return {
            "coach_a_user_id": coach_a_user.id,
            "pid": {k: str(v.id) for k, v in players.items()},
        }


def _save_excluded(client, headers, ids, enabled=True):
    cfg = client.get("/api/app/notify/config", headers=headers).get_json()
    restrictions = dict(cfg["restrictions"])
    restrictions["excludedPlayers"] = {"enabled": enabled, "playerIds": ids}
    res = client.post("/api/app/notify/config", json={"restrictions": restrictions}, headers=headers)
    assert res.status_code == 200


def test_get_names_the_coachs_own_excluded_players(app, client, world):
    headers = _auth(app, world["coach_a_user_id"])
    pid = world["pid"]
    _save_excluded(client, headers, [pid["alice"], pid["ghost"]])

    cfg = client.get("/api/app/notify/config", headers=headers).get_json()

    assert cfg["excludedPlayerNames"] == {pid["alice"]: "Alice Andrade", pid["ghost"]: "Alva Ghost"}
    assert cfg["restrictions"]["excludedPlayers"]["playerIds"] == [pid["alice"], pid["ghost"]]


def test_foreign_deleted_and_unknown_ids_get_no_name(app, client, world):
    headers = _auth(app, world["coach_a_user_id"])
    pid = world["pid"]
    _save_excluded(client, headers, [pid["alice"], pid["mallory"], pid["gone"], "999999"])

    cfg = client.get("/api/app/notify/config", headers=headers).get_json()

    assert cfg["excludedPlayerNames"] == {pid["alice"]: "Alice Andrade"}


def test_names_are_returned_while_the_restriction_is_off(app, client, world):
    """The ids survive a toggle-off, and so must their names, or re-enabling shows ids."""
    headers = _auth(app, world["coach_a_user_id"])
    pid = world["pid"]
    _save_excluded(client, headers, [pid["alice"]], enabled=False)

    cfg = client.get("/api/app/notify/config", headers=headers).get_json()

    assert cfg["excludedPlayerNames"] == {pid["alice"]: "Alice Andrade"}


def test_an_empty_list_gives_an_empty_map(app, client, world):
    headers = _auth(app, world["coach_a_user_id"])
    cfg = client.get("/api/app/notify/config", headers=headers).get_json()
    assert cfg["excludedPlayerNames"] == {}


def test_post_ignores_excluded_player_names(app, client, world):
    headers = _auth(app, world["coach_a_user_id"])
    pid = world["pid"]
    _save_excluded(client, headers, [pid["alice"]])
    before = client.get("/api/app/notify/config", headers=headers).get_json()

    res = client.post(
        "/api/app/notify/config",
        json={"excludedPlayerNames": {pid["alice"]: "Someone Else", "123": "Injected"}},
        headers=headers,
    )
    assert res.status_code == 200

    after = client.get("/api/app/notify/config", headers=headers).get_json()
    assert after == before
    assert after["excludedPlayerNames"] == {pid["alice"]: "Alice Andrade"}
