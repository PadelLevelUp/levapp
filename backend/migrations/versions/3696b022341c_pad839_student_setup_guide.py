"""PAD-839: the student setup guide (dashboard.student-setup-guide rules 4, 10, 14).

`users.setup_guide_snoozed_at` (the instant of the last "Agora não"; compared as Lisbon dates by the clients), `users.setup_guide_hidden_at`
("Não mostrar mais"), `users.setup_guide_ready_closed_at` ("Conta pronta" closed),
`users.setup_always_available_at` ("Estou sempre disponível") and
`users.setup_alerts_confirmed_at` (step 1 confirmed in the guide) hold the guide's choices across
devices. `calendar_blocks.schedule_id` groups the rows one schedule-editor save writes. All are
added only when absent (prod and staging drift: migrations must be idempotent). No data is
written: NULL means "not chosen" and "not in a schedule".

Parent: the single head on feature/profile-pad-839 after merging origin/staging on 2026-11-15 (f796ea7e680b, PAD-796; earlier e830f1a2b3c4 and e932a7c1d4f2); rebase it onto
whatever head the stream branch has when this lands. `setup_alerts_confirmed_at` (step 1
confirmed in the guide) is there because OQ-8 (b) is assumed; drop it if the owner picks (a).

Revision ID: 3696b022341c
Revises: f796ea7e680b
"""
from alembic import op
import sqlalchemy as sa

revision = "3696b022341c"
down_revision = "f796ea7e680b"
branch_labels = None
depends_on = None

_USER_COLUMNS = (
    ("setup_guide_snoozed_at", sa.DateTime()),
    ("setup_guide_hidden_at", sa.DateTime()),
    ("setup_guide_ready_closed_at", sa.DateTime()),
    ("setup_always_available_at", sa.DateTime()),
    ("setup_alerts_confirmed_at", sa.DateTime()),  # OQ-8 (b), assumed
)


def _has_column(table, name):
    return name in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _has_index(table, name):
    return name in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade():
    for name, type_ in _USER_COLUMNS:
        if not _has_column("users", name):
            op.add_column("users", sa.Column(name, type_, nullable=True))
    if not _has_column("calendar_blocks", "schedule_id"):
        op.add_column("calendar_blocks", sa.Column("schedule_id", sa.String(36), nullable=True))
    if not _has_index("calendar_blocks", "ix_calendar_blocks_schedule_id"):
        op.create_index("ix_calendar_blocks_schedule_id", "calendar_blocks", ["schedule_id"])


def downgrade():
    if _has_index("calendar_blocks", "ix_calendar_blocks_schedule_id"):
        op.drop_index("ix_calendar_blocks_schedule_id", table_name="calendar_blocks")
    if _has_column("calendar_blocks", "schedule_id"):
        op.drop_column("calendar_blocks", "schedule_id")
    for name, _ in reversed(_USER_COLUMNS):
        if _has_column("users", name):
            op.drop_column("users", name)
