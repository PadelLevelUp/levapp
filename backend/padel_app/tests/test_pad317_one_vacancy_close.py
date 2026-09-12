"""PAD-317: every path that fills a vacancy closes it the same way.

Ledger B-081. A vacancy was closed by hand in three places and by
``_close_vacancy`` in one, so "filled" meant something slightly different down
each door:

* the student-accept path expired only ``sent`` events, so a ``queued``
  invitation survived the close and was sent AFTERWARDS — an invitation to a
  seat that was already taken;
* the coach-accept path expired the events but never retired the invite
  MESSAGES, so the candidates' bubbles kept live Yes/No buttons;
* the waiting-list placement retired nothing at all: every invitation for the
  seat stayed live in the candidates' inboxes, and one of them could still
  accept a spot that no longer existed;
* the join-request accept retired through ``_broadcast_spot_filled``, which
  matched ``sent`` only, so a ``queued`` invitation survived there too.

One test per caller, each asserting the same invariant in both live states: after
the close, no event for that vacancy is left in ``LIVE_INVITATION_STATES``, and
no invite message is left actionable.
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_integration import (
    PATCHES,
    _create_coach,
    _create_coach_player,
    _create_instance,
    _create_level,
    _create_player,
    _create_user,
    _seed_notification_config,
)


def _world(app, *, max_players=4, enrolled=("Ana",), candidates=("Bea", "Caio")):
    with app.app_context():
        coach = _create_coach(_create_user("Coach", "coach-317"))
        level = _create_level(coach)
        seated = [_create_player(_create_user(n, f"{n.lower()}-317")) for n in enrolled]
        waiting = [_create_player(_create_user(n, f"{n.lower()}-317")) for n in candidates]
        for p in seated + waiting:
            _create_coach_player(coach, p, level)
        instance = _create_instance(coach, level, enrolled_players=seated, max_players=max_players)
        _seed_notification_config(coach.id)
        return {
            "coach_id": coach.id,
            "instance_id": instance.id,
            **{n.lower(): p.id for n, p in zip(enrolled, seated)},
            **{n.lower(): p.id for n, p in zip(candidates, waiting)},
            **{f"{n.lower()}_user_id": p.user_id for n, p in zip(candidates, waiting)},
        }


def _open_vacancy(instance_id, coach_id, original_player_id=None):
    from padel_app.models import Vacancy

    v = Vacancy(
        lesson_instance_id=instance_id, coach_id=coach_id,
        original_player_id=original_player_id, status="open",
        approval_status="not_required",
    )
    db.session.add(v)
    db.session.commit()
    return v.id


def _invite(instance_id, coach_id, player_id, vacancy_id, status, *, with_message=True):
    """One invitation in a given live state, with the conversation message that
    delivered it (that message is what keeps Yes/No buttons on screen)."""
    from padel_app.models import Coach, Message, NotificationEvent, Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    message_id = None
    if with_message:
        player = Player.query.get(player_id)
        coach_user_id = Coach.query.get(coach_id).user_id
        # The real conversation helper: `conversations.participant_key` is NOT
        # NULL and derived, so a hand-built row cannot stand in for it.
        conv = _get_or_create_direct_conversation(coach_user_id, player.user_id)
        msg = Message(
            text="A spot opened up", conversation_id=conv.id,
            sender_id=coach_user_id, message_type="invitation",
            msg_metadata={"lessonInstanceId": instance_id},
        )
        db.session.add(msg)
        db.session.flush()
        message_id = msg.id
    ev = NotificationEvent(
        coach_id=coach_id, lesson_instance_id=instance_id, player_id=player_id,
        type="auto", round_number=1, status=status, vacancy_id=vacancy_id,
        message_id=message_id,
    )
    db.session.add(ev)
    db.session.commit()
    return ev.id


def _live_events(vacancy_id):
    from padel_app.models import NotificationEvent
    from padel_app.services.notification_service import LIVE_INVITATION_STATES

    return (
        NotificationEvent.query.filter(
            NotificationEvent.vacancy_id == vacancy_id,
            NotificationEvent.status.in_(LIVE_INVITATION_STATES),
        )
        .all()
    )


def _message_is_actionable(event_id):
    from padel_app.models import Message, NotificationEvent

    event = NotificationEvent.query.get(event_id)
    if not event.message_id:
        return False
    msg = Message.query.get(event.message_id)
    return not (msg.msg_metadata or {}).get("responded")


# --- caller 1: a student accepts their invitation --------------------------

def test_the_student_accept_retires_every_live_invitation_including_queued(app):
    ids = _world(app)
    with app.app_context():
        from padel_app.services.notification_service import respond_to_notification

        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        accepted = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        queued = _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "queued")

        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_notification(accepted, "yes", ids["bea_user_id"])

        from padel_app.models import NotificationEvent, Vacancy

        assert Vacancy.query.get(vacancy_id).status == "filled"
        assert NotificationEvent.query.get(accepted).status == "confirmed"
        # The queued one is the regression: it used to survive and be sent after.
        assert _live_events(vacancy_id) == []
        assert NotificationEvent.query.get(queued).status == "expired"
        assert not _message_is_actionable(queued)


# --- caller 2: the coach accepts on the student's behalf -------------------

def test_the_coach_accept_retires_the_events_and_their_messages(app):
    ids = _world(app)
    with app.app_context():
        from padel_app.services.notification_service import coach_respond_to_notification

        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        accepted = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        other = _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "queued")

        with patch(PATCHES[0]), patch(PATCHES[1]):
            coach_respond_to_notification(accepted, "yes", ids["coach_id"])

        from padel_app.models import NotificationEvent, Vacancy

        assert Vacancy.query.get(vacancy_id).status == "filled"
        assert NotificationEvent.query.get(accepted).status == "confirmed"
        assert _live_events(vacancy_id) == []
        # This path expired the row but left the bubble live — the button stayed.
        assert not _message_is_actionable(other)


# --- caller 3: a waiting-list placement ------------------------------------

def test_the_waiting_list_placement_retires_the_invitations_it_outran(app):
    ids = _world(app)
    with app.app_context():
        from padel_app.models import LessonInstance, NotificationEvent, Vacancy, WaitingListEntry
        from padel_app.services.notification_service import (
            _fill_from_waiting_list,
            get_or_create_config,
        )

        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        sent = _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent")
        queued = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "queued")

        entry = WaitingListEntry(
            lesson_instance_id=ids["instance_id"], player_id=ids["bea"],
            coach_id=ids["coach_id"], is_active=True,
        )
        db.session.add(entry)
        db.session.commit()

        with patch(PATCHES[0]), patch(PATCHES[1]):
            placed = _fill_from_waiting_list(
                entry,
                Vacancy.query.get(vacancy_id),
                LessonInstance.query.get(ids["instance_id"]),
                ids["coach_id"],
                get_or_create_config(ids["coach_id"]),
            )

        assert placed is True
        assert Vacancy.query.get(vacancy_id).status == "filled"
        # This path retired nothing at all: both of these used to stay live.
        assert _live_events(vacancy_id) == []
        assert NotificationEvent.query.get(sent).status == "expired"
        assert NotificationEvent.query.get(queued).status == "expired"
        assert not _message_is_actionable(sent)
        assert not _message_is_actionable(queued)


# --- the routine's own contract --------------------------------------------

def test_the_close_spares_only_the_event_it_is_told_to_spare(app):
    ids = _world(app)
    with app.app_context():
        from padel_app.models import NotificationEvent, Vacancy
        from padel_app.services.notification_service import _close_vacancy

        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        keep = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        drop = _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "queued")

        retired = _close_vacancy(
            Vacancy.query.get(vacancy_id), ids["bea"], except_event_id=keep
        )
        db.session.commit()

        assert [e.id for e in retired] == [drop]
        assert NotificationEvent.query.get(keep).status == "sent"
        assert NotificationEvent.query.get(drop).status == "expired"


def test_a_second_close_is_a_no_op(app):
    """Idempotent: nothing is left live to retire, and the first filler stands."""
    ids = _world(app)
    with app.app_context():
        from padel_app.models import Vacancy
        from padel_app.services.notification_service import _close_vacancy

        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent")

        first = _close_vacancy(Vacancy.query.get(vacancy_id), ids["bea"])
        db.session.commit()
        second = _close_vacancy(Vacancy.query.get(vacancy_id), ids["caio"])
        db.session.commit()

        assert len(first) == 1 and second == []
        assert _live_events(vacancy_id) == []


# --- caller 4: the coach accepts a join request ----------------------------

def test_the_join_request_accept_retires_every_live_invitation(app):
    """The fourth door (classes.join-requests rule 10). It already retired through
    the broadcast, but that matched ``sent`` only — a queued invitation lived on."""
    from padel_app.models import NotificationEvent, Vacancy
    from padel_app.tests.test_pad128_eligibility import _seed
    from padel_app.tests.test_pad131_join_requests import _config, _decide, _request, _student

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    asker = _student(app, ids, "asker-317")
    candidate = _student(app, ids, "candidate-317")

    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"])
        queued = _invite(
            ids["instance_id"], ids["coach_id"], candidate, vacancy_id, "queued",
        )

    request_id, _, _ = _request(app, ids, asker)
    with patch(PATCHES[0]), patch(PATCHES[1]):
        assert _decide(app, ids, request_id, accept=True) == "accepted"

    with app.app_context():
        vacancy = Vacancy.query.get(vacancy_id)
        assert (vacancy.status, vacancy.filled_by_player_id) == ("filled", asker)
        assert _live_events(vacancy_id) == []
        assert NotificationEvent.query.get(queued).status == "expired"
