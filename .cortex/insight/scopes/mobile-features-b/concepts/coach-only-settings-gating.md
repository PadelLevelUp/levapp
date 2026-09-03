# Coach-only settings gating

Every settings sub-editor whose backend endpoints are coach-only (seasons/calendar, the auto-invite engine, import history, club management, plus the coach-only halves of preferences) is gated through a single source of truth — `settings-sections.ts`'s `COACH_ONLY_SECTIONS` list and its `visibleSections(isCoach)` function — rather than each component re-deriving the role check itself. `preferences-section.tsx` repeats the same pattern one level down, gating `CoachLevelsSection`/`EvaluationCategoriesSection` individually behind an `isCoach` prop passed in from the parent instead of recomputed locally.

The rule exists because web hit the failure mode directly: offering a coach-only nav item to a player and then rendering an empty (or 403'd) pane is worse than not offering it at all — so the same list that builds the nav also resolves which section is actually open, and a player can never land inside a coach pane, not even in the window between a cached `user` and a late `/auth/me` resolving.

**Implementing files:**

- frontend/apps/mobile/src/features/settings/settings-sections.ts
- frontend/apps/mobile/src/features/settings/preferences-section.tsx
- frontend/apps/mobile/src/features/settings/club-section.tsx
- frontend/apps/mobile/src/features/settings/seasons-section.tsx
- frontend/apps/mobile/src/features/settings/auto-invite-section.tsx
- frontend/apps/mobile/src/features/settings/import-section.tsx
