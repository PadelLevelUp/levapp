"""
PAD-719 (notifications.invitations rule 18a, calendar.event-detail rule 16): an invitation the
engine moved to another spot of the class records where it came from and when, and the coach's
class payload carries `movedAt` so the invitation row can say "moved from the previous spot".
An invitation that was never moved carries NULL (the control in the same class).
"""
from datetime import timedelta

from padel_app.tests.test_pad493_invitations_run_twice import NOW, _live_events, _seed, _vacancies
from padel_app.tests.test_pad497_a_no_is_final import _answer, _instance, _io, _tick


def test_a_moved_invitation_records_its_old_spot_and_the_payload_says_so(app, monkeypatch):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first_spot, second_spot = (v[0] for v in _vacancies(instance_id))
        winner, *others = [p for v, p in _live_events(instance_id) if v == first_spot]
        for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id).all():
            assert e.moved_from_vacancy_id is None and e.moved_at is None

        _answer(instance_id, winner, "yes", NOW + timedelta(minutes=1))
        _tick(monkeypatch, 3)

        events = {e.player_id: e for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id)}
        for pid in others:
            assert events[pid].vacancy_id == second_spot
            assert events[pid].moved_from_vacancy_id == first_spot
            assert events[pid].moved_at is not None
        # The control: the student who took the first spot was never moved.
        assert events[winner].moved_from_vacancy_id is None and events[winner].moved_at is None

        payload = serialize_class_instance(_instance(instance_id))
        moved = {int(i["playerId"]): i["movedAt"] for i in payload["invitations"]}
        assert all(moved[pid] for pid in others), moved
        assert moved[winner] is None
