---
path: backend/padel_app/models/__init__.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 97
size_tokens: 1060
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "226de4b19f30a7a1ed57ff812bb3a1925460a4ac145388836685c03c06a7fa60"
---

## Purpose

Aggregates every model class in this package and builds the `MODELS` dict (lowercase model-name key -> class), the single place the generic admin editor uses to resolve a model class from a URL path segment (`/api/editor/<model>/...`). TokenBlocklist is imported but deliberately excluded from MODELS -- an in-code comment explains it is plain JWT-revocation plumbing with no `get_create_form()`, and registering it previously 500'd the editor schema endpoint. This file is the only place that enumerates 'all editable models'; a new model must be added here to become reachable through the generic editor.

## Connections

Uses:
- backend/padel_app/models/token_blocklist.py: imports `TokenBlocklist` for the generic-editor MODELS registry
- backend/padel_app/models/backend_apps.py: imports `Backend_App` for the generic-editor MODELS registry
- backend/padel_app/models/clubs.py: imports `Club` for the generic-editor MODELS registry
- backend/padel_app/models/coach_levels.py: imports `CoachLevel` for the generic-editor MODELS registry
- backend/padel_app/models/coaches.py: imports `Coach` for the generic-editor MODELS registry
- backend/padel_app/models/lesson_instances.py: imports `LessonInstance` for the generic-editor MODELS registry
- backend/padel_app/models/lessons.py: imports `Lesson` for the generic-editor MODELS registry
- backend/padel_app/models/messages.py: imports `Message` for the generic-editor MODELS registry
- backend/padel_app/models/message_reaction.py: imports `MessageReaction` for the generic-editor MODELS registry
- backend/padel_app/models/message_report.py: imports `MessageReport` for the generic-editor MODELS registry
- backend/padel_app/models/blocked_user.py: imports `BlockedUser` for the generic-editor MODELS registry
- backend/padel_app/models/push_subscriptions.py: imports `PushSubscription` for the generic-editor MODELS registry
- backend/padel_app/models/device_token.py: imports `DeviceToken` for the generic-editor MODELS registry
- backend/padel_app/models/player_level_history.py: imports `PlayerLevelHistory` for the generic-editor MODELS registry
- backend/padel_app/models/players.py: imports `Player` for the generic-editor MODELS registry
- backend/padel_app/models/users.py: imports `User` for the generic-editor MODELS registry
- backend/padel_app/models/presences.py: imports `Presence` for the generic-editor MODELS registry
- backend/padel_app/models/calendar_blocks.py: imports `CalendarBlock` for the generic-editor MODELS registry
- backend/padel_app/models/conversations.py: imports `Conversation` for the generic-editor MODELS registry
- backend/padel_app/models/conversation_participants.py: imports `ConversationParticipant` for the generic-editor MODELS registry
- backend/padel_app/models/coach_player_note.py: imports `CoachPlayerNote` for the generic-editor MODELS registry
- backend/padel_app/models/coach_invitation.py: imports `CoachInvitation` for the generic-editor MODELS registry
- backend/padel_app/models/player_invitation.py: imports `PlayerInvitation` for the generic-editor MODELS registry
- backend/padel_app/models/evaluation_category.py: imports `EvaluationCategory` for the generic-editor MODELS registry
- backend/padel_app/models/evaluation_entry.py: imports `EvaluationEntry` for the generic-editor MODELS registry
- backend/padel_app/models/seasons.py: imports `Season` for the generic-editor MODELS registry
- backend/padel_app/models/exercise.py: imports `Exercise, ExerciseGroup` for the generic-editor MODELS registry
- backend/padel_app/models/Association_CoachClub.py: imports `Association_CoachClub` for the generic-editor MODELS registry
- backend/padel_app/models/Association_CoachLesson.py: imports `Association_CoachLesson` for the generic-editor MODELS registry
- backend/padel_app/models/Association_CoachLessonInstance.py: imports `Association_CoachLessonInstance` for the generic-editor MODELS registry
- backend/padel_app/models/Association_CoachPlayer.py: imports `Association_CoachPlayer` for the generic-editor MODELS registry
- backend/padel_app/models/Association_PlayerClub.py: imports `Association_PlayerClub` for the generic-editor MODELS registry
- backend/padel_app/models/Association_PlayerLesson.py: imports `Association_PlayerLesson` for the generic-editor MODELS registry
- backend/padel_app/models/Association_PlayerLessonInstance.py: imports `Association_PlayerLessonInstance` for the generic-editor MODELS registry
- backend/padel_app/models/Association_CoachExercise.py: imports `Association_CoachExercise` for the generic-editor MODELS registry
- backend/padel_app/models/Association_CoachExerciseGroup.py: imports `Association_CoachExerciseGroup` for the generic-editor MODELS registry
- backend/padel_app/models/lesson_instance_training.py: imports `LessonInstanceTraining` for the generic-editor MODELS registry
- backend/padel_app/models/notification_config.py: imports `NotificationConfig` for the generic-editor MODELS registry
- backend/padel_app/models/notification_event.py: imports `NotificationEvent` for the generic-editor MODELS registry
- backend/padel_app/models/replacement_approval_prompt.py: imports `ReplacementApprovalPrompt` for the generic-editor MODELS registry
- backend/padel_app/models/vacancy.py: imports `Vacancy` for the generic-editor MODELS registry
- backend/padel_app/models/waiting_list_entry.py: imports `WaitingListEntry` for the generic-editor MODELS registry
- backend/padel_app/models/standing_waiting_list_entry.py: imports `StandingWaitingListEntry` for the generic-editor MODELS registry
- backend/padel_app/models/bulk_import.py: imports `import BulkImport` for the generic-editor MODELS registry

Used by:
- (none within this scope)
