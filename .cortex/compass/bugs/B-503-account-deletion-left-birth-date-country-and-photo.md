---
id: B-503
title: "Deleting an account left the birth date, country, reset code and block reason on the row, and only unlinked the photo: its images row and bucket object survived"
type: incomplete-rule
severity: high
status: resolved
affects:
  - .specflow/specs/auth/account-deletion.spec.md
  - .specflow/specs-business/auth/user-deletes-their-account.business.md
  - backend/padel_app/services/account_service.py
proposed_fix: "Rule 2 also nulls birth_date, country, the password-reset fields and notif_block_reason; new rule 2a deletes the photo's images row in the transaction and its bucket object after the commit, best-effort, unless the image is still referenced."
opened: 2026-10-11T00:00:00Z
resolved: 2026-10-11T00:00:00Z
---

# B-503: account deletion left personal details and the photo behind

> Ledger id **unconfirmed** (wave-14 range, assigned by the orchestrator; this index line sits
> after B-464 here).

**Source:** PAD-602 privacy review, point 1 → PAD-605 (verified in code on origin/staging 2026-10-10).

**What happens:** `delete_account_service` anonymised the name, contact fields, username, password
and verification codes, but `birth_date` and `country` (collected at self-sign-up, PAD-198), the
password-reset code fields and the student's free-text `notif_block_reason` stayed on the disabled
row. `user_image_id` became null, but the `images` row and the object in the uploads bucket were
never deleted. The privacy policy and the delete dialog both say the photo is deleted.

**What should happen:** those fields are null after deletion; the photo's row and its stored object
are gone, unless something else still uses the image.

**Root cause:** `auth.account-deletion` rule 2 listed the fields to clear and named
`user_image_id`, which only unlinks the photo; it said nothing about the details added later
(PAD-198) or about the stored object. Type: incomplete rule.

**Evidence:** `test_pad605_account_deletion_erases_details.py` failed 3 of 4 against the old
service (fields still set, image row still there, no bucket delete call). The fourth case (a
photo shared with a club logo stays) passed trivially then, and fails against a mutant that skips
the in-use check.

### Change plan
- Rule 2: add `birth_date`, `country`, the password-reset fields and `notif_block_reason`; keep the
  terms-acceptance record as evidence.
- Rule 2a (new): delete the photo's `images` row in the transaction and its bucket object after the
  commit, best-effort (logged by error class, never raised); skip both if the image is still
  referenced by another user, a club logo, a message attachment or a back-office app.
- Criterion "Personal details and the photo are erased (PAD-605)" plus its four tests.

### Resolution
- Spec changes: `auth/account-deletion.spec.md` rules 2 and 2a plus a criterion; the business
  journey's step 3.
- Tests added: `backend/padel_app/tests/test_pad605_account_deletion_erases_details.py`.
- Code changes: `account_service.delete_account_service`, `_photo_to_delete` and
  `_delete_stored_object`.
