"""
PAD-763 (B-701): a class whose freed spot was filled never opened its other free seat.

`_create_structural_vacancies` counted spots to open as capacity - seats held - vacancies `open` or
`filled`. The student who fills a spot is enrolled, so `effective_filled_spots` already counts their
seat; subtracting the filled row again counts it twice. The tick's scan (rule 1c) skips any class
with a vacancy row of any status, so once the freed spot was filled no path opened the class's
other free seat. On prod a class of 16 sat at 15 for a week with a student on its waiting list
never offered the seat ("case 16").

invitations rule 1d: a free seat is capacity minus the seats held (players going plus not yet
answered: the participants header's "K vagas"); a filled spot's seat is its filler's and counts
once, through them. Never-filled spots open for the free seats no open or expired spot already
stands for, at the window and, for a class whose only spots are filled, at the next tick.

Pinned clock (`NOW`, the class tomorrow 09:00, the window open). The seed: a class of 4 with 3
enrolled; one of them gave the place up and a candidate filled it, so 3 seats are held (2 + the
filler), one filled vacancy, and one seat is free.
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad446_waiting_list_group_zero import _entry, _invites
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _live_events, _seed


def _class_with_a_filled_spot(monkeypatch, *, max_players=4):
    """Returns (instance_id, coach_id, filler, others). `others` are candidates never asked."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, coach_id, students, others = _seed(enrolled=3, candidates=4, max_players=max_players)
    leaver, filler, rest = students[0], others[0], others[1:]
    presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=leaver).one()
    presence.status = "absent"
    presence.confirmed = True
    instance = LessonInstance.query.get(instance_id)
    enrol(filler, instance, "fill", confirmed=True)
    db.session.add(Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, original_player_id=leaver,
                           status="filled", approval_status="not_required", filled_by_player_id=filler,
                           filled_at=NOW, current_round_number=1, current_batch_number=1))
    db.session.commit()
    db.session.expire_all()
    instance = LessonInstance.query.get(instance_id)
    assert instance.effective_filled_spots == 3
    return instance_id, coach_id, filler, rest


def _spots(instance_id, status="open"):
    from padel_app.models.vacancy import Vacancy

    return Vacancy.query.filter_by(lesson_instance_id=instance_id, status=status).all()


def test_the_invitation_start_opens_the_free_seat_beside_a_filled_spot(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, filler, rest = _class_with_a_filled_spot(monkeypatch)

        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        opened = _spots(instance_id)
        assert [v.original_player_id for v in opened] == [None], "exactly one never-filled spot"
        invited = {pid for _vid, pid in _live_events(instance_id)}
        assert invited and invited <= set(rest), "the free seat is offered, never to the filler"


def test_the_tick_reaches_a_class_whose_only_spot_is_filled(app, monkeypatch):
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, _coach_id, _filler, _rest = _class_with_a_filled_spot(monkeypatch)

        process_invitation_batches(now=NOW)
        assert len(_spots(instance_id)) == 1, "the next tick opens the hidden seat, no backfill"
        assert len(_live_events(instance_id)) == 3

        process_invitation_batches(now=NOW)
        assert len(_spots(instance_id)) == 1, "and opens it once"


def test_the_waiting_list_is_offered_the_free_seat_first(app, monkeypatch):
    """Who gets it: the never-filled spot's own order, the waiting list first (rule 8a)."""
    from datetime import timedelta

    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _filler, rest = _class_with_a_filled_spot(monkeypatch)
        _entry(instance_id, coach_id, rest[-1], NOW - timedelta(days=7))

        process_invitation_batches(now=NOW)
        assert _invites(instance_id)[0] == (rest[-1], 0)


def test_a_full_class_with_a_filled_spot_opens_nothing(app, monkeypatch):
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, _coach_id, _filler, _rest = _class_with_a_filled_spot(monkeypatch, max_players=3)

        process_invitation_batches(now=NOW)
        assert _spots(instance_id) == []
        assert _live_events(instance_id) == []


def test_an_expired_spot_stays_closed_and_the_other_free_seats_open(app, monkeypatch):
    """The coordinator's case (instance 532 on prod): a freed spot ran out of rounds and expired
    while two seats had never been filled. Rule 1c keeps the expired spot closed; the class's other
    seats still open. Once those expire too, nothing comes back: no spot reopened in a loop."""
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches
    from padel_app.tests.helpers import pin_clock

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        pin_clock(monkeypatch, NOW)
        instance_id, coach_id, students, _others = _seed(enrolled=2, candidates=4, max_players=4)
        leaver = students[0]
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=leaver).one()
        presence.status = "absent"
        presence.confirmed = True
        db.session.add(Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, original_player_id=leaver,
                               side="left", status="expired", approval_status="not_required",
                               current_round_number=2, current_batch_number=1))
        db.session.commit()

        process_invitation_batches(now=NOW)
        opened = _spots(instance_id)
        assert [v.original_player_id for v in opened] == [None, None], "the two never-filled seats"
        assert len(_spots(instance_id, "expired")) == 1, "the expired spot is not reopened"

        for v in opened:
            v.status = "expired"
        db.session.commit()
        process_invitation_batches(now=NOW)
        assert _spots(instance_id) == [], "every free seat already ran out: nothing reopens"
