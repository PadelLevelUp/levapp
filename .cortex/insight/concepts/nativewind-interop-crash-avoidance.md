Two distinct, documented workarounds exist in the mobile ui/ primitives because NativeWind's dynamic className interop can crash or misrender under specific conditions. (1) Percentage-width classes on animated overlay children: `dialog.tsx` (`DialogOverlay`) and `alert-dialog.tsx` (`AlertDialogOverlay`) both set `style={{ alignSelf: "stretch" }}` as a plain RN style instead of `className="w-full"`, because that interop path combined with an `entering`/`exiting` Reanimated `Animated.View` and short content threw "Maximum update depth exceeded" (PAD-102). (2) Dynamically-applied `shadow-*` classes: `tabs.tsx` (`TabsTrigger`) deliberately omits any `shadow-*` className on the active tab, because NativeWind's dynamic-class "upgrade" pass crashes on React Navigation's throwing context getters. Shared lesson: prefer a plain RN `style` over a NativeWind className when the class changes dynamically on a component that is also animated or sits inside a React Navigation tree.

## Implemented by
`frontend/apps/mobile/src/components/ui/dialog.tsx`
`frontend/apps/mobile/src/components/ui/alert-dialog.tsx`
`frontend/apps/mobile/src/components/ui/tabs.tsx`

## Related concepts
[[reanimated-svg-limitation]]
