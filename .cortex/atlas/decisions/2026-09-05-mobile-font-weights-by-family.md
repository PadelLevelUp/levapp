---
id: decision.2026-09-05-mobile-font-weights-by-family
title: Mobile font weights are selected by family, and mapped centrally rather than swept
date: 2026-09-05T00:00:00Z
compass_rules:
  - R-025
---

# Mobile font weights are selected by family, and mapped centrally

The PAD-152 parity audit found (H1) that the iOS app rendered with no typographic
hierarchy at all — the single biggest reason it "looked noticeably worse" than mobile
web. Section titles were the same weight as their descriptions, and an unread
conversation was not visually heavier than a read one, so web's unread emphasis was
simply absent.

The cause is that React Native synthesizes no weights for a custom family: each weight
is a separately registered PostScript face. `apps/mobile/tailwind.config.js` had said so
in a comment, but the app had drifted to **105 bare weight utilities** (`font-medium`,
`font-semibold`, `font-bold`) against **36** working family utilities (`font-sans-*`).
The bare ones set `fontWeight` on a one-face family and render Regular.

PAD-180 settled the mechanism on a simulator rather than by argument (iPhone 17 Pro Max,
iOS 26.5, dev build of `staging`): five adjacent `<Text>` lines, ink counted against a
no-weight control. `font-semibold` 1.03x and `font-bold` 1.03x — indistinguishable from
the control; `font-sans-semibold` 1.46x and `font-sans-bold` 1.62x. The test was made
deliberately three-way, because a two-way comparison cannot say which of the two is the
anomaly.

**Decision (PAD-156): map, do not sweep.** The weight utilities are rewritten onto the
registered face centrally, in `apps/mobile/src/lib/font-class.ts`, rather than by
replacing 105 call sites. Two reasons:

1. A sweep fixes today's call sites and nothing stops the next screen typing
   `font-bold` again. The mapping makes the standard Tailwind names correct by
   construction.
2. `cn()` is clsx + twMerge, and **twMerge does not know the custom `font-sans-*`
   utilities** — they are in none of its groups. A sweep leaves both the base
   `font-sans` and the added `font-sans-semibold` in the class string, deduped by
   nothing and resolved only by NativeWind's last-wins ordering. That works today, but
   it is load-bearing coincidence, and a sweep would multiply it by four. Mapping after
   `cn()` emits exactly one family class.

**Known limit.** The mapping is applied where text is actually rendered: the `Text`
wrapper, which holds the app's only `Text` import from react-native, plus the three
`@rn-primitives` components that render a native `Text` around it (`Label`,
`DialogTitle`, `SelectLabel`). A future component that renders text outside those paths
needs the same treatment — hence R-025.

**Not settled, and not worth settling.** Two hypotheses explain the measurement equally
well: RN not synthesizing weights for a custom family, or `react-native-css-interop`
dropping `fontWeight` before it reaches the native `Text`. The fix is identical under
both — name the face by family — so nothing downstream turns on the answer. The
discriminator, if ever needed, is an inline `style={{ fontWeight: "600" }}` beside
`className="font-semibold"` on one screen.
