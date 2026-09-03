---
path: frontend/apps/web/src/components/brand/launch-overlay.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 74
size_tokens: 622
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b23c28c324bee8c03a931b860d580e31191685f15f947b61a9af330c78ccd81c"
---

## Purpose

React context provider that owns the login handoff: `begin()` covers the screen and starts the mark forming, `succeed()` signals the app behind is ready so the reveal can play, `cancel()` dismisses it immediately on a failed login. Mounted above the router (not inside the auth page) so it survives the `navigate("/dashboard")` that unmounts the auth page mid-animation, and so the dashboard mounts and fires its data queries *behind* the animation instead of after it. Exposes `useLaunchOverlay()` for consumers (the auth flow) to call `begin`/`succeed`/`cancel`. The `ready` signal is deliberately a separate explicit phase rather than derived from `useAuth().loading`, because that flag flips loading→not→loading again around a login (login() resolves, then a token effect re-runs `getMe`), which would flicker a derived `ready`.

## Connections

Uses: `frontend/apps/web/src/components/brand/launch-loader.tsx` — renders `<LaunchLoader>` (imported via the `@/components/brand/launch-loader` alias) whenever `phase !== "idle"`.

Used by: no file within this scope imports `LaunchOverlayProvider`/`useLaunchOverlay`; mounted near the app root (above the router) and consumed by the auth page, both outside `web-components-a`.
