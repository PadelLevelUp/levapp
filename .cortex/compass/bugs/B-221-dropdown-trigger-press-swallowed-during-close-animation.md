---
id: B-221
title: "A web dropdown trigger press made during the previous menu's close animation was swallowed (Radix outside-press dismissed the reopened menu)"
type: missing-criterion
severity: low
status: resolved
affects:
  - settings.role-scope
  - frontend/apps/web/src/components/ui/dropdown-menu.tsx
proposed_fix: "DropdownMenuContent leaves a press on its own trigger to the trigger (preventDefault on onPointerDownOutside when the target is inside the aria-labelledby trigger)."
opened: 2026-09-26T14:21:54Z
resolved: 2026-09-26T14:21:54Z
---

# B-221: web dropdown trigger press swallowed during the close animation (PAD-462)

**Source:** PAD-462, found by the scheduled levapp-test-health run. It's the app-side half of B-191, whose test-side half was resolved in #457.

**What happens:** after the user chooses an item, Radix sets the menu to closed at once but keeps its content mounted through the exit animation (about 180 ms, measured in B-191). A trigger press in that window is swallowed: the menu doesn't open.

**Mechanism (read from the installed source, then pinned by a test):**
- `@radix-ui/react-dismissable-layer` 1.1.19 adds a document `pointerdown` listener (dist/index.mjs:292) that stays while the layer is mounted, and `@radix-ui/react-presence` 1.1.10 keeps a closing layer mounted until `animationend`.
- The trigger's `onPointerDown` toggles first (closed → open), through React's root listener. The lingering layer's document listener then sees the trigger as "outside" and calls `onDismiss` (`react-menu` 2.1.24, index.mjs:152), which closes it again.

**Evidence:** `dropdown-menu.reopen.test.tsx` makes jsdom's computed `animationName` live for the menu node, as it is in a browser, so Presence holds the closing content.
- Old primitive: "the window is real" passed, "press inside the window opens" **failed** (`aria-expanded` "false"), and the control "press on an open menu closes it" passed.
- Fix: 3/3 passed.

**Type:** missing criterion. `settings.role-scope` covered where the avatar menu lands, but not that a quick reopen works.

### Change Plan (executed)
- Spec: `settings.role-scope` rule 2 PAD-462 clause (with the web-only reason) and the criterion "The avatar menu reopens on a press made during its close animation".
- Code: `DropdownMenuContent` wraps `onPointerDownOutside`. The caller's handler runs first. Then a press inside the content's own trigger (found through the content's `aria-labelledby`) is `preventDefault`ed, so the trigger's toggle decides. The exit animation is unchanged.
- Test: `frontend/apps/web/src/components/ui/dropdown-menu.reopen.test.tsx`.

### Resolution
- Web-only, with the reason in the spec: iOS has no dropdown primitive; its initials open Settings.
