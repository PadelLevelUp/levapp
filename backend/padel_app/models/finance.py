"""admin.finance (PAD-742): what LevApp has cost.

`FinanceCost` is one manual cost, one-off or recurring (rule 3 derives its charges; none are
stored). `FinanceCostRevision` is its owner-only history (rule 5b), append-only like the console
audit log, which carries no money (rule 5a). `FinanceGcpCost` is one imported line of Google
Cloud's billing export per invoice month, project and service (rule 7), attributed to the
`FinanceImportRun` that wrote it. Money columns are costs LevApp pays, not plan prices.
"""
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import Session

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

CATEGORIES = ("infrastructure", "ai_tools", "stores", "domains_dns", "email_crm", "other")
RECURRENCES = ("once", "monthly", "annual")
REVISION_ACTIONS = ("create", "update", "delete")
RUN_TRIGGERS = ("schedule", "manual")
RUN_OUTCOMES = ("running", "ok", "error", "not_configured")


def _in(column, values):
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class FinanceCost(db.Model):
    __tablename__ = "finance_costs"
    __table_args__ = (
        CheckConstraint(_in("category", CATEGORIES), name="ck_finance_costs_category"),
        CheckConstraint(_in("recurrence", RECURRENCES), name="ck_finance_costs_recurrence"),
        CheckConstraint("amount > 0", name="ck_finance_costs_amount"),
        CheckConstraint("amount_eur > 0", name="ck_finance_costs_amount_eur"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    category = Column(String(16), nullable=False, index=True)
    vendor = Column(String(80), nullable=False)
    description = Column(String(200), nullable=False)
    currency = Column(String(3), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    amount_eur = Column(Numeric(12, 2), nullable=False)
    recurrence = Column(String(8), nullable=False)
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=True)
    gcp_invoice = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    notes = Column(Text, nullable=True)
    created_by_email = Column(String(254), nullable=False)
    updated_by_email = Column(String(254), nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by_email = Column(String(254), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )

    def to_dict(self):
        from padel_app.utils.dates import to_utc_iso

        return {
            "id": self.id,
            "category": self.category,
            "vendor": self.vendor,
            "description": self.description,
            "currency": self.currency,
            "amount": f"{self.amount:.2f}",
            "amountEur": f"{self.amount_eur:.2f}",
            "recurrence": self.recurrence,
            "startsOn": self.starts_on.isoformat(),
            "endsOn": self.ends_on.isoformat() if self.ends_on else None,
            "gcpInvoice": bool(self.gcp_invoice),
            "notes": self.notes,
            "createdByEmail": self.created_by_email,
            "updatedByEmail": self.updated_by_email,
            "deletedAt": to_utc_iso(self.deleted_at) if self.deleted_at else None,
            "deletedByEmail": self.deleted_by_email,
            "createdAt": to_utc_iso(self.created_at),
            "updatedAt": to_utc_iso(self.updated_at),
        }


class FinanceCostRevisionImmutable(RuntimeError):
    """Raised when a session tries to change or delete a cost revision (rule 5b)."""


class FinanceCostRevision(db.Model):
    __tablename__ = "finance_cost_revisions"
    __table_args__ = (
        UniqueConstraint("cost_id", "revision", name="uq_finance_cost_revisions_cost_revision"),
        CheckConstraint(_in("action", REVISION_ACTIONS), name="ck_finance_cost_revisions_action"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    cost_id = Column(Integer, ForeignKey("finance_costs.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = Column(Integer, nullable=False)
    action = Column(String(8), nullable=False)
    snapshot = Column(JSON, nullable=False)
    actor_email = Column(String(254), nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    # Kept so the table matches every other one; never changes (the row is immutable).
    updated_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())

    def to_dict(self):
        from padel_app.utils.dates import to_utc_iso

        return {
            "id": self.id,
            "costId": self.cost_id,
            "revision": self.revision,
            "action": self.action,
            "snapshot": self.snapshot,
            "actorEmail": self.actor_email,
            "createdAt": to_utc_iso(self.created_at),
        }


class FinanceImportRun(db.Model):
    __tablename__ = "finance_import_runs"
    __table_args__ = (
        CheckConstraint(_in("trigger", RUN_TRIGGERS), name="ck_finance_import_runs_trigger"),
        CheckConstraint(_in("outcome", RUN_OUTCOMES), name="ck_finance_import_runs_outcome"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    trigger = Column(String(16), nullable=False)
    actor_email = Column(String(254), nullable=True)
    started_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive(), index=True)
    finished_at = Column(DateTime, nullable=True)
    outcome = Column(String(16), nullable=False, default="running")
    months = Column(JSON, nullable=True)
    rows = Column(Integer, nullable=False, default=0)
    error_code = Column(String(32), nullable=True)
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )

    def to_dict(self):
        from padel_app.utils.dates import to_utc_iso

        return {
            "id": self.id,
            "trigger": self.trigger,
            "actorEmail": self.actor_email,
            "startedAt": to_utc_iso(self.started_at),
            "finishedAt": to_utc_iso(self.finished_at) if self.finished_at else None,
            "outcome": self.outcome,
            "months": self.months or [],
            "rows": self.rows,
            "errorCode": self.error_code,
            "errorMessage": self.error_message,
        }


class FinanceGcpCost(db.Model):
    __tablename__ = "finance_gcp_costs"
    __table_args__ = (
        UniqueConstraint("invoice_month", "project_id", "service", name="uq_finance_gcp_costs_line"),
        CheckConstraint("credits <= 0", name="ck_finance_gcp_costs_credits"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    invoice_month = Column(Date, nullable=False, index=True)
    project_id = Column(String(64), nullable=False)
    service = Column(String(120), nullable=False)
    currency = Column(String(3), nullable=False)
    cost = Column(Numeric(16, 6), nullable=False)
    credits = Column(Numeric(16, 6), nullable=False, default=0)
    run_id = Column(Integer, ForeignKey("finance_import_runs.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )


@event.listens_for(Session, "before_flush")
def _cost_revisions_are_append_only(session, flush_context, instances):
    """Rule 5b: a revision, once inserted, can neither change nor disappear through the ORM."""
    for obj in list(session.dirty):
        if isinstance(obj, FinanceCostRevision) and session.is_modified(obj, include_collections=False):
            raise FinanceCostRevisionImmutable("finance_cost_revisions rows are append-only (admin.finance rule 5b)")
    for obj in list(session.deleted):
        if isinstance(obj, FinanceCostRevision):
            raise FinanceCostRevisionImmutable("finance_cost_revisions rows cannot be deleted (admin.finance rule 5b)")
