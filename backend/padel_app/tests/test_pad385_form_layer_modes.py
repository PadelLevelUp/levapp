"""PAD-385 (step 0 of PAD-367, B-136) — the JSON form adapter's two modes.

`legacy` is what every caller gets today and must keep getting, bit for bit: a key
the body did not hold is filled with `''`, a falsy value reads as "not sent", and a
missing Boolean is written as False. `present` is opt-in: `values` holds a key if and
only if the JSON body held it.

PART 1 characterises legacy mode against a FROZEN COPY of the adapter as it was on
origin/staging 589f1977d, plus absolute expectations for the cells B-136 is about, so
the reference cannot drift together with the code. It was written, and passed, before
the adapter was touched — it is the "old code" half of this step's 2x2.
"""
from datetime import datetime

import pytest
from werkzeug.datastructures import MultiDict
from werkzeug.security import check_password_hash

from padel_app.tools.input_tools import Field, Form, Tab
from padel_app.tools.request_adapter import JsonRequestAdapter


class _FrozenLegacyAdapter:
    """A verbatim copy of JsonRequestAdapter.__init__ at origin/staging 589f1977d.

    Deliberately NOT imported from the code under test: legacy mode is proven unchanged
    by comparing the live adapter with this, cell by cell.
    """

    def __init__(self, data, form=None):
        self._raw = data or {}

        if form:
            normalized = {}
            for field in form.fields:
                normalized[field.name] = self._raw.get(field.name, '')
        else:
            normalized = self._raw

        self.form = MultiDict(normalized)
        self.files = MultiDict()


ABSENT = object()

SCALAR_FIELDS = [
    ("title", "Text"),
    ("capacity", "Integer"),
    ("ratio", "Float"),
    ("status", "Select"),
    ("color", "Color"),
    ("is_recurring", "Boolean"),
    ("starts_on", "Date"),
    ("starts_at", "DateTime"),
    ("password", "Password"),
]

RELATION_FIELDS = [("level", "ManyToOne"), ("players", "ManyToMany")]

#: every kind of thing a JSON client can put under a key, and leaving the key out
PAYLOADS = [
    ("absent", ABSENT),
    ("empty-string", ""),
    ("null", None),
    ("zero", 0),
    ("false", False),
    ("string-zero", "0"),
    ("text", "x"),
    ("five", 5),
    ("true", True),
    ("iso-date", "2026-09-21"),
]


def _form(fields):
    form = Form()
    form.add_tab(Tab("t", [Field("1", "Model", name, name, kind) for name, kind in fields]))
    return form


def _values(adapter_cls, fields, name, payload, **adapter_kwargs):
    form = _form(fields)
    data = {} if payload is ABSENT else {name: payload}
    try:
        return form.set_values(adapter_cls(data, form, **adapter_kwargs))
    except Exception as error:  # a cell that raises today must go on raising the same way
        return ("raised", type(error).__name__)


def _comparable(values):
    """Password hashes are salted, so two runs never compare equal: keep only whether one was made."""
    if isinstance(values, tuple):
        return values
    return {k: ("<hash>" if k == "password" and v else v) for k, v in values.items()}


# ---------------------------------------------------------------- PART 1: legacy mode


@pytest.mark.parametrize("label,payload", PAYLOADS, ids=[p[0] for p in PAYLOADS])
@pytest.mark.parametrize("name,kind", SCALAR_FIELDS + RELATION_FIELDS, ids=[f[0] for f in SCALAR_FIELDS + RELATION_FIELDS])
def test_legacy_mode_answers_exactly_what_the_adapter_always_answered(name, kind, label, payload):
    fields = SCALAR_FIELDS + RELATION_FIELDS
    live = _values(JsonRequestAdapter, fields, name, payload)
    frozen = _values(_FrozenLegacyAdapter, fields, name, payload)
    assert _comparable(live) == _comparable(frozen)


def test_legacy_mode_the_cells_b136_is_about_stated_absolutely():
    """If someone 'fixes' legacy mode in place, the comparison above would still pass against a
    reference edited the same way. These are the numbers themselves."""
    fields = SCALAR_FIELDS
    assert _values(JsonRequestAdapter, fields, "capacity", 0)["capacity"] is None  # a 0 reads as not sent
    assert _values(JsonRequestAdapter, fields, "capacity", "0")["capacity"] == "0"  # ...a "0" does not
    assert _values(JsonRequestAdapter, fields, "title", "")["title"] is None
    assert _values(JsonRequestAdapter, fields, "title", ABSENT)["title"] is None
    assert _values(JsonRequestAdapter, fields, "is_recurring", ABSENT)["is_recurring"] is False  # absent = False
    assert _values(JsonRequestAdapter, fields, "is_recurring", False)["is_recurring"] is False
    assert _values(JsonRequestAdapter, fields, "is_recurring", True)["is_recurring"] is True
    assert _values(JsonRequestAdapter, fields, "starts_on", "")["starts_on"] is None
    assert _values(JsonRequestAdapter, fields, "starts_on", "2026-09-21")["starts_on"] == datetime(2026, 9, 21)
    assert _values(JsonRequestAdapter, fields, "password", "")["password"] is None  # never hash an empty input
    assert check_password_hash(_values(JsonRequestAdapter, fields, "password", "s3cret")["password"], "s3cret")
    # every field of the form is in the answer, sent or not — that is what `present` mode changes
    assert set(_values(JsonRequestAdapter, fields, "title", "x")) == {name for name, _ in fields}
