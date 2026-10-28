"""PAD-773 — the class's invited list (calendar.event-detail rules 8 and 16).

Prod, 2026-10-27: a waiting-list student the coach had invited by hand at 20:08 lost that spot to a
student whose request to join was accepted; when that student said "Não vou", the engine invited the
waiting-list student again at 21:18. The class listed them as "Expirou" (the 20:08 invite) while a
new invite waited, and the chat said "Vaga preenchida" for the invite the list called "Expirou".
Students are cases 7-13.
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_semi_auto_approval import _mark_absent, _patched_io, _seed_world


def _manual_invite_lost_to_a_join(prefix):
    """Case 11 is invited by hand to the class's last spot; case 12's request to join is accepted
    and takes it, so case 11's invitation ends as "spot filled"."""
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.notification_service import send_manual_notifications

    world = _seed_world(prefix, mode="automatic", n_candidates=2, enrolled=3, max_players=4)
    (_, case11), (_, case12) = world["candidates"]
    with _patched_io():
        [first] = send_manual_notifications(world["instance"].id, [case11.id], world["coach"].id)
    row = ClassJoinRequest(lesson_instance_id=world["instance"].id, player_id=case12.id,
                           coach_id=world["coach"].id, status="pending")
    db.session.add(row)
    db.session.commit()
    with _patched_io():
        decide_join_request_service(row.id, world["coach"], accept=True, confirm=True)
    db.session.commit()
    db.session.expire_all()
    return world, case11, case12, first


def test_a_manual_invite_lost_to_a_full_class_reads_spot_filled_like_its_bubble(app):
    from padel_app.models import Message, NotificationEvent
    from padel_app.serializers.lesson import invitation_outcome

    with app.app_context():
        _world, _case11, _case12, first = _manual_invite_lost_to_a_join("i773a")
        event = db.session.get(NotificationEvent, first.id)
        assert event.status == "expired"
        assert db.session.get(Message, event.message_id).msg_metadata["response"] == "spot_filled"
        assert invitation_outcome(event) == "spot_filled"


def test_a_student_invited_again_shows_the_new_invite(app):
    from padel_app.models import NotificationEvent
    from padel_app.serializers.lesson import dedupe_invitation_events, invitation_outcome
    from padel_app.services.notification_service import send_manual_notifications

    with app.app_context():
        world, case11, case12, first = _manual_invite_lost_to_a_join("i773b")
        # Case 12 says "Não vou"; the spot opens again and case 11 is invited again.
        _mark_absent(world["instance"], case12, justification="justified")
        with _patched_io():
            [second] = send_manual_notifications(world["instance"].id, [case11.id], world["coach"].id)
        rows = (NotificationEvent.query.filter_by(lesson_instance_id=world["instance"].id)
                .order_by(NotificationEvent.id).all())
        [shown] = [e for e in dedupe_invitation_events(rows) if e.player_id == case11.id]
        assert shown.id == second.id
        assert invitation_outcome(shown) == "pending"


def test_a_batch_the_tick_sends_tells_the_coachs_open_class(app):
    """A later batch (the tick, a decline's follow-up) publishes `notify_sent`, on which both
    clients re-read the class, so the new invite shows without reopening it."""
    from padel_app.services.notification_service import (
        _ensure_vacancy_for_player,
        _send_batch_locked,
    )

    with app.app_context():
        world = _seed_world("i773c", mode="automatic", n_candidates=2, enrolled=2, max_players=2)
        (_, case7), _ = world["enrolled"]
        _mark_absent(world["instance"], case7)
        vacancy = _ensure_vacancy_for_player(world["instance"], world["coach"].id, case7.id)
        with _patched_io(), patch("padel_app.services.notification_service.publish") as publish:
            sent = _send_batch_locked(vacancy, world["instance"], world["config"], world["coach"].id)
        assert sent
        kinds = [call.args[0]["type"] for call in publish.call_args_list]
        assert "notify_sent" in kinds
        [payload] = [c.args[0]["payload"] for c in publish.call_args_list if c.args[0]["type"] == "notify_sent"]
        assert payload["lessonInstanceId"] == world["instance"].id
