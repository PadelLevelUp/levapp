"""players.claim triggers (PAD-213): the invite-link claim (A) and the
coach-initiated request the student decides (B), over the HTTP routes."""
from datetime import datetime

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_player_claim_merge import (
    _coach, _placeholder, _student, _lesson_with_instance,
)


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _invite(app, player_id, coach_id, token="tok-claim", status="pending", expires=datetime(2030, 1, 1)):
    from padel_app.models import PlayerInvitation

    with app.app_context():
        db.session.add(PlayerInvitation(player_id=player_id, token=token, invited_by_coach_id=coach_id,
                                        status=status, expires_at=expires))
        db.session.commit()
    return token


@pytest.fixture
def world(app):
    cu, cid, club, level = _coach(app)
    pu, pid = _placeholder(app, cid, club, level_id=level)
    su, sid = _student(app)
    return {"coach_user": cu, "coach": cid, "club": club, "level": level,
            "ph_user": pu, "ph_player": pid, "st_user": su, "st_player": sid}


# ── trigger A ───────────────────────────────────────────────────────────────

def test_claim_via_invite_link_keeps_the_coachs_data(app, client, world):
    from padel_app.models import Association_CoachPlayer, Player, PlayerInvitation, Presence, User

    _, inst = _lesson_with_instance(app, world["club"], world["coach"])
    with app.app_context():
        for i in range(3):
            _, inst_i = _lesson_with_instance(app, world["club"], world["coach"], when=datetime(2026, 9, 10 + i, 10))
            db.session.add(Presence(player_id=world["ph_player"], lesson_instance_id=inst_i, status="present"))
        db.session.commit()
    token = _invite(app, world["ph_player"], world["coach"])

    res = client.post(f"/api/app/player-invitations/{token}/claim", headers=_auth(app, world["st_user"]))
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"merged": True, "coachName": "Maria"}

    with app.app_context():
        rel = Association_CoachPlayer.query.filter_by(coach_id=world["coach"], player_id=world["st_player"]).one()
        assert rel.level_id == world["level"] and rel.side == "left"
        assert Presence.query.filter_by(player_id=world["st_player"]).count() == 3
        assert Player.query.get(world["ph_player"]) is None
        assert User.query.get(world["ph_user"]).status == "disabled"
        assert PlayerInvitation.query.filter_by(token=token).one().status == "accepted"
        st = User.query.get(world["st_user"])
        assert (st.name, st.username) == ("Ana Silva", "ana")


def test_claim_via_invite_requires_a_student_account(app, client, world):
    token = _invite(app, world["ph_player"], world["coach"])
    res = client.post(f"/api/app/player-invitations/{token}/claim", headers=_auth(app, world["coach_user"]))
    assert res.status_code == 403
    with app.app_context():
        from padel_app.models import Player
        assert Player.query.get(world["ph_player"]) is not None


def test_claim_via_invite_rejects_used_or_unknown_tokens(app, client, world):
    token = _invite(app, world["ph_player"], world["coach"], status="accepted")
    assert client.post(f"/api/app/player-invitations/{token}/claim", headers=_auth(app, world["st_user"])).status_code == 410
    assert client.post("/api/app/player-invitations/nope/claim", headers=_auth(app, world["st_user"])).status_code == 404


def test_claim_via_invite_needs_a_session(app, client, world):
    token = _invite(app, world["ph_player"], world["coach"])
    assert client.post(f"/api/app/player-invitations/{token}/claim").status_code == 401


# ── trigger B ───────────────────────────────────────────────────────────────

def _request(client, app, world, username="ana"):
    return client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                       headers=_auth(app, world["coach_user"]), json={"username": username})


def test_coach_request_is_accepted_by_the_student(app, client, world):
    from padel_app.models import Association_CoachPlayer, Player, PlayerClaimRequest

    res = _request(client, app, world)
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body["status"] == "pending" and body["placeholderName"] == "Ana S." and body["coachName"] == "Maria"
    assert body["clubName"] == "Padel Academy"

    inbox = client.get("/api/app/player-claim-requests", headers=_auth(app, world["st_user"]))
    assert inbox.status_code == 200 and [r["id"] for r in inbox.get_json()] == [body["id"]]
    # not visible to anyone else
    other_user, _ = _student(app, username="bruno")
    assert client.get("/api/app/player-claim-requests", headers=_auth(app, other_user)).get_json() == []

    res = client.post(f"/api/app/player-claim-requests/{body['id']}/accept", headers=_auth(app, world["st_user"]))
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["status"] == "accepted"
    with app.app_context():
        assert PlayerClaimRequest.query.get(body["id"]).status == "accepted"
        assert Association_CoachPlayer.query.filter_by(coach_id=world["coach"], player_id=world["st_player"]).one().level_id == world["level"]
        assert Player.query.get(world["ph_player"]) is None


def test_rejecting_changes_nothing(app, client, world):
    from padel_app.models import Player, PlayerClaimRequest, User

    rid = _request(client, app, world).get_json()["id"]
    res = client.post(f"/api/app/player-claim-requests/{rid}/reject", headers=_auth(app, world["st_user"]))
    assert res.status_code == 200 and res.get_json()["status"] == "rejected"
    with app.app_context():
        assert Player.query.get(world["ph_player"]) is not None
        assert User.query.get(world["ph_user"]).status == "inactive"
        assert PlayerClaimRequest.query.get(rid).status == "rejected"
    # a decided request cannot be decided again
    assert client.post(f"/api/app/player-claim-requests/{rid}/accept", headers=_auth(app, world["st_user"])).status_code == 410


def test_only_the_target_decides(app, client, world):
    from padel_app.models import PlayerClaimRequest

    rid = _request(client, app, world).get_json()["id"]
    bruno, _ = _student(app, username="bruno")
    assert client.post(f"/api/app/player-claim-requests/{rid}/accept", headers=_auth(app, bruno)).status_code == 403
    assert client.post(f"/api/app/player-claim-requests/{rid}/reject", headers=_auth(app, world["coach_user"])).status_code == 403
    with app.app_context():
        assert PlayerClaimRequest.query.get(rid).status == "pending"


def test_activated_player_cannot_be_claimed(app, client, world):
    from padel_app.models import User

    with app.app_context():
        u = User.query.get(world["ph_user"]); u.password = "set"; u.status = "active"; u.username = "real"; db.session.commit()
    res = _request(client, app, world)
    assert res.status_code == 409 and res.get_json()["error"] == "ALREADY_ACTIVATED"
    # and the coach's roster payload says so
    roster = client.get("/api/app/coach_players", headers=_auth(app, world["coach_user"]))
    assert roster.status_code == 200
    mine = [p for p in roster.get_json() if p["playerId"] == world["ph_player"]][0]
    assert mine["claimable"] is False


def test_roster_payload_marks_a_placeholder_claimable(app, client, world):
    roster = client.get("/api/app/coach_players", headers=_auth(app, world["coach_user"]))
    mine = [p for p in roster.get_json() if p["playerId"] == world["ph_player"]][0]
    assert mine["claimable"] is True and mine["validated"] is False


def test_request_needs_roster_ownership_and_a_student_username(app, client, world):
    other_coach_user, _, _, _ = _coach(app, username="joao", club_name="Other")
    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      headers=_auth(app, other_coach_user), json={"username": "ana"})
    assert res.status_code == 403
    assert _request(client, app, world, username="nobody").status_code == 404
    assert _request(client, app, world, username="maria").status_code == 404      # a coach
    assert _request(client, app, world, username="ANA").status_code == 201        # case-insensitive


def test_duplicate_pending_request_is_409(app, client, world):
    assert _request(client, app, world).status_code == 201
    assert _request(client, app, world).status_code == 409


def test_coach_can_revoke_while_pending(app, client, world):
    rid = _request(client, app, world).get_json()["id"]
    other_coach_user, _, _, _ = _coach(app, username="joao", club_name="Other")
    assert client.post(f"/api/app/player-claim-requests/{rid}/revoke", headers=_auth(app, other_coach_user)).status_code == 403
    res = client.post(f"/api/app/player-claim-requests/{rid}/revoke", headers=_auth(app, world["coach_user"]))
    assert res.status_code == 200 and res.get_json()["status"] == "revoked"
    assert client.get("/api/app/player-claim-requests", headers=_auth(app, world["st_user"])).get_json() == []


def test_student_cannot_create_a_request(app, client, world):
    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      headers=_auth(app, world["st_user"]), json={"username": "ana"})
    assert res.status_code == 403
