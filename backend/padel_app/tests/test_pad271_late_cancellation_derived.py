"""PAD-271 M5 (attendance.presence rule 7): `lateCancellation` is derived from
`response` + `responded_at` against the coach's cancellation deadline."""
from datetime import datetime, timedelta
from types import SimpleNamespace

from padel_app.services.presence_response import presence_late_cancellation
from padel_app.utils.dates import wall_to_utc_naive

START = datetime(2026, 7, 14, 10, 0)  # Lisbon wall-clock, summer
INSTANCE = SimpleNamespace(start_datetime=START)
DEADLINE = wall_to_utc_naive(START) - timedelta(hours=24)


def _p(response, responded_at):
    return SimpleNamespace(response=response, responded_at=responded_at, lesson_instance=INSTANCE)


def test_a_cancellation_inside_the_deadline_is_late():
    assert presence_late_cancellation(_p("cancelled", DEADLINE + timedelta(minutes=1)), INSTANCE) is True
    assert presence_late_cancellation(_p("cancelled", DEADLINE), INSTANCE) is True


def test_a_cancellation_before_the_deadline_is_not_late():
    assert presence_late_cancellation(_p("cancelled", DEADLINE - timedelta(minutes=1)), INSTANCE) is False


def test_a_proactive_decline_and_a_plain_decline_are_never_late():
    late = DEADLINE + timedelta(hours=1)
    assert presence_late_cancellation(_p("proactive_decline", late), INSTANCE) is False
    assert presence_late_cancellation(_p("declined", late), INSTANCE) is False
    assert presence_late_cancellation(_p("none", None), INSTANCE) is False


def test_the_coach_deadline_setting_moves_the_cutoff():
    config = SimpleNamespace(get_cancellation_deadline_hours=lambda: 12)
    at_18h = wall_to_utc_naive(START) - timedelta(hours=18)
    assert presence_late_cancellation(_p("cancelled", at_18h), INSTANCE) is True   # inside 24h
    assert presence_late_cancellation(_p("cancelled", at_18h), INSTANCE, config) is False  # outside 12h
