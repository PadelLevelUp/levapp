---
about: "A single source of truth decides which Settings sections a coach-only vs. a player account may see, kept in sync across both clients by explicit doc-comment…"
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/concepts/coach-only-settings-gating.md@ef7a5f3
---

A single source of truth decides which Settings sections a coach-only vs. a player account may see, kept in sync across both clients by explicit doc-comment mirroring rather than a shared package: mobile's `settings-sections.ts` states it mirrors web's `SettingsPage.tsx` `SettingsTab` union, including the same section-id set and the same coach-only gating rationale, learned from a past incident where a player could reach a coach-only pane.

## Implemented by
`frontend/apps/web/src/pages/SettingsPage.tsx`
`frontend/apps/mobile/src/features/settings/settings-sections.ts`

## Related concepts
[[web-mobile-parity]]
[[coach-scoped-authorization]]

(Merged text above: `.cortex/insight/concepts/coach-only-settings-gating.md`.)

## Detail from `.cortex/insight/scopes/mobile-features-b/concepts/coach-only-settings-gating.md`

Every settings sub-editor whose backend endpoints are coach-only (seasons/calendar, the auto-invite engine, import history, club management, plus the coach-only halves of preferences) is gated through a single source of truth — `settings-sections.ts`'s `COACH_ONLY_SECTIONS` list and its `visibleSections(isCoach)` function — rather than each component re-deriving the role check itself. `preferences-section.tsx` repeats the same pattern one level down, gating `CoachLevelsSection`/`EvaluationCategoriesSection` individually behind an `isCoach` prop passed in from the parent instead of recomputed locally.

The rule exists because web hit the failure mode directly: offering a coach-only nav item to a player and then rendering an empty (or 403'd) pane is worse than not offering it at all — so the same list that builds the nav also resolves which section is actually open, and a player can never land inside a coach pane, not even in the window between a cached `user` and a late `/auth/me` resolving.

**Implementing files:**

- frontend/apps/mobile/src/features/settings/settings-sections.ts
- frontend/apps/mobile/src/features/settings/preferences-section.tsx
- frontend/apps/mobile/src/features/settings/club-section.tsx
- frontend/apps/mobile/src/features/settings/seasons-section.tsx
- frontend/apps/mobile/src/features/settings/auto-invite-section.tsx
- frontend/apps/mobile/src/features/settings/import-section.tsx
