---
path: frontend/apps/web/e2e/settings/ticket-pad-109-standing-waitlist-search.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 80
size_tokens: 944
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7540175738b96284d20de1106174d356b23cec32609810ef275756b8b88561b3"
---

## Purpose

PAD-109: Settings > Notifications > Standing waiting list offers a type-ahead
search so the coach can add a student to the standing ("permanent") waiting
list. It called `GET /api/app/notify/player_search`, a route that did not
exist on the backend; the resulting 404 was swallowed by
`catch { setResults([]) }`, so the search box looked inert rather than erroring.
Asserts the search filters to matching players only (not non-matching roster
members), and that a searched student can be added to the standing list —
the entry's presence proves the search returned a `Player.id` (what the add
endpoint expects), not a `User.id`. Cleans up the added waiting-list entry at
the end.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): the Standing Waiting List section inside
the Notifications tab, sibling to the Auto-Invite Engine card covered by
`notification-engine-settings.spec.ts`; spec: notifications.waiting-list
(rules 6-9). Uses seeded "Filler Player 21"/"Filler Player 22" (from
`scripts/seed.py`), chosen because no other spec references them.
