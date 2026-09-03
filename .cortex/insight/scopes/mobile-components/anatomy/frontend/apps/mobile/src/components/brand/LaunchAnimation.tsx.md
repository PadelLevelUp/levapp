---
path: frontend/apps/mobile/src/components/brand/LaunchAnimation.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 3
size_lines: 298
size_tokens: 2514
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "20274e8de174c14bc5a04f0b839e673988163ac56165bee5fdb1dc429c27d7ea"
---

## Purpose

Renders the LevApp launch animation: a full-screen `Svg` sequence that plays
once to completion (3.3s) before the app is revealed, then calls `onDone`.
It is a direct port of the design system's motion study
(`.claude/skills/levapp-design-system/animations/LA-slash-split-icon.html`) —
geometry, timing windows and easing curves are transcribed, not invented —
and its final frame is exactly the app icon artwork, so the animation
resolves into the mark that sits on the home screen. The motion: a thick
slash drops in, lands with a squash/tilt wobble, splits into the L and A, the
L's foot kicks out, the A's second arm springs up, a blue wash sweeps down,
a ring pulses from the apex, then everything scales up and dissolves.

## Main players

- `frameAt(c: number): Frame` (lines 112–148) — critical. Pure function
  mapping a single 0→1 progress value across both scenes (form, then land)
  to every per-frame animation value (drop, squash, tilt, split, kick,
  spring, wash, ring, scale, opacity, glow). This is the entire animation
  timeline in one function; all visual output is a projection of its
  output.
- `LaunchAnimation({ onDone })` (lines 154–288) — critical, the sole export
  used by callers. Owns the `requestAnimationFrame` clock (`c` state),
  computes `f = frameAt(c)` each render, and composes the background
  gradient, glow, and the SVG polygon mark from `f`.
- `Frame` interface (lines 97–109) — supporting. Shape of one computed
  animation frame; the contract between `frameAt` and the render body.
- Easing/math primitives — `clamp01`, `seg`, `lerp`, `inCubic`, `outCubic`,
  `inOutCubic`, `backOut`, `wobble` (lines 68–80) — supporting. `backOut` is
  the overshoot-and-settle used for drop/split/kick/spring; `wobble` is the
  decaying oscillation used for the landing squash/tilt.
- Traced geometry — `STEM`, `FOOT`, `ARM1`, `ARM2`, `HALF_L`, `HALF_A`
  (lines 55–66) — supporting. Polygon point sets for the finished mark and
  the single slash it grows from; `mix()` interpolates between a `HALF_*`
  and its finished counterpart by `f.split`.
- `LAUNCH_BG_TOP` / `LAUNCH_BG_BOTTOM` (lines 50–51) — supporting, exported.
  The design system's background gradient colors; exported so other
  screens (e.g. whatever mounts before this component) can match the same
  background without re-deriving it.

## Insights

- Reanimated was tried first and abandoned: `useAnimatedProps` never
  reached `react-native-svg` in this app — shapes driven only by animated
  props never rendered at all. This was measured, not assumed. By
  contrast `useAnimatedStyle` on enclosing `View`s worked fine, which is
  why the glow/scale wrapper `View`s use plain `transform`/`opacity`
  styles recomputed each render rather than Reanimated shared values. See
  `ui/skeleton.tsx` for a working `useAnimatedStyle` case in this same
  scope (Reanimated animating a `View`, not SVG).
- Because Reanimated's SVG path was dead, the whole animation runs off a
  raw `requestAnimationFrame` loop plus `React.useState` — a plain
  re-render per frame, not a UI-thread-only animation. Measured throughput
  was ~29fps against the simulator's 30fps capture ceiling, so this is
  adequate but not headroom-rich; adding per-frame work here has a real
  performance cost.
- Nothing in this component waits on data, fonts, or async work — `c` runs
  purely off `Date.now() - t0`, so the animation is identical on every
  launch regardless of load time. `onDone` fires unconditionally once
  `TOTAL_MS` elapses.
- The 3.3s duration and unhurried pacing are explicit product decisions
  ("by explicit request"), not a default — don't shorten it as a
  perceived performance fix without checking with product/design first.
- Geometry and timing are asserted to come 1:1 from the HTML motion study;
  if the mark or timing needs to change, the study file is the source of
  truth to edit first, with this file re-derived from it — not the other
  way around.

## Connections

Uses: (no other files in this scope; imports only `react`, `react-native`,
`react-native-svg`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); by nature of what it renders (a full-screen splash that calls
`onDone`), it is mounted once near the app's root layout/entry point, not
by feature screens.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/skeleton.tsx`
— both use Reanimated-adjacent animation on this scope's edges; skeleton.tsx
is a live example of the `useAnimatedStyle`-on-`View` pattern this file's
comment says works, contrasted with the `useAnimatedProps`-on-SVG pattern
this file found dead.

## Query pointers

If you need to change the mark's shape or motion timing, first read the
design system's `.claude/skills/levapp-design-system/animations/LA-slash-split-icon.html`
motion study and update it, then port the change into `frameAt`/the
geometry constants here.

If you need to change how/when the launch animation is mounted or what
happens after `onDone`, look at the app's root layout/entry file (outside
this scope) rather than this component.

If you're debugging animation performance, remember this runs on a JS-driven
rAF loop with plain React re-renders, not the UI thread — profile
`frameAt` and the render body, not Reanimated.
