---
id: P-MESSAGING-2
title: "User and coach message in real time"
status: implemented
---
# User and coach message in real time

## Outcome

A coach and a student talk one-on-one inside the app, in a conversation found automatically the first time they message. Messages, edits, deletions and reactions show live on the other screen, and the platform's own reminders and invitations arrive as messages in that thread.

- A coach can always message any student on their own roster and any student in a class they teach that is still ahead; being at the same club is not a relationship (PAD-568). A student can message exactly the coaches who can message them. Anyone else is reached by exact username.
- A conversation between the same two people is found, never recreated.
- Only the sender can edit or delete a message.
- In the phone app, going back from a conversation always returns to the Messages list, however it was opened (PAD-768).
- Deleting a message erases its text and any photo; the thread keeps a "Message deleted" placeholder, the list never shows the old text, and nothing deleted stays readable on the server, except the copy kept with a report for staff review.
- An edit or delete reaches every connected client live.
- A message can carry a photo, or reply to an earlier message as a visible reply chain.
- The conversation list shows the other person's profile photo, or their initials, on web and iOS; the server gives out the same photo address for up to 50 minutes so it can be reused (PAD-593).
- Inside a conversation every day starts under a separator ("Hoje", "Ontem", the weekday, or a date such as "12 out"), the same on web and iOS; no message is without a day (PAD-676).
- Many people can react with the same emoji, and one person with several different emoji.
- Timestamps show in the viewer's local time.
- With many people connected, live updates may pause for a few seconds and resume by themselves, while pages, messages and actions keep working.

It does not promise unread counts, badges or push, or the content and triggers of automated messages.
