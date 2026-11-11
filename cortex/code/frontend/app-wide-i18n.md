---
about: "i18next is bootstrapped once per client with Portuguese locked as both the default and the fallback locale (PAD-39), eagerly globbing per-area locale JSON.…"
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/concepts/app-wide-i18n.md@ef7a5f3
---

i18next is bootstrapped once per client with Portuguese locked as both the default and the fallback locale (PAD-39), eagerly globbing per-area locale JSON. Web additionally mirrors the pt fallback into its date-fns formatting helpers (`dateLocale.ts`, `conversationTime.ts`) and re-applies the user's persisted language on every session restore or login through `AuthContext`. Mobile wires the equivalent bootstrap through its own `lib/i18n.ts`, with a documented trap: a new locale namespace that resolves correctly on web renders raw key paths on mobile unless it is also hand-added to mobile's i18n init, because mobile cannot glob-import namespaces the way web's Vite build does.

## Implemented by
`frontend/apps/web/src/i18n.ts`
`frontend/apps/web/src/lib/dateLocale.ts`
`frontend/apps/web/src/lib/conversationTime.ts`
`frontend/apps/web/src/auth/AuthContext.tsx`
`frontend/apps/web/src/pages/SettingsPage.tsx`
`frontend/apps/mobile/src/lib/i18n.ts`
`frontend/apps/web/e2e/schedule-calendar/i18n-date-locale.spec.ts`

## Related concepts
[[web-mobile-parity]]
[[notification-template-fallback]]

(Merged text above: `.cortex/insight/concepts/app-wide-i18n.md`.)

## Detail from `.cortex/insight/scopes/web-app-shell/concepts/app-wide-i18n-pt-fallback.md`

`i18n.ts` bootstraps `i18next` by eagerly globbing every `src/locales/<lng>/<area>.json` file (repo-root, three directory levels above `apps/web/src/` since the PR #47 monorepo restructure), deep-merging per-area files into one `translation` namespace per language, with `lng`/`fallbackLng` both hardcoded to `"pt"` — a locked product decision (PAD-39), not a casual default. `dateLocale.ts` mirrors the same fallback for date-fns formatting (`LOCALE_MAP[lng] ?? pt`), and `conversationTime.ts` consumes that for relative timestamp formatting. `AuthContext.tsx`'s `applyUserLanguage` pushes the user's persisted language preference into this same `i18n` instance on both silent session restore and explicit login, so language is a server-persisted user preference, not just a client toggle — `SettingsPage.tsx` is where a user changes it (imports `AppLanguage` from `i18n.ts`).

Because the fallback is `pt`, not `en`, an English-only UI code path is the exception, not the rule — evident in `PrivacyPolicyPage.tsx`, `TermsPage.tsx`, and `SupportPage.tsx`, none of which import `react-i18next` at all and are hardcoded English legal template pages, unlike every interactive page in this scope.

Relevant files: `i18n.ts`, `lib/dateLocale.ts`, `lib/conversationTime.ts`, `auth/AuthContext.tsx`, `pages/SettingsPage.tsx`.
