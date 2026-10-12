---
id: B-505
title: "PAD-620's seed change made conversation 1 coach ↔ filler-player-06; 13 Maestro files address it as coach ↔ student (flow 240 red on the iOS gate, Android smoke flow 36 green on the wrong thread)"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/scripts/seed.py
  - frontend/apps/mobile/.maestro/flows
proposed_fix: "Create the PAD-620 invitation chats after the two seeded coach conversations, so ids 1 and 2 are coach ↔ student and coach ↔ student 3 again; a smoke-set spec pins conversation 1's participants."
opened: 2026-10-11T17:10:00Z
resolved: 2026-10-11T17:45:00Z
---

# B-505: the seed reordered conversation 1

> Ledger id **unconfirmed** (wave-14 range). On this branch the index line sits after B-464; B-503/504 are on #671/#674.

**Source:** promotion-10 iOS gate at 3a43ec366, flow 240 run 1 (2026-10-11 17:09Z).

**What happens:** `pad569-setup.js` posts 40 messages as e2e-student into conversation "1". All 40
got 403 "Not a participant of this conversation", so the flow stopped at its first assert. On a
fresh reset, conversations 1–4 were e2e-coach ↔ filler-player-06..09, all created by the seed at
the same instant before any flow ran. Coach ↔ student had become 5.

**Root cause:** 254648d31 (PAD-620) writes each pending-confirm invitation's chat message through
`_get_or_create_direct_conversation`, *before* the seed's coach ↔ student and coach ↔ student 3
conversations are created, so those chats took ids 1–4. Thirteen Maestro files rely on id 1
being coach ↔ student: flows 09, 17, 19, 36, 47, 103, 122 and 240, plus the scripts first-unread,
thread-target, warm-push-target-post, record-layout setup/teardown and pad569-setup. No test pinned
it. Type: test defect (the seed is test-only, and the app was right).

**Evidence:**
- Flask log: 40× `POST /api/app/message` 403.
- `psql` participants per conversation on the fresh DB.
- With ids 1↔5 swapped by hand in the test DB (no code change), flow 240 passed: rc 0, 40 steps,
  and its four screenshots read correctly.
- Android smoke lane: PAD-618 (job 114524359761) and PAD-616 (114518116993) ran flow 36 after the
  change and passed. Flow 36 signs in as the coach, so it opened coach ↔ filler-player-06, a
  different thread from the one it was written for.

### Change plan
- `seed.py`: move the PAD-620 invitation-message block after the second seeded conversation.
- `e2e/messaging/seed-conversation-ids.spec.ts`: e2e-student and e2e-coach are both participants
  of conversation 1. Added to `pr-subset/smoke.txt`, which runs on every seed change (GLOBAL).

### Resolution
- Local reset with the fixed seed: 1 = e2e-coach,e2e-student; 2 = e2e-coach,e2e-student-3;
  3–6 = the four filler chats. All 4 `notification_invite` messages still exist and are linked to
  their events.
- The spec was not run locally (no Playwright slot); CI's smoke set runs it.
