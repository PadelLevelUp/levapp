"""
PAD-776 (B-694): a coach moved "iniciar convites" from 7 days before at 19:30 to 2 days before at
19:00, and a student was invited the same evening for a class six days out. The window was read
from the configuration only when a spot opened: a spot opened inside the old window carried no
`invite_not_before` (or one already past), the sweep gates on that column alone, and the save
re-armed the scheduler jobs but touched no open spot. So a started spot kept running its rounds, and
a spot held for a later window stayed held after the coach brought the window forward.

invitations rule 11a: the save re-derives `invite_not_before` for every open spot of the coach's
future classes (the primary-coach scope of config rule 10a). A later window pauses a started spot
(invitations already sent stay live); an earlier one starts a held spot at the next tick. A spot the
coach approved "Yes, right now" and the coach's manual invitations are exempt.

Pinned clock (`NOW`, the class tomorrow 09:00 Lisbon = 08:00 UTC). "24 h before" opens at 08:00
UTC today (open); "6 h before" opens at 02:00 UTC tomorrow (closed until then).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _seed

OPEN = {"type": "hours_before", "value": 24}
LATER = {"type": "hours_before", "value": 6}
LATER_OPENS = datetime(2026, 6, 11, 2, 0)  # UTC


def _invited(instance_id):
    """Every player invited for the class so far, in order, whatever the invitation's status."""
    from padel_app.models.notification_event import NotificationEvent

    return [
        e.player_id
        for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id)
        .order_by(NotificationEvent.id).all()
    ]


def _live(instance_id):
    from padel_app.tests.test_pad493_invitations_run_twice import _live_events

    return [pid for _vid, pid in _live_events(instance_id)]


def _absent(instance_id):
    from padel_app.models.presences import Presence

    presence = Presence.query.filter_by(lesson_instance_id=instance_id).one()
    presence.status = "absent"
    presence.confirmed = True
    db.session.commit()
    return presence.player_id


def _sweep(monkeypatch, at):
    from padel_app.services.notification_service import process_invitation_batches
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, at)
    process_invitation_batches(now=at)


def _started_spot(monkeypatch, *, semi=False, candidates=6):
    """A class with one spot freed inside the open window and its first batch (3) sent."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, coach_id, _students, others = _seed(enrolled=1, candidates=candidates, max_players=1, semi=semi)
    _absent(instance_id)
    trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
    return instance_id, coach_id, others


def test_a_later_window_pauses_a_started_spot_and_keeps_its_invitations_live(app, monkeypatch):
    from padel_app.services.notification_service import update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _others = _started_spot(monkeypatch)
        first = _invited(instance_id)
        assert len(first) == 3 and _live(instance_id) == first

        update_config(coach_id, {"invitationStartTiming": LATER})

        _sweep(monkeypatch, NOW + timedelta(hours=3))  # past maxInactiveTime (120 min)
        assert _invited(instance_id) == first, "nothing more goes out before the new window"
        assert _live(instance_id) == first, "the invitations already sent stay live"

        _sweep(monkeypatch, LATER_OPENS + timedelta(minutes=1))
        assert len(_invited(instance_id)) > 3, "the spot resumes once the new window opens"


def test_an_earlier_window_starts_a_held_spot_at_the_next_tick(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.scheduler import _compute_invite_start_dt
    from padel_app.services.notification_service import _ensure_vacancy_for_player, update_config
    from padel_app.tests.helpers import pin_clock

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        pin_clock(monkeypatch, NOW)
        instance_id, coach_id, _students, _others = _seed(enrolled=1, candidates=6, max_players=1)
        config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
        config.invitation_start_timing = LATER
        db.session.commit()
        # A decline before the window, as `_free_spot_for_declining_player` writes it: the spot
        # opens at once and is held until the window the configuration then implied.
        instance = LessonInstance.query.get(instance_id)
        vacancy = _ensure_vacancy_for_player(instance, coach_id, _absent(instance_id))
        vacancy.invite_not_before = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
        vacancy.save()
        assert vacancy.invite_not_before == LATER_OPENS

        _sweep(monkeypatch, NOW)
        assert _invited(instance_id) == [], "held for the window"

        update_config(coach_id, {"invitationStartTiming": OPEN})
        _sweep(monkeypatch, NOW + timedelta(minutes=2))
        assert len(_live(instance_id)) == 3, "the next tick starts the spot (maxSimultaneous 3)"


def test_yes_right_now_and_manual_invitations_ignore_a_later_window(app, monkeypatch):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import send_manual_notifications, update_config
    from padel_app.services.replacement_approval_service import respond_to_approval

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, others = _started_spot(monkeypatch, semi=True, candidates=7)
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance_id).one()
        bundle_id = ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy.id).one().bundle_id
        respond_to_approval(bundle_id, "yes_now", coach_id, now=NOW)
        first = _invited(instance_id)
        assert len(first) == 3

        update_config(coach_id, {"invitationStartTiming": LATER})
        db.session.refresh(vacancy)
        assert vacancy.invite_not_before is None, "'Yes, right now' bypasses the window"

        _sweep(monkeypatch, NOW + timedelta(hours=3))
        assert len(_invited(instance_id)) > 3, "the approved spot keeps inviting"

        manual = next(pid for pid in others if pid not in _invited(instance_id))
        assert len(send_manual_notifications(instance_id, [manual], coach_id)) == 1, \
            "the coach's own invitation goes out whatever the window"


def test_a_save_by_a_coach_who_is_not_the_primary_coach_leaves_the_spot_alone(app, monkeypatch):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.coaches import Coach
    from padel_app.models.users import User
    from padel_app.services.notification_service import update_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, _coach_id, _others = _started_spot(monkeypatch)
        user = User(name="Co", username="p776cocoach", email="p776cocoach@t.test", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        co_coach = Coach(user_id=user.id)
        db.session.add(co_coach)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=co_coach.id, lesson_instance_id=instance_id))
        db.session.commit()

        update_config(co_coach.id, {"invitationStartTiming": LATER})

        _sweep(monkeypatch, NOW + timedelta(hours=3))
        assert len(_invited(instance_id)) > 3, "the class follows its primary coach's window"
