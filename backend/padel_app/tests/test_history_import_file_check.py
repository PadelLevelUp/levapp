"""History import, runner extension: the history file's own check (rules 15, 16, 29), before the database.

Only the file-level part of each criterion is driven here: every problem is printed, the exit code is 1
and the coach is never looked up. Resolution, the dry-run table and the apply are not built yet.

All names are invented.
"""
import pytest

from padel_app.services import onboarding_service as service
from padel_app.tests.test_pad827_onboarding_runner import (
    COACH_NAME, CLUB_NAME, _apply, _rows, _seed, _write,
)


def _history_file(ids=None, **history):
    """A valid history file: no classes, the 2026-08-31..2026-11-13 window of the fixture."""
    section = {
        "from": "2026-08-31", "through": "2026-11-13",
        "absences": [{"date": "2026-09-07", "student": "Ana Exemplo", "type": "justified", "minutes": 60,
                      "note": "Lesão", "source_row": 2}],
        "guests": [{"date": "2026-09-10", "start_time": "19:00", "student": "Lia Inventada", "minutes": 90,
                    "source_row": 3}],
        "adjustments": [{"student": "Eva Teste", "minutes": 420, "lesson_minutes": 60, "date": "2026-08-31"}],
    }
    section.update(history)
    coach_id = ids["coach_id"] if ids else 1
    return {
        "id": "2026_11_19_rui_history",
        "coach": {"id": coach_id, "name": COACH_NAME, "club": {"id": ids["club_id"] if ids else 1, "name": CLUB_NAME}},
        "expects": {"players": 5, "classes": 2, "instances": 0, "coach_marks": 0},
        "players": [], "classes": [], "history": section,
    }


def test_a_valid_history_file_has_no_problem():
    assert service.validate_file(_history_file()) == []


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-21")
def test_the_history_files_own_problems_are_all_reported_before_the_database_is_read(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-21] (file-check part: rule 16) Every problem is printed, exit code 1, the
    coach (id 987654, which does not exist) is never looked up, nothing is written."""
    ids = _seed(app)
    data = _history_file(
        ids,
        absences=[
            {"date": "2026-12-01", "student": "Ana Exemplo", "type": "justified", "minutes": 60},
            {"date": "2026-09-07", "student": "Rui Ficticio", "type": "sick", "minutes": 0},
            {"date": "2026-09-14", "student": "Teo Imaginario", "type": "unjustified", "minutes": 90,
             "note": "x" * 1001, "start_time": "7pm"},
            {"date": "2026-09-14", "student": "teo  imaginario", "type": "unjustified", "minutes": 90},
        ],
        guests=[{"date": "not a date", "start_time": "17", "student": "", "minutes": 60}],
        adjustments=[{"student": "Eva Teste", "minutes": 0, "date": "2026-08-31"}],
    )
    data["coach"]["id"] = 987654
    before = _rows(app)

    result = _apply(app, _write(tmp_path, data), dry_run=True)

    assert result.exit_code == 1, result.output
    for problem in ("absences[0]: date 2026-12-01 is outside", "absences[1]: type must be", "absences[1]: minutes",
                    "absences[2]: note is longer than 1000", "absences[2]: start_time must be HH:MM",
                    "absences[3]: teo  imaginario already has an absence", "guests[0]: date must be",
                    "guests[0]: start_time must be HH:MM", "guests[0]: student must be a name",
                    "adjustments[0]: minutes must be"):
        assert problem in result.output, (problem, result.output)
    assert "no coach with id" not in result.output
    assert _rows(app) == before


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-21")
def test_the_window_and_the_season_are_checked(app):
    """[IMPORT-ONBOARDING-RUNNER-21] (file-check part) from after through; a season that is not under a year,
    or does not contain `from`; a history file that names classes."""
    data = _history_file(**{"from": "2026-11-20"})
    assert any("is after history.through" in p for p in service.validate_file(data))

    data = _history_file(season={"start_date": "2026-08-31", "end_date": "2027-09-30"})
    assert any("under one year" in p for p in service.validate_file(data))
    data = _history_file(season={"start_date": "2026-09-15", "end_date": "2027-07-31"})
    assert any("must contain history.from" in p for p in service.validate_file(data))
    data = _history_file(season={"start_date": "2026-08-31", "end_date": "2027-07-31", "label": "2026/2027"})
    assert service.validate_file(data) == []

    data = _history_file()
    data["classes"] = [{"title": "Segunda", "date": "2026-11-09", "start_time": "18:00", "end_time": "19:00",
                        "max_players": 4, "until": "2027-07-31", "players": []}]
    assert any("has no classes" in p for p in service.validate_file(data))

    data = _history_file()
    del data["expects"]["instances"]
    assert any("expects.instances" in p for p in service.validate_file(data))


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-36")
def test_an_excluded_row_needs_a_reason_and_a_row_is_not_both_loaded_and_excluded(app, tmp_path):
    """[IMPORT-ONBOARDING-RUNNER-36] (file-check part: rule 29) Refused by the file's check, exit code 1, the
    coach never looked up."""
    ids = _seed(app)
    good = {"source_row": 40, "student": "Ana Exemplo", "kind": "absence", "type": "justified", "minutes": 60,
            "reason": "no class that weekday"}
    assert service.validate_file(_history_file(excluded=[good])) == []

    data = _history_file(ids, excluded=[dict(good, source_row=2), dict(good, reason=" "), dict(good, kind="class")])
    data["coach"]["id"] = 987654
    result = _apply(app, _write(tmp_path, data), dry_run=True)

    assert result.exit_code == 1, result.output
    assert "excluded[0]: source_row 2 is also absences[0]" in result.output
    assert "excluded[1]: a reason is needed" in result.output
    assert "excluded[2]: kind must be absence or guest" in result.output
    assert "no coach with id" not in result.output


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-37")
def test_a_sheet_date_that_is_not_a_date_is_refused(app):
    """[IMPORT-ONBOARDING-RUNNER-37] (file-check part: rule 29) A real `sheet_date` is accepted beside `date`."""
    row = {"date": "2026-09-10", "student": "Teo Imaginario", "type": "unjustified", "minutes": 90}
    assert service.validate_file(_history_file(absences=[dict(row, sheet_date="2026-09-09")])) == []
    problems = service.validate_file(_history_file(absences=[dict(row, sheet_date="21-20-2026")]))
    assert problems == ["absences[0]: sheet_date must be a YYYY-MM-DD date"]
