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
