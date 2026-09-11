# Bug ledger — index

**Read this when:** a bug is reported, a test fails unexpectedly, or you need to know
whether a failure mode has been seen before.

**What's here:**
- `B-NNN-<slug>.md` — one file per bug: type (seven-type taxonomy), severity, status, and what it affects.

**How to navigate:** follow `affects:` to the rule, file, or spec involved; follow
`related_specs:` to the governing specs. IDs are monotonic and never reused.
- [B-053](B-053-disabled-account-login-issues-token.md) — both login routes signed in a disabled (deleted, withdrawn or rejected) account (incomplete-rule, high, resolved)
- [B-023](B-023-auth-register-api-never-existed.md) — auth.register is spec-ahead-of-code: no JSON register route exists (layer-drift, medium, resolved in PAD-210)
- [B-029](B-029-ios-composer-band-under-keyboard-and-round-send.md) — iOS composer band under the keyboard, round send button, web send button shorter than the input (incomplete-rule, low, resolved)
- [B-080](B-080-nightly-prod-backup-is-a-no-op.md) — the nightly prod backup cron reads an unset variable, runs pg_dump on the host and uploads to an empty bucket; prod has had no automatic backup (incomplete-rule, high, open — unverified on the VM)
- [B-041](B-041-respond-waiting-list-no-offer-check.md) — any player could queue on any class by id: respond_waiting_list never checked for an offer (incomplete-rule, high, resolved in PAD-222)
- [B-031](B-031-serialize-user-leaks-contact-fields.md) — the users list, the messageable picker and the public activation lookup returned email and phone to anyone (incomplete-rule, high, resolved in PAD-227)
- [B-070](B-070-import-analysis-streams-outside-the-request-context.md) — the AI import analysis streamed outside the request context, its coach-level lookup failed into a warning and the import ignored the coach's existing levels (incomplete-rule, medium, resolved in PAD-293)
- [B-030](B-030-needs-you-later-button-does-nothing.md) — "Mais tarde" on a needs-you empty-seats card did nothing on either shell; now a 24h server-side snooze (incomplete-rule, medium, resolved)
- [B-032](B-032-student-upcoming-kpi-counts-confirmed-only.md) — student "Upcoming lessons" KPI counted confirmed presences and read 0 above a populated schedule; now the schedule's own count (layer-drift, medium, resolved in PAD-235)
- [B-033](B-033-bulk-validate-guards-only-the-first-class.md) — web bulk validate guarded only the first class of the run; now the in-flight set (incomplete-rule, low, resolved in PAD-191)
- [B-017](B-017-attendance-invited-flag-not-a-reminder-signal.md) — "Reminder sent" badge was gated on Presence.invited (roster membership); now on reminderSentAt derived from the reminder/invite messages (layer-drift, medium, resolved in PAD-199)
- [B-042](B-042-verify-screen-shows-resend-cooldown-as-an-error.md) — the verify-email screen printed RESEND_TOO_SOON as a red error on web and iOS; now only a countdown (incomplete-rule, medium, PAD-250)
- [B-043](B-043-transactional-mail-points-at-prod-and-missing-brand-assets-answer-200.md) — mail images pointed at prod in every environment; a missing /brand/* asset answered 200 text/html (incomplete-rule, medium, PAD-251)
- [B-044](B-044-ios-verify-screen-has-no-way-to-paste-the-code.md) — the iOS verify-email screen had no way to paste the code (incomplete-rule, high, PAD-251)
- [B-045](B-045-dashboard-validation-card-dead-link-and-mismatched-count.md) — coach dashboard "aulas por validar" card linked to a non-existent /validations route and counted presences over a rolling window while the tab counted classes per week; now one helper, one count endpoint, one week (layer-drift, high, resolved in PAD-201/PAD-190)
- [B-050](B-050-verified-coach-email-change-skips-verify-screen.md) — a coach whose email was already verified changed it in Settings and was sent straight back from the code screen on web and iOS; the save now refreshes the signed-in user first (layer-drift, medium, resolved in the 2026-09-10 batch)
- [B-034](B-034-activation-route-open-by-sequential-id.md) — activation routes open by sequential user id: anyone could set any inactive account's password; now a per-account HMAC secret in the link, status check, narrowed fields (incomplete-rule, critical, PAD-254)
- [B-035](B-035-deleting-a-level-deletes-the-roster.md) — deleting a coach level deleted every player at that level with their notes and evaluations, or 500'd; now unassigns via SET NULL FKs + a delete service (incomplete-rule, critical, PAD-255)
- [B-059](B-059-batch-migrations-abort-on-rows-referencing-deleted-records.md) — PAD-207's reminder backfill inserted a row for a deleted class and aborted the staging deploy (324 restarts, API 502); PAD-255's FKs had the same blind spot; both now tolerate references to rows that are gone (missing-criterion, high, resolved)
- [B-036](B-036-coach-current-club-returns-oldest.md) — Coach.current_club returned the oldest club, not the most recently joined; undated memberships must rank oldest on Postgres too (missing-criterion, medium, resolved in PAD-266)
- [B-054](B-054-model-migration-index-drift.md) — nine model-versus-migration differences on a clean database; `flask db migrate` would drop the two partial unique pending-request indexes (layer-drift, high, open)
- [B-056](B-056-declined-student-reinvited-same-round.md) — a student who declined an invitation was re-invited in the same round, so the spot never reached anyone else (missing-criterion, medium, resolved)
- [B-051](B-051-capacity-and-vacancy-check-then-write-without-a-lock.md) — capacity, one-winner-per-vacancy and materialisation were check-then-write with no row lock (incomplete-rule, high, resolved in PAD-261)
- [B-037](B-037-account-deletion-leaves-the-future-behind.md) — account deletion left enrolments, reminders, pushes, waiting-list credits, legacy login and roster listings behind (missing-dev-spec, medium, resolved in PAD-268)
- [B-038](B-038-privacy-policy-omits-ai-import-processor.md) — privacy policy does not name the AI import processor (OpenRouter) or the EEA transfer (layer-drift, medium, open — owner action)
- [B-052](B-052-editor-registry-traps.md) — editor registry traps: Message under "lessage" (404), DeviceToken and LessonInstanceTraining schema 500s; keys are now the lowercased class name, pinned by a registry walk (missing-criterion, low, resolved in PAD-280)
- [B-046](B-046-lesson-instance-occurrence-not-unique.md) — nothing in the database stops two lesson instances for the same occurrence; the unique constraint needs a duplicate merge first (incomplete-rule, medium, open)
- [B-049](B-049-profile-rows-orphaned-when-a-user-is-deleted.md) — players.user_id / coaches.user_id nullable and non-unique; deleting a user orphaned its profile and crashed serializers (incomplete-rule, high, triaged in PAD-260)
- [B-055](B-055-updated-at-local-time-and-never-bumped.md) — updated_at stamped in local time by save() and never bumped by a plain commit; token_blocklist wrote an aware datetime into a naive column (test-defect, low, resolved in PAD-273)
- [B-058](B-058-event-end-crosses-utc-midnight.md) — a class crossing UTC midnight vanished from both dashboards: `_event_end` joined the start date to the end time (missing-criterion, medium, resolved)
- [B-065](B-065-ios-day-sheet-without-corners-or-shadow.md) — the iOS calendar day sheet rendered flat: `shadow-lg` casts downward and `overflow-hidden` clips a view's own shadow on iOS, so the 20pt corners had nothing to show against (missing-criterion, low, resolved in PAD-286)
- [B-060](B-060-client-date-parsing-and-utc-presets.md) — client dates: bare dates parsed as UTC (wrong weekday west of UTC), presets and weeks on the UTC day, a Hermes-unsafe parse in the decline guard (incomplete-rule, medium, resolved)
- [B-066](B-066-clients-judge-has-it-started-on-device-time.md) — web and iOS compared Lisbon wall-clock class times, deadlines and windows with the device clock, so "started", "past", "next", "today" and late-cancel were wrong on any device outside Lisbon; lisbonNow()/isClubToday() in @levelup/config (incomplete-rule, medium, resolved in PAD-295)
- [B-057](B-057-removing-a-student-deletes-their-history.md) — removing an active student by their only coach deleted their Player record, presences and level history; now only the roster link goes, placeholders per PAD-260 rule 3, every removal audited (layer-drift, high, resolved in PAD-274)
- [B-061](B-061-editing-a-level-writes-no-history.md) — editing a level wrote no history; Player.level dead (PAD-270, resolved)
- [B-062](B-062-deletion-audit-index-not-declared-on-the-model.md) — PAD-274 migration created ix_deletion_audit_entity but the model did not declare it; the drift gate skipped the batch-3 backend deploy (incomplete-rule, high, resolved; PAD-299 adds flask db check to CI)
- [B-068](B-068-nested-app-context-orphans-outer-session.md) — a nested app context removed the outer context's session, which sat idle in a transaction until the collector found it; the Postgres CI job hung on the next TRUNCATE (incomplete-rule, high, resolved in PAD-291)
- [B-078](B-078-needs-you-reply-rows-do-not-open-the-message.md) — "Precisa de ti" reply rows sent `/messages?conversationId=`, which web ignored and iOS mapped to the Messages tab; now `/messages/<id>` on both shells (incomplete-rule, medium, resolved in PAD-284)
- [B-077](B-077-counter-proposal-dead-ends-for-the-student.md) — the coach's counter-proposal reached the student as a chat question with nothing to press, and the student could not propose another time on any layer (incomplete-rule, high, resolved in PAD-281)
- [B-063](B-063-alembic-walk-in-the-test-session-disables-loggers.md) — migrations/env.py fileConfig disabled every existing logger; #208's mid-session migration test silenced push_sender and three #212 tests went red only on Postgres in the batch (incomplete-rule, medium, resolved; env.py keeps existing loggers)
