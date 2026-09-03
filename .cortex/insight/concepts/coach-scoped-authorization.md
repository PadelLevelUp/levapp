The `coach_id`-based data-isolation boundary that runs through nearly every entity and route in the backend, hardened across several tickets (PAD-92/103/115/116): route-layer guards (`require_coach`, `assert_acting_coach`, `require_owned_class`, `require_own_roster_relation`, `require_accessible_exercises`, `current_coach`) enforce anonymous→401 / other-owner→403 / owner→2xx on `/api/app` and the generic admin-CRUD blueprint, with structural regression tests guarding against a future route reopening the hole. The same boundary shapes *what* a caller sees, not just whether they may call at all — a class-instance payload is serialized differently for a student than for its owning coach. Web's client-side route guards (`ProtectedRoute`/`RoleRoute`/`SuperAdminRoute`) are deliberately UX-only sugar over this same server-side contract, not a second enforcement layer.

## Implemented by
`backend/padel_app/modules/frontend_api.py`
`backend/padel_app/modules/notification_engine_api.py`
`backend/padel_app/models/coaches.py`
`backend/padel_app/serializers/lesson.py`
`backend/padel_app/tests/test_frontend_api_authz.py`
`backend/padel_app/tests/test_generic_crud_auth.py`
`backend/padel_app/tests/test_check_field_available.py`
`backend/padel_app/tests/test_delete_nonnumeric_id_guard.py`
`backend/padel_app/tests/test_settings_role_authz.py`
`backend/padel_app/tests/test_training_players_role_authz.py`
`frontend/apps/web/e2e/security/frontend-api-auth.spec.ts`
`frontend/apps/web/e2e/security/training-players-role-authz.spec.ts`
`frontend/apps/web/e2e/settings/student-settings-scope.spec.ts`
`frontend/apps/web/e2e/schedule-calendar/class-detail-privacy.spec.ts`

## Related concepts
[[auth-session]]
[[attendance-presence-mark]]
