# Findings — LevApp Data Model Audit (2026-09-02)

Every finding in the audit, keyed by the audit's own ids. Evidence paths are as written
in the audit, relative to the pre-monorepo `levelup_backend` repo at `98d58ca`; in the
monorepo they live under `backend/padel_app/`. "verified" means the audit reproduced it
by running code or reading the exact lines.

Severity is the worst plausible outcome; likelihood, blast radius, fix cost and fix risk
are as the audit rated them.

## Critical

### C1 — Unauthenticated account takeover through the activation route (verified)
`POST /api/app/activate/user/<id>` has no JWT, no token, no check that the account is
still inactive, and feeds the body through the User edit form (password, username, email,
phone, status writable; only `is_admin`/`is_superadmin` stripped). User ids are
sequential. The authz test suite allow-lists the route as a "public write". Companion
leak: `GET /api/app/register/user/<id>` returns any user's name, username, email and
phone with no auth.
Evidence: `modules/frontend_api.py:498-502, 484-495`, `services/user_service.py:45-56`,
`models/users.py` form, `tests/test_frontend_api_authz.py:441-445`.
Likelihood trivial · blast radius every account · fix small · risk low.
Fix: remove both id-keyed routes; complete accounts only through PlayerInvitation
tokens. If the id link must survive, require a token column, refuse when
`status != "inactive"`, narrow writable fields to username and password. Add an authz test
iterating every `/api/app` rule with an integer id.

### C2 — Deleting a coach level deletes roster rows, notes and evaluations (verified)
`CoachLevel.coach_player_relations` carries `cascade="all, delete-orphan"` on a
relationship nothing reads; `POST /delete/coach_level` deletes every `coach_in_player`
row at that level, cascading to notes and evaluations. Reproduced: 1/1/1 rows before,
0/0/0 after. When any lesson, instance or vacancy references the level the same delete
500s instead (NO ACTION FKs, no ORM cascade).
Evidence: `models/coach_levels.py:26-30`, `models/Association_CoachPlayer.py:22`,
`modules/frontend_api.py:1543-1551`, `scratchpad/cascade_probe.py`.
Likelihood high (one click in Settings) · fix small · risk low.
Fix: drop the cascade; `ondelete="SET NULL"` on the three level FKs and
`coach_in_player.level_id`; test that deleting a level keeps the roster. Also
`exercises.level_ids` (JSON) and `excludedPlayers.playerIds` keep dangling ids.

### C3 — Class times are Lisbon wall-clock stored as if UTC (verified)
Every datetime column is `timestamp without time zone`; convention is naive UTC and the
engine compares against `utcnow_naive()` (21 sites in the notification service). But the
web form sends "HH:MM" wall-clock, `build_datetime` combines date and time with no zone,
and the calendar serializer returns `strftime("%H:%M")` unchanged. A class typed 10:00 is
stored 10:00 and treated as 10:00 UTC (11:00 Lisbon April–October). Reminder arithmetic,
"has the class started", cancellation deadline, quiet hours, and the per-day invite quota
are all one hour off in summer. PAD-134/136/144 each fixed one consumer by converting
UTC→Lisbon, which is only correct if storage really is UTC. Recurrence expansion runs in
UTC so even a correctly stored weekly class drifts across DST. Club timezone is a
hard-coded constant in two files.
Evidence: `tools/calendar_tools.py:87-91`, `services/lesson_service.py:574`,
`serializers/calendar_event.py:64`, `scheduler.py:51,128-134`,
`services/student_availability_service.py:32`, `services/notification_service.py:1109,1141`.
Likelihood certain April–October · fix medium · risk medium (needs a data decision).
Options: (A) convert at the edge, treat storage as true UTC, migrate rows by offset;
(B) model intent — `Lesson.timezone`, Time columns, aware expansion, true-UTC instances
(recommended before PAD-129/130). First, check a prod row against what the coach typed.

## Authorization and privacy (§4)

No tenant column; the effective boundary is coach-scoped, enforced by per-route helpers
retrofitted route by route.

### H1 — Cross-coach reads of any class with participant PII (verified)
`POST /class_instance`, `GET /lesson_instance/<id>`, `GET /lesson_instance/<id>/presences`
load by id with only a role check; the coach branch has no ownership test;
`serialize_user` always includes email and phone.
Evidence: `modules/frontend_api.py:778-823, 464-481, 717-728`, `serializers/user.py:4-16`.

### H2 — Messaging has no participant check and SSE broadcasts to everyone (verified)
`create_message_service` fetches the other participants of the conversation id in the
body and checks blocks, but never checks the sender is a participant.
`toggle_reaction_service` takes any message id and publishes the full serialized message
to the SSE bus. The bus is an in-process list of queues; `publish` pushes every event to
every subscriber, so every private message already reaches every connected client.
Evidence: `services/messaging_service.py:152-209, 243-257`, `realtime.py`,
`modules/frontend_api.py:393-418`.
Likelihood trivial · blast radius all conversations · fix small (checks) / medium
(scoped SSE) · risk low.

### H3 — Directory dumps
`GET /api/app/users` returns every active user with email and phone to any authenticated
user, unpaginated. The messageable-users list gives students every coach's contact
details and coaches every player of every club they belong to, not just their roster.
Evidence: `modules/frontend_api.py:582-586`, `services/messaging_service.py:41-62`.

### H4 — Attendance and reminder writes without ownership or enrolment checks
`presences/confirm` is JWT-only with no owner check and upserts any player id;
`notify/toggle_class` flips any lesson; `respond_to_reminder` has no enrolment check, so
any student can decline any class, creating a Presence, a Vacancy for a spot never
theirs, and replacement fan-out (and the stray absent presence lowers
`effective_filled_spots`, opening a phantom spot). `send_manual_notifications` creates
events for arbitrary players; `notify/process_rounds` lets any JWT holder run the batch
processor concurrently with the scheduler.
Evidence: `modules/frontend_api.py:1303-1316`, `services/lesson_service.py:617-662`,
`modules/notification_engine_api.py:138-152, 154, 381-386`,
`services/notification_service.py:2213-2313, 3258-3355`, `models/lesson_instances.py:78-92`.

### M9 — The generic admin editor
Three surfaces (`/editor/*`, legacy `/api/*`, `/api/editor/*`) registered unconditionally
in prod; admin-gated but serialize every column raw (password hashes, reset codes, device
tokens, push keys, invitation tokens); CSV export to a persistent static path; writes
bypass service invariants; legacy edit route invokes any zero-arg method named in the body
(incl. `delete`, `logout`); options/query hydrate whole tables; `SECRET_KEY` falls back to
a dev literal.
Evidence: `modules/__init__.py:16-27`, `modules/editor_api.py:22-32, 81-87, 132-176`,
`modules/api.py:62-118, 131-144, 185-201`, `tools/tools.py:50-67`, `config.py:99-103`.

### M10 — Account deletion is partial and uploads are public
`DELETE /api/auth/me` disables and scrubs contact fields but leaves username, hash,
messages, player row with presences, evaluations, notes, level history, blocks, device
tokens and push subscriptions (pushes keep flowing). The deleted player stays enrolled in
every future class and keeps receiving reminders; standing waiting-list credits keep
being spent; legacy session login still authenticates a disabled user. Avatar objects
sit in a world-readable GCS bucket under a guessable key with no MIME/size validation.
No export, no retention policy; the AI import ships sample PII to a third-party model.
Evidence: `services/account_service.py:5-36`, `utils/expo_push.py:99-110`,
`model.py:22-23, 341, 367-379`, `tools/input_tools.py:98,115`,
`tools/image_tools.py:32-39`, `services/ai_service.py:140-186`.

### M11 — Token and secret hygiene
30-day JWTs re-issued under 15 days remaining (sessions never expire while used); logout
response can carry a fresh token; tokens accepted from the query string on every route;
`token_blocklist` queried per request and never pruned; DeviceToken registration reassigns
an existing token to whoever posts it; invitation tokens stored plaintext and returned to
every club coach; coach-invite acceptance creates an active coach with no email
verification; login 500s (not 401) for invited-but-unactivated users (enumeration
oracle); no rate limiting.
Evidence: `config.py:99-103`, `__init__.py:65-84`, `modules/api_auth.py:57-74`,
`modules/notifications_api.py:38-44`, `services/club_service.py:68,112-146`.

What is fine: werkzeug scrypt; per-(coach, player) notes; roster, class write,
calendar-block, evaluation, invitation and bulk-import routes check ownership;
`update_own_profile_service` is a proper allow-list; bulk import does not persist raw rows.

## Data loss and crashes on delete (§5)

All 88 FK ON DELETE rules match between models and the live dev DB; the problem is what
they say and what the ORM adds.

### H6 — Deleting a User orphans its Player/Coach; one-participant conversations are a permanent 500 (verified)
`User.player`/`User.coach` are one-to-one with no cascade and `user_id` is nullable and
not unique, so delete writes `user_id = NULL`; `Player.name`/`Coach.name` then raise on
`self.user.name` and every serializer crashes. Reachable via editor delete, legacy API
delete, and import revert's bulk `query.delete()`. Separately, hard-deleting a user
(inactive-player removal, editor, import revert) leaves conversations with one
participant; `serialize_conversation` does `next(p for p in participants if p.user_id !=
user_id)` and raises StopIteration, so the counterpart's `GET /conversations` fails
forever. Also reachable by creating a conversation with an empty participant list.
Evidence: `models/users.py:33-34`, `models/players.py:18,29-30`,
`models/coaches.py:17,30-32`, `serializers/conversation.py:8-11`,
`services/player_service.py:383-390`, `services/import_service.py:853-860`.
Likelihood medium · blast radius the counterpart loses Messages · fix small · risk low
(scan prod for duplicates first).
Fix: `user_id NOT NULL UNIQUE` on both profile tables with `ondelete="CASCADE"`; guard
the serializer; never hard-delete users.

### H7 — Deleting a Coach is effectively impossible; orphan lessons keep running invisibly
Lessons survive pointing `default_level_id` at the deleted level (NO ACTION);
`*_invitations.invited_by_coach_id` NO ACTION with no relationship blocks the delete. If
it did succeed, zero-coach lessons vanish from calendar and scheduler yet keep
materialising instances.
Evidence: `models/coach_invitation.py:26`, `models/player_invitation.py:25`,
`helpers/calendar_helpers.py:22`, `services/lesson_service.py:172, 612, 836, 879, 914`.

### M15 — No `passive_deletes`, deletes are O(rows) with a commit per instance
Every child FK is already ON DELETE CASCADE in Postgres yet every collection uses
`cascade="all, delete-orphan"` without `passive_deletes=True`. A lesson with three empty
instances issued 13 SELECTs; `delete_future_instances` commits per instance.
Evidence: relationship blocks in `models/lessons.py`, `lesson_instances.py`, `players.py`,
`clubs.py`; `services/lesson_service.py:485-493`.

### M15b — Wide cascades with no undo
Deleting a Club deletes every lesson, instance and presence; deleting an
EvaluationCategory deletes every historical score behind a plain coach route;
`remove_player_service` hard-deletes with no audit trail; `Image.imageable` has
`cascade="all"` on the many-to-one side (live trap, zero rows).
Evidence: `models/clubs.py:49-51`, `models/evaluation_category.py:27-29`,
`modules/frontend_api.py:1556-1564`, `model.py:346, 387`.

Delete matrix (ORM cascades / DB-only cascades / breaks on): User → messages_sent; player
and coach de-associated to NULL / participants, blocks, tokens, reactions, reports /
silent orphan (H6). Coach → 12 collections incl. `coach_in_player` with notes and
evaluations / config, events, vacancies, waiting lists / level FKs and invitations (H7).
Player → lesson and instance links, presences, notes, evaluations, level history / events,
waiting lists / nothing, all history gone. Club → lessons → instances → presences /
coach_invitations / nothing (M15b). Lesson → links, instances, presences / events,
vacancies, waiting lists / O(N) (M15). CoachLevel → `coach_in_player` with notes and
evaluations (C2) / level history / NO ACTION on lessons/instances/vacancies.
Conversation → messages → reactions, participants / reports; SET NULL on reply_to, events,
prompts / nothing.

## The same fact stored in more than one place (§6)

"This is where most of the shipped bugs come from."

### H5 — Per-occurrence enrolment: three stores, demonstrably inconsistent (verified)
`player_in_lesson` (series), `player_in_lesson_instance` (occurrence), `presences` (row
exists). Capacity = instance junction rows minus absent presences, but the stores are
written on different paths (`create_lesson_instance_helper` writes links but no presences;
`get_or_materialize_instance` writes both; three places lazily create a missing presence).
Player calendar merges both; coach calendar and engine read only links. Dev DB: 14 of 41
presences have no matching link row; two instances carry an absent presence for a
non-enrolled player, under-counting by one each. Spec (`classes.instances` rule 2,
`attendance.presence` rule 1) promises presences at materialisation; the model does not.
Evidence: `models/lesson_instances.py:78-92`, `services/lesson_service.py:141-149,
206-246, 255-259, 291-306`, `services/notification_service.py:1895-1907, 2232-2242,
2520-2537`, `helpers/calendar_helpers.py:103-159`.
Options: (A) Presence is the enrolment; drop `player_in_lesson_instance`; add
`enrolment_source` (roster | guest | substitute | walk_in) — recommended. (B) one
`enrol_in_instance(player, instance, source)` writer plus reconciliation.

### M1 — Player level: four stores, one never updated, one dead
`coach_in_player.level_id` is what reads use; `player_level_history` is written on
create/invite/import but not on edit (violates `players.edit` rule 2 and
`players.level-history` rule 1); `Player.level` reads history so returns the initial
level forever. Class level fallback implemented three times (PAD-86).
Evidence: `services/player_service.py:56-81`, `models/players.py:77-80`,
`services/notification_service.py:191-214`, `serializers/calendar_event.py:89`,
`serializers/lesson.py:254`.

### M2 — Coach ownership: two junctions, code assumes one coach
Calendar uses instance link with lesson fallback; engine roster fan-out and eligibility
impact report use only the instance link (9 of 13 dev instances have none). Every engine
path takes `.first()` as "the coach"; multi-coach classes (`classes.coach-assignment`
rule 1) are half-supported.
Evidence: `modules/frontend_api.py:280-286`, `helpers/calendar_helpers.py:58-65`,
`services/notification_service.py:393-398, 1822-1824, 2244-2246, 3821-3824`.

### M3 — `Coach.current_club` returns the oldest club (verified)
`clubs_relations` ordered `desc(created_at)` and `current_club` takes `self.clubs[-1]`.
`clubs.crud` rule 3 says most recently joined. Masked because every dev coach has one
club. Fix cost: one character.
Evidence: `models/coaches.py:21-24, 38-40`, `modules/frontend_api.py:186-193, 555, 567,
1012, 1740, 1765`.

### M1b — Per-instance copies of template fields
Materialisation copies title, times, level, notifications flag and capacity;
`overwrite_title` is always populated so a series rename never reaches materialised
occurrences; `overridden_fields` is serialized but never written (`classes.edit` rule 4
unimplemented); "this and future" edit is a write-through cache.
Evidence: `models/lessons.py:140-164`, `services/lesson_service.py:220, 730-742`,
`serializers/lesson.py:225-226`.
Fix: store only nullable overrides for title, level and capacity; keep copied times.

### Smaller duplications (Low)
- `NotificationConfig.invitation_start_timing` vs `reminder_timing["invitationStart"]`.
- `NotificationConfig.rounds` vs `invitation_groups` — two schemas for one concept.
- `cancellationDeadlineHours` scalar beside `{enabled, value}` siblings.
- `Exercise.owner_coach_id` and the `role=owner` junction row.
- `Season.end_date` copied into `Lesson.recurrence_end`; no `season_id`.
- `Association_CoachPlayer.notes` (255 chars) beside the typed notes table.
- `Conversation.is_group` written in four places, read nowhere.
- `Vacancy.approval_status` and `ReplacementApprovalPrompt.status` — two state machines.
- **Roster (`coach_in_player`) and club membership (`player_in_club`) are never
  reconciled.** Adding a player creates a roster row but no club row, while the
  messageable-users list reads the club. That is the mechanism behind "I can't message
  my own student".
- **`Message.sent_at` is truncated to seconds while `last_read_at` keeps microseconds**,
  so a message arriving in the same second as a mark-read counts as read.

## Time handling beyond C3 (§7)

### M13 — `updated_at` is unreliable three ways (verified)
Mixin defaults `created_at` with utcnow but `Model.save()` writes `updated_at =
datetime.now()` (local). No column has `onupdate`; ~34 direct commits never bump it.
`token_blocklist.created_at` defaults tz-aware into a naive column; `bulk_imports` uses a
DB `now()`; `datetime.utcnow` still the default in 79 places.
Evidence: `model.py:31-32, 69`, `models/token_blocklist.py:14-18`,
`migrations/versions/d4e5f6a7b8c9_add_bulk_imports_table.py:22`.

## State machines (§8)

### H8 — Capacity and "one winner" are check-then-write with no lock or key
Accept checks `effective_filled_spots` then inserts; no `FOR UPDATE`; no unique index on
`lesson_instances (lesson_id, original_lesson_occurence_date)` so scheduler and request
can each materialise the same occurrence (PAD-85 recurrence); nothing prevents two open
vacancies for the same instance and player.
Evidence: `services/notification_service.py:3101-3155, 2665-2671`,
`services/lesson_service.py:102-135`.
Fix: unique index on the occurrence key; `with_for_update()` in accept, waiting-list fill,
materialise; partial unique on open vacancies per (instance, original_player_id).

### M4 — Vacancy never reconciles with capacity; unreachable/ambiguous states
Vacancy only moves open → filled through the engine; coach edits, walk-ins, manual
acceptances leave it open so the engine keeps inviting for a full class. `open +
dismissed` is a fourth status. `_fill_from_waiting_list` never checks capacity.
`NotificationEvent.queued` never written; `LessonInstance.rescheduled` never written;
`completed` written by one service and derived by the calendar; `Lesson.ended` never
written; `ReplacementApprovalPrompt.stale` only set on a late coach answer.
Evidence: `models/vacancy.py:33-56`, `services/notification_service.py:1738-1743,
2679-2804, 3125-3155`, `services/replacement_approval_service.py:337-358`,
`serializers/calendar_event.py:45-49`.

### M5 — Presence flags overlap and mean different things by path
`invited` set for everyone at materialisation (no information); `confirmed=True` means
"answered", not "coming"; `status=absent` written by the student's decline so student
decline and coach absent are indistinguishable except via `validated`, which is set on
every coach write. Legacy booleans nullable with no server default so "never set", "set
false" and "coerced false" (PAD-69) are indistinguishable, which is why PAD-93 could only
backfill two columns.
Evidence: `models/presences.py:31-39`, `services/notification_service.py:1632-1637,
2340-2342`, `services/import_service.py:570-571`, `services/lesson_service.py:353-354`.
Fix: one response enum (none | confirmed | declined | cancelled | proactive_decline) plus
`responded_at` and `recorded_by`.

### Waiting lists (Low)
`StandingWaitingListEntry` liveness is three independent facts; adding credits
deactivates the previous entry (credits lost); `WaitingListEntry` rows re-parented on
re-add.

## The base mixin, the editor, and transactions (§9)

### M8 — `padel_app/model.py` fuses five concerns and each has bitten (verified)
Per-call commits (188: 72 create, 91 save, 25 delete); `update_with_dict` semantics
("relationships only when truthy, columns only when non-None, booleans always") are the
root of PAD-69/93/28; admin-editor coupling (`get_create_form` is the actual write path
for instance creation and attendance); GCS coupling at import; import cycle behind 173
function-level imports; nothing can be cleared through a form (`_apply_column` ignores
None); `__repr__` returns None for models without `.name`; `logout()` expunges the whole
session; `create()` resets the instance key.
Evidence: `model.py:35-49, 51-90, 114-238, 255-317, 22-23, 367-379`,
`services/lesson_service.py:157-203, 222-228, 327-354`,
`services/notification_service.py:3635-3652, 3920-3931`,
`services/calendar_service.py:138-142`.
Options: (A) move form/display methods into an admin registry, slim TimestampMixin,
commit once per request or job, engine first (2–3 weeks); (B) ban the mixin from services.

### M8b — The transaction unit is one row, not one request (verified)
No request-scoped transaction; every multi-step flow is a sequence of independent
commits. Split/"this and future" edit can leave two active overlapping series;
materialisation can leave an instance with no coach link (reminders silently give up);
accept can leave the player enrolled with the vacancy open; player creation is four
commits; **conversation creation commits the conversation then one participant at a time,
which is how one-participant conversations (H6) come to exist**; invitation batches can
leave events `sent` with no message; bulk import audit row written only at the end;
helpers commit mid-flow; failures swallowed into 200s; any Postgres error poisons the
session until teardown.
Evidence: `__init__.py:538-540`, `services/lesson_service.py:137-155, 222-265, 289-306,
449-528, 702-727`, `services/notification_service.py:99, 172-177, 2752-2802, 3147-3171,
3635-3652`, `services/player_service.py:17-63`, `services/messaging_service.py:310-323`,
`modules/frontend_api.py:1349-1353, 1712-1722`, `utils/push_notifications.py:54`,
`utils/expo_push.py:89`.
Fix: long term one commit in `after_request` with rollback on exception; short term wrap
split, accept and materialise in one `begin_nested` (as PAD-117 already does).

### M21 — NotificationConfig is a god blob; eligibility spec one-quarter modelled
Eleven JSON columns, nested sub-keys, no schema version; the "default a NULL" idiom
produced PAD-122. `eligibility.cascade`, open-spot-visibility and join-requests want
columns/tables that do not exist, and will add JSON to the two largest tables.
Evidence: `models/notification_config.py:177-199, 206-330`,
`services/notification_service.py:247-268`.
Fix: promote typed settings to columns; keep list-shaped ones as JSON; delete `rounds` and
`invitation_start_timing`.

### M6 — Reminder state lives in `messages.msg_metadata` and is scanned in Python
Pending reminder, answered, superseded, event id and vacancy id all live in a plain JSON
(not JSONB) column; every "is there a pending reminder" query loads all reminder messages
in the conversation and filters in Python (four sites, 50–100 rows per student per year).
Evidence: `models/messages.py:48-49`, `services/notification_service.py:1919-1926,
2009-2012, 2144-2147, 2603-2606`.
Fix: a `reminder_attempts` table or columns on presences; interim JSONB plus a partial
expression index.

### M7 — Recurrence edits fork the lesson with no series link
"This and future" edits and single-occurrence deletes create a new Lesson row; no
`series_id`; the duplicate helper drops description and `notifications_enabled`; every
fork re-runs reminder scheduling.
Evidence: `services/lesson_service.py:449-482, 497-528, 692-727, 901-916`.

## Performance and scale (§10)

Baseline: 10 coaches, 300 students, 40 weekly classes, ~4 players per class.

### H9 — Calendar and dashboard: unscoped instance load, N+1, run twelve times (verified)
`load_lesson_instances_for_coach` loads every instance of every coach in range and
filters in Python; serializer lazy-loads per instance. A week is ~100–170 queries; the
coach dashboard calls the pipeline twelve times (1,500–3,000 queries per paint).
`_reply_items` loads every unread message with no limit.
Evidence: `helpers/calendar_helpers.py:37-69`, `serializers/calendar_event.py:73, 106`,
`helpers/dashboard/coach_home.py:109-126, 179, 272, 296-306, 366, 408-420`.

### H10 — Conversations hydrate whole histories (verified)
The conversation list computes last message and unread count by loading
`conversation.messages` (the entire history) per conversation, plus a correlated
`MAX(sent_at)` subquery on an unindexed column. Detail is unpaginated and reads
`message.reactions` lazily per message. No `last_message_at` denormalisation.
Evidence: `serializers/conversation.py:5-26, 46-55`, `serializers/message.py:33-36`,
`services/messaging_service.py:133-149, 260-278`.
Fix: index `messages(conversation_id, sent_at)`; `last_message_at`/`last_message_id` on
conversations with backfill; one grouped unread query; paginate detail by `before=<id>`;
`selectinload` reactions.

### H11 — No foreign key is indexed
Only unique constraints plus eight explicit indexes on tokens and keys. Hot lookups on
trailing columns of composite uniques are sequential scans. Nothing indexes
`lesson_instances.lesson_id`/`start_datetime`, `messages.conversation_id`/`sent_at`/
`message_type` (eighteen filters), any column on vacancies or notification_events,
`conversation_participants` either side, or `players.user_id`/`coaches.user_id` (hit on
every authenticated request). Eighty FK columns.
Recommended set: `lesson_instances(lesson_id, original_lesson_occurence_date)` unique,
`lesson_instances(start_datetime)`, `presences(lesson_instance_id)`,
`player_in_lesson_instance(lesson_instance_id)`, `coach_in_lesson_instance(lesson_instance_id)`,
`player_in_lesson(lesson_id)`, `coach_in_lesson(lesson_id)`, `messages(conversation_id,
sent_at)`, `messages(sender_id)`, `conversation_participants(user_id)` and
`(conversation_id)`, `notification_events(vacancy_id, status)`, `(lesson_instance_id,
status)`, `(coach_id, created_at)`, `(player_id, coach_id)`, `vacancies(lesson_instance_id,
status)`, partial `vacancies(status) WHERE status='open'`, `calendar_blocks(user_id)`,
`waiting_list_entries(standing_entry_id)`, `player_level_history(player_id, assigned_at)`,
unique `players(user_id)` and `coaches(user_id)`.

### M17 — The invitation engine costs 6–12 queries per candidate
2,000–3,500 queries per batch per vacancy per round at 300 candidates; reminder sending
scans every reminder message in the thread; standing-list fan-out fetches every instance
one by one; Expo push is a blocking 10s HTTP call in the scheduler thread.
Evidence: `services/notification_service.py:512-519, 554-589, 898-968, 975-1080,
1232-1355, 1919-1926, 3818-3859`, `services/student_availability_service.py:119-143,
211-231`, `utils/expo_push.py:55-63`.

### M18 — Scheduler job store: full unpickle per edit, rebuilt daily and at boot
48-hour reminder job materialises every occurrence; jobs pre-generated 60 days ahead and
rewritten daily; `cancel_lesson_reminder_jobs` unpickles every job per edit;
`_startup_reschedule` issues 700–1,000 job-store writes inside `create_app` (deploy
downtime); 10-thread executor shares the 15-connection pool with 64 request threads.
Evidence: `scheduler.py:152-199, 202-252, 306-335, 384-396, 433-458, 536-610, 613-637,
650-697`, `Dockerfile:42-44`.

### M19 — SSE pins gunicorn threads
Each SSE client holds a thread; the web app opens up to three EventSources per tab, so
~20 concurrent tabs saturate the 64 threads — the shape of the 2026-06-10 outage.
Evidence: `realtime.py`, `modules/frontend_api.py:393-418`, web `AppLayout.tsx`,
`MessagesPage.tsx`, `ClassDetailSheet.tsx:252`.
Fix: gevent workers, or Redis pub/sub with a separate SSE process, or long-polling.

### M16 — Unbounded growth with no retention
Rows/year at baseline: messages 35–45k; waiting_list_entries ~10k; presences ~9k;
player_in_lesson_instance ~8k; notification_events 4–6k; token_blocklist 2–4k;
lesson_instances ~2k; apscheduler_jobs steady 400–800. Nothing breaks from volume for
2–3 years; the danger is hot paths that scan without indexes.

## Migrations and deploy safety (§11)

### H12 — The scheduler starts inside every production migration (verified)
`scripts/entrypoint.sh` runs `python -m flask --app app.py db upgrade`; the skip guard
checks `basename(sys.argv[0]) in ("flask", "flask.exe")`, which under `python -m` is
`__main__.py`. APScheduler starts inside the migration process. PAD-95 added a second
argv check instead of fixing the skip.
Evidence: `scripts/entrypoint.sh:5`, `scheduler.py:358-360`, `config.py:34-43`.

### H13 — No CI gate for heads or drift; autogenerate wants to drop the job table
Only `poetry check --lock` pre-build; both head merges and the multiple-heads outage
happened because nothing fails before the image is built. `apscheduler_jobs` is outside
`db.metadata` and `env.py` has no `include_object`, so every `flask db migrate` proposes
dropping it (revision `3ff75d01a5ee` already did once). `compare_type`/
`compare_server_default` unset; `flask db check` fails today on three items. 22 of 46
revision ids are hand-typed sequential patterns with near-twins.
Evidence: `.github/workflows/deploy.yaml`, `migrations/env.py:115-119`,
`migrations/versions/3ff75d01a5ee_*`, `b3f1c2a7d9e4_*`, `b1c2d3e4f5a6_*`.

### M12 — Tri-state booleans and Python-only defaults
`presences.invited/confirmed/validated`, `lessons.status`, `coach_levels.display_order`
nullable with Python-only defaults; readers using `== True` drop NULL rows in KPI
dashboards; all nine association FK pairs nullable; `evaluation_entries.evaluated_at`
nullable and `.strftime` called on it.
Evidence: `models/presences.py:34-36`, `models/lessons.py:38`, `models/coach_levels.py:32`,
`helpers/dashboard/kpis.py:55, 64-65, 102`.

### M14 — Uniqueness the domain implies but the DB does not enforce
`coaches.user_id` / `players.user_id`; **`conversation_participants (conversation_id,
user_id)` — rows inserted by looping the raw id list, `participant_key` dedups
conversations, not rows**; `coach_levels (coach_id, code)`; `evaluation_categories
(coach_id, name)`; `standing_waiting_list_entries (coach_id, player_id) WHERE is_active`;
open vacancies per instance and player; `notification_events (vacancy_id, player_id,
round_number)`; season non-overlap per coach.
Already correct: presences, waiting_list_entries, reactions, blocks, config per coach,
prompt per vacancy, participant_key, all nine association pairs.

## Test blind spots (§12)

### M20 — Tests run on SQLite with `create_all`
Migrations never execute under pytest; SQLite has FK enforcement off so every `ondelete`
is inert (C2 and H6 invisible to the suite); native enums become VARCHAR; `String(n)`
ignored; SAVEPOINT semantics differ (PAD-117 test exercises control flow, not the aborted
state); races untestable; no migration test, no registry iteration test, no authz test
over id-keyed routes.
Evidence: `tests/conftest.py:14-27`, `levelup_frontend/apps/web/e2e/scripts/reset-test-db.sh:19-35`,
`tests/test_backend_500_fixes.py:150-165`.
Fix: pytest against postgres:15 or testcontainers; at minimum the FK pragma.

## Naming, dead code and small traps (§13)

Registry and naming (verified): editor registry key for Message is **"lessage"**
(`/api/editor/message/*` 404s); `LessonInstanceTraining` registered without the mixin so
its schema endpoint 500s; `MessageReaction`, `MessageReport`, `BlockedUser` lack
`page_title`/`model_name`; `original_lesson_occurence_date` misspelt; table naming
inconsistencies; enum type names do not follow tables; `Presence.__table_args__`
assigned twice; four migration docstrings say the wrong `Revises`.

Dead or near-dead: `Imageable`, `Backend_App`, `User.generated_code`,
`Conversation.is_group`, `LessonInstance.overridden_fields`,
`NotificationConfig.notification_groups`, `Vacancy.current_batch_number`,
`Association_CoachPlayer.notes`, `Player.level`; five association models with surrogate
keys and editor forms; free-string `messages.message_type`, `invitation_mode`,
`device_tokens.platform`, `users.language`; `src/integrations/supabase/types.ts` in the
web app; stale README/EDITOR.md.
