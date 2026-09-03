---
path: backend/padel_app/models/notification_config.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 3
size_lines: 340
size_tokens: 3782
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fd765b681c69a7d033da43e9b89bce7f027a4401af7b51cf6945633505864595"
---

## Purpose

One-per-coach (unique coach_id) JSON-heavy configuration record driving the entire automatic/semi-automatic invitation and notification engine (the engine itself is an out-of-scope service): priority_criteria, restrictions (caps like maxSimultaneous/maxTotal/quietHours/cancellationDeadlineHours), rounds (ordered eligibility passes), notification_groups, message_templates (with separate PT/EN default dicts), reminder_timing (a nested legacy-vs-flat shape), invitation_groups (PAD-128/129 eligibility bar) and eligibility_rules (PAD-128, same 'no default' treatment). Every JSON column has a defaulting getter, `get_X()`, following `return self.X if self.X is not None else DEFAULT_X` -- except the two eligibility-related columns, which deliberately do not.

## Main players

- **NotificationConfig** (lines 231-241, critical): the per-coach config row; ~15 JSON columns plus their defaulting getters.
- **resolve_message_template** (lines 185-203, critical): module-level helper: resolves one template key to guaranteed non-blank text, falling back through stored -> locale default -> "" (PAD-67) -- the shared 'never send a blank message' guard.
- **NotificationConfig.get_eligibility_rules** (lines 298-312, critical): returns the stored eligibility_rules list VERBATIM, or None -- deliberately no default (PAD-128): None and [] both mean 'no bar, everyone eligible'.
- **NotificationConfig.get_invitation_groups** (lines 292-293, critical): same deliberate-no-silent-default caution applies conceptually, though this getter still falls back to DEFAULT_INVITATION_GROUPS -- see Insights (PAD-122).
- **NotificationConfig.get_cancellation_deadline_hours** (lines 201-217, critical): hours before class start after which a cancellation is flagged late; called cross-file by serializers/lesson.py.

## Insights

- This file encodes a real, in-code-documented design rule: most JSON columns get a `DEFAULT_X if None` getter, but `eligibility_rules` deliberately does NOT, because a non-empty default would silently turn 'unset = everyone eligible' into a real filter. The long comment above `eligibility_rules` states that `get_invitation_groups()` falling back to a non-empty DEFAULT_INVITATION_GROUPS is EXACTLY that bug, one layer down (PAD-122) -- i.e. get_invitation_groups still has the bug pattern that eligibility_rules was deliberately written to avoid. Any new JSON column added here needs a conscious choice between the two patterns, not the reflexive default-getter template.
- `get_reminder_timing`/`get_invitation_start_timing` both special-case a nested-vs-flat legacy shape (`if "firstReminder" in self.reminder_timing`), implying the stored JSON shape changed over time and both forms must still be readable from existing rows.
- Locale-specific message templates exist only for 'pt' and a generic fallback; `default_templates_for_locale` treats anything not starting with "pt" as the English set -- there is no per-locale extension point beyond that binary split.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/coaches.py: coach relationship (no back_populates declared)
- backend/padel_app/models/lesson_instances.py: get_cancellation_deadline_hours() is applied against a LessonInstance's start_datetime by serializers/lesson.py, not by this file
- backend/padel_app/models/vacancy.py: restrictions.maxInactiveTime is checked against Vacancy.last_activity_at by an out-of-scope service
- backend/padel_app/serializers/lesson.py: serialize_class_instance imports and queries this model (function-local) to compute cancellationDeadline and the proactive-decline window

## Query pointers

- If you need to add a new configurable JSON column, read the `eligibility_rules` comment first and decide deliberately whether it needs a non-empty default (PAD-122/128).
- If you need to change message templates, also read: the PT dict alongside the EN one -- keep both in sync, and route through `resolve_message_template` rather than reading the column directly.
