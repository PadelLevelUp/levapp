---
id: B-074
title: "A refused return is rendered as a decline: the client's answer vocabulary outgrew the server's"
type: behaviour-defect
severity: medium
status: triaged
affects:
  - frontend/packages/api/src/resources/notificationEngine.ts
  - frontend/apps/mobile/src/features/messages/reminder-state.ts
  - frontend/apps/mobile/src/features/dashboard/blocks.tsx
  - frontend/apps/web/src/components/dashboard/coach/useAnswerReminder.ts
  - frontend/apps/web/src/components/messages/reminder-answer.ts
proposed_fix: "Widen `respondToReminder`'s declared result to include `spot_filled` and `duplicate`, then handle `spot_filled` explicitly at all four call sites: leave the row as it is, say the spot was taken, and never write an answer the student did not give. Fixed inside PAD-315, which is the ticket that makes the answer common."
opened: 2026-09-12T14:10:00Z
---

# B-074 — a refused return is rendered as a decline

**Source:** found while reading for PAD-315 (the "actually, I can come" affordance), 2026-09-12,
on staging `2c5b14039` — i.e. in shipped code, not on a branch.

## What is wrong

`POST /api/app/notify/respond_reminder` with `action: "yes"` can answer
`{"action": "spot_filled"}`: the retaking branch of `respond_to_reminder`
(`notification_service.py:2698`) locks the instance, re-checks capacity, and refuses when the
seat has gone, messaging the student and notifying the coach. It can also answer
`{"duplicate": true}` for a repeat tap. Both shipped in this morning's fix release with #241.

The client wrapper still declares the old vocabulary:

```ts
Promise<{ action: "confirmed" | "declined" | "expired" }>
```

So every call site branches on three values against a server that returns five, and each one
fails differently. Two of the four are reachable **by a student today**, and neither merely
renders nothing:

| Site | On `spot_filled` it does | Why that is worse than nothing |
|---|---|---|
| `apps/mobile/app/conversation/[id].tsx` via `reminderResponseOutcome` (`reminder-state.ts:146`) | writes `response: "no"` into the message cache, **no toast** | the bubble settles as if the student had answered NO. They tapped Yes, were refused, and the app records the opposite, silently. |
| `apps/mobile/src/features/dashboard/blocks.tsx:238` | `toast.success(t("dashboard.answer.declined"))` | a green confirmation telling the student they declined. Affirmatively wrong, not absent. |
| `apps/web/src/components/dashboard/coach/useAnswerReminder.ts:27` | same else-branch: success toast reading "declined" | wrong by construction. Not student-reachable today — these are coach surfaces and the server resolves the player from the caller's own JWT, so a coach cannot produce `spot_filled` — but it mislabels any new action value the server adds. |
| `apps/web/src/components/messages/MessageBubble.tsx` via `reminderAnswerOutcome` | paints nothing, shows "something went wrong" | the only one that fails safe. Still the wrong words: nothing went wrong, the seat was taken. |

The two mobile helpers' fallbacks are the mechanism, and both were written deliberately for a
three-value world: `reminderResponseOutcome` ends `action === "confirmed" ? "yes" : "no"`, and
the dashboard block's ternary ends `"confirmed" ? confirmed : declined`. A defensive default
that maps *everything unknown* onto a specific wrong answer is the trap — the web bubble's
explicit unknown branch is the shape that survived contact with a new value.

## Why it matters more from today

Before PAD-315 a student could only reach `spot_filled` by tapping "Yes" on a reminder *after*
cancelling — uncommon but real. PAD-315 adds an affordance whose whole purpose is to produce
that answer, so the rate goes from rare to routine, and the failure is the one a student would
notice most: they ask for their spot back and the app quietly says they declined.

## How to recognise it again

The general shape: a typed client contract that enumerates a server's answers, plus a default
branch that picks one of them. When the server gains a value the client does not merely ignore
it — it asserts something false with full confidence. Prefer an explicit unknown branch that
writes no state and says so.
