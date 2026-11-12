"""notifications.engine-timeline rules 5 and 7 (PAD-907, wave W7): leaving a session is an absence,
on time before ``absence_cutoff_at`` and late after it or on a no-show; an automatic
entrant's No is none (the auto-entry setting, wave brief §2 clause 3).

Scenario pins: TIMELINE-6 is P16, TIMELINE-7 is 61.
"""
from datetime import datetime, timedelta

import pytest

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


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-21")
def test_the_cutoff_is_real_hours_before_the_real_start():
    """engine-timeline rule 5: the cutoff is ``absence_cutoff_before`` real hours before the class's real
    start, as today's ``cancellation_deadline_utc``. Lisbon's clocks go back on 25 Oct 2026, so 24 h of
    wall clock before a 10:00 class that Sunday is one real hour more than 24 real hours."""
    from types import SimpleNamespace

    from padel_app.services.presence_response import cancellation_deadline_utc
    from padel_app.utils.dates import wall_to_utc_naive

    start = datetime(2026, 10, 25, 10, 0)                                    # Lisbon wall-clock, after the change
    ana = Student("A", 3, frozenset({"R"}))
    s = SessionSnapshot("S", 3, 8, start, regulars=(ana,), going=(Placement("A", "R", "regular", datetime(2026, 10, 1)),),
                        students={"A": ana})
    settings = EngineSettings(absence_cutoff_before=timedelta(hours=24))
    deadline = cancellation_deadline_utc(SimpleNamespace(start_datetime=start),
                                         SimpleNamespace(get_cancellation_deadline_hours=lambda: 24))
    for wall in (datetime(2026, 10, 24, 10, 30), datetime(2026, 10, 24, 10, 0), datetime(2026, 10, 24, 11, 0)):
        at = wall_to_utc_naive(wall)
        assert _notice(record(s, settings, "A", "regular_no", at)) == ("late" if at >= deadline else "on_time"), wall
    assert _notice(record(s, settings, "A", "regular_no", wall_to_utc_naive(datetime(2026, 10, 24, 10, 30)))) == "on_time"
