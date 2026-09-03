---
path: frontend/apps/mobile/src/components/ui/skeleton.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 42
size_tokens: 219
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bf0497faf4d910316d90e5a500404a1b81008af0b7a39578401fd1511574c976"
---

## Purpose

`Skeleton` is a loading placeholder block: a muted rounded `Animated.View`
whose opacity pulses 1 → 0.5 → 1 on a 1000ms `withRepeat`/`withSequence`
Reanimated loop, run indefinitely (`-1`) until unmounted.

## Connections

Uses: (no other files in this scope; imports `react-native-reanimated`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used for loading states throughout feature
screens, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/brand/LaunchAnimation.tsx`
— this is the working counterpart to that file's abandoned approach:
`useAnimatedStyle` on a plain `Animated.View` (not SVG) is exactly the
Reanimated pattern LaunchAnimation's comment says works, in contrast to
`useAnimatedProps` on `react-native-svg` shapes, which that file found
never rendered.
