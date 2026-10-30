---
id: client.request-timeout
status: implementing
depends_on: [client.query-cache]
implements: ../../specs-business/client/user-returns-to-a-screen-at-once.business.md
governed_by: [R-024]
---

# client.request-timeout

> Linear: PAD-786. Added 2026-10-29 by SessionB from coach 2's report on iOS build 34 (B-704).

### Intent
A request that never gets an answer ends as an error instead of waiting forever. Before this
leaf the shared axios client had no timeout, so a half-open connection or a server worker that
never replied kept a screen's spinner up until the app was killed. One number, in the shared
client, for the web app and the iOS app alike.

### Surfaces
- **Shared**: `frontend/packages/api/src/client.ts` (`REQUEST_TIMEOUT_MS`,
  `LONG_REQUEST_TIMEOUT_MS`, the `axios.create` default), exported from `@levelup/api`.
- **Web**: `apps/web/src/api/import.ts` (import confirm and revert pass the long timeout).
- **Mobile**: `apps/mobile/src/features/settings/settings-api.ts` (import revert passes the long
  timeout).
- **Backend**: no change.

### Entities
- **READS:** none. **WRITES:** none.

### Rules
1. **One timeout for every request.** `createApiClient` builds its axios instance with
   `timeout: REQUEST_TIMEOUT_MS` (20 000 ms). Both apps build their client through it, so the web
   app and the iOS app share the number. It is several times prod's slowest p95 (3–6 s on
   2026-10-28).
2. **Long writes say so per request.** An import's confirm and revert (web and iOS) pass
   `timeout: LONG_REQUEST_TIMEOUT_MS` (120 000 ms) with a comment; no other request overrides the
   default. Streams that do not go through axios (the SSE connection, the import's `fetch`
   streams) are not affected.
3. **A timeout is an ordinary failure.** It rejects with axios's `ECONNABORTED` and no
   `response`, so React Query treats it like any failed request: one retry (`QUERY_RETRY`), then
   the query's error state. A stalled read therefore ends within about 2 × 20 s + the retry's
   1 s backoff. Mobile's `describeApiError` already reports an error with no response as a
   network error; web never prints axios's own message.

### Acceptance Criteria

#### The shared client has the timeout (rule 1)
- **Given** a client made by `createApiClient({ baseURL: "/api", storage })`
- **When** its defaults are read
- **Then** `timeout` is `REQUEST_TIMEOUT_MS`, which is 20 000

#### A request that does not answer in time fails (rules 1, 3)
- **Given** a client whose adapter never answers, and a timeout shortened to 50 ms for the test
- **When** a GET is made
- **Then** it rejects with code `ECONNABORTED` and no `response`

#### Only the import's long writes override it (rule 2)
- **Given** the sources of `packages/api/src`, `apps/web/src` and `apps/mobile`
- **When** they are searched for `timeout:` in request options
- **Then** the only overrides are the import confirm and revert, each passing
  `LONG_REQUEST_TIMEOUT_MS`

#### A stalled screen ends in its error state (rules 1, 3; iOS, flow 311)
- **Given** a coach on the Players tab, with the E2E backend holding
  `GET /api/app/coach_players_paginated` unanswered
- **When** they pull to refresh
- **Then** within 50 s the spinner is gone and the "Couldn't refresh" toast is shown

### Notes
- Web and iOS: the timeout is shared code; both apps get it in PAD-786 (R-024).
- Rule 3's bound is why `client.pull-to-refresh` bounds its spinner at 2 × 20 s + 5 s.
- OPEN: none.
