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
from padel_app.invitation_engine.messages import attendance_request_at, due
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


def test_the_first_request_goes_at_attendance_request_at_and_not_before():
    s, settings = _snapshot((("A", "regular"), ("B", "regular"))), EngineSettings()
    assert attendance_request_at(s, settings) == FIRST
    assert _asked(due(s, settings, FIRST - timedelta(minutes=1))) == []
    assert _asked(due(s, settings, FIRST)) == ["A", "B"]


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


def test_automatic_entrants_and_direct_joiners_are_asked_and_invitation_acceptors_are_not():
    s = _snapshot((("R", "regular"), ("W", "auto_from_waiting_list"), ("J", "direct"),
                   ("I", "invitation")))
    assert _asked(due(s, EngineSettings(), FIRST)) == ["J", "R", "W"]


def test_a_regular_who_said_they_are_not_going_is_not_asked():
    s = _snapshot((("A", "regular"), ("B", "regular")), absent={"B"})
    assert _asked(due(s, EngineSettings(), FIRST)) == ["A"]


def test_quiet_hours_hold_the_request_until_they_end():
    late = EngineSettings().with_changes(
        attendance_request=AttendanceRequest(days_before=1, at=time(23, 30), every=timedelta(hours=2), max=3),
        quiet_hours=(time(22, 0), time(7, 0)))
    s = _snapshot()
    assert _asked(due(s, late, datetime(2026, 11, 2, 23, 30))) == []
    assert _asked(due(s, late, datetime(2026, 11, 3, 6, 55))) == []
    assert _asked(due(s, late, datetime(2026, 11, 3, 7, 0))) == ["A"]


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
