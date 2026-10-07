"""players.claim rules 4b–4d, 5h–5j (PAD-528): the roster-pick trigger, the
duplicate flag, the one consent function, soft references, the audit row and
the dry-run preview whose counts the merge then writes.
"""
from datetime import date, datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_player_claim_merge import (
    _coach, _evaluated, _lesson_with_instance, _placeholder, _relation, _student,
)


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def world(app):
    """Maria's roster: placeholder "Ana S." and student ana ("Ana Silva"), who scanned
    the QR and so already has a relation with Maria (the PAD-528 case)."""
    cu, cid, club, level = _coach(app)
    pu, pid = _placeholder(app, cid, club, level_id=level)
    su, sid = _student(app)
    _relation(app, cid, sid)
    return {"coach_user": cu, "coach": cid, "club": club, "level": level,
            "ph_user": pu, "ph_player": pid, "st_user": su, "st_player": sid}


# ── rule 4b: candidates and the roster pick ─────────────────────────────────

def test_candidates_list_the_coachs_students_and_not_the_placeholder(app, client, world):
    res = client.get(f"/api/app/player/{world['ph_player']}/claim-candidates", headers=_auth(app, world["coach_user"]))
    assert res.status_code == 200
    ids = [c["playerId"] for c in res.json]
    assert ids == [world["st_player"]]
    assert res.json[0]["name"] == "Ana Silva" and res.json[0]["sameName"] is False


def test_candidates_put_the_namesake_first_and_search_filters(app, client, world):
    _, bruno = _student(app, username="bruno", name="Bruno Costa")
    _relation(app, world["coach"], bruno)
    _, twin = _student(app, username="ana2", name="ANA  s.")   # same normalised name as "Ana S."
    _relation(app, world["coach"], twin)
    res = client.get(f"/api/app/player/{world['ph_player']}/claim-candidates", headers=_auth(app, world["coach_user"]))
    assert [c["playerId"] for c in res.json][0] == twin and res.json[0]["sameName"] is True
    res = client.get(f"/api/app/player/{world['ph_player']}/claim-candidates?search=bru", headers=_auth(app, world["coach_user"]))
    assert [c["playerId"] for c in res.json] == [bruno]


def test_candidates_need_the_placeholders_coach(app, client, world):
    other_user, other_coach, _, _ = _coach(app, username="rui", club_name="Other Club")
    res = client.get(f"/api/app/player/{world['ph_player']}/claim-candidates", headers=_auth(app, other_user))
    assert res.status_code == 403


def test_a_roster_pick_creates_the_same_pending_request(app, client, world):
    from padel_app.models import PlayerClaimRequest

    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      json={"targetPlayerId": world["st_player"]}, headers=_auth(app, world["coach_user"]))
    assert res.status_code == 201, res.json
    with app.app_context():
        req = PlayerClaimRequest.query.one()
        assert req.status == "pending" and req.target_user_id == world["st_user"]
    mine = client.get("/api/app/player-claim-requests", headers=_auth(app, world["st_user"]))
    assert [r["placeholderName"] for r in mine.json] == ["Ana S."]


def test_a_pick_outside_the_roster_is_404(app, client, world):
    from padel_app.models import PlayerClaimRequest

    _, bruno = _student(app, username="bruno", name="Bruno Costa")
    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      json={"targetPlayerId": bruno}, headers=_auth(app, world["coach_user"]))
    assert res.status_code == 404
    with app.app_context():
        assert PlayerClaimRequest.query.count() == 0


# ── rule 4c: the duplicate flag ─────────────────────────────────────────────

def test_the_roster_flags_the_likely_duplicate_on_the_placeholder_row_only(app, client, world):
    cid, club = world["coach"], world["club"]
    _placeholder(app, cid, club, name="Ana  Silva")           # two spaces: normalises to ana's name
    _, rui = _placeholder(app, cid, club, name="Rui")
    res = client.get("/api/app/coach_players_paginated?per_page=50", headers=_auth(app, world["coach_user"]))
    assert res.status_code == 200
    rows = {r["name"]: r for r in res.json["items"]}
    assert rows["Ana  Silva"]["possibleDuplicateOf"] == {"playerId": world["st_player"], "name": "Ana Silva"}
    assert rows["Rui"]["possibleDuplicateOf"] is None
    assert rows["Ana Silva"]["possibleDuplicateOf"] is None      # the active student carries none
    assert rows["Ana S."]["possibleDuplicateOf"] is None
    flat = client.get("/api/app/coach_players", headers=_auth(app, world["coach_user"]))
    assert {r["name"]: r["possibleDuplicateOf"] for r in flat.json}["Ana  Silva"]["playerId"] == world["st_player"]


# ── rule 4d: consent is one function ────────────────────────────────────────

def test_consent_off_merges_in_the_same_call_and_records_the_coach(app, client, world, monkeypatch):
    from padel_app.models import Player, PlayerClaimRequest, PlayerMerge
    from padel_app.services import player_claim_service as svc

    monkeypatch.setattr(svc, "claim_consent_required", lambda coach, placeholder, target: False)
    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      json={"targetPlayerId": world["st_player"]}, headers=_auth(app, world["coach_user"]))
    assert res.status_code == 201 and res.json["status"] == "accepted"
    with app.app_context():
        assert Player.query.get(world["ph_player"]) is None
        assert PlayerClaimRequest.query.one().status == "accepted"
        audit = PlayerMerge.query.one()
        assert audit.trigger == "coach_request"
        assert audit.confirmed_by_user_id == world["coach_user"]
        assert audit.requested_by_coach_id == world["coach"]


def test_consent_on_leaves_the_request_pending_and_nothing_merged(app, client, world):
    from padel_app.models import Player, PlayerClaimRequest, PlayerMerge

    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      json={"targetPlayerId": world["st_player"]}, headers=_auth(app, world["coach_user"]))
    assert res.status_code == 201 and res.json["status"] == "pending"
    with app.app_context():
        assert Player.query.get(world["ph_player"]) is not None
        assert PlayerClaimRequest.query.one().status == "pending"
        assert PlayerMerge.query.count() == 0


# ── rule 5h: soft references ────────────────────────────────────────────────

def test_soft_references_follow_the_merge(app, world):
    from padel_app.models import ClassRequest, NotificationConfig
    from padel_app.services.player_claim_service import merge_placeholder_player_into
    from padel_app.models import Player, User

    pid, cid = world["ph_player"], world["st_player"]
    with app.app_context():
        cfg = NotificationConfig(coach_id=world["coach"], auto_notify_enabled=True,
                                 restrictions={"excludedPlayers": {"enabled": True, "playerIds": [str(pid), str(cid)]}})
        db.session.add(cfg)
        when = datetime(2026, 11, 1, 10, 0)
        db.session.add(ClassRequest(player_id=cid, coach_id=world["coach"], start_datetime=when,
                                    end_datetime=when + timedelta(hours=1), invitee_player_ids=[pid, 999]))
        db.session.commit()
        merge_placeholder_player_into(Player.query.get(pid), User.query.get(world["st_user"]))
        assert NotificationConfig.query.one().excluded_player_ids == [str(cid)]
        assert ClassRequest.query.one().invitee_player_ids == [cid, 999]


# ── rules 5i–5j: the audit row and the preview ──────────────────────────────

def _overlapping_world(app, world):
    """P1: 3 presences, 1 evaluation record, 2 enrolments — one enrolment and one
    presence shared with ana."""
    from padel_app.models import Association_PlayerLesson, Presence

    pid, cid, coach, club = world["ph_player"], world["st_player"], world["coach"], world["club"]
    lessons = [_lesson_with_instance(app, club, coach, when=datetime(2026, 9, 10 + i, 10, 0)) for i in range(3)]
    with app.app_context():
        for lesson_id, inst_id in lessons:
            db.session.add(Presence(player_id=pid, lesson_instance_id=inst_id, status="present"))
        db.session.add(Presence(player_id=cid, lesson_instance_id=lessons[0][1], status="present"))
        db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lessons[0][0]))
        db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lessons[1][0]))
        db.session.add(Association_PlayerLesson(player_id=cid, lesson_id=lessons[0][0]))
        db.session.commit()
    ph_rel = _relation(app, coach, pid)
    _evaluated(app, ph_rel, coach, date(2026, 9, 1))


def _expected_plan(world):
    return {
        "moves": {"presences": 2, "player_in_lesson": 1, "player_in_club": 1, "evaluation_records": 1,
                  "evaluation_entries": 1, "coach_player_notes": 1, "player_claim_requests": 1},
        "dropped": {"presences": 1, "player_in_lesson": 1},
        "merged": {"coach_in_player": 1},
    }


def _request(client, app, world):
    res = client.post(f"/api/app/player/{world['ph_player']}/claim-requests",
                      json={"targetPlayerId": world["st_player"]}, headers=_auth(app, world["coach_user"]))
    assert res.status_code == 201, res.json
    return res.json["id"]


def test_the_preview_counts_what_the_merge_then_does(app, client, world):
    from padel_app.models import Player, PlayerMerge, Presence

    _overlapping_world(app, world)
    req_id = _request(client, app, world)

    preview = client.get(f"/api/app/player-claim-requests/{req_id}/preview", headers=_auth(app, world["st_user"]))
    assert preview.status_code == 200
    assert preview.json == _expected_plan(world)
    with app.app_context():                                   # a dry run: nothing moved
        assert Player.query.get(world["ph_player"]) is not None
        assert Presence.query.filter_by(player_id=world["ph_player"]).count() == 3
        assert PlayerMerge.query.count() == 0

    accept = client.post(f"/api/app/player-claim-requests/{req_id}/accept", headers=_auth(app, world["st_user"]))
    assert accept.status_code == 200
    with app.app_context():
        audit = PlayerMerge.query.one()
        assert audit.counts == preview.json
        assert audit.placeholder_player_id == world["ph_player"] and audit.target_player_id == world["st_player"]
        assert audit.trigger == "coach_request" and audit.confirmed_by_user_id == world["st_user"]
        assert Presence.query.filter_by(player_id=world["st_player"]).count() == 3


def test_the_coach_previews_before_sending(app, client, world):
    _overlapping_world(app, world)
    res = client.get(f"/api/app/player/{world['ph_player']}/merge-preview?targetPlayerId={world['st_player']}",
                     headers=_auth(app, world["coach_user"]))
    assert res.status_code == 200
    plan = _expected_plan(world)
    plan["moves"].pop("player_claim_requests")               # no request exists yet
    assert res.json == plan
    other_user, _, _, _ = _coach(app, username="rui", club_name="Other Club")
    assert client.get(f"/api/app/player/{world['ph_player']}/merge-preview?targetPlayerId={world['st_player']}",
                      headers=_auth(app, other_user)).status_code == 403
    assert client.get(f"/api/app/player/{world['ph_player']}/merge-preview?targetPlayerId=999",
                      headers=_auth(app, world["coach_user"])).status_code == 404


def test_only_the_target_previews_a_request(app, client, world):
    req_id = _request(client, app, world)
    other, _ = _student(app, username="bruno", name="Bruno")
    assert client.get(f"/api/app/player-claim-requests/{req_id}/preview", headers=_auth(app, other)).status_code == 403


def test_the_preview_can_run_twice_and_the_merge_still_works(app, client, world):
    """The savepoint rollback leaves the session usable."""
    from padel_app.models import Player

    _overlapping_world(app, world)
    req_id = _request(client, app, world)
    for _ in range(2):
        assert client.get(f"/api/app/player-claim-requests/{req_id}/preview", headers=_auth(app, world["st_user"])).status_code == 200
    assert client.post(f"/api/app/player-claim-requests/{req_id}/accept", headers=_auth(app, world["st_user"])).status_code == 200
    with app.app_context():
        assert Player.query.get(world["ph_player"]) is None


def test_the_invite_link_claim_writes_an_invite_link_audit_row(app, client, world):
    from padel_app.models import PlayerInvitation, PlayerMerge
    from padel_app.utils.token_hash import hash_token

    with app.app_context():
        db.session.add(PlayerInvitation(player_id=world["ph_player"], token_hash=hash_token("tok-528"),
                                        invited_by_coach_id=world["coach"], status="pending",
                                        expires_at=datetime(2030, 1, 1)))
        db.session.commit()
    res = client.post("/api/app/player-invitations/tok-528/claim", headers=_auth(app, world["st_user"]))
    assert res.status_code == 200, res.json
    with app.app_context():
        audit = PlayerMerge.query.one()
        assert audit.trigger == "invite_link" and audit.confirmed_by_user_id == world["st_user"]
        assert audit.counts["moves"]["player_invitations"] == 1
