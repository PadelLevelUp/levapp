# messaging — Real-Time Messaging

## What this is

The messaging domain.

## What it covers

- `messaging.conversations` — implemented
- `messaging.messages` — implemented
- `messaging.reactions` — implemented
- `messaging.read-tracking` — implemented
- `messaging.sse-realtime` — implemented
- `messaging.push-notifications` — implemented
- `messaging.conversation-detail` — implemented
- `messaging.block-and-report` — implementing (block/report built, never specced; unknown-sender banner draft)
- `messaging.direct-by-username` — draft (student→student by exact username)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/messaging/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.
