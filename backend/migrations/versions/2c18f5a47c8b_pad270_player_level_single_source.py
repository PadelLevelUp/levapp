"""PAD-270: one place for a player's level; history on every edit; retire Player.level

Revision ID: 2c18f5a47c8b
Revises: 76395824b9cf
Create Date: 2026-09-10

History is the record of a player's level and `coach_in_player.level_id` its
cache (players.level-history rules 1-2). Before PAD-270 an edit wrote no history
(B-061), so live data holds roster levels with no entry, or whose latest entry
names another level. This revision writes one entry for each such roster row,
dated now, so the record and the cache agree.

Guarded, idempotent (a second run finds nothing to write) and never fails on
data: rows whose coach, player or level is missing are skipped. No schema change.
Downgrade writes nothing and deletes nothing: the added entries are true records.
"""
import logging
from datetime import datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "2c18f5a47c8b"
down_revision = "76395824b9cf"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")


MISMATCHES = """
    SELECT r.coach_id, r.player_id, r.level_id
    FROM coach_in_player r
    WHERE r.level_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM coaches c WHERE c.id = r.coach_id)
      AND EXISTS (SELECT 1 FROM players p WHERE p.id = r.player_id)
      AND EXISTS (SELECT 1 FROM coach_levels l WHERE l.id = r.level_id)
      AND COALESCE((
            SELECT h.level_id FROM player_level_history h
            WHERE h.coach_id = r.coach_id AND h.player_id = r.player_id
            ORDER BY h.assigned_at DESC, h.id DESC
            LIMIT 1), -1) <> r.level_id
    ORDER BY r.id
"""


def backfill_level_history(bind, now=None):
    """Write one history entry per roster row whose level the history does not
    show as current. Returns how many were written."""
    insp = sa_inspect(bind)
    if not (insp.has_table("coach_in_player") and insp.has_table("player_level_history")):
        return 0
    stamps = [c for c in ("created_at", "updated_at") if c in {col["name"] for col in insp.get_columns("player_level_history")}]
    columns = ", ".join(["player_id", "coach_id", "level_id", "assigned_at", *stamps])
    values = ", ".join([":player_id", ":coach_id", ":level_id", ":now", *[":now" for _ in stamps]])
    insert = sa.text(f"INSERT INTO player_level_history ({columns}) VALUES ({values})")
    now = now or datetime.utcnow()
    rows = bind.execute(sa.text(MISMATCHES)).fetchall()
    for coach_id, player_id, level_id in rows:
        bind.execute(insert, {"player_id": player_id, "coach_id": coach_id, "level_id": level_id, "now": now})
    return len(rows)


def upgrade():
    written = backfill_level_history(op.get_bind())
    log.warning("PAD-270: wrote %d player_level_history entries so the record matches coach_in_player.level_id", written)


def downgrade():
    # The entries this revision wrote are true records of the current level; keep them.
    pass
