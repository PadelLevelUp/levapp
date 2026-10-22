---
id: B-616
title: "Accepting a join request for a student on a standing waiting-list entry with no credit limit failed with a 500 (credits_used >= None)"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-21T23:40:00Z
affects:
  - backend/padel_app/services/class_join_request_service.py
  - .specflow/specs/notifications/waiting-list.spec.md
proposed_fix: "Guard the credit limit as the engine's settle does: a NULL credits_total is no limit."
opened: 2026-10-21T23:38:00Z
---

# B-616: join accept 500 on an unlimited standing entry

**Source:** PAD-669's rule survey (R2, PAD-721), read in the code on staging 4f8c9cd62.

**What happened:** `_decide_join_request` spends a waiting-list credit when the coach accepts a join
request from a student on a standing entry, then compared `credits_used >= credits_total`. Since
PAD-560 a NULL `credits_total` means "no credit limit", so the comparison raised `TypeError` and the
accept answered 500. The engine's own settle (`_settle_waiting_list_entry`) already guarded it.

**Evidence:** `test_pad721_credit_only_on_acceptance.py::…[no-limit]` red on 4f8c9cd62 with
`TypeError: '>=' not supported between instances of 'int' and 'NoneType'`; the `[three-credits]`
control green on both; green after the guard.
