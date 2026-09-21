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


# --------------------------------------------------------------- PART 2: present mode
#
# `values` holds a key if and only if the JSON body held it (design note, "The
# distinction"). A key that is there is WRITTEN: "" and null clear, 0 and false are
# values. A key that is not there is left alone — Booleans included.


def _present(fields, data):
    form = _form(fields)
    return form.set_values(JsonRequestAdapter(data, form, mode="present"))


def test_the_mode_is_a_closed_set_and_present_needs_a_form():
    with pytest.raises(ValueError):
        JsonRequestAdapter({}, _form(SCALAR_FIELDS), mode="strict")
    with pytest.raises(ValueError):
        JsonRequestAdapter({"title": "x"}, None, mode="present")
    assert JsonRequestAdapter({}, _form(SCALAR_FIELDS)).mode == "legacy"


def test_present_mode_exposes_exactly_the_keys_the_body_held():
    form = _form(SCALAR_FIELDS)
    adapter = JsonRequestAdapter({"title": None, "capacity": 0, "not_a_field": 1}, form, mode="present")
    assert adapter.present == frozenset({"title", "capacity"})  # a key the form does not know is ignored
    assert "status" not in adapter.form  # no '' filling
    assert adapter.form["title"] is None  # null survives into the request


def test_present_absent_keys_are_not_in_values_booleans_included():
    assert _present(SCALAR_FIELDS, {}) == {}
    values = _present(SCALAR_FIELDS, {"title": "Aula"})
    assert values == {"title": "Aula"}
    assert "is_recurring" not in values  # never False by omission — the mirror trap of B-136


def test_present_zero_and_false_are_values():
    values = _present(SCALAR_FIELDS, {"capacity": 0, "ratio": 0.0, "is_recurring": False})
    assert values == {"capacity": 0, "ratio": 0.0, "is_recurring": False}
    assert values["capacity"] is not None and values["is_recurring"] is False


@pytest.mark.parametrize("cleared", ["", None], ids=["empty-string", "null"])
def test_present_empty_string_and_null_both_clear(cleared):
    values = _present(
        SCALAR_FIELDS,
        {"title": cleared, "capacity": cleared, "status": cleared, "color": cleared,
         "starts_on": cleared, "starts_at": cleared, "is_recurring": cleared},
    )
    assert values == {"title": None, "capacity": None, "status": None, "color": None,
                      "starts_on": None, "starts_at": None, "is_recurring": None}


def test_present_values_that_are_there_are_parsed_as_they_always_were():
    values = _present(
        SCALAR_FIELDS,
        {"title": "Aula", "capacity": 5, "status": "open", "is_recurring": "true",
         "starts_on": "2026-09-21", "starts_at": "2026-09-21 10:00:00"},
    )
    assert values == {"title": "Aula", "capacity": 5, "status": "open", "is_recurring": True,
                      "starts_on": datetime(2026, 9, 21), "starts_at": datetime(2026, 9, 21, 10, 0)}


@pytest.mark.parametrize("empty", ["", None, "   "], ids=["empty-string", "null", "blank"])
def test_present_an_empty_password_never_clears_and_never_hashes(empty):
    assert _present(SCALAR_FIELDS, {"password": empty}) == {}  # dropped: not None, not a hash


def test_present_a_password_that_is_there_is_hashed():
    values = _present(SCALAR_FIELDS, {"password": "s3cret"})
    assert check_password_hash(values["password"], "s3cret")


@pytest.mark.parametrize("cleared", ["", None, []], ids=["empty-string", "null", "empty-list"])
def test_present_a_many_to_one_can_be_cleared(cleared):
    assert _present(RELATION_FIELDS, {"level": cleared}) == {"level": None}


def test_present_a_many_to_one_that_is_there_and_collections_are_as_today():
    assert _present(RELATION_FIELDS, {"level": 7}) == {"level": [7]}
    assert _present(RELATION_FIELDS, {"players": [1, 2]}) == {"players": [1, 2]}
    assert _present(RELATION_FIELDS, {}) == {}


def test_present_mode_leaves_no_trace_on_the_fields():
    """The Jinja editor reuses Field objects; a mode flag left behind would change an HTML post."""
    form = _form(SCALAR_FIELDS)
    form.set_values(JsonRequestAdapter({"capacity": 0}, form, mode="present"))
    assert form.set_values(_FrozenLegacyAdapter({"capacity": 0}, form))["capacity"] is None


def test_an_html_post_has_no_mode_and_is_read_exactly_as_before():
    class HtmlRequest:  # what Flask hands the editor: a MultiDict, no `mode`, no `present`
        form = MultiDict({"title": "", "capacity": "0", "is_recurring": "false"})
        files = MultiDict()

    values = _form(SCALAR_FIELDS).set_values(HtmlRequest())
    assert values["title"] is None and values["capacity"] == "0" and values["is_recurring"] is False
    assert set(values) == {name for name, _ in SCALAR_FIELDS}
