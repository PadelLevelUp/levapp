`useAnimatedProps` from `react-native-reanimated` never reaches `react-native-svg` shapes in this app — measured directly in `LaunchAnimation.tsx`: shapes driven only by animated props never rendered at all, while `useAnimatedStyle` on an enclosing plain `View` worked fine (demonstrated by `skeleton.tsx`, which pulses a `View`'s opacity via `useAnimatedStyle`/`useSharedValue`/`withRepeat` without issue). Consequence: any SVG animation must be driven by a `requestAnimationFrame` clock plus plain React re-renders, not by Reanimated shared values feeding SVG props — Reanimated remains fine, even preferred, for `View`/`Text` style properties.

## Implemented by
`frontend/apps/mobile/src/components/brand/LaunchAnimation.tsx#LaunchAnimation`
`frontend/apps/mobile/src/components/ui/skeleton.tsx`

## Related concepts
[[nativewind-interop-crash-avoidance]]
