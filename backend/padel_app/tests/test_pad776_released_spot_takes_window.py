"""
PAD-776 part 2 (B-702): a spot released from "awaiting approval" invited at once, whatever the
coach's invitation window. A pending spot never carries `invite_not_before` (semi-automatic writes
one only on an approval "at the window"), and the PAD-766 release (`_release_pending_approval`,
from the save and from the sweep) turned it `not_required` and left the column NULL, so the sweep
started it on the same tick. On prod two spots of a coach's Friday class, waiting since 13 and 22
Oct, were released on 28 Oct and invited days before the coach's "2 days before at 19:00".

semi-auto-approval rule 1a: the release stamps the window from the coach's current timing, as a
spot opened in automatic mode gets it (invitations rule 11); a window already past sends at once.

Pinned clock (`NOW`, the class tomorrow 09:00 Lisbon = 08:00 UTC). "24 h before" is already open;
"6 h before" opens at 02:00 UTC tomorrow.
"""
from datetime import timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _live_events
from padel_app.tests.test_pad766_mode_switch_releases_pending_spots import (
    _semi_spot_with_prompt,
    _set_mode_behind_the_engine,
)
from padel_app.tests.test_pad776_window_follows_saved_timing import LATER, LATER_OPENS, _sweep


def _spot(instance_id):
    from padel_app.models.vacancy import Vacancy

    vacancy = Vacancy.query.filter_by(lesson_instance_id=instance_id).one()
    db.session.refresh(vacancy)
    return vacancy


def _timing_behind_the_engine(coach_id, timing):
    """The coach's timing, saved while the spot waited for approval (rule 11a leaves pending spots)."""
    from padel_app.services.notification_service import update_config

    update_config(coach_id, {"invitationStartTiming": timing})


def test_a_spot_released_by_the_switch_waits_for_a_window_still_ahead(app, monkeypatch):
    from padel_app.services.notification_service import update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)
        _timing_behind_the_engine(coach_id, LATER)
        assert _spot(instance_id).invite_not_before is None, "a pending spot carries no window"

        update_config(coach_id, {"invitationMode": "automatic"})
        assert _spot(instance_id).approval_status == "not_required"
        assert _spot(instance_id).invite_not_before == LATER_OPENS, "the release stamps the window"

        _sweep(monkeypatch, NOW)
        assert _live_events(instance_id) == [], "nothing before the window"
        _sweep(monkeypatch, LATER_OPENS + timedelta(minutes=1))
        assert len(_live_events(instance_id)) == 3, "the window opens and the spot starts"


def test_a_spot_released_by_the_sweep_waits_for_a_window_still_ahead(app, monkeypatch):
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)
        _timing_behind_the_engine(coach_id, LATER)
        _set_mode_behind_the_engine(coach_id, "automatic")

        _sweep(monkeypatch, NOW)
        assert _spot(instance_id).approval_status == "not_required", "the sweep releases it"
        assert _spot(instance_id).invite_not_before == LATER_OPENS
        assert _live_events(instance_id) == [], "and holds it until the window"

        _sweep(monkeypatch, LATER_OPENS + timedelta(minutes=1))
        assert len(_live_events(instance_id)) == 3


def test_a_spot_released_after_its_window_opened_sends_at_once(app, monkeypatch):
    """The suite's default timing (24 h before) opened at 08:00 UTC today: no window to wait for."""
    from padel_app.services.notification_service import update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)

        update_config(coach_id, {"invitationMode": "automatic"})
        assert _spot(instance_id).invite_not_before is None, "a past window is not stored"

        _sweep(monkeypatch, NOW)
        assert len(_live_events(instance_id)) == 3


def _windowless_automatic_spot(monkeypatch, timing):
    """An automatic spot started under the open default window, then the timing set to `timing`
    behind the engine (a save before rule 11a, or a release before the stamp): open, not_required,
    no window, its first batch live."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.test_pad776_window_follows_saved_timing import _started_spot

    instance_id, coach_id, _others = _started_spot(monkeypatch)
    spot = _spot(instance_id)
    assert (spot.approval_status, spot.invite_not_before) == ("not_required", None)
    assert len(_live_events(instance_id)) == 3
    NotificationConfig.query.filter_by(coach_id=coach_id).one().invitation_start_timing = timing
    db.session.commit()
    return instance_id, coach_id


def test_the_tick_stamps_a_missing_window_still_ahead_and_holds_the_spot(app, monkeypatch):
    """A spot that never had a window pauses like rule 11a's later save: no new round before the
    window, the invitations already out stay live."""
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, _coach_id = _windowless_automatic_spot(monkeypatch, LATER)
        live = _live_events(instance_id)

        _sweep(monkeypatch, NOW + timedelta(hours=2))
        assert _spot(instance_id).invite_not_before == LATER_OPENS
        assert _live_events(instance_id) == live, "paused: nothing new, nothing retired"


def test_the_tick_leaves_a_spot_whose_window_has_passed(app, monkeypatch):
    from padel_app.tests.test_pad776_window_follows_saved_timing import OPEN

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, _coach_id = _windowless_automatic_spot(monkeypatch, OPEN)

        _sweep(monkeypatch, NOW + timedelta(hours=2))
        assert _spot(instance_id).invite_not_before is None, "a past window is not stored"


def test_the_tick_leaves_a_yes_right_now_spot_alone(app, monkeypatch):
    """Rule 11a's exemption: approved with no window means the coach said "send now"."""
    from padel_app.models.vacancy import Vacancy

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, _coach_id = _windowless_automatic_spot(monkeypatch, LATER)
        Vacancy.query.filter_by(lesson_instance_id=instance_id).one().approval_status = "approved"
        db.session.commit()

        _sweep(monkeypatch, NOW + timedelta(hours=2))
        assert _spot(instance_id).invite_not_before is None


def test_one_save_that_switches_and_moves_the_window_uses_the_saved_window(app, monkeypatch):
    from padel_app.services.notification_service import update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id = _semi_spot_with_prompt(monkeypatch)

        update_config(coach_id, {"invitationMode": "automatic", "invitationStartTiming": LATER})
        assert _spot(instance_id).invite_not_before == LATER_OPENS

        _sweep(monkeypatch, NOW)
        assert _live_events(instance_id) == []
