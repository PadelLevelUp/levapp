# Proposed Notes

## Interpretive Decisions

- **`auth.login`**: Login has no rate limiting or account lockout. Specced as OPEN items since these are security gaps but the app appears functional without them.

- **`classes.instances` (lazy materialization)**: This is the most architecturally significant pattern in the codebase. Recurring lessons don't pre-create instances — they're materialized on-demand when a reminder fires or a coach views the calendar. Specced as the core pattern because the entire notification engine depends on it.

- **`messaging.sse-realtime`**: SSE uses in-memory pub/sub (no Redis/external broker). This means events don't survive server restarts and can't scale horizontally. Specced as-is since the app appears to target single-server deployment.

- **`notifications.invitations`**: The invitation engine is the most complex subsystem. Multi-round matching, batched processing (every 2 min), tiebreaker sorting, restriction checking, and vacancy tracking. Specced as a single large spec because the rounds/batches/restrictions are deeply intertwined.

- **`training.court-diagram`**: The diagram editor is entirely frontend (React canvas with draggable elements). The backend just stores JSON. Specced with minimal backend spec since the business logic is frontend-only.

- **`import.analyze`**: Uses OpenAI API for file analysis — this is an AI-in-the-loop feature. The AI maps Excel columns to database entities. Specced the flow (upload → analyze → preview → confirm) without speccing the AI's behavior since it's non-deterministic.

- **Editor module**: The `/editor` routes provide a generic admin CRUD interface for all models. Not specced as a domain because it's a superadmin debugging tool, not a user-facing feature. Mentioned in implicit-behaviors.md.

- **`frontend_api.py` endpoint naming**: Many endpoints use POST where REST conventions would use GET/PUT/DELETE (e.g., `POST /app/edit_class`, `POST /app/remove_class`). Specced with actual HTTP methods used, not ideal REST.

- **`Association_CoachPlayer.side`**: Player side preference (left/right) is stored on the coach-player join table, not the player. This means different coaches could assign different sides to the same player. Specced as-is since it appears intentional (coach-specific assessment).

- **`NotificationConfig` JSON fields**: The notification config stores complex nested JSON (rounds, groups, templates, tiebreakers) in single JSON columns rather than normalized tables. This is a design choice for flexibility — specced as-is.

## Dead Code

- **`auth.py` (session-based login)**: Legacy session-based login at `/auth/login` with Flask-Login. The app uses JWT for the actual client — this appears to be leftover from an admin panel or earlier architecture. The `/auth` route on the frontend is the JWT login.

- **`editor.py` / `editor_api.py`**: Admin CRUD editor. While functional, it's a development/debugging tool, not part of the product. May not need specs.

- **`padel_app/context.py`**: Placeholder file, appears to be empty or minimal.

- **`padel_app/cli.py`**: CLI commands — admin utility, not user-facing.

- **Mock data system** (`src/data/mockData`, `USE_MOCK_DATA` config): Frontend mock data for offline development. Not a feature — development tooling.

## Inconsistencies

- **API endpoint conventions**: Mixed REST and RPC-style endpoints:
  - REST: `GET/POST/PUT/DELETE /api/app/exercises/{id}`
  - RPC: `POST /api/app/add_class`, `POST /api/app/remove_class`, `POST /api/app/edit_class`
  
- **Error response format**: Not standardized across all endpoints. Some return `{error: "message"}`, others return `{msg: "message"}`.

- **Frontend API calls**: Some use axios directly, some use the abstracted API modules. The abstraction is ~90% consistent.

- **Token in query string**: SSE endpoint uses `?token=` for JWT since EventSource doesn't support headers. This is a common workaround but means tokens appear in server logs.

- **`player_in_lesson` vs `player_in_lesson_instance`**: Two levels of enrollment (template vs instance). The relationship between them is implicit — enrolling at the lesson level doesn't create explicit instance associations, but does create presences on materialization.
