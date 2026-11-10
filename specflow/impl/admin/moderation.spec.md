---
id: admin.moderation
status: draft
depends_on: [admin.foundation, admin.approvals-and-users, messaging.block-and-report, messaging.messages]
serves: [P-ADMIN-3]
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
   open reports and the console link `ADMIN_CONSOLE_URL/reports` (no link when that is unset) —
   never the message, the reason or a name. No email when another report was filed in the 15
   minutes before this one, so a spam wave is one email (the table decides, so it holds across
   workers; two reports at the same instant go to the lower id, so one email). Mail is best effort,
   not exactly-once: a failure is logged by exception class only and never fails the report.

### Acceptance Criteria

#### ADMIN-MODERATION-1: A report filed in the app is listed (rules 1–2)
- **Given** a student reported a coach's message "Paga-me já" with reason "abuso"
- **When** support opens `GET /admin/api/reports?status=open`
- **Then** the row shows the reporter, the text "Paga-me já", its author, the conversation, "abuso"
  and status `open`

#### ADMIN-MODERATION-2: The detail shows the message in context (rule 3)
- **Given** a conversation of six messages and a report on the fourth
- **When** support opens the report
- **Then** messages two to six are shown in order, the fourth marked, and both participants link to
  their user view

#### ADMIN-MODERATION-3: Each action closes the report and is audited (rule 4)
- **Given** an open report
- **When** an operator dismisses it / deletes the message / disables the author with a reason
- **Then** the report is closed with outcome `dismissed` / `message_deleted` / `author_disabled`, an
  audit row names the action and the report, and the message is soft-deleted (with the live event)
  or the author is disabled (signed out) accordingly
- **And** acting again on the closed report is 409 and changes nothing
- **And** a `support` token gets 403 on every action and nothing changes

#### ADMIN-MODERATION-4: The deletion audit is readable (rule 6)
- **Given** a deleted club recorded in `deletion_audit`
- **When** support lists deletion audits filtered by entity `club`
- **Then** the row shows who, what, when and the counts

#### ADMIN-MODERATION-5: A spam wave is one email with no message text (rule 8)
- **Given** `ADMIN_NOTIFY_EMAIL` is admin@levapp.app and no report was filed in the last 15 minutes
- **When** a student reports four messages within a minute, the first with reason "insultos graves"
- **Then** admin@levapp.app gets one email with the open count and `<console>/reports`, containing
  neither the message text, "insultos", nor either person's name
- **And** a report filed 16 minutes after the last one emails again
- **And** with `ADMIN_NOTIFY_EMAIL` unset, or the mailer failing, the report is stored and no error
  reaches the reporter

#### ADMIN-MODERATION-6: The open reports count is answered and shown in the navigation (rule 5)
- **Given** one open report
- **When** support GETs `/admin/api/reports/summary`
- **Then** the answer is `{"open": 1}`
- **And** the console's navigation shows the count beside the reports entry when it is above zero, and no badge at zero
test: `backend/padel_app/tests/test_pad631_moderation.py` › `test_the_summary_counts_open_reports` (+2 more)

#### ADMIN-MODERATION-7: The detail names every sender, and an unknown report is not found (rule 3)
- **Given** a reported message in a thread between a coach and a student, and the coach has since left the conversation
- **When** support GETs the report
- **Then** every message in `context` carries its sender's name, the coach's included
- **And** a report id that does not exist answers 404
test: `backend/padel_app/tests/test_pad631_moderation.py` › `test_an_unknown_report_is_404` (+1 more)

#### ADMIN-MODERATION-8: The console shows the reported text after the message is erased (rules 2, 3; PAD-639)
- **Given** a report on a message, and the author deletes the message afterwards, or an operator deletes it from the report
- **When** support reads the list and the detail
- **Then** the report's `message` still carries the reported text with `deleted` true, and the other messages of the context read as before
- **And** a report stored before the text was copied shows the message's own text
test: `backend/padel_app/tests/test_pad639_console_reported_text.py` › `test_the_console_shows_the_reported_text_after_the_author_deletes_it` (+2 more)

#### ADMIN-MODERATION-9: A refused or redundant action leaves a true record (rule 4)
- **Given** a report an operator already dismissed
- **When** the operator tries to delete its message
- **Then** the answer is 409 and one `report.delete_message` audit row exists for that report, with an outcome that is not `ok`
- **Given** an open report and a disable the users service refuses
- **When** the operator posts `disable-author`
- **Then** the answer is a 4xx, not a 500, and the report stays open
- **Given** an open report whose message is already deleted
- **When** the operator posts `delete-message`
- **Then** the report closes as `message_deleted` and no second live event is published
test: `backend/padel_app/tests/test_pad631_moderation.py` › `test_a_refused_action_still_audits_the_report` (+2 more)

#### ADMIN-MODERATION-10: Without a console URL the report email carries no link (rule 8)
- **Given** `ADMIN_NOTIFY_EMAIL` set and `ADMIN_CONSOLE_URL` empty
- **When** a report is filed
- **Then** one email is sent that names the staff console and holds no `/reports` path
test: `backend/padel_app/tests/test_pad631_moderation.py` › `test_without_a_console_url_the_email_names_the_console_without_a_bare_path`

#### ADMIN-MODERATION-11: The report pages ask before acting and show what happened (rules 4, 7)
- **Given** an operator or the owner on a report's page
- **When** they press dismiss, delete message or disable author
- **Then** nothing is sent until they confirm; cancelling, or Escape, closes the confirmation, sends nothing and gives the focus back to the button
- **And** confirming posts to that action's own route, and the page then shows the closed report with its outcome and no action
- **And** disable author cannot be confirmed with an empty note, and sends the note trimmed
- **And** a 409 `REPORT_CLOSED` shows that the report was already handled and reloads it
- **And** support sees the report with no action button, and each row of the list links to its detail
test: `frontend/apps/admin/src/pages/moderation.test.tsx` › `links a row to its detail` (+7 more)

### Notes
- Out of scope: automated moderation, telling the reporter what happened.
- Rule 8's quiet window is per burst: a steady trickle (one report every ten minutes) sends only the
  first email; the navigation count (rule 5) shows the rest.
- PAD-550 removes the generic editor (where `messaging.block-and-report` rule 4 used to point); the
  tables stay.
