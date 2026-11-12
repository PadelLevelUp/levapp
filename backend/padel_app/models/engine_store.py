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
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint

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
    sorry_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)             # a same-hour placement closed it (answers rule 10)
    # invitations NB1a: why it closed ("withdrawn" by the coach, rule 19 | "same_hour"), when it was last
    # re-offered, and the ids of its message bubbles (the first and each re-offer's), kept current by the store.
    closed_reason = Column(String(10), nullable=True)
    reoffered_at = Column(DateTime, nullable=True)
    message_ids = Column(JSON, nullable=False, default=list)


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
    # Semi-automatic approval (engine-planning, owner ruling D2; PAD-915's Approval): the students the
    # coach let through and those they took out, lists of ids; the pending request's queues, a list of
    # [[side, level], [ids in order]] (null: none pending); the open spots when the coach dismissed the
    # queue, a list of [[side, level], count] (null: not dismissed).
    approved = Column(JSON, nullable=False, default=list)
    removed = Column(JSON, nullable=False, default=list)
    pending = Column(JSON, nullable=True)
    pending_request = Column(String(80), nullable=True)      # the pending request's id (the engine's)
    request_message_id = Column(Integer, nullable=True)      # the pending request's Assistant message (PAD-919)
    dismissed = Column(JSON, nullable=True)


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
