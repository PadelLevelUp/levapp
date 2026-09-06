---
id: B-019
title: "Deleting a one-off calendar event was a no-op: axios sent no body, Flask answered 415"
type: layer-drift
severity: high
status: resolved
affects:
  - calendar.event-detail
  - frontend/packages/api/src/resources/calendar.ts
  - frontend/apps/mobile/src/features/calendar/hooks.ts
  - frontend/apps/web/src/components/calendar/EventDetailSheet.tsx
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "deleteCalendarBlock always sends a JSON body (`options ?? {}` with an explicit Content-Type); the Flask handler reads the body with get_json(silent=True) so a bodyless DELETE is still honoured."
opened: 2026-09-06T00:00:00Z
resolved: 2026-09-06T00:00:00Z
---

# B-019 — a bodyless DELETE hit Flask's 415 and the event survived

Found by the iOS simulator pass on `batch/wave-1-2` (PAD-160, item F): deleting a
**non-recurring** calendar event showed "Falha ao eliminar o evento", the detail screen
stayed open, and the row was still in `calendar_blocks`. Reproduced three times,
including inside Maestro flow `21-event-detail`, which cannot go green without this fix.

The two layers each did something reasonable and the seam between them leaked:

- `deleteCalendarBlock(blockId, options?)` passed `{ data: options }`. For a one-off there
  is no `occDate` and no `scope`, so `options` was `undefined` — and axios, given
  `data: undefined`, sends **no body and strips `Content-Type`** entirely.
- The Flask handler read `request.get_json() or {}`. `get_json()` **raises 415** on a
  request whose content type is not JSON; the `or {}` never ran.

Proven live against the running API during the simulator pass:

```
DELETE /api/app/calendar_block/4  (no body)                                    → 415, row NOT deleted
DELETE /api/app/calendar_block/1  -H 'Content-Type: application/json' -d '{}'  → 204, row deleted
```

The recurring path was never affected because it always sends `{occDate, scope}` — which is
why the bug survived review and the E2E suite: every automated delete in the tree carried a
body. **Web shares the same `deleteCalendarBlock`**, so `EventDetailSheet`'s one-off delete
was broken in the browser too; nothing covered it.

**Resolved 2026-09-06 (PAD-160 fix-forward):** the client sends `options ?? {}` with an
explicit `Content-Type: application/json`, and the handler uses `get_json(silent=True)` —
belt and braces, because an already-installed iOS build cannot be patched retroactively.
Pinned by `packages/api/src/resources/calendar.test.ts` (the one-off call must carry `{}`)
and `backend/padel_app/tests/test_pad160_bodyless_calendar_block_delete.py` (a bodyless
DELETE returns 204 and removes the row).

**The lesson worth keeping:** `axios.delete(url, { data: x })` with `x === undefined` is not
"a DELETE with an empty body", it is a DELETE with no content type at all. Any handler on the
other side that calls `request.get_json()` without `silent=True` will 415 it.

*Found by the iOS simulator device-verification pass on `origin/batch/wave-1-2`, 2026-09-06.*
