The paired fix for iOS suspending the JS runtime while the mobile app is backgrounded: `useAppStateFocus` bridges RN's `AppState` into React Query's `focusManager` so a foreground return triggers `refetchOnWindowFocus`, while `useAppEvents` (`src/lib/sse.ts`) forces an SSE reconnect specifically on a `background`→`active` transition — not the more frequent Control-Centre/Face-ID app-switcher blips, which would needlessly churn a healthy connection (per a comment tied to a 2026-06-10 outage, doubling backend thread usage). Neither alone is sufficient: reviving the socket without refetching leaves cached screens stale; refetching without reviving the socket leaves the app blind to subsequent live events.

## Implemented by
`frontend/apps/mobile/src/hooks/useAppStateFocus.ts`
`frontend/apps/mobile/src/lib/sse.ts`

## Related concepts
[[app-shell-bootstrap]]
[[sse-streaming]]
