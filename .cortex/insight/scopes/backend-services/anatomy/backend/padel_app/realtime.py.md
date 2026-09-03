---
path: backend/padel_app/realtime.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 23
size_tokens: 97
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "88e396e0f66aa5215137ede5717d9320c6bea1f52d0a4edbe8a5ad5ee17b6dc9"
---

## Purpose

Minimal in-memory SSE fan-out hub. Holds a module-level list of
`queue.Queue` subscribers; `subscribe()` creates and registers a new
queue (one per open SSE connection), `unsubscribe()` removes it, and
`publish(event)` pushes an event dict to every currently-subscribed
queue with `put_nowait` (swallowing any per-queue failure so one dead
subscriber never blocks the others).

## Connections

- Uses: stdlib `queue` only.
- Used by: `messaging_service.py` (`publish` — message
  created/edited/deleted/reaction events), `notification_service.py`
  (`publish` — vacancy/invitation events), `replacement_approval_service.py`
  (`publish` — approval bundle messages).

## Insights

- The subscriber list (`_subscribers`) is process-global, in-memory
  state — not per-user, not shared across processes. Every `publish()`
  call broadcasts to every open SSE connection on this worker process
  regardless of which user it belongs to; per-user filtering must happen
  client-side or in the SSE route (outside this module). This is also
  why the app runs a single gunicorn worker in production — a
  multi-worker deployment would fragment subscribers across processes
  and events would only reach whichever worker's queue list happened to
  hold the connection.
