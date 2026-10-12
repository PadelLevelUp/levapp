"""admin.data-export (PAD-640): print one person's data as JSON, for a data-subject access request.

    python scripts/export_user_data.py <user_id> > user-<id>.json

Run it where the backend runs (inside the backend container on the VM); it reads the same
POSTGRES_* environment the app reads. The runbook is scripts/data_requests.md.

What it prints (rules 1, 3–5):
  {exportedAt, userId, user, tables: {<table>: [rows]}}
  - the users row;
  - every row of every table with a foreign key to that user, to their players row(s) or to their
    coaches row, found from the schema, so a new table is included without editing this file;
  - from `messages`, only what the person sent (that table points at users through sender_id).
Never printed: any column that looks like a secret (`[withheld]`), the staff-only audit tables.

Read-only (rule 2): one transaction, READ ONLY on Postgres, always rolled back.
"""
import base64
import json
import os
import re
import sys
from datetime import date, datetime, time, timezone
from decimal import Decimal

from sqlalchemy import MetaData, create_engine, select, text

#: Rule 4: printed as "[withheld]" whatever the table.
_SECRET = re.compile(r"password|token|secret|_hash$|^generated_code$|^jti$|^endpoint$|^p256dh$|^auth$")
#: Rule 4: staff records about the person, not the person's data.
_STAFF_TABLES = {"admin_audit_log", "deletion_audit", "alembic_version"}
WITHHELD = "[withheld]"


def _value(column, value):
    if value is None:
        return None
    if _SECRET.search(column):
        return WITHHELD
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(value)).decode()
    return value


def _row(row):
    return {k: _value(k, v) for k, v in row._mapping.items()}


def _pointing_at(meta, target, column="id"):
    """(table, local column) for every foreign key to target.column."""
    found = []
    for table in meta.sorted_tables:
        for fk in table.foreign_keys:
            if fk.column.table.name == target and fk.column.name == column:
                found.append((table, fk.parent))
    return found


def export(conn, user_id):
    """The export document, or None when there is no such user."""
    meta = MetaData()
    meta.reflect(bind=conn)
    users = meta.tables["users"]
    user = conn.execute(select(users).where(users.c.id == user_id)).first()
    if user is None:
        return None

    owners = {"users": [user_id]}
    for name in ("players", "coaches"):
        if name in meta.tables and "user_id" in meta.tables[name].c:
            t = meta.tables[name]
            owners[name] = [r.id for r in conn.execute(select(t.c.id).where(t.c.user_id == user_id))]

    tables = {}
    for target, ids in owners.items():
        if not ids:
            continue
        for table, col in _pointing_at(meta, target):
            if table.name in _STAFF_TABLES:
                continue
            bucket = tables.setdefault(table.name, {})
            for r in conn.execute(select(table).where(col.in_(ids))).all():
                key = tuple(r._mapping.get(c.name) for c in table.primary_key) or tuple(r)
                bucket[key] = _row(r)
    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "userId": user_id,
        "user": _row(user),
        "tables": {name: list(rows.values()) for name, rows in sorted(tables.items()) if rows},
    }


def _engine():
    """The Flask app's engine under an app context (tests); otherwise the app's own database
    settings from the environment, without booting the app (its scheduler must not start)."""
    from flask import has_app_context

    if has_app_context():
        from padel_app.sql_db import db

        return db.engine
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from padel_app.config import ProdConfig

    return create_engine(ProdConfig.resolve_database_uri())


def main(argv, out=sys.stdout, err=sys.stderr):
    if len(argv) != 1 or not argv[0].isdigit():
        err.write("usage: export_user_data.py <user_id>\n")
        return 64
    user_id = int(argv[0])
    with _engine().connect() as conn:
        trans = conn.begin()
        try:
            if conn.dialect.name == "postgresql":
                conn.execute(text("SET TRANSACTION READ ONLY"))
            doc = export(conn, user_id)
        finally:
            trans.rollback()
    if doc is None:
        err.write(f"no user {user_id}\n")
        return 2
    out.write(json.dumps(doc, ensure_ascii=False, indent=2, default=str))
    out.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
