---
path: frontend/apps/web/src/App.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 3
size_lines: 261
size_tokens: 2193
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fac34beba389af8d7d192101be5c07fdf3f5051b8d8c99027d2183baba5b3941"
---

## Purpose

The web app's root component: the full provider stack and the `react-router-dom` route table. This is the single place that decides which URL maps to which page and which guard (if any) protects it — it is the entry point for "where does this feature live" and "who can see it" questions for the whole web app.

## Main players

- `App` (lines 44–258, critical) — default export, the sole component in the file. Nests providers outward-in: `ThemeProvider` (next-themes, class-attribute, system default) → `I18nextProvider` → `QueryClientProvider` (TanStack Query, one `queryClient` module singleton at line 42) → `AuthProvider` → `TooltipProvider` → `Toaster`/`Sonner` (two independent toast systems mounted side by side) → `LayoutProvider` → `BrowserRouter` → `LaunchOverlayProvider` → `Routes`.
- The `Routes` block (lines 60–248, critical) — the route table itself. Public routes (`/auth`, `/register/:userId`, `/invite/coach/:token`, `/invite/player/:token`, `/privacy`, `/terms`, `/support`) are unguarded. `/` renders `HomeRoute`, which itself branches on auth state. Every other route is wrapped in one of three guards: `ProtectedRoute` (any signed-in user), `RoleRoute` (allowedRoles array, e.g. `["coach"]` or `["player"]`), or `SuperAdminRoute` (`/editor`, `/editor/:model`). `*` falls through to `NotFound`.

## Insights

- The route guards are UX-only, not the authorization boundary. Comments at lines 109–113, 132–135, and 154–158 spell this out for the attendance, absences, and presences routes: the corresponding backend endpoints (`GET /attendance_history`, `GET /absence_history`, the presences endpoints) re-check the caller server-side and 403 otherwise, so a client-side route mismatch here is a UX bug, not a security hole.
- Several routes are deliberately duplicated by role rather than parameterized: `/players/:playerId/attendance` (coach) vs `/attendance` (player) both render `AttendancePage`; same pattern for `/absences`. The page component itself branches on whether `playerId` is present in the URL — see `AttendancePage.tsx` / `AbsencesPage.tsx`.
- `/messages/:id` and `/messages` both render `MessagesPage`, which reads the optional `:id` param itself to decide list-vs-thread view (see `MessagesPage.tsx`).
- `queryClient` is a plain `new QueryClient()` with no custom `defaultOptions` — retry/staleTime tuning, if any, would need to be added here or per-`useQuery` call site.
- The provider nesting order is load-bearing: `AuthProvider` sits inside `QueryClientProvider` (queries can use auth context) but outside `TooltipProvider`/`LayoutProvider`/`BrowserRouter`, and `LaunchOverlayProvider` is inside `BrowserRouter` specifically so the launch overlay can outlive a `navigate()` call underneath it (see `AuthPage.tsx`'s login flow, which calls `begin()` before `navigate("/dashboard")`).

## Connections

Uses: every file in `src/pages/*` (route targets, all in this scope), `@/auth/AuthContext` (`AuthProvider`), `@/auth/HomeRoute`, `@/auth/ProtectedRoute`, `@/auth/RoleRoute`, `@/auth/SuperAdminRoute` (all in this scope), `@/i18n` (default `i18n` instance, this scope), `@/components/layout/LayoutContext` (`LayoutProvider`, outside scope), `@/components/brand/launch-overlay` (`LaunchOverlayProvider`, outside scope), `@/components/ui/{sonner,toaster,tooltip}` (outside scope), plus external `@tanstack/react-query`, `next-themes`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/main.tsx`, which mounts `<App />` at the DOM root.

## Query pointers

If you need to add or change a route (new page, new guard, new role restriction), read this file first, then the target page in `src/pages/`. If you need to understand what a route guard actually protects, also read `@/auth/AuthContext.tsx`, `@/auth/ProtectedRoute.tsx`, `@/auth/RoleRoute.tsx`, `@/auth/SuperAdminRoute.tsx`, and remember the server-side re-check comments above — never treat a route guard here as the authorization source of truth.
