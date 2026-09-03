---
id: messaging.user-manages-unread-and-notifications
status: implemented
implemented_by:
  - ../../specs/messaging/read-tracking.spec.md
  - ../../specs/messaging/push-notifications.spec.md
---

# User manages unread and notifications

## Outcome

A user always has an accurate sense of what they haven't read yet — a badge count on the Messages
tab and on their device's home-screen icon — and gets notified outside the app when a message
arrives and they're not already looking at that conversation. Opening a conversation clears its
unread count, and the badge never lies by staying stuck after they've actually read everything.

## Who This Is For

Any user of the platform — coach or student — who isn't staring at the app the moment a message
arrives, and needs to know something's waiting for them.

## User Journey

1. A student is away from the app when their coach sends a message. A push notification arrives —
   on the web (browser push) or on their phone (native push) — showing the sender's name and the
   message text, and tapping it opens straight to that conversation.
2. Their phone's home-screen app icon shows a badge count that matches their real total unread
   messages, not just "1" for the one that just arrived.
3. Back inside the app, the Messages tab itself shows an unread badge, and each conversation with
   unread messages is visually marked.
4. They open the conversation and read the new messages. The unread count for that conversation
   drops to zero immediately, and the app-icon badge updates to match.
5. If they log out, the badge is cleared — it never shows a stale count for an account they're no
   longer signed into.

## Business Rules

- "Unread" means messages sent after the last time the user marked that conversation as read —
  opening a conversation is what marks it read.
- A push notification always carries the recipient's real current unread total, not an increment —
  so even if one push notification never arrives, the badge is self-correcting the next time one
  does.
- The app-icon badge is kept in sync by the running app itself, not only by incoming push payloads
  — a notification is never the only thing capable of clearing a stale badge.
- Push notifications only reach a device that's registered one — a user who's never granted
  notification permission simply doesn't get them, with no error surfaced to the sender.

## Success Metrics

Not yet measured.

## Out of Scope

- The actual sending, editing, deleting and reacting to messages — see "User and coach message in
  real time".
- Any student-side preference to mute notifications entirely — that's a separate switch in the
  `notifications` domain (`notifications.student-controls-their-notifications`), not part of this
  read-tracking/push mechanism.

## Notes
- None.
