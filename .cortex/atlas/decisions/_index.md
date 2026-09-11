# Decisions — index

**Read this when:** you need the "why" behind a convention, an architecture choice, or
a rule — before proposing to change any of them.

**What's here:**
- `YYYY-MM-DD-<slug>.md` — one dated narrative per decision: what was chosen and why.

**How to navigate:** follow `compass_rules:` to the rules a decision produced,
`supersedes:` to the decision it replaced, and `sources:` to the raw material.
- [2026-09-11 — Android / Google Play scoping, DRAFT](2026-09-11-android-scoping.md) — PAD-290; what PAD-216 already prepared, the iOS-only inventory, Expo-push-over-FCM, no sign-in requirement on Play, a CI Gradle lane, five waves (9–13 eng. days + store lead time) and twelve owner decisions
- [2026-09-11 — Session lifecycle (M8/M8b): one transaction per operation, opt-in first](2026-09-11-request-scoped-transactions.md) — DRAFT; 188 mixin commits counted; options A savepoints / B request-scoped commit / C opt-in unit of work (recommended) / D slim the mixin; pilot: add_player_service is atomic
- [2026-09-11 — Owner infra runbooks, DRAFT](2026-09-11-owner-infra-runbooks.md) — PAD-187 DKIM (Cloudflare, selector google, absent today), Postgres password rotation (14 places, one role for prod+staging, 3–5 min window, backup first: B-080), retiring the legacy tfstate copies (4 files + levelup.zip, REPLACE-trap guard rails)
- [2026-09-10 — Sign in with Google, draft](2026-09-10-sign-in-with-google.md) — PAD-252; recommends parking it
- [2026-09-10 — Class time storage, draft](2026-09-10-class-time-storage.md) — PAD-256; implemented: Lisbon wall-clock (option B), #180–#190
- [2026-09-10 — Account status, not payment](2026-09-10-account-status-not-payment.md) — the two "subscription" settings read users.status; relabelled on both platforms, ids kept, no payment model (PAD-132)
- [2026-09-10 — Account deletion keeps the coach's records](2026-09-10-account-deletion-keeps-coach-records.md) — deleting removes the person from the future (sessions, pushes, future classes, waiting lists, engine) and keeps past attendance/evaluations/messages as "Deleted user"; carries the privacy-policy checklist (PAD-268)
- [2026-09-06 — Open registration and connections](2026-09-06-open-registration-and-connections.md) — anyone registers; roster grows by QR/invite/claim; student↔student by username with block/report; supersedes PAD-137's pending-request model
- [2026-09-10 — Data-model audit follow-up](2026-09-10-data-model-audit-follow-up.md) — the 2026-09-02 audit re-read on staging; 27 tickets PAD-254…PAD-280 for every open finding; M16 retention deliberately unticketed; §14 alternatives accepted/deferred/rejected on record
- [2026-09-09 — Production stays on one gunicorn worker until SSE has a shared broker](2026-09-09-single-worker-until-sse-broker.md) — in-memory SSE registry is per-process; scale out needs Redis pub/sub first (R-027)
- [2026-09-09 — One number for "classes to validate"](2026-09-09-one-number-for-classes-to-validate.md) — unit is classes, scope is a Presences-tab week (current, else previous), one helper behind one count endpoint; the dashboard card opens the tab on that week (PAD-190, PAD-201)
