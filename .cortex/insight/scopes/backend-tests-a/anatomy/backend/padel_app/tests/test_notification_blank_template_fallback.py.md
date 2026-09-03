---
path: backend/padel_app/tests/test_notification_blank_template_fallback.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 455
size_tokens: 4369
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "da1d454a944c6dbbd83f5418cccc7cd26bb330846f6152e51e0287b0db815ac1"
---

## Purpose

PAD-67 — blank message templates must fall back to the built-in defaults,
never deliver an empty bubble/push. Root cause:
`NotificationConfig.get_message_templates` merged the coach's stored JSON
straight over the defaults, so a key saved as `""` (coach cleared the
textarea in Settings -> Message templates) WON the merge — reported on
`reminder_declined` but present for every template key.
`TestBlankTemplateResolution` pins the unit-level resolution rule against
`NotificationConfig.get_message_templates`/`resolve_message_template`:
every "blank" shape (`""`, whitespace-only, `None`, `0`, `[]`, `{}`) falls
back to the locale default (pt AND en checked); a genuinely custom
template still wins over the fallback; a non-dict `message_templates`
value is ignored entirely (full default set used); an unrecognized key
with no built-in default resolves to `""` so callers skip sending; and
unknown custom keys the coach added are preserved verbatim.
`TestDeclineConfirmationNeverEmpty` is the integration path: seeds a
coach+student+instance, sends a reminder, then simulates a decline/
confirm reply via `respond_to_reminder`, asserting the real delivered
message text is the DEFAULT template (never empty) when the stored
template is blank, that a real custom template is still honored, that
with EVERY key blank there's still at least one message and none of them
empty, and that a blank `reminder` template still sends a reminder using
the default's `{name}`-prefix. `TestEmptyMessageBackstop` pins
`_send_system_message` refuses to create a `Message` row for blank text
(returns `None`, no-op) but still sends real text normally.
`TestConfigDictResolvesBlanks` pins the config-read API surface
(`get_config_dict`) always returns resolved (non-blank) templates to the
UI while the underlying STORED config keeps the coach's blank verbatim
(resolution is read-time only, never rewrites storage).

## Connections

- Uses: `padel_app.models.notification_config`
  (`NotificationConfig`, `DEFAULT_MESSAGE_TEMPLATES`,
  `DEFAULT_MESSAGE_TEMPLATES_PT`, `resolve_message_template`);
  `padel_app.services.notification_service` (`get_or_create_config`,
  `respond_to_reminder`, `send_class_reminders`, `_send_system_message`,
  `get_config_dict`, patched `publish`/`send_push_notification`); models
  `User`, `Coach`, `Player`, `Lesson`, `LessonInstance`, `CoachLevel`,
  `Club`, `Association_CoachLessonInstance`,
  `Association_PlayerLessonInstance`, `Message`.
- Used by: (none — leaf test file)
- Semantically related (not imports): its seed helpers intentionally
  mirror `test_boolean_coercion.py`'s reminder/decline scaffolding
  (`_seed_coach_and_student`, `_seed_instance`, `PATCHES`); shares the
  reminder-response domain (`respond_to_reminder`, `send_class_reminders`)
  with `test_boolean_coercion.py`'s `TestPad69NoFollowupAfterDecline`.
