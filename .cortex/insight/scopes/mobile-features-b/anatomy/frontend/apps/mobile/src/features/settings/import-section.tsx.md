---
path: frontend/apps/mobile/src/features/settings/import-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 253
size_tokens: 2183
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9b8806ab266a796f7fa64bdb10183db99b3bb2248b45a153d6b9fc91a489700e"
---

## Purpose

`ImportSection` ports only half of web's `DataImportSection`: reviewing past imports and reverting them. The doc comment reports this scope decision to the orchestrator explicitly, not just as a buried aside — web's uploader is a drag-and-drop spreadsheet flow driving two SSE streams (`/app/import/analyze`, `/app/import/confirm/stream`), and picking a file on iOS needs `expo-document-picker`, a native module requiring a pod install and app rebuild that this stream was told not to do. So uploading/analysing stays web-only, and this pane covers the pure-REST half: import history and revert. It also fixes a real UX gap versus web: web's `ImportHistorySection` returns `null` with no entries (a blank pane for a coach with no imports), which this port treats as the exact "renders nothing" failure the rebuild exists to avoid — so an explicit empty state is always shown, alongside a permanent "upload on the web" hint line.

## Connections

Uses: `frontend/apps/mobile/src/features/settings/settings-api.ts`: imports `getImportHistory`/`revertImport` and the `ImportHistoryEntry` type (visible via direct import; not captured as a resolved in-scope edge in this scope's L1 data).

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data); presumably composed into the Settings screen's coach-only `"import"` section, per `settings-sections.ts`.
