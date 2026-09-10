"""auth.account-deletion (PAD-268 / B-037): in-app account deletion (Apple 5.1.1(v)).

Deleting an account removes the person from the future and keeps the coach's
records (decision ``2026-09-10-account-deletion-keeps-coach-records``):

- the account itself: status ``disabled``, name "Deleted user", contact fields,
  photo, abbreviation and email-verification state cleared; the username
  becomes an unguessable ``deleted-…`` (never the ``pending-`` placeholder
  prefix, so the record can never be claimed) and the password the hash of a
  secret nobody holds (never NULL, so activation cannot re-open it);
- sessions: a disabled user's JWTs are rejected by the blocklist loader, and
  the legacy session login and user loader refuse a disabled account;
- delivery: device tokens and web-push subscriptions are deleted;
- their own social state: blocks in both directions and calendar blocks;
- a student leaves the future, silently: enrolment and presence in every class
  that has not started, series enrolment where the series still has an
  occurrence ahead, and every active waiting-list entry (standing ones
  included), with no vacancy and no invitation;
- kept as the coach's and the counterpart's records: past attendance,
  evaluations, notes, level history, the roster row and sent messages, all
  shown as "Deleted user".

The row itself is kept so message authorship and history still resolve.
Everything happens in one transaction.
"""
import secrets

from werkzeug.security import generate_password_hash

from padel_app.models import User
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

DELETED_NAME = "Deleted user"
DELETED_USERNAME_PREFIX = "deleted-"


def _deleted_username():
    """A fresh ``deleted-<16 hex>`` nobody holds (and nobody can guess)."""
    while True:
        candidate = f"{DELETED_USERNAME_PREFIX}{secrets.token_hex(8)}"
        if User.query.filter_by(username=candidate).first() is None:
            return candidate


def _has_occurrence_ahead(lesson, now):
    if lesson.recurrence_rule or lesson.is_recurring:
        return lesson.recurrence_end is None or lesson.recurrence_end >= now.date()
    return lesson.start_datetime is not None and lesson.start_datetime > now


def _remove_student_from_future(player, now):
    """Rule 6: out of every class that has not started, silently."""
    from padel_app.models import (
        Association_PlayerLesson,
        Association_PlayerLessonInstance,
        Presence,
        StandingWaitingListEntry,
        WaitingListEntry,
    )

    def _not_started(instance):
        return instance is not None and instance.start_datetime is not None and instance.start_datetime > now

    for rel in Association_PlayerLessonInstance.query.filter_by(player_id=player.id).all():
        if _not_started(rel.lesson_instance):
            db.session.delete(rel)
    for presence in Presence.query.filter_by(player_id=player.id).all():
        if _not_started(presence.lesson_instance):
            db.session.delete(presence)
    for rel in Association_PlayerLesson.query.filter_by(player_id=player.id).all():
        if rel.lesson is not None and _has_occurrence_ahead(rel.lesson, now):
            db.session.delete(rel)

    # Waiting lists: the standing entries (whose credits placements spend) and
    # every per-class entry, including the ones a standing entry fanned out.
    # Deactivated inline rather than through notification_service's
    # _deactivate_standing_entry, which commits per row and would split this
    # cascade across transactions.
    StandingWaitingListEntry.query.filter_by(player_id=player.id, is_active=True).update(
        {"is_active": False}, synchronize_session=False
    )
    WaitingListEntry.query.filter_by(player_id=player.id, is_active=True).update(
        {"is_active": False}, synchronize_session=False
    )


def delete_account_service(user_id, *, now=None):
    from padel_app.models.blocked_user import BlockedUser
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.push_subscriptions import PushSubscription

    now = now or utcnow_naive()
    user = User.query.get_or_404(user_id)

    # Rule 2: the account itself is gone.
    user.status = "disabled"
    user.name = DELETED_NAME
    user.email = None
    user.phone = None
    user.generated_code = None
    user.user_image_id = None
    user.abbreviation = None
    user.email_verification_code_hash = None
    user.email_verification_expires_at = None
    user.email_verification_sent_at = None
    user.username = _deleted_username()
    user.password = generate_password_hash(secrets.token_urlsafe(32))

    # Rule 4: pushes stop. Rule 5: their own social state goes.
    DeviceToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    PushSubscription.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    BlockedUser.query.filter(
        (BlockedUser.blocker_id == user.id) | (BlockedUser.blocked_id == user.id)
    ).delete(synchronize_session=False)
    CalendarBlock.query.filter_by(user_id=user.id).delete(synchronize_session=False)

    # Rule 6: a student leaves the future (a coach's classes are untouched, rule 10).
    if user.player is not None:
        _remove_student_from_future(user.player, now)

    db.session.commit()
    return user
