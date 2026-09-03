---
path: frontend/apps/web/e2e/helpers/auth.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 60
size_tokens: 606
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ef36ba4eb110ebd005de4eaaa2d94467f3647a3a5f3ddd24b2821db94eeb78e3"
---

## Purpose

The suite's login helpers and seeded-user credential constants — the
single most-imported file in this scope (30 of the other 34 files in this
slice import from it), covering all four seeded roles: coach, student, a
second student, and a coach with no levels defined.

## Main players

- `COACH_USERNAME`/`COACH_PASSWORD`, `STUDENT_USERNAME`/`STUDENT_PASSWORD`,
  `STUDENT2_USERNAME`/`STUDENT2_PASSWORD`,
  `COACH_NOLEVELS_USERNAME`/`COACH_NOLEVELS_PASSWORD` (lines 3-14) —
  critical. The seeded E2E credentials; `COACH_NOLEVELS_*` exists
  specifically for the empty-levels dropdown case (PAD-29).
- `login(page, username, password)` (lines 19-42, not exported) —
  critical. Forces `reducedMotion: "reduce"` before navigating to `/auth`
  so the launch-loader animation skips to its finished frame (saving ~2s
  per login across the whole suite), then fills `#username`/`#password`
  by stable id/type — never localized placeholder or button text, since
  the pre-auth page renders in the default pt locale — and waits for the
  URL to leave `/auth`.
- `loginAsCoach`, `loginAsStudent`, `loginAsStudent2`,
  `loginAsCoachNoLevels` (lines 44-58) — critical. Thin wrappers over
  `login()` for each seeded role.

## Insights

- The `reducedMotion` emulation MUST be `page.emulateMedia()`, not the
  `use: { reducedMotion }` Playwright config option — the config-level
  option is silently inert in this suite (documented in
  playwright.config.ts). This is where that workaround actually lives for
  every spec that logs in through it.
- Specs that want to observe the FULL, non-reduced-motion login animation
  (`landing/landing-page.spec.ts`, this scope) deliberately don't call
  these helpers and instead log in "by hand" with the same
  `#username`/`#password`/submit sequence.
- Login-page selectors are id/type-based specifically because the page
  renders pre-auth in the default locale (pt); localized placeholder or
  button text would break for any locale.

## Connections

- Uses: — (only the `@playwright/test` `Page` type)
- Used by: 30 of the 34 other files in this scope, overwhelmingly via
  `loginAsCoach`/`loginAsStudent` (a handful —
  `auth-onboarding/login.spec.ts`,
  `import-history/import-confirm-504.spec.ts`,
  `import-history/import-history.spec.ts`,
  `dashboard/pending-confirmations.spec.ts`, `landing/landing-page.spec.ts`
  — additionally or instead import the raw `COACH_USERNAME`/
  `COACH_PASSWORD` constants for direct HTTP login or manual
  form-filling); also imported by many sibling-scope files
  (notification-engine, player-management, players, schedule-calendar,
  security, settings specs, outside this scope).
- Semantically related (not imports): `components/brand/launch-loader.tsx`
  (web app shell, outside this scope) — the animation this file's
  `emulateMedia` call works around; `e2e/scripts/seed.py` (outside this
  scope) is the source of truth for these credentials.

## Query pointers

- If you need to add a new seeded role/user to the suite, add its
  constants and a `loginAsX` wrapper here, and seed the matching user in
  `e2e/scripts/seed.py`.
- If a spec needs the full, non-reduced-motion login animation, don't use
  these helpers — see `landing/landing-page.spec.ts` (this scope) for the
  by-hand pattern.
- If login starts failing suite-wide, check this file's
  `reducedMotion`/selector assumptions before assuming the product broke
  — a locale or animation-timing change here affects every spec that
  imports it.
