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

MODELS = pathlib.Path(__file__).resolve().parents[1] / "models"
# A clock function OBJECT handed to SQLAlchemy: bound at import, unpinnable.
IMPORT_BOUND = re.compile(
    r"\b(default|onupdate)\s*=\s*(datetime\.utcnow|datetime\.now|utcnow_naive|utcnow|func\.now)\b(?!\s*\()"
)
# `func.now` is a SERVER-side default and is fine as `server_default=func.now()`; as a Python
# `default=` it is neither pinnable nor what the app uses — it is caught above on purpose.


def _offenders():
    found = []
    for path in sorted(MODELS.glob("*.py")):
        text = path.read_text()
        # `default=lambda: utcnow_naive()` is the late-bound form the pin reaches: not an offender.
        for m in IMPORT_BOUND.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            found.append(f"{path.name}:{line} {m.group(0)}")
    return found


def test_no_model_column_binds_a_clock_at_import():
    offenders = _offenders()
    assert offenders == [], (
        "Import-bound clock defaults (pin_clock cannot reach them; use `default=lambda: utcnow_naive()`):\n  "
        + "\n  ".join(offenders)
    )
