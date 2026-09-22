A single source of truth decides which Settings sections a coach-only vs. a player account may see, kept in sync across both clients by explicit doc-comment mirroring rather than a shared package: mobile's `settings-sections.ts` states it mirrors web's `SettingsPage.tsx` `SettingsTab` union, including the same section-id set and the same coach-only gating rationale, learned from a past incident where a player could reach a coach-only pane.

## Implemented by
`frontend/apps/web/src/pages/SettingsPage.tsx`
`frontend/apps/mobile/src/features/settings/settings-sections.ts`
`frontend/apps/mobile/src/features/settings/preferences-section.tsx`
`frontend/apps/mobile/src/features/settings/club-section.tsx`
`frontend/apps/mobile/src/features/settings/seasons-section.tsx`
`frontend/apps/mobile/src/features/settings/auto-invite-section.tsx`
`frontend/apps/mobile/src/features/settings/import-section.tsx`

## Related concepts
[[web-mobile-parity]]
[[coach-scoped-authorization]]
