"""notifications.engine-timeline rules 5 and 7 (PAD-907, wave W7): leaving a session is an absence,
on time before ``absence_cutoff_at`` and late after it or on a no-show; an automatic
entrant's No is none (the auto-entry setting, wave brief §2 clause 3).

Scenario pins: TIMELINE-6 is P16, TIMELINE-7 is 61.
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.absences import record
from padel_app.invitation_engine.effects import Absence
from padel_app.invitation_engine.snapshot import Placement, SessionSnapshot, Student

START = datetime(2026, 11, 3, 10, 30)              # Lisbon wall-clock; UTC+0 in November
CUTOFF = datetime(2026, 11, 2, 22, 30)              # 12 h before, naive UTC


def _snapshot(how="regular"):
    ana = Student("A", 3, frozenset({"R"}))
    return SessionSnapshot("S", 3, 8, START, regulars=(ana,) if how == "regular" else (),
                           going=(Placement("A", "R", how, datetime(2026, 11, 1, 19, 0)),),
                           students={"A": ana})


def _notice(effects):
    [absence] = [e for e in effects if isinstance(e, Absence)]
    assert absence.student == "A"
    return absence.notice


def test_a_no_before_the_cutoff_is_on_time_and_after_it_late():
    s, settings = _snapshot(), EngineSettings()
    assert _notice(record(s, settings, "A", "regular_no", CUTOFF - timedelta(minutes=1))) == "on_time"
    assert _notice(record(s, settings, "A", "regular_no", CUTOFF)) == "late"
    longer = settings.with_changes(absence_cutoff_before=timedelta(hours=24))
    assert _notice(record(s, longer, "A", "regular_no", datetime(2026, 11, 2, 10, 20))) == "on_time"
    assert _notice(record(s, longer, "A", "regular_no", datetime(2026, 11, 2, 10, 40))) == "late"


def test_a_no_show_is_late():
    assert _notice(record(_snapshot(), EngineSettings(), "A", "no_show", datetime(2026, 11, 3, 10, 30))) \
        == "late"


def test_an_invitee_who_cancels_follows_the_regulars_rule():
    s, settings = _snapshot("invitation"), EngineSettings()
    assert _notice(record(s, settings, "A", "cancel", CUTOFF - timedelta(hours=1))) == "on_time"
    assert _notice(record(s, settings, "A", "cancel", CUTOFF + timedelta(hours=1))) == "late"


def test_an_automatic_entrants_no_is_no_absence():
    s = _snapshot("auto_from_waiting_list")
    assert _notice(record(s, EngineSettings(), "A", "cancel", CUTOFF + timedelta(hours=1))) == "none"


def test_the_cutoff_is_lisbon_wall_clock():
    # Summer: a 10:30 class is 09:30 UTC, so the 12 h cutoff is 21:30 UTC the day before.
    ana = Student("A", 3, frozenset({"R"}))
    s = SessionSnapshot("S", 3, 8, datetime(2026, 7, 3, 10, 30), regulars=(ana,),
                        going=(Placement("A", "R", "regular", datetime(2026, 7, 1, 18, 0)),), students={"A": ana})
    assert _notice(record(s, EngineSettings(), "A", "regular_no", datetime(2026, 7, 2, 21, 29))) == "on_time"
    assert _notice(record(s, EngineSettings(), "A", "regular_no", datetime(2026, 7, 2, 21, 30))) == "late"
