---
path: frontend/apps/web/src/pages/StudentsPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 191
size_tokens: 1829
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "843cf9ece7c80e855189604511eb78a87d2a38529e17777dc8e0b776320882b4"
---

## Purpose

An apparently superseded/mock-data page: a student-roster grid with search, per-card context menu (view details / send message / copy invite link for inactive students) and a `StudentDetailSheet`. Unlike every other page in this scope, it imports data from `@/data/mockData` (`mockCoachPlayers as mockCoachStudents`, `mockLevels`) rather than an `@/api/*` module, and is not referenced by `App.tsx`'s route table in this scope's slice — `PlayersPage.tsx` (this scope) appears to be the live, API-backed replacement covering the same "coach's roster" concept.

## Connections

Uses: `@/components/layout/AppLayout`, `@/components/students/StudentDetailSheet`, `@/components/ui/{avatar,badge,button,card,context-menu,dropdown-menu,input,tooltip}` (all outside this scope), `@/data/mockData` (outside this scope), `@/types` (`CoachPlayer` as `CoachStudent`, outside this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`, `sonner`.

Used by: not resolved within this scope's import graph — `App.tsx`'s route table (this scope) does not reference `StudentsPage`, so no in-repo consumer is confirmed by a resolved import in this slice.
