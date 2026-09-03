# Implicit Behaviors

Undocumented behaviors discovered during onboarding. Each needs a keep/remove decision.

| Behavior | Location | Recommendation | Rationale |
|----------|----------|---------------|-----------|
| Lazy instance materialization — recurring lessons only create DB records when accessed | `lesson_service.py:get_or_materialize_instance()` | Keep | Core architectural pattern; prevents unbounded row creation for recurring lessons |
| Silent JWT refresh via X-New-Token header | `__init__.py:after_request`, `client.ts:response interceptor` | Keep | Seamless UX; avoids forced re-login every 30 days |
| Presences auto-created as invited=True on materialization | `lesson_service.py` | Keep | Ensures all enrolled players are tracked from the moment an instance exists |
| `participant_key` for idempotent conversation lookup | `Conversation.build_participant_key()` | Keep | Prevents duplicate conversations between same participants |
| SSE in-memory pub/sub (no persistence) | `realtime.py` | Keep (for now) | Works for single-server; document as limitation |
| Standing waiting list auto-sync on new instance | `notification_service.py:_sync_standing_entries` | Keep | Ensures paid waiting list members are automatically queued |
| Soft delete for messages (is_deleted flag) | `Message.is_deleted` | Keep | Preserves conversation continuity; messages show "deleted" instead of vanishing |
| Coach-specific player levels (same player, different levels per coach) | `coach_in_player.level_id` | Keep | Intentional — coaches assess independently |
| Push notification on every message send | `messaging_service.py:create_message_service()` | Review | May cause notification fatigue for active conversations |
| 60-day scheduler horizon with weekly extension | `scheduler.py:extend_schedule_window` | Keep | Balances job count vs. coverage for recurring lessons |
| Frontend 60-second LRU cache on paginated players | `players.ts` | Keep | Reduces API calls; cache invalidated on mutations |
| Admin editor routes exposed at /editor | `editor.py`, `editor_api.py` | Keep | Useful for superadmins; protected by SuperAdminRoute guard |
| `BulkImport.record_ids` JSON for revert tracking | `BulkImport` model | Keep | Enables clean revert of imports without cascade issues |
| Level changes create history entries | `player_service.py`, `PlayerLevelHistory` | Keep | Audit trail for player progression |
| Token blocklist for JWT invalidation | `TokenBlocklist` model | Keep | Enables proper logout despite stateless JWT |
| APScheduler batch processor runs every 2 minutes | `scheduler.py` | Keep | Keeps invitation response time reasonable without excessive polling |
