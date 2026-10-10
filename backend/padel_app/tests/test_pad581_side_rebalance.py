"""PAD-581 — notifications.invitations rule 2d (owner, 2026-10-10, option C; defaults Q1/Q2/Q4, Q3
changed): a spot's side is re-counted at each batch and at each "yes" of the class; when a re-count
flips a spot, its live round-1 invitations of the side it left are withdrawn for balance
(`retired_reason = "side_balanced"`, bubble `response: "side_balanced"`), which is not a "no", keeps
the student out of round 1 of that class, and lets them join the class's waiting list.

The class of every cell: 4 places, 1 left + 1 right going, two never-filled spots (rule 2b: left,
right). Cells marked OLD-RED fail before PAD-581.
"""
from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_coach_player, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol


def _setup(tag):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import _create_structural_vacancies

    coach = _create_coach(f"p581{tag}")
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, f"p581{tag}", instance_level=level, max_players=4)
    instance.notifications_enabled = True
    _enrol(coach, level, instance, f"p581{tag}-l0", "left")
    _enrol(coach, level, instance, f"p581{tag}-r0", "right")
    if NotificationConfig.query.filter_by(coach_id=coach.id).first() is None:
        db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True))
    db.session.commit()
    spots = {v.side: v for v in _create_structural_vacancies(instance, coach.id)}
    db.session.commit()
    assert set(spots) == {"left", "right"}

    def roster(name, side):
        cp = _create_coach_player(coach, level, f"p581{tag}-{name}")
        cp.side = side
        db.session.flush()
        return cp.player_id

    players = {n: roster(n, s) for n, s in (("ana", "left"), ("bia", "left"), ("carla", "both"), ("duarte", "left"), ("rui", "right"))}
    db.session.commit()
    return coach, instance, spots, players


def _invite(coach, instance, vacancy, player_id, round_number=1):
    """A live invitation with its chat message, as `_send_invitation_batch` leaves it."""
    from padel_app.models import Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    conversation = _get_or_create_direct_conversation(coach.user_id, Player.query.get(player_id).user_id)
    event = NotificationEvent(coach_id=coach.id, lesson_instance_id=instance.id, player_id=player_id, type="auto",
                              round_number=round_number, status="sent", vacancy_id=vacancy.id)
    db.session.add(event)
    db.session.flush()
    msg = Message(conversation_id=conversation.id, sender_id=coach.user_id, text="Há uma vaga", message_type="notification_invite",
                  msg_metadata={"notificationEventId": event.id, "lessonInstanceId": instance.id, "vacancyId": vacancy.id, "responded": False})
    db.session.add(msg)
    db.session.flush()
    event.message_id = msg.id
    db.session.commit()
    return event.id


def _event(event_id):
    from padel_app.models.notification_event import NotificationEvent

    db.session.expire_all()
    return db.session.get(NotificationEvent, event_id)


def _bubble(event_id):
    from padel_app.models import Message

    return Message.query.get(_event(event_id).message_id).msg_metadata


def _widened_yes(coach, instance, spots, players, *, by="student"):
    """Duarte (left) takes the RIGHT spot in a widened round."""
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns

    duarte = _invite(coach, instance, spots["right"], players["duarte"], round_number=2)
    if by == "coach":
        result = ns.coach_respond_to_notification(duarte, "yes", coach.id)
    else:
        result = ns.respond_to_notification(duarte, "yes", Player.query.get(players["duarte"]).user_id)
    assert result == {"action": "confirmed"}, result
    return duarte


def _patch_io(monkeypatch):
    from padel_app.services import notification_service as ns

    monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(ns, "publish", lambda *a, **kw: None)


import pytest


@pytest.mark.parametrize("by", ["student", "coach"])
def test_a_yes_that_flips_a_spot_withdraws_its_old_side_round_1_invitations(app, monkeypatch, by):
    """OLD-RED: the left spot kept asking left after the class went 2 left / 1 right."""
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup(f"flip{by[0]}")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        bia = _invite(coach, instance, spots["left"], players["bia"])
        carla = _invite(coach, instance, spots["left"], players["carla"])
        left_spot_id = spots["left"].id
        _widened_yes(coach, instance, spots, players, by=by)

        from padel_app.models.vacancy import Vacancy
        db.session.expire_all()
        assert db.session.get(Vacancy, left_spot_id).side == "right", "the left spot re-counted to right"
        for withdrawn in (ana, bia):
            e = _event(withdrawn)
            assert (e.status, e.retired_reason, e.answer, e.withdrawn_by_coach_at) == ("expired", "side_balanced", None, None)
            assert _bubble(withdrawn)["response"] == "side_balanced"
        assert _event(carla).status == "sent", "a both-side student stays invited"
        assert not _bubble(carla).get("responded")


def test_a_yes_that_keeps_the_balance_withdraws_nothing(app, monkeypatch):
    """PIN: Rui (right) takes the right spot — 1 left / 2 right going; the left spot stays left."""
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("keep")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        rui = _invite(coach, instance, spots["right"], players["rui"])
        assert ns.respond_to_notification(rui, "yes", Player.query.get(players["rui"]).user_id) == {"action": "confirmed"}
        assert _event(ana).status == "sent" and _event(ana).retired_reason is None


def test_a_batch_re_counts_its_spot_and_round_1_skips_the_balance_withdrawn(app, monkeypatch):
    """OLD-RED: round 1 read the spot's creation side."""
    from padel_app.services import notification_service as ns

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("batch")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        _widened_yes(coach, instance, spots, players)
        from padel_app.models.vacancy import Vacancy
        spot = db.session.get(Vacancy, spots["left"].id)
        verdicts = {v.cp.player_id: v.stage for v in ns.evaluate_candidates(
            spot, instance, coach.id, ns.get_or_create_config(coach.id), wave=("group", 1), explain=True)}
        assert verdicts[players["rui"]] == "invited", "the right student is round 1's now"
        assert verdicts[players["ana"]] != "invited", "withdrawn for balance: not round 1 of this class again"
        assert verdicts[players["bia"]] != "invited", "a left student does not match the spot's side now"


def test_a_balance_withdrawn_student_joins_the_waiting_list_while_the_class_has_a_place(app, monkeypatch):
    """OLD-RED: has_spots refused her (Q3: the owner wants the list offered)."""
    from werkzeug.exceptions import HTTPException

    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import join_class_waiting_list_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("join")
        _invite(coach, instance, spots["left"], players["ana"])
        _widened_yes(coach, instance, spots, players)
        entry, created = join_class_waiting_list_service(Player.query.get(players["ana"]), "LessonInstance", instance.id, None)
        assert created and entry.is_active
        with pytest.raises(HTTPException) as e:  # PIN: never invited → still has_spots / not_visible
            join_class_waiting_list_service(Player.query.get(players["rui"]), "LessonInstance", instance.id, None)
        assert e.value.response.get_json()["code"] in ("has_spots", "not_visible")


def test_group_0_asks_a_balance_withdrawn_member_only_for_her_side(app, monkeypatch):
    """OLD-RED: group 0 asked list members for any spot, so the list could undo the balance."""
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.services.academy_class_service import join_class_waiting_list_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("g0")
        _invite(coach, instance, spots["left"], players["ana"])
        _widened_yes(coach, instance, spots, players)
        join_class_waiting_list_service(Player.query.get(players["ana"]), "LessonInstance", instance.id, None)
        spot = db.session.get(Vacancy, spots["left"].id)
        assert spot.side == "right"
        assert players["ana"] not in [cp.player_id for _, cp in ns._waiting_list_candidates(spot, instance, coach.id, ns.get_or_create_config(coach.id))]
        spot.side = None  # a side-less spot asks her
        db.session.commit()
        assert players["ana"] in [cp.player_id for _, cp in ns._waiting_list_candidates(spot, instance, coach.id, ns.get_or_create_config(coach.id))]
