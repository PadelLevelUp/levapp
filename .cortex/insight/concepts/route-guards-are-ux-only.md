`ProtectedRoute`/`RoleRoute`/`SuperAdminRoute.tsx` gate what the web client renders based on `AuthContext`'s `isAuthenticated`/`user.roles`/`user.isSuperAdmin`. `App.tsx`'s route table wires these onto routes like `/players/:playerId/attendance` and its own comments state explicitly (citing spec rules) that the real authorization check happens server-side: the corresponding backend endpoints re-authorize the caller and 403 otherwise (see `coach-scoped-authorization`). A route guard mismatch here is a UX bug (wrong redirect), never a security hole — someone typing a URL past a client-side guard still hits a server check. `AbsencesPage.tsx` and `AttendancePage.tsx` both explicitly document that the `playerId` route param is not authorization either.

## Implemented by
`frontend/apps/web/src/App.tsx`
`frontend/apps/web/src/auth/ProtectedRoute.tsx`
`frontend/apps/web/src/auth/RoleRoute.tsx`
`frontend/apps/web/src/auth/SuperAdminRoute.tsx`
`frontend/apps/web/src/pages/AttendancePage.tsx`
`frontend/apps/web/src/pages/AbsencesPage.tsx`
`frontend/apps/web/src/pages/PresencesPage.tsx`

## Related concepts
[[coach-scoped-authorization]]
[[auth-session]]
