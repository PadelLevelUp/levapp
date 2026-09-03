---
path: frontend/apps/web/src/components/calendar/AttendanceRow.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 197
size_tokens: 1608
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2eda25255aff73c44522f7aa1b3a62e109355adfddbbbbe386558d9322791bb0"
---

## Purpose

One participant's attendance-marking row inside `ClassDetailSheet`: avatar/initials, name, an invited/confirmed status icon (only shown when `invited` is true — amber "sent" vs green "confirmed" via `UserCheck`/`Send` with a tooltip), a status badge (present / justified absence / unjustified absence), and — when not `disabled` — Present/Absent toggle buttons plus, for an absence, Justified/Unjustified sub-toggles. Purely controlled: takes `attendance: AttendanceState` and calls `onChange` with the next state; owns no local state of its own.

## Connections

Uses: none within this scope; imports `@/components/ui/avatar`, `@/components/ui/badge`, `@/components/ui/button`, `@/components/ui/tooltip`, `@/lib/utils`, `@/types` (`Player`, `PresenceStatus`, `AbsenceJustification`), `lucide-react`, `react-i18next` — all outside this scope.

Used by: `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` — renders one `AttendanceRow` per participant when not in edit mode, wiring `disabled={!isValidating || isCanceled}` and per-player `invited`/`confirmed` flags from the class's `presences`.
