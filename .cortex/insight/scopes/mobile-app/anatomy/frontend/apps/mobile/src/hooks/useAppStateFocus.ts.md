---
path: frontend/apps/mobile/src/hooks/useAppStateFocus.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 37
size_tokens: 373
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "61ba7e6e4ee7de8fb6580f4876968f223e00ba8de07b0196750afb0ccfb7e55e"
---

## Purpose

Bridges React Native's `AppState` into React Query's `focusManager`, so a foreground return triggers `refetchOnWindowFocus`-driven refetches. Without this, `focusManager` — which only knows how to listen for DOM `visibilitychange`/`focus` events — stays permanently "focused" on native, and data cached before iOS suspended the JS runtime is served stale until a cold relaunch remounts the app.

## Connections

Uses: none within scope (imports `@tanstack/react-query`'s `focusManager` and RN's `AppState`, both outside this scope).

Used by: no in-scope file is captured in L1's structural edges (the `@/hooks/useAppStateFocus` alias goes unresolved), but by direct reading `useAppStateFocus()` is called once, in `app/_layout.tsx`.

## Insights

- Explicitly a no-op on `Platform.OS === "web"`, since `focusManager`'s own DOM listeners already handle that platform correctly — this hook only fills the native gap.
- Documented as one half of a pair with `useAppEvents` in `frontend/apps/mobile/src/lib/sse.ts`: that hook revives the SSE connection on foreground, this one refreshes react-query data that went stale while the connection was dead. Both are required together — reviving the socket alone leaves already-cached screens stale, and refetching alone leaves the app blind to subsequent live events until the next natural refetch.
