"""
PAD-632 — backend/scripts/prod_reset_activity.sql clears production ACTIVITY before real use.

Covered spec: .specflow/specs/delivery/production-activity-reset.spec.md (every criterion).

The script is psql (meta-commands, one transaction), so these cells run it through `psql` against
the migrated scratch Postgres database the suite builds. They run only on the postgres backend
(CI's "pytest (postgres, real migrations)" job, which has psql); the sqlite job skips them.
"""
import os
import shutil
import subprocess
from datetime import timedelta
from pathlib import Path

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed, utcnow_naive

POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres" or shutil.which("psql") is None,
    reason="runs the psql script against the postgres test database",
)
pytestmark = POSTGRES_ONLY

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "prod_reset_activity.sql"

ACTIVITY = ("messages", "conversations", "conversation_participants", "reminder_attempts",
            "notification_events", "vacancies", "presences", "player_level_history", "apscheduler_jobs")


@pytest.fixture(autouse=True)
def _no_scheduler_table_left_behind(app):
    """The suite's schema has no apscheduler_jobs table (APScheduler creates it at start); these
    cells create one, so they drop it again for the tests that follow."""
    yield
    with app.app_context():
        db.session.execute(db.text("DROP TABLE IF EXISTS apscheduler_jobs"))
        db.session.execute(db.text("DROP TRIGGER IF EXISTS pad632_tamper ON presences"))
        db.session.execute(db.text("DROP FUNCTION IF EXISTS pad632_tamper()"))
        db.session.commit()


def _instance(ids, coach_id, *, days=0, hours=0, wall=False):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance

    # Class times are the club's wall clock (R-023); `wall` places the class on it exactly.
    from padel_app.utils.dates import utc_to_wall_naive

    now = utc_to_wall_naive(utcnow_naive()) if wall else utcnow_naive()
    start = now + timedelta(days=days, hours=hours)
    inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                          end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=inst.id))
    db.session.flush()
    return inst.id


def _activity(ids, coach_id, coach_user_id, player_id, level_id, *, past_instance, future_instance):
    """One of everything the script deletes (or keeps), for one coach and student."""
    from padel_app.models import Conversation, Message, NotificationEvent, Player, ReminderAttempt
    from padel_app.models.player_level_history import PlayerLevelHistory
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy

    player_user_id = db.session.get(Player, player_id).user_id
    conv = Conversation.get_or_insert([coach_user_id, player_user_id])
    msg = Message(conversation_id=conv.id, sender_id=coach_user_id, text="hello")
    db.session.add(msg)
    db.session.flush()
    conv.last_message_id = msg.id
    past = Presence(lesson_instance_id=past_instance, player_id=player_id, status="present", validated=True)
    future = Presence(lesson_instance_id=future_instance, player_id=player_id)
    db.session.add_all([past, future])
    db.session.flush()
    db.session.add(ReminderAttempt(lesson_instance_id=future_instance, player_id=player_id,
                                   presence_id=future.id, number=1, message_id=msg.id, sent_at=utcnow_naive()))
    db.session.add(NotificationEvent(coach_id=coach_id, lesson_instance_id=future_instance, player_id=player_id,
                                     type="auto", status="sent", message_id=msg.id))
    db.session.add(Vacancy(lesson_instance_id=future_instance, coach_id=coach_id, status="open", level_id=level_id))
    db.session.add(PlayerLevelHistory(coach_id=coach_id, player_id=player_id, level_id=level_id))
    db.session.flush()
    return {"conversation": conv.id, "future_presence": future.id, "past_presence": past.id}


def _world(app, *, spare_username="applereview.coach"):
    """A real coach with a student, and the App Store demo coach with its own student."""
    from padel_app.models import Coach, User

    ids = _seed(app)
    with app.app_context():
        level = ids["level_ids"]["5"]
        student = _add_student(ids["coach_id"], "real-student", level)
        demo_user = User(name="Demo", username=spare_username, password="x", status="active")
        db.session.add(demo_user)
        db.session.flush()
        demo = Coach(user_id=demo_user.id)
        db.session.add(demo)
        db.session.flush()
        demo_student = _add_student(demo.id, "demo-student", level)

        real = _activity(ids, ids["coach_id"], ids["coach_user_id"], student, level,
                         past_instance=_instance(ids, ids["coach_id"], days=-7),
                         future_instance=ids["instance_id"])
        demo_future = _instance(ids, demo.id, days=4)
        kept = _activity(ids, demo.id, demo_user.id, demo_student, level,
                         past_instance=_instance(ids, demo.id, days=-7), future_instance=demo_future)

        db.session.execute(db.text(
            "CREATE TABLE IF NOT EXISTS apscheduler_jobs (id varchar(191) PRIMARY KEY, "
            "next_run_time double precision, job_state bytea NOT NULL)"))
        db.session.execute(db.text("DELETE FROM apscheduler_jobs"))
        lesson, inst, date = ids["lesson_id"], ids["instance_id"], "2026-12-01"
        gone = [f"reminder_{inst}_retry_1700000000",                     # follow-ups of deleted attempts
                f"reminder_lesson_{lesson}_{date}_retry_1700000000",
                f"ask_{inst}_{student}_1700000000"]
        kept_jobs = [f"reminder_{inst}", f"reminder_lesson_{lesson}_{date}",  # fire as before
                     f"invite_start_{inst}", f"invite_start_lesson_{lesson}_{date}", f"pastdue_{inst}",
                     "process_batches", "extend_schedule_window", "prune_delivery_incidents",
                     f"reminder_{demo_future}_retry_1700000000",            # the demo coach's
                     f"ask_{inst}_{demo_student}_1700000000"]               # a spared student's own pass
        for job in gone + kept_jobs:
            db.session.execute(db.text("INSERT INTO apscheduler_jobs VALUES (:id, 1, ''::bytea)"), {"id": job})
        db.session.commit()
        world = {"ids": ids, "demo_coach": demo.id, "student": student, "real": real, "kept": kept,
                 "demo_student": demo_student, "gone_jobs": gone, "kept_jobs": kept_jobs,
                 "uri": app.config["SQLALCHEMY_DATABASE_URI"]}
        db.session.remove()
    return world


def _run(world, *, apply):
    return subprocess.run(
        ["psql", world["uri"], "-v", "ON_ERROR_STOP=1", "-v", f"apply={1 if apply else 0}",
         "-v", f"spare_coach_id={world['demo_coach']}", "-f", str(SCRIPT)],
        capture_output=True, text=True, timeout=120,
    )


def _count(app, table, where="TRUE", **params):
    with app.app_context():
        return db.session.execute(db.text(f"SELECT count(*) FROM {table} WHERE {where}"), params).scalar()


def _counts(app):
    return {t: _count(app, t) for t in ACTIVITY}


def test_the_dry_run_prints_the_counts_and_changes_nothing(app):
    world = _world(app)
    before = _counts(app)

    out = _run(world, apply=False)

    assert out.returncode == 0, out.stderr
    assert "DRY RUN: rolled back" in out.stdout
    assert "rows per table" in out.stdout and "messages" in out.stdout
    assert _counts(app) == before


def test_apply_clears_the_activity_and_spares_the_demo_coach(app):
    world = _world(app)

    out = _run(world, apply=True)

    assert out.returncode == 0, out.stderr
    assert "APPLIED: committed." in out.stdout
    kept = world["kept"]
    # Every table is down to the demo coach's rows: one conversation, its message, its two
    # presences, its attempt, event, vacancy and level-history row.
    assert _count(app, "conversations") == 1
    assert _count(app, "conversations", "id = :i", i=kept["conversation"]) == 1
    assert _count(app, "messages") == 1
    assert _count(app, "reminder_attempts") == 1
    assert _count(app, "notification_events") == 1
    assert _count(app, "vacancies") == 1
    assert _count(app, "player_level_history") == 1
    assert _count(app, "presences", "id = :i", i=kept["past_presence"]) == 1


def test_a_future_enrolment_stays_and_attendance_history_goes(app):
    """A future occurrence's presence IS its enrolment (PAD-259)."""
    world = _world(app)

    assert _run(world, apply=True).returncode == 0
    real = world["real"]
    assert _count(app, "presences", "id = :i", i=real["future_presence"]) == 1
    assert _count(app, "presences", "id = :i", i=real["past_presence"]) == 0


def test_current_levels_do_not_move(app):
    world = _world(app)
    with app.app_context():
        before = db.session.execute(db.text(
            "SELECT coach_id, player_id, level_id FROM coach_in_player ORDER BY id")).all()

    assert _run(world, apply=True).returncode == 0
    with app.app_context():
        after = db.session.execute(db.text(
            "SELECT coach_id, player_id, level_id FROM coach_in_player ORDER BY id")).all()
    assert after == before and all(level is not None for _c, _p, level in after)


def test_only_the_follow_ups_of_deleted_reminders_leave_the_scheduler(app):
    """Every job family the scheduler writes: the follow-ups of deleted attempts go; the rest stays."""
    world = _world(app)

    assert _run(world, apply=True).returncode == 0
    with app.app_context():
        jobs = {r[0] for r in db.session.execute(db.text("SELECT id FROM apscheduler_jobs"))}
    assert jobs == set(world["kept_jobs"])


def test_a_class_running_during_the_reset_keeps_its_roster(app):
    world = _world(app)
    with app.app_context():
        from padel_app.models.presences import Presence

        running = _instance(world["ids"], world["ids"]["coach_id"], hours=-0.5, wall=True)  # started 30 min ago, ends in 30
        row = Presence(lesson_instance_id=running, player_id=world["student"])
        db.session.add(row)
        db.session.commit()
        row_id = row.id
        db.session.remove()

    assert _run(world, apply=True).returncode == 0
    assert _count(app, "presences", "id = :i", i=row_id) == 1


def test_a_demo_student_who_also_trains_with_a_real_coach_keeps_their_invitation(app):
    """The real coach's vacancy would CASCADE the spared event away."""
    world = _world(app)
    ids = world["ids"]
    with app.app_context():
        from padel_app.models import NotificationEvent
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
        from padel_app.models.vacancy import Vacancy

        db.session.add(Association_CoachPlayer(coach_id=ids["coach_id"], player_id=world["demo_student"]))
        vacancy = Vacancy(lesson_instance_id=ids["instance_id"], coach_id=ids["coach_id"], status="open",
                          level_id=ids["level_ids"]["5"])
        db.session.add(vacancy)
        db.session.flush()
        event = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=ids["instance_id"],
                                  player_id=world["demo_student"], type="auto", status="sent", vacancy_id=vacancy.id)
        db.session.add(event)
        db.session.commit()
        event_id, vacancy_id = event.id, vacancy.id
        db.session.remove()

    assert _run(world, apply=True).returncode == 0
    assert _count(app, "notification_events", "id = :i", i=event_id) == 1
    assert _count(app, "vacancies", "id = :i", i=vacancy_id) == 1


def test_a_guard_that_fails_rolls_everything_back(app):
    """A write the script did not intend (here a trigger that clears a student's level when a presence
    goes) trips the guard: apply exits with an error and nothing is deleted."""
    world = _world(app)
    with app.app_context():
        db.session.execute(db.text(
            "CREATE FUNCTION pad632_tamper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
            "UPDATE coach_in_player SET level_id = NULL WHERE player_id = OLD.player_id; RETURN OLD; END $$"))
        db.session.execute(db.text(
            "CREATE TRIGGER pad632_tamper AFTER DELETE ON presences FOR EACH ROW EXECUTE FUNCTION pad632_tamper()"))
        db.session.commit()
        db.session.remove()
    before = _counts(app)

    out = _run(world, apply=True)

    assert out.returncode != 0
    assert "a guard failed" in out.stderr
    assert _counts(app) == before


def test_a_spare_coach_that_is_not_the_reviewer_account_stops_the_script(app):
    """A renumbered database must never spare the wrong coach: the script refuses to run."""
    world = _world(app, spare_username="real.coach")
    before = _counts(app)

    out = _run(world, apply=True)

    assert out.returncode != 0
    assert "refusing to run" in out.stderr
    assert _counts(app) == before


def test_a_second_run_deletes_nothing(app):
    world = _world(app)
    assert _run(world, apply=True).returncode == 0
    after_first = _counts(app)

    assert _run(world, apply=True).returncode == 0
    assert _counts(app) == after_first
