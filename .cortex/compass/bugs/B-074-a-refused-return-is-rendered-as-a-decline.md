---
id: B-074
title: "A refused return is rendered as a decline: the client's answer vocabulary outgrew the server's"
type: incomplete-rule
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

**Type:** `incomplete-rule`. `attendance.confirm` rules 1–3 describe the reminder answer as
`yes` → confirmed / `no` → declined and never state the full set of answers the SERVER can give,
so every client reasonably enumerated three. The rule's incompleteness is upstream of the code
defect; PAD-315's rule 26 closes it by naming `spot_filled` and `duplicate` as answers a client
must handle.

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
it — it asserts something false with full confidence.

**The rule a reviewer can apply to code they have never seen:** *when you cannot tell, say
nothing rather than guess the common case.* Concretely, the shape that survived contact with a
new value is `apps/web/src/components/messages/reminder-answer.ts`'s explicit unknown branch —
`return { local: null, toastKey: ... }` — which writes no state at all. Copy that, and prefer
an exhaustive `switch` the compiler can check over a ternary with a fallback.

## The day's through-line: a claim that asserts more than it knows

This is the **fourth** instance of one idea on 2026-09-12, which is why the mechanism matters
more than this bug:

1. **A field** — `Presence.confirmed` meant *answered* and was read as *coming*, so a student
   who had cancelled rendered as confirmed ([[B-073]]). A column asserting more than it knew.
2. **A label** — "Não vais — falta justificada" over a justification-blind state
   (`attendance.confirm` rule 25, PAD-313). A label asserting more than the state it renders
   knew; the rule now says a label may never do that.
3. **A test** — asserting English text in an app that renders Portuguese, which passed only
   while the string it matched was untranslated ([[B-086]]). An assertion asserting more than it
   could know, and one whose pass carried no information.
4. **A default branch** — this entry: everything unknown mapped onto one specific answer, so a
   new server value becomes a confident lie rather than a shrug.

All four are cheap to prevent and expensive to find: each one looked like ordinary defensive
code, and each one produced a screen that was confidently wrong rather than visibly empty. The
fix in every case is the same move — narrow the claim to what is actually known, and say nothing
where nothing is known.

**Also part of the fix here:** the web message bubble's copy. It fails safe on state but says
"something went wrong" when nothing went wrong — the seat was taken, which is an outcome. Same
failure in a smaller costume: a message asserting more than it knows.
