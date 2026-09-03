---
path: frontend/apps/web/src/pages/AbsencesPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 189
size_tokens: 1661
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3d095aaf9be9c0c528f158ce268dccdf5bf545ec876fbbe13e81250e5ec2a4b7"
---

## Purpose

PAD-141 — "Faltas", the absence-history page (spec `attendance.absences`). One component serving two entry points: `/absences` (a student's own absences) and `/players/:playerId/absences` (a coach viewing one roster player), distinguished by whether `useParams().playerId` is present. Deliberately a thin page reusing the same chart/range-control/history-list components as `AttendancePage.tsx` rather than adding a `variant` prop to that page, so the two features' copy, data source, and test ids stay independent. Renders a per-row justified/unjustified badge that is presentational only (does not filter the list). The `playerId` route param is explicitly documented as NOT the authorization boundary — the backend `GET /absence_history` re-checks the caller server-side.

## Connections

Uses: `@/api/absences` (`getAbsenceHistory`, outside this scope), `@/components/attendance/{AttendanceChart,AttendanceHistoryList,AttendanceRangeControls,dateRanges}` (outside this scope, shared with `AttendancePage.tsx`), `@/components/layout/AppLayout` (outside this scope), `@/components/ui/{button,card}` (outside this scope), `@/types` (outside this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/players/:playerId/absences` (coach, `RoleRoute allowedRoles={["coach"]}`) and `/absences` (player, `RoleRoute allowedRoles={["player"]}`).
