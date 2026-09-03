---
path: frontend/apps/web/src/pages/EditorPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 664
size_tokens: 5604
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c09b014b2221ef06d18ae35677c3a0d990056d77d3837f7a30ba91ffe1d1e143"
---

## Purpose

A generic, schema-driven database record editor for super-admins, mounted at `/editor` and `/editor/:model`. Loads the list of editable models (`getEditorModels`), then for a selected model loads its field schema (`getEditorSchema`) and paginated records (`getEditorRecords`), plus related-model options for foreign-key fields (`getEditorOptions`). Renders a searchable, paginated table with create/edit (via a `Sheet`-based `RecordSheet`) and delete (via `AlertDialog` confirmation). This is the largest file in the scope, exporting three components: the default `EditorPage`, plus `FieldInput` and `RecordSheet` which are also named exports (unusual for a page file — likely reused or tested independently).

## Main players (notable exports beyond the default)

- `FieldInput` — renders the correct input control for a `FieldDef.type` (Boolean/Integer/etc., plus presumably String/Password/Picture/related-model select based on the switch statement and `RecordSheet`'s field-filtering logic).
- `RecordSheet` — the create/edit sheet; on submit, strips empty `Password` fields (never overwrites with blank) and skips `Picture`/`EditablePicture`/`MultiplePictures` fields from the payload entirely.

## Connections

Uses: `@/api/editor` (`getEditorModels`, `getEditorSchema`, `getEditorRecords`, `getEditorOptions`, `createEditorRecord`, `updateEditorRecord`, `deleteEditorRecord`, types `ModelMeta`/`FieldDef`/`RecordData`/`RelatedOption`, outside this scope), `@/components/layout/AppLayout`, `@/components/ui/{alert-dialog,button,input,label,select,sheet,switch}` (outside this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`, `sonner`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/editor` and `/editor/:model` behind `SuperAdminRoute`.
