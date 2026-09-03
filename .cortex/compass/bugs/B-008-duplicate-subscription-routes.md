---
id: B-008
title: "Two byte-identical push-subscription routes in notifications_api.py"
type: layer-drift
severity: low
status: open
affects:
  - backend/padel_app/modules/notifications_api.py
proposed_fix: "Collapse to one route, keep the other path as an alias only if a shipped client still calls it (check the iOS binary and sw.js)."
opened: 2026-09-03T14:30:00Z
---

# B-008 — Two byte-identical push-subscription routes in notifications_api.py

`subscribe_notifications` (POST /subscribe) and `save_subscription` (POST /save-subscription) are byte-for-byte duplicate implementations. One of them is the surviving contract; the other is drift.

*Surfaced by the initial Cortex insight extraction (backend-api scope, 2026-09-03). Not yet re-verified by a human.*
