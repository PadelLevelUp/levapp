"""admin.finance (PAD-742): manual costs, their charges, the month × category summary and the CSV.

Routes stay thin (R-005); nothing here commits: the console's `@audited` wrapper commits the write
with its audit row (admin.foundation rule 8). The audit row gets only the changed field names
(rule 5a); the values go to `finance_cost_revisions` (rule 5b).
"""
import csv
import io
import re
from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from padel_app.models.finance import (
    CATEGORIES,
    RECURRENCES,
    FinanceCost,
    FinanceCostRevision,
    FinanceGcpCost,
)
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

#: Rule 1 (assumption Q4): the lowest console role that reaches finance, reads included.
FINANCE_ROLE = "owner"

CENT = Decimal("0.01")
_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
_CURRENCY = re.compile(r"^[A-Z]{3}$")
#: Request field → model attribute, in the order the audit's `changedFields` lists them.
FIELDS = (
    ("category", "category"),
    ("vendor", "vendor"),
    ("description", "description"),
    ("currency", "currency"),
    ("amount", "amount"),
    ("amountEur", "amount_eur"),
    ("recurrence", "recurrence"),
    ("startsOn", "starts_on"),
    ("endsOn", "ends_on"),
    ("gcpInvoice", "gcp_invoice"),
    ("notes", "notes"),
)


class FinanceError(Exception):
    def __init__(self, code, status=400, field=None):
        super().__init__(code)
        self.code = code
        self.status = status
        self.field = field

    def payload(self):
        body = {"error": self.code}
        if self.field:
            body["field"] = self.field
        return body


def _invalid(field):
    return FinanceError("INVALID_COST", 400, field)


# ── months ────────────────────────────────────────────────────────────────────


def month_of(day):
    return date(day.year, day.month, 1)


def add_months(month, n):
    index = month.year * 12 + month.month - 1 + n
    return date(index // 12, index % 12 + 1, 1)


def month_key(month):
    return f"{month.year:04d}-{month.month:02d}"


def parse_month(value, field="month"):
    match = _MONTH.match(value or "")
    if not match:
        raise FinanceError("INVALID_MONTH", 400, field)
    return date(int(match.group(1)), int(match.group(2)), 1)


def current_month(now=None):
    return month_of(now or utcnow_naive())


# ── charges (rule 3) ──────────────────────────────────────────────────────────


def charges(cost, *, until):
    """The months a cost charges and the euro amount of each, never after ``until`` (a month)."""
    if cost.deleted_at is not None:
        return []
    first = month_of(cost.starts_on)
    if first > until:
        return []
    amount = Decimal(cost.amount_eur)
    if cost.recurrence == "once":
        return [(first, amount)]
    last = until if cost.ends_on is None else min(until, month_of(cost.ends_on))
    step = 1 if cost.recurrence == "monthly" else 12
    out, month = [], first
    while month <= last:
        out.append((month, amount))
        month = add_months(month, step)
    return out


# ── validation (rule 5) ───────────────────────────────────────────────────────


def _money(value, field):
    if isinstance(value, bool) or value is None:
        raise _invalid(field)
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise _invalid(field)
    if not amount.is_finite() or amount <= 0 or amount.as_tuple().exponent < -2 or amount >= Decimal("1e10"):
        raise _invalid(field)
    return amount.quantize(CENT)


def _day(value, field, required):
    if value in (None, ""):
        if required:
            raise _invalid(field)
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise _invalid(field)


def _text(value, field, limit, required=True):
    text = (value or "").strip() if isinstance(value, str) or value is None else None
    if text is None or (required and not text) or len(text) > limit:
        raise _invalid(field)
    return text or None


def _clean(merged):
    """The validated attribute values for a cost from its merged request fields."""
    category = merged.get("category")
    if category not in CATEGORIES:
        raise _invalid("category")
    recurrence = merged.get("recurrence")
    if recurrence not in RECURRENCES:
        raise _invalid("recurrence")
    currency = merged.get("currency")
    if not isinstance(currency, str) or not _CURRENCY.match(currency):
        raise _invalid("currency")
    amount = _money(merged.get("amount"), "amount")
    raw_eur = merged.get("amountEur")
    if currency == "EUR" and raw_eur in (None, ""):
        amount_eur = amount
    else:
        amount_eur = _money(raw_eur, "amountEur")
    if currency == "EUR" and amount_eur != amount:
        raise _invalid("amountEur")
    starts_on = _day(merged.get("startsOn"), "startsOn", required=True)
    ends_on = _day(merged.get("endsOn"), "endsOn", required=False)
    if ends_on is not None and (recurrence == "once" or ends_on < starts_on):
        raise _invalid("endsOn")
    gcp_invoice = merged.get("gcpInvoice", False)
    if not isinstance(gcp_invoice, bool):
        raise _invalid("gcpInvoice")
    if gcp_invoice and (recurrence != "once" or category != "infrastructure"):
        raise _invalid("gcpInvoice")
    notes = merged.get("notes")
    if notes is not None and not isinstance(notes, str):
        raise _invalid("notes")
    return {
        "category": category,
        "vendor": _text(merged.get("vendor"), "vendor", 80),
        "description": _text(merged.get("description"), "description", 200),
        "currency": currency,
        "amount": amount,
        "amount_eur": amount_eur,
        "recurrence": recurrence,
        "starts_on": starts_on,
        "ends_on": ends_on,
        "gcp_invoice": gcp_invoice,
        "notes": (notes or "").strip() or None,
    }


def _imported_months():
    return {row[0] for row in db.session.query(FinanceGcpCost.invoice_month).distinct()}


def _refuse_imported_gcp_month(values):
    """Rule 6: Google Cloud is counted once."""
    if values["gcp_invoice"] and month_of(values["starts_on"]) in _imported_months():
        raise FinanceError("GCP_MONTH_IMPORTED", 409)


def _revise(cost, action, actor_email):
    last = (
        db.session.query(db.func.max(FinanceCostRevision.revision))
        .filter(FinanceCostRevision.cost_id == cost.id)
        .scalar()
    )
    db.session.add(
        FinanceCostRevision(
            cost_id=cost.id,
            revision=(last or 0) + 1,
            action=action,
            snapshot=cost.to_dict(),
            actor_email=actor_email,
        )
    )


def _same(a, b):
    if isinstance(a, Decimal) or isinstance(b, Decimal):
        return a is not None and b is not None and Decimal(a) == Decimal(b)
    return a == b


# ── writes (rules 5, 5a, 5b) ──────────────────────────────────────────────────


def get_cost(cost_id, include_deleted=False):
    cost = db.session.get(FinanceCost, cost_id)
    if cost is None or (cost.deleted_at is not None and not include_deleted):
        raise FinanceError("NOT_FOUND", 404)
    return cost


def create_cost(data, actor_email):
    """Returns ``(cost, changed_fields)``; the caller's transaction commits."""
    values = _clean(data or {})
    _refuse_imported_gcp_month(values)
    cost = FinanceCost(**values, created_by_email=actor_email, updated_by_email=actor_email)
    db.session.add(cost)
    db.session.flush()
    _revise(cost, "create", actor_email)
    changed = [name for name, attr in FIELDS if getattr(cost, attr) not in (None, False)]
    return cost, changed


def update_cost(cost_id, data, actor_email):
    cost = get_cost(cost_id)
    current = {name: cost.to_dict()[name] for name, _ in FIELDS}
    merged = {**current, **{k: v for k, v in (data or {}).items() if k in current}}
    values = _clean(merged)
    _refuse_imported_gcp_month(values)
    changed = [name for name, attr in FIELDS if not _same(getattr(cost, attr), values[attr])]
    for attr, value in values.items():
        setattr(cost, attr, value)
    cost.updated_by_email = actor_email
    db.session.flush()
    _revise(cost, "update", actor_email)
    return cost, changed


def delete_cost(cost_id, actor_email):
    cost = get_cost(cost_id)
    cost.deleted_at = utcnow_naive()
    cost.deleted_by_email = actor_email
    cost.updated_by_email = actor_email
    db.session.flush()
    _revise(cost, "delete", actor_email)
    return cost, ["deletedAt"]


def list_costs(category=None, vendor=None, include_deleted=False):
    q = FinanceCost.query
    if not include_deleted:
        q = q.filter(FinanceCost.deleted_at.is_(None))
    if category:
        q = q.filter(FinanceCost.category == category)
    if vendor:
        q = q.filter(FinanceCost.vendor.ilike(f"%{vendor}%"))
    return [c.to_dict() for c in q.order_by(FinanceCost.starts_on.desc(), FinanceCost.id.desc()).all()]


def list_revisions(cost_id):
    get_cost(cost_id, include_deleted=True)
    rows = (
        FinanceCostRevision.query.filter_by(cost_id=cost_id)
        .order_by(FinanceCostRevision.revision.desc())
        .all()
    )
    return [r.to_dict() for r in rows]


# ── summary (rules 4, 6, 10) ──────────────────────────────────────────────────


def _imported_net_by_month():
    net = defaultdict(Decimal)
    for month, cost, credits in db.session.query(
        FinanceGcpCost.invoice_month, FinanceGcpCost.cost, FinanceGcpCost.credits
    ):
        net[month] += Decimal(cost) + Decimal(credits)
    return net


def _charge_lines(until):
    """Every charge up to ``until``: (month, category, euros, cost) — with superseded rows apart."""
    imported = _imported_net_by_month()
    lines, superseded = [], []
    for cost in FinanceCost.query.filter(FinanceCost.deleted_at.is_(None)).all():
        for month, amount in charges(cost, until=until):
            if cost.gcp_invoice and month in imported:
                superseded.append({"costId": cost.id, "month": month_key(month)})
                continue
            lines.append((month, cost.category, amount, cost))
    return lines, superseded, imported


def summary(from_month=None, to_month=None, now=None):
    from padel_app.services.admin import finance_gcp_import

    now = now or utcnow_naive()
    until = current_month(now)
    lines, superseded, imported = _charge_lines(until)
    raw = defaultdict(lambda: defaultdict(Decimal))
    for month, category, amount, _cost in lines:
        raw[month][category] += amount
    for month, net in imported.items():
        if month <= until:
            raw[month]["infrastructure"] += net
    start = min(raw) if raw else None
    months = []
    if start is not None:
        last = min(to_month or until, until)
        first = max(from_month or start, start)
        cumulative = Decimal("0.00")
        month = start
        while month <= last:
            by_category = {c: raw[month][c].quantize(CENT, ROUND_HALF_UP) for c in CATEGORIES if c in raw[month]}
            total = sum(by_category.values(), Decimal("0.00"))
            cumulative += total
            if month >= first:
                months.append(
                    {
                        "month": month_key(month),
                        "byCategory": {c: f"{v:.2f}" for c, v in by_category.items()},
                        "total": f"{total:.2f}",
                        "cumulative": f"{cumulative:.2f}",
                    }
                )
            month = add_months(month, 1)
    return {
        "categories": list(CATEGORIES),
        "start": month_key(start) if start else None,
        "months": months,
        "superseded": superseded,
        "importStatus": finance_gcp_import.import_status(now),
    }


# ── CSV (rule 10) ─────────────────────────────────────────────────────────────

CSV_HEADER = ("month", "category", "vendor_or_project", "description_or_service", "amount", "currency", "amount_eur")


def export_csv(from_month=None, to_month=None, now=None):
    now = now or utcnow_naive()
    until = current_month(now)
    last = min(to_month or until, until)
    lines, _superseded, _imported = _charge_lines(until)
    rows = []
    for month, category, amount, cost in lines:
        if (from_month and month < from_month) or month > last:
            continue
        rows.append(
            (month_key(month), category, cost.vendor, cost.description, f"{cost.amount:.2f}", cost.currency, f"{amount:.2f}")
        )
    gcp = FinanceGcpCost.query.filter(FinanceGcpCost.invoice_month <= last)
    if from_month:
        gcp = gcp.filter(FinanceGcpCost.invoice_month >= from_month)
    for line in gcp.all():
        net = (Decimal(line.cost) + Decimal(line.credits)).quantize(CENT, ROUND_HALF_UP)
        rows.append(
            (month_key(line.invoice_month), "infrastructure", line.project_id, line.service, f"{net:.2f}", line.currency, f"{net:.2f}")
        )
    rows.sort(key=lambda r: (r[0], r[1], r[2], r[3]))
    out = io.StringIO()
    out.write("﻿")
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(CSV_HEADER)
    writer.writerows(rows)
    return out.getvalue()
