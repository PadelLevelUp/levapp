"""PAD-742 admin.finance rule 3: a cost's charges are derived, never stored. Pure, no database."""
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from padel_app.services.admin.finance_service import charges

OCTOBER = date(2026, 10, 1)


def _cost(recurrence, starts_on, amount="10.00", ends_on=None, deleted_at=None):
    return SimpleNamespace(
        recurrence=recurrence, starts_on=starts_on, ends_on=ends_on, amount_eur=Decimal(amount), deleted_at=deleted_at
    )


def _months(cost):
    return [m.isoformat()[:7] for m, _ in charges(cost, until=OCTOBER)]


def test_a_monthly_cost_without_an_end_charges_every_month_up_to_now():
    cost = _cost("monthly", date(2026, 7, 3), "184.37")
    assert _months(cost) == ["2026-07", "2026-08", "2026-09", "2026-10"]
    assert {a for _, a in charges(cost, until=OCTOBER)} == {Decimal("184.37")}


def test_an_annual_cost_charges_its_anniversary_month_and_never_the_future():
    assert _months(_cost("annual", date(2025, 11, 20), "99.00")) == ["2025-11"]
    assert _months(_cost("annual", date(2024, 10, 2))) == ["2024-10", "2025-10", "2026-10"]


def test_an_ended_monthly_cost_stops_at_its_last_month():
    assert _months(_cost("monthly", date(2026, 5, 1), ends_on=date(2026, 8, 31))) == [
        "2026-05", "2026-06", "2026-07", "2026-08",
    ]
    assert _months(_cost("monthly", date(2026, 5, 10), ends_on=date(2026, 5, 20))) == ["2026-05"]


def test_a_one_off_cost_charges_once_and_a_future_one_not_yet():
    assert _months(_cost("once", date(2026, 8, 10))) == ["2026-08"]
    assert _months(_cost("once", date(2026, 11, 1))) == []


def test_a_deleted_cost_charges_nothing():
    assert _months(_cost("monthly", date(2026, 1, 1), deleted_at=datetime(2026, 9, 1))) == []
