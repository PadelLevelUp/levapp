---
id: B-191
title: "PAD-447's E2E reopens the avatar menu while the last one is still closing, so the click is swallowed"
type: test-defect
severity: low
status: resolved
affects:
  - settings.role-scope
  - frontend/apps/web/e2e/settings/my-connections.spec.ts
proposed_fix: "Before each avatar-menu reopen, wait for the previous role=menu to unmount."
opened: 2026-09-26T04:34:56Z
resolved: 2026-09-26T04:37:48Z
---

# B-191: PAD-447's E2E clicks the avatar menu during its close animation

**Source:** a failure in `e2e/settings/my-connections.spec.ts:35` ("PAD-447 … even from inside Settings", #436). Found while verifying PAD-459 (#456). The id comes from Session-C's wave-8 range, B-191–195.

**What happens:** the third opening of the avatar menu ("And back: Settings from inside My connections") never shows the menu. The test times out at `:51:48` waiting for `user-menu-settings`.

**What should happen:** the test opens the menu, chooses Settings, and lands on Preferences. That is criterion "The avatar menu lands on its section even from inside Settings (PAD-447)": "And choosing Settings again from the menu goes back to Preferences".

## Evidence

- **Reproduced, and not a regression.**
  - On staging 2acf8b7b6 it failed 4 runs out of 4: 2 with staging's `SettingsPage.tsx` and 2 with #456's. All were at `:51:48`.
  - At **#436's own merge commit 4209492** it failed 2 of 2, on an isolated stack (DB `levelup_test_pad436`, :5160/:8160).
  - So no later merge broke it. Session-E's green run was on another stack at merge time; see the mechanism below for why it can pass there.
- **Instrumented with a throwaway Playwright probe** (never committed). It logged the trigger's `aria-expanded`/`data-state`, the `role="menu"` nodes and the focused element after each step:
  - **First navigation** (`/` to `/settings`): Settings renders its own `AppLayout`, so the page and its menu remount. The old menu is gone (`menus: []`).
  - **Second navigation** (inside `/settings`, to `?tab=connections`): the layout stays mounted. When `blocked-users` became visible, the old menu was **still mounted in `data-state: "closed"`**, with focus on `user-menu-connections`. It lingered **184 ms and 182 ms** in two runs before it unmounted.
  - **A trigger click inside that window** was swallowed: afterwards `aria-expanded` was `"false"` with no menu. A second click then opened it.
  - **A trigger click after the old menu unmounted** opened it at once, in 2 of 2 runs.
- **This selects the layer.** The app behaves the way Radix's `DropdownMenu` does, and a person cannot re-click the avatar within ~180 ms of choosing an item. The defect is the test racing the exit animation, which is timing-dependent: it passes on a stack where `blocked-users` appears later than the animation ends.

## Diagnostic tree

1. The dev spec `settings.role-scope`, rule 2, governs this. Correct.
2. The rule covers the case, and it is right.
3. The criterion exists: "The avatar menu lands on its section even from inside Settings".
4. A test exists, but it **does not encode the criterion reliably**. It clicks the trigger before the previous menu has gone. **Type 7 (test defect).**
5. Drift: the business spec (the coach reaches My connections from the avatar menu) still matches.

### Change Plan

**Spec:** `.specflow/specs/settings/role-scope.spec.md`. No change.

**Test file:** `frontend/apps/web/e2e/settings/my-connections.spec.ts`

1. Add a local `openUserMenu(page)`. It waits for `getByRole("menu")` to reach count 0, clicks `user-menu-trigger`, then expects the menu to be visible. The PAD-447 test uses it for every opening.
2. Run it on the isolated stack: red before (above), green after.
3. No app code changes.

### Resolution

- Spec changes: none.
- Tests: `my-connections.spec.ts` gains `openUserMenu` for the PAD-447 test's three openings.
- Code changes: none.
- Verified on an isolated stack (`levelup_test_b191`, :5161/:8161) at staging 2acf8b7b6: all of `my-connections.spec.ts` passed 3/3 in each of 2 runs, where the old spec failed 4 of 4. The e2e guards (isolation, i18n helper, rendered-text ratchet) passed 130/130.
