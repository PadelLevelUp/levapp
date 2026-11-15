"""calendar.event-detail new-engine section ND1–ND3 (PAD-918): the class detail's invitee list of a
new-engine session reads the engine's invitations, one outcome per invitee."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


def _inv(session, student, level, *, tier=2, until=NOW + timedelta(minutes=20)):
    return fx.Invited(session, NOW, student, frozenset({SpotType("R", level)}), None, tier, until)


def _invitees(session, now=NOW):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_readers import engine_invitees

    return {i["playerId"]: i for i in engine_invitees(db.session.get(LessonInstance, int(session)), now=now)}


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-33")
def test_each_invitee_gets_the_first_matching_outcome(app):
    from padel_app.models import EngineInvitation

    with app.app_context():
        store, (s,), pids = _seed(app, players=11, capacity=8, side="right")
        _, accepted, cancelled, declined, withdrawn, same_hour, sorry, reopened, pending, late, manual = pids
        level = store.snapshot(s).level
        later = NOW + timedelta(minutes=5)
        with store.unit((s,)):
            store.apply([_inv(s, p, level) for p in (accepted, cancelled, declined, withdrawn, same_hour,
                                                    sorry, reopened, pending)]
                        + [_inv(s, late, level, until=NOW - timedelta(minutes=1)),
                           _inv(s, manual, level, tier=None)])
            store.apply([fx.Answered(s, later, accepted, "yes", "invitation"), fx.Placed(s, later, accepted, "R", "invitation"),
                         fx.Answered(s, later, cancelled, "yes", "invitation"), fx.Placed(s, later, cancelled, "R", "invitation"),
                         fx.Answered(s, later, declined, "no", "invitation"),
                         fx.InvitationClosed(s, later, same_hour),
                         fx.Sorry(s, later, sorry), fx.Sorry(s, later, reopened)])
            store.apply([fx.Left(s, later, cancelled, "cancel"),
                         fx.Reopened(s, later, reopened, frozenset({SpotType("R", level)}), None, 2,
                                     later + timedelta(minutes=20))])
            store.withdraw(EngineInvitation.query.filter_by(lesson_instance_id=int(s), player_id=int(withdrawn)).one().id,
                           later)

        got = _invitees(s, now=later)
        assert {p: got[p]["outcome"] for p in got} == {
            accepted: "accepted", cancelled: "cancelled", declined: "declined", withdrawn: "withdrawn",
            same_hour: "closed_same_hour", sorry: "sorry", reopened: "pending", pending: "pending",
            late: "not_counting", manual: "pending"}
        assert got[reopened]["reopenedAt"] is not None and got[pending]["reopenedAt"] is None
        assert (got[pending]["tierSource"], got[pending]["groupNumber"]) == ("pool", 1)
        assert got[manual]["tierSource"] is None and got[manual]["groupNumber"] is None

        started = _invitees(s, now=START + timedelta(minutes=1))     # the class has started, no answer
        assert started[pending]["outcome"] == "expired" and started[accepted]["outcome"] == "accepted"


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-37")
def test_an_old_engine_invitee_carries_no_tier_source(app):
    """The class detail payload: a new-engine invitee carries tierSource (null for a manual one); an
    old-engine invitee has no tierSource key at all."""
    from padel_app.models import EngineSession
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.serializers.lesson import serialize_class_instance

    with app.app_context():
        store, (new, old), (_, manual, invitee) = _seed(app, starts=(START, START + timedelta(hours=3)))
        with store.unit((new,)):
            store.apply([_inv(new, manual, store.snapshot(new).level, tier=None)])
        EngineSession.query.filter_by(lesson_instance_id=int(old)).delete()      # the old engine's class
        db.session.add(NotificationEvent(coach_id=store.coach_of(new), lesson_instance_id=int(old),
                                         player_id=int(invitee), type="manual", status="sent"))
        db.session.commit()

        new_row = serialize_class_instance(db.session.get(LessonInstance, int(new)))["invitations"][0]
        old_row = serialize_class_instance(db.session.get(LessonInstance, int(old)))["invitations"][0]
        assert "tierSource" in new_row and new_row["tierSource"] is None
        assert "tierSource" not in old_row
