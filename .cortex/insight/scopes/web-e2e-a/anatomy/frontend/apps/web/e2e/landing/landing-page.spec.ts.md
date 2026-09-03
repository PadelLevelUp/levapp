---
path: frontend/apps/web/e2e/landing/landing-page.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 253
size_tokens: 2360
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "074bbb8408b5ab38f50819ccf992dc73e4219bd7d1a2110d1b573862c2804862"
---

## Purpose

Coverage for the public marketing landing page at "/" and the animated
launch-loader overlay that covers the handoff from login to the app: an
unauthenticated visitor gets the pt landing page (never the app shell)
while a signed-in one gets the dashboard, footer links reach `/privacy`
and `/terms`, and the loader — held visible by delaying the login response
— must never eat clicks (`pointer-events: none`), must fly the brand mark
onto the exact on-screen logo position (desktop sidebar lockup vs. mobile
header mark, computed via `LOGO_INSETS` geometry) or fall back to a plain
fade when no logo is on screen or motion is reduced, and a failed login
must dismiss the loader so the error stays readable. Also guards that the
mobile "welcome" toast never lands on top of the mark's landing spot or
under the bottom nav.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `COACH_USERNAME`, `COACH_PASSWORD`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `components/brand/launch-loader.tsx`
  (web app shell, outside this scope) — this is the one spec that
  deliberately logs in "by hand" instead of via `helpers/auth.ts`'s
  `login()`, so it can observe the full, non-reduced-motion-forced
  animation.
