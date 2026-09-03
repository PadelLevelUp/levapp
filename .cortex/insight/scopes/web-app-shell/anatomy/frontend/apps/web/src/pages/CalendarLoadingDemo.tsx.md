---
path: frontend/apps/web/src/pages/CalendarLoadingDemo.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 20
size_tokens: 166
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3efe502ba59737dfdbd0d2657ab469ade7468e8514e34edbfcc46f5eb9f70af3"
---

## Purpose

A dev-only demo page rendering the `LoadingCalendar` skeleton in isolation with a "Calendar Loading Demo" badge, for visually inspecting the loading-skeleton component without triggering a real calendar fetch. Not wired into `App.tsx`'s route table in this scope's slice — appears to be a standalone/manual-testing page.

## Connections

Uses: `@/components/layout/AppLayout`, `@/components/ui/loading-skeleton` (`LoadingCalendar`) (both outside this scope), external `lucide-react` (`Sparkles`).

Used by: not resolved within this scope's import graph — `App.tsx`'s route table (this scope) does not reference `CalendarLoadingDemo`, so no in-repo consumer is confirmed by a resolved import in this slice.
