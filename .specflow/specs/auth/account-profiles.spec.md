---
id: auth.account-profiles
status: implementing
depends_on: [auth.register, auth.activate, players.create, players.remove, import.revert]
implements: ../../specs-business/auth/newcomer-creates-and-activates-an-account.business.md
governed_by: []
---

# auth.account-profiles

### Intent
An account (`users`) carries at most one player profile (`players`) and at most one coach profile
(`coaches`), and a profile never exists without its account. Until PAD-260 both `user_id` columns
were nullable, non-unique and had no delete rule: deleting a user wrote `user_id = NULL` into its
profile, after which `Player.name` / `Coach.name` (which read `self.user.name`) raised and every
serializer that touched the profile crashed (audit H6, profile half of M14). Reachable through the
generic editor delete, the legacy API delete and the import revert.

### Rules
1. **One account, at most one profile of each kind, never an orphan.** `players.user_id` and
   `coaches.user_id` are `NOT NULL`, `UNIQUE`, and reference `users.id` with `ON DELETE CASCADE`.
   `User.player` and `User.coach` stay one-to-one and use `passive_deletes`, so the ORM never tries to
   null the column on a user delete and the database removes the profile.
2. **The migration fails closed on bad rows.** Before any change it counts, on both tables, rows with a
   `NULL` `user_id` and `user_id` values held by more than one row. If it finds any it raises with the
   ids and changes nothing (owner decision 2026-09-10). The PR carries a read-only scan query that the
   batch session or Session B runs against the staging copy of production before this lands.
3. **Users are not hard-deleted, with two placeholder exceptions.** Account deletion
   (`DELETE /api/auth/me`) anonymises the row instead. The generic editor (`/api/editor/user/<id>`)
   and the legacy API (`/api/delete/user/<id>`) refuse to delete a user with 409, pointing at account
   deletion. Two domain paths still remove never-activated, coach-created placeholder accounts, each
   deleting the profile first: removing a player who has one coach and never activated
   (`players.remove`), and reverting an import (`import.revert`). `ON DELETE CASCADE` is the safety net
   — if a user row is deleted anyway, its profiles go with it and are never orphaned.
4. **The migration is idempotent and reversible.** Re-running it on an already migrated schema changes
   nothing; the downgrade restores a nullable, non-unique `user_id` with the plain foreign key.

### Acceptance Criteria

#### A profile always has exactly one account
- **Given** a user with a player profile (or a coach profile)
- **When** a second player (or coach) profile is saved for the same user, or a profile is saved with no user
- **Then** the database refuses it

#### Deleting an account row takes its profiles with it (Postgres)
- **Given** a user with a player profile and a coach profile
- **When** the user row is deleted
- **Then** both profile rows are gone, not left with a `NULL` `user_id`

#### The generic editor will not delete a user
- **Given** the superadmin
- **When** they delete a user through `/api/editor/user/<id>` or `/api/delete/user/<id>`
- **Then** the answer is 409 naming account deletion, and the user still exists
- **And** deleting another model's row through the editor still works

#### Placeholder removals still work
- **Given** a never-activated player on one coach's roster
- **When** the coach removes them
- **Then** the player profile and the placeholder account are both deleted

#### The migration refuses bad rows
- **Given** a database with a player whose `user_id` is `NULL` or two coaches sharing a `user_id`
- **When** the migration runs
- **Then** it raises naming those ids and the schema is unchanged
