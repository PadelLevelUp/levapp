---
id: admin.moderation
status: draft
depends_on: [admin.foundation, admin.approvals-and-users, messaging.block-and-report, messaging.messages]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
governed_by: [R-005, R-022, R-024]
---

# admin.moderation

> Linear: PAD-631. Web-only (R-024 exception: the staff console has no iOS app). App Store
> Guideline 1.2: content that users can report must be acted on.

### Intent
Staff see every message a student or coach reports, read it in context, and act on it — dismiss,
delete the message, or disable its author — with each action audited. They can also read the record
of destructive deletes (`deletion_audit`). Until now both tables were written and never read.

### Entities
- **READS:** `MessageReport`, `Message`, `Conversation`, `User`, `DeletionAudit`
- **WRITES:** `MessageReport` (status, outcome, closed_at, closed_by), `Message.is_deleted`,
  `User.status` (through `admin.approvals-and-users` rule 6), `admin_audit_log`

### Rules
1. **A report has a state.** `message_reports` gains `status` (`open` | `closed`, default `open`),
   `outcome` (`dismissed` | `message_deleted` | `author_disabled`), `closed_at` and `closed_by` (the
   staff email). Reports filed before this change are `open`.
2. **Reports list.** `GET /admin/api/reports?status=open|closed&page=` (`support`) answers 25 per
   page, newest first: id, created_at, status, outcome, reason, the reporter (id, name, username),
   the message (id, text, deleted?), its author (id, name, username) and the conversation id; plus
   `total` and `hasMore`. No message body is ever cut to hide it from staff.
3. **Report detail.** `GET /admin/api/reports/<id>` (`support`) adds the message in context — up to
   two messages before it and two after it in the same conversation, in order, the reported one
   marked — and the conversation's participants, each linking to the user view
   (`admin.approvals-and-users` rule 5). 404 for an unknown id.
4. **Acting closes the report.** `POST /admin/api/reports/<id>/dismiss`, `/delete-message` and
   `/disable-author` (`operator`; `support` gets 403 `ADMIN_ROLE_TOO_LOW`), each audited
   (`admin.foundation` rule 8: action `report.dismiss` / `report.delete_message` /
   `report.disable_author`, target the report, before/after its status and outcome), close the
   report with the matching outcome, `closed_at` and `closed_by`. A closed report answers 409
   `REPORT_CLOSED` and nothing changes.
   - Delete message: the product's own soft delete (`messaging.messages` rule 3 — `is_deleted`, and
     the `message_deleted` live event to the conversation's participants, sent after the commit).
     Already deleted: still closes the report.
   - Disable author: `admin.approvals-and-users` rule 6 with the reason "Report #<id>: <reason or
     note>" — signed out everywhere, refused at sign-in. The body may carry `{note}`.
5. **Attention.** `GET /admin/api/reports/summary` (`support`) answers `{open: n}`; the console's
   navigation shows the number next to "Denúncias" when it is not zero, so a new report is seen on
   the next load; rule 8 also emails the admin.
6. **Deletion audit.** `GET /admin/api/deletion-audits?entity=&page=` (`support`), read-only, 25 per
   page, newest first: who (actor id and name, or "system"), what (entity, entity id, action,
   label), when, and the counts in `details`. `entity` filters exactly.
7. **The console pages.** "Denúncias" (list with Abertas / Fechadas, detail with the context and the
   three actions, each with a confirmation and, for disable, a required reason) and "Eliminações"
   (the audit list with the entity filter). Usable at 375 px (`admin.phone-console`).
8. **A new report emails the admin, once per burst** (owner's choice, 2026-10-12). After a report is
   stored, `ADMIN_NOTIFY_EMAIL` (when set) gets "[LevApp] New message report" with the number of
   open reports and the console link `ADMIN_CONSOLE_URL/reports` — never the message, the reason or
   a name. No email when another report was filed in the 15 minutes before this one, so a spam wave
   is one email (the table decides, so it holds across workers). Mail is best effort: a failure is
   logged by exception class only and never fails the report.

### Acceptance Criteria

#### A report filed in the app is listed (rules 1–2)
- **Given** a student reported a coach's message "Paga-me já" with reason "abuso"
- **When** support opens `GET /admin/api/reports?status=open`
- **Then** the row shows the reporter, the text "Paga-me já", its author, the conversation, "abuso"
  and status `open`

#### The detail shows the message in context (rule 3)
- **Given** a conversation of six messages and a report on the fourth
- **When** support opens the report
- **Then** messages two to six are shown in order, the fourth marked, and both participants link to
  their user view

#### Each action closes the report and is audited (rule 4)
- **Given** an open report
- **When** an operator dismisses it / deletes the message / disables the author with a reason
- **Then** the report is closed with outcome `dismissed` / `message_deleted` / `author_disabled`, an
  audit row names the action and the report, and the message is soft-deleted (with the live event)
  or the author is disabled (signed out) accordingly
- **And** acting again on the closed report is 409 and changes nothing
- **And** a `support` token gets 403 on every action and nothing changes

#### The deletion audit is readable (rule 6)
- **Given** a deleted club recorded in `deletion_audit`
- **When** support lists deletion audits filtered by entity `club`
- **Then** the row shows who, what, when and the counts

#### A spam wave is one email with no message text (rule 8)
- **Given** `ADMIN_NOTIFY_EMAIL` is admin@levapp.app and no report was filed in the last 15 minutes
- **When** a student reports four messages within a minute, the first with reason "insultos graves"
- **Then** admin@levapp.app gets one email with the open count and `<console>/reports`, containing
  neither the message text, "insultos", nor either person's name
- **And** a report filed 16 minutes after the last one emails again
- **And** with `ADMIN_NOTIFY_EMAIL` unset, or the mailer failing, the report is stored and no error
  reaches the reporter

### Notes
- Out of scope: automated moderation, telling the reporter what happened.
- Rule 8's quiet window is per burst: a steady trickle (one report every ten minutes) sends only the
  first email; the navigation count (rule 5) shows the rest.
- PAD-550 removes the generic editor (where `messaging.block-and-report` rule 4 used to point); the
  tables stay.
