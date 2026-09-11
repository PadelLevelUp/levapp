"""PAD-279 (audit M21): typed NotificationConfig columns, app_settings table, legacy rounds gone

Revision ID: 390bf6e8be12
Revises: 95bfee084ad1
Create Date: 2026-09-11

Chained after batch 3's head 95bfee084ad1 (coordinator, 2026-09-11); batch 4's
chain is 95bfee084ad1 <- 390bf6e8be12, a single head.

What it does, in order, every step guarded so the revision is idempotent and
safe on a prod-shaped database (staging is a copy of prod, PAD-200/220):

1. ``app_settings`` (auth.coach-approval rule 9): one operator setting per row.
   Nothing is seeded — with no row the process keeps reading its env flag.
2. Typed columns on ``notification_configs`` for every scalar setting that
   lived inside the ``reminder_timing``, ``invitation_start_timing`` and
   ``restrictions`` JSON blobs, each with the database default the old getter
   returned for a missing key, plus ``excluded_player_ids`` (JSON list) and
   ``schema_version`` (0 = not backfilled yet, 1 = backfilled).
3. Backfill, row by row, for rows still at ``schema_version = 0`` while the
   old columns exist: the blobs are parsed in Python by ``typed_from_json``
   (inlined; a migration never imports app code). Precedence is the one the
   old getters had: ``reminder_timing["invitationStart"]`` beats the
   ``invitation_start_timing`` column; a flat ``reminder_timing`` (no
   ``firstReminder`` wrapper) IS the first reminder. A blob that does not
   parse, or a value of the wrong type, keeps the column default for that
   part — exactly what the old getter answered for it — and is logged with the
   row id; no row is skipped and the migration never fails on data. Re-running
   finds no row at version 0 and changes nothing.
4. Drop ``rounds``, ``invitation_start_timing``, ``reminder_timing`` and
   ``restrictions``. ``rounds`` was never written by any client (the TS type
   has no such key); its engine fallback for an empty ``invitation_groups``
   list produced the same three waves the built-in groups define, so the
   getter now returns those for ``[]`` and nobody's invitations change.

``downgrade`` is a real inverse: it re-adds the four JSON columns, composes
them from the typed columns, drops the typed columns and ``app_settings``.
"""
import json
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "390bf6e8be12"
down_revision = "95bfee084ad1"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

TABLE = "notification_configs"

# --- defaults, mirroring padel_app/models/notification_config.py at this revision
DEFAULT_REMINDER = ("hours_before", 48, None)
DEFAULT_INVITATION_START = ("hours_before", 24, None)
DEFAULTS = {
    "reminder_type": "hours_before",
    "reminder_value": 48,
    "reminder_time": None,
    "invitation_start_type": "hours_before",
    "invitation_start_value": 24,
    "invitation_start_time": None,
    "reminder_count": 1,
    "hours_between_reminders": 24.0,
    "cancellation_deadline_hours": 24.0,
    "max_simultaneous_enabled": True,
    "max_simultaneous_value": 3,
    "max_total_enabled": True,
    "max_total_value": 10,
    "min_time_before_class_enabled": False,
    "min_time_before_class_value": 30,
    "max_invites_per_student_per_day_enabled": False,
    "max_invites_per_student_per_day_value": 3,
    "quiet_hours_enabled": False,
    "max_inactive_time_enabled": True,
    "max_inactive_time_value": 120,
    "exclude_inactive_accounts": False,
    "excluded_players_enabled": False,
    "excluded_player_ids": [],
}

#: (column, type, server default)
TYPED_COLUMNS = (
    ("reminder_type", sa.String(32), "'hours_before'"),
    ("reminder_value", sa.Integer(), "48"),
    ("reminder_time", sa.String(5), None),
    ("invitation_start_type", sa.String(32), "'hours_before'"),
    ("invitation_start_value", sa.Integer(), "24"),
    ("invitation_start_time", sa.String(5), None),
    ("reminder_count", sa.Integer(), "1"),
    ("hours_between_reminders", sa.Float(), "24"),
    ("cancellation_deadline_hours", sa.Float(), "24"),
    ("max_simultaneous_enabled", sa.Boolean(), "true"),
    ("max_simultaneous_value", sa.Integer(), "3"),
    ("max_total_enabled", sa.Boolean(), "true"),
    ("max_total_value", sa.Integer(), "10"),
    ("min_time_before_class_enabled", sa.Boolean(), "false"),
    ("min_time_before_class_value", sa.Integer(), "30"),
    ("max_invites_per_student_per_day_enabled", sa.Boolean(), "false"),
    ("max_invites_per_student_per_day_value", sa.Integer(), "3"),
    ("quiet_hours_enabled", sa.Boolean(), "false"),
    ("max_inactive_time_enabled", sa.Boolean(), "true"),
    ("max_inactive_time_value", sa.Integer(), "120"),
    ("exclude_inactive_accounts", sa.Boolean(), "false"),
    ("excluded_players_enabled", sa.Boolean(), "false"),
    ("excluded_player_ids", sa.JSON(), "'[]'"),
)
NULLABLE = {"reminder_time", "invitation_start_time"}
OLD_JSON_COLUMNS = ("rounds", "invitation_start_timing", "reminder_timing", "restrictions")

# (restriction key, enabled column, value column)
RESTRICTION_PAIRS = (
    ("maxSimultaneous", "max_simultaneous_enabled", "max_simultaneous_value"),
    ("maxTotal", "max_total_enabled", "max_total_value"),
    ("minTimeBeforeClass", "min_time_before_class_enabled", "min_time_before_class_value"),
    ("maxInvitesPerStudentPerDay", "max_invites_per_student_per_day_enabled",
     "max_invites_per_student_per_day_value"),
    ("maxInactiveTime", "max_inactive_time_enabled", "max_inactive_time_value"),
)


# ---------------------------------------------------------------------------
# pure mapping (unit-tested by tests/test_pad279_notification_config_columns.py)
# ---------------------------------------------------------------------------

def _parse(blob, name, problems):
    """A JSON column value as Python: psycopg2 hands back dicts, sqlite text."""
    if blob is None:
        return None
    if isinstance(blob, (dict, list)):
        return blob
    try:
        return json.loads(blob)
    except (TypeError, ValueError):
        problems.append(f"{name}: not valid JSON")
        return None


def _timing(obj, default, name, problems):
    """``(type, value, time)`` from a ``{type, value}`` / ``{type, days, time}`` dict."""
    if obj is None:
        return default
    if not isinstance(obj, dict):
        problems.append(f"{name}: not an object")
        return default
    t = obj.get("type")
    try:
        if t == "hours_before":
            return (t, int(obj.get("value", default[1])), None)
        if t in ("days_before", "days_before_at_time"):
            time_str = obj.get("time")
            return (t, int(obj.get("days", 1)), time_str if isinstance(time_str, str) else "09:00")
    except (TypeError, ValueError):
        pass
    problems.append(f"{name}: unreadable timing {obj!r}")
    return default


def _int(value, default, name, problems):
    try:
        return int(value)
    except (TypeError, ValueError):
        problems.append(f"{name}: not an integer ({value!r})")
        return default


def _bool(value, default, name, problems):
    """A boolean the old code read by truthiness: accept the shapes an older
    client or a hand edit may have stored (0/1, "true"/"false"), refuse the rest."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes", "on"):
            return True
        if lowered in ("false", "0", "no", "off", ""):
            return False
    problems.append(f"{name}: not a boolean ({value!r})")
    return default


def typed_from_json(reminder_timing, invitation_start_timing, restrictions):
    """Map one row's three old blobs to the typed column values.

    Returns ``(values, problems)``: ``values`` always has every typed column;
    ``problems`` lists what could not be read and fell back to its default.
    """
    problems: list[str] = []
    values = dict(DEFAULTS)
    values["excluded_player_ids"] = []

    rt = _parse(reminder_timing, "reminder_timing", problems)
    ist = _parse(invitation_start_timing, "invitation_start_timing", problems)
    rs = _parse(restrictions, "restrictions", problems)

    # --- first reminder, count, spacing, invitation start
    first = None
    invitation = None
    if isinstance(rt, dict):
        # The old getters read these keys off the dict whatever its shape.
        if "reminderCount" in rt:
            values["reminder_count"] = max(
                1, _int(rt.get("reminderCount"), 1, "reminder_timing.reminderCount", problems)
            )
        if "hoursBetweenReminders" in rt:
            try:
                hours = float(rt.get("hoursBetweenReminders"))
                values["hours_between_reminders"] = hours if hours > 0 else 24.0
            except (TypeError, ValueError):
                problems.append("reminder_timing.hoursBetweenReminders: not a number")
        if "invitationStart" in rt:
            invitation = rt.get("invitationStart")
        if "firstReminder" in rt:
            first = rt.get("firstReminder")
        elif "type" in rt:
            first = rt  # flat legacy shape
        else:
            # Neither shape: the old getter returned this dict itself, the
            # scheduler found no `type` and fired NOTHING. Keep that — it is the
            # one shape whose backfill would change what students receive —
            # as the explicit `none` timing (coordinator decision, PR #208).
            first = {"type": "none"}
            problems.append("reminder_timing: no firstReminder/type — kept as no reminder (type 'none')")
    elif rt is not None:
        problems.append("reminder_timing: not an object")

    if isinstance(first, dict) and first.get("type") == "none":
        values["reminder_type"], values["reminder_value"], values["reminder_time"] = "none", DEFAULT_REMINDER[1], None
    else:
        (values["reminder_type"], values["reminder_value"], values["reminder_time"]) = _timing(
            first, DEFAULT_REMINDER, "reminder_timing.firstReminder", problems
        )
    if invitation is None:
        invitation = ist
    (values["invitation_start_type"], values["invitation_start_value"],
     values["invitation_start_time"]) = _timing(
        invitation, DEFAULT_INVITATION_START, "invitation_start", problems
    )

    # --- restrictions
    if isinstance(rs, dict):
        for key, enabled_col, value_col in RESTRICTION_PAIRS:
            sub = rs.get(key)
            if sub is None:
                continue
            if not isinstance(sub, dict):
                problems.append(f"restrictions.{key}: not an object")
                continue
            if "enabled" in sub:
                values[enabled_col] = _bool(sub["enabled"], values[enabled_col],
                                            f"restrictions.{key}.enabled", problems)
            if "value" in sub:
                values[value_col] = _int(sub["value"], values[value_col],
                                         f"restrictions.{key}.value", problems)
        quiet = rs.get("quietHours")
        if isinstance(quiet, dict) and "enabled" in quiet:
            values["quiet_hours_enabled"] = _bool(quiet["enabled"], False,
                                                  "restrictions.quietHours.enabled", problems)
        elif quiet is not None:
            problems.append("restrictions.quietHours: not an object")
        excl = rs.get("excludeUnpaidSubscription")
        if isinstance(excl, dict) and "enabled" in excl:
            values["exclude_inactive_accounts"] = _bool(
                excl["enabled"], False, "restrictions.excludeUnpaidSubscription.enabled", problems
            )
        players = rs.get("excludedPlayers")
        if isinstance(players, dict):
            if "enabled" in players:
                values["excluded_players_enabled"] = _bool(
                    players["enabled"], False, "restrictions.excludedPlayers.enabled", problems
                )
            ids = players.get("playerIds")
            if isinstance(ids, list):
                values["excluded_player_ids"] = [str(i) for i in ids if i is not None]
            elif ids is not None:
                problems.append("restrictions.excludedPlayers.playerIds: not a list")
        elif players is not None:
            problems.append("restrictions.excludedPlayers: not an object")
        if "cancellationDeadlineHours" in rs:
            try:
                hours = float(rs["cancellationDeadlineHours"])
                if hours < 0:
                    raise ValueError
                values["cancellation_deadline_hours"] = hours
            except (TypeError, ValueError):
                problems.append("restrictions.cancellationDeadlineHours: not a non-negative number")
    elif rs is not None:
        problems.append("restrictions: not an object")

    return values, problems


def json_from_typed(row) -> dict:
    """The inverse, for ``downgrade``: the three blobs from a typed row."""
    def timing(t, value, time_str):
        if t == "hours_before":
            return {"type": t, "value": value}
        if t == "none":
            return {"type": "none"}
        return {"type": t, "days": value, "time": time_str or "09:00"}

    reminder_timing = {
        "firstReminder": timing(row["reminder_type"], row["reminder_value"], row["reminder_time"]),
        "reminderCount": row["reminder_count"],
        "hoursBetweenReminders": row["hours_between_reminders"],
        "invitationStart": timing(row["invitation_start_type"], row["invitation_start_value"],
                                  row["invitation_start_time"]),
    }
    restrictions = {
        key: {"enabled": bool(row[enabled_col]), "value": row[value_col]}
        for key, enabled_col, value_col in RESTRICTION_PAIRS
    }
    restrictions["quietHours"] = {"enabled": bool(row["quiet_hours_enabled"])}
    restrictions["excludedPlayers"] = {
        "enabled": bool(row["excluded_players_enabled"]),
        "playerIds": list(row["excluded_player_ids"] or []),
    }
    restrictions["excludeUnpaidSubscription"] = {"enabled": bool(row["exclude_inactive_accounts"])}
    restrictions["cancellationDeadlineHours"] = row["cancellation_deadline_hours"]
    return {
        "reminder_timing": reminder_timing,
        "invitation_start_timing": reminder_timing["invitationStart"],
        "restrictions": restrictions,
    }


# ---------------------------------------------------------------------------
# guards
# ---------------------------------------------------------------------------

def _inspector():
    return sa_inspect(op.get_bind())


def _has_table(name):
    return _inspector().has_table(name)


def _columns(table):
    return {c["name"] for c in _inspector().get_columns(table)}


# ---------------------------------------------------------------------------

def upgrade():
    bind = op.get_bind()

    # 1. app_settings
    if not _has_table("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(64), primary_key=True),
            sa.Column("value", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_by_user_id", sa.Integer(),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        )

    # 2. typed columns
    existing = _columns(TABLE)
    for name, type_, default in TYPED_COLUMNS:
        if name in existing:
            continue
        op.add_column(TABLE, sa.Column(
            name, type_, nullable=(name in NULLABLE),
            server_default=sa.text(default) if default is not None else None,
        ))
    if "schema_version" not in existing:
        op.add_column(TABLE, sa.Column("schema_version", sa.Integer(), nullable=False,
                                       server_default="0"))

    # 3. backfill from the old blobs, only while they still exist
    existing = _columns(TABLE)
    if all(c in existing for c in ("reminder_timing", "invitation_start_timing", "restrictions")):
        rows = bind.execute(sa.text(
            f"SELECT id, reminder_timing, invitation_start_timing, restrictions "
            f"FROM {TABLE} WHERE schema_version = 0"
        )).mappings().all()
        assignments = ", ".join(f"{name} = :{name}" for name, _t, _d in TYPED_COLUMNS)
        stmt = sa.text(
            f"UPDATE {TABLE} SET {assignments}, schema_version = 1 WHERE id = :id"
        ).bindparams(sa.bindparam("excluded_player_ids", type_=sa.JSON()))
        problem_rows = 0
        for row in rows:
            values, problems = typed_from_json(
                row["reminder_timing"], row["invitation_start_timing"], row["restrictions"]
            )
            if problems:
                problem_rows += 1
                log.warning(
                    "PAD-279 backfill: notification_configs id=%s kept defaults for: %s",
                    row["id"], "; ".join(problems),
                )
            bind.execute(stmt, {"id": row["id"], **values})
        summary = "PAD-279 backfill: %d rows, %d with unreadable parts (see the warnings above)"
        (log.warning if problem_rows else log.info)(summary, len(rows), problem_rows)

    # 4. drop the blobs
    existing = _columns(TABLE)
    for name in OLD_JSON_COLUMNS:
        if name in existing:
            op.drop_column(TABLE, name)

    # 5. from here on every new row is at version 1
    op.alter_column(TABLE, "schema_version", server_default="1")
    bind.execute(sa.text(f"UPDATE {TABLE} SET schema_version = 1 WHERE schema_version = 0"))


def downgrade():
    bind = op.get_bind()
    existing = _columns(TABLE)
    for name in OLD_JSON_COLUMNS:
        if name not in existing:
            op.add_column(TABLE, sa.Column(name, sa.JSON(), nullable=True))

    typed = [name for name, _t, _d in TYPED_COLUMNS]
    if all(c in _columns(TABLE) for c in typed):
        rows = bind.execute(sa.text(
            f"SELECT id, {', '.join(typed)} FROM {TABLE}"
        )).mappings().all()
        stmt = sa.text(
            f"UPDATE {TABLE} SET reminder_timing = :reminder_timing, "
            f"invitation_start_timing = :invitation_start_timing, "
            f"restrictions = :restrictions WHERE id = :id"
        ).bindparams(
            sa.bindparam("reminder_timing", type_=sa.JSON()),
            sa.bindparam("invitation_start_timing", type_=sa.JSON()),
            sa.bindparam("restrictions", type_=sa.JSON()),
        )
        for row in rows:
            bind.execute(stmt, {"id": row["id"], **json_from_typed(row)})
        for name in typed:
            op.drop_column(TABLE, name)
    if "schema_version" in _columns(TABLE):
        op.drop_column(TABLE, "schema_version")
    if _has_table("app_settings"):
        op.drop_table("app_settings")
