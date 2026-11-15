"""PAD-805 (B-715) — notifications.invitations rule 2d and rule 13 (PAD-802, sub-ticket 3).

1. An absence that creates its vacancy re-counts the class's OTHER open spots then, as a "yes" does —
   not at each spot's next batch. A spot that flips moves (rule 18a) or withdraws its live round-1
   invitations of the side it left, as at a "yes" (owner, ticket text).
2. A coach's enrolment closes the open spot of the joiner's side, re-counts the class's other open
   spots (rule 2d), and runs the fill path's side-request move (join-requests rule 20): a pending request whose side just lost its last spot
   goes to that side's waiting list.

Every test here is OLD-RED: it fails on staging bbe80c331.
"""
import pytest
from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_coach_player, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol
from padel_app.tests.test_pad581_side_rebalance import _event, _invite, _patch_io


def _class(tag, going):
    """A class of 4 with `going` [(name, side)] enrolled; its coach and level."""
    from padel_app.models.notification_config import NotificationConfig

    coach = _create_coach(f"p805{tag}")
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, f"p805{tag}", instance_level=level, max_players=4)
    instance.notifications_enabled = True
    cps = {name: _enrol(coach, level, instance, f"p805{tag}-{name}", side) for name, side in going}
    if NotificationConfig.query.filter_by(coach_id=coach.id).first() is None:
        db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True))
    db.session.commit()
    return coach, level, instance, cps


def _roster(coach, level, tag, name, side):
    cp = _create_coach_player(coach, level, f"p805{tag}-{name}")
    cp.side = side
    db.session.commit()
    return cp.player_id


def _spot(coach, instance, side):
    from padel_app.models.vacancy import Vacancy

    v = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open", side=side,
                current_round_number=1, current_batch_number=0)
    db.session.add(v)
    db.session.commit()
    return v.id


def _vacancy(vid):
    from padel_app.models.vacancy import Vacancy

    db.session.expire_all()
    return db.session.get(Vacancy, vid)


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-68")
def test_an_absence_re_counts_the_other_open_spots_and_withdraws_a_flipped_spots_round_1(app, monkeypatch):
    """Ana and Bia (left) going; both never-filled spots right (rule 2b: 2 left / 0 right). Ana is
    absent: her freed spot is right (rule 2c: 1 left / 0 right going). Re-counted, the first
    never-filled spot sees 1 left going and 2 right open spots, so it flips to left, and Rui's (right)
    round-1 invitation on it moves to the other right spot (rule 18a) instead of being withdrawn.
    Before the window: no batch runs."""
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import _create_structural_vacancies, _ensure_vacancy_for_player

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, cps = _class("abs", [("ana", "left"), ("bia", "left")])
        spots = sorted(_create_structural_vacancies(instance, coach.id), key=lambda v: v.id)
        db.session.commit()
        assert [v.side for v in spots] == ["right", "right"]
        first_id = spots[0].id
        rui = _invite(coach, instance, spots[0], _roster(coach, level, "abs", "rui", "right"))

        ana = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=cps["ana"].player_id).one()
        ana.status = "absent"
        db.session.commit()
        freed = _ensure_vacancy_for_player(instance, coach.id, cps["ana"].player_id)
        db.session.commit()
        assert freed.side == "right"

        assert _vacancy(first_id).side == "left", "the never-filled spot re-counted when the absence opened its spot"
        e = _event(rui)
        # Rule 18a (PAD-679): before it is withdrawn, the right invitation moves to the class's other
        # open spot that asks for the right (the second never-filled one), so it stays live.
        assert (e.status, e.retired_reason, e.vacancy_id) == ("sent", None, spots[1].id)


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-69")
def test_a_coach_enrolment_closes_the_open_spot_of_the_joiners_side(app, monkeypatch):
    """Ana (left) and Rui (right) going; a left spot (older) and a right spot open, no invitations.
    The coach adds Bruno (right): the right spot closes, the left one stays open. Before: capacity
    closed the oldest, the left spot, and a right spot went on asking for a class with no right room."""
    from padel_app.services.lesson_service import enrol

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, _ = _class("enr", [("ana", "left"), ("rui", "right")])
        left_id = _spot(coach, instance, "left")
        right_id = _spot(coach, instance, "right")
        bruno = _roster(coach, level, "enr", "bruno", "right")

        enrol(bruno, instance, "coach")
        db.session.commit()

        assert (_vacancy(left_id).status, _vacancy(right_id).status) == ("open", "filled")


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-70")
def test_a_coach_enrolment_re_counts_the_spot_left_open_and_withdraws_its_round_1(app, monkeypatch):
    """Ana (left) and Rui (right) going; two right spots open, Tiago (right) invited on the newer one.
    The coach adds Bruno (right): the older right spot closes, and the one left open, re-counted with
    Bruno going (1 left / 2 right), flips to left and withdraws Tiago's round-1 invitation for balance.
    Before: it stayed right until its next batch."""
    from padel_app.services.lesson_service import enrol

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, _ = _class("rec", [("ana", "left"), ("rui", "right")])
        first_id = _spot(coach, instance, "right")
        second_id = _spot(coach, instance, "right")
        tiago = _invite(coach, instance, _vacancy(second_id), _roster(coach, level, "rec", "tiago", "right"))
        bruno = _roster(coach, level, "rec", "bruno", "right")

        enrol(bruno, instance, "coach")
        db.session.commit()

        assert _vacancy(first_id).status == "filled"
        assert (_vacancy(second_id).status, _vacancy(second_id).side) == ("open", "left")
        e = _event(tiago)
        assert (e.status, e.retired_reason) == ("expired", "side_balanced")


def test_a_coach_enrolment_moves_a_request_for_the_filled_side_to_its_waiting_list(app, monkeypatch):
    """Ana (left) and Rui (right) going; a right spot (older) and a left spot open. Sofia asked to
    join on the right. The coach adds Bruno (right): the right side has no spot left, so Sofia's
    request is superseded and she waits on the right waiting list (join-requests rule 20), as when
    an invitation's "yes" fills it. Before: her request stayed pending for a side with no spot."""
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.lesson_service import enrol

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, _ = _class("req", [("ana", "left"), ("rui", "right")])
        right_id = _spot(coach, instance, "right")
        _spot(coach, instance, "left")
        sofia = _roster(coach, level, "req", "sofia", "right")
        req = ClassJoinRequest(lesson_instance_id=instance.id, player_id=sofia, coach_id=coach.id,
                               status="pending", side="right")
        db.session.add(req)
        db.session.commit()
        bruno = _roster(coach, level, "req", "bruno", "right")

        enrol(bruno, instance, "coach")
        db.session.commit()

        assert _vacancy(right_id).status == "filled"
        db.session.expire_all()
        assert db.session.get(ClassJoinRequest, req.id).status == "superseded"
        entry = WaitingListEntry.query.filter_by(lesson_instance_id=instance.id, player_id=sofia).one_or_none()
        assert entry is not None and (entry.is_active, entry.side) == (True, "right")
