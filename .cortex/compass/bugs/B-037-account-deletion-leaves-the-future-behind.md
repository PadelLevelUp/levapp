---
id: B-037
title: "Account deletion leaves the future behind: enrolments, reminders, pushes, waiting-list credits and legacy login survive"
type: missing-dev-spec
severity: medium
status: resolved
affects:
  - auth.account-deletion
  - backend/padel_app/services/account_service.py
  - backend/padel_app/modules/auth.py
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/player_service.py
proposed_fix: "Write auth.account-deletion and implement its cascade: scrub the account (username, password), delete tokens, push subscriptions, blocks and calendar blocks, take a student out of every future class and waiting list silently, make the engine and every roster list skip a disabled account, refuse legacy login, rewrite the copy."
opened: 2026-09-10T11:30:00Z
resolved: 2026-09-10T13:00:00Z
---

# B-037 — Account deletion leaves the future behind

**Source:** 2026-09-02 data-model audit, finding M10, filed as PAD-268.

**What happens:** `DELETE /api/auth/me` sets `status = "disabled"` and scrubs name, email, phone,
code and photo — nothing else. A deleted student stays enrolled in every future class and keeps
getting reminders; standing waiting-list credits keep being spent; device tokens and web-push
subscriptions keep receiving pushes; the invitation engine still picks the account for rounds
(unless the coach enabled "Exclude inactive accounts", off by default); the username and password
hash survive; the legacy session `/login` still logs a disabled user in; the coach's roster lists
and pickers still show "Deleted user". The in-app copy meanwhile promises the account and all data
are permanently deleted.

**What should happen:** see `auth.account-deletion` rules 1–10.

**Root cause:** Type 4 — missing dev spec. No leaf governed account deletion; three specs only
mentioned `delete_account_service` in passing (`auth.coach-approval`, `players.claim`,
`settings.role-scope`), so each consumer of "a user" (enrolment, reminders, waiting list, engine,
roster lists, legacy login) was never told what a deleted account means.

**Evidence (observed 2026-09-10):**
1. `services/account_service.py` — the whole service is five field assignments and a commit.
2. `modules/auth.py` `login()` — checks the password hash, never `status`.
3. `services/notification_service.py` `evaluate_candidates` — the `inactive_account` stage runs only
   when `restrictions.excludeUnpaidSubscription` is enabled.
4. `send_class_reminders` addresses `instance.players_relations`, so enrolment is what keeps
   reminders flowing.
5. `services/player_service.py` roster lists (`get_coach_players_list`, `get_coach_players_paginated`,
   `search_coach_players`, `get_players_list`) have no status filter.
6. Test `test_pad268_account_deletion_cascade.py` fails on the unfixed code (see Resolution).

**Affected specs:**
- Dev: `.specflow/specs/auth/account-deletion.spec.md` (new), `.specflow/specs/import/analyze.spec.md` rule 6.
- Business: `.specflow/specs-business/auth/user-deletes-their-account.business.md` (new).

### Change Plan

**New spec:** `auth.account-deletion` implementing `auth.user-deletes-their-account` (committed
b8384ab21 before code). Decisions: `.cortex/atlas/decisions/2026-09-10-account-deletion-keeps-coach-records.md`.

1. `delete_account_service`: scrub + unusable credentials; delete tokens, push subscriptions,
   blocks, calendar blocks; student cascade (future enrolments/presences, series with occurrences
   ahead, waiting lists) with no vacancy.
2. Legacy `/login` refuses `disabled`.
3. `evaluate_candidates`: a `disabled` account is always `inactive_account`.
4. Roster lists and pickers exclude `disabled` accounts.
5. Copy (en, pt) rewritten.

### Resolution

- Spec changes: `auth.account-deletion` (new, implemented), `auth.user-deletes-their-account` (new),
  `import.analyze` rule 6; decision `2026-09-10-account-deletion-keeps-coach-records` with the
  privacy-policy checklist; B-038 filed for the owner.
- Tests added: `backend/padel_app/tests/test_pad268_account_deletion_cascade.py` (14; 12 failed on
  the unfixed code, the other 2 are guards). The legacy-login tests build their own app because the
  shared test app has no session interface (`create_app(test_config)` skips `Config`, so Flask-Session
  gets no `SESSION_TYPE`).
- Code changes: `services/account_service.py` (the cascade, one transaction), `modules/auth.py` +
  `auth.py` (legacy login and session loader refuse `disabled`), `services/notification_service.py`
  (candidate selection and waiting-list placement always skip `disabled`),
  `services/player_service.py` (roster lists and pickers), `services/presence_overview_service.py`
  (table and trend on the same player set); copy in `settings.account.*` (en, pt).
- Verified: backend suite 1069 passed; tsc web and mobile clean; Playwright counts in the PR.
- Resolved: 2026-09-10 (PAD-268).
