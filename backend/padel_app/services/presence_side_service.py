"""PAD-551 — classes.instance-enrollment rule 13: a player's side in one occurrence.

A regular student usually plays one side (the coach–player link); in a given week they may play
the other, and the coach records it on that occurrence's presence. The side the class's balancing
counts is then that one (`notification_service.sides_in_occurrence`), and the change re-counts the
class's open spots exactly as a "yes" does (notifications.invitations rule 2d). The student is not
told: the coach records what the student said.
"""
from padel_app.sql_db import db
from padel_app.utils.dates import club_now_naive

SIDES = ("left", "right")


class PresenceSideError(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status = status
        self.code = code


def set_presence_side(coach, instance, player_id, side):
    """Set (``left`` / ``right``) or clear (``None``) ``player_id``'s side in ``instance``; one
    commit. The caller has checked that ``coach`` owns the class. Returns the presence.

    Raises ``PresenceSideError``: 400 for another value, 404 for a player with no presence on this
    occurrence, 409 once the occurrence has ended (class times are club-local, R-023)."""
    from padel_app.models.presences import Presence
    from padel_app.services import notification_service as ns
    from padel_app.services.lesson_service import primary_coach

    if side is not None and side not in SIDES:
        raise PresenceSideError(400, "INVALID_SIDE")
    # Rule 10: the class lock first, so the re-count sees what is committed now and two changes
    # (or a change and a "yes") never interleave.
    instance = ns._lock_instance(instance)
    if instance.end_datetime is not None and instance.end_datetime <= club_now_naive():
        db.session.rollback()
        raise PresenceSideError(409, "OCCURRENCE_ENDED")
    presence = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=player_id).first()
    if presence is None:
        db.session.rollback()
        raise PresenceSideError(404, "NO_PRESENCE")
    if presence.side == side:
        db.session.rollback()
        return presence
    presence.side = side
    db.session.flush()
    owner = primary_coach(instance)
    retired = ns.rebalance_after_side_change(instance, owner.id if owner is not None else coach.id)
    ns._publish_retired(retired)  # queued, sent by the commit below (PAD-499)
    db.session.commit()
    return presence
