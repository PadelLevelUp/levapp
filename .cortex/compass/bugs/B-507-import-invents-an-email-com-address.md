---
id: B-507
title: "The import gave a student without an email an invented first_second@email.com address (339 in production); imports before 2026-06-09 also stored the hash of an empty password"
type: wrong-rule
severity: high
status: resolved
affects:
  - .specflow/specs/import/confirm.spec.md
  - backend/padel_app/services/import_service.py
  - backend/migrations/versions/0069acbc403a_pad633_drop_invented_import_emails.py
proposed_fix: "Store NULL and a pending- placeholder for a row without an email (rules 5-7); a data migration clears the invented address, the placeholder-shaped username and an empty-string password hash from existing never-activated imports (rule 8)."
opened: 2026-10-12T09:04:32Z
resolved: 2026-10-12T09:04:32Z
---

# B-507: the import invented an @email.com address

**Source:** PAD-602 privacy review, finding D1 (PAD-633).

**What happens:** for a Players row without an email, `bulk_create_players` wrote
`first_second@email.com` (`_2`, `_3`… on a collision) and set the username to that local part.
`email.com` is a real public mail domain, so the address could belong to a stranger. Production
held 339 such users, all `inactive` (counted 2026-10-11).

**What should happen:** no email (NULL) and a `pending-…` placeholder username, as for every
coach-created player (PAD-105); identity by email only when the row has one.

**Evidence (Phase 1):** the PAD-633 tests went red on the old code: the row stored
`joao_silva@email.com`, and a second "João Silva" got `joao_silva_2@email.com`. The prod count
split 176 rows with a NULL password and 163 with one. Code history explains the split: at
007041961 (2026-03-03) `create_player_helper` built the User through its form, and
`set_password_value` hashed `request.form[name]`, which `JsonRequestAdapter` fills with `""`. So
every import up to 933d7827c (2026-06-09, which stores NULL for a blank value) got
`generate_password_hash("")`. `/api/app/login` refuses an empty password, so the hash never
opened an account. No code path ever mailed these addresses (PAD-602 §3).

**Also seen, outside this fix:** the legacy form route `POST /auth/login` (`modules/auth.py`) does
not refuse an empty password. According to the tracked nginx config it is unreachable from
outside: only `/api/` reaches the backend, which binds to loopback. Reported to the orchestrator
for its own ticket, together with the pre-June coach-created players that may carry the same
hash.

### Change Plan
- Spec rules 5-8 and four criteria in `import/confirm.spec.md`; a business rule in
  `coach-imports-a-roster-spreadsheet.business.md`.
- `import_service`: `_row_email` returns NULL when the row has no email; the case-insensitive
  match happens only when there is an email; new users get `unique_placeholder_username()`.
- Migration `0069acbc403a`: for each user in the import's shape (inactive; `@email.com`; username =
  local part) whose password is NULL or the hash of "", set email, password to NULL and give a
  fresh placeholder username. A chosen password is skipped and counted. It prints the three
  counts.

### Resolution
- Spec changes: `import/confirm.spec.md` (rules 5-8, four criteria), business spec rule.
- Tests: `test_pad633_import_invents_no_email.py` (5), `test_pad633_migration.py` (3).
- Code: `import_service.py`, migration `0069acbc403a`.
