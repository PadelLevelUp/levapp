"""History import, runner extension: the apply, its proof and its revert (rules 19 to 30).

Drives the real CLI on the criteria's fixture (see test_history_import_dry_run): "Segunda 18:00" (Monday, 60 min)
and "Quinta 19:00" (Thursday, 90 min), both starting in November, and the history window 2026-08-31..2026-11-13.

All names are invented.
"""
import datetime
import json

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_history_import_dry_run import HISTORY_ID, _dry, _history, _roster_run, _written
from padel_app.tests.test_history_import_runner_primitives import SIDE_EFFECT_MODELS, _side_effect_rows
from padel_app.tests.test_pad827_onboarding_runner import ONBOARDING_ID, _apply, _revert, _write


def _run(app, tmp_path, ids, data, name="history.json"):
    return _apply(app, _write(tmp_path, data, name), ids["database"])


def _history_row(app):
    from padel_app.models.bulk_import import BulkImport

    with app.app_context():
        row = BulkImport.query.filter_by(filename=f"onboarding:{HISTORY_ID}").one_or_none()
        return None if row is None else {"id": row.id, "status": row.status, "summary": json.loads(row.summary),
                                         "record_ids": json.loads(row.record_ids)}


def _lesson(title):
    from padel_app.models import Lesson

    return Lesson.query.filter_by(title=title).one()


def _presence(title, day, student):
    from padel_app.models import LessonInstance, Player, Presence, User

    instance = LessonInstance.query.filter_by(lesson_id=_lesson(title).id, original_lesson_occurence_date=day).one()
    return Presence.query.join(Player, Player.id == Presence.player_id).join(User, User.id == Player.user_id).filter(
        Presence.lesson_instance_id == instance.id, User.name == student).one()


def _starts():
    return {title: _lesson(title).start_datetime for title in ("Segunda 18:00", "Quinta 19:00")}


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-24")
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-25")
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-26")
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-27")
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-29")
def test_the_apply_moves_the_starts_writes_the_marks_and_proves_the_numbers(app, tmp_path, monkeypatch):
    """[IMPORT-ONBOARDING-RUNNER-24] [IMPORT-ONBOARDING-RUNNER-25] [IMPORT-ONBOARDING-RUNNER-26]
    [IMPORT-ONBOARDING-RUNNER-27] [IMPORT-ONBOARDING-RUNNER-29]"""
    from padel_app import scheduler
    from padel_app.models import Association_PlayerLesson, Lesson, LessonInstance, Presence
    from padel_app.services import engine_switch, notification_service, system_messages

    ids = _roster_run(app, tmp_path)
    called = []
    for module, name in ((scheduler, "_maybe_schedule_instance"), (scheduler, "arm_ask_for_student"),
                         (engine_switch, "on_occurrence_created"), (system_messages, "notify_student_added_to_class"),
                         (notification_service, "_sync_standing_entries_for_new_instance")):
        monkeypatch.setattr(module, name, lambda *a, _n=name, **k: called.append(_n))
    with app.app_context():
        side_effects = _side_effect_rows()

    result = _run(app, tmp_path, ids, _history(ids))

    assert result.exit_code == 0, result.output
    assert "Expected vs app" in result.output and "Δ" not in result.output.split("Expected vs app")[1]
    with app.app_context():
        # 24: the series start moved back, in place, to the first date on or after `from`
        assert _starts() == {"Segunda 18:00": datetime.datetime(2026, 8, 31, 18, 0),
                             "Quinta 19:00": datetime.datetime(2026, 9, 3, 19, 0)}
        assert Lesson.query.filter_by(title="Segunda 18:00").count() == 1
        for title, first in (("Segunda 18:00", datetime.date(2026, 8, 31)), ("Quinta 19:00", datetime.date(2026, 9, 3))):
            days = sorted(i.original_lesson_occurence_date for i in LessonInstance.query.filter_by(lesson_id=_lesson(title).id))
            assert days == [first + datetime.timedelta(weeks=w) for w in range(11)]
        # 25: the file's marks, everyone else present, nothing pending
        ana = _presence("Segunda 18:00", datetime.date(2026, 9, 7), "Ana Exemplo")
        assert (ana.status, ana.justification, ana.validated, ana.recorded_by, ana.note) == (
            "absent", "justified", True, "import", "Lesão")
        rui = _presence("Segunda 18:00", datetime.date(2026, 9, 7), "Rui Ficticio")
        assert (rui.status, rui.validated, rui.recorded_by) == ("present", True, "import")
        lia_guest = _presence("Segunda 18:00", datetime.date(2026, 9, 21), "Lia Inventada")
        assert (lia_guest.status, lia_guest.enrolment_source, lia_guest.validated) == ("present", "import", True)
        assert Association_PlayerLesson.query.filter_by(lesson_id=_lesson("Segunda 18:00").id).count() == 2
        coach_absence = _presence("Quinta 19:00", datetime.date(2026, 9, 3), "Lia Inventada")
        assert (coach_absence.status, coach_absence.justification) == ("absent", "justified")
        assert Presence.query.filter(Presence.validated.is_(False)).count() == 0
        # 26: seven one-hour one-off lessons of one student on the first day
        adjustments = Lesson.query.filter_by(title="Ajuste manual (histórico)").order_by(Lesson.start_datetime).all()
        assert [(a.start_datetime.strftime("%H:%M"), a.end_datetime.strftime("%H:%M")) for a in adjustments] == [
            (f"{h:02d}:00", f"{h + 1:02d}:00") for h in range(9, 16)]
        assert all(not a.is_recurring and a.start_datetime.date() == datetime.date(2026, 8, 31) for a in adjustments)
        for a in adjustments:
            row = Presence.query.join(LessonInstance).filter(LessonInstance.lesson_id == a.id).one()
            assert (row.status, row.justification, row.validated) == ("absent", "justified", True)
            assert [r.player.user.name for r in a.players_relations] == ["Eva Teste"]
        # 27: nothing was started
        assert called == [] and _side_effect_rows() == side_effects
    run = _history_row(app)
    assert run["summary"]["Series moved"] == 2 and run["summary"]["Lessons"] == 7 and run["summary"]["Instances"] == 29
    assert set(run["record_ids"]) >= {"lesson_instances", "presences", "lessons", "player_lessons", "series_starts",
                                      "_onboarding"}
    assert run["record_ids"]["_onboarding"]["history"] is True


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-31")
def test_revert_puts_everything_back(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-31]"""
    from padel_app.models import BulkImport, Lesson, LessonInstance, Presence

    ids = _roster_run(app, tmp_path)
    starts, rows = None, None
    with app.app_context():
        starts = _starts()
    result = _run(app, tmp_path, ids, _history(ids))
    assert result.exit_code == 0, result.output

    reverted = _revert(app, HISTORY_ID, ids["database"])

    assert reverted.exit_code == 0, reverted.output
    with app.app_context():
        assert _starts() == starts
        assert LessonInstance.query.count() == 0 and Presence.query.count() == 0
        assert Lesson.query.count() == ids["classes"]
        assert BulkImport.query.filter_by(filename=f"onboarding:{HISTORY_ID}").one().status == "reverted"
        assert BulkImport.query.filter_by(filename=f"onboarding:{ONBOARDING_ID}").one().status == "active"
    again = _run(app, tmp_path, ids, _history(ids))
    assert again.exit_code == 1 and "already applied" in again.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-28")
def test_the_cut_off_and_existing_rows_are_kept_and_put_back_on_revert(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-28] The coach marked Ana on Monday 2026-11-09; Thursday 2026-11-12 already exists
    unmarked. The apply stops before the mark, marks the existing Thursday and records its previous values;
    the revert puts them back."""
    from padel_app.models import LessonInstance, Player, Presence, User
    from padel_app.services import lesson_service

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        monday = lesson_service.get_or_materialize_instance(_lesson("Segunda 18:00"), datetime.date(2026, 11, 9), quiet=True)
        ana = Player.query.join(User, User.id == Player.user_id).filter(User.name == "Ana Exemplo").one()
        mark = Presence.query.filter_by(lesson_instance_id=monday.id, player_id=ana.id).one()
        mark.status, mark.validated, mark.recorded_by = "present", True, "coach"
        lesson_service.get_or_materialize_instance(_lesson("Quinta 19:00"), datetime.date(2026, 11, 12), quiet=True)
        db.session.commit()
    data = _history(ids)
    data["expects"].update(instances=2, coach_marks=1)

    result = _run(app, tmp_path, ids, data)

    assert result.exit_code == 0, result.output
    with app.app_context():
        days = sorted(i.original_lesson_occurence_date for i in LessonInstance.query.filter_by(
            lesson_id=_lesson("Segunda 18:00").id))
        assert days[0] == datetime.date(2026, 8, 31) and days[-1] == datetime.date(2026, 11, 9)
        assert datetime.date(2026, 11, 2) in days
        kept = _presence("Segunda 18:00", datetime.date(2026, 11, 9), "Ana Exemplo")
        assert (kept.status, kept.recorded_by) == ("present", "coach")
        thursday = _presence("Quinta 19:00", datetime.date(2026, 11, 12), "Lia Inventada")
        assert (thursday.status, thursday.validated, thursday.recorded_by) == ("present", True, "import")
    run = _history_row(app)
    assert len(run["record_ids"]["presence_before"]) == 2 and thursday.id not in run["record_ids"]["presences"]

    assert _revert(app, HISTORY_ID, ids["database"]).exit_code == 0
    with app.app_context():
        assert LessonInstance.query.count() == 2  # the coach's Monday and the Thursday that existed
        back = _presence("Quinta 19:00", datetime.date(2026, 11, 12), "Lia Inventada")
        assert (back.status, back.validated, back.recorded_by) == (None, False, None)
        assert _presence("Segunda 18:00", datetime.date(2026, 11, 9), "Ana Exemplo").recorded_by == "coach"


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-32")
def test_a_revert_that_would_lose_the_coachs_work_is_refused(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-32]"""
    from padel_app.models import Lesson

    ids = _roster_run(app, tmp_path)
    assert _run(app, tmp_path, ids, _history(ids)).exit_code == 0
    before = _written(app)

    # the roster run cannot be reverted under the history run
    blocked = _revert(app, ONBOARDING_ID, ids["database"])
    assert blocked.exit_code == 1 and HISTORY_ID in blocked.output
    assert _written(app) == before

    with app.app_context():
        mark = _presence("Segunda 18:00", datetime.date(2026, 9, 7), "Ana Exemplo")
        mark.recorded_by = "coach"
        db.session.commit()
    refused = _revert(app, HISTORY_ID, ids["database"])
    assert refused.exit_code == 1 and "the coach has since marked 1 rows" in refused.output
    assert _written(app) == before

    with app.app_context():
        _presence("Segunda 18:00", datetime.date(2026, 9, 7), "Ana Exemplo").recorded_by = "import"
        lesson = Lesson.query.filter_by(title="Quinta 19:00").one()
        lesson.start_datetime = lesson.start_datetime + datetime.timedelta(days=7)
        db.session.commit()
    refused = _revert(app, HISTORY_ID, ids["database"])
    assert refused.exit_code == 1 and "no longer starts on 2026-09-03" in refused.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-33")
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-35")
def test_the_season_is_created_recorded_and_deleted_on_revert(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-33] [IMPORT-ONBOARDING-RUNNER-35]"""
    from padel_app.models.coach_seasons import CoachSeason

    ids = _roster_run(app, tmp_path)
    season = {"start_date": "2026-08-31", "end_date": "2027-07-31", "label": "2026/2027"}
    assert _run(app, tmp_path, ids, _history(ids, season=season)).exit_code == 0
    with app.app_context():
        found = CoachSeason.query.filter_by(coach_id=ids["coach_id"]).one()
        assert (found.start_day, found.start_month, found.end_day, found.end_month, found.label) == (
            31, 8, 31, 7, "2026/2027")
    run = _history_row(app)
    assert run["record_ids"]["coach_seasons"] == [found.id] and run["summary"]["Seasons"] == 1

    with app.app_context():  # the coach edits it in settings: the revert is refused
        CoachSeason.query.filter_by(coach_id=ids["coach_id"]).one().end_day = 30
        db.session.commit()
    refused = _revert(app, HISTORY_ID, ids["database"])
    assert refused.exit_code == 1 and "changed the season" in refused.output
    with app.app_context():
        CoachSeason.query.filter_by(coach_id=ids["coach_id"]).one().end_day = 31
        db.session.commit()
    assert _revert(app, HISTORY_ID, ids["database"]).exit_code == 0
    with app.app_context():
        assert CoachSeason.query.filter_by(coach_id=ids["coach_id"]).count() == 0


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-38")
def test_the_students_the_run_creates_are_recorded_and_removed_on_revert(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-38]"""
    from padel_app.models import Association_PlayerLesson, Presence

    ids = _roster_run(app, tmp_path)
    data = _history(
        ids,
        absences=[{"date": "2026-09-17", "student": "Ines Nova", "type": "justified", "minutes": 90},
                  {"date": "2026-09-14", "student": "Ines Nova", "type": "unjustified", "minutes": 60}],
        guests=[{"date": "2026-09-07", "start_time": "18:00", "student": "Gil Novo", "minutes": 60},
                {"date": "2026-09-10", "start_time": "19:00", "student": "Gil Novo", "minutes": 90}],
        adjustments=[], sheet_totals=[])
    data["players"] = [{"name": "Gil Novo"}, {"name": "Ines Nova"}]
    data["expects"]["players"] = 5

    result = _run(app, tmp_path, ids, data)

    assert result.exit_code == 0, result.output
    run = _history_row(app)
    assert len(run["record_ids"]["players"]) == 2 and run["summary"]["Players"] == 2
    with app.app_context():
        from padel_app.models import Association_CoachPlayer

        assert Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"]).count() == 7
        assert Association_PlayerLesson.query.count() == 4  # nobody joined a class: the roster run's four only
        ines = _presence("Quinta 19:00", datetime.date(2026, 9, 17), "Ines Nova")
        assert (ines.status, ines.justification) == ("absent", "justified")
        assert _presence("Segunda 18:00", datetime.date(2026, 9, 7), "Gil Novo").status == "present"

    assert _revert(app, HISTORY_ID, ids["database"]).exit_code == 0
    with app.app_context():
        assert Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"]).count() == 5
        assert Presence.query.count() == 0


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-29")
def test_a_difference_between_the_file_and_the_app_fails_the_run_and_leaves_nothing(app, tmp_path, monkeypatch):
    """[IMPORT-ONBOARDING-RUNNER-29] The proof reads a different number: the run fails as rule 11, everything is put
    back (starts, season, players, rows, the history row)."""
    from padel_app.services import onboarding_history

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        starts = _starts()
    before = _written(app)
    real = onboarding_history.app_numbers

    def wrong(*args, **kwargs):
        numbers = real(*args, **kwargs)
        numbers["ana exemplo"] = dict(numbers["ana exemplo"], justified=99)
        return numbers

    monkeypatch.setattr(onboarding_history, "app_numbers", wrong)
    data = _history(ids, season={"start_date": "2026-08-31", "end_date": "2027-07-31"})
    data["players"] = [{"name": "Gil Novo"}]
    data["expects"]["players"] = 5

    result = _run(app, tmp_path, ids, data)

    assert result.exit_code == 1
    assert "Ana Exemplo: justified is 99 in the app, the file's rows give 2" in result.output
    assert _history_row(app) is None and _written(app) == before
    with app.app_context():
        from padel_app.models.coach_seasons import CoachSeason

        assert _starts() == starts and CoachSeason.query.count() == 0

    monkeypatch.setattr(onboarding_history, "app_numbers", real)
    assert _run(app, tmp_path, ids, _history(ids)).exit_code == 0  # the id is still unused


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-30")
def test_a_second_history_run_is_refused_while_one_is_active(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-30]"""
    ids = _roster_run(app, tmp_path)
    assert _run(app, tmp_path, ids, _history(ids)).exit_code == 0
    second = _history(ids)
    second["id"] = "2026_11_20_rui_history"
    second["expects"].update(classes=9, instances=29)  # the first run's 7 adjustment lessons and 29 occurrences

    result = _dry(app, tmp_path, second)

    assert result.exit_code == 1
    assert f"the coach already has an active history run (onboarding:{HISTORY_ID}" in result.output
