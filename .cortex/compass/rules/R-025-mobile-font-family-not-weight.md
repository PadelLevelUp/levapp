---
id: R-025
title: "On mobile, a font weight is reached by naming the family, never by fontWeight"
source:
  - ../../atlas/decisions/2026-09-05-mobile-font-weights-by-family.md
governs:
  - "frontend/apps/mobile/**/*.tsx"
  - "frontend/apps/mobile/tailwind.config.js"
confidence: MEASURED
status: active
---

# R-025 — On mobile, a font weight is reached by naming the family

React Native does not synthesize weights for a custom family. Each weight is
its own registered PostScript face, so a face is selected by **family**
(`font-sans-semibold` → `PlusJakartaSans_600SemiBold`) and never by setting
`fontWeight` alone. A bare `font-semibold` / `font-medium` / `font-bold` is
inert: it sets `fontWeight` on a family that has one face, and renders Regular.

Call sites may still write the standard Tailwind weight names. They work
because `resolveFontClass` (`apps/mobile/src/lib/font-class.ts`) collapses them
onto the registered face, and it is applied in the five places app text is
rendered: the `Text` wrapper (`components/ui/text.tsx`) plus the four
`@rn-primitives` components that render a native `Text` without going through
it — `Label`, `DialogTitle`, `AlertDialogTitle`, `SelectLabel`.

To find them: a component is affected when it renders an `@rn-primitives`
`Title` / `Description` / `Label` / `Text` with a weight utility in its own
class string. Importing `TextClassContext` does NOT make a file safe — that
context only styles descendant `<Text>` components, not the primitive itself.
`alert-dialog.tsx` was missed on the first pass for exactly that reason.

**If you add another component that renders text outside the `Text` wrapper,
run its class string through `resolveFontClass`** — otherwise its weights are
silently inert, which is exactly how this regressed to 105 dead classes.

`resolveFontClass` must run **after** `cn()`: twMerge does not know the custom
`font-sans-*` utilities and would leave both the base family and the override
in the string, resolved only by NativeWind's last-wins ordering.

**Why:** measured, not inferred. PAD-180 put five `<Text>` lines side by side on
a simulator (iPhone 17 Pro Max, iOS 26.5) and counted ink against a no-weight
control: `font-semibold` 1.03x (i.e. Regular, within antialiasing noise) and
`font-bold` 1.03x, against `font-sans-semibold` 1.46x and `font-sans-bold`
1.62x. Before PAD-156 the app had 105 bare weight utilities against 36 working
family ones, which is why the whole iOS app rendered without typographic
hierarchy — including unread conversations, which were not visually heavier
than read ones.
