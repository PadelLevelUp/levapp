"""
PAD-279 — the migration's two criteria that only a real database can prove
(notifications.config rule 12): "running the migration a second time changes
nothing" and "a row whose old blob is not valid JSON keeps every default and
the migration still completes", plus the downgrade rebuilding the blobs.

Postgres only: the sqlite backend builds its schema with ``create_all`` and has
no Alembic history to walk. Pattern: ``test_pad263_hot_path_indexes.py`` drives
Alembic on the Postgres backend; here the revision is walked with
``flask_migrate.downgrade`` / ``upgrade`` around four old-shape rows. The ORM
session is released before every Alembic call: a connection left idle in a
transaction blocks the DDL forever (the 2026-09-10 TRUNCATE hang).
"""
import json
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "501dcb2c12f5"
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")

OLD_ROWS = [
    # coach 1: nested reminder_timing, a column-only invitation start that loses
    # to the sub-key, loose booleans (review finding 2)
    (json.dumps({"firstReminder": {"type": "days_before", "days": 1, "time": "09:00"},
                 "reminderCount": 2, "hoursBetweenReminders": 6,
                 "invitationStart": {"type": "hours_before", "value": 3}}),
     json.dumps({"type": "hours_before", "value": 99}),
     json.dumps({"maxSimultaneous": {"enabled": 1, "value": 5}, "quietHours": {"enabled": "true"},
                 "excludedPlayers": {"enabled": True, "playerIds": [7]}, "cancellationDeadlineHours": 12})),
    # coach 2: flat legacy first reminder, column-only invitation start
    (json.dumps({"type": "hours_before", "value": 12}),
     json.dumps({"type": "days_before_at_time", "days": 2, "time": "18:00"}),
     None),
    # coach 3: blobs Postgres accepts as JSON but the getters could not read
    (json.dumps(["not", "an", "object"]), json.dumps("string"),
     json.dumps({"maxSimultaneous": {"enabled": "yes", "value": "many"}, "cancellationDeadlineHours": -1})),
    # coach 4: nothing stored at all
    (None, None, None),
    # coach 5: a timing the scheduler could never fire (no firstReminder, no type)
    (json.dumps({"reminderCount": 2, "hoursBetweenReminders": 6}), None, None),
]


def _release():
    db.session.commit()
    db.session.remove()


def _rows(sql):
    return [dict(r) for r in db.session.execute(text(sql)).mappings().all()]


def test_the_migration_backfills_old_rows_once_and_downgrade_rebuilds_the_blobs(app):
    from flask_migrate import downgrade, upgrade

    from padel_app.models import Coach, User

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)

            for i, (rt, ist, rs) in enumerate(OLD_ROWS, start=1):
                user = User(name=f"C{i}", username=f"p279m_{i}", email=f"p279m_{i}@t.test", password="x", status="active")
                db.session.add(user)
                db.session.flush()
                coach = Coach(user_id=user.id)
                db.session.add(coach)
                db.session.flush()
                db.session.execute(
                    text("INSERT INTO notification_configs (coach_id, auto_notify_enabled, invitation_mode, "
                         "reminder_timing, invitation_start_timing, restrictions, created_at, updated_at) "
                         "VALUES (:c, false, 'automatic', CAST(:rt AS json), CAST(:ist AS json), CAST(:rs AS json), now(), now())"),
                    {"c": coach.id, "rt": rt, "ist": ist, "rs": rs},
                )
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            cols = {r["column_name"] for r in _rows("SELECT column_name FROM information_schema.columns WHERE table_name = 'notification_configs'")}
            assert not {"rounds", "reminder_timing", "restrictions", "invitation_start_timing"} & cols
            assert "app_settings" in {r["table_name"] for r in _rows("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")}
            first = _rows("SELECT * FROM notification_configs ORDER BY coach_id")
            assert len(first) == 5 and all(r["schema_version"] == 1 for r in first)
            r1, r2, r3, r4, r5 = first
            assert (r1["reminder_type"], r1["reminder_value"], r1["reminder_time"], r1["reminder_count"], r1["hours_between_reminders"]) == ("days_before", 1, "09:00", 2, 6.0)
            assert (r1["invitation_start_type"], r1["invitation_start_value"]) == ("hours_before", 3)
            assert r1["max_simultaneous_enabled"] is True and r1["max_simultaneous_value"] == 5
            assert r1["quiet_hours_enabled"] is True and r1["excluded_player_ids"] == ["7"] and r1["cancellation_deadline_hours"] == 12.0
            assert (r2["reminder_type"], r2["reminder_value"], r2["invitation_start_type"], r2["invitation_start_value"], r2["invitation_start_time"]) == ("hours_before", 12, "days_before_at_time", 2, "18:00")
            # the unreadable row keeps every default and the migration completed
            assert (r3["reminder_type"], r3["reminder_value"], r3["max_simultaneous_enabled"], r3["max_simultaneous_value"], r3["cancellation_deadline_hours"]) == ("hours_before", 48, True, 3, 24.0)
            assert r4["reminder_value"] == 48 and r4["max_total_value"] == 10 and r4["excluded_player_ids"] == []
            assert (r5["reminder_type"], r5["reminder_count"], r5["hours_between_reminders"]) == ("none", 2, 6.0)
            _release()

            # second run: nothing changes
            upgrade(directory=MIGRATIONS_DIR)
            second = _rows("SELECT * FROM notification_configs ORDER BY coach_id")
            assert [{k: v for k, v in r.items() if k != "updated_at"} for r in second] == \
                   [{k: v for k, v in r.items() if k != "updated_at"} for r in first]
            _release()

            # downgrade rebuilds the blobs from the typed columns
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            back = _rows("SELECT coach_id, reminder_timing, invitation_start_timing, restrictions FROM notification_configs ORDER BY coach_id")
            assert back[0]["reminder_timing"]["firstReminder"] == {"type": "days_before", "days": 1, "time": "09:00"}
            assert back[0]["reminder_timing"]["reminderCount"] == 2
            assert back[0]["restrictions"]["maxSimultaneous"] == {"enabled": True, "value": 5}
            assert back[1]["invitation_start_timing"] == {"type": "days_before_at_time", "days": 2, "time": "18:00"}
            assert back[3]["restrictions"]["maxTotal"] == {"enabled": True, "value": 10}
            assert back[4]["reminder_timing"]["firstReminder"] == {"type": "none"} and back[4]["reminder_timing"]["reminderCount"] == 2
            _release()
        finally:
            # leave the database at head for the tests that follow
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            _release()
