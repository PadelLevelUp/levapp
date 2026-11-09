---
id: P-MESSAGING-3
title: "User manages unread and notifications"
status: implemented
---
# User manages unread and notifications

## Outcome

A user always knows what they have not read, through a badge on the Messages tab and on the app icon, and is notified outside the app when a message arrives and they are not in that conversation. Opening a conversation clears its count, and the badge never stays stuck.

- "Unread" means messages sent after the user last opened that conversation.
- A push carries the recipient's real current unread total, not an increment, so the badge corrects itself on the next push.
- The running app keeps the icon badge in sync itself; a push is never the only thing that clears it.
- Push reaches only a registered device; a user who never allowed notifications gets none, and the sender sees no error.
- Turning notifications on works without restarting or signing in again, on the phone and in the browser. When alerts are not reaching this device for another reason, the Messages screen says so and offers a tap to turn them on again (PAD-744).
- A new message or notification makes a short sound while the app is open, and push sounds on the phone; one setting, on by default, turns both off (PAD-680). A browser plays it only after the person has clicked or typed on the page.

It does not promise sending or editing messages, or a student's switch to mute notifications.
