---
about: Reanimated cannot drive react-native-svg here
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/scopes/mobile-components/concepts/reanimated-svg-limitation.md@ef7a5f3
---

# Reanimated cannot drive react-native-svg here

`useAnimatedProps` from `react-native-reanimated` never reaches
`react-native-svg` shapes in this app — measured directly in
`frontend/apps/mobile/src/components/brand/LaunchAnimation.tsx`: shapes
driven only by animated props never rendered at all, while
`useAnimatedStyle` on an enclosing plain `View` worked fine (demonstrated
by `frontend/apps/mobile/src/components/ui/skeleton.tsx`, which pulses a
`View`'s opacity via `useAnimatedStyle`/`useSharedValue`/`withRepeat`
without issue).

Consequence: any SVG animation in this scope must be driven by a
`requestAnimationFrame` clock plus plain React re-renders (as
`LaunchAnimation` does), not by Reanimated shared values feeding SVG props.
Reanimated remains fine — even preferred — for animating `View`/`Text`
style properties.

Members: `element:frontend/apps/mobile/src/components/brand/LaunchAnimation.tsx#LaunchAnimation`,
`file:frontend/apps/mobile/src/components/ui/skeleton.tsx`.

<!-- 3.x fields of insight/scopes/mobile-components/concepts/reanimated-svg-limitation.md, carried verbatim by cortex migrate -->
```yaml
concept: reanimated-svg-limitation
scope: mobile-components
```
