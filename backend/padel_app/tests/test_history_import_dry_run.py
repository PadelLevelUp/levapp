"""History import, runner extension: every row resolved to a class and the dry run's plan (rules 17, 18, 25, 28, 30).

The dry run reads the coach's classes and roster, resolves each row, prints the plan and the expected-vs-file
table, and writes nothing. Only the dry-run part of each criterion is driven here: the apply is not built yet.

All names are invented. The window is 2026-08-31..2026-11-13, before the real clock's today.
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad827_onboarding_runner import (
    CLUB_NAME, COACH_NAME, ONBOARDING_ID, _apply, _rows, _seed, _write,
)

HISTORY_ID = "2026_11_19_rui_history"


def _roster_run(app, tmp_path, *, thursdays=1, season=False):
    """The roster run of the criteria's fixture: "Segunda 18:00" (60 min, from Monday 2026-11-09) and "Quinta 19:00"
    (90 min, from Thursday 2026-11-12), optionally a second 90-minute Thursday class "Quinta 21:00"."""
    ids = _seed(app, season=season)
    classes = [
        {"title": "Segunda 18:00", "date": "2026-11-09", "start_time": "18:00", "end_time": "19:00", "max_players": 4,
         "until": "2027-07-31", "players": ["Ana Exemplo", "Rui Ficticio"]},
        {"title": "Quinta 19:00", "date": "2026-11-12", "start_time": "19:00", "end_time": "20:30", "max_players": 4,
         "until": "2027-07-31", "players": ["Lia Inventada", "Teo Imaginario"]},
    ]
    if thursdays == 2:
        classes.append({"title": "Quinta 21:00", "date": "2026-11-12", "start_time": "21:00", "end_time": "22:30",
                        "max_players": 4, "until": "2027-07-31", "players": ["Teo Imaginario"]})
    data = {
        "id": ONBOARDING_ID,
        "coach": {"id": ids["coach_id"], "name": COACH_NAME, "club": {"id": ids["club_id"], "name": CLUB_NAME}},
        "expects": {"players": 0, "classes": 0},
        "players": [{"name": n} for n in ("Ana Exemplo", "Rui Ficticio", "Lia Inventada", "Teo Imaginario", "Eva Teste")],
        "classes": classes,
    }
    result = _apply(app, _write(tmp_path, data), ids["database"])
    assert result.exit_code == 0, result.output
    return {**ids, "classes": len(classes)}


def _history(ids, *, classes=2, **history):
    section = {
        "from": "2026-08-31", "through": "2026-11-13",
        "absences": [
            {"date": "2026-09-07", "student": "Ana Exemplo", "type": "justified", "minutes": 60, "note": "Lesão"},
            {"date": "2026-09-14", "student": "Ana Exemplo", "type": "justified", "minutes": 60},
            {"date": "2026-09-03", "student": "Lia Inventada", "type": "coach", "minutes": 90},
            {"date": "2026-09-17", "student": "Teo Imaginario", "type": "unjustified", "minutes": 90},
        ],
        "guests": [
            {"date": "2026-09-10", "start_time": "19:00", "student": "Ana Exemplo", "minutes": 90},
            {"date": "2026-09-21", "start_time": "18:00", "student": "Lia Inventada", "minutes": 60},
            {"date": "2026-09-28", "start_time": "18:00", "student": "Lia Inventada", "minutes": 60},
        ],
        "adjustments": [{"student": "Eva Teste", "minutes": 420, "lesson_minutes": 60, "date": "2026-08-31"}],
        "sheet_totals": [
            {"student": "Ana Exemplo", "justified_minutes": 120, "unjustified_minutes": 0, "guest_minutes": 90},
            {"student": "Lia Inventada", "justified_minutes": 90, "unjustified_minutes": 0, "guest_minutes": 120},
            {"student": "Teo Imaginario", "justified_minutes": 0, "unjustified_minutes": 90, "guest_minutes": 0},
            {"student": "Eva Teste", "justified_minutes": 420, "unjustified_minutes": 0, "guest_minutes": 0},
        ],
    }
    section.update(history)
    return {
        "id": HISTORY_ID,
        "coach": {"id": ids["coach_id"], "name": COACH_NAME, "club": {"id": ids["club_id"], "name": CLUB_NAME}},
        "expects": {"players": 5, "classes": classes, "instances": 0, "coach_marks": 0},
        "players": [], "classes": [], "history": section,
    }


def _dry(app, tmp_path, data):
    return _apply(app, _write(tmp_path, data, "history.json"), dry_run=True)


def _written(app):
    from padel_app.models import BulkImport, LessonInstance, Presence

    with app.app_context():
        return {**_rows(app), "instances": LessonInstance.query.count(), "presences": Presence.query.count(),
                "imports": BulkImport.query.count()}


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-23")
def test_a_dry_run_shows_the_plan_and_the_expected_vs_file_table_and_writes_nothing(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-23] (dry-run part: rule 18)"""
    ids = _roster_run(app, tmp_path)
    before = _written(app)

    result = _dry(app, tmp_path, _history(ids))

    assert result.exit_code == 0, result.output
    out = result.output
    assert "Quinta 19:00: starts 2026-11-12 -> 2026-09-03, 11 occurrences" in out
    assert "Segunda 18:00: starts 2026-11-09 -> 2026-08-31, 11 occurrences" in out
    assert "4 absences, 3 guests, 1 adjustments (7 one-off lessons), 0 excluded" in out
    line = {name: next(l for l in out.splitlines() if l.strip().startswith(name + ":"))
            for name in ("Ana Exemplo", "Lia Inventada", "Teo Imaginario", "Eva Teste")}
    # justified 120 min / guest 90 / balance -30 / owed 1 (2 justified absences - 1 guest presence)
    assert "justified 120/120 ✓ (2)" in line["Ana Exemplo"] and "guest 90/90 ✓ (1)" in line["Ana Exemplo"]
    assert "balance -30, owed 1" in line["Ana Exemplo"]
    assert "balance +30, owed 0" in line["Lia Inventada"]
    assert "unjustified 90/90 ✓ (1)" in line["Teo Imaginario"] and "balance +0, owed 0" in line["Teo Imaginario"]
    assert "justified 420/420 ✓ (7)" in line["Eva Teste"] and "balance -420, owed 7" in line["Eva Teste"]
    assert "Dry run: nothing written." in out
    assert _written(app) == before


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-21")
def test_every_row_that_cannot_be_resolved_is_listed_with_its_reason(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-21] (resolution part: rule 17) Seven problems, all printed, exit code 1."""
    ids = _roster_run(app, tmp_path)
    before = _written(app)
    data = _history(
        ids,
        absences=[
            {"date": "2026-09-08", "student": "Eva Teste", "type": "justified", "minutes": 60},   # no Tuesday class
            {"date": "2026-09-08", "student": "Lia Inventada", "type": "justified", "minutes": 90},  # Lia: no Tuesday
            {"date": "2026-09-14", "student": "Ana Exemplo", "type": "justified", "minutes": 90},   # 60-minute class
            {"date": "2026-09-14", "student": "Nobody Known", "type": "justified", "minutes": 60},  # not on the roster
        ],
        guests=[
            {"date": "2026-09-07", "start_time": "17:00", "student": "Lia Inventada", "minutes": 60},  # no such class
            {"date": "2026-09-07", "start_time": "18:00", "student": "Rui Ficticio", "minutes": 60},   # enrolled there
        ],
        adjustments=[{"student": "Teo Imaginario", "minutes": 420, "date": "2026-08-31"}],  # 420 / 90
        sheet_totals=[],
    )

    result = _dry(app, tmp_path, data)

    assert result.exit_code == 1, result.output
    for problem in ("absences[0]", "the coach has no 60-minute class on Tue", "absences[1]", "is in no class on Tue",
                    "absences[2]", "Segunda 18:00 lasts 60 minutes, the row says 90", "absences[3]", "not on the coach's roster",
                    "guests[0]", "no class on Mon at 17:00", "guests[1]", "on Segunda 18:00's roster today",
                    "adjustments[0]", "do not divide into 90-minute lessons"):
        assert problem in result.output, (problem, result.output)
    assert _written(app) == before


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-22")
def test_a_class_the_student_could_not_be_told_from_is_refused(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-22] Teo is in two 90-minute Thursday classes."""
    ids = _roster_run(app, tmp_path, thursdays=2)
    data = _history(ids, classes=3,
                    absences=[{"date": "2026-09-17", "student": "Teo Imaginario", "type": "unjustified", "minutes": 90}],
                    guests=[], adjustments=[], sheet_totals=[])

    result = _dry(app, tmp_path, data)

    assert result.exit_code == 1, result.output
    assert "absences[0]" in result.output and "two classes that day" in result.output
    assert "Quinta 19:00" in result.output and "Quinta 21:00" in result.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-39")
def test_an_absence_of_a_student_in_no_class_names_its_class_or_is_refused(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-39] Eva is on the roster in no class; two 90-minute Thursday classes exist."""
    ids = _roster_run(app, tmp_path, thursdays=2)
    base = {"date": "2026-09-17", "student": "Eva Teste", "type": "justified", "minutes": 90}

    def run(row):
        data = _history(ids, classes=3, absences=[row], guests=[], adjustments=[], sheet_totals=[])
        return _dry(app, tmp_path, data)

    ambiguous = run(base)
    assert ambiguous.exit_code == 1 and "the coach has several that day" in ambiguous.output
    named = run(dict(base, start_time="21:00"))
    assert named.exit_code == 0, named.output
    assert "1 absences" in named.output
    nothing = run(dict(base, start_time="20:00"))
    assert nothing.exit_code == 1 and "no class starts at 20:00 on Thu" in nothing.output
    short = run(dict(base, date="2026-09-14", minutes=90, start_time="18:00"))  # a Monday: the class is 60 minutes
    assert short.exit_code == 1 and "lasts 60 minutes, the row says 90" in short.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-38")
def test_a_student_the_run_creates_is_in_no_class_and_their_rows_land_on_the_coachs_classes(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-38] (dry-run part) The file's players are created by the apply, so rows resolve to
    them; one already on the roster is refused."""
    ids = _roster_run(app, tmp_path)
    data = _history(
        ids,
        absences=[{"date": "2026-09-17", "student": "Ines Nova", "type": "justified", "minutes": 90},
                  {"date": "2026-09-14", "student": "Ines Nova", "type": "unjustified", "minutes": 60}],
        guests=[{"date": "2026-09-07", "start_time": "18:00", "student": "Gil Novo", "minutes": 60},
                {"date": "2026-09-10", "start_time": "19:00", "student": "Gil Novo", "minutes": 90}],
        adjustments=[], sheet_totals=[])
    data["players"] = [{"name": "Gil Novo"}, {"name": "Ines Nova"}]

    result = _dry(app, tmp_path, data)

    assert result.exit_code == 0, result.output
    assert "2 players to be created, in no class: Gil Novo, Ines Nova" in result.output
    assert "Gil Novo: " in result.output and "Ines Nova: " in result.output
    assert "2 absences, 2 guests" in result.output

    data["players"].append({"name": "ana  exemplo"})
    refused = _dry(app, tmp_path, data)
    assert refused.exit_code == 1 and "is already on the coach's roster" in refused.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-28")
def test_a_coach_made_mark_sets_the_cut_off_and_rows_after_it_are_refused(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-28] (dry-run part: rule 20) The coach marked Ana present on Monday 2026-11-09."""
    from padel_app.models import Lesson, Player, Presence, User
    from padel_app.services import lesson_service
    import datetime

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        lesson = Lesson.query.filter_by(title="Segunda 18:00").one()
        instance = lesson_service.get_or_materialize_instance(lesson, datetime.date(2026, 11, 9), quiet=True)
        ana = Player.query.join(User, Player.user_id == User.id).filter(User.name == "Ana Exemplo").one()
        mark = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=ana.id).one()
        mark.status, mark.validated, mark.recorded_by = "present", True, "coach"
        db.session.commit()
    data = _history(ids)
    data["expects"].update(instances=1, coach_marks=1)

    result = _dry(app, tmp_path, data)

    assert result.exit_code == 0, result.output
    assert "Segunda 18:00: starts 2026-11-09 -> 2026-08-31, 10 occurrences, cut-off 2026-11-08 (first coach mark 2026-11-09)" in result.output

    late = _history(ids, absences=[{"date": "2026-11-09", "student": "Ana Exemplo", "type": "justified", "minutes": 60}],
                    guests=[], adjustments=[], sheet_totals=[])
    late["expects"].update(instances=1, coach_marks=1)
    refused = _dry(app, tmp_path, late)
    assert refused.exit_code == 1 and "after the cut-off 2026-11-08" in refused.output
    assert "first own mark is 2026-11-09" in refused.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-30")
def test_a_changed_starting_state_is_refused(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-30] (dry-run part: rule 25) The coach has one instance; the file says none."""
    from padel_app.models import Lesson
    from padel_app.services import lesson_service
    import datetime

    ids = _roster_run(app, tmp_path)
    with app.app_context():
        lesson = Lesson.query.filter_by(title="Segunda 18:00").one()
        lesson_service.get_or_materialize_instance(lesson, datetime.date(2026, 11, 9), quiet=True)

    result = _dry(app, tmp_path, _history(ids))

    assert result.exit_code == 1
    assert "the file expects 0 instances, found 1" in result.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-33")
def test_the_dry_run_names_the_season_to_be_created(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-33] (dry-run part: rule 28)"""
    ids = _roster_run(app, tmp_path)
    season = {"start_date": "2026-08-31", "end_date": "2027-07-31", "label": "2026/2027"}

    result = _dry(app, tmp_path, _history(ids, season=season))

    assert result.exit_code == 0, result.output
    assert "Season to be created: 2026-08-31..2027-07-31 (2026/2027)" in result.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-34")
def test_a_coach_with_a_season_refuses_a_file_that_gives_one(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-34] (dry-run part: rule 28) Whatever its dates; and without `season` it is fine."""
    from padel_app.models.coach_seasons import CoachSeason

    ids = _roster_run(app, tmp_path, season=True)  # _seed gives the coach a January-December season
    with app.app_context():
        season = CoachSeason.query.filter_by(coach_id=ids["coach_id"]).one()
        season.start_day, season.start_month, season.end_day, season.end_month = 1, 1, 31, 3
        db.session.commit()
    given = {"start_date": "2026-08-31", "end_date": "2027-07-31"}

    refused = _dry(app, tmp_path, _history(ids, season=given))
    assert refused.exit_code == 1 and "the coach already has a season" in refused.output

    assert _dry(app, tmp_path, _history(ids)).exit_code == 0
    with app.app_context():
        assert CoachSeason.query.filter_by(coach_id=ids["coach_id"]).one().end_month == 3  # untouched


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-36")
def test_excluded_rows_and_moved_rows_are_printed_beside_the_sheet_totals(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-36, 37] (dry-run part: rule 29) The gap to the sheet is explained, never written."""
    ids = _roster_run(app, tmp_path)
    data = _history(
        ids,
        absences=[{"date": "2026-09-07", "student": "Ana Exemplo", "type": "justified", "minutes": 60},
                  {"date": "2026-09-14", "student": "Ana Exemplo", "type": "justified", "minutes": 60,
                   "sheet_date": "2026-09-15"}],
        guests=[], adjustments=[],
        excluded=[{"source_row": 40, "student": "Ana Exemplo", "kind": "absence", "type": "justified", "minutes": 60,
                   "reason": "no class that weekday"}],
        sheet_totals=[{"student": "Ana Exemplo", "justified_minutes": 180, "unjustified_minutes": 0, "guest_minutes": 0}])

    result = _dry(app, tmp_path, data)

    assert result.exit_code == 0, result.output
    assert "excluded row 40: Ana Exemplo absence justified 60 min: no class that weekday" in result.output
    assert "moved: Ana Exemplo sheet 2026-09-15 -> 2026-09-14" in result.output
    ana = next(l for l in result.output.splitlines() if l.strip().startswith("Ana Exemplo:"))
    assert "justified 120/180 Δ-60 (2)" in ana and "excluded just 60" in ana
