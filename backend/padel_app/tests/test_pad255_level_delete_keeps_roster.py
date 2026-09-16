"""levels.coach-levels rule 11 (PAD-255, B-035, audit C2 + H7) — deleting a
level unassigns it; it never deletes the players who held it.

Before this, `CoachLevel.coach_player_relations` carried
`cascade="all, delete-orphan"`, so `POST /delete/coach_level` deleted every
roster row at that level and, through the roster row's own cascades, every
note and evaluation of those players. With a lesson, instance or vacancy at
that level the same click 500'd instead (NO ACTION foreign keys).
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _seed_world(app):
    """A coach, a level, a player AT that level with a note and an evaluation,
    plus a lesson, an instance and a vacancy that all reference the level."""
    from padel_app.models import (
        Association_CoachPlayer,
        Club,
        CoachLevel,
        CoachPlayerNote,
        EvaluationCategory,
        EvaluationEntry,
        Lesson,
        LessonInstance,
        PlayerLevelHistory,
        Vacancy,
    )

    ids = _seed_coach_and_student(app)
    with app.app_context():
        club = Club(name="Level Club", description="", location="Lisboa")
        db.session.add(club)
        db.session.flush()

        level = CoachLevel(coach_id=ids["coach_id"], label="Beginner", code="B1", display_order=1)
        keep = CoachLevel(coach_id=ids["coach_id"], label="Advanced", code="A1", display_order=2)
        db.session.add_all([level, keep])
        db.session.flush()

        rel = Association_CoachPlayer(
            coach_id=ids["coach_id"], player_id=ids["student_id"], level_id=level.id, side="left", notes="lefty"
        )
        db.session.add(rel)
        db.session.flush()
        db.session.add(CoachPlayerNote(coach_player_id=rel.id, type="strength", text="volley"))
        category = EvaluationCategory(coach_id=ids["coach_id"], name="Serve", scale_min=1, scale_max=10)
        db.session.add(category)
        db.session.flush()
        db.session.add(EvaluationEntry(coach_player_id=rel.id, category_id=category.id, score=7))
        db.session.add(
            PlayerLevelHistory(coach_id=ids["coach_id"], player_id=ids["student_id"], level_id=level.id)
        )

        start = datetime.utcnow() + timedelta(days=2)
        lesson = Lesson(
            title="Beginners", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, type="academy", max_players=4, color="#000000", status="active",
            club_id=club.id, default_level_id=level.id,
        )
        db.session.add(lesson)
        db.session.flush()
        instance = LessonInstance(
            lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
            max_players=4, status="scheduled", level_id=level.id, notifications_enabled=True,
        )
        db.session.add(instance)
        db.session.flush()
        vacancy = Vacancy(
            lesson_instance_id=instance.id, coach_id=ids["coach_id"], original_player_id=None,
            side="left", level_id=level.id, status="open",
        )
        db.session.add(vacancy)
        db.session.commit()
        ids.update(
            level_id=level.id, keep_level_id=keep.id, rel_id=rel.id, lesson_id=lesson.id,
            instance_id=instance.id, vacancy_id=vacancy.id,
        )
    return ids


def test_deleting_a_level_keeps_the_roster_notes_and_evaluations(app, client):
    from padel_app.models import (
        Association_CoachPlayer, CoachLevel, CoachPlayerNote, EvaluationEntry, PlayerLevelHistory,
    )

    ids = _seed_world(app)
    res = client.post(
        "/api/app/delete/coach_level", json={"id": ids["level_id"]}, headers=_headers(app, ids["coach_user_id"])
    )
    assert res.status_code == 200, res.get_data(as_text=True)

    with app.app_context():
        assert CoachLevel.query.get(ids["level_id"]) is None
        assert CoachLevel.query.get(ids["keep_level_id"]) is not None
        rel = Association_CoachPlayer.query.get(ids["rel_id"])
        assert rel is not None, "the roster row was deleted with the level (C2)"
        assert rel.level_id is None
        assert rel.side == "left" and rel.notes == "lefty"
        assert CoachPlayerNote.query.filter_by(coach_player_id=rel.id).count() == 1
        assert EvaluationEntry.query.filter_by(coach_player_id=rel.id).count() == 1
        # History rows of a deleted level go with it (NOT NULL, CASCADE) — the
        # ladder no longer has that rung. Documented in rule 11.
        assert PlayerLevelHistory.query.filter_by(level_id=ids["level_id"]).count() == 0


def test_deleting_a_level_unassigns_classes_instances_and_vacancies(app, client):
    from padel_app.models import Lesson, LessonInstance, Vacancy

    ids = _seed_world(app)
    res = client.post(
        "/api/app/delete/coach_level", json={"id": ids["level_id"]}, headers=_headers(app, ids["coach_user_id"])
    )
    assert res.status_code == 200, res.get_data(as_text=True)

    with app.app_context():
        assert Lesson.query.get(ids["lesson_id"]).default_level_id is None
        assert LessonInstance.query.get(ids["instance_id"]).level_id is None
        assert Vacancy.query.get(ids["vacancy_id"]).level_id is None


def test_the_service_unassigns_before_it_deletes(app):
    """Route-independent: the same guarantee holds for any caller of the service."""
    from padel_app.models import Association_CoachPlayer, Coach, Lesson
    from padel_app.services.coach_service import delete_coach_level_service

    ids = _seed_world(app)
    with app.app_context():
        delete_coach_level_service(Coach.query.get(ids["coach_id"]), ids["level_id"])
        assert Association_CoachPlayer.query.get(ids["rel_id"]).level_id is None
        assert Lesson.query.get(ids["lesson_id"]).default_level_id is None


def test_the_model_no_longer_cascades_into_the_roster():
    """The ORM cascade was the mechanism; it must not come back."""
    from sqlalchemy import inspect

    from padel_app.models import Association_CoachPlayer, CoachLevel, CoachInvitation, PlayerInvitation
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.vacancy import Vacancy

    rel = inspect(CoachLevel).relationships["coach_player_relations"]
    assert "delete" not in rel.cascade and "delete-orphan" not in rel.cascade

    for model, column in (
        (Association_CoachPlayer, "level_id"),
        (Lesson, "default_level_id"),
        (LessonInstance, "level_id"),
        (Vacancy, "level_id"),
        (CoachInvitation, "invited_by_coach_id"),
        (PlayerInvitation, "invited_by_coach_id"),
    ):
        fk = next(iter(model.__table__.c[column].foreign_keys))
        assert fk.ondelete == "SET NULL", f"{model.__tablename__}.{column} must SET NULL on delete"


def test_migration_is_guarded_and_rewrites_the_six_foreign_keys():
    import importlib.util
    import pathlib

    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    matches = list(versions.glob("*pad255_level_delete_set_null*.py"))
    assert len(matches) == 1, matches
    src = matches[0].read_text()
    assert "get_foreign_keys" in src and "SET NULL" in src
    spec = importlib.util.spec_from_file_location("pad255_mig", matches[0])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.down_revision == "ad97ec649746"
    assert set(mod.TARGETS) == {
        ("coach_in_player", "level_id", "coach_levels"),
        ("lessons", "default_level_id", "coach_levels"),
        ("lesson_instances", "level_id", "coach_levels"),
        ("vacancies", "level_id", "coach_levels"),
        ("coach_invitations", "invited_by_coach_id", "coaches"),
        ("player_invitations", "invited_by_coach_id", "coaches"),
    }
