"""PAD-660 — players.nickname (numbering of the rules is the spec's). A coach's private nickname
for a student lives on the coach–student relation and leaves the server only to that coach.

The owner's binding rules (2026-10-14), each pinned here: the nickname is on the relation, never
on the user; the student never receives it (payloads, templates, the shared conversation, their
data export); another coach never sees it; search finds the student by either name; the field
validates; it goes with the account and with the link; it is in the coach's own export.
"""
import json

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad274_deletes import _headers, _jwt, _second_coach, world  # noqa: F401

NICK = "Jorge chato"


def _rel(world):
    from padel_app.models import Association_CoachPlayer

    return db.session.get(Association_CoachPlayer, world["rel_id"])


def _set_nickname(app, client, world, **updates):
    body = {
        "player": {"coachId": world["coach_id"], "playerId": world["student_id"]},
        "updates": updates,
    }
    return client.post("/api/app/edit_player", json=body, headers=_headers(app, world["coach_user_id"]))


def _share_with_coach_b(app, world):
    from padel_app.models import Association_CoachPlayer

    user_id, coach_id = _second_coach(app)
    with app.app_context():
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=world["student_id"]))
        db.session.commit()
    return user_id, coach_id


def _roster_row(app, client, user_id, student_id):
    res = client.get("/api/app/coach_players", headers=_headers(app, user_id))
    assert res.status_code == 200, res.get_data(as_text=True)
    data = res.get_json()
    rows = data if isinstance(data, list) else data.get("items", data.get("players", []))
    return next(r for r in rows if str(r["playerId"]) == str(student_id))


def test_the_coach_sets_a_nickname_on_the_relation_and_sees_it_as_the_display_name(app, client, world):
    res = _set_nickname(app, client, world, nickname=f"  {NICK}  ", nicknameAsName=True)
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        rel = _rel(world)
        assert (rel.nickname, rel.nickname_as_name) == (NICK, True)
    row = _roster_row(app, client, world["coach_user_id"], world["student_id"])
    assert (row["name"], row["nickname"], row["nicknameAsName"], row["displayName"]) == (
        "Rui Student", NICK, True, NICK,
    )


def test_with_the_switch_off_the_display_name_is_the_real_name(app, client, world):
    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=False)
    row = _roster_row(app, client, world["coach_user_id"], world["student_id"])
    assert (row["nickname"], row["displayName"]) == (NICK, "Rui Student")


def test_a_blank_nickname_clears_it_and_61_characters_are_refused(app, client, world):
    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    too_long = _set_nickname(app, client, world, nickname="x" * 61)
    assert too_long.status_code == 400
    with app.app_context():
        assert _rel(world).nickname == NICK
    assert _set_nickname(app, client, world, nickname="   ").status_code == 200
    with app.app_context():
        assert _rel(world).nickname is None
    row = _roster_row(app, client, world["coach_user_id"], world["student_id"])
    assert row["displayName"] == "Rui Student"


def test_another_coach_of_the_same_student_never_sees_it(app, client, world):
    b_user_id, _ = _share_with_coach_b(app, world)
    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    row = _roster_row(app, client, b_user_id, world["student_id"])
    assert (row["nickname"], row["nicknameAsName"], row["displayName"]) == (None, False, "Rui Student")
    assert NICK not in json.dumps(client.get("/api/app/coach_players", headers=_headers(app, b_user_id)).get_json())


def test_the_student_and_shared_serializers_never_carry_it(app, client, world):
    from padel_app.models import Player, User
    from padel_app.serializers.player import serialize_player
    from padel_app.serializers.user import serialize_user, serialize_user_public

    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    with app.app_context():
        player = db.session.get(Player, world["student_id"])
        user = db.session.get(User, world["student_user_id"])
        for payload in (serialize_player(player), serialize_user(user), serialize_user_public(user)):
            assert NICK not in json.dumps(payload, default=str)
    me = client.get("/api/auth/me", headers=_headers(app, world["student_user_id"]))
    assert NICK not in me.get_data(as_text=True)


def test_search_finds_the_student_by_nickname_and_by_real_name(app, client, world):
    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    h = _headers(app, world["coach_user_id"])
    for q in ("chato", "Rui"):
        page = client.get(f"/api/app/coach_players_paginated?search={q}", headers=h).get_json()
        assert [str(r["playerId"]) for r in page["items"]] == [str(world["student_id"])], q
        found = client.get(f"/api/app/notify/player_search?q={q}", headers=h).get_json()["players"]
        assert [str(p["id"]) for p in found] == [str(world["student_id"])], q


def test_the_conversation_list_shows_the_coach_their_display_name_and_the_student_nothing_new(app, client, world):
    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    created = client.post(
        "/api/app/conversation",
        json={"otherParticipants": [str(world["student_user_id"])]},
        headers=_headers(app, world["coach_user_id"]),
    )
    assert created.status_code in (200, 201), created.get_data(as_text=True)
    coach_list = client.get("/api/app/conversations", headers=_headers(app, world["coach_user_id"])).get_json()
    assert [c["participantName"] for c in coach_list["conversations"]] == [NICK]
    student_list = client.get("/api/app/conversations", headers=_headers(app, world["student_user_id"]))
    assert NICK not in student_list.get_data(as_text=True)


def test_the_students_export_leaves_the_nickname_out_and_the_coachs_keeps_it(app, client, world):
    from scripts.export_user_data import export

    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    with app.app_context():
        with db.engine.connect() as conn:
            student_doc = export(conn, world["student_user_id"])
            coach_doc = export(conn, world["coach_user_id"])
    student_rows = student_doc["tables"]["coach_in_player"]
    assert student_rows and all("nickname" not in r and "nickname_as_name" not in r for r in student_rows)
    assert NICK not in json.dumps(student_doc, default=str)
    assert [r["nickname"] for r in coach_doc["tables"]["coach_in_player"]] == [NICK]


def test_deleting_the_students_account_erases_the_nickname(app, client, world):
    from padel_app.services.account_service import delete_account_service

    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    with app.app_context():
        delete_account_service(world["student_user_id"])
        db.session.expire_all()
        rel = _rel(world)
        assert rel is None or (rel.nickname, rel.nickname_as_name) == (None, False)


def test_ending_the_link_removes_the_nickname_with_the_row(app, client, world):
    from sqlalchemy import text

    _set_nickname(app, client, world, nickname=NICK, nicknameAsName=True)
    res = client.post(
        "/api/app/remove_player",
        json={"coachId": world["coach_id"], "playerId": world["student_id"], "action": "disconnect"},
        headers=_headers(app, world["coach_user_id"]),
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert db.session.execute(
            text("SELECT count(*) FROM coach_in_player WHERE nickname = :n"), {"n": NICK}
        ).scalar() == 0


def test_templates_and_the_shared_conversation_use_the_real_name(app, monkeypatch):
    """Rule 4: a reminder (templated, `{name}`) and the cancellation notice the student's own
    conversation with the coach carries are read by the student — the real name, always."""
    from padel_app.models import Association_CoachPlayer, Message
    from padel_app.services.notification_service import cancel_attendance, send_class_reminders
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad358_academy_classes import _add_class, _setup

    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda **kw: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: None)
    ids = _setup(app)
    cls = _add_class(app, ids, days=3, title="PAD660")
    with app.app_context():
        enrol(ids["student_id"], db.session.get(LessonInstance, cls["instance_id"]), "coach")
        db.session.commit()
        c = {"instance_id": cls["instance_id"],
             "student_user_id": db.session.get(Player, ids["student_id"]).user_id}
    with app.app_context():
        rel = Association_CoachPlayer.query.filter_by(
            coach_id=ids["coach_id"], player_id=ids["student_id"]
        ).one()
        rel.nickname, rel.nickname_as_name = NICK, True
        db.session.commit()
        before = {m.id for m in Message.query.all()}
        send_class_reminders(c["instance_id"])
        cancel_attendance(c["student_user_id"], lesson_instance_id=c["instance_id"])
        texts = [m.text or "" for m in Message.query.all() if m.id not in before]
    assert texts, "the reminder and the cancellation notice were written"
    assert all(NICK not in t for t in texts), texts
    assert any("wizard" in t for t in texts), texts
