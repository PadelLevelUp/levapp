---
id: B-179
title: "E2E messaging specs opened whichever conversation was newest: substring name locators, and a fixed filler that earlier specs had already messaged"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/messaging/direct-messages.spec.ts
  - frontend/apps/web/e2e/messaging/messageable-roster.spec.ts
  - frontend/apps/web/e2e/helpers/navigation.ts
proposed_fix: "conversationRow(page, name): click the list row whose participant name is exactly `name`, at every conversation click; US-60 edits a message it sends instead of the seeded one; US-205 picks an active seeded filler the coach has no conversation with, at run time."
opened: 2026-09-25T01:03:44Z
resolved: 2026-09-25T13:55:38Z
---

# B-179: messaging specs asserted against the wrong conversation

**Source:** PAD-452, from the nightly test-health run (2026-09-25) on staging `86523d0bd`. Three of its five "fails only in the full run" tests:
- US-60 (`direct-messages.spec.ts:89`);
- US-64 (`:246`);
- US-205 (`messageable-roster.spec.ts:26`).

The owner reported messages not arriving in production that same morning, so the first question was whether these failures were real. **They are not. Every message was delivered.**

**What happens:**
- **US-60 and US-64, coach side:** `page.getByText("E2E Student").first()` matches "E2E Student", "E2E Student Two" and any preview containing the name. It clicks whichever row is newest. In a full run that is E2E Student Two, because the evaluation-tools specs' "E2E Coach shared an evaluation with you" messages bump that thread to the top.
- **US-64, student side:** `studentPage.getByText("E2E Coach").first()` matches the second seeded coach, "E2E Coach No Levels". Earlier specs had written to that thread, so it was newest. The student messaged a different coach while the coach watched a different thread.
- **US-205:** it fixed "Filler Player 27". An earlier spec's class-cancellation message opens a conversation with him, and NewConversationDialog hides anyone the coach already talks to.

**What should happen:** each spec opens the conversation it names, and its fixture does not depend on what earlier specs did.

**Root cause:** Type 7, the test encodes its target wrongly. No product rule is involved; the messaging specs are right, and the code honours them.

**Evidence (Phase 1, 2026-09-25):**
- **Alone** on a fresh isolated DB at `86523d0bd`, which has the same tree as main `ac5b4f844`: direct-messages + messageable-roster are 10/10.
- **In order**, running everything up to and including `messaging/`: US-60, US-64 and US-205 fail.
  - The US-60 screenshot shows the coach's thread on E2E Student Two.
  - The US-64 trace shows the coach context on conversation 6 and the student context on conversation 8, with POST /message 201.
  - The student's screenshot shows the US-64 bubble delivered in "E2E Coach No Levels".
- **Directed trigger** (`aaa-pad452-trigger.spec.ts`, untracked; it bumps Student Two, opens a Filler Player 27 conversation, and has the student write to E2E Coach No Levels):
  - old specs with the trigger: exactly US-60, US-64 and US-205 fail, 8 pass;
  - new specs with the trigger: 11/11, and trigger + US-64 2/2;
  - new specs without it: 19/19 across all eight touched files.

### Change Plan (Type 7)
1. `helpers/navigation.ts`: `conversationRow(page, name)`, the `button` row that has `getByText(name, { exact: true })`.
2. Use it at every conversation click or visibility check that named a participant by substring. That's direct-messages (9 sites), conversation-paging, message-timestamp-timezone, participant-role-header, class-request-counter-proposal (2 sites), push-denied-feed and conversation-day-label. The players-list checks in player-search-pagination are not conversation rows and stay as they are.
3. messageable-roster: `untouchedFiller(request)` reads messageable-users and every conversation page, and picks an active "Filler Player NN" with no conversation. The picker regex uses word boundaries.

**Second layer (found by the full run on the first fix, `4732da3d9`).** With the right thread open, US-60 still failed. Earlier specs' class messages ("I've added you…", "…has been cancelled") push the seeded "Welcome to the academy!" out of the thread's first page (30 messages), so it is not rendered. The screenshot shows E2E Student's thread open, with no seeded bubble.
- The trigger now also sends 35 coach messages into that thread.
- First fix with the trigger: US-60 fails on `getByText('Welcome to the academy!')`.
- Fix (change plan step 4): `direct-messages.spec.ts` US-60 now sends its own message and edits that, as US-61 already does for delete.

### Resolution
- **Spec changes:** none. The messaging specs are right, and the product honours them.
- **Tests changed:**
  - `helpers/navigation.ts` gains `conversationRow`, used at every conversation click in 8 specs;
  - `messageable-roster.spec.ts` picks `untouchedFiller` at run time;
  - `direct-messages.spec.ts` US-60 edits its own message.
- **2×2 with the complete trigger:**
  - old specs: US-60, US-64 and US-205 fail;
  - first fix: US-60 fails (the second layer);
  - final fix: 11/11 with the trigger, 10/10 without, and 19/19 across all eight touched specs.
- **Full serial run on the first fix** (`4732da3d9`, 488 tests, 13:55:17Z, load average ~500–700): US-64 and US-205 pass, and US-60 fails only on the second layer, now fixed. The other failures are in files this change does not touch (see the PR).
- **Code changes:** none.
- **Resolved:** 2026-09-25T13:55:38Z, commit `7314027af` (PAD-452).
