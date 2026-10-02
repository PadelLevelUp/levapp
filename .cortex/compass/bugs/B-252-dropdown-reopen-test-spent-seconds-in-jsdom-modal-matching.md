---
id: B-252
title: "Web unit test dropdown-menu.reopen timed out under load: floating-ui's top-layer check costs ~300 ms per `matches(':modal')` in jsdom"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/src/components/ui/dropdown-menu.reopen.test.tsx
proposed_fix: "Answer `:modal` / `:popover-open` false in the test (jsdom has no top layer); no wall-clock wait was involved."
opened: 2026-10-02T12:13:53Z
resolved: 2026-10-02T12:13:53Z
---

# B-252: the PAD-462 reopen test spent its time in jsdom's selector engine, not on the clock

**Source:** the coordinator, 2026-10-02. The test "the closing menu lingers, so the window is real" timed
out at 30 s three times that day, for three sessions, at load 250–450 (once it took 42 s). It blocked
pre-push gates. It passed when run alone.

**What happens:**
- The test waits on no clock: the exit animation is made infinite through a `getComputedStyle` proxy.
- Measured at load ~400, before the fix: render took 39 ms, the trigger press 211 ms, and
  `findByTestId("item")` **48 s**, of which **10.9 s was CPU** (wall time 14.8 s on a second run). All
  three tests took 15–45 s each.
- A CPU profile put about 20 s of 25 s in jsdom `Element.matches` → nwsapi `isFullscreen` /
  `matchesNative`, called from floating-ui's `isTopLayer`.

**Root cause (observed):**
- floating-ui (`@floating-ui/utils` 0.2.12) positions the menu. On every update, `isTopLayer` asks each
  ancestor `matches(':popover-open')` and `matches(':modal')`.
- In jsdom 20.0.3 with nwsapi 2.2.27, `:modal` resolves through `matchesNative`, which calls jsdom's
  `matches`, which is nwsapi again.
- One `el.matches(':modal')` measured **323 ms**. `:popover-open`, `:fullscreen` and plain `span` each
  took under 1 ms.
- Normally that adds up to seconds; at load ~400 it exceeds the 30 s timeout.

**Fix (test only; the component is unchanged):** jsdom has no top layer (no `showModal`, no popover API),
so `:modal` and `:popover-open` can never match there. The test's `beforeEach` answers exactly those
two selectors `false` and passes every other selector to jsdom. The per-file 30 s timeout is removed.

### Resolution
- **At load 320–400:** each test takes 18–93 ms over 3 runs, about 110 ms for the file, down from
  15–45 s per test.
- **Still has teeth:** with the pre-PAD-462 `DropdownMenuContent` swapped in (`632ee344d^`), "a trigger
  press inside that window opens the menu" fails (`aria-expanded` is not `"true"`); the other two pass.
  With the current component, all 3 pass.
- **Siblings:** the other two tests in the file had the same cost (15–41 s each) and are fixed by the
  same `beforeEach`.
- **Rest of the web suite:** 536/536 pass, and no test goes over 1 s. No other test positions a
  floating-ui popper.
