# Project Rules

Hard constraints extracted from the codebase. These are consistent patterns that must be maintained.

## Architecture

1. **Lazy instance materialization** — Recurring lessons NEVER pre-create instance rows. Instances are created on-demand via `get_or_materialize_instance()`. Always go through this function; never create LessonInstance directly for recurring lessons.

2. **Coach-scoped data** — Levels, evaluation categories, exercises, notification config, and player notes are all scoped per-coach. A coach only sees their own data. The same player can have different levels/evaluations from different coaches.

3. **Club-scoped lessons** — All lessons belong to a club (`lessons.club_id` CASCADE). Player and calendar queries are filtered by the coach's current club.

4. **Association tables for M:N** — All many-to-many relationships use explicit association tables with an `id` PK (not just composite keys). These tables often carry extra fields (e.g., `coach_in_player.side`, `coach_exercise.role`).

## Backend Patterns

5. **Services layer** — Business logic lives in `padel_app/services/`. Route handlers in `modules/` should be thin — call the service, return the result. Never put business logic in route handlers.

6. **Import services inside test body** — To avoid circular imports, test files import service functions inside the test function body, not at module top level.

7. **`with app.app_context():`** — All DB operations in tests and scheduler jobs must be wrapped in an app context.

8. **Patch I/O in tests** — Always mock Redis publish, push notifications, and scheduler in integration tests. Use `now=` parameter injection for time-dependent logic — never mock `datetime`.

9. **JWT in headers and query string** — JWT is accepted in Authorization header (normal API) and query string (SSE endpoint only: `?token=`). The SSE endpoint is the only one that uses query string auth.

10. **Scheduler job naming** — Reminder jobs: `reminder_lesson_{lesson_id}_{YYYY-MM-DD}`. Invitation jobs: `invite_start_{instance_id}`. Batch processor: `process_batches`. Extension: `extend_schedule_window`.

## Frontend Patterns

11. **Path alias** — Always use `@/` import alias (maps to `src/`). Never use relative imports like `../../components/`.

12. **API module abstraction** — All API calls go through `src/api/` modules. Never call axios directly from components.

13. **Locator priority in E2E** — `getByRole` > `getByPlaceholder` > `getByLabel` > `getByText` > CSS class (last resort).

14. **SSE for real-time** — Message updates come via Server-Sent Events (`/api/app/events`). Never poll for message updates.

15. **shadcn/ui components** — Use Radix UI primitives from `src/components/ui/`. Don't install competing UI libraries.

## Data Model

16. **Soft delete for messages** — Messages use `is_deleted` flag, never hard-deleted. Conversations show "Message deleted" placeholder.

17. **`participant_key` for conversations** — Sorted comma-separated user IDs ensure idempotent conversation lookup. Always use `Conversation.build_participant_key()`.

18. **Presence unique constraint** — `(player_id, lesson_instance_id)` is unique. Never create duplicate presences.

19. **Level history is append-only** — `player_level_history` only gets new rows; existing rows are never updated or deleted.

20. **`overridden_fields` JSON** — When editing a lesson instance that differs from its parent lesson, track which fields diverge in `overridden_fields`. This is how the frontend knows what's custom vs inherited.

## Conventions

21. **Conventional commits** — Format: `feat(LVL-123): description` or `fix(LVL-42): description`. Always reference the ticket.

22. **E2E test naming** — `"US-XXX: description"` for traceability to user stories.

23. **Camel case in API responses** — Backend serializes to camelCase (e.g., `startTime`, `maxPlayers`, `coachId`). Frontend types match this.

24. **UTC dates in backend** — All `datetime` fields use `datetime.utcnow()`. Frontend handles timezone display.
