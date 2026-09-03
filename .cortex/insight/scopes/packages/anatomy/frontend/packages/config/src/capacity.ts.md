---
path: frontend/packages/config/src/capacity.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 34
size_tokens: 315
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "53615dc956da7af7c73f1e1d5fba84cd06315b6967c141626bd940a2744445fd"
---

## Purpose

`effectiveFilledSpots` (PAD-71) — the single client-side source of truth for "how full is this class": enrolled players minus everyone `absent`, floored at 0; players who haven't answered yet still count. Mirrors the backend's `LessonInstance.effective_filled_spots` (which is what `participantCount` on the calendar payload already carries), existing specifically so surfaces holding a LOCALLY-mutated participant/presence list — the web class-detail sheet, the mobile class screen — derive the same number instead of each reimplementing the rule and drifting.

## Connections

Uses: none (leaf, no imports).

Used by:
- `frontend/packages/config/src/index.ts`: re-exported as part of the `@levelup/config` barrel.
- `frontend/packages/config/src/capacity.test.ts`: unit tests.
