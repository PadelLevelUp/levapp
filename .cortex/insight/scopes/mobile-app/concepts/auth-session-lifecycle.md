---
name: auth-session-lifecycle
---

# Auth session lifecycle

The login → silent-restore → 401-triggered-logout → logout cycle owned by `AuthContext.tsx`: `SecureStore` token persistence via `src/lib/api.ts`'s `secureTokenStorage`, a fresh-install token purge, push-token register/unregister tied to login/logout via `src/lib/push`, iOS badge clearing on logout, and a `userRef`-guarded 401 handler (registered into `api.ts` via `setUnauthorizedHandler` to avoid an import cycle) that force-navigates to `/login` only when a real session existed. Nearly every screen in `app/` depends on `useAuth()` from this module for role gating (`isCoach`) and identity (`myId`/`user.coachId`).

Implementing files: `frontend/apps/mobile/src/auth/AuthContext.tsx`, `frontend/apps/mobile/src/lib/api.ts`, `frontend/apps/mobile/src/lib/push/index.ts`, `frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts`, `frontend/apps/mobile/src/lib/push/types.ts`.

Related concepts: [[app-shell-bootstrap]], [[live-data-resume]].
