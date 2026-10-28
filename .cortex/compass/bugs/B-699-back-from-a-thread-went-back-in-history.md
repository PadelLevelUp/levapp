---
id: B-699
title: "Back from a conversation on the phone app went to the previous screen or thread, not up to the Mensagens list"
type: missing-criterion
severity: medium
status: resolved
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/src/features/messages/open-conversation.ts
proposed_fix: "conversation-detail rule 17: every way into a thread goes through openConversation (pop the root stack to (tabs) on Mensagens, then push the thread); the header arrow is upFromConversation; a wiring test forbids a direct push to /conversation/."
opened: 2026-10-28T15:30:00Z
resolved: 2026-10-28T16:30:00Z
---

# B-699: back from a thread went back in history

**Source:** the owner's report (Linear PAD-768): back inside a conversation sometimes re-entered
an earlier conversation instead of leaving to the list.

**What happens:** `/conversation/[id]` is a screen of the mobile app's root native stack, above
`(tabs)`; every way into it was a plain `router.push` (the list, a class's and the participant
sheet's "message", dashboard links, and `PushTapRouter` for every push tap), and the header arrow
was `router.back()`. So back, including the iOS swipe and Android's button, returned to whatever was
under the thread: thread A after a push tap opened B on top of it, the class after "message the
student", the start tab after a cold-start push tap. Read from the code on staging 9379f46f4 (not
reproduced on the simulator; the slot was queued for other sessions).

**What should happen:** back from any thread lands on the Mensagens list.

**Root cause:** `messaging.conversation-detail` said nothing about where back from a thread goes
(missing criterion); each entry point chose its own navigation.

**Fix:** rule 17 and its criterion. `openConversation` / `pushRoute` / `upFromConversation`
(`src/features/messages/open-conversation.ts`) and every entry point through them. The wiring test
`open-conversation.test.ts` fails on a direct `router.push("/conversation/…")` (checked by reverting
one call site). Web untouched: its chat lives in the browser's history.
