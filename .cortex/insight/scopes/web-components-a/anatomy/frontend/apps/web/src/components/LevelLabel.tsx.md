---
path: frontend/apps/web/src/components/LevelLabel.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 27
size_tokens: 208
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "11edbcd01fdbf0e3d420de14da4590a9dc1ae538d766a417e6bc23845eeac0c4"
---

## Purpose

Small presentational component (PAD-14) that renders a coach level as a bold code, a muted "|" separator, and a muted label (e.g. **B1** | Beginner). Exists purely to keep that formatting consistent everywhere a level is shown — level selects in `AddClassSheet`/`ClassDetailSheet`, level chips, etc. — rather than each call site hand-rolling the same `<span>` markup.

## Connections

Uses: `@/lib/utils` (`cn`) — outside this scope, for merging the optional `className` prop.

Used by: `frontend/apps/web/src/components/calendar/AddClassSheet.tsx` and `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` — both render it inside a `<SelectItem>` for the level picker's option label.
