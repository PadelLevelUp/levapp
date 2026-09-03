---
path: backend/padel_app/tools/input_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 3
size_lines: 269
size_tokens: 2257
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c1c5f78b87943e9c09400205dd9e96d53c1b552c68f8e667c68fbded970f126d"
---

## Purpose

Declarative form/field schema layer used by nearly every model in `padel_app/models/` to describe its create/edit forms for the legacy editor and its JSON-API twin (`editor_api.py`/`api.py`), and to actually populate field values from an incoming request. `Field` knows how to validate itself and extract its own value from either a real Flask `request` or a `JsonRequestAdapter`-wrapped JSON body, dispatching by `type` (Text, Integer, Picture, ManyToMany, Boolean, Password, Date, etc.) to a type-specific setter. `Block`/`Tab` group fields for layout; `Form` aggregates blocks/tabs into one schema and drives `set_values(request)` — the actual per-request "read this form's fields from the request" call.

## Main players

- `Field` (lines 9-193) — critical. Constructor validates `label`/`name`/`type` are present and `type` is one of `valid_types` (15 field kinds); `set_special_fields` maps 8 of those types to bespoke setters, everything else falls through `set_value`'s generic `request.form[name]` read.
- `Field.set_boolean_value` (lines 148-168) — critical. Accepts real Python `bool` (from `JsonRequestAdapter`) as well as HTML form truthy strings (`TRUTHY_STRINGS`). The comment documents PAD-69: the prior version compared against the literal string `"true"`, so a real `True` from a JSON payload was silently written as `False` — this wiped `Presence.confirmed` on attendance updates and re-triggered reminder notifications for already-confirmed players.
- `Field.set_password_value` (lines 170-183) — critical. Refuses to hash an empty/blank value; `JsonRequestAdapter` fills missing keys with `''` by default, so without this guard every edit-form submission touching a Password field would silently overwrite the user's password hash with `hash('')`, locking them out (and letting anyone submit an empty password to match the corrupted hash).
- `Field.set_picture_value` / `set_multiple_picture_value` (lines 84-120) — supporting. Uploads via `image_tools`, creates an `Image` row, stores the image id(s) as the field's value.
- `Field.set_date_value` (lines 131-143) — supporting. Delegates to `tools.str_to_date`/`tools.str_to_datetime` by field type.
- `Form.set_values(request)` (lines 265-268) — critical. Iterates every field, calls `field.set_value(request)`, and returns `{field.name: field.value}` — this is the dict every model's create/edit route consumes.

## Insights

- The two "CRITICAL" comments (`set_boolean_value`, `set_password_value`) are both post-incident guards: PAD-69 (silent attendance-confirmation corruption) and the unnamed password-wipe bug they describe are the reason these two setters look more defensive than the rest of the file — any future refactor of `Field.set_value`'s dispatch has to preserve both behaviors exactly, not just "clean up" the type coercion.
- `Field.set_relationship_value` (lines 122-129) calls `request.form.getlist(self.name)` twice — once inside the list comprehension's filter condition and once as the list source — a redundant double lookup rather than a bug, but worth knowing before "simplifying" it (the two calls must return the same list, which they do, since `MultiDict.getlist` is a pure read).
- `Block.add_block` restricts block names to exactly `"picture_block"`/`"info_block"` (line 246) — this is a closed, hardcoded set baked into the framework rather than model-configurable, so any model wanting a third block name must extend this list here, not just call `add_block` with a new name.

## Connections

- Uses: `padel_app.model.Image`; `padel_app.tools.image_tools` (`file_handler`, `save_file`); `padel_app.tools.tools` (`str_to_date`, `str_to_datetime`); `werkzeug.security.generate_password_hash`
- Used by: `padel_app/tools/request_adapter.py` (same scope): `JsonRequestAdapter` exists specifically to be accepted here; nearly every model under `padel_app/models/` (outside this scope — e.g. `users.py`, `lessons.py`, `players.py`, and ~30 others) builds its `get_create_form()`/`get_edit_form()` out of `Field`/`Block`/`Tab`/`Form`, and `modules/api.py`/`modules/editor.py` (same scope) call `form.set_values(request)` on the result

## Query pointers

If you're adding a new field type, also read: `Field.valid_types` and `Field.set_special_fields` together — a type must appear in both, or the second (generic) branch of `set_value` handles it as plain text.
If you're touching Boolean or Password field handling, read first: the PAD-69 comment on `set_boolean_value` and the incident comment on `set_password_value` — both encode a specific historical bug, not just style.
If you need to see how a specific model wires its form, read: that model's `get_create_form()`/`get_edit_form()` in `padel_app/models/<model>.py` (outside this scope).
