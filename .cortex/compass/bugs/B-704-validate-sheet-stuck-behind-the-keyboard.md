---
id: B-704
title: "The attendance sheet got stuck behind the keyboard, and no list had a pull that refreshed or a request that ended"
type: missing-dev-spec
severity: high
status: resolved
affects:
  - client.pull-to-refresh
  - client.request-timeout
  - frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx
  - frontend/packages/api/src/client.ts
proposed_fix: "A drag puts the validation sheet's keyboard away (keyboardDismissMode on-drag on both its scroll areas); pull-to-refresh on the main iOS lists and the sheet, with a spinner that always ends; a 20 s timeout in the shared client for web and iOS."
opened: 2026-10-29T19:15:00Z
resolved: 2026-10-29T19:25:00Z
---

# B-704: the attendance sheet got stuck behind the keyboard

**Source:** coach 2 on iOS build 34 (1.3.2), reported through the owner on 2026-10-29: lists "get
stuck pulling down". The owner then named the screen: the "Aulas por validar" sheet in Presences,
the one in the coach's screenshot (week 25–31 Oct, the walk-in search open). PAD-786.

**What the coach saw:** with a class expanded and "Adicionar jogador" tapped, the search takes
focus and the keyboard opens. Pulling the sheet down did nothing, and the lower half of the sheet
(the search's answer, Cancelar, Abrir, Validar) stayed behind the keyboard.

**What the code did:**
- The sheet is an `@rn-primitives` portal Dialog, centred, not a native modal
  (`components/ui/dialog.tsx`). No gesture can dismiss it, and it never moves above the keyboard
  (`lib/dialog-size.ts` says so).
- Its one list is a ScrollView with `maxHeight` 0.55 of the window, the default
  `keyboardDismissMode` ("none") and no `RefreshControl` (`ValidateClassesSheet.tsx:376-381` at
  build 34's commit beacbd619, identical on staging 3404796a9).
- The walk-in search is `autoFocus`. So a drag neither moved the keyboard nor refreshed anything.
  The only ways out were the Return key or the X.
- Around it: only the Dashboard had a pull anywhere in the app, and the shared axios client had
  no timeout (`packages/api/src/client.ts:38`). A request that never answered kept a spinner up
  for good.

**Root cause:** no dev spec covered a user-started refresh, the keyboard inside the attendance
sheet, or how long a request may wait. The business outcome existed
(`client.user-returns-to-a-screen-at-once`), but no leaf implemented that part of it (missing dev
spec).

**Evidence (simulator, iPhone 17 Pro / iOS 26.5, the scratch E2E backend):**
- Probe 1, 19:01Z, staging code: the sheet open, a pull inside its list. The screenshots before
  and after are identical: no movement, no spinner, no dismissal, no request.
- Probe 2, 19:11Z, staging code (Metro bundle checked for the absence of the fix): expand a class,
  "Add player", type "Zz". The software keyboard covers everything below the search field. Two
  pulls (from 40% to 80%, and from 36% to 75% of the screen) left the keyboard up and the list
  where it was.
- Probe 3, 19:13Z, this fix: the same steps. The first drag puts the keyboard away, and "No player
  found for "Zz"", Cancel, Open and Validate are on screen.
- The app went to the home screen after probe 1. It was backgrounded by Maestro's teardown
  (SpringBoard log at 19:01:59: scene removed, Background, then Suspended), not a crash.

**Fix:**
- `client.pull-to-refresh` rule 5: `keyboardDismissMode="on-drag"` on both of the sheet's scroll
  areas, and `alwaysBounceVertical` on its list.
- Rules 1–4: a `RefreshControl` on Players, Messages, the Calendar's day list, the Presences tab
  and the sheet. Its `refreshing` is the hook's own state, never `isRefetching`. It is bounded at
  45 s, and a toast reports a pull that failed or hit the bound.
- `client.request-timeout`: 20 s in the shared client, for web and iOS; 120 s for an import's
  confirm and revert.
- The Calendar's week and month grids are left out: `DaySheet` owns the vertical pan.
- Toasts stack above dialogs. Flow 312 found that a toast raised inside the sheet drew behind it:
  both share the root PortalHost, and the dialog's `z-50` won. That also hid the sheet's existing
  validate and undo toasts.

**Verification:**
- `apps/mobile/src/lib/pull-refresh.test.ts` (9 tests: outcomes, the 45 s bound, each screen's
  wiring, both `on-drag` scroll areas).
- `packages/api/src/client-timeout.test.ts` (3 tests: the default, a real socket that never
  answers rejects with `ECONNABORTED`, only the import overrides it).
- `backend/padel_app/tests/test_pad786_e2e_stall.py` (4 tests: the E2E stall switch, which takes a
  JWT like every debug route; `test_frontend_api_authz.py` lists its POST with the other debug routes).
- Maestro flows 311 (Players, stalled) and 312 (the sheet: the keyboard goes on a drag; a stalled
  pull ends with the toast).

**Still open:** lifting the sheet above the keyboard, so the search's matches stay visible while
typing, is a change to the shared dialog and not in this fix.
