"""The new invitation engine's own state (PAD-916, swap plan §5): what the engine's snapshot holds that
no older table does. ``services/engine_store.py`` reads and writes these; nothing else should.

- ``invitations``: one row per student per session (D1). The old engine's ``notification_events`` is
  one row per send and is keyed by vacancy (dropped, ruling D1), and keeps being written by the old
  engine while its sessions drain at cutover, so the new engine does not share it.
- ``engine_sessions``: an occurrence the new engine runs, and its coach alerts (engine-planning rule 11).
- ``engine_exclusions``: a student the coach took out of one session's pool (engine-tiers rule 3).
- ``engine_effects``: every effect applied, once (a unique key per effect), and the outbox the
  messages and pushes are sent from after commit. A retried apply inserts nothing and sends nothing.
"""
from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text

from padel_app import model
from padel_app.sql_db import db


class EngineInvitation(db.Model, model.Model):
    __tablename__ = "invitations"
    __table_args__ = (
        UniqueConstraint("lesson_instance_id", "player_id", name="uq_invitations_session_player"),
        Index("ix_invitations_player_id", "player_id"),
        {"extend_existing": True},
    )

    model_name = "EngineInvitation"

    id = Column(Integer, primary_key=True)
    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
    # The spot types it was sent for (D20): a list of [side or null, level or null].
    offer = Column(JSON, nullable=False)
    side_named = Column(String(1), nullable=True)          # "L" | "R" | NULL: the side the message names
    # An index into the coach's tiers at send time (EngineSettings.tiers); NULL for none.
    tier = Column(Integer, nullable=True)
    sent_at = Column(DateTime, nullable=False)
    counts_until = Column(DateTime, nullable=True)
    answer = Column(String(3), nullable=True)               # "yes" | "no"
    answered_at = Column(DateTime, nullable=True)
    answered_by = Column(String(7), nullable=True)          # "student" | "coach" (the engine's Answered.by)
    sorry_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)             # a same-hour placement closed it (answers rule 10)
    # invitations NB1a: why it closed ("withdrawn" by the coach, rule 19 | "same_hour"), when it was last
    # reopened, and the ids of its message bubbles (the first and each reopening's), kept current by the store.
    closed_reason = Column(String(16), nullable=True)      # "withdrawn" | "same_hour" | "class_removed"
    reopened_at = Column(DateTime, nullable=True)
    message_ids = Column(JSON, nullable=False, default=list)
    # PAD-932 (engine-answers rule 15): the coach's invitation by hand, of the coach's-list tier.
    manual = Column(Boolean, nullable=False, default=False, server_default=text("false"))


class EngineSession(db.Model, model.Model):
    __tablename__ = "engine_sessions"
    __table_args__ = (
        Index("ix_engine_sessions_coach_id", "coach_id"),
        {"extend_existing": True},
    )

    model_name = "EngineSession"

    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), primary_key=True)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
    # Coach alerts raised (engine-planning rule 11): a list of [side or null, level or null, spots].
    alerted = Column(JSON, nullable=False, default=list)
    # Semi-automatic approval per group (engine-planning rule 14; owner decisions 5, 10; engine-store rule 5):
    # the tiers the coach approved for this session, a list of ints; the students they took out, a list of
    # ids; one pending request per tier, a list of {tier, request, queues: [[[side, level], [ids…]], …],
    # message_id} (message_id: its Assistant message once posted, PAD-919); each dismissed tier with the spot
    # counts it saw, a list of [tier, [[[side, level], count], …]].
    approved_groups = Column(JSON, nullable=False, default=list)
    removed = Column(JSON, nullable=False, default=list)
    pending = Column(JSON, nullable=False, default=list)
    dismissed_groups = Column(JSON, nullable=False, default=list)


class EngineExclusion(db.Model, model.Model):
    __tablename__ = "engine_exclusions"
    __table_args__ = (
        UniqueConstraint("lesson_instance_id", "player_id", name="uq_engine_exclusions_session_player"),
        {"extend_existing": True},
    )

    model_name = "EngineExclusion"

    id = Column(Integer, primary_key=True)
    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)


class EngineEffect(db.Model, model.Model):
    __tablename__ = "engine_effects"
    __table_args__ = (
        UniqueConstraint("key", name="uq_engine_effects_key"),
        Index("ix_engine_effects_lesson_instance_id", "lesson_instance_id"),
        Index("ix_engine_effects_dispatched_at", "dispatched_at"),
        {"extend_existing": True},
    )

    model_name = "EngineEffect"

    id = Column(Integer, primary_key=True)
    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=True)
    kind = Column(String(24), nullable=False)               # the effect's class name
    at = Column(DateTime, nullable=False)
    payload = Column(JSON, nullable=False)
    key = Column(String(64), nullable=False)                # sha256 of the effect: the idempotency key
    dispatched_at = Column(DateTime, nullable=True)         # sent (messages, pushes); NULL = in the outbox
