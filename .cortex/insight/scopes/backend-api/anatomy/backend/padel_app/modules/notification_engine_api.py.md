---
path: backend/padel_app/modules/notification_engine_api.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 3
size_lines: 637
size_tokens: 5818
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "00edf484efbbacc2faaf7768b336511673748617ee9de49cb1ba39ba4086d362"
---

## Purpose

The coach-facing (and player-response) notification-engine API (`/api/app/notify`) — configuration, manual/automatic sends, eligibility warnings, waiting lists, and player responses to invitations/reminders/waiting-list offers. Every route is `@jwt_required()`; coach-only routes additionally resolve the caller's `Coach` profile via `_current_coach()` and 403 if the JWT belongs to a non-coach user. Almost all business logic lives in `padel_app.services.notification_service` and sibling services — this file is thin route plumbing plus request validation, ownership scoping, and a handful of routes with real inline logic (eligibility-impact reporting, availability-conflict scoping). The file ends with two `E2E_DEBUG_ENDPOINTS`-gated test-helper routes that fabricate/reset seeded E2E fixtures directly through the app's own persistence layer.

## Main players

- `_current_coach()` (lines 42-47) — critical. Resolves `User` from the JWT identity, 403s if the user has no `Coach` profile — the guard nearly every coach-only route in this file opens with.
- `_resolve_instance(model, original_id, date_str)` (lines 50-57) — critical. Shared helper turning a `{model, originalId, date}` request payload (the client's generic occurrence reference, matching the calendar event id shape) into a real `LessonInstance`, materializing one via `lesson_service.get_or_materialize_instance` if the client referenced an unmaterialized `Lesson` occurrence by date.
- `POST /config` `save_config` (lines 81-101) — critical. Saves the coach's notification config; when the payload touches `eligibilityRules`, also computes `eligibilityImpact.affected` (PAD-133) — students already enrolled who would fail the new bar — purely informational, the save is never blocked and no one is un-enrolled or notified (rule 8: warn, don't block).
- `POST /eligibility_check` `eligibility_check` (lines 104-135) — critical. Read-only pre-check the coach's client calls BEFORE hand-adding students to a class, returning only the students who FAIL with structured (not prose) reasons — deliberately kept separate from the class-edit save path so ignoring the warning still lets the coach enroll anyone (PAD-133 rules 6-7).
- `POST /manual` `manual_notify` (lines 154-182) — critical. Sends manual notifications, but first computes who will be skipped and merges two independently-sourced blocked-lists: `blocked_players_for_instance` (student marked themselves unavailable, PAD-107 — details kept private) and `preference_blocked_players(..., kind="manual")` (student opted out of coach-picked invitations, PAD-112 — the student's own stated reason, coach-visible). A student hit by both keeps the PAD-112 entry, since that reason is meant to be shown.
- `POST /send_reminders` `send_reminders` (lines 185-204) — critical. Comment records a past bug: this used to report `len(instance.players_relations)` as the sent count, which lied whenever a student had already responded, hit their reminder cap, was unavailable (PAD-107), or blocked all notifications (PAD-112) — now reports the service's actual `sent`/`blocked` counts.
- `POST /availability_conflicts` `availability_conflicts` (lines 207-269) — critical. Given a proposed class window and player ids, returns which of those players marked themselves unavailable — but only for player ids that belong to the calling coach's own roster (foreign ids silently dropped, not rejected, so the response can't be used to probe an arbitrary player's availability), and returns names only, never the blocker's title/description/hours (private).
- Player-response routes: `POST /respond`, `POST /respond_reminder`, `POST /cancel_attendance`, `POST /respond_waiting_list` (lines 291-339) — critical. Called by the player app when they act on an invite/reminder/waiting-list offer, or cancel a confirmed attendance (only before class start — `cancel_attendance` returns 409 otherwise).
- `POST /coach_respond` `coach_respond` (lines 351-360) — critical. Coach manually records a player's yes/no on the coach's behalf (e.g. a phone-call response).
- `POST /approval/respond` `approval_respond` (lines 363-378) — supporting. Semi-automatic replacement-approval bundle response (`yes_now`/`yes_at_window`/`dismiss`); delegates to `replacement_approval_service`, imported lazily.
- `POST /process_rounds` `process_rounds` (lines 381-386) — critical. No coach scoping at all — intended for a cron job / periodic poller, processes ALL pending invitation batches system-wide.
- Standing waiting list CRUD: `GET/POST /standing_waiting_list`, `DELETE /standing_waiting_list/<id>` (lines 389-419) — supporting.
- `_debug_endpoints_enabled()` (lines 438-444) and the two `/debug/*` routes (lines 447-636) — critical to understand, not to modify casually. Double-gated (PAD-92): a deploy flag `E2E_DEBUG_ENDPOINTS` (checked in `app.config` first, then env — absent means off, and it is deliberately never defined in `config.py`) AND `@jwt_required()`, so even a misconfigured environment still requires a valid token. `debug_schedule_reminder_test` fabricates a full `Lesson`/`LessonInstance`/enrollment/`Presence` graph for the seeded e2e-coach and two e2e-students, then calls the real scheduler (`schedule_instance_jobs`) so a reminder job actually fires — used by Playwright to assert real end-to-end reminder delivery rather than mocking the scheduler. `debug_reset_presence` (PAD-73) restores a seeded student's enrollment/presence to a known "invited, not yet answered" state after a proactive-decline test, so the shared E2E seed DB's fixtures stay reusable across specs without any test touching the DB directly.

## Insights

- The double-gate on the debug routes is deliberately redundant, not accidental belt-and-braces: the comment explains the flag alone is not enough (a misconfigured env would open unauthenticated data-fabrication routes) and `@jwt_required()` alone is not enough either (any authenticated user in prod could otherwise fabricate lessons) — removing either check independently reopens a real gap the other doesn't cover.
- `manual_notify`'s blocked-list merge order matters: `blocked_by_id` is built from availability blockers first, then overwritten by preference blockers for any player id present in both — so if a future third blocking reason is added, its insertion order relative to these two determines which reason a doubly-blocked student is shown, and that choice is a coach-visibility decision (PAD-112's reason is the student's own words; PAD-107's stays private), not an arbitrary dict-merge detail.
- `process_rounds` is the one route in this file that does no coach/ownership scoping whatsoever — by design, since it drives a periodic system-wide job, not a per-coach action; a review that added `_current_coach()` to it would break the cron caller.
- `availability_conflicts` returning `{"blocked": []}` (not a 403) for foreign player ids is a deliberate information-hiding choice — silently dropping ids you don't own means the endpoint's response shape gives no signal about whether an id you don't recognize even exists as a player.

## File map

Lines 1-39: imports, blueprint declaration.
Lines 42-57: shared helpers (`_current_coach`, `_resolve_instance`).
Lines 60-135: player search, config get/save (with PAD-133 eligibility impact), eligibility pre-check.
Lines 138-269: class-notification toggle, manual notify, send reminders, availability conflicts.
Lines 272-360: notification groups/activity read routes, player-side respond/respond_reminder/cancel_attendance/respond_waiting_list, waiting-list read, coach_respond.
Lines 363-419: replacement-approval response, cron-driven process_rounds, standing-waiting-list CRUD.
Lines 422-636: E2E debug-only routes (`_debug_endpoints_enabled` gate, `debug_schedule_reminder_test`, `debug_reset_presence`).

## Connections

- Uses: `padel_app.models` (`Lesson`, `LessonInstance`, `User`, plus several lazily imported inside the debug routes: `Club`, `Association_CoachLesson`, `Association_CoachLessonInstance`, `Association_PlayerLessonInstance`, `Presence`, `Association_CoachPlayer`, `Player`); `padel_app.utils.dates.utcnow_naive`; `padel_app.services.lesson_service.get_or_materialize_instance`; `padel_app.services.notification_service` (the bulk of the business logic — `get_config_dict`, `update_config`, `send_class_reminders`, `send_manual_notifications`, `trigger_invitations`, `process_invitation_batches`, `get_notification_activity`, `get_notification_groups`, `get_waiting_list`, `respond_to_notification`, `respond_to_reminder`, `cancel_attendance`, `respond_to_waiting_list`, `coach_respond_to_notification`, `get_standing_waiting_list`, `add_standing_waiting_list_entry`, `remove_standing_waiting_list_entry`, `eligibility_failures_for_players`, `students_failing_eligibility_bar`); `padel_app.services.player_service.search_coach_players`; `padel_app.services.student_availability_service` (`blocked_player_ids_for_window`, `blocked_players_for_instance`); `padel_app.services.student_notification_preferences.preference_blocked_players`; `padel_app.services.replacement_approval_service.respond_to_approval` (lazy import); `padel_app.scheduler` (`schedule_instance_jobs`, `_compute_reminder_dt`, `ensure_scheduler_ready`, lazy import) — all outside this scope except `models`
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `notification_engine_api.bp`; this is the coach app's entire notification-settings/manual-send/waiting-list surface, and the player app's response-to-invite surface

## Query pointers

If you're changing how a student gets skipped from a send, also read: `padel_app/services/student_availability_service.py` and `padel_app/services/student_notification_preferences.py` (outside this scope) — both `manual_notify` and `send_reminders` depend on the same two blocking mechanisms staying consistent.
If you're touching eligibility rules, read first: `eligibility_check` and `save_config`'s `eligibilityImpact` block together — they share the "warn, never block" contract (PAD-133 rule 8) and must both stay read-only/non-blocking.
If you're adding a new debug/E2E-only route, read: the `_debug_endpoints_enabled` double-gate pattern and copy it exactly — a debug route without both checks is a production data-fabrication hole.
