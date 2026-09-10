# Bug ledger — index

**Read this when:** a bug is reported, a test fails unexpectedly, or you need to know
whether a failure mode has been seen before.

**What's here:**
- `B-NNN-<slug>.md` — one file per bug: type (seven-type taxonomy), severity, status, and what it affects.

**How to navigate:** follow `affects:` to the rule, file, or spec involved; follow
`related_specs:` to the governing specs. IDs are monotonic and never reused.
- [B-023](B-023-auth-register-api-never-existed.md) — auth.register is spec-ahead-of-code: no JSON register route exists (layer-drift, medium, resolved in PAD-210)
- [B-029](B-029-ios-composer-band-under-keyboard-and-round-send.md) — iOS composer band under the keyboard, round send button, web send button shorter than the input (incomplete-rule, low, resolved)
- [B-041](B-041-respond-waiting-list-no-offer-check.md) — any player could queue on any class by id: respond_waiting_list never checked for an offer (incomplete-rule, high, resolved in PAD-222)
- [B-031](B-031-serialize-user-leaks-contact-fields.md) — the users list, the messageable picker and the public activation lookup returned email and phone to anyone (incomplete-rule, high, resolved in PAD-227)
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
