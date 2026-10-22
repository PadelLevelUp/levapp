"""`auth_rate_limit_hits` — the auth rate limiter's shared store (PAD-693, `auth.login` rule 7).

With `AUTH_RATE_LIMIT_STORE=database` every process records its hits here, so N processes still
allow one budget in total. One row per counted request; rows older than the longest window are
pruned. A Core table, not a `Model`: rows are inserted and deleted, never updated (no `updated_at`).
`hit_at` is wall-clock epoch seconds from the limiter's clock, which tests move.
"""
import sqlalchemy as sa

from padel_app.sql_db import db

auth_rate_limit_hits = db.Table(
    "auth_rate_limit_hits",
    sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True),
    sa.Column("scope", sa.Text(), nullable=False),
    sa.Column("key", sa.Text(), nullable=False),
    sa.Column("hit_at", sa.Float(), nullable=False),
    sa.Index("ix_auth_rate_limit_hits_scope_key_hit_at", "scope", "key", "hit_at"),
)
