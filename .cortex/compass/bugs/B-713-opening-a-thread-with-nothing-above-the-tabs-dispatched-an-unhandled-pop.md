---
id: B-713
title: "Opening a thread with only the tabs on the root stack dispatched an unhandled POP_TO (a LogBox toast over the composer in Debug)"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/src/features/messages/open-conversation.ts
proposed_fix: "messaging.conversation-detail rule 17: openConversation pops the root stack to (tabs) only when canDismiss(); with (tabs) alone it selects the Mensagens tab (navigate) and then pushes the thread."
opened: 2026-10-30T10:45:00Z
resolved: 2026-10-30T10:55:00Z
---

# B-713: opening a thread with nothing above the tabs dispatched an unhandled POP_TO

**Source:** PAD-791, found by a peer session during the build-35 Maestro gate (2026-10-29, main
fe4aeb96e, Debug simulator shell).

**What happens:** opening a thread from the Mensagens list runs `openConversation`, which since
PAD-768 always calls `dismissTo("/(tabs)/messages")` before pushing the thread. With only `(tabs)`
on the root stack there is nothing to pop. React Navigation logs "The action 'POP_TO' with payload
{"name":"messages","params":{}} was not handled by any navigator" (4 times in that run's Metro log).
In Debug the LogBox toast covers the composer, so Maestro flow 09's send step misses: red on main in
Debug twice. Release builds show no LogBox, and sending, editing and deleting work once the toast
is closed.

**What should happen:** opening a thread with only `(tabs)` on the root stack dispatches no POP_TO.
The Mensagens tab is selected and the thread pushed on top, so back still lands on the list (PAD-768).

**Root cause (observed):** expo-router 6.0.24's `dismissTo` is a `linkTo` with event POP_TO.
`getNavigateAction` targets the deepest navigator where the current state and the href diverge.
With `(tabs)` alone on the root stack, the root's only route already matches `(tabs)`, so the
action goes to the tab navigator. A tab navigator does not handle POP_TO. The same holds on any
other tab (a push tap or a dashboard link while on Painel), where the tab also stayed put under the
thread. Rule 17 said the helper "pops the root stack to `(tabs)`" and named no case where there is
nothing to pop: an incomplete rule.

**Evidence that selected the type:** the peer's Metro log and the two red flow-09 runs (ticket);
the expo-router source above (`build/global-state/routing.js`: `dismissTo`, `getNavigateAction`,
`canDismiss`); `open-conversation.test.ts` with a router whose `canDismiss()` is false, on staging
21843c599 at 10:50:55Z: 2 failed, both calling `dismissTo` with nothing to pop. Not reproduced on
the simulator in this session.

**Not affected:** a thread opened from a class, the participant sheet or another thread. The root
stack then holds a screen above `(tabs)`, `canDismiss()` is true and `dismissTo` pops it as before.
The tabs hold no stacks of their own, so `canDismiss()` asks exactly about the root stack.

**Affected specs:**
- Dev: `.specflow/specs/messaging/conversation-detail.spec.md` (rule 17, one criterion)
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md`
  (unchanged: back from a thread still lands on Mensagens)

### Change plan (type 2, incomplete rule)

Rule 17 states when the pop runs. Add a criterion for opening a thread with only the tabs on the
stack. Then guard `dismissTo` with `canDismiss()` and select the tab with `navigate` otherwise.

### Resolution

- Spec changes: rule 17's mechanism; criterion "Opening a thread with only the tabs on the stack
  pops nothing".
- Tests: `open-conversation.test.ts` (2 new); `open-sequence.warm-target.test.ts`'s source guard now
  forbids navigating to the thread, not navigating at all.
- Code: `openConversation` in `open-conversation.ts`.
- Also in PAD-791: `.maestro/README.md` records that flow 310 reorders the seeded conversations
  (message flows before 310, or reseed); `config.yaml`'s comment on 310 says its position is load
  bearing.
- Resolved: 2026-10-30.
