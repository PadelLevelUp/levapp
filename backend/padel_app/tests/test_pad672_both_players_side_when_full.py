"""PAD-672 slice 3 — classes.instance-enrollment rule 13a (D8, owner Q5): a "both" player's side is
worked out when the class is full — in enrolment order, each to the side with fewer players, a tie
to the LEFT — computed while the class is open and frozen from its start. No notifications.
"""
from datetime import timedelta

from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol
from padel_app.tests.test_pad581_side_rebalance import _patch_io


def _class(tag, *, left, right, both, max_players):
    coach = _create_coach(f"p672s3{tag}")
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, f"p672s3{tag}", instance_level=level, max_players=max_players)
    for i in range(left):
        _enrol(coach, level, instance, f"p672s3{tag}-l{i}", "left")
    for i in range(right):
        _enrol(coach, level, instance, f"p672s3{tag}-r{i}", "right")
    boths = [_enrol(coach, level, instance, f"p672s3{tag}-b{i}", "both").player_id for i in range(both)]
    db.session.commit()
    return coach, level, instance, boths


def _assigned(instance):
    from padel_app.models import Presence
    from padel_app.serializers.presence import serialize_presence

    db.session.expire_all()
    return {p.player_id: serialize_presence(p)["assignedSide"]
            for p in Presence.query.filter_by(lesson_instance_id=instance.id).all()}


def test_a_full_class_gives_its_both_players_a_side_each_in_enrolment_order(app, monkeypatch):
    """4 left + 4 right + 2 both, full (10): the first "both" goes left (a tie goes left), the second
    right. Everyone else reads null."""
    _patch_io(monkeypatch)
    with app.app_context():
        _, _, instance, (first, second) = _class("a", left=4, right=4, both=2, max_players=10)
        assigned = _assigned(instance)
        assert (assigned[first], assigned[second]) == ("left", "right")
        assert {v for pid, v in assigned.items() if pid not in (first, second)} == {None}


def test_the_odd_one_goes_left(app, monkeypatch):
    _patch_io(monkeypatch)
    with app.app_context():
        _, _, instance, (only,) = _class("b", left=4, right=4, both=1, max_players=9)
        assert _assigned(instance)[only] == "left"


def test_a_short_side_takes_the_both_players_first(app, monkeypatch):
    """5 left + 3 right + 2 both: both go right (the short side), whatever their order."""
    _patch_io(monkeypatch)
    with app.app_context():
        _, _, instance, (first, second) = _class("c", left=5, right=3, both=2, max_players=10)
        assigned = _assigned(instance)
        assert (assigned[first], assigned[second]) == ("right", "right")


def test_a_class_with_a_place_leaves_them_open_and_a_cancellation_reopens_them(app, monkeypatch):
    """Not full: null. Full: assigned. One cancels (absent): null again — the saved `both` is untouched."""
    from padel_app.models import Presence

    _patch_io(monkeypatch)
    with app.app_context():
        _, _, instance, (first, second) = _class("d", left=4, right=4, both=2, max_players=11)
        assert _assigned(instance)[first] is None
        instance.max_players_override = 10
        db.session.commit()
        assert _assigned(instance)[first] == "left"
        leaver = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=second).one()
        leaver.status = "absent"
        db.session.commit()
        assert _assigned(instance)[first] is None
        assert Presence.query.filter_by(lesson_instance_id=instance.id, player_id=first).one().assigned_side is None


def test_a_both_chosen_for_this_class_counts_as_both(app, monkeypatch):
    """A left-profile student who asked to play "both" in this class (rule 20 writes it on the
    presence) is distributed like a profile "both"; their profile stays left."""
    from padel_app.models import Presence
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, _ = _class("e", left=4, right=4, both=0, max_players=9)
        cp = _enrol(coach, level, instance, "p672s3e-chooser", "left")
        presence = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=cp.player_id).one()
        presence.side = "both"
        db.session.commit()
        assert _assigned(instance)[cp.player_id] == "left"
        assert Association_CoachPlayer.query.get(cp.id).side == "left"


def test_from_the_start_the_tick_keeps_the_side_and_tells_nobody(app, monkeypatch):
    """The class starts full; the tick freezes the sides. A later change to the roster does not move
    them, and no message was sent."""
    from padel_app.models import Message, Presence
    from padel_app.services.notification_service import process_invitation_batches
    from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

    _patch_io(monkeypatch)
    with app.app_context():
        _, _, instance, (first, second) = _class("f", left=4, right=4, both=2, max_players=10)
        start = utc_to_wall_naive(utcnow_naive()) - timedelta(minutes=10)
        instance.start_datetime, instance.end_datetime = start, start + timedelta(hours=1)
        db.session.commit()
        messages = Message.query.count()
        process_invitation_batches()
        db.session.expire_all()
        stored = {p.player_id: p.assigned_side for p in Presence.query.filter_by(lesson_instance_id=instance.id)}
        assert (stored[first], stored[second]) == ("left", "right")
        Presence.query.filter_by(lesson_instance_id=instance.id, player_id=second).one().status = "absent"
        db.session.commit()
        assert _assigned(instance)[first] == "left"   # served from the stored value now
        assert Message.query.count() == messages
