---
id: B-288
title: "E2E: profile-completeness signed a student up without ticking the Terms, required since PAD-485"
type: test-defect
severity: high
status: resolved
affects:
  - frontend/apps/web/e2e/dashboard/profile-completeness.spec.ts
proposed_fix: "Tick signup-terms before submit, as the auth-onboarding specs do since #517. Test-only."
opened: 2026-10-03T13:23:38Z
resolved: 2026-10-03T13:34:57Z
---

# B-288: profile-completeness signed up without the Terms

**Source:** the release gate on staging 71981fb80 (2026-10-03), red in the shard and alone.

**What happened:** `dashboard/profile-completeness.spec.ts:32` (PAD-486/490) stayed on `/signup`
instead of reaching `/verify-email` (15 s).

**Root cause:** PAD-485 (`auth.register` rule 19) made the Terms box required. #517 updated the
auth-onboarding specs, but this spec, written on a branch cut before #517, was merged later and
never ticked it. After merging staging into feature/pad-486, its author ran only unit tests and the
pad504 spec, so it was not caught there.

**Evidence:** red at 71981fb80 on the isolated stack (13:23Z); with
`getByTestId("signup-terms").click()` before submit, green (13:28Z, in the 7-passed run of B-287).

**Lesson:** after merging staging into a branch that adds an E2E spec, run that branch's own
new specs, not only the unit suites.

### Resolution
- Test: one line in `profile-completeness.spec.ts`. Code: none.
