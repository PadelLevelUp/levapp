---
id: B-234
title: "E2E specs closed Radix Selects with an immediate Escape, which on a fast machine also closed the dialog or sheet (B-231's family, swept)"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/player-management/create-player-level-dropdown.spec.ts
  - frontend/apps/web/e2e/exercise-management/exercise-labels-i18n.spec.ts
  - frontend/apps/web/e2e/settings/notification-engine-settings.spec.ts
proposed_fix: "Close Selects by choosing (helpers/select.ts), never by a bare Escape; a guard test forbids the pattern."
opened: 2026-09-29T15:13:33Z
resolved: 2026-09-29T15:13:33Z
---

# B-234: an immediate Escape closed the Select and the sheet under it

**Source:** Session-E, 2026-09-29, while verifying PAD-465.
- `create-player-level-dropdown.spec.ts:48` (PAD-29) failed in two long runs on the new Mac: "link /create levels
  in settings/i not found".
- It passed alone, and it passed in the wave-8 gate's shard 3.
- It's the sibling B-231 missed: that entry's "none of the other Escape specs is known to be exposed" was wrong
  for this one.

**What happens:** the test opens the Add Player sheet's Level Select (empty, for a coach with no levels), then
presses Escape at once. Sometimes the Escape closes the sheet as well, and the hint link goes with it.

**Root cause (observed):** a scratch probe, 8–10 attempts per cell, on `levelup_e2e_w8_s5`.
- **Escape at once on the empty Select:** the sheet was lost 5/10, 3/10, 4/10 and 5/8 across runs.
- **Waiting first for Radix's modal layer to be live** (`body` gets `pointer-events: none`) did NOT help: 4/10
  lost. So the settle signal isn't the layer.
- **Escape after 300 ms or 1000 ms:** kept 16/16.
- **A pointer-down inside the sheet** never lost it, but it left the list open 7 times in 20, so it isn't a
  reliable close either.

Test-only, then: no person presses Escape within ~300 ms of a list appearing. B-231 measured the Select with
options at about 50 ms; the empty Select's window is longer.

### Change Plan (Type 7: correct spec, wrong test)

1. `e2e/helpers/select.ts` `closeSelectByChoosing(page, currentOption)`: the Select's own close path, with
   the current value re-chosen so nothing changes.
2. Guard `src/lib/e2e-escape-after-select.test.ts`: a `keyboard.press("Escape")` within 12 lines after a Select
   opens or is read, in the same test, fails. It was red on exactly five sites:
   - exercise-labels `:24` and `:30`;
   - create-player-level-dropdown `:45`;
   - notification-engine-settings `:139` and `:246`.

   It raised nothing on the five Escapes that close dialogs on purpose.
3. The sites:
   - **exercise-labels:** the filter Selects close by choosing "All types" and "All difficulties". The form
     Selects use the helper (PAD-468's inline version).
   - **notification-engine-settings:** the two Escapes were each test's last line. They're removed rather than
     replaced, because choosing an option could save a setting.
   - **create-player-level-dropdown (PAD-29):** the Select is empty, so there's nothing to choose. The hint link
     renders whenever the coach has no levels, whether the list is open or not (`AddPlayerSheet.tsx:223`). So
     the test now asserts it BEFORE opening the list, and never closes the list.

### Resolution

- Tests: the helper, the guard (5/5), and the three specs above. No app or spec changes.
- **Red:** the old PAD-29 close lost the sheet 3–5 times in 10 in the probe, and failed its spec in two long runs
  (at `dc5492e70` and `0e40e3a68`).
- **Green:**
  - create-player-level-dropdown + exercise-labels alone ×3: 3 passed each time.
  - Shard 3's first 13 files + notification-engine-settings: 58 passed.
  - The guard: 5 passed.
- Resolved: 2026-09-29T15:13:33Z.
