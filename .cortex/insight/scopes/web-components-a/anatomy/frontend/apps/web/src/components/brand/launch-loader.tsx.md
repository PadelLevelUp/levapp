---
path: frontend/apps/web/src/components/brand/launch-loader.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 656
size_tokens: 6099
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bc754c5eb3dee971de4ca1b0ec4674bd16d4bff274d1dcb1da5c1848d4bc1e64"
---

## Purpose

The web half of LevApp's launch/login animation (the mark forms, holds while auth resolves, then reveals the app underneath), ported from the design canvas `LA-slash-split-icon.html` and kept in sync geometrically with the iOS port (`apps/mobile/src/components/launch-animation.tsx`) — see [[levapp-launch-animation-source]]. Deviates from the design canvas in two deliberate ways: durations are event-driven (an elastic "hold" that lasts as long as `/auth/login` + `/auth/me` actually take, with a floor so a warm login doesn't flash) rather than the canvas's fixed 5.4s loop, and `prefers-reduced-motion` cuts straight to the settled mark. The whole animation is driven by a single `requestAnimationFrame` loop writing SVG path `d`/`opacity`/`transform` attributes directly through refs — re-rendering React 60×/s to move six polygons would risk stuttering exactly when the dashboard mounts behind it. On reveal it either flies the animated mark onto the app's own logo (measured via `[data-launch-logo]` elements in the DOM) or falls back to a plain fade when no logo target is measurable.

## Connections

Uses: `react` (`useCallback`, `useEffect`, `useRef`) — no other imports; this is a leaf module with all geometry/timing constants and pure animation-math helpers (`mixPts`, `xfPts`, `clipBelow`, `toPath`, `frameAt`) defined locally.

Used by: `frontend/apps/web/src/components/brand/launch-overlay.tsx` — renders `<LaunchLoader>` while `phase !== "idle"`, passing it `ready`, `onFinish`, and a translated `label`.
