---
path: frontend/apps/web/src/components/dashboard/coach/NextClassHero.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 70
size_tokens: 728
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "55cb358c45b9b19bb237aae70596e760566b6d01a8afd2129e2adb2f9bac09b7"
---

## Purpose

The coach dashboard's hero card for the class about to start — the only gradient surface on the screen. It hard-codes the `sidebar` token family (navy in both light and dark theme) rather than `card`/`foreground`, which invert between themes, so the bubble stays readable regardless of theme. Renders nothing when the parent's `block` prop is absent — the server simply omits the block when nothing is scheduled, so there is no explicit empty state to build.

## Connections

Uses: `./primitives` (`AvatarStack`) for the overlapping player-initials stack; `@levelup/config`'s `weekdayLong` for the eyebrow date label; `@levelup/types` for `DashboardNextClassBlock`; `@/components/ui/button`; `react-router-dom`'s `useNavigate`.

Used by: `frontend/apps/web/src/components/dashboard/CoachDashboard.tsx` (outside this scope).

Semantically related (not imports): `dashboard/coach/primitives.tsx`'s `AvatarStack` `onNavy` prop exists specifically to serve this file's navy-on-both-themes surface.
