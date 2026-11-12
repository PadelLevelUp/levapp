"""PAD-916: the new invitation engine's table-backed store (swap plan §5).

- ``invitations``: one row per student per session (D1), UNIQUE (lesson_instance_id, player_id).
- ``engine_sessions``: the occurrences the new engine runs, their coach alerts and approval state.
- ``engine_exclusions``: a student taken out of one session's pool by the coach.
- ``engine_effects``: every applied effect once (UNIQUE key) and the outbox of messages.
- ``presences``: placed_how, placed_at, side_moved_at, left_reason (the engine's placement).
- ``waiting_list_entries.sides``: a students'-list entry's own/other/both choice.

Only adds: no row is read or rewritten, and nothing the old engine writes changes. Downgrade drops
what this adds.

Revision ID: b916e0a1c2d3
Revises: 13395db9fee4
Create Date: 2026-11-11 21:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "b916e0a1c2d3"
down_revision = "13395db9fee4"
branch_labels = None
depends_on = None


def _stamps():
    return [sa.Column("created_at", sa.DateTime(), nullable=True), sa.Column("updated_at", sa.DateTime(), nullable=True)]


def upgrade():
    op.create_table(
        "invitations",
        *_stamps(),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_instance_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("coach_id", sa.Integer(), nullable=False),
        sa.Column("offer", sa.JSON(), nullable=False),
        sa.Column("side_named", sa.String(length=1), nullable=True),
        sa.Column("tier", sa.Integer(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("counts_until", sa.DateTime(), nullable=True),
        sa.Column("answer", sa.String(length=3), nullable=True),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
        sa.Column("sorry_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_reason", sa.String(length=10), nullable=True),
        sa.Column("reoffered_at", sa.DateTime(), nullable=True),
        sa.Column("message_ids", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_instance_id"], ["lesson_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["coach_id"], ["coaches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_instance_id", "player_id", name="uq_invitations_session_player"),
    )
    op.create_index("ix_invitations_player_id", "invitations", ["player_id"])

    op.create_table(
        "engine_sessions",
        *_stamps(),
        sa.Column("lesson_instance_id", sa.Integer(), nullable=False),
        sa.Column("coach_id", sa.Integer(), nullable=False),
        sa.Column("alerted", sa.JSON(), nullable=False),
        sa.Column("approved", sa.JSON(), nullable=False),
        sa.Column("removed", sa.JSON(), nullable=False),
        sa.Column("pending", sa.JSON(), nullable=True),
        sa.Column("pending_request", sa.String(length=80), nullable=True),
        sa.Column("dismissed", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["lesson_instance_id"], ["lesson_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["coach_id"], ["coaches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("lesson_instance_id"),
    )
    op.create_index("ix_engine_sessions_coach_id", "engine_sessions", ["coach_id"])

    op.create_table(
        "engine_exclusions",
        *_stamps(),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_instance_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_instance_id"], ["lesson_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_instance_id", "player_id", name="uq_engine_exclusions_session_player"),
    )

    op.create_table(
        "engine_effects",
        *_stamps(),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_instance_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=True),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("dispatched_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["lesson_instance_id"], ["lesson_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_engine_effects_key"),
    )
    op.create_index("ix_engine_effects_lesson_instance_id", "engine_effects", ["lesson_instance_id"])
    op.create_index("ix_engine_effects_dispatched_at", "engine_effects", ["dispatched_at"])

    with op.batch_alter_table("presences") as batch_op:
        batch_op.add_column(sa.Column("placed_how", sa.String(length=24), nullable=True))
        batch_op.add_column(sa.Column("placed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("side_moved_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("left_reason", sa.String(length=10), nullable=True))
    with op.batch_alter_table("waiting_list_entries") as batch_op:
        batch_op.add_column(sa.Column("sides", sa.String(length=5), nullable=True))
    # notifications.config rule 18: the per-coach engine switch (PAD-917 fills its behaviour).
    with op.batch_alter_table("notification_configs") as batch_op:
        batch_op.add_column(sa.Column("engine_version", sa.String(length=3), nullable=False, server_default="old"))
        batch_op.add_column(sa.Column("engine_switched_at", sa.DateTime(), nullable=True))
        # notifications.config rule 20: the new engine's settings no client edits yet (PAD-917 maps them).
        batch_op.add_column(sa.Column("max_at_a_time", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("timing_method", sa.String(length=16), nullable=False, server_default="fixed"))
        batch_op.add_column(sa.Column("between_rounds_minutes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("between_groups_minutes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("per_tier_timing", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("auto_entry_before_attendance_request", sa.Boolean(), nullable=False,
                                      server_default=sa.text("false")))
        batch_op.add_column(sa.Column("waiting_list_side_choice", sa.Boolean(), nullable=False,
                                      server_default=sa.text("false")))


def downgrade():
    with op.batch_alter_table("notification_configs") as batch_op:
        batch_op.drop_column("waiting_list_side_choice")
        batch_op.drop_column("auto_entry_before_attendance_request")
        batch_op.drop_column("per_tier_timing")
        batch_op.drop_column("between_groups_minutes")
        batch_op.drop_column("between_rounds_minutes")
        batch_op.drop_column("timing_method")
        batch_op.drop_column("max_at_a_time")
        batch_op.drop_column("engine_switched_at")
        batch_op.drop_column("engine_version")
    with op.batch_alter_table("waiting_list_entries") as batch_op:
        batch_op.drop_column("sides")
    with op.batch_alter_table("presences") as batch_op:
        batch_op.drop_column("left_reason")
        batch_op.drop_column("side_moved_at")
        batch_op.drop_column("placed_at")
        batch_op.drop_column("placed_how")
    op.drop_index("ix_engine_effects_dispatched_at", table_name="engine_effects")
    op.drop_index("ix_engine_effects_lesson_instance_id", table_name="engine_effects")
    op.drop_table("engine_effects")
    op.drop_table("engine_exclusions")
    op.drop_index("ix_engine_sessions_coach_id", table_name="engine_sessions")
    op.drop_table("engine_sessions")
    op.drop_index("ix_invitations_player_id", table_name="invitations")
    op.drop_table("invitations")
