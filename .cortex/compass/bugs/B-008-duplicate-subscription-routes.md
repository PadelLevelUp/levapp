---
id: B-008
title: "Two byte-identical push-subscription routes in notifications_api.py"
type: layer-drift
severity: low
status: resolved
affects:
  - backend/padel_app/modules/notifications_api.py
proposed_fix: "Collapse to one route, keep the other path as an alias only if a shipped client still calls it (check the iOS binary and sw.js)."
opened: 2026-09-03T14:30:00Z
fixed: 2026-09-06T00:00:00Z
fixed_by: PAD-173
---

# B-008 — Two byte-identical push-subscription routes in notifications_api.py

`subscribe_notifications` (POST /subscribe) and `save_subscription` (POST /save-subscription) are byte-for-byte duplicate implementations. One of them is the surviving contract; the other is drift.

*Surfaced by the initial Cortex insight extraction (backend-api scope, 2026-09-03). Not yet re-verified by a human.*

## Resolution (PAD-173, 2026-09-06)

Collapsed to one route by deleting `subscribe_notifications` (POST `/subscribe`).

The survivor is `/save-subscription`, **not** the better-named `/subscribe` — inverting what the ledger entry's wording implied. `/save-subscription` is the only path any client has ever called (`frontend/apps/web/src/utils/pushNotifications.ts`; `git log -S` confirms the web app never called `/subscribe`), so keeping `/subscribe` instead would have broken push registration for every already-cached web bundle and service worker. No alias was kept: no shipped client calls the removed path. Native iOS is unaffected — it uses `/api/notifications/device`.

Also corrected `auth.push-subscription` rules 2/3, which specced `POST`/`DELETE /api/auth/push_subscription` — a path that existed nowhere in the backend.
