# messaging — Real-Time Messaging

## What this is

Direct, real-time 1:1 (and group) conversations between users of the platform — most commonly a
coach and a student — including the mechanism every automated reminder and invitation message
rides on.

## What it covers

- `messaging.user-and-coach-message-in-real-time` — starting a conversation, sending, editing,
  deleting, replying, reacting, and seeing it all live on the other side
- `messaging.user-manages-unread-and-notifications` — unread counts, badges, and push notifications
  outside the app

## Why it's grouped this way

Two outcomes split along how a user experiences them: actively being in a conversation (real-time
messaging) versus finding out something's waiting when they're not (unread state and push). They're
triggered by different moments — sending a message versus not being present when one arrives — and
can be read, tested and changed independently of each other.
