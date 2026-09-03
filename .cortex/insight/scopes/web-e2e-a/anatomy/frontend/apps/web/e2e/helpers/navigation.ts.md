---
path: frontend/apps/web/e2e/helpers/navigation.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 42
size_tokens: 277
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "86390fc0d96fc7cdc42835452c88a8be9652c9de9afc3c1e22c73f7ec8336246"
---

## Purpose

Thin `page.goto()` + `waitForURL()` wrappers for the app's top-level
routes (calendar, players, exercises, training, messages, dashboard,
settings, availability), used by any spec that needs to land on a section
without driving the sidebar nav itself.

## Main players

- `openCalendar` (lines 3-6), `openPlayers` (lines 8-11), `openExercises`
  (lines 13-16), `openTraining` (lines 18-21), `openMessages` (lines
  23-26), `openSettings` (lines 31-34), `openAvailability` (lines 37-40)
  — critical, each. Identical shape: `page.goto("/<route>")` then
  `page.waitForURL("**/<route>")`.
- `openDashboard` (lines 28-29 area) — critical. The one exception to the
  identical shape: goes to `/` and waits for either `/` or `/dashboard`,
  since the dashboard is mounted at the app root.

## Insights

- Every helper here is a `goto` + `waitForURL`, never a click-through-the-
  sidebar navigation — specs that specifically want to test sidebar/
  nav-link behavior (e.g. `landing/landing-page.spec.ts`'s post-login
  redirect check) assert on `getByRole("navigation")` directly instead of
  using these helpers.
- `openDashboard`'s dual-path `waitForURL` predicate (`pathname === "/" ||
  pathname === "/dashboard"`) is the only helper here that isn't a single
  literal route — a reminder the dashboard's own canonical URL is not
  fully pinned down elsewhere in this scope.

## Connections

- Uses: — (only the `@playwright/test` `Page` type)
- Used by: 20 of the 34 other files in this scope, mostly via
  `openDashboard`/`openCalendar`/`openSettings`/`openExercises`/
  `openTraining`/`openMessages`/`openPlayers` (attendance and
  evaluation-tools specs in this scope mostly navigate by clicking
  through the UI instead, so they don't import this file); also imported
  by several sibling-scope files (notification-engine, player-management,
  players, schedule-calendar, settings specs, outside this scope).
- Semantically related (not imports): the web app's route table / sidebar
  nav component (outside this scope) these routes mirror.

## Query pointers

- If a spec needs to land on a top-level route and doesn't care how it
  got there, use the matching `openX` helper here rather than re-deriving
  the goto/waitForURL pair.
- If you need to test navigation itself (sidebar links, redirects), don't
  use these helpers — assert on `getByRole("navigation")`/
  `getByRole("link")` directly as `landing/landing-page.spec.ts` (this
  scope) does.
