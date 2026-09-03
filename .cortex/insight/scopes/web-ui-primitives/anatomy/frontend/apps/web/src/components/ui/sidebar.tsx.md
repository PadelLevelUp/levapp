---
path: frontend/apps/web/src/components/ui/sidebar.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 3
size_lines: 641
size_tokens: 5745
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dfa6fafb71105114d1d8139778c8f345d3ba194f41a5ff2ff23381fdc732bdca"
---

## Purpose

The app's collapsible side-navigation system — provider, layout shell, and a full family of menu-composition components (group/menu/menu-item/menu-button/menu-sub, plus trigger/rail/inset). Distinct from `navigation-menu.tsx` (a top-nav dropdown pattern): this is the persistent left-rail shell used for primary app navigation, with desktop icon-collapse, a separate mobile sheet mode, and cookie-persisted open/closed state. High centrality reflects that it composes six other primitives from this same scope (`button`, `input`, `separator`, `sheet`, `skeleton`, `tooltip`).

## Main players

- Constants (lines 16–21) — supporting: `SIDEBAR_COOKIE_NAME`/`_MAX_AGE` (7 days), `SIDEBAR_WIDTH` (16rem), `SIDEBAR_WIDTH_MOBILE` (18rem), `SIDEBAR_WIDTH_ICON` (3rem), `SIDEBAR_KEYBOARD_SHORTCUT` ("b").
- `SidebarContext` / `useSidebar` (lines 23–42) — critical: context hook exposing `{state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar}`; throws if called outside `SidebarProvider`.
- `SidebarProvider` (lines 44–130) — critical: owns all sidebar state. Supports controlled (`open`/`onOpenChange` props) or uncontrolled (internal `useState`) desktop state; a separate `openMobile` boolean for the mobile sheet; persists desktop `open` to a `document.cookie` write inside `setOpen`; registers a `Cmd/Ctrl+B` global keydown listener that calls `toggleSidebar`; wraps children in `TooltipProvider` with `delayDuration={0}` (all collapsed-menu tooltips inherit this).
- `Sidebar` (lines 132–218) — critical: the core layout component, with three distinct render paths selected at runtime: `collapsible="none"` renders a plain static div; on mobile (`isMobile` from context) it renders inside `Sheet`/`SheetContent` (from `sheet.tsx`) as a slide-in panel; on desktop it renders two stacked divs — an invisible "gap" div that reserves layout width via `transition-[width]`, and a `fixed`, visually-positioned div — both driven by `data-state`/`data-collapsible`/`data-side`/`data-variant` attributes on a `group peer` ancestor, consumed via Tailwind `group-data-[...]` selectors.
- `SidebarTrigger` (lines 220–244) — supporting: the visible `PanelLeft`-icon toggle button, built on `Button`.
- `SidebarRail` (lines 246–273) — supporting: an invisible, edge-hugging draggable-looking rail that also toggles the sidebar on click; cursor style (resize-w vs resize-e) is fully encoded in attribute selectors keyed on `data-side` and collapse state.
- `SidebarInset` (lines 275–288) — supporting: the `<main>` companion element used with `variant="inset"` layouts.
- `SidebarInput`/`SidebarHeader`/`SidebarFooter`/`SidebarSeparator`/`SidebarContent` (lines 290–344) — supporting: thin styled wrappers around `Input`/`Separator` plus plain `div`s, each tagged `data-sidebar="..."` for external/internal CSS targeting.
- `SidebarGroup`/`SidebarGroupLabel`/`SidebarGroupAction`/`SidebarGroupContent` (lines 346–405) — supporting: a labeled section within the sidebar; `Label`/`Action` support `asChild` via Radix `Slot`.
- `SidebarMenu`/`SidebarMenuItem` (lines 407–415) — supporting: `<ul>`/`<li>` list wrappers with `data-sidebar="menu"`/`"menu-item"`.
- `sidebarMenuButtonVariants` (lines 417–437) + `SidebarMenuButton` (lines 439–478) — critical: the primary nav-item button. `cva` variants (`default`/`outline` × `default`/`sm`/`lg`). When a `tooltip` prop is supplied, wraps itself in `Tooltip`/`TooltipTrigger`/`TooltipContent` (`side="right"`), with the tooltip's `hidden` prop set to `state !== "collapsed" || isMobile` — this is the icon-collapsed-state UX where nav labels reappear as tooltips.
- `SidebarMenuAction`/`SidebarMenuBadge` (lines 480–529) — supporting: absolutely-positioned action button / badge overlaid on a menu item; vertical offset varies by the sibling button's `peer-data-[size=*]`.
- `SidebarMenuSkeleton` (lines 531–562) — supporting: loading placeholder for a menu item, using `Skeleton` (from `skeleton.tsx`) with a randomized text width (50–90%) computed once via `useMemo` so it doesn't reflow between renders.
- `SidebarMenuSub`/`SidebarMenuSubItem`/`SidebarMenuSubButton` (lines 564–613) — supporting: nested/indented sub-menu items, hidden entirely (`group-data-[collapsible=icon]:hidden`) when the sidebar is icon-collapsed.

## Insights

- The desktop collapse mechanism is pure CSS, not conditional rendering: `Sidebar` always renders both the "gap" div and the "fixed" div on desktop; `data-state`/`data-collapsible`/`data-side` attributes on a `group peer` ancestor drive every collapsed/expanded/side-flipped visual change through Tailwind `group-data-[...]` selector strings. Changing collapse behavior means editing these selector strings across multiple components (`Sidebar`, `SidebarGroupLabel`, `SidebarGroupAction`, `sidebarMenuButtonVariants`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuSub`), not a render branch in one place.
- `SidebarProvider` treats `open` (desktop) and `openMobile` (mobile) as two independent booleans; `toggleSidebar()` picks which one to flip based on `isMobile` from `useIsMobile()` (`@/hooks/use-mobile`, outside this scope). A caller trying to drive both from a single controlled prop will only ever affect the desktop `open` state.
- Desktop open/closed state persists via a direct `document.cookie` write (`sidebar:state`, 7-day max-age) inside `setOpen` — there is no server round-trip. If this app ever adds SSR, first-paint sidebar state would need to read this cookie separately; today it's a pure client-side convenience.
- `SidebarMenuButton`'s tooltip visibility is driven by a `hidden` boolean prop, not by conditionally mounting/unmounting the `Tooltip` — `hidden={state !== "collapsed" || isMobile}` — so the tooltip's presence in the tree is decoupled from Radix's own open/closed lifecycle.
- `variant="floating"` and `variant="inset"` both need extra icon-collapsed-width padding (`+theme(spacing.4)`), and that adjustment is baked into three separate className strings (the "gap" div, the "fixed" div in `Sidebar`, and `SidebarInset`) rather than one shared constant — adding a fourth variant with different padding needs all three touched.
- `SidebarRail`'s four-way cursor logic (`cursor-w-resize`/`cursor-e-resize`, swapped when collapsed) is fully expressed as Tailwind arbitrary attribute selectors on `[data-side=...]`/`[data-collapsible=offcanvas]` combined with ancestor collapse state — there's no JS branching for it.

## File map

Lines 1–42: imports, constants, `SidebarContext`/`useSidebar`.
Lines 44–130: `SidebarProvider` (state, cookie persistence, keyboard shortcut, `TooltipProvider` wrap).
Lines 132–218: `Sidebar` (three render paths: none / mobile-sheet / desktop gap+fixed).
Lines 220–273: `SidebarTrigger`, `SidebarRail`.
Lines 275–405: `SidebarInset`; `SidebarInput`/`Header`/`Footer`/`Separator`/`Content`; the `SidebarGroup` family.
Lines 407–478: `SidebarMenu`/`SidebarMenuItem`; `sidebarMenuButtonVariants`; `SidebarMenuButton` (incl. collapsed-state tooltip).
Lines 480–562: `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuSkeleton`.
Lines 564–641: `SidebarMenuSub` family, exports.

## Connections

Uses:
- `@/hooks/use-mobile` (outside this scope): `useIsMobile`, drives every mobile/desktop branch.
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/button`: `Button` — renders `SidebarTrigger`.
- `@/components/ui/input`: `Input` — renders `SidebarInput`.
- `@/components/ui/separator`: `Separator` — renders `SidebarSeparator`.
- `@/components/ui/sheet`: `Sheet`, `SheetContent` — render the mobile sidebar as a slide-in panel.
- `@/components/ui/skeleton`: `Skeleton` — renders `SidebarMenuSkeleton`'s icon/text placeholders.
- `@/components/ui/tooltip`: `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` — power the collapsed-state menu-button tooltip and the provider-level wrap.
- `@radix-ui/react-slot`: `Slot`, backing `asChild` on `SidebarGroupLabel`/`SidebarGroupAction`/`SidebarMenuButton`/`SidebarMenuAction`/`SidebarMenuSubButton`.
- `class-variance-authority`: `cva`, for `sidebarMenuButtonVariants`.
- `lucide-react`: `PanelLeft` icon on `SidebarTrigger`.
- `react`: context, `forwardRef`, `useState`, `useCallback`, `useEffect`, `useMemo`.
- `react-i18next`: `useTranslation`, for the trigger/rail's toggle aria-label and title text.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives`, so no consuming app-shell file was provided. Given `centrality: high` and that this exports the app's primary nav shell (`SidebarProvider`/`Sidebar`), it is almost certainly mounted once near the root of the authenticated app layout.

## Query pointers

If you need to change how/when the sidebar collapses, read: `SidebarProvider` (state) and `Sidebar` (the three render paths plus every `group-data-[...]` selector) together — they share invariants and must stay in sync.
If you need to add a new sidebar section or nav item, read: the `SidebarGroup`/`SidebarMenu` family for the composition pattern first; `sidebarMenuButtonVariants` only if it needs a new visual variant.
If a collapsed-state tooltip is missing or shows the wrong content on a menu button, read: `SidebarMenuButton`'s tooltip branch (lines ~461–477), not `tooltip.tsx` itself — the bug is almost always in the `hidden` condition or the `tooltip` prop shape, not the underlying primitive.
