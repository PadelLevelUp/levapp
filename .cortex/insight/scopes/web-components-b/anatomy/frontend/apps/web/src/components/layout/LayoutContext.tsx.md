---
path: frontend/apps/web/src/components/layout/LayoutContext.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 105
size_tokens: 815
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b6e247923893e6955bac88a4dbd54b6b05a7e5ac917753261dbc332dadfe701d"
---

## Purpose

The `LayoutContext` React context and provider backing `AppLayout`: owns cross-cutting shell state — scroll mode (`page` vs `none`, so a page can opt out of the shell's own scroll container), whether the mobile bottom nav is hidden (e.g. while a message composer's textarea has focus, so the on-screen keyboard doesn't fight it), the unread-messages count, the latest-message summary, and sidebar-collapsed state. `refreshUnreadCount` fetches the count from `getUnreadMessagesCount` and also drives the module-level `syncAppBadge` helper, which mirrors the count onto the installed-PWA app icon via the Badging API (`navigator.setAppBadge`/`clearAppBadge`, the web analogue of the iOS springboard badge, PAD-153) — feature-detected and failure-swallowed so an unsupporting browser never breaks the layout, and using `clearAppBadge()` rather than `setAppBadge(0)` for the zero case since some engines flash a literal "0" first. Every caller of `refreshUnreadCount` (`AppLayout` on mount/SSE-event, and `MessagesPage` outside this scope) therefore keeps the PWA badge in sync with no separate call needed.

## Connections

Uses: `@/api/messages` (`getUnreadMessagesCount`, outside this scope).

Used by: `frontend/apps/web/src/components/layout/AppLayout.tsx` (in this scope) — both `AppLayout` (wraps children in `LayoutProvider`) and `AppLayoutInner` (calls `useLayout()`); `frontend/apps/web/src/components/messages/Composer.tsx` (in this scope) calls `useLayout().setBottomNavHidden` on textarea focus/blur.

Semantically related (not imports): unlike the iOS springboard badge (which has no lifecycle — see `[[ios-badge-has-no-lifecycle]]`-style prior finding), this web PWA badge IS actively synced on every `refreshUnreadCount` call, so it does not share that staleness bug.
