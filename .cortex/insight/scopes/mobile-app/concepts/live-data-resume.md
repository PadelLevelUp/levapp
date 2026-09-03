---
name: live-data-resume
---

# Live data resume

The paired fix for iOS suspending the JS runtime while the app is backgrounded: `useAppStateFocus` bridges RN's `AppState` into React Query's `focusManager` so a foreground return triggers `refetchOnWindowFocus`, while `useAppEvents` (`src/lib/sse.ts`) forces an SSE reconnect specifically on a `background`→`active` transition (not the more frequent `active`→`inactive`→`active` blips from Control Centre/Face ID/app-switcher, which would needlessly churn a healthy connection and — per a comment tied to the 2026-06-10 outage — transiently double backend thread usage). Neither alone is sufficient: reviving the socket without refetching leaves cached screens stale; refetching without reviving the socket leaves the app blind to subsequent live events.

Implementing files: `frontend/apps/mobile/src/hooks/useAppStateFocus.ts`, `frontend/apps/mobile/src/lib/sse.ts`.

Related concepts: [[auth-session-lifecycle]].
