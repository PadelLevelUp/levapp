"""`realtime_events` — the bodies behind the SSE broker's notifications (PAD-692).

`messaging.sse-realtime` rules 21-24. With `SSE_BROKER=postgres` a publish writes one row here and
`NOTIFY levapp_events, '<id>'`; each process's listener reads the row and fans the body out to its
own streams. NOTIFY payloads stop at 8,000 bytes and a message body has no length limit, so the body
lives in the row. Rows are pruned after `REALTIME_EVENTS_RETENTION_MINUTES` and never replayed.

A Core table, not a `Model`: rows are written once and deleted by age, so there is no `updated_at`.
"""
import sqlalchemy as sa

from padel_app.sql_db import db

realtime_events = db.Table(
    "realtime_events",
    sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    # JSON list of recipient user ids, and the event exactly as the stream writes it.
    sa.Column("user_ids", sa.Text(), nullable=False),
    sa.Column("body", sa.Text(), nullable=False),
    sa.Index("ix_realtime_events_created_at", "created_at"),
)
