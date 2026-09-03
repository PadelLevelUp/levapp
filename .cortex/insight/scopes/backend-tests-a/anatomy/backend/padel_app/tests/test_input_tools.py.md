---
path: backend/padel_app/tests/test_input_tools.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 239
size_tokens: 1660
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5331d979c7ccbf9b31556ba3fbb056abf4833f49c1021e7263bb99e7d8d280d0"
---

## Purpose

Unit tests for `padel_app.tools.input_tools` — the `Field`/`Block`/`Tab`/
`Form` classes that back the Jinja admin editor's dynamic forms. No
app/DB fixture; uses `DummyRequest`/`DummyFiles`/`DummyFile` stand-ins for
Flask's request object. Covers: `Field` requires label/name/type (raises
`ValueError` otherwise) and rejects an invalid type; per-type
`set_value`/`set_boolean_value` coercion for Text, Boolean (`"true"`/
`"false"` strings), Password (hashed via `check_password_hash`), Date/
DateTime (delegating to `tools.str_to_date`/`str_to_datetime`, mocked),
ManyToMany relationship id lists, Picture and MultiplePictures (mocking
`image_tools.file_handler`/`save_file` and the `Image` model to isolate
the field logic from real file I/O); `Block`/`Tab` require non-empty
lists of actual `Field` instances; `Form.add_block`/`add_tab` validate
types and reject duplicate block names; `Form.get_form_dict` shape
(`main`, `tabs` keys); and `Form.set_values` round-trips a request into a
values dict.

## Connections

- Uses: `padel_app.tools.input_tools` (`Field`, `Block`, `Tab`, `Form` —
  the module under test); `padel_app.tools.image_tools`,
  `padel_app.tools.tools` (both monkeypatched, not exercised for real);
  `werkzeug.security.check_password_hash`.
- Used by: (none — leaf test file)
- Semantically related (not imports): `Field.set_boolean_value`'s
  coercion is the same code path `test_boolean_coercion.py` pins the
  PAD-69 bug fix against — that file tests the same class from a
  regression angle (real Python booleans from JSON, not just HTML-form
  strings) and end-to-end through `Presence.get_create_form()`.
