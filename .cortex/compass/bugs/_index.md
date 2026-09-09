# Bug ledger — index

**Read this when:** a bug is reported, a test fails unexpectedly, or you need to know
whether a failure mode has been seen before.

**What's here:**
- `B-NNN-<slug>.md` — one file per bug: type (seven-type taxonomy), severity, status, and what it affects.

**How to navigate:** follow `affects:` to the rule, file, or spec involved; follow
`related_specs:` to the governing specs. IDs are monotonic and never reused.
- [B-023](B-023-auth-register-api-never-existed.md) — auth.register is spec-ahead-of-code: no JSON register route exists (layer-drift, medium, resolved in PAD-210)
- [B-029](B-029-ios-composer-band-under-keyboard-and-round-send.md) — iOS composer band under the keyboard, round send button, web send button shorter than the input (incomplete-rule, low, resolved)
- [B-030](B-030-needs-you-later-button-does-nothing.md) — "Mais tarde" on a needs-you empty-seats card did nothing on either shell; now a 24h server-side snooze (incomplete-rule, medium, resolved)
- [B-031](B-031-verify-screen-shows-resend-cooldown-as-an-error.md) — the verify-email screen printed RESEND_TOO_SOON as a red error on web and iOS; now only a countdown (incomplete-rule, medium, PAD-250)
- [B-032](B-032-transactional-mail-points-at-prod-and-missing-brand-assets-answer-200.md) — mail images pointed at prod in every environment; a missing /brand/* asset answered 200 text/html (incomplete-rule, medium, PAD-251)
- [B-033](B-033-ios-verify-screen-has-no-way-to-paste-the-code.md) — the iOS verify-email screen had no way to paste the code (incomplete-rule, high, PAD-251)
