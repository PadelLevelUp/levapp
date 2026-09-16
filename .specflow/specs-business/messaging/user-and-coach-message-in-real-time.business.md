---
id: messaging.user-and-coach-message-in-real-time
status: implemented
implemented_by:
  - ../../specs/messaging/conversations.spec.md
  - ../../specs/messaging/conversation-detail.spec.md
  - ../../specs/messaging/messages.spec.md
  - ../../specs/messaging/reactions.spec.md
  - ../../specs/messaging/sse-realtime.spec.md
---

# User and coach message in real time

## Outcome

A coach and a student can talk directly inside the app — one-on-one, in a conversation that finds
itself automatically the first time they message each other. Messages, edits, deletions and emoji
reactions all show up live on the other person's screen without a page reload, and every reminder
or invitation the platform itself sends arrives as a message in that same thread.

## Who This Is For

Any two users of the platform who need to talk — most often a coach and one of their students, but
the mechanism itself is generic 1:1 (and group) messaging.

## User Journey

1. A student opens the messages tab and starts a conversation with their coach — if one already
   exists between them, it's reused rather than duplicated.
2. They open the conversation and land on the most recent messages, in order, along with who's on
   the other end and what role they hold (so the header correctly reads "Coach", not a hardcoded
   label). Older messages load as they scroll up, a page at a time; reading older messages is
   never interrupted by new ones arriving.
3. They type a message and send it. It appears instantly in their own conversation view, and shows
   up live on the coach's screen if they have it open — no refresh needed.
4. They can reply to a specific earlier message, attach a photo, or react to any message with an
   emoji — tapping the same emoji again removes their reaction.
5. If they made a typo, they can edit their own message after sending, or delete it outright; both
   show up live on the other side too.
6. When they're on a phone and the on-screen keyboard is open, the message box stays docked
   directly above it, with their latest message still visible — never hidden behind the keyboard or
   floating with an awkward gap.
7. System messages — a reminder, an invitation, a spot-filled notice — appear in this same thread,
   indistinguishable in mechanism from a message a person typed, just visually marked as automated.

## Business Rules

- A coach can always message any student on their own roster — anyone they added, imported, or who
  accepted their invitation — as well as any student at a club they coach at. Nobody else. A
  student can message any active coach.
- A conversation between the same two people is found, not recreated, every time — starting a
  "new" conversation with someone you've already messaged reuses the existing thread.
- Only the sender of a message can edit or delete it.
- An edit or delete is a real-time event, not just a stored change — every connected client sees it
  update live.
- A message can carry a photo attachment, or reply to a specific earlier message in the thread,
  forming a visible reply chain.
- Multiple people can react to the same message with the same emoji; the same person can react to
  one message with several different emoji.
- Message timestamps always render in the viewer's own local time, regardless of what timezone the
  server stored them in.
- When many people are connected at once, the app stays usable: live updates may pause for a few
  seconds and resume by themselves, but pages, messages and actions keep working.

## Success Metrics

Not yet measured.

## Out of Scope

- Unread counts, the unread badge, and browser/native push notifications — see "User manages
  unread and notifications".
- The content and triggering logic of automated reminder/invitation messages themselves — those
  belong to the `notifications` domain; this outcome only covers the generic delivery mechanism
  they ride on.

## Notes
- OPEN: the real-time layer is in-memory, single-server pub/sub with no persistence across
  restarts and no per-user event filtering (every connected client currently receives every event)
  — see `messaging.sse-realtime` Notes. Worth flagging if the product ever needs to scale beyond
  one server.
