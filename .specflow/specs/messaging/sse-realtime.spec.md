---
id: messaging.sse-realtime
status: implemented
depends_on: [messaging.messages]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.sse-realtime


### Intent
Deliver real-time message updates to connected clients via Server-Sent Events.

### Rules
1. `GET /api/app/events` (JWT via query string) opens an SSE stream
2. In-memory pub/sub: `subscribe(user_id)`, `unsubscribe(user_id, q)`, `publish(event, user_ids)`
3. Events published: `message_created`, `message_edited`, `message_deleted`, `message_reaction`,
   plus the notification-engine events `notification_responded` and `notify_sent`
4. Each event is JSON with `{type, payload}`
5. Frontend `EventSource` consumes the stream and updates UI optimistically
6. On disconnect, client queue is cleaned up
7. A subscription is **keyed by the authenticated user id taken from the JWT** — the
   `/events` route registers its queue under `get_jwt_identity()`, never anonymously.
   One user may hold several queues (several tabs, web + phone); all of them receive
   that user's events
8. **Every published event names its recipient user ids** and is delivered only to
   their queues. For a message-shaped event the recipients are the participants of
   that message's conversation; for a notification-engine event they are the coach
   and the player the event is about. `user_ids` is a **required** argument of
   `publish()` — calling `publish(event)` raises `TypeError` rather than falling back
   to a broadcast (B-004)
9. A client never receives an event for a conversation it is not a participant of.
10. **Single worker until a broker exists (PAD-237, audit M19).** The registry in
    `padel_app/realtime.py` is per-process and in-memory, so production runs **one** gunicorn
    worker (`backend/Dockerfile`, `--workers 1 --threads 64`); a second worker would hold its
    own registry and never see the first's connections, and events would reach only the
    clients that happen to be attached to the publishing process. Scaling out means a shared
    broker (Redis pub/sub) first. Compass rule R-027 guards the Dockerfile and the deploy
    workflows; the decision is recorded in the atlas.
   Client-side filtering by conversation id is a rendering convenience, never the
   privacy boundary
11. **Server-wide stream cap** (PAD-277, audit M19). Production runs one gunicorn worker with
    64 threads, and every open stream holds one thread for its whole life. At most
    `SSE_MAX_STREAMS` streams are open at once (env, default **40**), which leaves 24 threads for
    ordinary API requests. The value comes from `sse_stream_limits()` in `padel_app/config.py`; a
    missing, non-numeric or non-positive value falls back to the default
12. **Per-user stream cap**: at most `SSE_MAX_STREAMS_PER_USER` streams per user (env, default
    **4**: a phone plus a few tabs, each sharing one connection per rule 15). A new stream over
    it **evicts that user's oldest stream**, never the new one. The server puts a stop marker in
    the oldest stream's queue, which ends it at once (an `: evicted` comment, then end of stream)
    and frees its slot and its thread. The newest connection is almost always the live one (a
    reloaded or new tab); the oldest is most likely one whose client is already gone but not yet
    noticed (rule 13). A user with more than four genuinely live tabs therefore sees them take
    turns: each evicted tab reconnects with back-off (rule 16) and evicts the next oldest
13. **Over the server-wide cap the request is refused at once**: `503` with `Retry-After: 10`
    and `{"error": "SSE_CAPACITY", "scope": "total"}`, logged as a warning. A user already at their
    own cap is never refused: their oldest stream makes room (rule 12), so a reload always gets
    through. The cap is checked, any eviction made and the slot registered in the request, before
    any byte is streamed, under one registry lock (`realtime.try_subscribe`), so two requests can
    never both take the last slot. The slot is released by the response's close hook as well as
    by the stream's own cleanup, so a client that hangs up before the first byte cannot leak it.
    A client that vanishes without closing (a killed tab, a dropped network) is only noticed when
    a keep-alive write fails, so its slot stays taken for up to about two keep-alive intervals
14. **The stream's first chunk is sent immediately**: `retry: 10000` plus a `: connected` comment.
    It flushes the headers (before PAD-277 nothing was written until the first 15-second
    keep-alive) and gives any plain EventSource a 10-second reconnection delay. After it, while no
    event arrives, the stream writes `: keep-alive` every `SSE_KEEPALIVE_SECONDS` (env, default
    **5**; it was a fixed 15 s), which is how a vanished client is noticed
15. **One connection per web tab and per iOS app.** Clients never open their own EventSource:
    web components call `subscribeAppEvents(token, listener)` (`apps/web/src/api/events.ts`) and
    iOS screens call `useAppEvents` (`apps/mobile/src/lib/sse.ts`). Both sit on `createSseHub`
    from `@levelup/api`, which owns one source, fans each event out to every listener, and closes
    the source when the last listener leaves
16. **Reconnection belongs to the hub.** On any error it closes the source and retries after
    `sseRetryDelay(attempt)`: a ceiling doubling from 1 s to 30 s, with the delay drawn from its
    upper half (equal jitter). A successful open resets the back-off; nothing reconnects once no
    listener is left; iOS also reconnects at once, back-off reset, on a background→active
    transition. A browser EventSource gives up for good on a non-200 answer such as rule 13's
    503, which is why the hub, not the EventSource, owns retries
17. **Retries, ignored payloads and failing listeners are logged at debug level only**
    (`console.debug` by default), never `console.log`, `warn` or `error`. A listener that throws
    never stops the others from receiving the event

### Acceptance Criteria

#### An event reaches only its named recipients
- **Given** users A, B and C are each connected to `/api/app/events`
- **And** a conversation whose participants are A and C
- **When** A sends a message in that conversation
- **Then** A's and C's queues receive the `message_created` event
- **And** B's queue receives nothing

#### A publish with no recipients is a programming error
- **Given** any event dict
- **When** `publish(event)` is called without `user_ids`
- **Then** it raises `TypeError` — the pre-B-004 broadcast behaviour is unreachable

#### Every queue of the same user is served
- **Given** user A has two open SSE connections
- **When** an event addressed to A is published
- **Then** both of A's queues receive it

#### A stream over the server-wide cap is refused at once
- **Given** `SSE_MAX_STREAMS = 2` and two users with an open stream each
- **When** a third user opens `/api/app/events`
- **Then** the answer is `503`, `Retry-After: 10`, body `{"error": "SSE_CAPACITY", "scope": "total"}`
- **And** exactly two streams stay registered

#### Over the per-user cap the oldest stream is evicted and the newest survives
- **Given** `SSE_MAX_STREAMS_PER_USER = 2` and user A with two open streams
- **When** A opens a third
- **Then** the third gets `200`, A still has exactly two registered streams, and the first one ends at once
- **And** an event addressed to A reaches the third stream, and user B's stream is untouched

#### A user at their cap can reconnect even when the server is full
- **Given** `SSE_MAX_STREAMS = 2`, `SSE_MAX_STREAMS_PER_USER = 1`, and users A and B with one stream each
- **When** A opens a new stream and user C tries to open one
- **Then** A's new stream gets `200` (A's old one is evicted) and C's gets `503` with `"scope": "total"`

#### The caps default to 40 and 4, the keep-alive to 5 s
- **Given** no `SSE_*` variables
- **When** one user opens five streams and 35 other users open one each, then two more users try
- **Then** all five of the first user's streams get `200` and that user keeps four (the first is evicted); the 40th stream gets `200` and the 41st `503`
- **And** `sse_stream_limits({"SSE_MAX_STREAMS": "0", "SSE_MAX_STREAMS_PER_USER": "nope"})` is `(40, 4)` and `sse_keepalive_seconds({})` is `5`

#### The keep-alive interval is configurable
- **Given** `SSE_KEEPALIVE_SECONDS = 1`
- **When** a stream is open and no event arrives
- **Then** a `: keep-alive` comment follows the first chunk within 2 s

#### A stream answers at once
- **Given** a signed-in client
- **When** it opens `/api/app/events`
- **Then** within 2 s its first chunk arrives and begins with `retry: `

#### A slot is released even if the stream never started
- **Given** `SSE_MAX_STREAMS = 1`
- **When** a stream is opened and closed before its first byte
- **Then** another user can open a stream

#### One connection serves the whole tab or app
- **Given** two listeners on the same hub (web: AppLayout and MessagesPage; iOS: the tabs layout and a conversation screen)
- **When** an event arrives
- **Then** exactly one source is open and both listeners receive the event
- **And** when the last listener leaves, the source is closed

#### Reconnection backs off with jitter
- **Given** a hub whose stream errors three times in a row, with the jitter source returning 0
- **When** it retries
- **Then** it waits 500 ms, 1 s and 2 s; after a successful open the next error waits 500 ms again
- **And** no delay ever exceeds 30 s

#### Under load the API stays responsive
- **Given** gunicorn with the production flags (1 worker, 64 threads) and 70 clients opening streams
- **When** they are all connected
- **Then** 40 streams are accepted, the other 30 get `503` at once, and an ordinary request still answers within 2 s
- **And** this is measured with `backend/scripts/sse_load_test.py`; the baseline and the result are recorded in the 2026-08-25 single-VM decision

### Notes
- In-memory only — does not persist across server restarts
- **gevent was evaluated and rejected** (PAD-277, 2026-09-10). An async worker would lift the
  thread ceiling but monkey-patches the whole process. APScheduler's `BackgroundScheduler` would
  have to become a `GeventScheduler`; psycopg2 blocks every greenlet unless psycogreen is added;
  the synchronous Expo push and `requests` calls block the loop; pandas and openai under gevent
  are untested; and gevent has no wheel for the local Python, so it could not be exercised locally
  the way production would run it. The way out of the thread ceiling is still the one the
  2026-08-25 single-VM decision names: Redis pub/sub or a dedicated async SSE service, when a
  second worker or VM is needed. Do not reopen gevent without that context
- Single-server architecture (no Redis pub/sub for horizontal scaling). The registry is
  a per-process `dict[int, list[Queue]]`, which is why production runs one gunicorn
  worker: a second worker would hold its own registry and miss the fan-out
- Passing `user_ids=[]` delivers to nobody; that is a legitimate outcome (e.g. a
  conversation whose only participant was deleted), not a reason to broadcast
