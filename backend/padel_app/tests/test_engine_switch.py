"""notifications.config rule 18 (PAD-917): which engine a session runs on.

A coach is on ``old`` until switched. At the switch, the coach's sessions whose invitation window had
not opened go to the new engine (an ``engine_sessions`` row, adopted by ``engine_switch``), and a
session already inviting drains on the old engine until it starts. The old engine's start
(``trigger_invitations``) skips a new-engine session; its other entry points are swap step 6.
"""
import importlib.util
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed

#: NOW is 18:00 on START's day: with invitations 24 h before, START's window opened yesterday and
#: one three days later has not opened.
LATER = START + timedelta(days=3)
#: Silence the old engine's sends. PAD-914 moved them to ``system_messages``; this branch's base may
#: predate it, so that module's targets are patched only where it exists.
QUIET = tuple(f"padel_app.services.{module}.{name}"
              for module in ("notification_service", "system_messages")
              if importlib.util.find_spec(f"padel_app.services.{module}")
              for name in ("publish", "send_push_notification"))


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        patches = [patch(target) for target in QUIET]
        for p in patches:
            p.start()
        yield
        for p in patches:
            p.stop()


def _classes(app):
    """Two occurrences of one coach, not yet on any engine (``_seed`` adopts every session it makes;
    here the switch does), the coach's automatic invitations on, 24 h before."""
    from padel_app.models import EngineSession
    from padel_app.models.notification_config import NotificationConfig

    store, (opened, not_opened), pids = _seed(app, starts=(START, LATER))
    coach_id = store.coach_of(opened)
    EngineSession.query.delete()
    for session in (opened, not_opened):          # both existed before the (pinned) switch
        _instance(session).created_at = NOW - timedelta(days=1)
    config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True)
    config.invitation_start_timing = {"type": "hours_before", "value": 24}
    db.session.add(config)
    db.session.commit()
    return store, coach_id, opened, not_opened


def _instance(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session))


def _old_vacancies(session):
    from padel_app.models.vacancy import Vacancy

    return Vacancy.query.filter_by(lesson_instance_id=int(session)).count()


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_a_switched_coach_drains_old_sessions_and_starts_new_ones_on_the_new_engine(app):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_switch import adopt_due, engine_for, switch_coach
    from padel_app.services.notification_service import trigger_invitations

    store, coach_id, opened, not_opened = _classes(app)
    switch_coach(coach_id, now=NOW)

    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    assert (config.engine_version, config.engine_switched_at) == ("new", NOW)
    assert store.sessions() == (not_opened,)
    assert (engine_for(_instance(opened)), engine_for(_instance(not_opened))) == ("old", "new")
    assert {p.placed_how for p in _instance(not_opened).presences} == {"regular"}   # its regular, placed

    trigger_invitations(_instance(not_opened), coach_id, now=NOW)       # the old start skips it
    assert _old_vacancies(not_opened) == 0
    trigger_invitations(_instance(opened), coach_id, now=NOW)           # and drains the other
    assert _old_vacancies(opened) > 0

    # Adopted is for good: a later config change does not move it back, and adopting again is a no-op.
    config.invitation_start_timing = {"type": "hours_before", "value": 24 * 7}
    db.session.commit()
    assert engine_for(_instance(not_opened)) == "new"
    assert adopt_due(now=NOW + timedelta(hours=1)) == []
    assert store.sessions() == (not_opened,)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-61")
def test_a_session_the_old_engine_already_started_stays_on_the_old_engine(app):
    """A session the old engine has invited for (a coach's "invite now", before its window) is
    inviting: it drains on the old engine whatever its window says."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.services.notification_service import trigger_invitations

    store, coach_id, _, not_opened = _classes(app)
    assert trigger_invitations(_instance(not_opened), coach_id, now=NOW)           # "invite now": sent
    assert Vacancy.query.filter(Vacancy.lesson_instance_id == int(not_opened),
                                Vacancy.last_activity_at.isnot(None)).count() > 0
    switch_coach(coach_id, now=NOW)
    assert engine_for(_instance(not_opened)) == "old"
    assert store.sessions() == ()


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_an_occurrence_created_after_the_switch_is_adopted_when_due(app):
    """A switched coach's occurrence the app materialises later is adopted by the next pass."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_switch import adopt_due, engine_for, switch_coach

    store, coach_id, _, not_opened = _classes(app)
    switch_coach(coach_id, now=NOW)
    first = _instance(not_opened)
    later = LessonInstance(lesson_id=first.lesson_id, start_datetime=LATER + timedelta(days=7),
                           end_datetime=LATER + timedelta(days=7, hours=1), max_players=4, status="scheduled",
                           level_id=first.level_id)
    db.session.add(later)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=later.id))
    db.session.commit()
    assert engine_for(later) == "old"                    # no row yet: the engine_sessions row is the truth
    assert adopt_due(now=NOW + timedelta(minutes=1)) == [str(later.id)]
    assert engine_for(later) == "new"
    assert store.sessions() == (not_opened, str(later.id))


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-51")
def test_a_coach_not_switched_never_reaches_the_new_engine(app):
    from padel_app.services.engine_switch import adopt_due, engine_for
    from padel_app.services.notification_service import trigger_invitations

    store, coach_id, opened, not_opened = _classes(app)
    assert adopt_due(now=NOW) == []
    assert store.sessions() == ()
    assert {engine_for(_instance(s)) for s in (opened, not_opened)} == {"old"}
    trigger_invitations(_instance(not_opened), coach_id, now=NOW)
    assert _old_vacancies(not_opened) > 0


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-63")
def test_an_occurrence_that_first_exists_after_the_switch_runs_on_the_new_engine(app):
    """Invitations open at creation (``none``): the occurrence that existed at the switch drains on the
    old engine; one materialised after it is on the new engine, its row written as it is created."""
    from padel_app.models import EngineSession
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    store, coach_id, _, existing = _classes(app)
    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    config.invitation_start_timing = {"type": "none"}
    db.session.commit()
    first = _instance(existing)

    switch_coach(coach_id, now=NOW)
    assert engine_for(first) == "old"

    lesson = db.session.get(Lesson, first.lesson_id)
    db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
    db.session.commit()
    later = get_or_materialize_instance(lesson, (LATER + timedelta(days=7)).date())
    assert db.session.get(EngineSession, later.id) is not None        # written by the creating path
    assert engine_for(later) == "new"
    assert store.sessions() == (str(later.id),)
    # The materialiser enrolled the roster first; the store's placement is the same row, placed.
    assert [(p.enrolment_source, p.placed_how) for p in later.presences] == [("roster", "regular")]


# --- #959 review: one engine per session, always (rule 18) -------------------------------------


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_a_session_left_on_the_old_engine_stays_there_after_a_config_change(app):
    """Assigned once: a session that drained at the switch is not moved by a later window change, so
    it is never on neither engine."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_switch import adopt_due, engine_for, switch_coach
    from padel_app.services.notification_service import trigger_invitations

    store, coach_id, opened, not_opened = _classes(app)
    switch_coach(coach_id, now=NOW)
    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    config.invitation_start_timing = {"type": "hours_before", "value": 1}   # opened's window: not yet
    db.session.commit()
    assert engine_for(_instance(opened)) == "old"
    assert adopt_due(now=NOW + timedelta(minutes=1)) == []
    trigger_invitations(_instance(opened), coach_id, now=NOW)
    assert _old_vacancies(opened) > 0
    assert store.sessions() == (not_opened,)


def _second_coach(engine_version, switched_at=None):
    from padel_app.models import Coach, User
    from padel_app.models.notification_config import NotificationConfig

    user = User(name="B", username="coach_b917", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    db.session.add(coach)
    db.session.flush()
    db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True, engine_version=engine_version,
                                      engine_switched_at=switched_at))
    return coach.id


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-51")
def test_a_co_coached_class_follows_its_primary_coach(app):
    """The old engine runs a class on its primary coach (the first assigned); the switch reads the same
    coach, so a class whose primary coach is on old never reaches the new engine, whatever the others."""
    from padel_app.models import EngineSession
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.services.engine_switch import engine_for, on_occurrence_created
    from padel_app.services.notification_service import trigger_invitations

    store, primary, _, not_opened = _classes(app)
    inst = _instance(not_opened)
    db.session.add(Association_CoachLessonInstance(
        coach_id=_second_coach("new", NOW - timedelta(days=2)), lesson_instance_id=inst.id))
    db.session.commit()

    assert on_occurrence_created(inst, now=NOW) is False
    assert db.session.get(EngineSession, inst.id) is None and engine_for(inst) == "old"
    trigger_invitations(inst, primary, now=NOW)
    assert _old_vacancies(not_opened) > 0
    assert store.sessions() == ()


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_an_absence_on_a_new_engine_session_opens_no_old_vacancy(app):
    """The old tick only old-engine sessions: a regular's No on an adopted session opens no vacancy,
    so the old batch sweep has nothing to start."""
    from padel_app.services.engine_switch import switch_coach
    from padel_app.services.notification_service import (
        _ensure_vacancy_for_player,
        _trigger_vacancy_for_player,
        process_invitation_batches,
    )

    store, coach_id, _, not_opened = _classes(app)
    switch_coach(coach_id, now=NOW)
    inst = _instance(not_opened)
    regular = inst.presences[0].player_id
    _trigger_vacancy_for_player(inst, coach_id, regular)
    assert _ensure_vacancy_for_player(inst, coach_id, regular) is None
    assert _old_vacancies(not_opened) == 0
    assert process_invitation_batches(now=LATER - timedelta(hours=12)) == 0


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-61")
def test_an_old_vacancy_that_never_invited_does_not_hold_the_session(app):
    """A vacancy an early absence opened before the window, which sent nothing, is not "started": the
    switch adopts the session and closes that vacancy so the old tick cannot start it."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.services.notification_service import _ensure_vacancy_for_player

    store, coach_id, _, not_opened = _classes(app)
    inst = _instance(not_opened)
    _ensure_vacancy_for_player(inst, coach_id, inst.presences[0].player_id)
    db.session.commit()
    assert Vacancy.query.filter_by(lesson_instance_id=inst.id, status="open").count() == 1

    switch_coach(coach_id, now=NOW)
    assert engine_for(inst) == "new"
    assert Vacancy.query.filter_by(lesson_instance_id=inst.id, status="open").count() == 0


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-63")
def test_a_failed_adoption_at_creation_leaves_the_occurrence_on_the_old_engine(app):
    """Creating the occurrence never fails on the switch: a failed adoption is logged, the occurrence
    stays on the old engine until the next adopt_due pass takes it."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lessons import Lesson
    from padel_app.services.engine_switch import adopt_due, engine_for, switch_coach
    from padel_app.services.lesson_service import get_or_materialize_instance

    store, coach_id, _, existing = _classes(app)
    switch_coach(coach_id, now=NOW)
    lesson = db.session.get(Lesson, _instance(existing).lesson_id)
    db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
    db.session.commit()
    with patch("padel_app.services.engine_switch._adopt", side_effect=RuntimeError("boom")):
        later = get_or_materialize_instance(lesson, (LATER + timedelta(days=7)).date())
    assert later.id is not None and engine_for(later) == "old"
    assert adopt_due(now=NOW + timedelta(minutes=1)) == [str(later.id)]
    assert engine_for(later) == "new"
