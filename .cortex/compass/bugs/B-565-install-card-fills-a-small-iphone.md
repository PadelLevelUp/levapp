---
id: B-565
title: "On a 320 px iPhone the 'get the iOS app' card grew to 310 px (one word per line); at 375 px it took a third of the screen"
type: incomplete-rule
severity: high
status: triaged
affects:
  - .specflow/specs/mobile/install-suggestion.spec.md
  - frontend/apps/web/src/components/layout/InstallAppBanner.tsx
  - frontend/src/locales/pt/installApp.json
  - frontend/src/locales/en/installApp.json
proposed_fix: "Rule 4a: a slim strip at 320–375 px (≤ 72 px, title clamped to 2 lines, body hidden below sm, short 'Abrir'/'Open' label, close always visible); Playwright pins height and no overlap with the first heading at both widths."
opened: 2026-10-11T13:30:00Z
---

# B-565: the install card fills a small iPhone

> Ledger id **unconfirmed** (wave-14 range B-561–580; B-563 is on a sibling branch).

**Source:** PAD-628, from Session C's calendar QA (PAD-580 report, 2026-10-11). It has been in
production since promotion 9; it regressed with PAD-573.

**What happens:** the card is one flex row. The "Ir para a App Store" button and the close button
keep their full width, so at 320 px the text column gets about 50 px and the title and body wrap
one word per line. Measured by QA: a 288 × 310 px card in a 320 × 568 viewport, and 343 × 186 px
in 375 × 667. That pushes the calendar's controls below the fold.

**What should happen:** rule 4a, a strip of at most 72 px that never covers the page's first
heading and stays dismissible.

**Evidence (Phase 1):** QA's `install-banner.json` boxes at both widths and the 320 px
screenshot (one word per line beside the button), read in
`docs/qa/reports/2026-10-11-pad-580-calendar-qa/web/student-iphone-se-{320,375}/`. Rule 4 said
"never a hold" but stated no size, so Type 2 (incomplete rule).

### Change Plan
- Rule 4a and its criterion (done in this branch).
- `InstallAppBanner`: tighter padding below `sm`, title `line-clamp-2`, body `hidden sm:block`,
  button `openShort` below `sm` with an sr-only " App Store" so its accessible name contains the
  visible label (WCAG 2.5.3), the 44 px close button kept (negative margins).
- `installApp.openShort` in pt ("Abrir") and en ("Open").
- E2E `install-suggestion.spec.ts`: 320 and 375 px cases on /settings (height, no overlap with the
  first h1, no sideways scroll, dismiss) and on /calendar (height, page starts below the card).
  Red on staging's component, green on the fix, in one sitting: staging's card measured 306 px
  (320 wide) and 218 px (375 wide) against the 72 px bound; the fix passed the file 7/7.

### Resolution

(filled in when the PR lands)
