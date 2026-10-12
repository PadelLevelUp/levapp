---
id: B-504
title: "A coach who deleted their account stayed a HubSpot contact with name, email and phone; account deletion touched no external service"
type: missing-criterion
severity: high
status: resolved
affects:
  - .specflow/specs/auth/account-deletion.spec.md
  - .specflow/specs/auth/coach-crm-sync.spec.md
  - .specflow/specs-business/auth/user-deletes-their-account.business.md
  - backend/padel_app/services/account_service.py
  - backend/padel_app/services/hubspot_sync.py
proposed_fix: "After the deletion's commit, archive the HubSpot contact whose email equals the coach's (captured before anonymising), best-effort through hubspot_sync; spec both leaves (account-deletion rule 11, coach-crm-sync rule 9)."
opened: 2026-10-11T00:00:00Z
resolved: 2026-10-11T00:00:00Z
---

# B-504: a deleted coach stayed in the CRM

> Ledger id **unconfirmed** (wave-14 range, assigned by the orchestrator; this index line sits
> after B-503 here).

**Source:** PAD-602 privacy review, point 8 → PAD-607 (verified in code on origin/staging 2026-10-10).

**What happens:** `hubspot_sync` creates or updates a contact for every self-registered coach
(first name, last name, email, phone, status) and has no delete or archive path.
`delete_account_service` called no external service, so a coach who deleted their account stayed in
HubSpot with their name, email and phone.

**What should happen:** the deletion archives the coach's contact. The stored photo goes too
(B-503). Push payloads already delivered through Expo, Apple and Google cannot be recalled, and the
privacy policy now says so (§5, PAD-603).

**Root cause:** neither `auth.account-deletion` nor `auth.coach-crm-sync` had a rule or criterion
for the CRM at deletion. The PAD-471 spec said only that a *rejected* coach is never deleted.
Type: missing criterion. The behaviour was never asked for, so it is not a regression.

**Evidence:** against the old service, `test_pad607_deleted_coach_leaves_the_crm.py` sees no
archive call. A mutant that drops the call reddens 5 of 7 tests. The other two are "no request"
cases (a deleting student; no token), which pass by construction.

### Change plan
- `auth.coach-crm-sync` rule 9 (owner decision 2026-10-11): archive with
  `DELETE /crm/v3/objects/contacts/{id}` (HubSpot's recycle bin keeps it 90 days), matched by exact
  email only, never through the phone lookup. Best-effort: a warning names the step and the status,
  never the email. No token, no traffic.
- `auth.account-deletion` rule 11 "External services": CRM, file storage (rule 2a), push.
- A criterion in each leaf, plus `test_pad607_*` (7 tests). The PAD-471 importer guard now admits
  `account_service.py`, which only archives.

### Resolution
- Spec changes: `auth/account-deletion.spec.md` (rule 11, criterion, `depends_on`);
  `auth/coach-crm-sync.spec.md` (rule 9, WRITES, criterion); the business spec's rules.
- Tests: `backend/padel_app/tests/test_pad607_deleted_coach_leaves_the_crm.py` (new);
  `test_pad471_hubspot_coach_sync.py` (importer guard).
- Code: `hubspot_sync.archive_deleted_coach`, `run_archive` and `_dispatch`;
  `account_service.delete_account_service` captures the coach's email and archives after the commit.
