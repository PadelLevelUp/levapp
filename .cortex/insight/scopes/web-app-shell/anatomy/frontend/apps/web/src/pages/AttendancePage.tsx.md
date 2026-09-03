---
path: frontend/apps/web/src/pages/AttendancePage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 153
size_tokens: 1317
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "27e3a90639da7f6a2cd4a6a75da1a5139cb04af3694b6c5c291030f8bd30314b"
---

## Purpose

PAD-114 — "Presenças", the attendance-history page (spec `attendance.history`). Mirrors `AbsencesPage.tsx`'s structure exactly: one component serving `/attendance` (student's own history) and `/players/:playerId/attendance` (coach viewing a roster player), branching on the presence of `useParams().playerId`. Doc comment cites PAD-88/PAD-115 as precedent for not conflating the coach and player views into a shared variant prop, and again documents that the route guard is UX-only — `GET /attendance_history` re-authorizes server-side.

## Connections

Uses: `@/api/attendance` (`getAttendanceHistory`, outside this scope), `@/components/attendance/{AttendanceChart,AttendanceHistoryList,AttendanceRangeControls,dateRanges}` (outside this scope, shared with `AbsencesPage.tsx`), `@/components/layout/AppLayout` (outside this scope), `@/components/ui/{button,card}` (outside this scope), `@/types` (outside this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/players/:playerId/attendance` (coach, `RoleRoute allowedRoles={["coach"]}`) and `/attendance` (player, `RoleRoute allowedRoles={["player"]}`).
