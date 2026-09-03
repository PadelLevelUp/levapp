---
path: frontend/apps/web/e2e/settings/season-upsert-safety.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 214
size_tokens: 1859
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e3e92012aaea5be75443a454aff1763910050430a36db91a1be76eb730a865b5"
---

## Purpose

PAD-89: `upsert_seasons` used to delete every persisted season absent from the
incoming payload, and the DB-aware `validate_no_overlap` validator was never
wired into the write path. Pins the "explicit deletes only" contract:
`POST /app/add_seasons` is a pure upsert (an omitted season is preserved,
never deleted); an omitted-but-persisted season is still validated against (a
new payload entry overlapping it gets 400 "Overlapping seasons are not
allowed"); removal only happens through `POST /app/delete/season`; and the web
client sends `id` for already-persisted rows so they update in place. Uses
`page.route`/`route.continue({ postData })` to simulate a client that posts
only a partial season set, proving the omitted one survives. Uses far-future
2027 dates deliberately, so it can't collide with
`season-recurrence.spec.ts`'s today..today+3-months season, and cleans up
every "PAD-89"-named season it creates in `afterEach` by testid (not ancestor
DOM traversal, which broke silently once before).

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): same `/app/add_seasons` endpoint and
SeasonsSection UI as `season-recurrence.spec.ts` and `seasons-i18n.spec.ts`;
the backend `upsert_seasons`/`validate_no_overlap` functions this spec pins.
