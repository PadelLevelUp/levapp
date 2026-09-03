The canonical ordering convention for a coach's skill-level ladder — lower `display_order` means a *higher* skill level, so the first level a coach lists in Settings is their strongest — and the "one level above / one level below" adjacency rule the [[invitation-engine]] uses to decide who is eligible for a vacancy. The raw integer is unsafe to compare directly: it defaults to `0` and is nullable, so any write path that omits it (a single-level POST, a spreadsheet/AI import, a pre-migration row) sorts as if it were the coach's *strongest* level — PAD-70's bug treated a freshly-imported "5-" level as one level above a "4" vacancy. PAD-84 established the "position 1 = highest level" convention on the settings UI that the backend's adjacency functions must keep honoring.

## Implemented by
`backend/padel_app/services/level_ladder.py`
`backend/padel_app/services/notification_service.py`
`backend/padel_app/services/coach_service.py`
`backend/padel_app/tests/test_effective_level_resolution.py`
`backend/padel_app/tests/test_level_ladder_ordering.py`
`backend/padel_app/tests/test_default_coach_levels.py`
`frontend/apps/web/src/components/settings/CoachLevelsSection.tsx`
`frontend/apps/web/e2e/settings/coach-levels-ordering-hint.spec.ts`

## Related concepts
[[invitation-engine]]
