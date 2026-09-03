---
path: backend/padel_app/model.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 3
size_lines: 398
size_tokens: 3317
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "013934a6c3d692ab8a480dfaee45c374a9c4ac21f14563638c1a7b47a62ed4d6"
---

## Purpose

The shared base layer for every model in this scope: `Model` is a mixin (not a db.Model itself) providing created_at/updated_at columns, generic CRUD (create/save/delete/refresh/expire/merge/flush), and the admin-editor plumbing (get_create_form/get_edit_form/display_all_info/get_display_data/get_dict, all raising NotImplementedError or relying on each subclass's own get_create_form). `update_with_dict` is the generic 'apply an incoming values dict to this instance' used by both the create and edit editor routes: relationships resolve id/[id]/instance and are only touched when the incoming value is truthy (append-only unless the caller opts a key into `_replace_collections`); columns are set when changed, with a defense-in-depth guard that refuses to overwrite `password` with an empty value or a hash-of-empty-string. `Image`/`Imageable` are a separate polymorphic pair (both extend `db.Model` directly, not this Model mixin) implementing a shared image-attachment mechanism (GCS-backed object_key, public vs. signed URL) that every image_id/logo_id/attachment_id FK in this scope points at.

## Main players

- **Model** (lines 21-135, critical): mixin providing created_at/updated_at, generic CRUD, update_with_dict, and the admin-editor form/display contract every concrete model implements.
- **Model.update_with_dict** (lines 70-88, critical): generic dict-to-instance updater used by both create and edit editor routes; relationship vs. column dispatch, append-vs-replace collection semantics.
- **Model._apply_column** (lines 127-159, critical): column-level apply with the password-overwrite defense-in-depth guard (refuses empty values and hash-of-empty-string).
- **Image** (lines 163-207, critical): polymorphic image-attachment entity (GCS object_key, public_url/signed_url) referenced by every image_id/logo_id/attachment_id FK in this scope.
- **Imageable** (lines 210-227, supporting): polymorphic base every image-owning entity would inherit from via imageable_id; only Image's own relationship is visible in this file.

## Insights

- `update_with_dict`'s relationship handling treats an incoming falsy value (empty list, 0, None, False) as 'do not touch this relationship' for EVERY relationship key, not just optional ones -- there is no way to explicitly CLEAR a many-to-one relationship or empty a collection through this generic path; that must be done by setting the column/collection directly outside update_with_dict.
- `_apply_column`'s password guard is explicitly 'defense-in-depth': its own comment says the primary guard lives in a `set_password_value` helper elsewhere (out of scope), and this is a second, independent check in case some future code path bypasses the form layer.
- `Image`/`Imageable` intentionally do NOT use the `Model` mixin (plain `db.Model` only) -- they have their own create/delete/save methods duplicated inline rather than inheriting Model's, and no get_create_form/display_all_info (not admin-editor-manageable rows).

## Connections

Uses:
- backend/padel_app/sql_db.py: `from .sql_db import db` -- the shared db instance Image/Imageable declare their tables against

Used by:
- backend/padel_app/models/__init__.py: all model files in this scope EXCEPT lesson_instance_training.py and token_blocklist.py, which are plain db.Model with no CRUD/editor mixin, use the Model mixin re-exported via models/__init__.py's own imports

## Query pointers

- If you need to change how the generic create/edit editor applies incoming form data, read update_with_dict / _apply_relationship / _apply_column here -- this is the ONE place that logic lives for every model in the app, not per-model.
- If you need to add a new image-attachment FK to a model, read Image/Imageable here first, then look at an existing example (e.g. clubs.py's logo_id or backend_apps.py's image_id) for the relationship() + *_url property pattern.
