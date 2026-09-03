---
path: frontend/apps/web/src/pages/SettingsPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 550
size_tokens: 5683
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7a3eae1b40136500faaa8482273ebb8c69f567b3ab01f99f2decc328f87d2a3b"
---

## Purpose

The `/settings` page, shared by both coach and student roles but role-filtered by tab. Owns a custom `<button>`-based nav (not `role="tab"`) whose default tab is `"profile"`, backed by a single `SETTINGS_TABS` array with a three-value `SettingsAudience` (`"everyone" | "coach" | "student"`) per tab — PAD-103's fix for coach-configuration panels (seasons, levels, evaluation categories, notification engine, data import, club) having been rendered unconditionally so a student navigating directly to `/settings` saw the coach's setup screens; PAD-142 replaced an earlier `coachOnly: boolean` with the explicit three-value audience so a tab's visibility is one total statement instead of two booleans that could jointly express "visible to nobody." This tab list drives both the desktop sidebar and mobile dropdown from one place (previously two hand-maintained copies that could drift). A comment stresses this filtering is presentation-only — the real authorization boundary is `require_coach()` on the backend endpoints, pinned by `test_settings_role_authz.py`. Owns coach profile edit state (`ProfileForm`, hydrated from `GET /auth/me` via `getMe`/`updateMe`) and the language switcher (imports `AppLanguage` from `@/i18n`).

## Main players (notable exports beyond the default)

- `SettingsNav` — the shared nav-list component consumed by both the desktop sidebar and mobile layout of the default export.

## Connections

Uses: `@/api/auth` (`getMe`, `updateMe`, `MeResponse`, `UpdateMePayload`, outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/layout/AppLayout`, `@/components/settings/{AccountSection,ClubSection,CoachLevelsSection,DataImportSection,EvaluationCategoriesSection,ImportHistorySection,NotificationsEngineSection,SeasonsSection,StudentNotificationBlocksSection}` (all outside this scope), `@/components/ui/{button,card,input,label,select,separator}` (outside this scope), `@/hooks/use-toast` (outside this scope), `@/i18n` (`AppLanguage`, this scope), `@/lib/utils` (`cn`, this scope), external `lucide-react`, `next-themes` (`useTheme`), `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/settings` behind `ProtectedRoute` (any signed-in user).
