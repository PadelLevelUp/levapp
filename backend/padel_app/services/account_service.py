"""auth.account-deletion (PAD-268 / B-037): in-app account deletion (Apple 5.1.1(v)).

Deleting an account removes the person from the future and keeps the coach's
records (decision ``2026-09-10-account-deletion-keeps-coach-records``):

- the account itself: status ``disabled``, name "Deleted user", contact fields,
  abbreviation, birth date, country, block reason and the email-verification and
  password-reset state cleared;
- the photo: its ``images`` row deleted with the rest and, after the commit, its
  object in the uploads bucket (PAD-605), unless something else still uses it;
- the CRM: a deleting coach's HubSpot contact is archived after the commit
  (PAD-607, ``hubspot_sync.archive_deleted_coach``); the username
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
import logging
import secrets

from werkzeug.security import generate_password_hash

from padel_app.models import User
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


logger = logging.getLogger(__name__)

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
        Presence,
        StandingWaitingListEntry,
        WaitingListEntry,
    )

    def _not_started(instance):
        return instance is not None and instance.start_datetime is not None and instance.start_datetime > now

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


def _close_open_class_requests(user, now):
    """classes.class-requests rule 18: a deleting student withdraws, a deleting
    coach declines, and a deleting student leaves other people's invitee lists."""
    from padel_app.services.class_request_service import (
        close_open_requests_silently,
        drop_invitee_from_open_requests,
    )

    if user.player is not None:
        close_open_requests_silently(status="withdrawn", by="student", player_id=user.player.id, now_utc=now)
        drop_invitee_from_open_requests(user.player.id)
    if user.coach is not None:
        close_open_requests_silently(status="declined", by="coach", coach_id=user.coach.id, now_utc=now)


def _delete_stored_object(object_key):
    """Rule 2a: delete the photo's object from the uploads bucket, best-effort
    (`image_cleanup.delete_stored_object`)."""
    from padel_app.services.image_cleanup import delete_stored_object

    delete_stored_object(object_key, what="account deletion: photo", log=logger)


def _photo_to_delete(user):
    """Rule 2a: the user's photo, unless another user, a club logo or a message
    attachment still points at the same image."""
    from padel_app.services.image_cleanup import image_in_use

    photo = user.user_image
    if photo is None:
        return None
    return None if image_in_use(photo.id, except_user_id=user.id) else photo


def delete_account_service(user_id, *, now=None):
    from padel_app.models.blocked_user import BlockedUser
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.push_subscriptions import PushSubscription

    now = now or utcnow_naive()
    user = User.query.get_or_404(user_id)

    photo = _photo_to_delete(user)
    # Rule 11 (PAD-607): the CRM contact is found by the email the row is about to lose.
    crm_email = user.email if user.coach is not None else None

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
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None
    user.password_reset_sent_at = None
    user.birth_date = None
    user.country = None
    user.notif_block_reason = None
    user.username = _deleted_username()
    user.password = generate_password_hash(secrets.token_urlsafe(32))

    # Rule 4: pushes stop. Rule 5: their own social state goes.
    DeviceToken.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    # auth.social-sign-in (PAD-618): the Google / Apple links go too, so the same provider
    # account can never sign back into the deleted one.
    from padel_app.models import UserIdentity

    UserIdentity.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    PushSubscription.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    BlockedUser.query.filter(
        (BlockedUser.blocker_id == user.id) | (BlockedUser.blocked_id == user.id)
    ).delete(synchronize_session=False)
    # PAD-660 (players.nickname rule 7): a coach's nickname for this student is personal data
    # about them; it does not outlive the account. The relation rows stay (the roster filters a
    # disabled user out), the nickname does not.
    from padel_app.models import Association_CoachPlayer, Player

    student_ids = [p.id for p in Player.query.filter_by(user_id=user.id).all()]
    if student_ids:
        Association_CoachPlayer.query.filter(
            Association_CoachPlayer.player_id.in_(student_ids)
        ).update({"nickname": None, "nickname_as_name": False}, synchronize_session=False)

    # Rules 6 and 10 (PAD-360, B-135): open class requests do not outlive the
    # account — silently. Before the block purge below, so a coach's holds are
    # released through the session and not found stale by it.
    _close_open_class_requests(user, now)
    CalendarBlock.query.filter_by(user_id=user.id).delete(synchronize_session=False)

    # Rule 6: a student leaves the future (a coach's classes are untouched, rule 10).
    if user.player is not None:
        _remove_student_from_future(user.player, now)

    # Rule 2a: the photo goes with the account — the row now, the stored object
    # once the deletion is committed, so a bucket failure can never undo it.
    photo_key = None
    if photo is not None:
        photo_key = photo.object_key
        db.session.delete(photo)

    db.session.commit()
    if photo_key:
        _delete_stored_object(photo_key)
    if crm_email:
        from padel_app.services import hubspot_sync

        hubspot_sync.archive_deleted_coach(crm_email)
    return user
