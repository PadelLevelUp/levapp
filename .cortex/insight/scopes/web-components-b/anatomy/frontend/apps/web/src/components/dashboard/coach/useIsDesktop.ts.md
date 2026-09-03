---
path: frontend/apps/web/src/components/dashboard/coach/useIsDesktop.ts
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 35
size_tokens: 308
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2db71acfbd4cb319f01ccbbbd5cb9420e9be9ad670351db7cd32d8410b117b70"
---

## Purpose

A `matchMedia`-backed hook reporting whether the viewport is at or above the dashboard's 1024px desktop breakpoint (matching Tailwind's `lg`). Exists because the coach dashboard's hero and "this week" sections move BETWEEN layout columns across that breakpoint rather than just being hidden/shown via CSS — rendering both arrangements and hiding one with CSS would duplicate every `data-testid` in the DOM, which breaks Playwright's strict-mode locators. Initializes state from `matchMedia` synchronously on first render (not inside an effect) so a desktop-width load never paints the mobile arrangement for one frame first.

## Connections

Uses: `react` only.

Used by: `frontend/apps/web/src/components/dashboard/CoachDashboard.tsx` (outside this scope), to decide which single arrangement of the hero/schedule blocks to render.

Semantically related (not imports): `dashboard/coach/WeekPulse.tsx` uses the same 1024px breakpoint via Tailwind's `hidden lg:block` directly rather than this hook — that block's desktop-only content (the sparkline) has no `data-testid` at stake, so it doesn't need the "render exactly once" guarantee this hook exists to provide.
