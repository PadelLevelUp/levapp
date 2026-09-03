---
path: frontend/apps/mobile/app/player/new.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 157
size_tokens: 1471
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f79fe12475a338054bfc885a0ff47e9710c321c2f318b1c2ee04cde39cd80309"
---

## Purpose

New-player screen (coach-only), offering two distinct submit paths from one `PlayerForm`: direct creation (`handleSubmit`, immediately active) or invite (`handleInvite`, PAD-135 — creates an incomplete player record and surfaces an invite link the coach can share).

## Connections

Uses:
- `frontend/apps/mobile/src/lib/config.ts`: `WEB_APP_URL` to build the full invite link from the API's relative path (unresolved alias — direct, not via `resolvedImports`, though note this file ALSO imports `@levelup/config` separately for `lightTheme`, a different package).
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `user.coachId` (unresolved alias).
- `@/features/players/PlayerForm`, `@/features/players/hooks` (`useAddPlayer`, `useCreateIncompletePlayer`): outside this scope.
- `@levelup/hooks` (`useCoachLevels`), `@levelup/config` (`lightTheme`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- Unlike `handleSubmit` (which `router.back()`s immediately on success), `handleInvite` deliberately does NOT navigate away — the invite link IS the point of the action, and popping the screen would unmount the dialog showing it before the coach could read or copy it. Navigation is deferred to the invite dialog's own `onOpenChange` (dismissing it always goes back, since the player record was created either way regardless of whether the coach actually shared the link).
- The invite link is built by prefixing the API's RELATIVE response (`/invite/player/<token>`) with `WEB_APP_URL`, because mobile has no `window.location` to resolve a relative link against — the invite is always opened on the web app regardless of platform.
- No clipboard integration (`navigator.clipboard` doesn't exist on native); the invite link is shown as `selectable` text so the coach uses the OS's native long-press "Copy" menu instead — same precedent noted for the coach-invite dialog in `club-section.tsx` (outside this scope).
- `coachId: user?.coachId ?? undefined` in the invite payload — a comment explains this widens `AuthContext`'s `string | null` to the invite payload's `string | number | undefined`, but also that the backend ignores this field entirely since PAD-92 (the invitation is always issued by the authenticated calling coach); it's kept only for payload shape compatibility.
