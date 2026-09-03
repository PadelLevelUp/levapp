---
path: backend/padel_app/tests/test_side_matching.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 85
size_tokens: 748
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0b34d1a3666f84c24d24d88032d8f5ad3266e5b8ac45e1b43a156679d1c2b56f"
---

## Purpose

PAD-15 pure-function unit tests (no DB, no `app` fixture) for the court-side ("left"/"right"/"both") matching helpers in `notification_service`: `_side_eligible(player_side, vacancy_side)` and `_side_preference_rank(player_side, vacancy_side)`. `TestSideEligible` pins the compatibility matrix — exact match eligible, strict left/right mismatch ineligible, a `"both"` player eligible for any specific vacancy side, a specific-side player eligible for a `"both"` vacancy, `None` vacancy side accepts everyone, but a player with no recorded side (`None`) is ineligible for ANY side-constrained vacancy (left/right/both) — only a `None` vacancy accepts them. `TestSidePreferenceRank` pins the tiebreaker ordering the invitation engine uses to prefer exact-side matches: exact match ranks 0 (first), a `"both"` player/vacancy fallback ranks 1 (after exact, before wrong-side), and a `None` vacancy side is neutral (rank 0 regardless of player side).

## Connections

- Uses: `padel_app.services.notification_service` (`_side_eligible`, `_side_preference_rank`).
- Used by: —
- Semantically related (not imports): `test_pad128_eligibility.py::test_side_never_affects_eligibility` (pins the complementary invariant that `side` is a WAVE-matching criterion these helpers implement, never a bar/eligibility criterion).
