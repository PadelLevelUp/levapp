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
2. Pub/sub: `subscribe(user_id)`, `unsubscribe(user_id, q)`, `publish(event, user_ids)`. The
   registry of open streams is per-process and in memory; what carries an event between
   processes is the broker chosen by `SSE_BROKER` (rule 20): `memory` (one process only) or
   `postgres` (LISTEN/NOTIFY, any number of processes)
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
10. **More than one process needs the Postgres broker (PAD-692; was PAD-237's "single worker
    until a broker exists").** Each process keeps its own registry, so with `SSE_BROKER=memory`
    an event reaches only the clients attached to the publishing process; production therefore
    runs **one** gunicorn worker (`backend/Dockerfile`, `--workers 1`) for as long as any
    environment runs `memory`. With `SSE_BROKER=postgres` every stream-holding process receives
    every event (rules 20-24). `--workers 1` stays until PAD-704 proves two copies; APScheduler's
    one-process constraint is separate (PAD-695). Compass rule R-027 guards this.
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
18. **A `message_edited` payload is the whole serialised message, and a client merges what can
    change (PAD-563, ledger B-402).** The server publishes `serialize_message(msg, None)` for a
    text edit and for every metadata edit — a retired invitation (`notifications.invitations`
    rule 15), a withdrawn one (rule 19), a superseded reminder (`notifications.reminders` rule 9),
    an answer the coach recorded (`notifications.invitations` rule 9). The open conversation on
    each shell merges `content`, `edited` (as sent; a metadata-only edit is not "edited") and
    `metadata` into the cached message, and never `isRead` or `status`, which the viewer-less
    payload does not know. Both shells merged only `content` and forced `edited: true` before
    this rule, so no bubble changed live until a refetch.
19. **A sent message shows once, whichever answer lands first (PAD-647).** The sender's own
    `message_created` echo can arrive before the POST that created it answers. The echo is
    appended under the saved id; when the POST then answers, a saved id already in the thread
    drops the optimistic row instead of replacing it. Both shells settle the send through one
    shared helper, `reconcileSentMessage` in `@levelup/hooks`. Before this rule only iOS checked;
    web replaced the optimistic row with the saved message and showed it twice.

19. **(PAD-616, B-546; rule number unconfirmed) A re-open resyncs what is live.** An event the
    server published while a client's stream was down (a network blip, an app back from the
    background, a deploy overlapping two API containers) never arrives. So when the hub's stream
    opens after its first open, the hub delivers a local `{ type: "resync" }` to every listener
    (`RESYNC_EVENT`, `@levelup/api`) — never on the first open, and at most once per
    `SSE_RESYNC_MIN_INTERVAL_MS` (5 s): re-opens inside that window fold into one trailing resync,
    so a flapping connection cannot set off a refetch storm. `close()` forgets the stream, and so
    does the last listener leaving: the next listener's connection is a fresh first open, not a
    re-open (web pages each render their own layout, so navigating can pass through zero listeners
    — a resync there would refetch what `client.query-cache` rule 2 serves from cache). Both
    shells' app-level handlers (web `AppLayout`, iOS tabs layout) answer it first with the shared
    `answerResync` → `resyncLiveData` (`@levelup/hooks`): the unread count, the conversation list,
    the request lists and what refreshes with them (calendar, class sheets, dashboard), the
    pending-validation badge and the academy classes are invalidated — React Query refetches the
    ones on screen and marks the rest stale (`client.query-cache` rule 4). **The open thread**
    (web `MessagesPage`, iOS conversation screen) re-reads its newest page and folds it in with
    the shared `mergeNewestPage` — missed messages appended, changed ones (edited, deleted,
    reacted) replaced, older pages and pending sends kept; never an invalidation of the thread's
    entry, which would drop the loaded older pages — and, when someone else's message was missed,
    marks the thread read and flags "new below" as an arrival would.

20. **(PAD-692; rule number unconfirmed) Broker switch.** `SSE_BROKER` is `memory` (default) or
    `postgres`; anything else is `memory`. On a database that is not Postgres (the SQLite unit lane)
    `postgres` falls back to `memory` with one WARNING at startup. `publish()` keeps its signature,
    its required `user_ids` (rule 8) and its view-as suppression in both modes.
21. **(PAD-692; unconfirmed) A publish reaches the broker only after the publisher's data is
    committed.** Publishers call `publish()` after their own commit (or from `on_commit`). With
    `postgres`, `publish()` writes on its **own** short transaction, never on the request's session
    (a NOTIFY there would be rolled back by the request teardown): one `realtime_events` row
    (`user_ids`, and `body` = the event exactly as the stream writes it) and
    `pg_notify('levapp_events', '<row id>')`, both committed together. Inside a `unit_of_work`
    block, where `create()`/`save()` only flush, `publish()` defers itself to `on_commit`. The
    publish uses its own small connection pool with a 2 s checkout timeout; a publish that cannot
    get a connection, or fails, is logged and dropped. A live event never fails or stalls the request.
22. **(PAD-692; unconfirmed) The NOTIFY carries an id, never a body.** NOTIFY payloads are limited
    to 8,000 bytes and a message body has no length limit, so the body lives in the row and the
    listener reads it. What a client receives is byte-for-byte what `memory` delivers: the client
    contract (rules 4, 18, 19) is the same in both modes.
23. **(PAD-692; unconfirmed) One listener per process.** The first stream a process accepts starts
    one listener thread on a **dedicated** database connection outside the SQLAlchemy pool
    (`application_name=levapp-realtime-listener`), which runs `LISTEN levapp_events`. It must never
    go through a transaction-mode connection pooler (PgBouncer transaction mode breaks LISTEN).
    Notified ids are kept in arrival order, which is commit order. The rows are read in one query
    and delivered to the local registry in that order, with the same scoping as rule 8. The
    process's own publishes come back the same way. Processes that never accept a stream (CLI,
    migrations, a worker) never start a listener.
24. **(PAD-692; unconfirmed) NOTIFY is not durable; a gap ends in a resync.** If the listener's
    connection drops, the listener reconnects with back-off (1 s doubling to 30 s, jittered), runs
    `LISTEN` again, and then puts `{"type": "resync"}` into **every** open local stream. The
    same holds for the **first** LISTEN of a process: the stream that started the listener was
    open before LISTEN returned, so it gets a resync too. A failing prune is logged and never
    treated as a lost connection. Clients
    answer it exactly as they answer their own re-open (rule 19, PAD-616), so a stream that stayed
    open across the server's gap still catches up. Nothing is replayed from the table. A process
    that was down holds no streams; its clients reconnect and resync by rule 19. The listener also
    deletes `realtime_events` rows older than `REALTIME_EVENTS_RETENTION_MINUTES` (default 10) once
    a minute. `realtime.broker_status()` reports `{broker, listening, since}`; it is not part of
    readiness while the API and the streams share a process (a LISTEN outage degrades live updates,
    it does not make the API unready).

25. **(PAD-689; rule number unconfirmed) The cap is observable.** Every process that holds streams
    logs one INFO line every 60 s, in both broker modes:
    `SSE streams: open=<n> max_per_user=<n> cap=<n> push_queue=<depth>/<max> pushes_dropped=<n>`
    (`realtime.stats_line()`; the first stream starts the logger, like the listener). The texts an
    alert matches are frozen: `SSE stream refused: scope=%s user=%s open_streams=%s` (rule 13) and
    the push sender's `push sender: queue full (%d), dropping oldest: %s` and `push sender: provider
    unresponsive, dropping %s until the pause ends`. gunicorn's thread count is `GUNICORN_THREADS`
    (default 64), so the stream cap (rule 11) and the threads are raised together by an env change.
    An alert on these lines needs the container logs in Cloud Logging (a logging driver or agent);
    the VM's json-file logs alone reach no alert.

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

#### A metadata edit reaches the open conversation live (rule 18, PAD-563)
- **Given** a conversation open on web or iOS with an invitation message showing Yes/No
- **When** a `message_edited` arrives whose payload carries `metadata.responded: true`, `metadata.answeredBy: "coach"` and `edited: false`
- **Then** the cached message's `metadata` is replaced by the payload's, its `content` and `edited` follow the payload, and its `isRead` and `status` are untouched
- **And** the bubble re-renders without a reload

#### The echo that beats the POST leaves one bubble (rule 19, PAD-647)
- **Given** a coach on web with a conversation open, whose send POST is held until the `message_created` echo has rendered
- **When** the POST answers with the same saved message
- **Then** the thread shows the message exactly once
- **And** when the POST answers first, the optimistic row becomes the saved message with status `sent` and the echo only marks it `delivered`

#### Under load the API stays responsive
- **Given** gunicorn with the production flags (1 worker, 64 threads) and 70 clients opening streams
- **When** they are all connected
- **Then** 40 streams are accepted, the other 30 get `503` at once, and an ordinary request still answers within 2 s
- **And** this is measured with `backend/scripts/sse_load_test.py`; the baseline and the result are recorded in the 2026-08-25 single-VM decision

#### A re-open resyncs, the first open does not (rule 19, PAD-616)
- **Given** a client whose stream opened, then dropped
- **When** the hub's retry opens it again
- **Then** every listener receives one `resync`; the first open delivered none

#### A flapping stream does not storm (rule 19)
- **Given** a stream that re-opens at 10 s, 11 s and 12 s
- **When** the hub handles the three opens
- **Then** listeners receive one `resync` at 10 s and one trailing `resync` at 15 s, no more

#### The open thread shows a message missed while the stream was down (rule 19)
- **Given** a coach with their conversation with E2E Student open, whose stream drops
- **When** E2E Student sends a message while the stream is down, and the stream re-opens
- **Then** the message appears in the open thread without navigation, the older messages stay,
  and the thread is marked read

#### The screen catches up after a drop (rule 19)
- **Given** a coach on the dashboard with 0 unread messages, whose stream drops
- **When** a student sends them a message while the stream is down, and the stream re-opens
- **Then** the unread badge shows 1 without navigation or a reload

#### An event published in one process reaches a stream held by another (rules 21-23, PAD-692)
- **Given** two app processes A and B on one Postgres, both `SSE_BROKER=postgres`, and user U with an open stream on B whose listener reports LISTEN ready
- **When** process A publishes `{"type": "message_created", ...}` to `[U]`
- **Then** U's stream on B receives it within 1 s, byte-identical to what A would have written to a local stream
- **And** with `SSE_BROKER=memory` on both, U's stream on B receives nothing (the 2×2 arm)

#### A body over 8 KB crosses processes (rule 22)
- **Given** the two processes of the previous criterion
- **When** A publishes a `message_created` whose `content` is 20,000 characters
- **Then** U's stream on B receives the whole body

#### Cross-process delivery keeps recipient scoping (rules 8, 23)
- **Given** users U and V each with an open stream on B
- **When** A publishes an event to `[U]`
- **Then** U's stream receives it and V's stream receives nothing

#### A listener drop ends in a resync (rule 24)
- **Given** U's stream open on B and B's listener connected
- **When** B's listener connection is terminated (`pg_terminate_backend`)
- **Then** U's still-open stream receives `{"type": "resync"}` after the listener reconnects
- **And** an event published on A after that reconnect reaches U's stream

#### A publish inside a unit of work waits for the commit (rule 21)
- **Given** `SSE_BROKER=postgres` and an open `unit_of_work` block
- **When** a service creates a message and publishes inside the block
- **Then** no `realtime_events` row and no notify exist before the block commits, and both exist after it
- **And** a block that rolls back publishes nothing

#### A publish never stalls the request (rule 21)
- **Given** the publish pool is exhausted
- **When** a request publishes
- **Then** `publish()` returns within 2 s, logs the drop, and the request answers normally

#### Old event rows are pruned (rule 24)
- **Given** `realtime_events` rows 11 and 5 minutes old and `REALTIME_EVENTS_RETENTION_MINUTES=10`
- **When** the listener's prune runs
- **Then** only the 5-minute-old row remains

#### Without Postgres the broker falls back to memory (rule 20)
- **Given** `SSE_BROKER=postgres` on the SQLite test database
- **When** the app starts and an event is published to a local stream
- **Then** one WARNING names the fallback and the local stream receives the event as with `memory`

#### A stream open before the first LISTEN is told to resync (rule 24)
- **Given** `SSE_BROKER=postgres` and a process with no listener yet
- **When** a user's stream starts the listener, and an event is published before its LISTEN returns
- **Then** that stream receives `{"type": "resync"}` once the listener is listening

#### A failing prune is not a lost connection (rule 24)
- **Given** a listening listener whose prune statement fails
- **When** the prune runs
- **Then** a WARNING is logged, the listener stays listening, and no stream receives a resync

#### The stats line names streams, the busiest user, the cap and the push queue (rule 25)
- **Given** `SSE_MAX_STREAMS = 40` and three open streams, two of them user 1's
- **When** the stats line is built
- **Then** it reads `SSE streams: open=3 max_per_user=2 cap=40 push_queue=0/<PUSH_QUEUE_MAX> pushes_dropped=<n>`

#### The stats line is logged every interval in either broker mode (rule 25)
- **Given** `SSE_BROKER=memory` and an open stream
- **When** two intervals pass
- **Then** two `SSE streams: ` lines are logged, and one monitor thread runs per process

#### gunicorn takes its threads from the environment (rule 25)
- **Given** the image's CMD
- **When** `GUNICORN_THREADS` is unset, and when it is `160`
- **Then** gunicorn starts with `--workers 1` and `--threads 64`, and `--threads 160`

### Notes
- The registry is in memory and nothing persists across restarts; with `postgres`, event rows live
  only `REALTIME_EVENTS_RETENTION_MINUTES` and are never replayed (rule 24)
- **gevent was evaluated and rejected for the API process** (PAD-277, 2026-09-10); since PAD-697
  (2026-10-22) the separate events process runs under it (`delivery.events-role`), where none of the
  reasons below apply: no scheduler, no push sender, psycogreen for psycopg2, and wheels now exist. The
  original reasoning, for the API: an async worker would lift the
  thread ceiling but monkey-patches the whole process. APScheduler's `BackgroundScheduler` would
  have to become a `GeventScheduler`; psycopg2 blocks every greenlet unless psycogreen is added;
  the synchronous Expo push and `requests` calls block the loop; pandas and openai under gevent
  are untested; and gevent has no wheel for the local Python, so it could not be exercised locally
  the way production would run it. The way out of the thread ceiling is still the one the
  2026-08-25 single-VM decision names: Redis pub/sub or a dedicated async SSE service, when a
  second worker or VM is needed. Do not reopen gevent without that context
- The broker is Postgres LISTEN/NOTIFY, not Redis (owner decision 2026-10-21, supersedes the
  2026-09-09 Redis choice; PAD-692). The registry is still a per-process `dict[int, list[Queue]]`;
  rule 10 says when one process is required
- Passing `user_ids=[]` delivers to nobody; that is a legitimate outcome (e.g. a
  conversation whose only participant was deleted), not a reason to broadcast
