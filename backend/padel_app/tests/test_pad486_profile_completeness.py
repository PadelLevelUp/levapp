"""
PAD-486 / PAD-490 — dashboard.profile-completeness.

A coach-student link with no level or no side costs the student invitations and class requests.
The coach's dashboard lists who is missing what; the student's dashboard says why and lets them
remind the coach once per club (Lisbon) day.
"""
from datetime import datetime

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def world(app):
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        def user(username, name, status="active", language="pt"):
            u = User(name=name, username=username, password="x", status=status, language=language)
            db.session.add(u)
            db.session.flush()
            return u

        cu = user("p486_coach", "P486 Coach", language="en")
        xu = user("p486_other_coach", "P486 Other Coach")
        coach, other = Coach(user_id=cu.id), Coach(user_id=xu.id)
        db.session.add_all([coach, other])
        db.session.flush()
        level = CoachLevel(coach_id=coach.id, label="5", code="5", display_order=1)
        db.session.add(level)
        db.session.flush()

        ids = {"coach_id": coach.id, "coach_user_id": cu.id, "other_coach_id": other.id}
        for key, name, level_id, side, status in (
            ("a", "Ana NoLevel", None, "left", "active"),
            ("b", "Bruno NoSide", level.id, None, "active"),
            ("d", "Duarte Done", level.id, "right", "active"),
            ("e", "Eva Disabled", None, "left", "disabled"),
            ("s", "Sofia JoinedByLink", None, None, "active"),
        ):
            u = user(f"p486_{key}", name, status=status)
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level_id, side=side))
            ids[f"{key}_user_id"], ids[f"{key}_player_id"] = u.id, p.id
        db.session.commit()
        return ids


def _block(client, app, user_id, block_type):
    resp = client.get("/api/app/dashboard", headers=_auth(app, user_id))
    assert resp.status_code == 200
    return next((b for b in resp.get_json()["blocks"] if b["type"] == block_type), None)


def _remind(client, app, user_id, coach_id):
    return client.post("/api/app/profile-reminder", json={"coachId": coach_id}, headers=_auth(app, user_id))


def _reminders(app, sender_user_id):
    from padel_app.models import Message

    with app.app_context():
        return Message.query.filter_by(sender_id=sender_user_id, message_type="profile_reminder").count()


# ── coach (PAD-486) ───────────────────────────────────────────────────────────

def test_the_coach_sees_who_is_missing_what(client, app, world):
    block = _block(client, app, world["coach_user_id"], "incomplete_players")
    assert block is not None
    data = block["data"]
    assert data["count"] == 3  # Ana, Bruno, Sofia; not Duarte (done), not Eva (disabled)
    assert (data["missingLevel"], data["missingSide"]) == (2, 2)
    by_name = {p["name"]: p for p in data["players"]}
    assert set(by_name) == {"Ana NoLevel", "Bruno NoSide", "Sofia JoinedByLink"}
    assert by_name["Ana NoLevel"]["missing"] == ["level"]
    assert by_name["Bruno NoSide"]["missing"] == ["side"]
    assert by_name["Sofia JoinedByLink"]["missing"] == ["level", "side"]
    assert by_name["Ana NoLevel"]["href"] == f"/players/{world['a_player_id']}"
    assert data["seeAllHref"] == "/players?incomplete=true"


def test_the_coach_block_lists_five_names_and_the_full_count(client, app, world):
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.players import Player

    with app.app_context():
        for i in range(4):
            u = User(name=f"Zed {i}", username=f"p486_zed{i}", password="x", status="active")
            db.session.add(u)
            db.session.flush()
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=world["coach_id"], player_id=p.id))
        db.session.commit()
    data = _block(client, app, world["coach_user_id"], "incomplete_players")["data"]
    assert data["count"] == 7 and len(data["players"]) == 5


def test_the_coach_block_is_gone_when_everything_is_set(client, app, world):
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    with app.app_context():
        level_id = Association_CoachPlayer.query.filter_by(player_id=world["d_player_id"]).one().level_id
        for cp in Association_CoachPlayer.query.filter_by(coach_id=world["coach_id"]).all():
            cp.level_id, cp.side = level_id, cp.side or "both"
        db.session.commit()
    assert _block(client, app, world["coach_user_id"], "incomplete_players") is None


# ── student (PAD-490) ─────────────────────────────────────────────────────────

def test_a_student_who_joined_by_link_sees_why(client, app, world):
    block = _block(client, app, world["s_user_id"], "profile_incomplete")
    assert block["data"]["coaches"] == [{
        "coachId": world["coach_id"], "coachName": "P486 Coach",
        "missing": ["level", "side"], "remindedToday": False, "canRemind": True,
    }]
    assert _block(client, app, world["d_user_id"], "profile_incomplete") is None


def test_a_reminder_reaches_the_coach_once_a_day(client, app, world):
    first = _remind(client, app, world["s_user_id"], world["coach_id"])
    assert first.status_code == 200, first.get_json()
    msg = first.get_json()["message"]
    assert msg["messageType"] == "profile_reminder"
    assert msg["content"] == "Hi coach, my profile isn't complete yet (missing: level, side)."  # coach is en

    second = _remind(client, app, world["s_user_id"], world["coach_id"])
    assert second.status_code == 409 and second.get_json()["code"] == "already_reminded"
    assert _reminders(app, world["s_user_id"]) == 1
    block = _block(client, app, world["s_user_id"], "profile_incomplete")
    assert block["data"]["coaches"][0]["remindedToday"] is True


def test_the_reminder_lands_in_the_coach_thread_from_the_student(client, app, world):
    from padel_app.models import Message
    from padel_app.models.conversation_participants import ConversationParticipant

    msg_id = _remind(client, app, world["s_user_id"], world["coach_id"]).get_json()["message"]["id"]
    with app.app_context():
        msg = db.session.get(Message, int(msg_id))
        assert msg.sender_id == world["s_user_id"]
        members = {p.user_id for p in ConversationParticipant.query.filter_by(conversation_id=msg.conversation_id)}
        assert members == {world["s_user_id"], world["coach_user_id"]}
        assert msg.msg_metadata == {"profileReminder": {"coachId": world["coach_id"], "missing": ["level", "side"]}}


def test_the_day_turns_at_lisbon_midnight(client, app, world, monkeypatch):
    """Summer: 23:30 Lisbon = 22:30 UTC; 00:10 Lisbon the next day = 23:10 UTC, the same UTC day.
    A UTC day boundary would refuse the second reminder; the club day allows it."""
    import padel_app.services.profile_completeness_service  # noqa: F401 (loaded before pinning)
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, datetime(2026, 7, 15, 22, 30))
    assert _remind(client, app, world["s_user_id"], world["coach_id"]).status_code == 200
    pin_clock(monkeypatch, datetime(2026, 7, 15, 22, 59))
    assert _remind(client, app, world["s_user_id"], world["coach_id"]).status_code == 409  # still 23:59 Lisbon
    pin_clock(monkeypatch, datetime(2026, 7, 15, 23, 10))
    assert _remind(client, app, world["s_user_id"], world["coach_id"]).status_code == 200
    assert _reminders(app, world["s_user_id"]) == 2


def test_no_reminder_for_a_complete_profile_or_a_stranger(client, app, world):
    done = _remind(client, app, world["d_user_id"], world["coach_id"])
    assert done.status_code == 409 and done.get_json()["code"] == "profile_complete"
    stranger = _remind(client, app, world["s_user_id"], world["other_coach_id"])
    assert stranger.status_code == 404
    assert _reminders(app, world["d_user_id"]) == 0
    assert _reminders(app, world["s_user_id"]) == 0


def test_a_coach_cannot_send_a_reminder(client, app, world):
    resp = _remind(client, app, world["coach_user_id"], world["coach_id"])
    assert resp.status_code == 403


# ── review round (#523) ──────────────────────────────────────────────────────

def _block_pair(app, blocker_id, blocked_id):
    from padel_app.models import BlockedUser

    with app.app_context():
        db.session.add(BlockedUser(blocker_id=blocker_id, blocked_id=blocked_id))
        db.session.commit()


@pytest.mark.parametrize("direction", ["coach_blocked_student", "student_blocked_coach"])
def test_a_blocked_pair_gets_no_reminder_and_no_button(client, app, world, monkeypatch, direction):
    """Messaging's block check applies: nothing is written and nothing is pushed, either way.
    The card still explains the cost but offers no button (`canRemind: false`); the refusal is a
    generic 409 so the student cannot read a block from it."""
    pushes = []
    monkeypatch.setattr("padel_app.services.profile_completeness_service._push_to_coach",
                        lambda *a, **k: pushes.append(a))
    if direction == "coach_blocked_student":
        _block_pair(app, world["coach_user_id"], world["s_user_id"])
    else:
        _block_pair(app, world["s_user_id"], world["coach_user_id"])

    entry = _block(client, app, world["s_user_id"], "profile_incomplete")["data"]["coaches"][0]
    assert entry["canRemind"] is False
    resp = _remind(client, app, world["s_user_id"], world["coach_id"])
    assert resp.status_code == 409 and resp.get_json()["code"] == "cannot_remind"
    assert _reminders(app, world["s_user_id"]) == 0
    assert pushes == []


def test_a_disabled_coach_is_neither_shown_nor_reminded(client, app, world):
    from padel_app.models import User

    with app.app_context():
        db.session.get(User, world["coach_user_id"]).status = "disabled"
        db.session.commit()
    assert _block(client, app, world["s_user_id"], "profile_incomplete") is None
    resp = _remind(client, app, world["s_user_id"], world["coach_id"])
    assert resp.status_code == 404
    assert _reminders(app, world["s_user_id"]) == 0


@pytest.mark.parametrize("key, text", [
    ("a", "Hi coach, my profile isn't complete yet (missing: level)."),
    ("b", "Hi coach, my profile isn't complete yet (missing: side)."),
])
def test_the_reminder_names_only_what_is_missing(client, app, world, key, text):
    resp = _remind(client, app, world[f"{key}_user_id"], world["coach_id"])
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["message"]["content"] == text


def test_see_all_opens_a_filter_that_matches_the_block(client, app, world):
    """#523 review: with mixed gaps, "see all" must list everyone the block counts (no level OR
    no side), not only the missing-level ones."""
    data = _block(client, app, world["coach_user_id"], "incomplete_players")["data"]
    assert data["seeAllHref"] == "/players?incomplete=true"
    resp = client.get("/api/app/coach_players_paginated?incomplete=true",
                      headers=_auth(app, world["coach_user_id"]))
    assert resp.status_code == 200
    names = {p["name"] for p in resp.get_json()["items"]}
    assert names == {"Ana NoLevel", "Bruno NoSide", "Sofia JoinedByLink"}
    assert resp.get_json()["pagination"]["total"] == data["count"]


def test_the_student_block_comes_before_the_hero(client, app, world):
    """Rule 4 as the clients render it: the card above the next-class hero."""
    resp = client.get("/api/app/dashboard", headers=_auth(app, world["s_user_id"]))
    types = [b["type"] for b in resp.get_json()["blocks"]]
    assert "profile_incomplete" in types
    if "next_class" in types:
        assert types.index("profile_incomplete") < types.index("next_class")
