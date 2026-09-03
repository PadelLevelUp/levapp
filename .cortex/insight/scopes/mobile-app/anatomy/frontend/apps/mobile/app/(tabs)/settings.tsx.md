---
path: frontend/apps/mobile/app/(tabs)/settings.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 201
size_tokens: 1826
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9842c541da181b4f477c047b913fd9e9fd63c5655d2c1f6c872823965dcc6397"
---

## Purpose

The Settings tab: a drill-in list (section list → single section + back), matching web's phone layout. Role gating for which sections appear happens exactly once, in `visibleSections(isCoach)`, so both the nav list and the resolved `activeSection` derive from the same role-filtered array — a player can never land inside a coach-only pane, including in the window before `/auth/me` resolves `isCoach`. Resets to the section list on tab blur (`useFocusEffect`) since expo-router keeps tab screens mounted, unlike web where navigating away unmounts the page.

## Connections

Uses:
- `@levelup/api` (`authApi.getMe`): outside this scope (packages) — fetched via a raw `useQuery(["auth-me"], authApi.getMe)`, not through `@levelup/hooks`.
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for the cached `user` fallback (first-frame data) and `logout()` (unresolved alias).
- `@/features/settings/*` (account, auto-invite, club, import, preferences, profile, seasons sections; `settings-sections` for `visibleSections`): outside this scope.

Used by: no file within this scope.

## Insights

- `headerTitle`, not `title`, is used for the drill-in's per-section heading. `Stack.Screen`'s `title` prop also feeds the tab bar label (`tabBarLabel`), so setting it here would rename the "Settings" TAB itself the moment a section opens (previously produced a truncated "Preferenc…" tab label and a duplicated "Calendar" tab label — the same class of bug as `training.tsx`).
- Log out is a top-level action on the section list, not nested inside the Account section — deliberately, since it is the one action people come to Settings specifically to perform.
