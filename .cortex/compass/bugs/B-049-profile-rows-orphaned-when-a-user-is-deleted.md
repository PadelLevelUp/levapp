---
id: B-049
title: "players.user_id and coaches.user_id are nullable and non-unique: deleting a user orphans its profile and crashes serializers"
type: incomplete-rule
severity: high
status: triaged
affects:
  - auth.account-profiles
  - players.create
  - backend/padel_app/models/players.py
  - backend/padel_app/models/coaches.py
  - backend/padel_app/models/users.py
  - backend/padel_app/modules/editor_api.py
  - backend/padel_app/modules/api.py
proposed_fix: "user_id NOT NULL UNIQUE ON DELETE CASCADE on both profile tables through a fail-closed, idempotent migration; the generic editor and legacy API refuse to delete a user (409, use account deletion)."
opened: 2026-09-10T12:30:00Z
---

# B-049 — Deleting a user orphans its profile and crashes serializers

**Source:** 2026-09-02 data-model audit, findings H6 and the profile part of M14, re-verified
2026-09-10 and filed as PAD-260. Ledger number assigned by the coordinator (B-049).

**What happens:** `players.user_id` and `coaches.user_id` are `Column(Integer, ForeignKey("users.id"))`:
nullable, not unique, no delete rule. `User.player` / `User.coach` are one-to-one with no cascade, so
deleting a user makes the ORM write `user_id = NULL` into the profile. `Player.name` and `Coach.name`
read `self.user.name`, so every serializer that touches the orphan then raises. The generic editor
delete, the legacy API delete and the import revert's bulk delete can all get there. Nothing in the
schema stops a second profile for the same user either.

**What should happen:** `auth.account-profiles` rules 1–4.

**Root cause:** Type 2 — incomplete rule. `players.create` lists `Player.user_id (FK → users)` and no
spec describes the Coach entity; no rule said a profile belongs to exactly one account, what deleting
an account does to it, or that users are not hard-deleted.

**Evidence (2026-09-10, `origin/staging` 58e7ab013):** `models/players.py:29`, `models/coaches.py:17`
(the two column definitions); `models/users.py:33-36` (relationships without cascade);
`modules/editor_api.py` `delete_record` and `modules/api.py` `delete` accept any model, `user`
included; `services/import_service.py` `revert_import` bulk-deletes players, then users.

### Change Plan

**New spec:** `auth.account-profiles` (committed before code). Owner decisions via the coordinator,
2026-09-10: fail closed on bad rows (scan query in the PR, run against the staging copy of prod before
landing); keep the two placeholder deletes; the generic editor and legacy API refuse user deletes with
409 pointing at account deletion; CASCADE as the safety net.

1. Models: both `user_id` `nullable=False, unique=True, ondelete="CASCADE"`; `passive_deletes` on
   `User.player` / `User.coach`.
2. Idempotent, reversible, fail-closed migration.
3. 409 on user deletes in `/api/editor/user/<id>` and `/api/delete/user/<id>`.
4. Tests (SQLite) plus a scratch-Postgres dry run: upgrade, idempotent re-run, downgrade, re-upgrade,
   CASCADE, and a bad-rows run that must refuse.

### Resolution

_Filled in when the PR lands._
