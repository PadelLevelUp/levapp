---
concept: nativewind-interop-crash-avoidance
scope: mobile-components
---

# Working around NativeWind's className-interop crashes

Two distinct, documented workarounds in this scope exist because
NativeWind's dynamic className interop can crash or misrender when applied
under specific conditions:

1. **Percentage-width classes on animated overlay children.**
   `frontend/apps/mobile/src/components/ui/dialog.tsx` (`DialogOverlay`)
   and `frontend/apps/mobile/src/components/ui/alert-dialog.tsx`
   (`AlertDialogOverlay`) both set `style={{ alignSelf: "stretch" }}` as a
   plain RN style instead of a NativeWind `className="w-full"`, because the
   percentage-width interop path — combined with an `entering`/`exiting`
   Reanimated `Animated.View` and very short (e.g. empty-state) content —
   threw "Maximum update depth exceeded". Tracked as PAD-102.
2. **Dynamically-applied `shadow-*` classes.**
   `frontend/apps/mobile/src/components/ui/tabs.tsx` (`TabsTrigger`)
   deliberately omits any `shadow-*` className on the active tab. NativeWind
   `shadow-*` classes set CSS variables; adding them dynamically after the
   initial render forces a css-interop "upgrade" pass whose DEV warning
   `JSON.stringify`s props and crashes on React Navigation's throwing
   context getters (RedBox: "Couldn't find a navigation context").

Shared lesson: prefer a plain RN `style` over a NativeWind className when
the class would be applied/changed dynamically on a component that is also
animated or sits inside a React Navigation tree — the interop path itself
is the risk, independent of the specific class.

Members: `file:frontend/apps/mobile/src/components/ui/dialog.tsx`,
`file:frontend/apps/mobile/src/components/ui/alert-dialog.tsx`,
`file:frontend/apps/mobile/src/components/ui/tabs.tsx`.
