---
slug: route-guards-are-ux-only
scope: web-app-shell
---

# Route guards are UX only, not the authorization boundary

`frontend/apps/web/src/auth/{ProtectedRoute,RoleRoute,SuperAdminRoute}.tsx` gate what a client renders based on `AuthContext`'s `isAuthenticated`/`user.roles`/`user.isSuperAdmin`. `App.tsx`'s route table wires these onto routes like `/players/:playerId/attendance`, `/players/:playerId/absences`, and `/presences`, and its own comments state explicitly (citing spec rules like `attendance.history` rule 3 and `attendance.absences` rule 4) that the real authorization check happens server-side: the corresponding backend endpoints (`GET /attendance_history`, `GET /absence_history`, the presences endpoints) re-authorize the caller and 403 otherwise. A route guard mismatch here is a UX bug (wrong redirect), never a security hole — someone typing a URL past a client-side guard still hits a server check.

This pattern recurs across `AbsencesPage.tsx` and `AttendancePage.tsx` too, which both explicitly document that the `playerId` route param is not authorization.

Relevant files: `App.tsx`, `auth/ProtectedRoute.tsx`, `auth/RoleRoute.tsx`, `auth/SuperAdminRoute.tsx`, `pages/AttendancePage.tsx`, `pages/AbsencesPage.tsx`, `pages/PresencesPage.tsx`.
