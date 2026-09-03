---
path: frontend/apps/mobile/src/auth/AuthContext.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 147
size_tokens: 1183
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6de66d5852c3f9d48ffc288540abc7f149828267c9bb6ec9e1f425c9a6ee08db"
---

## Purpose

The app-wide auth provider and `useAuth()` hook: owns `user`/`loading`/`isAuthenticated`, silent session restore from `SecureStore` on cold start, login/logout (including push-token registration/unregistration and iOS badge clearing), the global 401 → force-logout wiring, and syncing the signed-in user's persisted language preference into i18next. Despite `extraction_level: 2` here, this is a de-facto hub of the scope: it is imported (via the unresolved `@/auth/AuthContext` alias) by nearly every screen in `app/` for `useAuth()`.

## Connections

Uses:
- `frontend/apps/mobile/src/lib/api.ts`: `api`, `purgeTokenOnFreshInstall`, `secureTokenStorage`, `setUnauthorizedHandler` (unresolved alias `@/lib/api`, not in L1's resolved graph — this is a real dependency confirmed by reading both files).
- `frontend/apps/mobile/src/lib/i18n.ts`: default-exported `i18n` instance, calls `i18n.changeLanguage()` (unresolved alias `@/lib/i18n`).
- `frontend/apps/mobile/src/lib/push/index.ts`: `getPushRegistrar()` — calls `.register()` on login/silent-restore and `.unregister()` on logout (unresolved alias `@/lib/push`).
- `@levelup/api` (`authApi.MeResponse` as the `AuthUser` type; the actual `authApi.getMe()` calls happen through `@levelup/api` too): outside this scope (packages).

Used by: no in-scope file is captured in L1's structural edges (the `@/auth/AuthContext` alias goes unresolved), but by direct reading it is imported by `app/(tabs)/_layout.tsx`, `app/(tabs)/calendar.tsx`, `app/(tabs)/settings.tsx`, `app/_layout.tsx` (`AuthProvider`), `app/class/[id].tsx`, `app/class/new.tsx`, `app/conversation/[id].tsx`, `app/conversation/new.tsx`, `app/index.tsx`, `app/login.tsx`, `app/player/[playerId].tsx`, and `app/player/new.tsx` — i.e. essentially every route.

## Insights

- The 401 → logout wiring uses a `userRef` guard specifically so a wrong-password `/auth/login` 401, or a query retried right after an intentional logout, does NOT re-run `router.replace("/login")` — without the guard (checking `userRef.current !== null` before navigating), every such 401 would remount the login screen and wipe in-progress form state and the just-shown "invalid credentials" error message.
- `purgeTokenOnFreshInstall()` runs before every silent-restore attempt: the iOS Keychain outlives the app's own data container across a reinstall (or an E2E test runner's clear-state), so a stale SecureStore token would otherwise silently "restore" a session that should have started logged out. It uses a marker file in the document directory (which DOES get wiped on reinstall) to detect the fresh-install case.
- Push registration/unregistration is deliberately fire-and-forget (`void getPushRegistrar().register()` / `.unregister()`) on every login AND every successful silent restore — the registrar contract (see `src/lib/push/types.ts`) guarantees it never throws, so this is safe to not await.
- `logout()` clears the iOS badge (`Notifications.setBadgeCountAsync(0)`) explicitly BEFORE the tabs layout (which otherwise keeps the badge synced to unread count) unmounts — without this, a signed-out app would keep showing a stale badge count with nothing left to correct it (PAD-147).

## Query pointers

If you're chasing why a 401 didn't force a re-login, or forced one unexpectedly, read the `userRef`/`setUnauthorizedHandler` wiring here first.
If push notifications stop registering after login, check `src/lib/push/index.ts` and `src/lib/push/expoPushRegistrar.ts` next — this file only calls `getPushRegistrar().register()`, it never talks to `expo-notifications` directly.
