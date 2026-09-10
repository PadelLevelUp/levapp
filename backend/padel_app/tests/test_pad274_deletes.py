"""PAD-274 (audit M15, M15b; B-057) — deletes that cascade through the database,
and a confirmation plus an audit trail in front of the ones with no undo.

These run with foreign keys enforced (PAD-278's conftest), so a delete here
cascades exactly as it does in Postgres.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from flask_jwt_extended import create_access_token
from sqlalchemy import event, text

import pytest

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def world(app):
    """A coach with a club, a level, an evaluation category, and one ACTIVE
    student who has presences, level history, a note and a score."""
    from padel_app.models import (
        Association_CoachClub, Association_CoachPlayer, Association_PlayerClub, Club, Coach,
        CoachLevel, CoachPlayerNote, EvaluationCategory, EvaluationEntry, Lesson, LessonInstance,
        Player, PlayerLevelHistory, Presence, User,
    )

    with app.app_context():
        coach_user = User(name="Coach Ana", username="pad274_coach", password="x", status="active")
        student_user = User(name="Rui Student", username="pad274_student", password="x", status="active")
        db.session.add_all([coach_user, student_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        student = Player(user_id=student_user.id)
        club = Club(name="PAD274 Club", description="", location="Lisboa")
        db.session.add_all([coach, student, club])
        db.session.flush()
        db.session.add_all([
            Association_CoachClub(coach_id=coach.id, club_id=club.id),
            Association_PlayerClub(player_id=student.id, club_id=club.id),
        ])
        level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
        category = EvaluationCategory(coach_id=coach.id, name="Serve", scale_min=1, scale_max=10)
        db.session.add_all([level, category])
        db.session.flush()
        rel = Association_CoachPlayer(coach_id=coach.id, player_id=student.id, level_id=level.id)
        db.session.add(rel)
        db.session.flush()
        db.session.add_all([
            CoachPlayerNote(coach_player_id=rel.id, type="strength", text="volley"),
            EvaluationEntry(coach_player_id=rel.id, category_id=category.id, score=7),
            PlayerLevelHistory(coach_id=coach.id, player_id=student.id, level_id=level.id),
        ])
        start = datetime.utcnow() - timedelta(days=7)
        lesson = Lesson(title="Tuesday", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000000",
                        status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                                  end_datetime=start + timedelta(hours=1), max_players=4,
                                  status="completed", notifications_enabled=True)
        db.session.add(instance)
        db.session.flush()
        db.session.add(Presence(player_id=student.id, lesson_instance_id=instance.id, status="present",
                                invited=True, confirmed=True, validated=True))
        db.session.commit()
        return dict(coach_user_id=coach_user.id, coach_id=coach.id, student_user_id=student_user.id,
                    student_id=student.id, rel_id=rel.id, category_id=category.id, lesson_id=lesson.id)


def _count(sql, **params):
    return db.session.execute(text(sql), params).scalar()


# ---------------------------------------------------------------------------
# B-057 / players.remove — a coach DISCONNECTS from a student with an account,
# and DELETES only a placeholder they created. No "only coach" exception.
# ---------------------------------------------------------------------------

def _remove(app, client, world, player_id, action=None):
    body = {"coachId": world["coach_id"], "playerId": player_id}
    if action is not None:
        body["action"] = action
    return client.post("/api/app/remove_player", json=body, headers=_headers(app, world["coach_user_id"]))


def _placeholder(app, world, name="Ghost Placeholder"):
    from padel_app.services.player_service import add_player_service

    with app.app_context():
        info = add_player_service({"coachId": world["coach_id"], "name": name})
        return info["playerId"], info["userId"]


def _second_coach(app, username="pad274_coach_b"):
    from padel_app.models import Coach, User

    with app.app_context():
        user = User(name="Coach Bea", username=username, password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.commit()
        return user.id, coach.id


def _audit_row(entity, entity_id):
    return db.session.execute(text(
        "SELECT action, actor_user_id, label, details FROM deletion_audit WHERE entity = :e AND entity_id = :i"
    ), {"e": entity, "i": entity_id}).first()


@pytest.mark.parametrize("action", [None, "disconnect"])
def test_disconnecting_keeps_the_students_record_and_history(app, client, world, action):
    # No action is what every client sent before PAD-274, and it is the B-057 path.
    res = _remove(app, client, world, world["student_id"], action)
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert _count("SELECT count(*) FROM players WHERE id = :p", p=world["student_id"]) == 1, \
            "the student's Player record was deleted (B-057)"
        assert _count("SELECT count(*) FROM users WHERE id = :u", u=world["student_user_id"]) == 1
        assert _count("SELECT count(*) FROM presences WHERE player_id = :p", p=world["student_id"]) == 1
        assert _count("SELECT count(*) FROM player_level_history WHERE player_id = :p", p=world["student_id"]) == 1
        # What belonged to the link goes with it: the roster row, that coach's notes and scores.
        assert _count("SELECT count(*) FROM coach_in_player WHERE id = :r", r=world["rel_id"]) == 0
        assert _count("SELECT count(*) FROM coach_player_notes WHERE coach_player_id = :r", r=world["rel_id"]) == 0
        assert _count("SELECT count(*) FROM evaluation_entries WHERE coach_player_id = :r", r=world["rel_id"]) == 0
        row = _audit_row("player", world["student_id"])
        assert row is not None and row.action == "disconnected"
        assert row.actor_user_id == world["coach_user_id"] and row.label == "Rui Student"


def test_a_coach_can_never_delete_a_student_with_an_account(app, client, world):
    res = _remove(app, client, world, world["student_id"], "delete")
    assert res.status_code == 409, res.get_data(as_text=True)
    assert res.get_json()["code"] == "PLAYER_HAS_ACCOUNT"
    with app.app_context():
        # Refused means refused: nothing at all is removed, not even the link.
        assert _count("SELECT count(*) FROM players WHERE id = :p", p=world["student_id"]) == 1
        assert _count("SELECT count(*) FROM users WHERE id = :u", u=world["student_user_id"]) == 1
        assert _count("SELECT count(*) FROM coach_in_player WHERE id = :r", r=world["rel_id"]) == 1
        assert _count("SELECT count(*) FROM coach_player_notes WHERE coach_player_id = :r", r=world["rel_id"]) == 1
        assert _count("SELECT count(*) FROM evaluation_entries WHERE coach_player_id = :r", r=world["rel_id"]) == 1
        assert _audit_row("player", world["student_id"]) is None


@pytest.mark.parametrize("action", [None, "delete"])
def test_a_placeholder_the_coach_created_is_deleted_and_audited(app, client, world, action):
    placeholder_id, placeholder_user_id = _placeholder(app, world)
    res = _remove(app, client, world, placeholder_id, action)
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert _count("SELECT count(*) FROM players WHERE id = :p", p=placeholder_id) == 0
        assert _count("SELECT count(*) FROM users WHERE id = :u", u=placeholder_user_id) == 0
        row = _audit_row("player", placeholder_id)
        assert row is not None and row.action == "deleted"
        assert row.actor_user_id == world["coach_user_id"] and row.label == "Ghost Placeholder"


def test_a_placeholder_another_coach_also_has_is_not_deleted(app, client, world):
    from padel_app.models import Association_CoachPlayer

    placeholder_id, _ = _placeholder(app, world)
    _, other_coach_id = _second_coach(app)
    with app.app_context():
        db.session.add(Association_CoachPlayer(coach_id=other_coach_id, player_id=placeholder_id))
        db.session.commit()
    res = _remove(app, client, world, placeholder_id, "delete")
    assert res.status_code == 409, res.get_data(as_text=True)
    assert res.get_json()["code"] == "PLAYER_HAS_OTHER_COACHES"
    with app.app_context():
        assert _count("SELECT count(*) FROM players WHERE id = :p", p=placeholder_id) == 1


def test_an_unknown_action_is_refused(app, client, world):
    res = _remove(app, client, world, world["student_id"], "purge")
    assert res.status_code == 400
    with app.app_context():
        assert _count("SELECT count(*) FROM coach_in_player WHERE id = :r", r=world["rel_id"]) == 1


def test_the_removal_impact_names_the_action_and_what_goes(app, client, world):
    headers = _headers(app, world["coach_user_id"])
    res = client.get(f"/api/app/player/{world['student_id']}/removal_impact", headers=headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"action": "disconnect", "notes": 1, "evaluations": 1}

    placeholder_id, _ = _placeholder(app, world)
    res = client.get(f"/api/app/player/{placeholder_id}/removal_impact", headers=headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"action": "delete", "notes": 0, "evaluations": 0, "presences": 0}


def test_the_removal_impact_is_only_for_the_coachs_own_roster(app, client, world):
    url = f"/api/app/player/{world['student_id']}/removal_impact"
    assert client.get(url, headers=_headers(app, world["coach_user_id"])).status_code == 200
    other_user_id, _ = _second_coach(app)
    assert client.get(url, headers=_headers(app, other_user_id)).status_code == 403


# ---------------------------------------------------------------------------
# evaluations.categories — delete shows its impact and is audited
# ---------------------------------------------------------------------------

def test_the_category_impact_counts_scores_and_players(app, client, world):
    res = client.get(f"/api/app/evaluation_category/{world['category_id']}/impact",
                     headers=_headers(app, world["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"name": "Serve", "scores": 1, "players": 1}


def test_deleting_a_category_is_audited_with_what_it_removed(app, client, world):
    res = client.post("/api/app/delete/evaluation_category", json={"id": world["category_id"]},
                      headers=_headers(app, world["coach_user_id"]))
    assert res.status_code == 200
    with app.app_context():
        assert _count("SELECT count(*) FROM evaluation_entries WHERE category_id = :c", c=world["category_id"]) == 0
        row = db.session.execute(text(
            "SELECT label, details FROM deletion_audit WHERE entity = 'evaluation_category' AND entity_id = :c"
        ), {"c": world["category_id"]}).first()
        assert row is not None and row.label == "Serve"
        assert '"scores": 1' in (row.details if isinstance(row.details, str) else __import__("json").dumps(row.details))


# ---------------------------------------------------------------------------
# M15 — the database cascades; the ORM no longer walks every child
# ---------------------------------------------------------------------------

def _statements_during(app, fn):
    statements = []
    with app.app_context():
        engine = db.engine

        def count(conn, cursor, statement, *args):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", count)
        try:
            fn()
        finally:
            event.remove(engine, "before_cursor_execute", count)
    return statements


def test_deleting_a_lesson_does_not_load_every_child(app, world):
    from padel_app.models import Lesson, LessonInstance

    with app.app_context():
        lesson = Lesson.query.get(world["lesson_id"])
        for day in range(1, 4):
            start = lesson.start_datetime + timedelta(days=7 * day)
            db.session.add(LessonInstance(lesson_id=lesson.id, start_datetime=start,
                                          end_datetime=start + timedelta(hours=1), max_players=4,
                                          status="scheduled", notifications_enabled=True))
        db.session.commit()

    def delete():
        lesson = Lesson.query.get(world["lesson_id"])
        db.session.delete(lesson)
        db.session.commit()

    statements = _statements_during(app, delete)
    selects = [s for s in statements if s.lstrip().upper().startswith("SELECT")]
    assert len(selects) <= 2, f"{len(selects)} SELECTs to delete one lesson (the ORM walked the children)"
    with app.app_context():
        assert _count("SELECT count(*) FROM lesson_instances WHERE lesson_id = :l", l=world["lesson_id"]) == 0
        assert _count("SELECT count(*) FROM presences WHERE player_id = :p", p=world["student_id"]) == 0


def test_deleting_future_occurrences_is_one_statement_and_cancels_each_job(app, world):
    from padel_app.models import Lesson, LessonInstance
    from padel_app.services.lesson_service import delete_future_instances

    with app.app_context():
        lesson = Lesson.query.get(world["lesson_id"])
        future = []
        for day in range(1, 4):
            start = datetime.utcnow() + timedelta(days=day)
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                                  end_datetime=start + timedelta(hours=1), max_players=4,
                                  status="scheduled", notifications_enabled=True)
            db.session.add(inst)
            future.append(inst)
        db.session.commit()
        future_ids = sorted(i.id for i in future)

    with patch("padel_app.scheduler._maybe_cancel_instance") as cancel:
        def run():
            delete_future_instances(Lesson.query.get(world["lesson_id"]), datetime.utcnow())
        statements = _statements_during(app, run)
    deletes = [s for s in statements if s.lstrip().upper().startswith("DELETE FROM LESSON_INSTANCES")]
    assert len(deletes) == 1, f"{len(deletes)} DELETE statements for three occurrences"
    assert sorted(c.args[0] for c in cancel.call_args_list) == future_ids
    with app.app_context():
        # The past occurrence (with the student's presence) is untouched.
        assert _count("SELECT count(*) FROM lesson_instances WHERE lesson_id = :l", l=world["lesson_id"]) == 1
        assert _count("SELECT count(*) FROM presences WHERE player_id = :p", p=world["student_id"]) == 1


def test_deleting_an_image_never_deletes_its_owner(app):
    from padel_app.model import Image, Imageable

    with app.app_context():
        owner = Imageable()
        db.session.add(owner)
        db.session.flush()
        image = Image(object_key="pad274/key.png", imageable_id=owner.imageable_id)
        db.session.add(image)
        db.session.commit()
        owner_id = owner.imageable_id
        db.session.delete(image)
        db.session.commit()
        assert _count("SELECT count(*) FROM imageables WHERE imageable_id = :i", i=owner_id) == 1


# ---------------------------------------------------------------------------
# players.remove rule 5 (coordinator decision): a placeholder is a player who
# never activated AND has no password, whatever the username. The roster says
# which records the coach can delete, and both apps read that field.
# ---------------------------------------------------------------------------

def _roster_player(app, world, name, *, username, password, status):
    from padel_app.models import Association_CoachPlayer, Player, User

    with app.app_context():
        user = User(name=name, username=username, password=password, status=status)
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=world["coach_id"], player_id=player.id))
        db.session.commit()
        return player.id, user.id


def test_a_legacy_stub_with_a_chosen_username_is_a_placeholder_and_is_deleted(app, client, world):
    # Coach-created before PAD-105: never activated, no password, a hand-picked username.
    stub_id, stub_user_id = _roster_player(app, world, "Legacy Stub", username="legacy-stub", password=None, status="inactive")
    headers = _headers(app, world["coach_user_id"])
    impact = client.get(f"/api/app/player/{stub_id}/removal_impact", headers=headers)
    assert impact.status_code == 200 and impact.get_json()["action"] == "delete"
    res = _remove(app, client, world, stub_id, "delete")
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert _count("SELECT count(*) FROM players WHERE id = :p", p=stub_id) == 0
        assert _count("SELECT count(*) FROM users WHERE id = :u", u=stub_user_id) == 0


def test_an_inactive_user_with_a_password_has_an_account_and_is_not_deleted(app, client, world):
    # Registered (a password is set) but not yet activated: that is an account.
    pid, uid = _roster_player(app, world, "Half Registered", username="half-registered", password="hash", status="inactive")
    res = _remove(app, client, world, pid, "delete")
    assert res.status_code == 409 and res.get_json()["code"] == "PLAYER_HAS_ACCOUNT"
    with app.app_context():
        assert _count("SELECT count(*) FROM players WHERE id = :p", p=pid) == 1


def test_the_roster_says_which_records_the_coach_can_delete(app, client, world):
    stub_id, _ = _roster_player(app, world, "Legacy Stub", username="legacy-stub", password=None, status="inactive")
    half_id, _ = _roster_player(app, world, "Half Registered", username="half-registered", password="hash", status="inactive")
    gone_id, _ = _roster_player(app, world, "Deleted user", username="deleted-account", password=None, status="disabled")
    placeholder_id, _ = _placeholder(app, world)
    res = client.get("/api/app/coach_players", headers=_headers(app, world["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    data = res.get_json()
    rows = data if isinstance(data, list) else data["items"]
    deletable = {int(r["playerId"]): r.get("deletable") for r in rows}
    assert deletable[stub_id] is True
    assert deletable[placeholder_id] is True
    assert deletable[world["student_id"]] is False
    assert deletable[half_id] is False
    # A deleted account is off the roster altogether (PAD-268), and it had an
    # account, so a delete is still refused.
    assert gone_id not in deletable
    res = _remove(app, client, world, gone_id, "delete")
    assert res.status_code == 409 and res.get_json()["code"] == "PLAYER_HAS_ACCOUNT"
