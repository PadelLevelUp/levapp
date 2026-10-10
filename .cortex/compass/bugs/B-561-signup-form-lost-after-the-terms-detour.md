---
id: B-561
title: "iOS Safari: a student who fills the sign-up form, opens the Terms and comes back finds every field empty"
type: incomplete-rule
severity: high
status: triaged
affects:
  - .specflow/specs/auth/register.spec.md
  - frontend/apps/web/src/pages/SignUpPage.tsx
proposed_fix: "Keep a sessionStorage draft of the sign-up form (no passwords) from the first keystroke until the account exists and restore it on mount (rule 20); the Terms/Privacy links stay target=_blank."
opened: 2026-10-10T00:40:00Z
---

# B-561: the sign-up form is lost on the way back from the Terms

> Ledger id **unconfirmed** (wave-14 range B-561–580).

**Source:** PAD-575, reported on Discord by a tester (iPhone, Safari): fill the self-registration
form, open "Termos e Condições", go back, everything typed is gone.

**What happens:** `SignUpPage.tsx` keeps `role`, `form` and `termsAccepted` in React state only; the
Terms and Privacy links are `<Link target="_blank">`. Whenever the student comes back to `/signup`
through anything but the still-mounted tab — a same-tab navigation to `/terms` and "back" (the SPA
route remounts), a back-forward-cache miss, iOS Safari discarding and reloading the tab — the page
mounts fresh and every field is empty.

**What should happen:** nothing typed is lost across the detour (the owner's framing: the question
is "nothing typed is lost", not the mechanism).

**Evidence (Phase 1):** read: no draft anywhere in the page or its hooks (`grep sessionStorage|
localStorage` on `SignUpPage.tsx`: only the token write after success). Reproduction: the
Playwright spec `e2e/auth-onboarding/signup-draft-survives-terms.spec.ts` (iPhone 13 profile on
Chromium: fill, same-tab `goto('/terms')`, `goBack()`, assert the fields). **Red on staging's
`SignUpPage.tsx` (control run, 2026-10-10 01:4x local, isolated DB levelup_e2e_31d1b9d2):** after the
detour and back `#signup-name` read `""` where `"Draft Student"` was typed; the reload case the same.
Green on the branch is recorded in the Resolution. What that
runner cannot prove: real WebKit bfcache behaviour and iOS tab discarding; the draft covers both by
construction (its second test reloads the tab), and the unit test proves the store.

**Root cause:** `auth.register` had no rule about the form's persistence across a detour (Type 2);
the page implemented the spec as written.

### Change Plan
- Rule 20 + criterion in `auth.register` (done in this change set).
- `src/lib/signupDraft.ts` (pure store, storage injected, passwords excluded, blank never written,
  throwing storage tolerated) + unit tests; `SignUpPage.tsx` reads it in its state initialisers,
  writes it in one effect, clears it on success. Links stay `_blank`.
- iOS: no change (the native form stays mounted while the documents open in the in-app browser).
- Playwright: the two-test spec above (detour + back; reload).

### Resolution

(filled in when the PR lands)
