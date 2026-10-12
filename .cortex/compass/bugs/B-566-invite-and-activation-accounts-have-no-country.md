---
id: B-566
title: "Accounts completed by activation or by a player/coach invitation never got a country, although the Privacy Policy says it is collected"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - .specflow/specs/auth/activate.spec.md
  - .specflow/specs/players/invite-completion.spec.md
  - .specflow/specs/clubs/coach-invitation.spec.md
  - backend/padel_app/services/registration_service.py
proposed_fix: "Rules 13a / 10a / 8a: country on the three completion paths, checked like sign-up; required for clients declaring country-on-completion, optional for older builds (PAD-630 asks later)."
opened: 2026-10-11T14:50:00Z
---

# B-566: invite and activation accounts have no country

> Ledger id **unconfirmed** (wave-14 range B-561–580; B-561–B-565 are already in staging).

**Source:** PAD-604, found by Session A while tracing PAD-601 (Terms and Privacy v2026-10-10).

**What happens:** self-sign-up asks for and stores the date of birth and the country
(`auth.register` rule 18). The three account-completion paths (activation, player-invite accept,
coach-invite accept) ask for the birth date (PAD-457) but never for the country, and the server
never stores one. Privacy Policy §1 says both are collected.

**What should happen:** `auth.activate` rule 13a, `players.invite-completion` rule 10a,
`clubs.coach-invitation` rule 8a.

**Evidence (Phase 1):** `test_pad604_country_on_completion.py` against staging b22a2cb17. A valid
country was accepted with 200 but `users.country` stayed null on all three paths, and a missing or
malformed country was accepted with 200. None of the three specs had a country rule, so this is
Type 2 (incomplete rule).

**Decision (owner via coordinator, 2026-10-11): option (b).** The newest App Store build, 1.3.0 (32),
now in review, sends no country on these paths. A hard requirement would block it, so the
requirement is gated by the compat capability `country-on-completion`. PAD-630 (Low) asks the
remaining null-country accounts later.

### Change Plan
- The three rules and their criteria; a business line in `newcomer-creates-and-activates-an-account`.
- `validate_completion_country` in `registration_service`, called after the birth date in the three
  services; the capability, registered as compat, with the admin switch text.
- Web and iOS: a required Country field (default PT, `COUNTRIES`) on the six screens; both shells
  declare the capability.

### Resolution

(filled in when the PR lands)
