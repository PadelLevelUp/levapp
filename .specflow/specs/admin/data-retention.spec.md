---
id: admin.data-retention
status: implementing
depends_on: [admin.clubs-and-switches, players.remove]
implements: ../../specs-business/admin/personal-data-is-kept-only-as-long-as-needed.business.md
governed_by: []
---

# admin.data-retention

> Linear: PAD-638 (PAD-602 privacy review, D5). The periods are owner decisions, asked on
> 2026-10-12. Until each is answered its sweep is OFF; the job only counts.

### Intent
Personal data the app no longer needs is removed on a schedule, one switch and one period per kind
of data, so the Privacy Policy (§10) can state real periods.

### Entities
- **READS:** AppSetting (`data_retention`)
- **WRITES / DELETES:** User + Player + coach link (never-activated placeholders), Message (text of
  deleted messages), CoachInvitation, PlayerInvitation, CoachJoinToken, NotificationEvent,
  ReminderAttempt, User code-hash columns, DeletionAudit (AdminAuditLog is append-only, rule 3)

### Rules
1. **Settings, OFF by default.** `app_settings` row `data_retention` holds
   `{<item>: {"enabled": bool, "days": int}}`. A missing row, a missing item or a non-positive
   `days` means OFF with the recommended default period. `{"keep": true}` means **keep**: no period
   at all — the item is neither counted nor swept. An item the owner answered "keep" is keep by
   default: `stale_placeholders` (owner, 2026-10-12: never-activated students are kept until the
   coach removes them). No env flag; changed with one UPDATE.
2. **One daily job.** `retention_sweep` runs once a day at 03:17 on the scheduler leader (a fixed
   id, R-010; one of `admin.engine-health`'s singletons). A fixed hour, because an interval re-armed
   on every boot would slip a day with each deploy. For every item it
   counts what is due; it deletes only for an enabled item. It logs one line per item:
   `retention <item> enabled=<bool> days=<n> due=<count> removed=<count>`. An item that raises is
   logged and the others still run; each item commits on its own, and an item that fails part-way
   reports what it had already removed. A row whose date is unknown (NULL) is never due.
3. **The items** (`now` is UTC; recommended period in brackets):
   - `stale_placeholders` [365 days]: a never-activated student (no password: `players.remove`
     rule 5's placeholder) created more than `days` ago, with no presence on an occurrence that
     started within `days`, and on exactly one coach's roster, is deleted through
     `remove_player_service(action="delete")` — so it writes the `deletion_audit` row and refuses
     anyone with an account or a second coach.
   - `deleted_message_text` [30 days]: a message with `is_deleted` whose `updated_at` is more than
     `days` ago keeps its row but loses its text (`""`), metadata and attachment; an image no other
     row uses is deleted, row then bucket object, as the message delete does.
   - `expired_invitations` [30 days]: coach invitations and player invitations whose `expires_at`
     is more than `days` ago, and coach join tokens expired or deactivated more than `days` ago, are
     deleted.
   - `notification_history` [365 days]: notification events and reminder attempts of occurrences
     that ended more than `days` ago are deleted.
   - `code_hashes` [1 day]: an email-verification or password-reset code hash whose expiry is more
     than `days` ago is cleared with its expiry and sent-at.
   - `audit_logs` [1095 days]: `deletion_audit` rows older than `days` are deleted.
     **`admin_audit_log` is NOT swept:** it is append-only (`admin.foundation` rule 9 — the model
     refuses any delete). A retention period for it needs that rule changed first (owner decision).
4. **nginx logs** (the seventh decision) are an infra change (`infra/` logrotate), not this job.

### Acceptance Criteria

#### Everything is OFF until a setting turns it on (rules 1, 2)
- **Given** no `data_retention` row and one of each kind of due data
- **When** the sweep runs
- **Then** nothing is removed, each item reports its due count, and `stale_placeholders` reports
  keep
- **And** switching every item on removes exactly the counted rows

#### Keep means no period (rule 1)
- **Given** an item set `{"keep": true}` (even beside `enabled: true`)
- **Then** it reports keep, counts nothing and removes nothing

#### A stale placeholder is deleted through the roster removal (rule 3)
- **Given** `stale_placeholders` enabled at 365 days, a placeholder created 400 days ago on one coach
- **Then** the player and user are gone and a `deletion_audit` row says `deleted`
- **And** a placeholder created 400 days ago that had a class 100 days ago stays
- **And** an activated student and a placeholder on two rosters stay

#### Deleted messages lose their text (rule 3)
- **Given** `deleted_message_text` enabled at 30 days
- **Then** a message deleted 40 days ago has empty text and no attachment; one deleted 10 days ago and
  a live message are unchanged

#### Expired invitations, notification history, code hashes and audit rows go (rule 3)
- **Given** each item enabled
- **Then** rows past the period are gone and rows inside it stay

#### One failing item does not stop the others (rule 2)
- **Given** two items enabled and the first raises
- **Then** the second still runs
