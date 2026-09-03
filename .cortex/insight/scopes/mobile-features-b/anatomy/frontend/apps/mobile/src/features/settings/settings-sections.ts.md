---
path: frontend/apps/mobile/src/features/settings/settings-sections.ts
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 97
size_tokens: 733
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d6d9ad19c634a56a11b1187236070a24669a2c867f678908f154bd960b4594b6"
---

## Purpose

The Settings drill-in's section registry, mirroring web's `SettingsTab` union in `apps/web/src/pages/SettingsPage.tsx`: `SettingsSectionId`, the `SETTINGS_SECTIONS` list (id, i18n label/description keys, icon) for the seven sections (profile, preferences, calendar, notifications, import, club, account), `COACH_ONLY_SECTIONS` (calendar/notifications/import/club — every API call in these is coach-only server-side), and `visibleSections(isCoach)` which filters the full list down to what a role may see. The doc comment states the design rationale directly: web learned the hard way that offering a coach-only nav item to a player and then rendering an empty (403'd) pane is worse than not offering it at all, so `visibleSections()` is the single source of truth used to derive BOTH the nav and the resolved open section — a player can never end up inside a coach pane, not even in the window between a cached `user` and a late `/auth/me` resolving.

## Connections

Uses (external, not in this scope): `@expo/vector-icons`'s `Ionicons` for the `icon: keyof typeof Ionicons.glyphMap` typing.

Used by: no in-scope file imports this registry (no in-edges in this scope's L1 data); it is the presumed source of truth for the Settings screen's nav and section routing outside this scope, and each of this scope's individual settings-section components (`profile-section.tsx`, `preferences-section.tsx`, `seasons-section.tsx`, `auto-invite-section.tsx`, `import-section.tsx`, `club-section.tsx`, `account-section.tsx`) corresponds to exactly one entry in its `SETTINGS_SECTIONS` list, though none of them import this file directly.
