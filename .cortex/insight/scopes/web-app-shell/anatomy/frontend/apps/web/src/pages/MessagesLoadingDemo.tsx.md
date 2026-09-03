---
path: frontend/apps/web/src/pages/MessagesLoadingDemo.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 20
size_tokens: 166
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "228091e234fa0795af96d9dd9a71a608e8c4a6989afdef48aff4c84b95ec1e1e"
---

## Purpose

A dev-only demo page rendering the `LoadingMessages` skeleton in isolation with a "Messages Loading Demo" badge, structurally identical to `CalendarLoadingDemo.tsx` (this scope) — for visually inspecting the loading-skeleton component without a real messages fetch. Not wired into `App.tsx`'s route table in this scope's slice.

## Connections

Uses: `@/components/layout/AppLayout`, `@/components/ui/loading-skeleton` (`LoadingMessages`) (both outside this scope), external `lucide-react` (`Sparkles`).

Used by: not resolved within this scope's import graph — `App.tsx`'s route table (this scope) does not reference `MessagesLoadingDemo`, so no in-repo consumer is confirmed by a resolved import in this slice.
