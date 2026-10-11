# client — Client Data Runtime

## What this is

Behaviour the web app and the iOS app owe to the way they fetch and keep server data, as
opposed to a product feature: how long a screen's data is trusted, when it is refreshed, and
what a user sees while that happens. One contract for both apps.

## What it covers

- `client.query-cache` — implementing (PAD-586 on web, PAD-592 on mobile: one stale window and
  retry policy from `packages/hooks/src/queryDefaults.ts`; a screen the user just saw renders
  from cache at once and refreshes in the background; freshness is event-driven over SSE, never
  polled; range and page changes keep the previous data on screen)

## Why it's grouped this way

Every feature leaf describes what a screen shows. How the data behind it is cached and refreshed
cuts across all of them and would otherwise be a clause repeated per leaf, drifting between the
two apps. One small domain keeps the contract in one place, the way `mobile/` keeps the Android
runtime rules, and lets feature leaves stay silent about caching.

## Related groups

- `mobile/` — platform runtime rules for the Expo app; `mobile.*` leaves may depend on
  `client.query-cache` for the stale window.
- `messaging/` — `messaging.sse-realtime` is the event source that invalidates cached data.
