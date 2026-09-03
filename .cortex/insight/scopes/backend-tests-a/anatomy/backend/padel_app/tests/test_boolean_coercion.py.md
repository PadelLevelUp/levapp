---
path: backend/padel_app/tests/test_boolean_coercion.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 419
size_tokens: 4088
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6a7436dc6cf5ffed620d8561a61fde3e0c336b95f5497cbeebe1b24206e5bb90"
---

## Purpose

PAD-69 — pins the fix for a Boolean form-coercion bug where
`Field.set_boolean_value` compared incoming values against the string
`"true"`, so real Python booleans from `JsonRequestAdapter` (`True ==
"true"` is `False`) were silently written as `False`. User-visible
consequence: a student declines a reminder (`Presence.confirmed = True`),
the coach then confirms attendance via `add_presences`
(`confirm_presences_service`), which re-writes the presence through the
form layer and wipes the decline — so the next reminder pass treats the
student as unanswered and sends a spurious follow-up. `TestBooleanCoercion`
pins the coercion matrix (real bools, "true"/"1"/"on"/"yes" strings,
missing key, real Werkzeug `MultiDict`) and the full form round-trip via
`Presence.get_create_form()` + `JsonRequestAdapter`.
`TestAddPresencesPreservesReminderState` pins that
`confirm_presences_service` preserves `invited`/`confirmed`/
`late_cancellation` and correctly sets `validated=True`.
`TestPad69NoFollowupAfterDecline` is the full end-to-end scenario: first
reminder sent -> student declines via `respond_to_reminder` -> coach
confirms attendance -> decline survives -> next reminder pass sends zero
further reminders to that student.

## Connections

- Uses: `padel_app.tools.input_tools.Field` (the coercion under test
  directly); `padel_app.models.presences.Presence`,
  `padel_app.tools.request_adapter.JsonRequestAdapter` for the form
  round-trip; `padel_app.services.lesson_service`
  (`confirm_presences_service`); `padel_app.services.notification_service`
  (`respond_to_reminder`, `send_class_reminders`, patched `publish` and
  `send_push_notification`); models `User`, `Coach`, `Player`, `Lesson`,
  `LessonInstance`, `Club`, `Association_CoachLessonInstance`,
  `Association_PlayerLessonInstance`, `NotificationConfig`,
  `Message`, `ConversationParticipant`.
- Used by: (none — leaf test file)
- Semantically related (not imports): its own docstring says the seed
  helpers "mirror `test_notification_reminder_flow.py`" (outside this
  scope); shares the reminder/decline domain with
  `test_notification_blank_template_fallback.py`'s
  `TestDeclineConfirmationNeverEmpty`.
