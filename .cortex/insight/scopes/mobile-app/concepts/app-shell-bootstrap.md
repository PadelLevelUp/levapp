---
name: app-shell-bootstrap
---

# App shell bootstrap

The fixed, order-sensitive sequence `app/_layout.tsx` runs before any screen mounts: gesture-handler setup → global CSS → side-effect imports of `src/lib/api.ts` (API singleton) and `src/lib/i18n.ts` (i18next init) → font loading → `AuthProvider` → the root `Stack` (index/login/(tabs)) → portal/toast hosts → the JS launch animation over the native splash. Screens assume this order has already completed (e.g. every screen calling `useTranslation()` or `getApi()` relies on the side-effect imports having run first).

Implementing files: `frontend/apps/mobile/app/_layout.tsx`, `frontend/apps/mobile/src/lib/api.ts`, `frontend/apps/mobile/src/lib/i18n.ts`, `frontend/apps/mobile/src/hooks/useAppStateFocus.ts`, `frontend/apps/mobile/src/hooks/usePushNotificationRouting.ts`.

Related concepts: [[auth-session-lifecycle]].
