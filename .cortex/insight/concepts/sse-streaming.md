LevApp's server-sent-events mechanism, spanning three independent backend producers (the realtime `/events` feed, `/import/analyze` AI streaming, `/import/confirm/stream` progress streaming) that share the same `X-Accel-Buffering: no` / `Cache-Control: no-cache` header pattern and keep-alive-vs-thread-leak concerns (see the 2026-06-10/11 outage postmortem in project memory), and two independent client consumers: `@levelup/api`'s `buildEventsUrl` is shared plumbing that web consumes with the DOM `EventSource` and mobile consumes with a `react-native-sse` client wrapped in AppState-driven reconnect (SSE only survives an iOS background/foreground cycle because `useAppStateFocus` explicitly tears down and rebuilds the connection on resume — the JS runtime does not keep a socket alive while suspended).

## Implemented by
`backend/padel_app/modules/frontend_api.py`
`frontend/packages/api/src/sse.ts`
`frontend/apps/mobile/src/lib/sse.ts`
`frontend/apps/mobile/src/hooks/useAppStateFocus.ts`

## Related concepts
[[auth-session]]
