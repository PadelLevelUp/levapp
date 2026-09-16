"""Operator-level settings (auth.coach-approval rule 9; PAD-238 item 3 via PAD-279).

A stored ``AppSetting`` row wins; with no row (or a row whose value is not the
expected type) the process falls back to its env flag. The superadmin surface
is ``GET|PUT /api/app/admin/settings`` in ``modules/frontend_api.py``.
"""
from datetime import datetime

from flask import current_app

from padel_app.models.app_setting import AppSetting
from padel_app.sql_db import db

COACH_APPROVAL_REQUIRED = "coach_approval_required"


def _stored_bool(key):
    row = db.session.get(AppSetting, key)
    if row is not None and isinstance(row.value, bool):
        return row.value
    return None


def coach_approval_required() -> bool:
    """Does a self-registered coach wait for the LevApp admin? Row, else env."""
    stored = _stored_bool(COACH_APPROVAL_REQUIRED)
    if stored is not None:
        return stored
    return bool(current_app.config.get("COACH_APPROVAL_REQUIRED", True))


def admin_settings_payload() -> dict:
    stored = _stored_bool(COACH_APPROVAL_REQUIRED)
    return {
        "coachApprovalRequired": coach_approval_required(),
        "source": "database" if stored is not None else "environment",
    }


def set_coach_approval_required(enabled: bool, *, updated_by_user_id) -> None:
    """Upsert the row. Never touches an existing coach's ``approval_status``:
    the gate decides what a NEW registration starts as, nothing else."""
    if not isinstance(enabled, bool):
        raise ValueError("coach_approval_required must be a boolean")
    row = db.session.get(AppSetting, COACH_APPROVAL_REQUIRED)
    if row is None:
        row = AppSetting(key=COACH_APPROVAL_REQUIRED)
        db.session.add(row)
    row.value = enabled
    row.updated_at = datetime.utcnow()
    row.updated_by_user_id = updated_by_user_id
    db.session.commit()
