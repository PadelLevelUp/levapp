---
path: frontend/apps/mobile/src/features/dashboard/CoachDashboard.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 476
size_tokens: 4387
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d54f5f7d304e802435e4405c1c70aac48a4162cd1ae69537208d1bdc45f62614"
---

## Purpose

The rebuilt coach dashboard screen body: renders the same five backend-driven blocks as web (next-class hero, needs-you queue, 7-day schedule, week pulse) from the same payload and the same shared `@levelup/config` formatters, so the two platforms can never diverge in *what* they show — only in arrangement and density. Where web splits two columns on desktop, mobile stacks everything in one priority order: hero → needs-you → next 7 days → this week. The greeting and date are deliberately NOT rendered here — they live in the navy app-bar header (`app/(tabs)/_layout.tsx`), which is why `useHeaderGreeting` is exported separately rather than used inline. `isCoachDashboard(blocks)` is the discriminator a caller uses to decide between rendering this component or the older, more generic `DashboardBlocks.tsx`.

## Connections

Uses:
- `@levelup/config` (frontend/packages/config/src/index.ts): `greetingKey`, `longDate`, `shortDate`, `todayISO`, `weekdayLong`, `weekdayShort`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `DashboardBlock` and its per-block-type variants (`DashboardNextClassBlock`, `DashboardNeedsYouBlock`, etc.).
- `expo-router`: `router.push`, used by the local `go(href)` helper to map a handful of web hrefs onto mobile tab routes (anything unmapped is a no-op rather than a 404).
- `@/components/ui/{button,text}`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — rendered by the dashboard tab screen outside this slice.

Semantically related (not imports): `frontend/apps/mobile/src/features/dashboard/DashboardBlocks.tsx` renders the older/generic block payload (used for the player-facing dashboard, which hasn't been rebuilt onto the new block set); `isCoachDashboard` is the runtime switch between the two.
