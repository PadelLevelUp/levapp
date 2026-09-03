---
path: frontend/apps/mobile/app/_layout.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 98
size_tokens: 903
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "677d2ac375338ce590e1359f8d233f2fbda7a00a1a8ade227c25b1d13bdf0e2b"
---

## Purpose

The app's true entrypoint (expo-router root layout): bootstraps global providers in dependency order — gesture handler root, React Query client, `AuthProvider`, the root `Stack` (index/login/(tabs)), portal host, toast host, and the JS launch animation over the native splash — plus loads custom fonts (Poppins for display, Plus Jakarta Sans for everything else) and wires the two "must run before any screen mounts" side-effect imports: the API singleton (`@/lib/api`) and i18next init (`@/lib/i18n`).

## Connections

Uses:
- `frontend/apps/mobile/src/lib/api.ts` (side-effect import — registers the API singleton via `initApi` before any screen calls `getApi()`), `frontend/apps/mobile/src/lib/i18n.ts` (side-effect import — must run before any screen calls `useTranslation()`), `frontend/apps/mobile/src/auth/AuthContext.tsx` (`AuthProvider`), `frontend/apps/mobile/src/hooks/useAppStateFocus.ts` (`useAppStateFocus()`), `frontend/apps/mobile/src/hooks/usePushNotificationRouting.ts` (`usePushNotificationRouting()`) — all unresolved `@/` aliases, not in L1's resolved graph.
- `../global.css` (resolved by L1: `frontend/apps/mobile/global.css`, outside this scope) — NativeWind's Tailwind entrypoint, also passed to `withNativeWind` in `metro.config.js`.
- `@/components/brand/LaunchAnimation`, `@/components/ui/toast` (`ToastHost`): outside this scope (mobile-components).

Used by: no file within this scope (the expo-router convention root, not imported).

## Insights

- Import ORDER is load-bearing in three places: `react-native-gesture-handler` must be the first import (its own setup requirement); `../global.css` must precede any component import for NativeWind class resolution; and `@/lib/api` / `@/lib/i18n` must run before the `Stack`'s screens mount, which is why they're bare side-effect imports positioned after the provider imports but before `RootLayout` is defined, rather than imported normally from within `AuthProvider` or a screen.
- The native splash is held open (`SplashScreen.preventAutoHideAsync`) until fonts resolve, specifically to avoid a white frame between the native splash and the JS `LaunchAnimation` — the two must present as one continuous animation, and the splash's first frame is required to equal the launch animation's first frame (see the launch-animation asset itself, outside this scope).
- A font LOAD ERROR does not block rendering (`fontsLoaded || fontError` both hide the splash) — only a font that's still pending does. Falling back to the system font on error is treated as strictly better than a permanently blank screen.
- `LogBox.ignoreLogs` silences a specific noisy RN Animated warning because its on-screen toast physically covers the tab bar and blocks taps — this affects both dev-build users and any UI automation (Maestro) driving the app.

## Query pointers

If a screen's `useTranslation()` or `getApi()` call throws/returns stale data at cold start, check this file's import order first — both are side-effect-initialized here, not in the modules that later import them.
