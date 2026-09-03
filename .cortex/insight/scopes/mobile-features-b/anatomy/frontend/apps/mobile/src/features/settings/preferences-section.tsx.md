---
path: frontend/apps/mobile/src/features/settings/preferences-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 147
size_tokens: 1264
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f036f0bfbbe16a6cf94e1734f9de7878862dd476f82461b89984dd63403294b9"
---

## Purpose

`PreferencesSection` mirrors web's Preferences tab: the language preference (pt/en, persisted via `authApi.updateMe` and applied live via `i18n.changeLanguage`) plus the two coach-only editors web nests inside it, `CoachLevelsSection` and `EvaluationCategoriesSection`. The doc comment explains a real bug this fixes: those two sub-editors are gated individually on the `isCoach` prop even though the enclosing Preferences pane is visible to players, because web hit exactly this — a player opening Preferences fired two 403s from editors they couldn't use. `isCoach` is passed in from the parent rather than recomputed here so the nav, the pane, and these two sub-sections share one source of truth. It also documents an intentional omission: web has a theme selector here, but a repo-wide grep for `useColorScheme`/`colorScheme`/`darkTheme` across `apps/mobile/{src,app}` returns 0 hits — every screen reads `lightTheme` directly — so a theme control would be a dead knob and is omitted rather than faked.

## Connections

Uses:
- `frontend/apps/mobile/src/features/settings/coach-levels-section.tsx` and `frontend/apps/mobile/src/features/settings/evaluation-categories-section.tsx`: both rendered conditionally on `isCoach` (visible via direct imports; not captured as resolved in-scope edges in this scope's L1 data).

Uses (external, not in this scope): `@levelup/api`'s `authApi` (`getMe`/`updateMe`); `@/auth/AuthContext`'s `useAuth()`; `@/lib/i18n` for `changeLanguage`.

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data); presumably composed into the Settings screen's `"preferences"` section, per `settings-sections.ts`.
