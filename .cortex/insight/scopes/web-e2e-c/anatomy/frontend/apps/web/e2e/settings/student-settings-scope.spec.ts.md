---
path: frontend/apps/web/e2e/settings/student-settings-scope.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 3
size_lines: 322
size_tokens: 2716
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3628f8aab6349160eb58aa3315825ce4125b37a395e8818cd8f4ff4bef96c319"
---

## Purpose

PAD-103: Settings must offer a student only student-relevant sections, and
the coach-only endpoints behind the hidden sections must reject a student
caller with 403 rather than crash. Also folds in PAD-142, the mirror-image
follow-up: the student-only "My notifications" panel (PAD-112) must NOT be
offered to a coach. Deliberately split into a UI half (cosmetic — proves the
student is not *invited* into coach configuration) and an HTTP half (the
actual security boundary: before the fix these routes resolved the acting
coach with the nullable \`current_coach()\` and dereferenced it, so a student
caller got an unhandled \`AttributeError\` 500 instead of a deliberate 403 — so
every status here is asserted exactly, since "not 200" would have passed
against the broken code). The exhaustive endpoint matrix's backend-only
counterpart lives in \`padel_app/tests/test_settings_role_authz.py\`; this spec
pins the same contract end-to-end against the running stack.

## Main players

- \`COACH_ONLY_TABS\` / \`SHARED_TABS\` (lines 52-53) — the UI-visibility
  ground truth: \`calendar\`/\`notifications\`/\`import\`/\`club\` are coach-only,
  \`profile\`/\`preferences\`/\`account\` are shared.
- \`COACH_ONLY_ENDPOINTS\` (lines 193-255) — critical: the 13-entry HTTP matrix
  (skill levels, evaluation categories, seasons, coach identity, import
  history, notification-engine config — reads and writes) each run in a
  parameterized \`test\` loop (lines 258-277) asserting a student gets exactly
  403.
- \`test.describe("PAD-142: ...")\` (lines 157-187) — the reverse-direction
  check: a coach must get \`toHaveCount(0)\` (not \`not.toBeVisible()\`) for the
  \`settings-nav-myNotifications\` testid, because the nav renders twice
  (desktop sidebar + mobile drill-in) with one copy \`display:none\` — a
  visibility assertion would pass against the unfixed page by matching the
  hidden copy.

## Insights

- The \`toHaveCount(0)\` vs \`not.toBeVisible()\` distinction (documented in the
  file's own comment above the PAD-142 describe block) is the file's single
  most important testing-technique lesson: a duplicated-but-hidden DOM node is
  a real trap for a naive visibility assertion, and it recurs anywhere the app
  renders both a desktop and mobile nav copy.
- The HTTP-half status codes are asserted with \`toBe(403)\`, never a looser
  \`not.toBe(200)\`, specifically because the pre-fix failure mode was a 500 —
  a loose assertion would have silently passed against the broken code the
  whole ticket exists to fix.
- Endpoint bodies in \`COACH_ONLY_ENDPOINTS\` are deliberately valid-shaped
  (real field names, plausible ids) rather than empty, so a 403 there proves
  the role check fires before any payload validation or row lookup — matching
  the same discipline used in \`security/frontend-api-auth.spec.ts\`'s
  \`GUARDED_ROUTES\`.
- Per-user settings (profile read/update, including the student's own
  \`language\`) are asserted to stay open to a student caller even while every
  coach-only config endpoint is locked down (lines 301-321) — proving the
  authorization boundary is drawn at "coach configuration" specifically, not
  at "any write from a student".

## Connections

Uses:
- ../helpers/auth: \`loginAsCoach\`, \`loginAsStudent\`, \`COACH_USERNAME\`/\`COACH_PASSWORD\`, \`STUDENT_USERNAME\`/\`STUDENT_PASSWORD\`
- ../helpers/navigation: \`openSettings\`
- ../helpers/api: \`API_ROOT\`

Used by: —

Semantically related (not imports): backend counterpart
\`padel_app/tests/test_settings_role_authz.py\` (also referenced by
\`security/training-players-role-authz.spec.ts\`, PAD-116's sibling role-authz
ticket); the PAD-142 half is the mirror image of
\`settings/student-notification-blocks.spec.ts\`'s student-only "My
notifications" panel, which this file also asserts a coach never sees.

## Query pointers

If you need to add or change a coach-only Settings endpoint's authorization,
also read: \`COACH_ONLY_ENDPOINTS\` (this file, lines 193-255) and the backend
\`padel_app/tests/test_settings_role_authz.py\`.
If you need to change which Settings tabs a role sees, read first:
\`COACH_ONLY_TABS\`/\`SHARED_TABS\` (this file, lines 52-53), then: the AppLayout
\`roles\` gating and the SettingsPage nav component.
