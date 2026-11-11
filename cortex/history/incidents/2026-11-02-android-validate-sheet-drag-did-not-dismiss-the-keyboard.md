---
about: On Android a drag in the validate sheet did not put the keyboard away, so Cancel and the walk-in answer stayed under it (the Android half of B-704)
permanence: stable
verified: "2026-11-02 (observed)"
origin:
  - migrated:compass/bugs/B-723-android-validate-sheet-drag-did-not-dismiss-the-keyboard.md@ef7a5f3
need:
  - frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx
aliases:
  - B-723
  - B-723-android-validate-sheet-drag-did-not-dismiss-the-keyboard
---

# B-723: the validate sheet's drag did not dismiss the keyboard on Android

**Source:** Linear PAD-818, from PAD-816's harness-gap work (flows 312 and 313 on the Android lane).

**What happens:** a coach opens "Aulas por validar", expands a class and taps "Add player". The search
field takes focus and the keyboard covers Cancel and the walk-in answer row. On Android a drag on the
sheet leaves the keyboard up, so they cannot be reached without the system back key.

**What should happen:** rule 5: a drag on the sheet puts the keyboard away, on both platforms.

**Root cause:** B-704's fix used `keyboardDismissMode="on-drag"` and `alwaysBounceVertical`. On Android
`on-drag` fires only once the ScrollView starts scrolling, and `alwaysBounceVertical` is iOS-only. A
list shorter than its box (one class expanded) never scrolls there, and a downward drag at the top goes
to the RefreshControl. The rule held on iOS only; nothing stated or tested the Android half, so the
rule was incomplete.

**Evidence:** Android lane dispatch 41479176831 (2026-11-02 16:23–16:43Z). 312 failed with "Element not
found: presences-card-add-player-cancel" and 313 found no `presences-card-already-in-class`. The 312
screenshot shows the keyboard still up after a drag on a list row. The 1 Nov nightly 41296614870 failed
both flows the same way.

**Affected specs:**
- Dev: `.specflow/specs/client/pull-to-refresh.spec.md` (new rule 5a, one criterion)
- Business: none

### Change Plan
1. Spec: rule 5a and its criterion.
2. `drag-dismiss.ts`: `dragDismissHandlers(os, dismiss)` returns `onTouchStart` / `onTouchMove` on
   Android, dismissing once a touch moves past `DRAG_SLOP` (8 pt); on iOS it returns nothing.
   `useDragDismissKeyboard()` wraps it.
3. `ValidateClassesSheet`: both ScrollViews (list and class detail) spread the handlers next to
   `on-drag`.
4. Flow 313: drag on a list row before waiting for the answer row (it had no drag; iOS lists the row
   under the keyboard anyway).
5. Proof: `drag-dismiss.test.ts`; flows 312 and 313 on the Android lane, dispatched on the branch.

### Resolution
- Spec changes: `client.pull-to-refresh` rule 5a, criterion "On Android the drag works on a short list too".
- Tests added: `frontend/apps/mobile/src/features/presences/drag-dismiss.test.ts`; flow 313 gains the drag.
- Code changes: `drag-dismiss.ts` (new), `ValidateClassesSheet.tsx` (both scroll areas).
- Resolved: 2026-11-02 (PAD-818). The Android lane run on the branch is named in the PR.

<!-- 3.x fields of compass/bugs/B-723-android-validate-sheet-drag-did-not-dismiss-the-keyboard.md, carried verbatim by cortex migrate -->
```yaml
type: incomplete-rule
severity: medium
status: resolved
affects:
  - client.pull-to-refresh
  - frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx
proposed_fix: "pull-to-refresh rule 5a: on Android both of the sheet's scroll areas dismiss the keyboard when a touch moves past 8 pt, scroll or not; iOS keeps on-drag unchanged."
resolved: "2026-11-02"
```
