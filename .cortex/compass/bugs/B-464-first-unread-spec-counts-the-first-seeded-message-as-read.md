---
id: B-464
title: "conversation-first-unread.spec.ts US-415a: run first after the stack boots, the divider landed one row low (ids[0] counted as read at open); the same job's run-alone retry passed"
type: test-defect
severity: low
status: open
affects:
  - frontend/apps/web/e2e/messaging/conversation-first-unread.spec.ts
  - .specflow/specs/messaging/conversation-detail.spec.md
proposed_fix: "Make freshUnreadBatch's read mark provably older than the first seeded message (read the mark back, or wait for a later server timestamp) and assert which message carries the divider by id before measuring geometry; then look for the writer that advanced the coach's read mark between the mark and the first post."
opened: 2026-10-10T00:05:00Z
---

# B-464: US-415a measured the divider one row below the first seeded unread

> Ledger id **unconfirmed** (wave-13 range). Filed from a CI red on #612 (PAD-568) whose branch
> touches nothing near read state; the coordinator accepted the flake reading and asked for this note
> for PAD-415's owner.

**Source:** CI subset run 37996463198 on feature/pad-568 at 0ac25fd71 (2026-10-09 22:01Z): 21 specs,
20 passed, 1 failed — `e2e/messaging/conversation-first-unread.spec.ts:134` "US-415a: the open walks
back to the first unread, under the divider, and a re-open lands on the newest".

**What happened:** `expect(d.y + d.height).toBeLessThanOrEqual(m.y + 1)` — received 245.75, expected
≤ 200.75. The divider's bottom sat 45 px below the top of the message the spec calls first unread
(`ids[0]`), which is one 46-px row: the server's `first_unread_message_id` (`sent_at >
last_read_at`) answered `ids[1]`, so `ids[0]` counted as already read when the thread opened. The
spec was the first in the subset, right after the stack booted. The job's own run-alone retry
(`_temp/alone-conversation-first-unread.spec.ts.log` in artifact `e2e-subset-612`) passed all three
tests of the file in 1.4 min. Not reproduced locally; the spec was not in any other subset that day.

**What should happen:** `freshUnreadBatch` marks the thread read (coach) and then posts 40 messages
(student); every one of them must be unread for the coach, and the divider must sit above `ids[0]`.

**Hypotheses (unverified):** (1) the read mark and the first post land with `last_read_at >=
sent_at` of `ids[0]` on a cold stack (clock or precision; Postgres keeps microseconds, so this needs
the two stamps to come from different clocks or be truncated somewhere); (2) something marked the
thread read between the mark and the first post — only `MessagesPage` marks read on web (on select,
and on `message_created` while viewing that thread), and the coach's page is on the dashboard then;
(3) the open's detail GET raced the client's mark-read POST — but that would remove the divider,
not move it one row. The spec asserts geometry before asserting which message carries the
divider, so the first line of a failure hides the id disagreement.

**Affected specs:** messaging.conversation-detail rule 9a (unchanged); this is the spec's harness.
The iOS twin (flow 114) has an open intermittent landing recorded in the session memory.

### Change Plan
- Spec harness: after `freshUnreadBatch`, read the coach's read mark back (or wait until the
  server's clock is past it) before seeding; in the test, assert `divider` is the previous sibling of
  `first` by id before any pixel comparison, so a red names the disagreeing id.
- Then instrument once: log `last_read_at` and `ids[0].sent_at` in CI on a red; the writer, if any,
  is the real fix.

### Resolution

(open)
