---
path: backend/padel_app/tests/test_default_coach_levels.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 45
size_tokens: 438
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "535a2c82aeb313f708146a2f4302794b9dbc467af357972555c94333c9022171"
---

## Purpose

Pins that a newly created coach gets three default levels (L1/L2/L3,
labels "Level 1"/"Level 2"/"Level 3", `display_order` 1/2/3) — both
through the full `create_coach_service` path and directly via
`create_default_levels_for_coach`. Also pins that
`create_default_levels_for_coach` is idempotent: calling it twice against
the same coach does not create duplicate levels (still exactly 3, codes
L1/L2/L3).

## Connections

- Uses: `padel_app.services.coach_service` (`create_coach_service`,
  `create_default_levels_for_coach`); models `User`, `Coach`,
  `CoachLevel`.
- Used by: (none — leaf test file)
- Semantically related (not imports): `CoachLevel` rows created here are
  the same entity exercised by `test_level_ladder_ordering.py`
  (`display_order` normalization) and `test_effective_level_resolution.py`
  (level-based eligibility rules), though those files build their own
  levels directly rather than through the default-seeding path this file
  covers.
