"""PAD-742: the finance tables (admin.finance)

Revision ID: 459fc0208b0d
Revises: e532fea8c4d4
Create Date: 2026-10-22 20:00:00.000000

Four tables, each created only when absent (idempotent), none with data: `finance_costs` (manual
costs, rule 5), `finance_cost_revisions` (their owner-only history, rule 5b), `finance_import_runs`
and `finance_gcp_costs` (the daily Google Cloud import, rule 7). No amount is seeded: the owner
enters the costs on the page.
"""
import sqlalchemy as sa
from alembic import op

revision = "459fc0208b0d"
down_revision = "e532fea8c4d4"  # PAD-672 slice 3
branch_labels = None
depends_on = None


def _tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _stamps():
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def upgrade():
    tables = _tables()
    if "finance_costs" not in tables:
        op.create_table(
            "finance_costs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("category", sa.String(length=16), nullable=False),
            sa.Column("vendor", sa.String(length=80), nullable=False),
            sa.Column("description", sa.String(length=200), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("amount_eur", sa.Numeric(12, 2), nullable=False),
            sa.Column("recurrence", sa.String(length=8), nullable=False),
            sa.Column("starts_on", sa.Date(), nullable=False),
            sa.Column("ends_on", sa.Date(), nullable=True),
            sa.Column("gcp_invoice", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by_email", sa.String(length=254), nullable=False),
            sa.Column("updated_by_email", sa.String(length=254), nullable=False),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.Column("deleted_by_email", sa.String(length=254), nullable=True),
            *_stamps(),
            sa.CheckConstraint(
                "category IN ('infrastructure', 'ai_tools', 'stores', 'domains_dns', 'email_crm', 'other')",
                name="ck_finance_costs_category",
            ),
            sa.CheckConstraint("recurrence IN ('once', 'monthly', 'annual')", name="ck_finance_costs_recurrence"),
            sa.CheckConstraint("amount > 0", name="ck_finance_costs_amount"),
            sa.CheckConstraint("amount_eur > 0", name="ck_finance_costs_amount_eur"),
        )
        op.create_index("ix_finance_costs_category", "finance_costs", ["category"])
    if "finance_cost_revisions" not in tables:
        op.create_table(
            "finance_cost_revisions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "cost_id", sa.Integer(), sa.ForeignKey("finance_costs.id", ondelete="CASCADE"), nullable=False
            ),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("action", sa.String(length=8), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("actor_email", sa.String(length=254), nullable=False),
            *_stamps(),
            sa.UniqueConstraint("cost_id", "revision", name="uq_finance_cost_revisions_cost_revision"),
            sa.CheckConstraint("action IN ('create', 'update', 'delete')", name="ck_finance_cost_revisions_action"),
        )
        op.create_index("ix_finance_cost_revisions_cost_id", "finance_cost_revisions", ["cost_id"])
    if "finance_import_runs" not in tables:
        op.create_table(
            "finance_import_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("trigger", sa.String(length=16), nullable=False),
            sa.Column("actor_email", sa.String(length=254), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=False),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("outcome", sa.String(length=16), nullable=False),
            sa.Column("months", sa.JSON(), nullable=True),
            sa.Column("rows", sa.Integer(), nullable=False),
            sa.Column("error_code", sa.String(length=32), nullable=True),
            sa.Column("error_message", sa.String(length=500), nullable=True),
            *_stamps(),
            sa.CheckConstraint("trigger IN ('schedule', 'manual')", name="ck_finance_import_runs_trigger"),
            sa.CheckConstraint(
                "outcome IN ('running', 'ok', 'error', 'not_configured')", name="ck_finance_import_runs_outcome"
            ),
        )
        op.create_index("ix_finance_import_runs_started_at", "finance_import_runs", ["started_at"])
    if "finance_gcp_costs" not in tables:
        op.create_table(
            "finance_gcp_costs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("invoice_month", sa.Date(), nullable=False),
            sa.Column("project_id", sa.String(length=64), nullable=False),
            sa.Column("service", sa.String(length=120), nullable=False),
            sa.Column("currency", sa.String(length=3), nullable=False),
            sa.Column("cost", sa.Numeric(16, 6), nullable=False),
            sa.Column("credits", sa.Numeric(16, 6), nullable=False),
            sa.Column(
                "run_id", sa.Integer(), sa.ForeignKey("finance_import_runs.id", ondelete="SET NULL"), nullable=True
            ),
            *_stamps(),
            sa.UniqueConstraint("invoice_month", "project_id", "service", name="uq_finance_gcp_costs_line"),
            sa.CheckConstraint("credits <= 0", name="ck_finance_gcp_costs_credits"),
        )
        op.create_index("ix_finance_gcp_costs_invoice_month", "finance_gcp_costs", ["invoice_month"])


def downgrade():
    tables = _tables()
    for table in ("finance_gcp_costs", "finance_import_runs", "finance_cost_revisions", "finance_costs"):
        if table in tables:
            op.drop_table(table)
