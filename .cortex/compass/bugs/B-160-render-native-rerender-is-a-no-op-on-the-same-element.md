---
id: B-160
title: "render-native's rerender was a silent no-op when handed the element already mounted"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/mobile/src/test/render-native.tsx
  - frontend/apps/mobile/src/test/render-native.test.tsx
proposed_fix: "rerender(next) renders cloneElement(next, {}) — a fresh props object every call — pinned by a self-test that rerenders the SAME element instance and asserts the component ran again."
opened: 2026-09-22T15:34:17Z
resolved: 2026-09-22T22:35:36Z
---

# B-160: `rerender(el)` with the mounted element re-rendered nothing

**Source:** PAD-401. Found by the sonnet subagent drafting PAD-399's test while it proved that test's mutant kill. Confirmed by Session-D, and raised as a follow-up in Session-B's review of #385. The ledger id comes from Session-D's range, as the ticket assigns.

**What happens:** `renderNative(...).rerender(next)` called `root.update(next)`. A caller that hands back the element already mounted (`const el = createElement(X); renderNative(el); … rerender(el)`) hits React's `oldProps === newProps` bailout. The subtree is not rendered again and no effect re-runs, so the "rerender" does nothing and says nothing. A test built that way passes against any mutant: green, and worthless.

**What should happen:** `rerender` renders the component again whatever element the caller passes.

**Root cause:** in the harness itself. `root.update` receives the identical element object, and React skips the reconciliation by design. No dev spec governs the test harness, which is test infrastructure (B-156 made it, under PAD-393), so on the diagnostic tree this is a `test-defect`. It is the same class as B-156: the instrument, not a product rule.

**Evidence (Phase 1, 2026-09-22):**
- **Reproduced on staging's harness** (`origin/staging` @ `8dc17185d`). A self-test with a module-level render counter mounts `createElement(Counter)` and then rerenders the SAME instance. It failed with `expected 1 to be 2`, so the component rendered once and never again.
- **With the fix it passes.**
- **History:** the harness arrived in PAD-393 (`324ec98fe`, `c46f68bab`), and `rerender` has been `root.update(next)` since.
- **Every current caller passes a fresh element:**
  - `competency-manager.test.tsx` :240 and :295 build `createElement(Harness)` on purpose, and document why.
  - `seasons-section.test.tsx` and `working-hours-section.test.tsx` use fresh JSX.

  So no existing test is falsely green. The defect was latent, waiting for the next caller.

**Affected specs:** none. The harness is not governed by a spec leaf, and no business spec is involved.

### Change Plan (Type 7: the instrument, then its self-test)

**Test file:** `frontend/apps/mobile/src/test/render-native.test.tsx`

1. Add one self-test: a component with a module-level render counter. Mount it, `rerender` the SAME element instance, and assert the counter advanced. It must be red on the current harness.
2. In `render-native.tsx`, `rerender(next)` renders `cloneElement(next, {})`, a new props object every call, so the bailout cannot fire whatever the caller passes.
3. Run the self-test, which should go green, then the whole mobile suite and the mobile typecheck.

Optional and not done here: PAD-399's two call-site comments could shrink to a pointer at this entry.

### Resolution

- **Spec changes:** none. No spec governs the harness.
- **Tests added:** `render-native.test.tsx`, "rerender re-renders even when handed the SAME element instance (PAD-401)". With staging's harness it fails: `expected 1 to be 2`, 1 failed, 3 passed.
- **Code changes:** `render-native.tsx`, where `rerender` renders `cloneElement(next, {})`. The self-test then passes 4 of 4; `npm run test:mobile` passes 553 across 57 files; `tsc -p apps/mobile/tsconfig.json` is clean.
- **Resolved:** 2026-09-22T22:35:36Z, commit `b3ac2f978` (PAD-401).
