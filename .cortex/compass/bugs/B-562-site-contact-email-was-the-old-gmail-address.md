---
id: B-562
title: "The site offered padellevelup2026@gmail.com (and admin@levapp.pt in the landing copy) instead of admin@levapp.app"
type: incomplete-rule
severity: low
status: triaged
affects:
  - .specflow/specs/auth/landing-page.spec.md
  - frontend/apps/web/src/pages/LandingPage.tsx
  - frontend/apps/web/src/pages/SupportPage.tsx
  - frontend/apps/web/public/support.html
proposed_fix: "One CONTACT_EMAIL constant in @levelup/config (admin@levapp.app) used by every site surface; a test reads the rendering files for any old address."
opened: 2026-10-10T01:55:00Z
---

# B-562: the site's contact email was the old Gmail address

> Ledger id **unconfirmed** (wave-14 range).

**Source:** PAD-599 (Discord): "Atual: padellevelup2026@gmail.com. Correto: admin@levapp.app."

**What happened:** the address was typed in four places with two values — `padellevelup2026@gmail.com`
in `LandingPage.tsx` (demo CTA), `SupportPage.tsx` (`/support`) and the static
`public/support.html` (the App Store support URL), and `admin@levapp.pt` in `LandingPage.tsx`'s
footer/ideas link and in `landing.json` (pt and en). The site's source is this repository
(`frontend/apps/web`): no separate site exists.

**What should happen:** one address, `admin@levapp.app` (the owner's Google Workspace mailbox,
atlas decision 2026-09-03), everywhere.

**Evidence (Phase 1):** `git grep` for both addresses on staging c0d345720 (the five files above);
`LandingPage.demo.test.tsx` even asserted the Gmail address. No spec named the address (Type 2).

### Change Plan
- `auth.landing-page` rule 14 + criterion; `@levelup/config` `CONTACT_EMAIL`; the five files read it
  or carry it; the demo test asserts the new address; `contact-email.test.ts` reads the rendering
  files for any old address.

### Resolution

(filled in when the PR lands)
