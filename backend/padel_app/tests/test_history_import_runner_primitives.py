"""History import, runner extension: the primitives the history apply is built on.

`import.onboarding-runner` rule 22 (a quiet materialisation and enrolment: only the occurrence and its
roster rows are written) and `import.revert` rule 5 (a run lists the occurrences it created and a revert
deletes exactly those). The history apply itself (rules 15 to 29) is not built here.

All names are invented.
"""
import json
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad827_onboarding_runner import (
    COACH_NAME, ONBOARDING_ID, _apply, _file, _monday, _seed, _write,
)

# Tables whose rows would show a student was contacted or a seat was opened (rule 22).
SIDE_EFFECT_MODELS = ("NotificationEvent", "Vacancy", "WaitingListEntry", "ReminderAttempt",
                      "EngineSession", "EngineInvitation", "EngineEffect")


def _roster_class(app, tmp_path):
    """The roster run of the 827 fixture: "Segunda 07:00" with two players, weekly on a future Monday."""
    from padel_app.models import Lesson

    ids = _seed(app)
    result = _apply(app, _write(tmp_path, _file(ids)), ids["database"])
    assert result.exit_code == 0, result.output
    with app.app_context():
        lesson = Lesson.query.filter_by(title="Segunda 07:00").one()
        return {**ids, "lesson_id": lesson.id, "monday": _monday()}


def _side_effect_rows():
    from padel_app import models

    return {name: getattr(models, name).query.count() for name in SIDE_EFFECT_MODELS}


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-27")
def test_a_quiet_materialisation_writes_only_the_occurrence_and_its_roster_rows(app, tmp_path, monkeypatch):
    """[IMPORT-ONBOARDING-RUNNER-27] (the materialise and enrol part of rule 22; the full apply is not built).

    A past Monday of the class: the instance and one row per roster student exist, unvalidated; no reminder
    job, engine adoption, waiting-list fan-out, vacancy work or message was started, and no side-effect
    table grew. The control (not quiet) starts the same work, so the guards bind.
    """
    from padel_app import scheduler
    from padel_app.models import Lesson, LessonInstance, Presence
    from padel_app.services import engine_switch, lesson_service, notification_service, system_messages

    ids = _roster_class(app, tmp_path)
    called = []
    monkeypatch.setattr(scheduler, "_maybe_schedule_instance", lambda *a, **k: called.append("reminder jobs"))
    monkeypatch.setattr(scheduler, "arm_ask_for_student", lambda *a, **k: called.append("ask for student"))
    monkeypatch.setattr(engine_switch, "on_occurrence_created", lambda *a, **k: called.append("engine adoption"))
    monkeypatch.setattr(notification_service, "_sync_standing_entries_for_new_instance",
                        lambda *a, **k: called.append("waiting list"))
    monkeypatch.setattr(system_messages, "notify_student_added_to_class", lambda *a, **k: called.append("message"))

    past = ids["monday"] - timedelta(weeks=9)
    with app.app_context():
        before = _side_effect_rows()
        lesson = db.session.get(Lesson, ids["lesson_id"])
        instance = lesson_service.get_or_materialize_instance(lesson, past, quiet=True)
        assert instance.start_datetime.date() == past
        rows = Presence.query.filter_by(lesson_instance_id=instance.id).all()
        assert len(rows) == 2
        assert all(r.enrolment_source == "roster" and not r.validated and r.status is None for r in rows)
        assert called == []
        assert _side_effect_rows() == before

        # Control: the ordinary path on another date does the work the quiet one skipped.
        other = lesson_service.get_or_materialize_instance(lesson, past + timedelta(weeks=1))
        assert other.id != instance.id
        assert "reminder jobs" in called and "engine adoption" in called and "waiting list" in called
        assert LessonInstance.query.filter_by(lesson_id=lesson.id).count() == 2


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-27")
def test_a_quiet_enrolment_of_a_guest_writes_only_the_row(app, tmp_path, monkeypatch):
    """[IMPORT-ONBOARDING-RUNNER-27] A guest (a student off the class's roster) is enrolled with source
    `import`, validated, through `enrol`, and starts no reminder, vacancy or message."""
    from padel_app import scheduler
    from padel_app.models import Lesson, Player, Presence, User
    from padel_app.services import lesson_service

    ids = _roster_class(app, tmp_path)
    called = []
    monkeypatch.setattr(scheduler, "arm_ask_for_student", lambda *a, **k: called.append("ask for student"))
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        guest = Player.query.join(User, Player.user_id == User.id).filter(User.name == "Bruno Faria").one()  # on the other class, not this one
        instance = lesson_service.get_or_materialize_instance(
            lesson, ids["monday"] - timedelta(weeks=9), quiet=True)
        before = _side_effect_rows()
        lesson_service.enrol(guest.id, instance, "import", validated=True, new_engine=True)
        row = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=guest.id).one()
        assert (row.enrolment_source, row.validated) == ("import", True)
        assert called == [] and _side_effect_rows() == before


@pytest.mark.criterion("IMPORT-REVERT-2")
def test_revert_deletes_the_recorded_instances_and_presences_and_nothing_else(app, tmp_path):
    """[IMPORT-REVERT-2] Instances 31 and 32 and their recorded presences go; instance 33 and its
    unrecorded presence stay."""
    from padel_app.models import Coach, Lesson, LessonInstance, Presence
    from padel_app.models.bulk_import import BulkImport
    from padel_app.services import lesson_service
    from padel_app.services.import_service import revert_import

    ids = _roster_class(app, tmp_path)
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        first, second, third = (
            lesson_service.get_or_materialize_instance(lesson, ids["monday"] - timedelta(weeks=w), quiet=True)
            for w in (9, 8, 7)
        )
        recorded = [p.id for inst in (first, second)
                    for p in Presence.query.filter_by(lesson_instance_id=inst.id)]
        kept_presences = [p.id for p in Presence.query.filter_by(lesson_instance_id=third.id)]
        record = BulkImport(
            coach_id=ids["coach_id"], filename="onboarding:2026_11_19_history", status="active",
            summary=json.dumps({}),
            record_ids=json.dumps({"lesson_instances": [first.id, second.id], "presences": recorded}),
        )
        db.session.add(record)
        db.session.commit()
        kept_instance, gone = third.id, [first.id, second.id]

        result = revert_import(record.id, db.session.get(Coach, ids["coach_id"]))

        assert result["status"] == "reverted"
        assert result["deleted"]["lesson_instances"] == 2 and result["deleted"]["presences"] == 4
        assert LessonInstance.query.filter(LessonInstance.id.in_(gone)).count() == 0
        assert Presence.query.filter(Presence.id.in_(recorded)).count() == 0
        assert db.session.get(LessonInstance, kept_instance) is not None
        assert sorted(p.id for p in Presence.query.filter_by(lesson_instance_id=kept_instance)) == sorted(kept_presences)
        # the roster run's own rows are untouched
        assert db.session.get(Lesson, ids["lesson_id"]) is not None
        assert BulkImport.query.filter_by(filename=f"onboarding:{ONBOARDING_ID}").one().status == "active"
        assert COACH_NAME  # (invented coach of the 827 fixture)
