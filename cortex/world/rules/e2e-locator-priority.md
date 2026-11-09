---
about: "Playwright locators: role > placeholder > label > text > CSS, and a role's name is resolved from the locale files, never typed"
permanence: changing
verified: "2026-09-16 (told)"
origin:
  - migrated:compass/rules/R-013-e2e-locator-priority.md@ef7a5f3
aliases:
  - R-013
  - R-013-e2e-locator-priority
applies_when: "When the agent does work this rule governs: playwright locators: role > placeholder > label > text > CSS, and a role's name is resolved from the locale files, never typed"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/e2e/**/*.ts"] }
source: user@2026-09-16
---

# R-013 — Playwright locators: role > placeholder > label > text > CSS, and a role's name is resolved from the locale files, never typed

`getByRole` first; a CSS class selector is the last resort.

A role locator's `name` is rendered copy: it changes when a translator edits the string and it
flips with the language the page came up in — the defect PAD-320 removes from text matchers,
reintroduced through role names (PAD-342). So the order above holds under one condition. A role
locator keeps its place when its name is **resolved through the locale files** —
`getByRole('button', { name: ui('calendar.detail.delete') })`, where `ui()`
(`e2e/helpers/i18n.ts`) builds the name from `src/locales/{pt,en}` so both renderings match and
a rename follows the file. A `name` written as a **literal** — a string or a regex that resolves
to a locale value — is a violation: the rendered-text guard counts it and ratchets it down file
by file, like PAD-320's text matchers. A literal that matches no locale value (test-created
data: a class title, a player's name) is not copy and stays allowed. Bilingual literal
alternations (`/delete|eliminar/i`) are PAD-322's: converted to the resolved form as files are
touched, and counted by the guard once the count is low enough to be credible.

The guard tells the two apart mechanically: only string and regex literals inside
`getByRole(…, { name: … })` are scanned; a call or identifier there is invisible to the scanner
by construction, and the guard has a self-test for both shapes.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-013-e2e-locator-priority.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
