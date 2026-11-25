"""notifications.engine-timeline rule 2 (PAD-910): the attendance request and its repeats.

Regulars still going, automatic entrants and direct joiners are asked if they are going at
``attendance_request_at`` (``days_before`` the class's day, at the coach's Lisbon time), then every
``every`` while they have not answered, at most ``max`` times; an invitation acceptor is never asked
(notifications.reminders). Nothing goes out in quiet hours (it waits for them to end) or once the
class has started. Each repeat goes out once: the snapshot carries the requests already sent.

Scenario pin: 60 (repeats only to non-responders, at most 3).
"""
import typing
from dataclasses import replace
from datetime import datetime, time, timedelta

import pytest

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.effects import AttendanceRequested
from padel_app.invitation_engine.messages import attendance_request_at, coach_ask, due
from padel_app.invitation_engine.settings import AttendanceRequest
from padel_app.invitation_engine.snapshot import Placement, SessionSnapshot, Student

START = datetime(2026, 11, 3, 10, 30)               # Lisbon wall-clock; UTC+0 in November
FIRST = datetime(2026, 11, 2, 17, 0)                # the day before at 17:00, naive UTC
JOINED = datetime(2026, 10, 1, 9, 0)


def _snapshot(going=(("A", "regular"),), *, absent=(), confirmed=(), requested=None, start=START,
              placed_at=None):
    students = {sid: Student(sid, 3, frozenset({"L"})) for sid, _ in going}
    regulars = tuple(students[sid] for sid, how in going if how == "regular")
    placed_at = placed_at or {}
    return SessionSnapshot("S", 3, 8, start, regulars=regulars,
                           going=tuple(Placement(sid, "L", how, placed_at.get(sid, JOINED)) for sid, how in going),
                           absent=frozenset(absent), confirmed=frozenset(confirmed),
                           attendance_requested=requested or {}, students=students)


def _asked(effects):
    return sorted(e.student for e in effects if isinstance(e, AttendanceRequested))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-15")
def test_the_first_request_goes_at_attendance_request_at_and_not_before():
    s, settings = _snapshot((("A", "regular"), ("B", "regular"))), EngineSettings()
    assert attendance_request_at(s, settings) == FIRST
    assert _asked(due(s, settings, FIRST - timedelta(minutes=1))) == []
    assert _asked(due(s, settings, FIRST)) == ["A", "B"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-16")
def test_repeats_go_every_interval_only_to_who_has_not_answered_and_stop_at_max():
    settings = EngineSettings()                      # every 2 h, at most 3
    s = _snapshot((("A", "regular"), ("B", "regular")), confirmed={"A"},
                  requested={"A": (FIRST,), "B": (FIRST,)})
    assert _asked(due(s, settings, FIRST + timedelta(hours=1, minutes=59))) == []
    assert _asked(due(s, settings, FIRST + timedelta(hours=2))) == ["B"]
    third = _snapshot((("B", "regular"),), requested={"B": (FIRST, FIRST + timedelta(hours=2))})
    assert _asked(due(third, settings, FIRST + timedelta(hours=4))) == ["B"]
    done = _snapshot((("B", "regular"),), requested={"B": (FIRST, FIRST + timedelta(hours=2),
                                                           FIRST + timedelta(hours=4))})
    assert _asked(due(done, settings, FIRST + timedelta(hours=6))) == []


def test_a_request_already_sent_is_not_sent_again_on_the_next_run():
    s = _snapshot(requested={"A": (FIRST,)})
    assert _asked(due(s, EngineSettings(), FIRST + timedelta(minutes=5))) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-17")
def test_every_going_student_is_asked_and_an_invitation_acceptor_only_when_placed_by_the_first_send():
    # PAD-820 (owner, option b): an acceptor placed before the first send is asked like everyone.
    s = _snapshot((("R", "regular"), ("W", "auto_from_waiting_list"), ("J", "direct"),
                   ("I", "invitation")), absent={"R"})
    assert _asked(due(s, EngineSettings(), FIRST)) == ["I", "J", "W"]
    # Between the first and the second send, I2 accepts an invitation and J2 joins directly: at the
    # second send J2 is asked (the next one) and I2 is not (they have just said yes).
    later = _snapshot((("I2", "invitation"), ("J2", "direct")),
                      placed_at={"I2": FIRST + timedelta(hours=1), "J2": FIRST + timedelta(hours=1)})
    assert _asked(due(later, EngineSettings(), FIRST + timedelta(hours=2))) == ["J2"]


def test_a_regular_who_said_they_are_not_going_is_not_asked():
    s = _snapshot((("A", "regular"), ("B", "regular")), absent={"B"})
    assert _asked(due(s, EngineSettings(), FIRST)) == ["A"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-19")
def test_quiet_hours_hold_the_request_until_they_end():
    late = EngineSettings().with_changes(
        attendance_request=AttendanceRequest(days_before=1, at=time(23, 30), every=timedelta(hours=2), max=3),
        quiet_hours=(time(22, 0), time(7, 0)))
    s = _snapshot()
    assert _asked(due(s, late, datetime(2026, 11, 2, 23, 30))) == []
    assert _asked(due(s, late, datetime(2026, 11, 3, 6, 55))) == []
    assert _asked(due(s, late, datetime(2026, 11, 3, 7, 0))) == ["A"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-18")
def test_a_late_run_sends_the_latest_slot_once_not_the_missed_ones():
    s = _snapshot()
    assert _asked(due(s, EngineSettings(), FIRST + timedelta(hours=3))) == ["A"]
    caught_up = _snapshot(requested={"A": (FIRST + timedelta(hours=3),)})
    assert _asked(due(caught_up, EngineSettings(), FIRST + timedelta(hours=3, minutes=5))) == []
    assert _asked(due(caught_up, EngineSettings(), FIRST + timedelta(hours=4))) == ["A"]


def test_someone_going_after_a_send_waits_for_the_next_slot():
    # A was asked at 17:00; J joined directly at 18:00 and is asked with the 19:00 repeat.
    s = _snapshot((("A", "regular"), ("J", "direct")), requested={"A": (FIRST,)},
                  placed_at={"J": FIRST + timedelta(hours=1)})
    assert _asked(due(s, EngineSettings(), FIRST + timedelta(hours=1))) == []
    assert _asked(due(s, EngineSettings(), FIRST + timedelta(hours=2))) == ["A", "J"]


def test_a_regular_back_through_regular_returns_is_asked():
    s = _snapshot((("R", "regular_returns"),))
    assert _asked(due(s, EngineSettings(), FIRST)) == ["R"]


def test_nothing_goes_out_once_the_class_has_started():
    s = _snapshot(requested={"A": (FIRST,)})
    assert _asked(due(s, EngineSettings(), datetime(2026, 11, 3, 10, 30))) == []


def test_the_request_time_is_lisbon_wall_clock():
    # Summer: 17:00 in Lisbon is 16:00 UTC.
    s = _snapshot(start=datetime(2026, 7, 3, 10, 30))
    assert attendance_request_at(s, EngineSettings()) == datetime(2026, 7, 2, 16, 0)


def test_no_request_when_the_coach_sends_none():
    none = EngineSettings().with_changes(
        attendance_request=AttendanceRequest(days_before=1, at=time(17, 0), every=timedelta(hours=2), max=0))
    assert _asked(due(_snapshot(), none, FIRST)) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-18")
def test_engine_kinds_do_not_reuse_todays_message_names():
    """Ruling D8 (PAD-913, engine-answers rule 11): no engine message kind reuses a name today's
    templates give another meaning. The waiting-list invitation is ``waiting_list_invite``, today's key
    of the same meaning; today's ``waiting_list_offer`` ("spot taken, join the list?") is the
    engine's ``sorry``, so it is not a kind."""
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES

    kinds = set(typing.get_args(fx.MessageKind))
    # Shared names mean the same message: today's waiting-list invitation, and the new engine's own
    # side_moved key (message-templates new-engine section N1: each new key is its kind's name), and
    # today's invitation ``invite``, which a coach's invitation by hand sends again when it reopens a
    # row (engine-answers rule 15, PAD-932).
    assert kinds & set(DEFAULT_MESSAGE_TEMPLATES) == {"waiting_list_invite", "side_moved", "invite"}
    assert "waiting_list_offer" not in kinds
    # The engine's "sorry" is today's "spot taken, join the list?", so it renders through that template.
    from padel_app.invitation_engine.constants import KIND_SORRY
    assert KIND_SORRY in kinds and "waiting_list_offer" in DEFAULT_MESSAGE_TEMPLATES
    from padel_app.invitation_engine.constants import KIND_WAITING_LIST_INVITE

    assert KIND_WAITING_LIST_INVITE in kinds


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-23")
def test_a_student_who_blocked_everything_gets_no_attendance_request():
    s = _snapshot((("A", "regular"), ("B", "regular")))
    s.students["B"] = replace(s.students["B"], blocks_all=True)
    assert _asked(due(s, EngineSettings(), FIRST)) == ["A"]


# --- the coach's ask (engine-timeline rule 8, engine plan item #16) -------------------------------------

def _not_asked(effects):
    return {e.student: e.reason for e in effects if isinstance(e, fx.NotAsked)}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-27")
def test_the_coachs_ask_goes_at_once_to_who_the_schedule_would_ask():
    now = FIRST - timedelta(days=2)
    s = _snapshot((("R", "regular"), ("RR", "regular_returns"), ("W", "auto_from_waiting_list"), ("J", "direct"),
                   ("I", "invitation"), ("Y", "regular"), ("B", "regular"), ("U", "regular")),
                  confirmed={"Y"}, placed_at={"I": now - timedelta(hours=1)})
    s.students["B"] = replace(s.students["B"], blocks_all=True)
    s = replace(s, absent=frozenset({"X"}), regulars=s.regulars + (Student("X", 3, frozenset({"L"})),))
    effects = coach_ask(s, EngineSettings(), now, {"U": "unavailable"})
    assert _asked(effects) == ["I", "J", "R", "RR", "W"]
    assert all(e.at == now for e in effects if isinstance(e, AttendanceRequested))
    assert _not_asked(effects) == {"X": "not_coming", "Y": "already_confirmed", "B": "preference",
                                   "U": "unavailable"}
    # The schedule is not moved: at attendance_request_at whoever of the five has not answered is asked.
    after = replace(s, confirmed=s.confirmed | {"R"},
                    attendance_requested={e.student: (e.at,) for e in effects if isinstance(e, AttendanceRequested)})
    assert _asked(due(after, EngineSettings(), FIRST)) == ["I", "J", "RR", "U", "W"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-28")
def test_the_coachs_ask_skips_an_acceptor_placed_after_the_first_send():
    now = FIRST + timedelta(hours=1)
    s = _snapshot((("I1", "invitation"), ("I2", "invitation")),
                  placed_at={"I1": FIRST - timedelta(hours=1), "I2": FIRST + timedelta(minutes=30)},
                  requested={"I1": (FIRST,)})
    effects = coach_ask(s, EngineSettings(), now)
    assert _asked(effects) == ["I1"]
    assert _not_asked(effects) == {"I2": "already_confirmed"}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-29")
def test_the_coachs_ask_ignores_quiet_hours_and_the_schedule_type():
    none_and_quiet = EngineSettings().with_changes(
        attendance_request=AttendanceRequest(type="none"), quiet_hours=(time(22, 0), time(7, 0)))
    s = _snapshot((("A", "regular"), ("J", "direct")))
    night = datetime(2026, 11, 2, 23, 30)
    assert attendance_request_at(s, none_and_quiet) is None
    assert _asked(due(s, none_and_quiet, night)) == []
    effects = coach_ask(s, none_and_quiet, night)
    assert _asked(effects) == ["A", "J"] and _not_asked(effects) == {}
    # ...and nobody once the class has started.
    assert coach_ask(s, none_and_quiet, datetime(2026, 11, 3, 10, 30)) == ()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-31")
def test_no_student_is_asked_more_than_max_times_scheduled_and_coachs_asks_together():
    settings = EngineSettings().with_changes(
        attendance_request=AttendanceRequest(days_before=2, at=time(17, 0), every=timedelta(days=1), max=2))
    start = START + timedelta(days=3)                       # 6 Nov: daily sends on the 4th and the 5th
    first = datetime(2026, 11, 4, 17, 0)
    coach_before = first - timedelta(hours=3)
    s = _snapshot((("A", "regular"), ("B", "regular"), ("C", "regular")), start=start,
                  requested={"A": (coach_before, first), "B": (coach_before, first), "C": (first,)})
    assert attendance_request_at(s, settings) == first
    # B's earlier attempt was voided (superseded and expired): only the one since counts.
    s = replace(s, attendance_asks={"A": 2, "B": 1, "C": 1})
    second = first + timedelta(days=1)
    assert _asked(due(s, settings, second)) == ["B", "C"]
    # The second send went to B and C: a coach's ask after it finds all three at the cap.
    after = replace(s, attendance_asks={"A": 2, "B": 2, "C": 2},
                    attendance_requested={"A": (coach_before, first), "B": (coach_before, first, second),
                                          "C": (first, second)})
    effects = coach_ask(after, settings, second + timedelta(hours=1))
    assert _asked(effects) == []
    assert _not_asked(effects) == {"A": "reminder_limit", "B": "reminder_limit", "C": "reminder_limit"}
    # A store that never voids (asks unset) counts every request: B would be at the cap too.
    assert replace(s, attendance_asks=None).asks("B") == 2
