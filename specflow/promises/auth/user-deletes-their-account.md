---
id: P-AUTH-6
title: "User deletes their account"
status: implemented
---
# User deletes their account

## Outcome

Anyone can delete their account from inside the app, and afterwards it is really gone: nobody can sign in with it, nothing reaches the person again, and they are booked into nothing. What belongs to other people stays, anonymised as "Deleted user": the coach's record of past classes and the other side of a conversation.

- Deletion is immediate and cannot be undone.
- Deletion removes the person from the future and never rewrites the past.
- No sign-in, push, reminder or invitation reaches a deleted account.
- Freeing a deleted student's seats is silent: no automatic invitations go out because of it.
- The confirmation text on every platform states exactly what is deleted and what is kept.
- Deletion reaches the services LevApp uses: a coach's CRM contact is archived and the stored photo deleted (PAD-605, PAD-607). A failure there never blocks the deletion.

It does not promise what happens to a deleting coach's own classes, roster and club, or a data export.
