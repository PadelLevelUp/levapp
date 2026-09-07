---
id: messaging.student-reaches-out-and-stays-safe
status: draft
implemented_by:
  - ../../specs/messaging/direct-by-username.spec.md
  - ../../specs/messaging/block-and-report.spec.md
---

# Student reaches out and stays safe

## Outcome

A student can start a conversation with another student if they know that person's username —
the way you'd share a handle at the club — without either of them needing to be on the same
roster or accept a friend request first. On the receiving end, a message from someone you don't
share a club with arrives clearly marked as such, with Block and Report one tap away, so an
unwanted message is a one-time event, never a channel.

## Who This Is For

Students who play together and want to coordinate outside class; students who receive a message
from someone they don't recognise; and, indirectly, coaches — who keep their existing reach
(their clubs' players) and are not affected by student-to-student traffic.

## User Journey

1. A student opens Messages → New message. Alongside the usual list of their coaches, there is a
   "Message by username" field. They type the other student's exact username.
2. If an active account with that username exists and hasn't blocked them, a conversation opens
   (or the existing one is reused) and they send their message. If it doesn't exist — or the
   other person has blocked them — they simply see "no user with that username"; the two cases
   are indistinguishable.
3. The recipient sees the conversation appear with a banner: "You don't share a club with
   {name}". The banner offers **Block** and **Report**. If they reply, the banner goes away and
   the conversation behaves like any other.
4. Blocking ends it: neither side can message the other, the sender disappears from the
   recipient's pickers, and the recipient's thread shows "You blocked {name}" with an Unblock
   option. Reporting files the offending message for the operators to review; "Report and block"
   does both.
5. The student can see and undo their blocks under Settings → Account.
6. Nothing about this makes students discoverable: there is no student directory, no name
   search, and no autocomplete on the username field.

## Business Rules

- A student may message any active coach (as today) and any active student *by exact username*.
- Students are never listed or searchable by other students.
- Coaches keep today's reach — the players of their clubs — and are not opened up further by this
  outcome.
- A conversation is "unknown" to a viewer when the other person is not one of their coaches,
  shares no club with them, and the viewer has never written in it. The banner shows exactly
  then, and only then.
- A block works both ways and is enforced by the server: neither party can start a conversation
  with, or send a message to, the other. Blocking is silent — the blocked person is not told.
- Reporting is only possible from inside a conversation the reporter is part of, and always
  points at a specific message.
- Block and report are available on web and on iOS, in the thread and (blocks) in Settings.

## Success Metrics

- Not yet measured. Candidates: student-started conversations per week; share of unknown-sender
  conversations that end in a block within 24h; reports per 1,000 messages.

## Out of Scope

- The mechanics of sending, editing, reacting and real-time delivery —
  [[messaging.user-and-coach-message-in-real-time]].
- Unread counts and push — [[messaging.user-manages-unread-and-notifications]].
- Group conversations between students. Not in v1.
- Operator tooling for reviewing reports beyond the generic editor. Not in v1.

## Notes

- Decision record: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`
  (item 5) — this replaces PAD-137's pending-request model for student↔student.
- Block and report already exist in the product (App Store readiness, phase 3) but had no spec;
  `messaging.block-and-report` pins them and adds the unknown-sender banner.
