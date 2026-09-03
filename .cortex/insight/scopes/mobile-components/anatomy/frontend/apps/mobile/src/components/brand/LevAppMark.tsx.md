---
path: frontend/apps/mobile/src/components/brand/LevAppMark.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 47
size_tokens: 486
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9b0052ace18446aa307475e839e294b328202faf9867d74a40876836c79a2d01"
---

## Purpose

`LevAppMark` renders the LevApp "L+A" monogram as inline `react-native-svg`,
transcribed vector-for-vector from the design system's source SVG
(`.claude/skills/levapp-design-system/assets/logo/levapp-mark-on-dark.svg`)
rather than shipped as a raster image, so it stays sharp at any density and
holds its shape down to the system's stated 24px minimum. `size` sets the
mark's height; width follows its real 718:506 aspect ratio. `onDark` swaps
only the L's keyline color for light vs. dark surfaces — the A's blue
gradient is fixed and must never be recolored.

## Connections

Uses: (no other files in this scope; imports only `react-native-svg`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); as a small reusable brand mark it is expected to be consumed by
headers/nav chrome outside this scope.
