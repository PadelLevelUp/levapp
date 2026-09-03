---
path: frontend/apps/web/src/components/attendance/dateRanges.ts
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 3
size_lines: 63
size_tokens: 507
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5a1ae954757d628ade6beb554ac5b707eb20d98cd4e128a48cf8622525fcec8f"
---

## Purpose

PAD-114's shared UTC date-range maths for the attendance feature. Every function speaks bare `YYYY-MM-DD` strings and works exclusively in UTC because that is what the attendance endpoint buckets on (`lesson_instances.start_datetime` is stored naive-UTC) — going through a local-time `Date` would reintroduce the off-by-one-day drift that PAD-33 had to chase down in the messaging timestamps. This is the highest-centrality file in the `attendance/` subtree: all three attendance UI components (`AttendanceChart`, `AttendanceHistoryList`, `AttendanceRangeControls`) depend on it directly or via its exported types.

## Main players

- `toIsoDate(d: Date): string` (lines 18–20) — critical. `YYYY-MM-DD` for a UTC `Date`, via `d.toISOString().slice(0, 10)`.
- `parseIsoDate(value: string): Date` (lines 23–26) — critical. Parses a bare `YYYY-MM-DD` (or a naive ISO datetime, truncated to its first 10 chars) as a UTC `Date` via `Date.UTC`. The inverse of `toIsoDate` and the entry point every consumer uses to turn a server date string into something `Intl.DateTimeFormat` can format.
- `presetRange(preset, now = new Date()): AttendanceRange` (lines 35–61) — critical. Computes the `{from, to}` range for `"1w"` (current Monday–Sunday week), `"1m"` (current calendar month), or `"1y"` (current calendar year), all in UTC. `now` is an injectable parameter — pass a fixed `Date` in tests instead of monkey-patching the clock.
- `AttendanceRangePreset` / `AttendanceRange` (lines 10–15) — supporting. The type vocabulary (`"1w" | "1m" | "1y"`, and `{from: string; to: string}`) shared by every attendance component's props.

## Insights

- The `"1w"` branch converts `getUTCDay()` (Sunday = 0) to a Monday-start index via `(now.getUTCDay() + 6) % 7` — a common but easy-to-get-backwards idiom; changing the week-start convention here changes it for the whole attendance feature at once.
- The `"1m"` branch's `last` day is computed as `new Date(Date.UTC(y, m + 1, 0))` — day 0 of next month is a compact way to get "last day of this month" without a lookup table, including leap-year Februaries for free.
- Nothing here reads `Date.now()` except `presetRange`'s default parameter, keeping the rest of the module purely a function of its string/Date inputs — deliberate, since the attendance page needs deterministic range math for tests.

## Connections

Uses: nothing (no imports; leaf module).

Used by: `frontend/apps/web/src/components/attendance/AttendanceChart.tsx` (`parseIsoDate`), `frontend/apps/web/src/components/attendance/AttendanceHistoryList.tsx` (`parseIsoDate`), `frontend/apps/web/src/components/attendance/AttendanceRangeControls.tsx` (types only) — all three attendance/ siblings.

## Query pointers

- If you need to change how attendance ranges are computed or add a new preset, start here — `AttendanceRangeControls` only renders the `PRESETS` list and calls into this module; the actual date math lives entirely in `presetRange`.
- If you need to fix a date-off-by-one bug anywhere in the attendance feature, read this file first — it is almost certainly a UTC-vs-local mismatch, and the fix should go through `toIsoDate`/`parseIsoDate` rather than a new ad hoc `Date` construction.
