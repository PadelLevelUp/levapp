"""PAD-397 (B-100's family): a model column's clock default must be late-bound.

`pin_clock` (tests/helpers.py) pins time by rebinding the NAME `utcnow_naive` in every loaded
module. A `Column(default=<function object>)` — `datetime.utcnow`, or `utcnow_naive` itself —
holds the original function and never sees the pin, so a row written through such a default
lands on the REAL day beside rows written at the pinned instant (the overnight red on
`test_pad364_records_api`, 2026-09-22). The only form the pin reaches is
`default=lambda: utcnow_naive()`, looked up at write time. This guard fails on any other
clock default (or `onupdate`) on a model column, so the pattern cannot return.
"""
import pathlib
import re

import pytest

MODELS = pathlib.Path(__file__).resolve().parents[1] / "models"
# Any clock in a `default=`/`onupdate=` expression other than `lambda: utcnow_naive()`:
#   - a function OBJECT (`datetime.utcnow`, `utcnow_naive`, `func.now`): bound at import, unpinnable;
#   - a lambda around the WRONG clock (`lambda: datetime.utcnow()`): late-bound, but `pin_clock`
#     rebinds `utcnow_naive` only, so the pin never reaches it (Session-B's review of #382);
#   - a CALL at class-body time (`utcnow_naive()`): one instant for the process's whole life.
# The same string is R-054's `check.pattern` (.cortex/compass/rules), run by the PreWrite hook.
IMPORT_BOUND = re.compile(
    r"\b(default|onupdate)\s*=\s*"
    r"(?:(?:lambda\s*:\s*)?datetime\.(?:utcnow|now)\b"
    r"|(?:lambda\s*:\s*)?(?:utcnow_naive|utcnow|func\.now)\b(?!\s*\()"
    r"|(?:utcnow_naive|utcnow)\s*\()"
)
# `func.now` is a SERVER-side default and is fine as `server_default=func.now()` (`\bdefault`
# does not match inside `server_default`); as a Python `default=` it is neither pinnable nor
# what the app uses — it is caught above on purpose.


def _offenders():
    found = []
    # PAD-405: model.py holds the `Model` mixin whose columns every model inherits.
    for path in [*sorted(MODELS.glob("*.py")), MODELS.parent / "model.py"]:
        text = path.read_text()
        # `default=lambda: utcnow_naive()` is the late-bound form the pin reaches: not an offender.
        for m in IMPORT_BOUND.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            found.append(f"{path.name}:{line} {m.group(0)}")
    return found


@pytest.mark.parametrize(
    "spelling",
    [
        "default=datetime.utcnow",
        "onupdate=datetime.utcnow",
        "default=datetime.now",
        "default=utcnow_naive",
        "default=func.now",
        "default=lambda: datetime.utcnow()",
        "default=lambda: datetime.now(timezone.utc)",
        "default=utcnow_naive()",
    ],
)
def test_the_guard_flags_every_other_clock_spelling(spelling):
    # The instrument's positive control: a guard that matches nothing passes vacuously.
    assert IMPORT_BOUND.search(f"    created_at = Column(DateTime, {spelling})")


@pytest.mark.parametrize(
    "spelling",
    [
        "default=lambda: utcnow_naive()",
        "onupdate=lambda: utcnow_naive()",
        "server_default=func.now()",
        "default=None",
    ],
)
def test_the_guard_accepts_the_late_bound_form(spelling):
    assert IMPORT_BOUND.search(f"    created_at = Column(DateTime, {spelling})") is None


def test_no_model_column_binds_a_clock_at_import():
    offenders = _offenders()
    assert offenders == [], (
        "Import-bound clock defaults (pin_clock cannot reach them; use `default=lambda: utcnow_naive()`):\n  "
        + "\n  ".join(offenders)
    )
