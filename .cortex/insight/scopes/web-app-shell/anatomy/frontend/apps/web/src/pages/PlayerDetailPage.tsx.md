---
path: frontend/apps/web/src/pages/PlayerDetailPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 437
size_tokens: 4202
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c9e367a6c9a1c397b0406374636febf18d82993faa4dc713c2ca9e2c3eee2002"
---

## Purpose

The coach-only `/players/:playerId` detail page. Loads the roster (`getCoachPlayers`) and levels, finds the matching player by id (rather than fetching a single-player endpoint), then loads that player's full profile (`getPlayerProfile`) and checks the standing waiting-list for an existing entry. Composes header (`PlayerHeader`), evaluations (`PlayerEvaluations` + `AddEvaluationSheet`), strengths/weaknesses (`PlayerStrengthsWeaknesses`), and info-card (`PlayerInfoCard`) subcomponents, plus dialogs for adding the player to classes (`AddToClassesDialog`) or the standing waiting list (`AddToStandingWaitingListDialog`), and a delete-player confirmation `AlertDialog`. Owns inline edit state for the player's name/email/phone/level/side/notes (two-step: `handleEditStart` populates draft fields, `handleEditSave` calls `editPlayer`).

## Connections

Uses: `@/api/coachLevel`, `@/api/evaluation`, `@/api/notificationEngine` (`getStandingWaitingList`, `removeFromStandingWaitingList`), `@/api/players` (`getCoachPlayers`, `getPlayerProfile`, `addCoachNote`, `deleteCoachNote`, `editPlayer`, `removePlayer`) (all outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/layout/AppLayout`, `@/components/layout/PageActions`, `@/components/players/AddToStandingWaitingListDialog`, `@/components/players/detail/{AddEvaluationSheet,AddToClassesDialog,PlayerEvaluations,PlayerHeader,PlayerInfoCard,PlayerStrengthsWeaknesses}` (all outside this scope), `@/components/ui/{alert-dialog,button,skeleton}` (outside this scope), `@/types` (outside this scope), external `lucide-react`, `react`, `react-i18next`, `react-router-dom`, `sonner`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/players/:playerId` behind `RoleRoute allowedRoles={["coach"]}`.
