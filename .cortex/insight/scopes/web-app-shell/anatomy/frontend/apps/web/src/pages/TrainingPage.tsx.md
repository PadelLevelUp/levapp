---
path: frontend/apps/web/src/pages/TrainingPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 60
size_tokens: 598
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cd17c83100d616eb2ea86d4138f638d1519a44bee69263b950dbaaebc1102b2e"
---

## Purpose

The coach-only `/training` landing page: a simple two-card menu linking to `/training/exercises` and `/training/groups`. No data fetching — pure navigation.

## Connections

Uses: `@/components/layout/AppLayout`, `@/components/ui/card` (both outside this scope), external `lucide-react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/training` behind `RoleRoute allowedRoles={["coach"]}`.
