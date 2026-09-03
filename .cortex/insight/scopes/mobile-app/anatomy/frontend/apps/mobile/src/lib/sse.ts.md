---
path: frontend/apps/mobile/src/lib/sse.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 127
size_tokens: 1165
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d2f865e26e0877ba6033a99f89eeb6ceb93cc2d4a8a69cb9e469eaaf55da1e43"
---

## Purpose

Mobile's live-event stream, the counterpart to web's `createEventSource` (`apps/web/src/api/events.ts`, outside this scope), backed by `react-native-sse` since React Native has no built-in `EventSource`. `useAppEvents(onEvent)` subscribes for the lifetime of an authenticated session, with exponential backoff (1s→30s) and an `AppState`-driven forced reconnect on foreground return.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `isAuthenticated` (unresolved alias `@/auth/AuthContext`, not in L1's resolved graph).
- `frontend/apps/mobile/src/lib/api.ts`: `secureTokenStorage.getToken()` to fetch the token for the connection URL (unresolved alias `@/lib/api`).
- `frontend/apps/mobile/src/lib/config.ts`: `API_URL`, passed into `buildEventsUrl` (unresolved alias `@/lib/config`).
- `@levelup/api` (`buildEventsUrl`): outside this scope (packages).
- `react-native-sse` (`EventSource`): outside this scope, third-party.

Used by: no in-scope file is captured in L1's structural edges (the `@/lib/sse` alias goes unresolved), but by direct reading `useAppEvents()` is called from `app/(tabs)/_layout.tsx` (unread-count invalidation), `app/class/[id].tsx` (live invitation updates), and `app/conversation/[id].tsx` (live message updates).

## Insights

- `react-native-sse`'s default behavior is to auto-reconnect on a fixed `pollingInterval` — this hook explicitly passes `{ pollingInterval: 0 }` to disable that and owns its own exponential-backoff reconnect loop instead, so a single connect/retry path handles both transient errors and the deliberate foreground-triggered reconnect.
- The `AppState`-driven reconnect only fires on a genuine `background` → `active` transition (checked via a `previousState` ref, not just `status === "active"`), because iOS also emits `active → inactive → active` for Control Centre, a Face ID prompt, or the app-switcher peek — none of which suspend the JS runtime or kill the socket, so reconnecting on those would churn a healthy connection for no reason.
- That churn-avoidance is explained as more than cosmetic: a long comment notes the backend held each abandoned SSE connection's thread until its `q.get(timeout=15)` expired, on a backend pinned to a single gunicorn worker (referencing the 2026-06-10 SSE outage) — so a rapid reconnect churn would transiently double thread usage on a server that has already had a production outage from thread exhaustion on this exact code path.
- Documented as one half of a pair with `useAppStateFocus` (`src/hooks/useAppStateFocus.ts`): this hook revives the dead socket on resume, that hook refreshes react-query data that went stale while the socket was down — both are necessary together.

## Query pointers

If SSE events stop arriving after backgrounding the app, check the `AppState` listener here (previousState tracking) before assuming a backend issue — this is the intentional resume-reconnect path, and a bug in the `previousState` guard would either miss reconnecting or reconnect too aggressively.
