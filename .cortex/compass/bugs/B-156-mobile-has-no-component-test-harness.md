---
id: B-156
title: "iOS had no component-test harness — twice in one day iOS correctness rested on 'same code shape as web'"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/mobile/vitest.config.ts
  - frontend/apps/mobile/src/test/mocks/react-native.ts
  - frontend/apps/mobile/src/test/render-native.tsx
proposed_fix: "Mount mobile components under the existing Node vitest project: host primitives in the react-native stub, react-test-renderer (already a dependency), a pre-import-analysis transform for @rn-primitives' raw-JSX .js/.mjs, and *.test.tsx collected by the mobile config."
opened: 2026-09-21T21:13:00Z
resolved: 2026-09-22T08:24:00Z
---

# B-156 — a mobile section could be argued about, never mounted

**Source:** filed by Session D on the coordinator's instruction (PAD-393) after PAD-392 and the
PAD-369 review both had to settle iOS behaviour by reading: the mobile vitest project ran in a
plain Node environment with `react-native` aliased to a 92-line stub of `Platform`/`Keyboard`/
`BackHandler`, collected only `*.test.ts`, and had **zero** component tests.

**What was found while building it (each a real constraint, not a guess):**
- real `react-native` 0.81 is Flow-typed at its entry — vitest cannot import it without a Babel
  transform, so the stub stays and grows host primitives (`View`, `Text`, `Pressable`, `TextInput`,
  `Switch`, …) that render a host element of their own name and forward props;
- `@testing-library/react-native` is NOT installed (an earlier grep matched the string in
  package.json's text); `react-test-renderer` 19.1 is, and the setup file already opted into its
  `act` — so no new dependency;
- no React vite plugin resolves from `apps/mobile`; vite's own esbuild does JSX for `.tsx`;
- `@rn-primitives/*` ships **raw JSX in `.js`/`.mjs`** (Metro transforms it for the app). vite's
  import analysis runs before esbuild and rejects it, so a `pre` plugin transforms those files
  with `esbuild.transform({ loader: "jsx" })`, and `server.deps.inline` makes vitest process them;
- a `<T,>` generic is TSX-only syntax and breaks a `.ts` file with an error vitest attributes to
  the importing test — cost twenty minutes.

**The harness:** `src/test/render-native.tsx` — `renderNative(el)` returning `byTestId`,
`queryByTestId`, `press`, `changeText`, `rerender`, `flush`. Everything native beyond the
primitives (icons, nativewind, the ui wrappers around `@rn-primitives`, the toast) is `vi.mock`ed in
the test, as the web tests mock Radix. Collected by the mobile config's `include` (`src/**/*.test.tsx`)
— one config, so #360's collection guard sees it exactly once.

**First case, the acceptance criterion of PAD-393:** `working-hours-section.test.tsx`, the port of the
web `WorkingHoursSection.test.tsx` (PAD-392): hand the mounted section a new `t` after an edit. On
STAGING's section: **2 failed / 1 passed** — the day switched off went back to "working"; three
language changes made four loads; the control passed. On #367's section: **3/3**. The same two
failures the web test produced on staging's web component. Whole mobile project 53 files / 540
tests green (was 52 / 537); tsc clean.

**Not covered:** layout, styling, native gestures, anything Metro-specific — this mounts logic and
props, not pixels; the simulator stays the instrument for those. Seasons and evaluation-categories
on iOS still have only the guard: porting their web tests is the obvious next use of the harness.
Resolved: 2026-09-22 (PAD-393).
