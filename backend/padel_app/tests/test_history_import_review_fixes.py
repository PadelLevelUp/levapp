"""History import, runner extension: the review's findings (rules 20, 25, 26, 27, 28).

A revert never deletes what the run did not write; a coach with a class that follows the season end refuses a
season; a row validated before `recorded_by` existed is the coach's; a failure removes an occurrence whose id
was not yet recorded; the recurrence rule text comes back. All names are invented.
"""
import datetime

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_history_import_apply import _history_row, _lesson, _presence, _run, _starts
from padel_app.tests.test_history_import_dry_run import HISTORY_ID, _dry, _history, _roster_run, _written
from padel_app.tests.test_pad827_onboarding_runner import _apply, _revert, _write


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-40")
def test_a_revert_that_would_delete_a_row_the_run_did_not_write_is_refused(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-40] A walk-in the coach adds to a run occurrence, then a row added to an adjustment lesson."""
    from padel_app.models import LessonInstance, Lesson, Player, Presence, User

    ids = _roster_run(app, tmp_path)
    assert _run(app, tmp_path, ids, _history(ids)).exit_code == 0
    before = _written(app)

    with app.app_context():
        instance = LessonInstance.query.filter_by(
            lesson_id=_lesson("Segunda 18:00").id, original_lesson_occurence_date=datetime.date(2026, 9, 14)).one()
        eva = Player.query.join(User, User.id == Player.user_id).filter(User.name == "Eva Teste").one()
        walk_in = Presence(player_id=eva.id, lesson_instance_id=instance.id, enrolment_source="walk_in",
                           status="present", validated=True, recorded_by="coach")
        db.session.add(walk_in)
        db.session.commit()
        walk_in_id = walk_in.id

    refused = _revert(app, HISTORY_ID, ids["database"])

    assert refused.exit_code == 1, refused.output
    assert "were not written by the run" in refused.output and str(walk_in_id) in refused.output
    assert "2026-09-14" in refused.output
    assert _written(app) == dict(before, presences=before["presences"] + 1)

    with app.app_context():  # take it away; now one on an adjustment lesson, whatever its recorded_by
        db.session.delete(db.session.get(Presence, walk_in_id))
        adjustment = Lesson.query.filter_by(title="Ajuste manual (histórico)").first()
        instance = LessonInstance.query.filter_by(lesson_id=adjustment.id).one()
        ana = Player.query.join(User, User.id == Player.user_id).filter(User.name == "Ana Exemplo").one()
        db.session.add(Presence(player_id=ana.id, lesson_instance_id=instance.id, enrolment_source="coach"))
        db.session.commit()
        adjustment_instance_id, ana_id = instance.id, ana.id
    again = _revert(app, HISTORY_ID, ids["database"])
    assert again.exit_code == 1 and "were not written by the run" in again.output

    with app.app_context():
        extra = Presence.query.filter_by(lesson_instance_id=adjustment_instance_id, player_id=ana_id).one()
        db.session.delete(extra)
        db.session.commit()
    assert _revert(app, HISTORY_ID, ids["database"]).exit_code == 0


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-41")
def test_a_coach_with_a_class_that_follows_the_season_end_refuses_a_season(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-41]"""
    ids = _roster_run(app, tmp_path)
    with app.app_context():
        lesson = _lesson("Quinta 19:00")
        lesson.recurs_until_season_end = True
        db.session.commit()
    season = {"start_date": "2026-08-31", "end_date": "2027-07-31"}
    before = _written(app)

    refused = _dry(app, tmp_path, _history(ids, season=season))
    assert refused.exit_code == 1 and "classes that follow the season end (Quinta 19:00)" in refused.output
    applied = _run(app, tmp_path, ids, _history(ids, season=season))
    assert applied.exit_code == 1 and _written(app) == before

    assert _dry(app, tmp_path, _history(ids)).exit_code == 0


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-42")
def test_a_row_validated_before_recorded_by_existed_is_the_coachs(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-42] validated, recorded_by NULL, on Monday 2026-11-09."""
    from padel_app.models import LessonInstance, Presence
    from padel_app.services import lesson_service

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        instance = lesson_service.get_or_materialize_instance(_lesson("Segunda 18:00"), datetime.date(2026, 11, 9), quiet=True)
        row = Presence.query.filter_by(lesson_instance_id=instance.id).order_by(Presence.id).first()
        row.status, row.validated, row.recorded_by = "present", True, None
        db.session.commit()
        row_id = row.id

    wrong = _history(ids)
    wrong["expects"].update(instances=1, coach_marks=0)
    refused = _dry(app, tmp_path, wrong)
    assert refused.exit_code == 1 and "the file expects 0 coach marks, found 1" in refused.output

    data = _history(ids)
    data["expects"].update(instances=1, coach_marks=1)
    result = _run(app, tmp_path, ids, data)

    assert result.exit_code == 0, result.output
    with app.app_context():
        days = sorted(i.original_lesson_occurence_date for i in LessonInstance.query.filter_by(
            lesson_id=_lesson("Segunda 18:00").id))
        assert days[-1] == datetime.date(2026, 11, 9) and days[-2] == datetime.date(2026, 11, 2)
        kept = db.session.get(Presence, row_id)
        assert (kept.status, kept.validated, kept.recorded_by) == ("present", True, None)
        assert row_id not in _history_row(app)["record_ids"]["presence_before"]


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-43")
def test_a_failure_after_an_occurrence_is_made_and_before_it_is_recorded_leaves_nothing(app, tmp_path, monkeypatch):
    """[IMPORT-ONBOARDING-RUNNER-43] The materialising call commits, then the run fails before it records the id."""
    from padel_app.models import LessonInstance, Presence
    from padel_app.services import lesson_service, onboarding_history

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        starts = _starts()
    before = _written(app)
    real_record = onboarding_history._record

    def failing(run, record_ids, **kinds):
        if kinds.get("lesson_instances") and len(record_ids.get("lesson_instances", [])) >= 2:
            raise RuntimeError("the connection dropped")
        return real_record(run, record_ids, **kinds)

    monkeypatch.setattr(onboarding_history, "_record", failing)
    result = _run(app, tmp_path, ids, _history(ids))

    assert result.exit_code == 1 and "the connection dropped" in result.output
    assert _history_row(app) is None and _written(app) == before
    with app.app_context():
        assert LessonInstance.query.count() == 0 and Presence.query.count() == 0 and _starts() == starts

    monkeypatch.setattr(onboarding_history, "_record", real_record)
    assert _run(app, tmp_path, ids, _history(ids)).exit_code == 0


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-43")
def test_an_occurrence_someone_else_made_is_not_recorded_as_the_runs_and_the_rule_text_comes_back(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-43] `created` comes from the materialising call; the recurrence rule text is restored."""
    from padel_app.models import LessonInstance
    from padel_app.services import lesson_service

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        lesson = _lesson("Segunda 18:00")
        assert lesson_service.get_or_materialize_instance(lesson, datetime.date(2026, 11, 2), quiet=True)._materialised_now is True
        assert lesson_service.get_or_materialize_instance(lesson, datetime.date(2026, 11, 2), quiet=True)._materialised_now is False
        original = {l.title: l.recurrence_rule for l in (lesson, _lesson("Quinta 19:00"))}
        LessonInstance.query.filter_by(lesson_id=lesson.id).delete()
        db.session.commit()
        odd = '{"daysOfWeek":   [1],  "frequency": "weekly"}'
        lesson.recurrence_rule = odd
        db.session.commit()
        original["Segunda 18:00"] = odd

    assert _run(app, tmp_path, ids, _history(ids)).exit_code == 0
    assert _revert(app, HISTORY_ID, ids["database"]).exit_code == 0
    with app.app_context():
        assert {t: _lesson(t).recurrence_rule for t in original} == original
