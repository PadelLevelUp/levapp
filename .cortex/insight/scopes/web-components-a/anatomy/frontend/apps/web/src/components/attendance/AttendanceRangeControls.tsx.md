---
path: frontend/apps/web/src/components/attendance/AttendanceRangeControls.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 176
size_tokens: 1427
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "51ecc51edf0bf9a7b25631b79a53984d372967187aadbb47fc6580780d64e8d4"
---

## Purpose

PAD-114 range picker rendered below the attendance chart (spec rule 10): three presets (1 week / 1 month / 1 year) plus a `…` toggle that reveals custom from/to date fields. The component never lets the user choose a bucketing granularity — the server derives it from the span and echoes it back — so there is nothing here to keep in sync with the backend's rule. `Clear` is only shown while a custom range is active (rule 12); clearing it restores the preset view. Validates `from <= to` locally before calling `onApplyCustom`.

## Connections

Uses: `frontend/apps/web/src/components/attendance/dateRanges.ts` — only the `AttendanceRange`/`AttendanceRangePreset` types (no runtime import).

Used by: no file within this scope imports `AttendanceRangeControls`; consumed by the attendance page alongside `AttendanceChart`, outside `web-components-a`.
