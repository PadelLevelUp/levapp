---
path: backend/padel_app/tools/documentation_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 115
size_tokens: 830
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2eaba96e5e41cd65ecb0b6b4e64a52ea1bbfc13e042d2df0ace5d150ddae8d32"
---

## Purpose

Reflection-based doc generator for the legacy admin editor's `/editor/documentation` page: `collect_model_schema` introspects a model class's SQLAlchemy `__table__.columns` (falling back to `__annotations__` if the model has no table), attaches any `FIELD_DESCRIPTIONS`/`get_field_descriptions()` the model defines, and calls the model's own `create_example()`/`edit_example()` methods (best-effort, swallowing exceptions) to produce sample create/edit payloads with `created_at`/`updated_at` stripped; `build_models_doc` runs this over every entry in `MODELS`.

## Connections

- Uses: no internal imports — pure reflection over whatever `model_cls` is passed in (relies on conventions defined in `padel_app.model`/`padel_app.models`, outside this scope)
- Used by: `padel_app/modules/editor.py`: `documentation` route calls `build_models_doc(MODELS)` to render or JSON-serve the model schema doc
