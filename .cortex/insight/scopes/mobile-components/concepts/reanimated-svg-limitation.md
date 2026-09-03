---
concept: reanimated-svg-limitation
scope: mobile-components
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
