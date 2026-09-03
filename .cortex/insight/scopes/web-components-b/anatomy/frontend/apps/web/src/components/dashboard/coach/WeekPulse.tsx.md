---
path: frontend/apps/web/src/components/dashboard/coach/WeekPulse.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 65
size_tokens: 567
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f8e1c0511a75e5e30005e2594f1a6f6bb102ab3e468cc50d5be6b0d44af04f4d"
---

## Purpose

The coach dashboard's closing block: two metrics (seats-filled % and active players), each always paired with its denominator so the number is legible on its own ("38 of 52 active, 14 idle" tells the coach something a bare "38" does not). Deliberately placed last because it informs rather than prompts. The trend sparkline and delta badge are desktop-only (`hidden lg:block`) — at mobile width seven bars would be a few pixels each and read as decoration rather than data.

## Connections

Uses: `./primitives` (`Eyebrow`, `Sparkbars`, `StatCard`); `@/lib/utils`'s `cn`; `@levelup/types` for `DashboardWeekPulseBlock`.

Used by: `frontend/apps/web/src/components/dashboard/CoachDashboard.tsx` (outside this scope).

Semantically related (not imports): `dashboard/coach/useIsDesktop.ts` — same `lg` (1024px) breakpoint concept, though this file uses the CSS-only `hidden lg:block` form rather than the JS hook (there's no `data-testid` duplication risk here since the sparkline has no test id).
