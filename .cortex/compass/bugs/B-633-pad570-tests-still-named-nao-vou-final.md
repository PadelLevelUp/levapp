---
id: B-633
title: "After PAD-684, the PAD-570 Playwright spec and Maestro flow 229 still named \"Não vou\" final in their title and section comments"
type: test-defect
severity: low
status: resolved
resolved: 2026-10-22T05:15:00Z
affects:
  - frontend/apps/web/e2e/attendance/pad570-vou-after-reminder.spec.ts
  - frontend/apps/mobile/.maestro/flows/229-vou-after-reminder.yaml
proposed_fix: "Rename the test and its rule-28 sections to the PAD-684 rule (\"Afinal vou\" while a spot is free); assertions unchanged."
opened: 2026-10-22T05:05:00Z
---

# B-633: the PAD-570 tests' wording outlived PAD-684 (id unconfirmed, wave 16 range)

**Source:** H's App Store compat audit (wave 16) read the PAD-570 spec and flow 229 as still
expecting `already_declined` after PAD-684 made a "yes" from a not_coming student re-seat them.

**What happened:** the assertions were already updated by #767/#768 (`confirmed`,
`attendance-come-back`, `dashboard-come-back`, flow 229 `lateYes === 'confirmed'`); only the test's
title ("'Não vou' is final") and the rule-28 section comments still stated the retired rule, which
is what a reader (and the audit) took as the expectation. Type 7, test defect (wording only).

**Evidence:** `git show origin/staging:…/pad570-vou-after-reminder.spec.ts` lines 154 and 173–206
assert the new behaviour; flow 229 lines 231–232 likewise.

### Resolution
- The test title, the header line and the rule-28 section comments now name PAD-684's rule; no
  assertion changed. Run evidence: see the PR (CI subset lane; the local stack at load ~260 timed out
  in calendar navigation before any PAD-684 step, twice).
