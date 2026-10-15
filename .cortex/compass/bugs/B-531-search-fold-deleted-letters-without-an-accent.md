---
id: B-531
title: "Player search deleted letters NFD cannot take apart — 'Łukasz Ørsted Weiß' folded to 'ukasz rsted wei', so 'lukasz' never found him"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-14T20:30:00Z
affects:
  - .specflow/specs/players/search.spec.md
  - backend/padel_app/services/player_service.py
  - frontend/packages/config/src/name-search.ts
proposed_fix: "Map ł ø ß đ æ œ ı before folding, NFKD minus combining marks, keep every Unicode letter and digit (\\p{L}\\p{N} / isalnum) instead of [a-zA-Z0-9]; the same table in both twins, pinned by name-search.cases.json."
opened: 2026-10-14T20:10:00Z
---

# B-531: the search fold deleted letters without a decomposable accent

**Source:** PAD-665 inventory (la-1410-SessionB, 2026-10-14); its own id at the orchestrator's ask.

**What happens:** PAD-516's fold (`normalizeSearchText` / `normalize_search_text`) decomposed with
NFD, dropped combining marks, then kept only `[a-zA-Z0-9\s]`. Letters NFD does not take apart
(ł, ø, ß, đ, æ, œ) and every non-Latin letter were deleted outright, so a player named
"Łukasz Ørsted Weiß" was stored in the comparison as "ukasz rsted wei" and "lukasz", "orsted" or
"weiss" found nothing; "Đorđe" became "ore".

**Evidence (Phase 1):** origin/staging 81da65783's `normalize_search_text` run on the inputs:
`'Łukasz Ørsted Weiß' -> 'ukasz rsted wei'`, `'Đorđe' -> 'ore'`.

**Fix:** `players.search` rule 2 — a shared special-letter table, lower-case, NFKD minus marks,
keep Unicode letters and digits. Green: the fold and rank cases for Łukasz/Ørsted/Weiß/Đorđe in
`name-search.cases.json`, run by `name-search.test.ts` and `test_name_search_cases.py`.
