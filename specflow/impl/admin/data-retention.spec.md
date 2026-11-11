---
id: admin.data-retention
status: implementing
depends_on: [admin.clubs-and-switches, players.remove]
serves: [P-ADMIN-1]
governed_by: []
---

# admin.data-retention

> Linear: PAD-638 (PAD-602 privacy review, D5). Periods decided by the owner on 2026-10-21 (ticket
> comment "Owner decisions, 2026-10-21"); before that every item was OFF and only counted.

### Intent
Personal data the app no longer needs is removed on a schedule, one switch and one period per kind
of data, so the Privacy Policy (§11, "Retention and account deletion") states real periods.

### Entities
- **READS:** AppSetting (`data_retention`), app config `RETENTION_*`
- **WRITES / DELETES:** CoachInvitation, PlayerInvitation, CoachJoinToken, NotificationEvent,
  ReminderAttempt, User code-hash columns, DeletionAudit, AdminAuditLog (only through rule 5); and,
  only when a setting turns them on, User + Player + coach link (never-activated placeholders) and
  Message (text of deleted messages)

### Rules
1. **Defaults are the owner's periods, as config.** Each item's default period is an app config
   value, `RETENTION_DAYS_<ITEM>` (env var of the same name), with the owner's period as the code
   default:

   | Item | Default | What |
   |---|---|---|
   | `expired_invitations` | ON, 30 days | invitations and join tokens, after expiry |
   | `code_hashes` | ON, 30 days | email-verification and password-reset code hashes, after expiry |
   | `notification_history` | ON, 365 days | notification events and reminder attempts |
   | `audit_logs` | ON, 1825 days | `deletion_audit` rows |
   | `admin_audit_log` | ON, 1825 days | `admin_audit_log` rows |
   | `stale_placeholders` | keep | never-activated students: never deleted (owner) |
   | `deleted_message_text` | keep | deleted messages: the row stays forever; the text is already erased at delete time (PAD-639) |

   **The setting overrides.** The `app_settings` row `data_retention` holds
   `{<item>: {"enabled": bool, "days": int}}` or `{<item>: {"keep": true}}`, changed with one
   UPDATE. A missing row or item means the default. `"enabled": false` turns an item OFF (it is
   still counted); `{"keep": true}` means **keep**: no period at all — neither counted nor swept.
   A stored `days` replaces the default period. A stored item that is malformed — `enabled` not a
   boolean, or `days` not a positive integer — is OFF with the default period, never swept at a
   period nobody meant. A config value that is not a positive integer falls back to the code
   default.
2. **One daily job.** `retention_sweep` runs once a day at 03:17 on the scheduler leader (a fixed
   id, R-010; one of `admin.engine-health`'s singletons). A fixed hour, because an interval re-armed
   on every boot would slip a day with each deploy (B-667 found the other two daily jobs doing exactly that;
   delivery.worker-role rule 4 now governs all three, with a 6 h misfire grace and a boot catch-up). For every item it
   counts what is due; it deletes only for an enabled item. It logs one line per item:
   `retention <item> enabled=<bool> days=<n> due=<count> removed=<count>`. An item that raises is
   logged and the others still run; an item that fails part-way reports what it had already
   removed. A row whose date is unknown (NULL) is never due.
3. **Bounded and idempotent.** An item removes in batches: it selects at most
   `RETENTION_BATCH_SIZE` (default 500) due ids, deletes (or clears) exactly those by primary key,
   commits, and repeats, at most `RETENTION_MAX_BATCHES` (default 20) times per run. No statement
   touches more than one batch, so no run holds a lock on more than one batch of rows, and a run
   never takes a table lock. What is left over is due again the next day; a second run on the same
   day removes only what the first one left (nothing, when it finished).
4. **The items** (`now` is UTC):
   - `stale_placeholders`: a never-activated student (no password: `players.remove`
     rule 5's placeholder) created more than `days` ago, with no presence on an occurrence that
     started within `days`, and on exactly one coach's roster, is deleted through
     `remove_player_service(action="delete")` — so it writes the `deletion_audit` row and refuses
     anyone with an account or a second coach. Keep by default (owner, 2026-10-13 and 2026-10-21).
   - `deleted_message_text`: a message with `is_deleted` whose `updated_at` is more than
     `days` ago keeps its row but loses its text (`""`), metadata and attachment; an image no other
     row uses is deleted, row then bucket object, as the message delete does. Keep by default
     (owner, 2026-10-21): today's delete already blanks the text.
   - `expired_invitations`: coach invitations and player invitations whose `expires_at`
     is more than `days` ago, and coach join tokens expired or deactivated more than `days` ago, are
     deleted.
   - `notification_history`: notification events and reminder attempts of occurrences
     that ended more than `days` ago are deleted (both always belong to an occurrence).
   - `code_hashes`: an email-verification or password-reset code hash whose expiry is more
     than `days` ago is cleared with its expiry and sent-at.
   - `audit_logs`: `deletion_audit` rows created more than `days` ago are deleted.
   - `admin_audit_log`: `admin_audit_log` rows created more than `days` ago are deleted, through
     rule 5's exception only.
5. **The one exception to the append-only audit log.** `admin.foundation` rule 9 keeps
   `admin_audit_log` append-only; the retention sweep's batch delete of rows past the period is
   the single sanctioned removal. It runs with the session flag `retention_sweep` set; any other
   ORM delete of an audit row, or bulk update/delete of the table without that flag, is refused.
   The guard is the ORM's: a Core-table or raw SQL statement is outside it by design (the staging
   scrub, `delivery.staging-data-sync`, clears the copy's before/after that way); no app code path
   writes the table like that.
5a. **The push outbox (PAD-699) is outside the owner's switches.** Operational, not an item of rule
   4. A row's message (title, body, data) is nulled the moment the row is sent, skipped or dead.
   Sent and skipped rows are deleted after 24 h and dead ones after 30 days, by the drainer once a
   day (`messaging.push-notifications` rule 10a), whatever the `data_retention` setting says.
6. **nginx logs** are rotated on the VM (14 generations, coordinator read 2026-10-12); not this job.
   The Privacy Policy states about 14 days.

### Acceptance Criteria

#### ADMIN-DATA-RETENTION-1: The owner's periods are on with no setting (rules 1, 2)
- **Given** no `data_retention` row, `now` pinned to 2027-03-10 12:00 UTC, and for each enabled
  item one row just past its period and one just inside it
- **When** the sweep runs
- **Then** each enabled item removes exactly the row past its period and keeps the one inside it
- **And** `stale_placeholders` and `deleted_message_text` report keep, and a 400-day-old placeholder
  and a deleted message's row stay

#### ADMIN-DATA-RETENTION-2: A config value moves a default period (rule 1)
- **Given** `RETENTION_DAYS_EXPIRED_INVITATIONS = 60` and an invitation expired 40 days ago
- **Then** it stays; with the default 30 it goes

#### ADMIN-DATA-RETENTION-3: A setting turns an item off, keeps it, or changes its period (rule 1)
- **Given** `{"code_hashes": {"enabled": false}}` → counted, nothing removed
- **Given** `{"code_hashes": {"keep": true, "enabled": true, "days": 1}}` → keep, nothing counted
- **Given** `{"code_hashes": {"enabled": "yes", "days": 5}}` or `days: 0` → OFF
- **Given** `{"stale_placeholders": {"enabled": true, "days": 365}}` → a placeholder created 400
  days ago on one coach is deleted through the roster removal, with a `deletion_audit` row; one with a
  class 100 days ago, an activated student and a placeholder on two rosters stay

#### ADMIN-DATA-RETENTION-4: Deleted messages lose their text only when switched on (rules 1, 4)
- **Given** `deleted_message_text` enabled at 30 days
- **Then** a message deleted 40 days ago has empty text and no attachment, and its image is freed;
  one deleted 10 days ago and a live message are unchanged

#### ADMIN-DATA-RETENTION-5: Each table is swept at its period (rule 4)
- **Given** each enabled item and `now` pinned
- **Then** invitations, join tokens, code hashes, notification events, reminder attempts,
  `deletion_audit` rows and `admin_audit_log` rows past the period are gone and rows inside it stay

#### ADMIN-DATA-RETENTION-6: A run is bounded and the next one finishes (rule 3)
- **Given** `RETENTION_BATCH_SIZE = 2`, `RETENTION_MAX_BATCHES = 2` and 5 due reminder attempts
- **Then** the first run reports `due=5 removed=4`; the second removes the last one; a third removes
  nothing

#### ADMIN-DATA-RETENTION-7: The audit log refuses every other delete (rule 5)
- **Given** an `admin_audit_log` row
- **Then** an ORM delete of it raises, a bulk delete of the table without the flag raises, and the
  sweep's delete of an old row succeeds

#### ADMIN-DATA-RETENTION-8: One failing item does not stop the others (rule 2)
- **Given** two items enabled and the first raises
- **Then** the second still runs

#### ADMIN-DATA-RETENTION-9: An item that fails part-way reports what it removed and frees only what it committed (rules 2, 3, 4)
- **Given** three due placeholder students, and the removal of the second one raising
- **When** the sweep runs
- **Then** the item reports `removed` 1 with the error's text, and the next item runs with no error
- **Given** two deleted messages with an image each, a batch size of 1, and the second batch's commit failing
- **When** the sweep runs
- **Then** the item reports `removed` 1 with the error, and only the first image's stored object was deleted: the failed batch's object stays, because its row still points at it
test: `backend/padel_app/tests/test_pad638_data_retention.py` › `test_a_placeholder_sweep_that_fails_midway_reports_what_it_removed` (+1 more)

#### ADMIN-DATA-RETENTION-10: A failed audit sweep still gives back its permission to delete (rule 5)
- **Given** an `admin_audit_log` row past its period, and the audit item's delete failing
- **When** the sweep runs
- **Then** the item reports the error, the row is still there, and the session's `retention_sweep` flag is off afterwards
test: `backend/padel_app/tests/test_pad638_retention_periods.py` › `test_the_flag_is_cleared_when_the_audit_sweep_fails`
