"""A pinned clock must not outlive its test (#523's red on both CI lanes).

A test that pins `utcnow_naive` patches `padel_app.utils.dates` too, so a module imported for
the FIRST time inside that test (the dashboard helpers import their services lazily) binds the
fake and keeps it after monkeypatch puts everything else back. A later test then read the
earlier test's "now": `pin_clock` skipped the module because it rebound only the genuine
function, and `test_the_day_turns_at_lisbon_midnight` sent its three reminders on one stale
day (`pytest test_dashboard_needs_you_snooze.py test_pad486_profile_completeness.py` was red).
"""
import sys
import types
from datetime import datetime

PROBE = "padel_app._clock_leak_probe"


def _leaked_module(monkeypatch):
    mod = types.ModuleType(PROBE)
    mod.utcnow_naive = lambda: datetime(2026, 8, 4, 10, 0)  # what a lazy import under an old pin keeps
    monkeypatch.setitem(sys.modules, PROBE, mod)
    return mod


def test_pin_clock_rebinds_a_module_that_kept_an_earlier_tests_fake(monkeypatch):
    from padel_app.tests.helpers import pin_clock

    mod = _leaked_module(monkeypatch)
    pin_clock(monkeypatch, datetime(2026, 7, 15, 22, 30))
    assert mod.utcnow_naive() == datetime(2026, 7, 15, 22, 30)
    pin_clock(monkeypatch, datetime(2026, 7, 15, 23, 10))
    assert mod.utcnow_naive() == datetime(2026, 7, 15, 23, 10)


def test_healing_gives_a_leaked_module_the_genuine_clock_back(monkeypatch):
    from padel_app.tests.helpers import heal_clock_bindings
    from padel_app.utils import dates

    mod = _leaked_module(monkeypatch)
    heal_clock_bindings()
    assert mod.utcnow_naive is dates.utcnow_naive
    assert abs((mod.utcnow_naive() - datetime.utcnow()).total_seconds()) < 60
