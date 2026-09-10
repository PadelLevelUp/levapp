"""PAD-261 / B-051 — one winner per vacancy, placement and materialisation
decided under a row lock.

SQLite ignores SELECT ... FOR UPDATE, so these tests pin the behaviour the
lock protects and record which rows the code asks to lock, in which order.
The race itself is proven with two threads on a scratch Postgres (red on the
old code, green on the new; see the PR).
"""
from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Query

from padel_app.sql_db import db
from padel_app.tests.test_notification_integration import (
    PATCHES,
    _create_coach,
    _create_coach_player,
    _create_instance,
    _create_level,
    _create_player,
    _create_user,
    _seed_notification_config,
)
from padel_app.tests.test_pad85_duplicate_materialization import recurring_with_coach  # noqa: F401 (fixture)


@pytest.fixture
def locks(monkeypatch):
    """The entity of every SELECT ... FOR UPDATE the code asks for, in order."""
    seen = []
    original = Query.with_for_update

    def spy(self, *args, **kwargs):
        seen.append(self.column_descriptions[0]["entity"].__name__)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Query, "with_for_update", spy)
    return seen


def _world(app, *, max_players=1, students=2):
    """A coach, `students` roster students at the class level, one class with no one enrolled."""
    with app.app_context():
        coach = _create_coach(_create_user("Coach", "w_coach"))
        level = _create_level(coach)
        players = []
        for i in range(students):
            user = _create_user(f"Student {i}", f"w_student{i}")
            player = _create_player(user)
            _create_coach_player(coach, player, level)
            players.append((player.id, user.id))
        instance = _create_instance(coach, level, enrolled_players=[], max_players=max_players)
        _seed_notification_config(coach.id, auto_notify=True)
        db.session.commit()
        return coach.id, instance.id, players


def _enrolled(instance_id):
    from padel_app.models import Association_PlayerLessonInstance

    return {r.player_id for r in Association_PlayerLessonInstance.query.filter_by(lesson_instance_id=instance_id)}


# ── invitations rule 10 ──────────────────────────────────────────────────────

def test_accept_locks_the_vacancy_then_the_class_before_enrolling(app, locks):
    from padel_app.models import LessonInstance, NotificationEvent
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations

    coach_id, instance_id, players = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            trigger_invitations(db.session.get(LessonInstance, instance_id), coach_id)
        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, status="sent").first()
        assert event is not None and event.vacancy_id is not None
        user_id = next(u for p, u in players if p == event.player_id)
        locks.clear()
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_notification(event.id, "yes", user_id)
        assert event.player_id in _enrolled(instance_id)
    assert "Vacancy" in locks and "LessonInstance" in locks, locks
    assert locks.index("Vacancy") < locks.index("LessonInstance"), "vacancy first, then the class"


def test_a_departing_player_gets_one_open_vacancy(app, locks):
    from padel_app.models import LessonInstance, Vacancy
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    coach_id, instance_id, players = _world(app, students=1)
    ((player_id, _),) = players
    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        first = _create_vacancy_for_absent_player(instance, coach_id, player_id)
        second = _create_vacancy_for_absent_player(instance, coach_id, player_id)
        assert second.id == first.id
        assert Vacancy.query.filter_by(
            lesson_instance_id=instance_id, original_player_id=player_id, status="open"
        ).count() == 1
    assert "LessonInstance" in locks


def test_structural_vacancies_are_sized_under_the_class_lock(app, locks):
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import _create_structural_vacancies

    coach_id, instance_id, _ = _world(app, max_players=2, students=0)
    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        assert len(_create_structural_vacancies(instance, coach_id)) == 2
        assert _create_structural_vacancies(instance, coach_id) == []
    assert "LessonInstance" in locks


# ── waiting-list rule 12 ─────────────────────────────────────────────────────

def _waiting(app, coach_id, instance_id, player_id):
    from padel_app.models import Vacancy, WaitingListEntry

    with app.app_context():
        vacancy = Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open")
        entry = WaitingListEntry(lesson_instance_id=instance_id, player_id=player_id, coach_id=coach_id, is_active=True)
        db.session.add_all([vacancy, entry])
        db.session.commit()
        return vacancy.id, entry.id


def _fill(app, coach_id, instance_id, vacancy_id, entry_id):
    from padel_app.models import LessonInstance, Vacancy, WaitingListEntry
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import _fill_from_waiting_list

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            return _fill_from_waiting_list(
                db.session.get(WaitingListEntry, entry_id),
                db.session.get(Vacancy, vacancy_id),
                db.session.get(LessonInstance, instance_id),
                coach_id,
                NotificationConfig.query.filter_by(coach_id=coach_id).first(),
            )


def test_a_placement_never_takes_a_vacancy_someone_else_already_won(app, locks):
    from padel_app.models import Vacancy, WaitingListEntry

    coach_id, instance_id, players = _world(app, students=1)
    ((player_id, _),) = players
    vacancy_id, entry_id = _waiting(app, coach_id, instance_id, player_id)
    with app.app_context():
        db.session.get(Vacancy, vacancy_id).status = "filled"  # another path won it
        db.session.commit()

    assert _fill(app, coach_id, instance_id, vacancy_id, entry_id) is False
    with app.app_context():
        assert player_id not in _enrolled(instance_id)
        assert db.session.get(WaitingListEntry, entry_id).is_active is True
    assert "Vacancy" in locks and "LessonInstance" in locks


def test_a_placement_never_overfills_a_full_class(app):
    from padel_app.models import Association_PlayerLessonInstance, WaitingListEntry

    coach_id, instance_id, players = _world(app, max_players=1, students=2)
    (waiting_id, _), (other_id, _) = players
    vacancy_id, entry_id = _waiting(app, coach_id, instance_id, waiting_id)
    with app.app_context():
        # The last seat is taken by someone else; the vacancy row still says open.
        db.session.add(Association_PlayerLessonInstance(player_id=other_id, lesson_instance_id=instance_id))
        db.session.commit()

    assert _fill(app, coach_id, instance_id, vacancy_id, entry_id) is False
    with app.app_context():
        assert _enrolled(instance_id) == {other_id}
        assert db.session.get(WaitingListEntry, entry_id).is_active is True


def test_a_placement_still_happens_when_there_is_room(app):
    coach_id, instance_id, players = _world(app, students=1)
    ((player_id, _),) = players
    vacancy_id, entry_id = _waiting(app, coach_id, instance_id, player_id)
    assert _fill(app, coach_id, instance_id, vacancy_id, entry_id) is True
    with app.app_context():
        assert player_id in _enrolled(instance_id)


# ── instances rule 8 ─────────────────────────────────────────────────────────

def test_materialising_locks_the_parent_lesson_and_yields_one_instance(app, recurring_with_coach, locks):
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    _, lesson_id, start = recurring_with_coach
    occurrence = (start + timedelta(weeks=1)).date()
    with app.app_context():
        lesson = db.session.get(Lesson, lesson_id)
        first = get_or_materialize_instance(lesson, occurrence)
        second = get_or_materialize_instance(db.session.get(Lesson, lesson_id), occurrence)
        assert first.id == second.id
    assert "Lesson" in locks
