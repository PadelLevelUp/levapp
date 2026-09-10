# Bug ledger — index

**Read this when:** a bug is reported, a test fails unexpectedly, or you need to know
whether a failure mode has been seen before.

**What's here:**
- `B-NNN-<slug>.md` — one file per bug: type (seven-type taxonomy), severity, status, and what it affects.

**How to navigate:** follow `affects:` to the rule, file, or spec involved; follow
`related_specs:` to the governing specs. IDs are monotonic and never reused.
- [B-023](B-023-auth-register-api-never-existed.md) — auth.register is spec-ahead-of-code: no JSON register route exists (layer-drift, medium, resolved in PAD-210)
- [B-029](B-029-ios-composer-band-under-keyboard-and-round-send.md) — iOS composer band under the keyboard, round send button, web send button shorter than the input (incomplete-rule, low, resolved)
- [B-032](B-032-respond-waiting-list-no-offer-check.md) — any player could queue on any class by id: respond_waiting_list never checked for an offer (incomplete-rule, high, resolved in PAD-222)
- [B-031](B-031-serialize-user-leaks-contact-fields.md) — the users list, the messageable picker and the public activation lookup returned email and phone to anyone (incomplete-rule, high, resolved in PAD-227)
- [B-030](B-030-needs-you-later-button-does-nothing.md) — "Mais tarde" on a needs-you empty-seats card did nothing on either shell; now a 24h server-side snooze (incomplete-rule, medium, resolved)
- [B-032](B-032-student-upcoming-kpi-counts-confirmed-only.md) — student "Upcoming lessons" KPI counted confirmed presences and read 0 above a populated schedule; now the schedule's own count (layer-drift, medium, resolved in PAD-235)
- [B-033](B-033-bulk-validate-guards-only-the-first-class.md) — web bulk validate guarded only the first class of the run; now the in-flight set (incomplete-rule, low, resolved in PAD-191)
