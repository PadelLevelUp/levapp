---
id: R-029
title: "When two things must mean the same, test them against each other — never each against a constant"
source:
  - ../bugs/B-073-a-cancellation-was-reported-as-a-confirmation.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "frontend/apps/web/e2e/**/*.ts"
  - "frontend/packages/**/*.test.ts"
confidence: OBSERVED
status: active
---

# R-029 — Test siblings against each other, not against constants

Where two things are required to agree — a web push and its native twin, a server
derivation and the client fallback that stands in for it, two readers of one
column, the same fact served by two endpoints — the test asserts **they agree with
each other**. It does not assert that each separately equals a literal.

**Why.** A payload, a derivation or a badge can be entirely self-consistent and
individually defensible, and still be wrong the moment you put it beside its
sibling. On 2026-09-12 three of six push writers each carried a payload that read
perfectly on its own; all three disagreed with their web twin, and because the
mobile router returns `null` for an unrecognised type, the failure was a *dead
tap* — the notification opened the app and nothing happened, with nothing logged
and nothing raised (PAD-324). The same week, two derivations of "did the student
answer" drifted apart while each passed its own tests (B-073), and a client
fallback nearly shipped disagreeing with the server field it stood in for.

A test pinned to a constant fails only when *that* value changes. A test pinned to
the sibling fails when they **diverge**, which is the thing that actually hurts —
including when a future author invents a third destination that looks reasonable
on its own.

**How to apply.** Name the other side in the assertion:
`assert web_url == "/messages/{}".format(expo_data["conversationId"])`, not two
separate equality checks against hardcoded strings. Where one side is authoritative
and the other a fallback, say so in the test name and assert the fallback matches
the authority rather than a copy of its expected output.

**Related:** the same idea one level up — a payload outside a documented contract
is a defect *even though nothing errors* (`messaging.push-notifications` rule 7).
The absence of an error is what let three of six writers drift.
