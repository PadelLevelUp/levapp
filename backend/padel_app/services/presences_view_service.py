"""settings.coach-presences-view rules 1-2 (PAD-837b): the coach's saved Presences columns.

The server checks the shape, not the ids: the column list is the shells' (`@levelup/config`),
so a column added or retired later never makes an older saved view unreadable or a newer one
unsavable.
"""
from padel_app.models import Coach
from padel_app.services.availability_service import refuse
from padel_app.sql_db import db

MAX_COLUMNS = 32
MAX_COLUMN_ID_LENGTH = 40


def validate_presences_view(payload):
    """`None` clears the view; otherwise `{"columns": [<distinct str>, ...]}` or a 400."""
    if payload is None:
        return None
    columns = payload.get("columns") if isinstance(payload, dict) else None
    if (
        not isinstance(columns, list)
        or len(columns) > MAX_COLUMNS
        or not all(isinstance(c, str) and len(c) <= MAX_COLUMN_ID_LENGTH for c in columns)
        or len(set(columns)) != len(columns)
    ):
        refuse(
            400,
            "INVALID_PRESENCES_VIEW",
            f"columns must be a list of at most {MAX_COLUMNS} distinct ids of at most "
            f"{MAX_COLUMN_ID_LENGTH} characters",
        )
    return payload


def set_presences_view(coach: Coach, payload):
    """Replaces the whole value; nothing is stored when the shape is refused."""
    coach.presences_view = validate_presences_view(payload)
    db.session.commit()
    return coach.presences_view
