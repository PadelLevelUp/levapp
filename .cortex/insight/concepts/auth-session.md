The login / silent-restore / rolling-refresh / 401-logout session contract that both clients honor against the backend's JWT issuance. `@levelup/api`'s `createApiClient` attaches the bearer token to every request, persists a refreshed token whenever the server sends `X-New-Token`, and clears the session on a 401 — all through a platform-specific `TokenStorage` injected at init (mobile's `secureTokenStorage` wraps Expo SecureStore; web uses browser storage). Each app's own `AuthContext` wraps this client behavior with its platform's lifecycle: mobile additionally purges tokens on a fresh install, registers/unregisters the push token, and clears the iOS badge on logout.

## Implemented by
`frontend/packages/api/src/client.ts`
`frontend/packages/api/src/storage.ts`
`frontend/packages/api/src/resources/auth.ts`
`frontend/apps/web/src/auth/AuthContext.tsx`
`frontend/apps/mobile/src/auth/AuthContext.tsx`
`frontend/apps/mobile/src/lib/api.ts`
`frontend/apps/mobile/src/lib/push/index.ts`
`frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts`

## Related concepts
[[coach-scoped-authorization]]
[[app-wide-i18n]]
