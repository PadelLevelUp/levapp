"""admin.data-retention (PAD-638, PAD-602 D5): remove personal data the app no longer needs, one switch
and one period per kind, with the owner's periods (2026-10-21) as the defaults.

Each default period is app config `RETENTION_DAYS_<ITEM>` (rule 1); the `data_retention` app setting
overrides it: ``{<item>: {"enabled": bool, "days": int}}`` or ``{<item>: {"keep": true}}``. A missing row
or item means the default; a malformed item is OFF; ``keep`` means no period at all — not even counted.
The daily job (`scheduler._run_retention_sweep`) calls `run_retention`, which counts every item and
removes only for the enabled ones, in bounded batches (rules 2, 3).
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


BATCH_SIZE = 500
MAX_BATCHES = 20


def _positive_config(name: str, default: int) -> int:
    """An app config value that must be a positive integer; anything else is the code default (test
    apps carry no Config class attributes, so the default lives here)."""
    from flask import current_app

    raw = current_app.config.get(name)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 and not isinstance(raw, bool) else default


def _batches(due_ids, act) -> int:
    """Rule 3: select at most one batch of due ids, act on exactly those by primary key, commit, repeat
    up to the per-run ceiling. `due_ids(limit)` returns a list of ids; `act(ids)` removes or clears them
    and answers how many rows it touched. What is left is due again the next run."""
    size = _positive_config("RETENTION_BATCH_SIZE", BATCH_SIZE)
    ceiling = _positive_config("RETENTION_MAX_BATCHES", MAX_BATCHES)
    removed = 0
    for _ in range(ceiling):
        ids = due_ids(size)
        if not ids:
            break
        try:
            removed += act(ids)
            db.session.commit()
        except Exception as exc:  # noqa: BLE001
            db.session.rollback()
            raise PartialSweep(removed, exc) from exc
        if len(ids) < size:
            break
    return removed


def _delete_rows(model, *criteria):
    """(count, remove) for rows of `model` matching `criteria`, removed in batches by id."""

    def count():
        return model.query.filter(*criteria).count()

    def remove():
        def due_ids(limit):
            return [i for (i,) in db.session.query(model.id).filter(*criteria).order_by(model.id).limit(limit)]

        def act(ids):
            return model.query.filter(model.id.in_(ids)).delete(synchronize_session=False)

        return _batches(due_ids, act)

    return count, remove


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

    criteria = (
        Message.is_deleted.is_(True),
        Message.updated_at < now - timedelta(days=days),
        db.or_(Message.text != "", Message.msg_metadata.isnot(None), Message.attachment_id.isnot(None)),
    )
    if not apply:
        return Message.query.filter(*criteria).count()
    freed_keys = []

    def due_ids(limit):
        return [i for (i,) in db.session.query(Message.id).filter(*criteria).order_by(Message.id).limit(limit)]

    def act(ids):
        rows = Message.query.filter(Message.id.in_(ids)).all()
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
        return len(rows)

    try:
        return _batches(due_ids, act)
    finally:
        for key in freed_keys:  # after the commits, best-effort, as publish_message_deleted does
            delete_stored_object(key, what="message attachment")


def _expired_invitations(now: datetime, days: int, apply: bool) -> int:
    """Coach and player invitations expired more than `days` ago; coach join tokens expired, or
    deactivated, more than `days` ago."""
    from padel_app.models.coach_invitation import CoachInvitation
    from padel_app.models.coach_join_token import CoachJoinToken
    from padel_app.models.player_invitation import PlayerInvitation

    cutoff = now - timedelta(days=days)
    parts = [
        _delete_rows(CoachInvitation, CoachInvitation.expires_at < cutoff),
        _delete_rows(PlayerInvitation, PlayerInvitation.expires_at < cutoff),
        _delete_rows(
            CoachJoinToken,
            db.or_(CoachJoinToken.expires_at < cutoff,
                   db.and_(CoachJoinToken.is_active.is_(False), CoachJoinToken.updated_at < cutoff)),
        ),
    ]
    return _run_parts(parts, apply)


def _run_parts(parts, apply: bool) -> int:
    """Count or remove several tables' rows for one item; a failure part-way keeps the earlier
    tables' removals in the report (rule 2)."""
    if not apply:
        return sum(count() for count, _remove in parts)
    removed = 0
    for _count, remove in parts:
        try:
            removed += remove()
        except PartialSweep as exc:
            raise PartialSweep(removed + exc.removed, exc) from exc
    return removed


def _notification_history(now: datetime, days: int, apply: bool) -> int:
    """Notification events and reminder attempts of occurrences that ended more than `days` ago."""
    from padel_app.models import NotificationEvent, ReminderAttempt
    from padel_app.models.lesson_instances import LessonInstance

    old = db.session.query(LessonInstance.id).filter(LessonInstance.end_datetime < now - timedelta(days=days))
    parts = [
        _delete_rows(ReminderAttempt, ReminderAttempt.lesson_instance_id.in_(old)),
        _delete_rows(NotificationEvent, NotificationEvent.lesson_instance_id.in_(old)),
    ]
    return _run_parts(parts, apply)


def _code_hashes(now: datetime, days: int, apply: bool) -> int:
    """Email-verification and password-reset code hashes whose expiry is more than `days` ago,
    cleared with their expiry and sent-at. Counted per cleared code."""
    from padel_app.models import User

    cutoff = now - timedelta(days=days)
    kinds = [
        ((User.email_verification_code_hash.isnot(None), User.email_verification_expires_at < cutoff),
         {User.email_verification_code_hash: None, User.email_verification_expires_at: None,
          User.email_verification_sent_at: None}),
        ((User.password_reset_code_hash.isnot(None), User.password_reset_expires_at < cutoff),
         {User.password_reset_code_hash: None, User.password_reset_expires_at: None,
          User.password_reset_sent_at: None}),
    ]
    parts = []
    for criteria, cleared in kinds:
        def count(criteria=criteria):
            return User.query.filter(*criteria).count()

        def remove(criteria=criteria, cleared=cleared):
            def due_ids(limit):
                return [i for (i,) in db.session.query(User.id).filter(*criteria).order_by(User.id).limit(limit)]

            def act(ids):
                return User.query.filter(User.id.in_(ids)).update(cleared, synchronize_session=False)

            return _batches(due_ids, act)

        parts.append((count, remove))
    return _run_parts(parts, apply)


def _audit_logs(now: datetime, days: int, apply: bool) -> int:
    """deletion_audit rows created more than `days` ago."""
    from padel_app.models.deletion_audit import DeletionAudit

    return _run_parts([_delete_rows(DeletionAudit, DeletionAudit.created_at < now - timedelta(days=days))], apply)


def _admin_audit_log(now: datetime, days: int, apply: bool) -> int:
    """admin_audit_log rows created more than `days` ago — the single sanctioned removal from the
    append-only log (rule 5; admin.foundation rule 9): only under the session flag the model's guard
    honours, cleared again whatever happens."""
    from padel_app.models.admin_audit_log import RETENTION_FLAG, AdminAuditLog

    parts = [_delete_rows(AdminAuditLog, AdminAuditLog.created_at < now - timedelta(days=days))]
    if not apply:
        return _run_parts(parts, False)
    db.session.info[RETENTION_FLAG] = True
    try:
        return _run_parts(parts, True)
    finally:
        db.session.info.pop(RETENTION_FLAG, None)


#: name → (default days, sweep): the owner's periods (2026-10-21), each overridable by app config
#: `RETENTION_DAYS_<NAME>` (rule 1). KEEP_BY_DEFAULT: items the owner answered "keep" — never-activated
#: students (2026-10-13) and deleted messages' rows (2026-10-21; PAD-639 already erases the text) —
#: which stay keep until a setting turns them on.
ITEMS: dict[str, tuple[int, Callable[[datetime, int, bool], int]]] = {
    "stale_placeholders": (365, _stale_placeholders),
    "deleted_message_text": (30, _deleted_message_text),
    "expired_invitations": (30, _expired_invitations),
    "notification_history": (365, _notification_history),
    "code_hashes": (30, _code_hashes),
    "audit_logs": (1825, _audit_logs),
    "admin_audit_log": (1825, _admin_audit_log),
}
KEEP_BY_DEFAULT = frozenset({"stale_placeholders", "deleted_message_text"})


def default_days(name: str) -> int:
    """Rule 1: the item's period from app config, else the owner's period."""
    return _positive_config(f"RETENTION_DAYS_{name.upper()}", ITEMS[name][0])


def retention_settings() -> dict[str, dict]:
    """Rule 1: every item's switch and period — the default unless the setting says otherwise; a
    malformed stored item is OFF, never swept at a period nobody meant."""
    from padel_app.models.app_setting import AppSetting

    row = db.session.get(AppSetting, SETTING_KEY)
    stored = row.value if row is not None and isinstance(row.value, dict) else {}
    settings = {}
    for name in ITEMS:
        default = default_days(name)
        item = stored.get(name) if isinstance(stored.get(name), dict) else None
        if item is None and name in KEEP_BY_DEFAULT or (item or {}).get("keep") is True:
            # "Keep": no period at all — nothing is due and nothing is removed (rule 1).
            settings[name] = {"enabled": False, "keep": True, "days": None}
            continue
        item = item or {}
        days = item.get("days", default)
        valid_days = isinstance(days, int) and not isinstance(days, bool) and days > 0
        enabled = item.get("enabled", name not in KEEP_BY_DEFAULT)  # a keep item turns on only explicitly
        enabled = enabled is True and valid_days
        settings[name] = {"enabled": enabled, "days": days if valid_days else default}
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
        if cfg.get("keep"):
            entry.update(keep=True, due=None, removed=0)
            report[name] = entry
            current_app.logger.info("retention %s keep (no period)", name)
            continue
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
