---
path: frontend/apps/mobile/src/features/calendar/ParticipantRow.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 191
size_tokens: 1398
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c3d36ce634e1eaee18498ba250b9189f79702a8024b251de1b110f441501a518"
---

## Purpose

One participant's row in a class's attendance list: avatar initials, name, status badges (Invited/Confirmed from `presence`, Present/Absent(+Justified/Unjustified) from `attendance`), and — when `canMark` is true (coaches only) — present/absent toggle buttons plus a justified/unjustified sub-toggle that appears once a player is marked absent. Mobile analogue of the web `AttendanceRow`. Also exports the `playerName` helper (backend serializes participants as `{ id, userId, user: {...} }`, so the display name always comes off `player.user?.name`).

## Connections

Uses:
- `@levelup/types` (frontend/packages/types/src/index.ts): `AbsenceJustification`, `Player`, `Presence`, `PresenceStatus`.
- `@/components/ui/{avatar,badge,button,text}`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — rendered by a class-detail/attendance screen outside this slice, presumably alongside `PlanningSection.tsx` and `NotifyModal.tsx`.
