---
id: B-245
title: "Landing page: an unreadable consent record leaves the HubSpot cookies of an earlier consent in place"
type: incomplete-rule
severity: low
status: triaged
affects:
  - frontend/apps/web/src/lib/cookieConsent.ts
  - .specflow/specs/auth/landing-page.spec.md
proposed_fix: "State rule 11 as one invariant: whenever the landing page loads with no valid `accepted` choice, the HubSpot cookies are expired. Make loadConsent clear them on every non-accepted outcome, not only on expiry."
opened: 2026-10-01T19:30:56Z
---

# B-245: an unreadable consent record keeps the cookies an earlier consent allowed

**Source:** the coordinator's verification of the #489 delta (PAD-469, 2026-10-01). It follows up the
independent review's item 1, which was fixed for *expired* records in 915213507.

**What happens:** `cookieConsent.ts` `read()` answers `{choice: null, expired: false}` for a record it
cannot use: not JSON, an unknown choice, or a missing or bad date. `loadConsent()` expires the HubSpot
cookies only when `expired` is true. So consider a visitor who accepted, whose stored record was later
corrupted (edited by hand, or by an extension). That visitor sees the banner again (correct), but still
carries `hubspotutk` / `__hstc` from the earlier consent. Opening the demo form before choosing can then
attach `hubspotutk` to the submission.

**Rule gap:** rule 11 names the expired case only. The invariant the coordinator set is simpler than the
cases: *with no valid `accepted` choice, no HubSpot cookie survives a landing-page load.*

### Change Plan (Type 1, incomplete rule)

- Rule 11: replace the expired-record sentence with the invariant.
- `loadConsent()`: expire the HubSpot cookies whenever the result is not `accepted` (expired,
  unreadable, `declined`, or absent).
- Criterion and test: a corrupted record plus cookies present → on load, no cookies and the banner shown.
- Unit tests: one per unreadable shape (the `it.each` in `cookieConsent.test.ts` already lists them).

Not urgent: both stored-record corruption and the demo form being opened before a choice are rare, and
`hubspotutk` alone carries no personal data until a form submission links it.
