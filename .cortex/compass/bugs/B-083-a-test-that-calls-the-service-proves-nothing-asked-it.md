---
id: B-083
title: "A test that calls the service itself proves the service sends, and says nothing about whether anything asks it to"
type: missing-criterion
severity: medium
status: resolved
affects:
  - notifications.reminders
  - backend/padel_app/tests/**
related_specs:
  - .specflow/specs/notifications/reminders.spec.md
proposed_fix: "Assert that a pass is ARMED — a job exists — not that the service sends when invoked by hand. Where the scheduler is the thing under test, use a real scheduler with a memory job store and assert on its jobs."
opened: 2026-09-13T00:00:00Z
resolved: 2026-09-13T00:00:00Z
---

# B-083 — A test that calls the service proves nothing asked it

**Source:** PAD-318 / PAD-331, 2026-09-13. Ledger id self-assigned, unconfirmed.

## What happened

PAD-318's fix removed the cap that skipped a re-added student, and five tests went green,
including one that asserted `send_class_reminders` now sent to them. The fix was real and the
tests were honest about what they checked — and the student would still have received nothing,
because **nothing would ever have called `send_class_reminders`**.

Reminder passes are a chain: a pass schedules the next only while it reports `more_due`. With the
default `reminderCount` of 1 the first pass reports `False`, so the chain ends after one pass and
the occurrence's job is spent. The tests called the service directly, so they exercised a code
path that production would never reach.

## Why it was missed

The tests asserted **the service sends when invoked**. The defect was **nobody invokes it**. Those
are different propositions, and every test in the file was written about the first while the
ticket was about the second. Nothing in the suite could have failed.

It surfaced only because two of the five were green against the *unfixed* code — a passing test
that should have failed, which is a signal to distrust rather than to celebrate.

## Fix

`next_ask_time` decides when a late arrival should be asked, and `arm_ask_for_student` schedules a
pass. The tests assert **a job exists**, using a real APScheduler with a memory job store, and the
scenario is built the way production runs it (a class inside the reminder window, so the ordinary
pass has already fired) rather than by calling the service by hand.

## Lesson

This is [[R-029]] in a third costume. There the danger was a payload tested against a constant
instead of its sibling; here it is a service tested against its own invocation instead of against
the thing that is supposed to invoke it. Both share one shape: **the test asserts the half of the
system the author was looking at, and the defect lives in the join.**

Two questions worth asking of any test that covers a scheduled or event-driven behaviour:
- *Who calls this in production, and does my test make them call it?*
- *If the trigger disappeared entirely, would this test still pass?* If yes, it is not testing the
  behaviour the ticket is about.

And, generally: **a test that passes against code you have not fixed yet is telling you
something.** Both times this week, that signal was the finding.
