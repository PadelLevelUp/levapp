---
slug: app-wide-i18n-pt-fallback
scope: web-app-shell
---

# App-wide i18n with a locked Portuguese fallback

`i18n.ts` bootstraps `i18next` by eagerly globbing every `src/locales/<lng>/<area>.json` file (repo-root, three directory levels above `apps/web/src/` since the PR #47 monorepo restructure), deep-merging per-area files into one `translation` namespace per language, with `lng`/`fallbackLng` both hardcoded to `"pt"` — a locked product decision (PAD-39), not a casual default. `dateLocale.ts` mirrors the same fallback for date-fns formatting (`LOCALE_MAP[lng] ?? pt`), and `conversationTime.ts` consumes that for relative timestamp formatting. `AuthContext.tsx`'s `applyUserLanguage` pushes the user's persisted language preference into this same `i18n` instance on both silent session restore and explicit login, so language is a server-persisted user preference, not just a client toggle — `SettingsPage.tsx` is where a user changes it (imports `AppLanguage` from `i18n.ts`).

Because the fallback is `pt`, not `en`, an English-only UI code path is the exception, not the rule — evident in `PrivacyPolicyPage.tsx`, `TermsPage.tsx`, and `SupportPage.tsx`, none of which import `react-i18next` at all and are hardcoded English legal template pages, unlike every interactive page in this scope.

Relevant files: `i18n.ts`, `lib/dateLocale.ts`, `lib/conversationTime.ts`, `auth/AuthContext.tsx`, `pages/SettingsPage.tsx`.
