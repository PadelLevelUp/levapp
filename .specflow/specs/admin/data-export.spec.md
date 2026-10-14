---
id: admin.data-export
status: draft
depends_on: [admin.foundation, auth.account-deletion]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: []
---

# admin.data-export

### Intent
A person may ask LevApp for a copy of their data (GDPR articles 15 and 20; the Privacy Policy's
"access" and "portability" rights). LevApp must answer within 30 days. Staff (admin@levapp.app) need
one tested way to produce that copy without hand-written SQL: a read-only script that takes a user
id and prints that person's data as JSON, and a runbook for the whole request (PAD-640, privacy
review D7).

### Entities
- **READS:** User, Player, Coach and every table with a foreign key to `users.id`, `players.id` or
  `coaches.id`; Message (`sender_id`).
- **WRITES:** nothing.

### Rules
1. **The script.** `backend/scripts/export_user_data.py <user_id>` prints one JSON document to
   stdout: `{exportedAt, userId, user, tables: {<table>: [rows]}}`. An unknown id exits 2 with
   "no user <id>" on stderr and prints nothing.
2. **Read-only.** It opens one transaction that is READ ONLY on Postgres and rolls it back; it never
   writes, flushes or commits.
3. **What is included.** The `users` row; every row of every table holding a foreign key to that
   user, to their `players` row(s) or to their `coaches` row; found by reading the schema, so a new
   table is included without editing the script. Rows from `messages` are those the person sent,
   including ones they deleted while the database still holds them. A foreign key that names the
   person as the object of someone else's act, or as the staff member who acted
   (`blocked_users.blocked_id`, `coaches.approved_by_user_id`, `player_merges.confirmed_by_user_id`),
   is not followed.
4. **What is never included.** Password hashes, verification and activation codes, tokens and
   secrets: any column whose name contains `password`, `token` or `secret`, ends in `_hash`, or is
   `generated_code`, `jti` or `subscription_json` (a web-push endpoint and its keys), prints as
   `"[withheld]"`. Another person's messages, and the `admin_audit_log`
   and `deletion_audit` staff records, are left out.
4a. **A shared row keeps each side's own columns (PAD-660).** A row exported to both people it
   names carries a column that is one side's only to that side: a coach's private nickname for a
   student (`coach_in_player.nickname`, `nickname_as_name`, `players.nickname` rule 7) is in the
   coach's export and left out of the student's (`_OWNER_ONLY`).
5. **Formats.** Dates and times print as ISO 8601; decimals as strings; bytes as base64.
6. **The runbook.** `backend/scripts/data_requests.md`: verify
   the requester (answer from the account's own email, or a code sent to it), record the request and
   its date, run the export on the VM read-only, send the JSON to the account's email within 30 days
   (extendable once by 60 with a reason), and correct or erase on request (correction: Perfil,
   `settings.profile` rules 10–11; erasure: `auth.account-deletion`).

### Acceptance Criteria

#### One user's data, and only theirs (rules 1, 3)
- **Given** a student "Sara" with a player record, an evaluation, two messages she sent and one she
  received from coach "Carla"
- **When** staff run `export_user_data.py <Sara's id>`
- **Then** the JSON has Sara's user row, her player row, the evaluation and her two messages
- **And** Carla's message text is not in the output

#### Secrets are withheld (rule 4)
- **Given** a user with a password hash and an email-verification code hash
- **When** they are exported
- **Then** both fields print `"[withheld]"` and the hash appears nowhere in the output

#### Nothing is written (rule 2)
- **Given** any user
- **When** the export runs
- **Then** the database is unchanged and no commit was issued
- **And** on Postgres a write inside the export's transaction is refused (read-only)

#### Someone else's act on them is not theirs (rule 3)
- **Given** Rui blocked Sara, and Sara blocked Carla
- **When** Sara is exported
- **Then** `blocked_users` holds only Sara's block of Carla

#### An unknown id (rule 1)
- **Given** no user with id 999999
- **When** staff export it
- **Then** the script exits 2 and prints nothing to stdout

### Notes
- Source: PAD-640 (privacy review PAD-602, D7). The 30-day deadline is GDPR article 12(3).
- No console page: requests are rare and handled by the owner; a script plus a runbook is enough.
