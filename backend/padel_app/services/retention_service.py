"""admin.data-retention (PAD-638, PAD-602 D5): remove personal data the app no longer needs, one switch
and one period per kind, all OFF until the owner decides.

The settings live in the `data_retention` app setting: ``{<item>: {"enabled": bool, "days": int}}``.
A missing row or item, a non-boolean ``enabled`` or a non-positive ``days`` means OFF with the
recommended period (rule 1). The daily job (`scheduler._run_retention_sweep`) calls `run_retention`,
which counts every item and removes only for the enabled ones (rule 2).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Callable

from padel_app.sql_db import db

SETTING_KEY = "data_retention"


# ── the items (rule 3) ────────────────────────────────────────────────────────
# Each takes (now, days, apply) and answers how many rows are due; with apply=True it also removes
# them. Counting and removing share one query, so the dry count is exactly what a removal would take.

class PartialSweep(Exception):
    """An item that removed some rows and then failed: carries how many went before the failure, so
    the report never hides committed removals (rule 2)."""

    def __init__(self, removed: int, cause: Exception):
        super().__init__(str(cause))
        self.removed = removed


def _stale_placeholders(now: datetime, days: int, apply: bool) -> int:
    """A never-activated student (no password AND inactive: players.remove rule 5) created more than
    `days` ago, with no class in the last `days`, on exactly one roster — removed through the coach's
    own removal, so it writes the deletion_audit row and refuses anyone with an account or a second
    coach. A row whose `created_at` is unknown (NULL) is never due. Each removal commits on its own."""
    from sqlalchemy import func

    from padel_app.models import Presence, User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.services.player_service import remove_player_service

    cutoff = now - timedelta(days=days)
    recent_players = (
        db.session.query(Presence.player_id)
        .join(LessonInstance, LessonInstance.id == Presence.lesson_instance_id)
        .filter(LessonInstance.start_datetime >= cutoff)
    )
    one_coach = (
        db.session.query(Association_CoachPlayer.player_id.label("player_id"),
                         func.min(Association_CoachPlayer.coach_id).label("coach_id"))
        .group_by(Association_CoachPlayer.player_id)
        .having(func.count(Association_CoachPlayer.id) == 1)
        .subquery()
    )
    due = (
        db.session.query(Player.id, one_coach.c.coach_id)
        .join(User, User.id == Player.user_id)
        .join(one_coach, one_coach.c.player_id == Player.id)
        .filter(User.password.is_(None), User.status == "inactive", User.created_at < cutoff)
        .filter(~Player.id.in_(recent_players))
        .all()
    )
    if not apply:
        return len(due)
    removed = 0
    for player_id, coach_id in due:
        try:
            result = remove_player_service({"coachId": coach_id, "playerId": player_id, "action": "delete"})
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            raise PartialSweep(removed, exc) from exc
        status = result[1] if isinstance(result, tuple) else 200
        if status == 200:
            removed += 1
    return removed


def _deleted_message_text(now: datetime, days: int, apply: bool) -> int:
    """A deleted message keeps its row (the thread's shape) but loses its text, metadata and
    attachment once it has been deleted for `days`; a freed image goes too, row then bucket object,
    as the message delete does (messaging_service.soft_delete_message). Today's delete already blanks
    the text, so this finds rows deleted before that. An unknown `updated_at` (NULL) is never due."""
    from padel_app.model import Image
    from padel_app.models import Message
    from padel_app.services.image_cleanup import delete_stored_object, image_in_use

    q = Message.query.filter(
        Message.is_deleted.is_(True),
        Message.updated_at < now - timedelta(days=days),
        db.or_(Message.text != "", Message.msg_metadata.isnot(None), Message.attachment_id.isnot(None)),
    )
    if not apply:
        return q.count()
    rows = q.all()
    freed_keys = []
    for m in rows:
        image_id = m.attachment_id
        m.text = ""
        m.msg_metadata = None
        m.attachment_id = None
        db.session.flush()
        if image_id is not None and not image_in_use(image_id, except_message_id=m.id):
            image = db.session.get(Image, image_id)
            if image is not None:
                freed_keys.append(image.object_key)
                db.session.delete(image)
    db.session.commit()
    for key in freed_keys:  # after the commit, best-effort, as publish_message_deleted does
        delete_stored_object(key, what="message attachment")
    return len(rows)


def _expired_invitations(now: datetime, days: int, apply: bool) -> int:
    """Coach and player invitations expired more than `days` ago; coach join tokens expired, or
    deactivated, more than `days` ago."""
    from padel_app.models.coach_invitation import CoachInvitation
    from padel_app.models.coach_join_token import CoachJoinToken
    from padel_app.models.player_invitation import PlayerInvitation

    cutoff = now - timedelta(days=days)
    queries = [
        CoachInvitation.query.filter(CoachInvitation.expires_at < cutoff),
        PlayerInvitation.query.filter(PlayerInvitation.expires_at < cutoff),
        CoachJoinToken.query.filter(
            db.or_(CoachJoinToken.expires_at < cutoff,
                   db.and_(CoachJoinToken.is_active.is_(False), CoachJoinToken.updated_at < cutoff))
        ),
    ]
    if not apply:
        return sum(q.count() for q in queries)
    removed = sum(q.delete(synchronize_session=False) for q in queries)
    db.session.commit()
    return removed


def _notification_history(now: datetime, days: int, apply: bool) -> int:
    """Notification events and reminder attempts of occurrences that ended more than `days` ago."""
    from padel_app.models import NotificationEvent, ReminderAttempt
    from padel_app.models.lesson_instances import LessonInstance

    old = db.session.query(LessonInstance.id).filter(LessonInstance.end_datetime < now - timedelta(days=days))
    queries = [
        ReminderAttempt.query.filter(ReminderAttempt.lesson_instance_id.in_(old)),
        NotificationEvent.query.filter(NotificationEvent.lesson_instance_id.in_(old)),
    ]
    if not apply:
        return sum(q.count() for q in queries)
    removed = sum(q.delete(synchronize_session=False) for q in queries)
    db.session.commit()
    return removed


def _code_hashes(now: datetime, days: int, apply: bool) -> int:
    """Email-verification and password-reset code hashes whose expiry is more than `days` ago,
    cleared with their expiry and sent-at. Counted per cleared code."""
    from padel_app.models import User

    cutoff = now - timedelta(days=days)
    email = User.query.filter(User.email_verification_code_hash.isnot(None),
                              User.email_verification_expires_at < cutoff)
    reset = User.query.filter(User.password_reset_code_hash.isnot(None),
                              User.password_reset_expires_at < cutoff)
    if not apply:
        return email.count() + reset.count()
    removed = email.update({User.email_verification_code_hash: None, User.email_verification_expires_at: None,
                            User.email_verification_sent_at: None}, synchronize_session=False)
    removed += reset.update({User.password_reset_code_hash: None, User.password_reset_expires_at: None,
                             User.password_reset_sent_at: None}, synchronize_session=False)
    db.session.commit()
    return removed


def _audit_logs(now: datetime, days: int, apply: bool) -> int:
    """deletion_audit rows older than `days`. admin_audit_log is never swept: it is append-only
    (admin.foundation rule 9), so its retention needs that rule changed first."""
    from padel_app.models.deletion_audit import DeletionAudit

    q = DeletionAudit.query.filter(DeletionAudit.created_at < now - timedelta(days=days))
    if not apply:
        return q.count()
    removed = q.delete(synchronize_session=False)
    db.session.commit()
    return removed


#: name → (recommended days, sweep). The recommendations are the ones put to the owner (2026-10-12).
ITEMS: dict[str, tuple[int, Callable[[datetime, int, bool], int]]] = {
    "stale_placeholders": (365, _stale_placeholders),
    "deleted_message_text": (30, _deleted_message_text),
    "expired_invitations": (30, _expired_invitations),
    "notification_history": (365, _notification_history),
    "code_hashes": (1, _code_hashes),
    "audit_logs": (1095, _audit_logs),
}


def retention_settings() -> dict[str, dict]:
    """Rule 1: every item's switch and period, OFF with the recommended period unless the setting
    says otherwise in the right shape."""
    from padel_app.models.app_setting import AppSetting

    row = db.session.get(AppSetting, SETTING_KEY)
    stored = row.value if row is not None and isinstance(row.value, dict) else {}
    settings = {}
    for name, (default_days, _sweep) in ITEMS.items():
        item = stored.get(name) if isinstance(stored.get(name), dict) else {}
        days = item.get("days")
        valid_days = isinstance(days, int) and not isinstance(days, bool) and days > 0
        enabled = item.get("enabled") is True and valid_days
        settings[name] = {"enabled": enabled, "days": days if valid_days else default_days}
    return settings


def run_retention(now: datetime | None = None) -> dict[str, dict]:
    """Rule 2: count every item, remove for the enabled ones, one commit per item; an item that
    raises is reported and the others still run. Returns the per-item report it also logs."""
    from flask import current_app

    from padel_app.utils.dates import utcnow_naive

    now = now or utcnow_naive()
    report = {}
    for name, cfg in retention_settings().items():
        sweep = ITEMS[name][1]
        entry = {"enabled": cfg["enabled"], "days": cfg["days"]}
        try:
            entry["due"] = sweep(now, cfg["days"], False)
            entry["removed"] = sweep(now, cfg["days"], True) if cfg["enabled"] and entry["due"] else 0
        except PartialSweep as exc:  # rule 2: what was removed before the failure stays reported
            db.session.rollback()
            entry["removed"] = exc.removed
            entry["error"] = str(exc)
            current_app.logger.error("retention %s failed after %s removals: %s", name, exc.removed, exc)
        except Exception as exc:  # noqa: BLE001 — rule 2: one item never stops the others
            db.session.rollback()
            entry["error"] = str(exc)
            current_app.logger.error("retention %s failed: %s", name, exc)
        report[name] = entry
        current_app.logger.info(
            "retention %s enabled=%s days=%s due=%s removed=%s",
            name, entry["enabled"], entry["days"], entry.get("due"), entry.get("removed"),
        )
    return report
