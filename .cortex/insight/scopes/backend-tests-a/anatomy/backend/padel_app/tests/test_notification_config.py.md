---
path: backend/padel_app/tests/test_notification_config.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 524
size_tokens: 5317
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "43de9a8b41f01c7284626cfddef65a32905d1e762a3c98e0113c4d81fb2c623b"
---

## Purpose

The `NotificationConfig` model and its `notification_service` read/write
helpers. Notably, many tests are marked `pytest.mark.new_backend` — a
TDD-forward marker for fields the docstring says "require the backend to
be updated" (`invitation_groups`, `tiebreakers`, the full `reminderTiming`
composite payload, `excludedPlayers`/`excludeUnpaidSubscription`
restrictions) and were written to fail until model migrations/service
wiring landed (elsewhere in the suite, e.g.
`test_effective_level_resolution.py` and `test_level_ladder_ordering.py`,
`invitation_groups` is already used against a real config, so this marker
set may now be stale/passing). `TestDefaultRestrictions`/
`TestDefaultMessageTemplates` pin the shape of the module-level
`DEFAULT_RESTRICTIONS`/`DEFAULT_MESSAGE_TEMPLATES` dicts (required keys,
default values, `{name}` placeholders). `TestGetRestrictions`/
`TestGetMessageTemplates` pin the merge-with-defaults accessor behavior
(stored overrides win, unset keys fall back) using `fresh_config`/
`config_with_overrides` fixtures built via `NotificationConfig()`
constructed OUTSIDE an app context (bare `__new__`-style attribute
assignment, not a real DB-backed instance) — a lighter-weight pattern than
the DB-fixture style used elsewhere in this scope.
`TestDefaultReminderTiming`/`TestRepeatReminderSettings` pin
`get_reminder_timing`/`get_invitation_start_timing`/`get_reminder_count`/
`get_hours_between_reminders`, including floor-at-1 and fallback-on-bad-value
semantics; `TestRepeatReminderSettings` explicitly builds its config
inside a real `app.app_context()` (via the `app` fixture) because it needs
the SQLAlchemy mapper instrumented for attribute assignment to work,
unlike the bare-constructor fixtures above. `TestInvitationGroups`/
`TestTiebreakers` (both `new_backend`) pin the 3-group and 5-tiebreaker
defaults and that `get_config_dict`'s source literally contains the
`"invitationGroups"`/`"tiebreakers"` JSON keys (checked via
`inspect.getsource`, a structural rather than behavioral assertion).
`TestUpdateConfigPayload` (`new_backend`) exercises `update_config`
end-to-end against a real coach (`make_coach`): saving invitation groups,
tiebreakers, the full composite `reminderTiming` payload
(`firstReminder`/`reminderCount`/`hoursBetweenReminders`/
`invitationStart`), and the two new restriction keys.

## Connections

- Uses: `padel_app.models.notification_config`
  (`NotificationConfig`, `DEFAULT_RESTRICTIONS`,
  `DEFAULT_MESSAGE_TEMPLATES`, `DEFAULT_REMINDER_TIMING`,
  `DEFAULT_INVITATION_START_TIMING`, `default_templates_for_locale`);
  `padel_app.services.notification_service` (`update_config`,
  `get_config_dict`); `padel_app.tests.helpers.make_coach`.
- Used by: (none — leaf test file)
- Semantically related (not imports): `invitation_groups` and
  `tiebreakers` here are the same config fields consumed by the
  invitation-engine rule logic in `test_effective_level_resolution.py`
  and `test_level_ladder_ordering.py` (`get_or_create_config`,
  `config.invitation_groups = [...]`); `get_message_templates`/
  `resolve_message_template` fallback behavior is the exact mechanism
  `test_notification_blank_template_fallback.py` pins against blanks.
