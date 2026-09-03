---
path: frontend/apps/web/src/components/layout/AppLayout.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 428
size_tokens: 3667
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "233de8d3a389ad6d5651ee4f8b10f227820bf8f33f3a0acf7a238276a2c5d8fb"
---

## Purpose

The app shell every authenticated route renders inside: a desktop collapsible sidebar plus a mobile bottom nav (both built from the same role-filtered `navItems` list), a header with page title and account dropdown, and the `<main>` content region. Wires up the unread-message badge (fetched once on mount via `refreshUnreadCount`, then kept live over an SSE connection from `createEventSource`) and renders both light/dark and mark/lockup brand SVG variants for the login-animation handoff (`data-launch-logo`). Exports `AppLayout` (wraps children in `LayoutProvider`) and `AppLayoutInner` (the actual shell, consuming `useLayout()`) as two separate pieces so tests/stories can mount the inner shell with a pre-seeded layout context.

## Connections

Uses: `@/components/layout/LayoutContext` (`LayoutProvider`, `useLayout`) for unread count, scroll mode, and bottom-nav-hidden state; `@/api/events` (`createEventSource`, outside this scope) for the SSE `message_created` stream that refreshes the unread badge; `@/auth/AuthContext` (outside this scope) for `user`/`logout`/`token`; `@/components/ui/avatar`, `@/components/ui/button`, `@/components/ui/dropdown-menu`; `@/lib/utils` (`cn`); `react-router-dom` for routing/active-link state.

Used by: the app's route tree (outside this scope) wraps every authenticated page in `<AppLayout>`.

Semantically related (not imports): `layout/LayoutContext.tsx` — `AppLayout`'s unread-badge rendering (both the sidebar dot and the mobile-nav dot) is the DOM half of the badge state `LayoutContext` owns and syncs to the PWA app icon via `syncAppBadge`.
