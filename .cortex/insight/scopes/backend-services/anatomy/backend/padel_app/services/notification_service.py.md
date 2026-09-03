---
path: backend/padel_app/services/notification_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 3
size_lines: 3991
size_tokens: 39299
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "71c7805d018e1263b1797ff47f148b1d7ad3c732bf9f3329453afb4060a53c89"
---

## Purpose

The notification/invitation engine — by far the largest and most
central file in this scope, and the practical heart of the "smart
invitations" product feature. Covers: class reminders (ask enrolled
students "are you coming?" and re-arm follow-ups); the vacancy/
invitation lifecycle (a spot opens when a student declines or a class
was never fully enrolled → candidates are ranked and invited in waves
→ a "yes" fills the spot and retires every other pending offer for it);
an eligibility BAR (a hard admission gate, independent of and evaluated
before the wave/round criteria that only RANK candidates); a
first-in/first-out waiting list (both per-class and "standing" —
auto-fanned across a coach's future classes); manual (coach-picked)
notifications; and the activity feed. Every message send funnels
through one choke point (`_send_system_message`) that enforces two
additive suppression rules (student marked unavailable for that slot;
student blocked notifications outright) so no future call site can
bypass either by accident.

## Main players

- `effective_level_id` / `effective_level` / `effective_level_code` /
  `_vacancy_level` (lines 191–446) — critical. PAD-86: the single level-
  resolution cascade (instance → parent lesson's `default_level_id`)
  used EVERYWHERE a class's level matters, because resolving the
  fallback inconsistently is exactly how a structural vacancy could end
  up with `level_id = None` and every level rule then read that as "no
  filter" — inviting the coach's entire roster instead of nobody.
- `effective_eligibility` / `passes_eligibility` / `eligibility_failures`
  / `eligibility_failures_for_players` / `students_failing_eligibility_bar`
  (lines 247–434) — critical. PAD-128/129/133: the ELIGIBILITY BAR — a
  hard per-coach admission gate, conceptually distinct from and
  evaluated BEFORE the wave/round criteria that only rank already-
  admitted candidates. `None`/`[]` both mean "everyone eligible" (never
  "exclude everybody" — that state is reserved for a defined-but-
  unsatisfiable bar). `eligibility_failures` is the reason-reporting
  sibling of `passes_eligibility`, running the SAME evaluator
  (`_group_rule_failures`) so the yes/no answer and its explanation can
  never drift apart.
- `_group_rule_failures` / `_passes_group_rules` (lines 654–895) —
  critical, the single rule-evaluation engine shared by TWO callers with
  TWO rule vocabularies: invitation-group rules anchor on a `Vacancy`
  (`*_vacancy` operations) and eligibility rules anchor on a class with
  `vacancy=None` (`*_class` operations) — forking this evaluator would
  let "may this student join" and "why not" drift apart, the same class
  of bug PAD-133 fixes for eligibility vs. invitation groups. Records
  failures as structured data (`{attribute, operation, actual,
  threshold, ladder_distance, reason}`), never prose — locale rendering
  belongs to the client. `short_circuit=True` (the hot invitation-engine
  path) stops at the first failure; `short_circuit=False` (the coach-
  facing reason path) evaluates every rule.
- `_get_eligible_students_for_group` / `get_eligible_students` (lines
  898–1080) — critical. The two parallel candidate-ranking pipelines —
  invitation-GROUP based (newer) and round/criteria based (legacy) — both
  apply, in strict order: exclude already-enrolled/already-invited →
  eligibility bar → coach-configured restrictions (excluded players,
  unpaid subscriptions) → group/round criteria → PAD-28 availability-
  blocker filter → PAD-112 preference-block filter → priority-criteria
  sort. The two blocker filters are DELIBERATELY separate and additive:
  one asks "are they free at this hour", the other "do they want to be
  asked at all" — and both are applied here, before a `NotificationEvent`
  is ever created, specifically so the engine never creates an event it
  will never be able to deliver a reply for.
- `_send_system_message` (lines 1239–1362) — critical, THE single
  message-delivery choke point for the whole engine. Enforces, in
  sequence: PAD-67 (refuse to send an empty rendered body), PAD-107
  (suppress if the recipient marked themselves unavailable for the
  specific class-slot solicitation types in `_BLOCKABLE_MESSAGE_TYPES`),
  PAD-112 (suppress if the recipient blocked ALL notifications) — both
  block-checks are explicitly documented as SAFETY NETS, not primary
  enforcement (the primary enforcement is earlier, in the eligible-
  student filters and `send_manual_notifications`); blocking only here
  would leave `NotificationEvent` rows marked "sent" with no message
  behind them. Then creates the `Message`, publishes an SSE event, and
  fires BOTH web push and (when a lesson-instance id is resolvable)
  native Expo push.
- `_instance_is_over` (lines 1599–1613) — critical, small but load-
  bearing. PAD-68: the one staleness predicate (`status in
  ("canceled","completed")` or `start_datetime <= now`) that EVERY
  response handler (`respond_to_reminder`, `respond_to_notification`,
  `coach_respond_to_notification`, `respond_to_waiting_list`) and
  `trigger_invitations`/`_send_invitation_batch` consult before acting —
  so a late tap on a stale reminder/invite can never resurrect the
  engine for a class that already happened.
- `send_class_reminders` (lines 1776–1992) — critical. Called by the
  scheduler at reminder time; sends up to `reminderCount` reminders per
  student, superseding (PAD-49) each student's own previous un-actioned
  reminder before sending a new one so only the latest stays actionable;
  reports `more_due` so the scheduler's `_maybe_rearm_reminder` knows to
  fire another pass; filters out students blocked via PAD-107/PAD-112
  (only the "all" preference level — invitation-only blocks leave
  reminders for an ALREADY-enrolled class alone).
- `respond_to_reminder` / `_free_spot_for_declining_player` (lines
  2201–2404) — critical. PAD-94: idempotent — re-submitting the SAME
  answer already on record (when there's no newer pending reminder to
  answer) is a no-op, because in production one student tapped "No"
  eight times in 62 seconds and re-drove the invitation engine eight
  times. `_free_spot_for_declining_player` is the SHARED vacancy-
  creation/invite-trigger path reused verbatim by both a reminder
  decline and `cancel_attendance` — cancellation is explicitly NOT a
  separate fork of this logic.
- `cancel_attendance` / `proactive_decline_deadline` /
  `proactive_decline_window_is_open` (lines 2406–2643) — critical.
  PAD-73: a student can cancel BEFORE class start; the SAME endpoint
  classifies a cancellation as "proactive" (volunteered before the
  reminder would even have fired — the cutoff is DERIVED from the
  coach's live reminder timing config, never hardcoded) vs. "late"
  (at/after `cancellationDeadlineHours` before start) — there is
  deliberately only one code path so a stale client can never mislabel
  its own request. PAD-73/88/115: authorization is on ENROLMENT
  (`Association_PlayerLessonInstance`), not on the presence row's mere
  existence — the earlier version let any signed-in student drive a
  real vacancy/invitation fan-out against an arbitrary instance.
- `_send_invitation_batch` (lines 2686–2811) — critical, the other
  choke point: EVERY automatic invitation message flows through here
  (from `trigger_invitations`, `process_invitation_batches`,
  `_advance_round`, `_send_next_on_decline`), so the PAD-68 staleness
  check here backstops all four callers at once. Checks the waiting
  list first (placement beats a fresh invite round), computes batch
  size from `maxSimultaneous`/remaining `maxTotal` budget, and enforces
  `_check_per_student_daily_limit` per candidate.
- `trigger_invitations` (lines 2881–2955) — critical, the main external
  entry point (called by the scheduler's `invite_start` job, or
  immediately on a decline once the window is open). In semi-automatic
  mode, creates `ReplacementApprovalPrompt`s (via
  `replacement_approval_service`) BEFORE the restrictions check runs —
  so the coach is asked exactly once regardless of restriction state,
  since the `invite_start` DateTrigger only fires a single time.
- `process_invitation_batches` (lines 2962–3022) — critical, the
  recurring 2-minute APScheduler tick. Also runs `expire_stale_invitations`
  (a full sweep for classes that ended with nobody ever tapping a
  button) as a side effect of the SAME tick, deliberately reusing the
  existing job rather than registering a new one.
- `respond_to_notification` / `coach_respond_to_notification` (lines
  3029–3258) — critical. Player-facing and coach-facing "yes/no" on an
  invite; a "yes" that loses the capacity race (another player filled
  it first, or `_effective_filled_spots` re-check fails) auto-offers the
  waiting list instead of just failing.
- `_check_waiting_list` / `_fill_from_waiting_list` (lines 3486–3692) —
  critical. PAD-122/123/128: the waiting-list PLACEMENT path is hard-
  gated on eligibility, restrictions, and the availability-blocker
  filter — all previously honoured by the invitation path but skipped
  by the fill path, which the PAD-122/123 comments flag as WORSE than a
  gap in the invite path (placement is silent enrolment; a student on
  the invite path can at least decline). Unconditionally excludes
  players already enrolled OR already `absent`-presenced on the
  instance — the `absent` half matters because the student whose OWN
  decline created the vacancy still holds both an enrolment association
  and an absent presence, and without excluding both they get placed
  right back into their own vacancy.
- `add_standing_waiting_list_entry` / `_fan_out_standing_entry` /
  `_sync_standing_entries_for_new_instance` (lines 3813–3956) —
  critical. A "standing" entry auto-fans into a per-class
  `WaitingListEntry` for every upcoming instance of the coach at
  creation time (`_fan_out_standing_entry`) AND every time a NEW
  instance later materializes (`_sync_standing_entries_for_new_instance`,
  called from `lesson_service.get_or_materialize_instance` inside a
  savepoint). PAD-109: reactivates an existing inactive row rather than
  inserting, because the `(lesson_instance_id, player_id)` uniqueness
  constraint doesn't include `is_active` — removing then re-adding a
  standing entry used to hit a `UniqueViolation` 500.
  `_sync_standing_entries_for_new_instance` documents a strict contract:
  it must use `add_to_session()`/`flush()` only, NEVER commit, because
  its caller runs it inside its own savepoint and any `Model.create()`
  (which commits) would end that savepoint out from under the caller.

## Insights

- The file is organized as ~15 clearly delimited `# ---` sections in a
  strict top-to-bottom pipeline order: config → level resolution →
  ranking helpers → invitation-group/eligibility rule evaluation →
  restriction checks → message/conversation helpers → vacancy helpers →
  reminder flow → staleness/idempotency → invitation batch machinery →
  main trigger → recurring batch job → response handlers → manual
  notifications → waiting list → notification groups → standing waiting
  list → activity feed. This mirrors the actual runtime call graph more
  than alphabetical or class-based organization would.
- The codebase distinguishes THREE separate suppression concepts that
  are easy to conflate: (1) the ELIGIBILITY BAR (`effective_eligibility`
  /`passes_eligibility`, PAD-128) — a hard admission gate, always
  checked FIRST; (2) invitation-group/round CRITERIA — rank/filter
  candidates who already cleared the bar, evaluated by the SAME
  `_group_rule_failures` engine but a different rule vocabulary; (3)
  STUDENT-SIDE opt-outs — availability blockers (PAD-107,
  `student_availability_service`) and notification preferences
  (PAD-112, `student_notification_preferences`), both additive and
  enforced independently at multiple points (candidate filtering AND
  the `_send_system_message` backstop).
- Almost every ticket referenced in comments (PAD-68, 70, 73, 86, 94,
  107, 112, 122, 123, 128, 133) documents a REAL regression this exact
  code now guards against — the comments are load-bearing documentation
  of why a given check exists, not incidental narration. Removing any
  of them (e.g. the PAD-68 staleness check in a response handler, or
  the PAD-94 idempotency check in `respond_to_reminder`) would silently
  reintroduce the original bug rather than fail a test, since most of
  these are race/timing conditions.
- Ladder-position comparisons (never raw `display_order` integers) recur
  throughout this file's level logic (`_level_ids_one_above/_below`,
  `_ladder_distance`, the `all_above_vacancy`/`all_below_vacancy`/
  `equal_or_above_class` etc. rule branches in `_group_rule_failures`) —
  see `level_ladder.py` for why (PAD-70). A change to level comparison
  logic anywhere in this file should go through `level_ladder.py`'s
  helpers, never compare `display_order` directly.
- `_check_restrictions`'s quiet-hours check and
  `_check_per_student_daily_limit`'s "per day" boundary both convert
  through `CLUB_TZ` (from the leaf module `utils.dates`, not a lazy
  import from `scheduler` — PAD-144 removed that import cycle rather
  than working around it) — both document the same DST failure mode as
  `scheduler.py`'s `_compute_timing_dt`: a naive UTC-hour comparison
  drifts an hour during Portuguese summer time and is correct only in
  winter, so the bug looks intermittent.
- Scheduler-adjacent state transitions in this file are careful about
  the ORDER of side effects vs. persistence: e.g.
  `_free_spot_for_declining_player` always pre-creates the vacancy
  before checking whether to send immediately, "so the invite_start job
  finds it when window opens" even if invitations aren't triggered yet;
  and PAD-73's `invite_not_before` stamping on the vacancy (not just
  skipping `trigger_invitations`) is necessary because
  `process_invitation_batches` runs independently every 2 minutes and
  would otherwise invite replacements within minutes of an early decline.

## File map

- Lines 1–86: module docstring (full API index) + `_BLOCKABLE_MESSAGE_TYPES`.
- Lines 88–185: Config helpers (`get_or_create_config`, `get_config_dict`,
  `update_config`, `_is_semi_auto`).
- Lines 187–446: Level resolution (PAD-86) + the eligibility bar
  (PAD-128/129/133): `effective_level_id`, `effective_level`,
  `_vacancy_level`, `effective_eligibility`, `passes_eligibility`,
  `eligibility_failures`, `eligibility_failures_for_players`,
  `students_failing_eligibility_bar`, `effective_level_code`.
- Lines 449–566: Student ranking helpers: `_level_sort_key`, side
  matching (`_side_eligible`, `_side_preference_rank`), `_attendance_stats`,
  `_build_sort_key`, `_unjustified_absence_count`.
- Lines 569–968: Invitation-group / rule-evaluation core: `_has_makeups`,
  `_level_ids_one_above`/`_below`, `_compare`, `_ladder_distance`, the
  big `_group_rule_failures` evaluator, `_passes_group_rules`,
  `_get_eligible_students_for_group`, `get_eligible_students`.
- Lines 1083–1155: Restriction checks: `_check_restrictions`,
  `_check_per_student_daily_limit`.
- Lines 1157–1497: Conversation/message helpers: `_format_template`,
  `_PT_WEEKDAYS`/`_weekday_pt`, `_level_label`, `_resolve_locale`,
  `_format_weekday`, `_get_or_create_direct_conversation`,
  `_send_system_message` (the delivery choke point),
  `_notify_coach_of_cancellation`, `_format_class_when`.
- Lines 1499–1591: `collect_cancellation_recipients` /
  `notify_students_of_cancellation` (PAD-75 class-removal notice).
- Lines 1593–1621: `_user_id_for_player`, `_instance_is_over` (PAD-68),
  `_effective_filled_spots`.
- Lines 1623–1704: `_add_player_to_instance`, `_broadcast_spot_filled`.
- Lines 1707–1769: Vacancy creation: `_create_vacancy_for_absent_player`,
  `_create_structural_vacancies`.
- Lines 1772–1992: Reminder flow: `send_class_reminders`.
- Lines 1995–2122: Staleness sweep: `_expire_stale_reminders`,
  `_retire_invite_message`, `_expire_stale_invitations`,
  `expire_stale_invitations` (public, called from the 2-min tick).
- Lines 2124–2404: Reminder-response idempotency (PAD-94):
  `_pending_reminder_message`, `_recorded_reminder_action`,
  `_vacancy_has_live_invitations`, `respond_to_reminder`,
  `_free_spot_for_declining_player`.
- Lines 2406–2643: Proactive decline (PAD-73): `proactive_decline_deadline`,
  `proactive_decline_window_is_open`, `cancel_attendance`.
- Lines 2646–2680: `_trigger_vacancy_for_player`, `_ensure_vacancy_for_player`.
- Lines 2686–2846: Invitation batch machinery: `_send_invitation_batch`
  (chokepoint), `_advance_round`, `_send_next_on_decline`.
- Lines 2849–2955: Main trigger: `_find_or_create_open_vacancies`,
  `trigger_invitations`.
- Lines 2962–3022: `process_invitation_batches` (recurring 2-min job).
- Lines 3029–3258: `respond_to_notification`, `coach_respond_to_notification`.
- Lines 3265–3362: `send_manual_notifications`.
- Lines 3369–3703: Waiting list: `_offer_waiting_list`,
  `respond_to_waiting_list`, `get_waiting_list`, `_check_waiting_list`,
  `_fill_from_waiting_list`.
- Lines 3708–3806: Notification groups (manual notify modal):
  `_students_with_recent_absences`, `_students_with_justified_absences`,
  `_serialize_cp_for_group`, `get_notification_groups`.
- Lines 3813–3956: Standing waiting list: `_deactivate_standing_entry`,
  `_fan_out_standing_entry`, `add_standing_waiting_list_entry`,
  `remove_standing_waiting_list_entry`, `get_standing_waiting_list`,
  `_sync_standing_entries_for_new_instance`.
- Lines 3963–3990: Activity feed: `get_notification_activity`.

## Connections

- Uses: `padel_app.sql_db.db`; `padel_app.utils.dates` (`CLUB_TZ`,
  `club_day_start_utc`, `to_utc_iso`, `utcnow_naive`); `padel_app.models`
  (`Association_CoachLessonInstance`, `Association_CoachPlayer`,
  `Association_PlayerLessonInstance`, `LessonInstance`,
  `NotificationConfig`, `NotificationEvent`, `Presence`, `Vacancy`,
  `WaitingListEntry`, plus lazily-imported `Coach`, `Player`, `Message`,
  `Conversation`, `ConversationParticipant`,
  `Association_PlayerLessonInstance`); `padel_app.models.standing_waiting_list_entry.StandingWaitingListEntry`;
  `padel_app.models.notification_config` (`DEFAULT_*` constants,
  `default_templates_for_locale`, `resolve_message_template`);
  `padel_app.realtime.publish`; `services/level_ladder.py`
  (`get_level_ladder`, `ladder_index`, `ladder_index_map`);
  `padel_app.utils.push_notifications.send_push_notification`; lazily:
  `padel_app.scheduler` (`_compute_invite_start_dt`,
  `_compute_reminder_dt`, `reschedule_all_future_jobs`);
  `services/student_availability_service.py`
  (`filter_blocked_coach_players`, `blocked_players_for_instance`,
  `blocked_player_ids_for_window`, `instance_window_is_blocked_for_user`);
  `services/student_notification_preferences.py`
  (`filter_preference_blocked_coach_players`, `user_blocks_all_notifications`,
  `player_blocks_manual_invitations`, `preference_blocked_players`);
  `services/replacement_approval_service.py` (`create_approval_prompts`
  — semi-automatic mode); `padel_app.utils.expo_push.send_expo_push_to_user`;
  `padel_app.serializers.message.serialize_message`; `babel.dates.format_date`.
- Used by: `scheduler.py` (`get_or_create_config`, `send_class_reminders`,
  `trigger_invitations`, `process_invitation_batches`); `services/lesson_service.py`
  (`_sync_standing_entries_for_new_instance`, `collect_cancellation_recipients`,
  `notify_students_of_cancellation`); `services/replacement_approval_service.py`
  (`_get_eligible_students_for_group`, `_serialize_cp_for_group`,
  `get_eligible_students`, `_check_waiting_list`, `get_or_create_config`,
  `trigger_invitations`); `services/player_service.py` (none directly —
  see `student_notification_preferences.py` instead);
  `utils/notification_preview.py` (`get_or_create_config`, and
  independently reimplements `process_invitation_batches`'s inactivity
  logic for dry-run simulation).

## Query pointers

- If you need to change WHO gets invited/eligible for a class, start at
  `_group_rule_failures` (the one rule evaluator) and trace which of
  its two callers (`_passes_group_rules` for invitation groups,
  `eligibility_failures`/`passes_eligibility` for the bar) applies to
  your case — do not add a parallel rule-checking function.
- If you need to change WHEN/HOW a message is actually delivered
  (suppression, push channels, empty-body handling), read
  `_send_system_message` — it is the single choke point, and any new
  suppression rule belongs there (plus, per the PAD-107/112 pattern, an
  earlier filter at candidate-selection time so the engine never wastes
  a `NotificationEvent` on someone who can't receive it).
- If you're debugging a class that "should have sent notifications but
  didn't," check `_instance_is_over` and `_check_restrictions` first —
  both are called at multiple entry points and either one silently
  short-circuits the whole flow with no error.
- If you need to trace the vacancy/invitation lifecycle end to end,
  follow: a decline or `cancel_attendance` → `_free_spot_for_declining_player`
  → `_ensure_vacancy_for_player`/`trigger_invitations` →
  `_send_invitation_batch` → `respond_to_notification` (yes fills the
  spot via `_add_player_to_instance` + `_broadcast_spot_filled`, no
  advances via `_send_next_on_decline`) — `process_invitation_batches`
  is the periodic fallback that drives the SAME `_send_invitation_batch`
  chokepoint for vacancies nobody has responded to.
- If you need to touch the waiting list, read `_check_waiting_list`'s
  full exclusion chain (already-in-class, restrictions, eligibility,
  availability blockers) before adding a new filter — every one of
  those was added to close a specific gap versus the invitation path
  (PAD-122/123), and a new filter should follow the same pattern.
