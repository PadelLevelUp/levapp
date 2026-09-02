# Bug Report

## Major (data integrity, security, core flow breakage)

1. **[auth.login]**: No rate limiting on login attempts
   - **Current behavior:** Unlimited login attempts allowed
   - **Expected behavior:** Rate limit after N failed attempts (e.g., 5 per minute)
   - **Location:** `padel_app/modules/api_auth.py` POST `/login`

2. **[auth.login]**: No account lockout mechanism
   - **Current behavior:** Failed logins have no consequence
   - **Expected behavior:** Temporary lockout after repeated failures
   - **Location:** `padel_app/modules/api_auth.py`

3. **[auth.token-refresh]**: JWT secret has a hardcoded dev fallback
   - **Current behavior:** `config.py` falls back to `"dev-jwt-secret"` if env var not set
   - **Expected behavior:** App should fail to start without a proper secret in production
   - **Location:** `padel_app/config.py`

## Normal (incorrect behavior, non-critical)

4. **[messaging.sse-realtime]**: No user-level SSE event filtering
   - **Current behavior:** All events broadcast to all connected clients; frontend filters
   - **Expected behavior:** Server should filter events per user to avoid leaking data
   - **Location:** `padel_app/realtime.py:publish()`, `padel_app/modules/frontend_api.py` GET `/events`

5. **[classes.instances]**: `original_lesson_occurence_date` column has typo ("occurence" → "occurrence")
   - **Current behavior:** Column named `original_lesson_occurence_date`
   - **Expected behavior:** `original_lesson_occurrence_date`
   - **Location:** `padel_app/models/lesson_instance.py`
   - **Note:** Fixing requires a migration; low priority since it's internal

## Minor (cosmetic, edge cases)

6. **[API conventions]**: Inconsistent endpoint naming (REST vs RPC style)
   - **Current behavior:** Mix of `/exercises/{id}` (REST) and `/add_class`, `/remove_class` (RPC)
   - **Expected behavior:** Consistent convention across all endpoints
   - **Location:** `padel_app/modules/frontend_api.py`
   - **Note:** Cosmetic — functional impact is zero

7. **[API conventions]**: Inconsistent error response format
   - **Current behavior:** Some endpoints return `{error: "..."}`, others `{msg: "..."}`
   - **Expected behavior:** Standardized error envelope
   - **Location:** Various route handlers
