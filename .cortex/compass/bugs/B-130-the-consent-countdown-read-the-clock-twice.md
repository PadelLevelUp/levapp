---
id: B-130
title: "A minor's sign-up stamped the consent link with one clock read and computed the resend countdown from a second, so a slow runner answered 59 for a 60 s cooldown"
type: incomplete-rule
severity: low
status: resolved
affects:
  - backend/padel_app/modules/api_auth.py
  - backend/padel_app/services/registration_service.py
  - backend/padel_app/services/parental_consent_service.py
  - backend/padel_app/tests/test_parental_consent.py
proposed_fix: "Read the clock once in the register handler and thread that instant through register_user_service → start_consent and into pending_body; pin it with a clock that moves on every read."
opened: 2026-09-22T10:25:45Z
resolved: 2026-09-22T10:28:16Z
---

# B-130 — the consent countdown read the clock twice

**Source:** Session-C, reading #361's sqlite CI job at `3e13b1fba` (10:24–10:25 UTC):
`test_parental_consent.py::test_minor_account_waits_for_guardian` failed `assert 59 == 60` on
`resendAvailableInSeconds`. The branch does not touch auth; the Postgres job on the same head
passed; the file passes alone; #378's job at the same hour passed it. Assigned by the
Coordinator on 2026-09-22. Ledger number from Session-B's reserved range (B-125–134).

**Mechanism (a product defect, not a test one).** `POST /api/auth/register` for a minor did
two clock reads for one request: `register_user_service` → `start_consent` read `utcnow_naive()`
and stamped `consent_sent_at` with it; the handler then called `pending_body(user)` with no
instant, so `resend_available_in` read `utcnow_naive()` AGAIN and computed
`ceil(60 − (now₂ − consent_sent_at))`. Whenever a whole second elapsed between the two reads —
a slow runner, a GC pause, a mail hook — the answer was 59. The client is told a countdown that
is not the cooldown the server will enforce, by however many seconds the request itself took.
B-129's sibling: not a budget this time but the same shape — a quantity that should be one
logical instant taken from the wall clock twice.

**Fix (PR into staging).** The handler reads the clock once (`now = utcnow_naive()`), passes it
to `register_user_service(data, now=now)`, which passes it to `start_consent(..., now=now)`,
and computes the body with `pending_body(user, now)`. The login 403 path keeps reading the clock:
there the countdown IS a later instant's. `resend_consent` already answers the constant.

**The same shape one function over (Session-C's review of #379).** `register_user_service`
called `validate_consent_fields(data, email)` without `today`, so the AGE was judged on its own
`utcnow_naive().date()` while the consent row was stamped with the handler's `now` — across a
midnight boundary during a slow request, a child who comes of age at 00:00 is a minor for one
read and an adult for the other. Fixed in the same PR: `register_user_service` defaults `now`
once and passes `today=now.date()`; `utcnow_naive` is imported at module level in
`registration_service` so a test can patch it. Pinned by
`test_register_judges_the_age_on_the_same_instant_it_stamps` (born 2014-01-01, PT, request at
2026-12-31 23:59:59 with the clock stepping a second per read: one instant → still 12 → consent
asked; a second read → 13 → no consent) — the countdown pin cannot see that read; this one can.

**Pin.** `test_register_stamps_the_link_and_counts_down_from_one_instant`: a clock that moves
one second on EVERY read is patched into both the handler and the consent service; the 201 must
say 60 and the row must be stamped with the first read. Any second read anywhere on the path
shows as 59 — the slow runner made deterministic. The original test's `== 60` stays as the
real-clock case.

**Runs (Session-B, 2026-09-22, branch from staging `800920687`, sqlite, times from `date -u`):**
the file alone → 27 passed (10:28:02–10:28:16Z). Mutant = the handler's threading reverted
(`register_user_service(data)` and `pending_body(user)` again) → the new pin **failed `assert 59
== 60`** while the ORIGINAL test still passed (10:28:35–10:29:02Z) — the old test could not see
the defect on a normal clock, the pin does; restored → the file green again. Second round
(the age instant): the file → 28 passed (10:33:02–10:33:18Z); mutant = `today=` threading
reverted → the midnight pin **failed** (`assert None == 'pending'`) while the countdown pin
still passed (10:33:18–10:33:24Z); restored → 28 passed (10:33:42Z). Not run: the Postgres
lane locally (CI is that), the full suite.

**The general rule:** one request, one `now`. A handler that stamps a row and then reports a
figure derived from that stamp passes the same instant down; a service that accepts `now=None`
exists exactly so the caller can.
