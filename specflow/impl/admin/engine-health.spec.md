---
id: admin.engine-health
status: implementing
depends_on: [admin.foundation, notifications.invitations, notifications.waiting-list, notifications.reminders, notifications.config, messaging.push-notifications]
serves: [P-ADMIN-3]
governed_by: [R-005, R-010, R-022, R-023, R-036]
---

# admin.engine-health

> Linear: PAD-534 (this spec), epic PAD-530; builds on PAD-531 (`admin.foundation`). Owner
> decisions 2026-10-06. Implemented by PAD-534 (and the GIT_SHA build change, its own PR).

### Intent
One read-only page that says whether the invitation and reminder engine is healthy and what each
environment runs: open vacancies and where they are in their rounds, live invitations, scheduler
jobs, reminders that were skipped because their time had passed, failed pushes and emails, user and
coach counts, the deployed commit and the database migration head. Today each of these is a
database query or a log search, and failed sends are only in the logs.

### Entities
- **READS:** Vacancy (`vacancies`: `status`, `approval_status`, `current_round_number`,
  `current_batch_number`), NotificationEvent (`notification_events`: `status`, `round_number`),
  ReminderAttempt (`reminder_attempts`), NotificationConfig (`notification_configs`), User, Coach,
  the APScheduler job store (`apscheduler_jobs`, `SQLAlchemyJobStore` on the app database),
  `alembic_version`; for rule 8, Player, ConversationParticipant (`last_read_at`), DeviceToken,
  PushSubscription; for rules 10–12 the new engine's tables (`engine_sessions`, `invitations`,
  `engine_effects`; `notifications.engine-store`) and `NotificationConfig.engine_version`
- **CREATES:** `delivery_incidents` — `id`, `created_at`, `kind`
  (`email_failed`|`push_failed`|`reminder_skipped_past_due`|`push_registration_failed`, the last
  since PAD-746, rule 8; `stream_refused`|`push_dropped` since PAD-689, rule 9; `engine_session_failed` since PAD-913, rule 12), `channel`
  (`email`|`webpush`|`apns`|`fcm`|`expo`|`scheduler`|`sse`|`push`; an Expo receipt maps the device's platform
  to `apns` (ios) or `fcm` (android) and is `expo` when the device row does not say), `user_id` (FK → users, SET NULL, nullable),
  `subject_type` / `subject_id` (nullable: the lesson instance, vacancy or notification the
  incident belongs to), `error_class` (String(120)), `detail` (String(500), truncated). No
  recipient address, message body, device token or push key is stored. Rows older than 30 days
  are deleted by a daily scheduler job `prune_delivery_incidents` at 03:07 UTC (R-010 naming: fixed id; a fixed minute, delivery.worker-role rule 4, B-667).
- **WRITES:** `delivery_incidents` only, from the existing failure paths (rule 3) and from the
  clients' registration-failure report (rule 8). The page itself writes nothing.

### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine (the swap, PAD-912; swap
plan §3.2, §7) the items in the table are replaced and the readings below
hold; the rest hold unchanged. Not marked inline: this section is the one place. When every coach is
drained, the old engine is deleted and the replaced items go with it.

| Item | For a new-engine session | Source |
|---|---|---|
| Intent, Entities READS | the engine's own state per session (rule 10): sessions, open spot types, counting and open invitations, approvals, alerts, the outbox | `notifications.engine-store`; `notifications.engine-planning` rules 3, 11, 14 |
| Rule 2, `vacancies` and `invitations` | count old-engine sessions only; the new engine's numbers are rule 10's `engine` block. No vacancy projection is built: the `engine` block is the new engine's view from its first coach | rule 10; Open questions |
| Rule 6 (a coach's engine view) | rule 11 | `notifications.config` rules 18, 19 |
| Criterion 1 | holds for old-engine sessions; the new engine's is criterion 24 | — |

Readings:
- Rule 2's scheduler families: the new engine adds the singleton `engine_tick` (rule 10); the per-vacancy families exist only for old-engine sessions (`notifications.config` rule 18).
- Rule 3, `reminder_skipped_past_due`: arises only for old-engine sessions; the engine's attendance requests replace reminders (`notifications.engine-timeline` rule 2). A new-engine session's failure is rule 12's kind.
- Criterion 10 (`invitationMode`): holds; semi-automatic is kept (owner ruling D2) and the mode is carried into the engine's settings (`notifications.config` rule 19).

### Rules
1. **Read-only, all of it.** Every route of this spec is a `GET` under
   `/admin/api/engine-health/*` and needs `support`. Nothing on the page starts, stops, retries or
   re-arms the engine; `POST /api/app/notify/process_rounds` is not exposed in the console.
2. **The summary.** `GET /admin/api/engine-health` answers, computed at request time in UTC
   (R-023):
   - `vacancies`: count with `status = open`, grouped by `(currentRoundNumber,
     currentBatchNumber)`, plus the count with `approval_status = pending`; and the oldest open
     vacancy's age.
   - `invitations`: count of NotificationEvents with `status` `sent` or `queued` (live), by
     `roundNumber`.
   - `scheduler`: count of jobs in the job store by id family (`reminder_lesson_*`,
     `invite_start_*`, `pastdue_*`, the fixed singletons `process_batches`,
     `extend_schedule_window`, `prune_delivery_incidents`, `retention_sweep` since PAD-638, `finance_gcp_import` since PAD-742, `read_push_receipts` since PAD-745), the count whose `next_run_time` is
     more than 5 minutes in the past (overdue), and whether each fixed singleton exists.
   - `incidents`: counts of `delivery_incidents` by `kind` for the last 24 hours and the last
     7 days, with the 20 most recent rows.
   - `pushReceipts` (PAD-745, `messaging.push-notifications` rule 10b): Expo tickets kept, for the
     last 24 hours and 7 days, by status (`pending`, `ok`: Apple or Google took it, `error`,
     `expired`) and the errors by Expo code.
   - `accounts`: users by `status` (`inactive`/`active`/`disabled`), coaches by
     `approval_status`, players, and accounts created in the last 7 days.
   - `push`: the push reach of active students and the failed registrations (rule 8).
   - `deploy`: this environment's `gitSha` and `alembicHead` (rule 4), and the other
     environment's (rule 5).
3. **Failed sends and skipped reminders are recorded.** The paths that today only log a failure
   also insert one `delivery_incidents` row, in their own short transaction, never failing the
   caller:
   - `email_tools.send_email` raising or the transport refusing → `email_failed`;
   - a web push send that fails (including an expired subscription), and an APNs or FCM send
     that fails → `push_failed`, with the channel;
   - APScheduler reporting a missed run (`EVENT_JOB_MISSED`) for a `reminder_lesson_*` or
     `pastdue_*` job, and the past-due pass refusing a class that has already started →
     `reminder_skipped_past_due`, with the lesson instance as subject.
   An insert that itself fails is logged and dropped; it never retries and never raises into the
   send path.
4. **Deploy identity.** The deploy workflows pass the commit SHA into the backend image
   (`GIT_SHA` build argument, exposed as an environment variable). `alembicHead` is read from
   `alembic_version`. A missing `GIT_SHA` (local runs) answers `"unknown"`.
5. **The other environment.** The product health route `GET /api/app/healthz` stays `{"status": "ok"}`:
   `gitSha` and `alembicHead` are exposed on the admin API only (decision 2026-10-07). Each
   console reads the other environment's identity from `GET /admin/api/deploy-identity` (`support`)
   on that environment's admin API, with a 2-second timeout, using a service token held in the
   console's environment configuration, and shows `"unreachable"` on failure.
   Mechanics (PAD-534; coordinator, 2026-10-07): the console calls the other environment with
   `ADMIN_PEER_URL` and `Authorization: Peer <ADMIN_PEER_TOKEN>`; that environment's blueprint gate
   accepts a peer token for `GET /admin/api/deploy-identity` ONLY, compared in constant time with
   its `ADMIN_PEER_INBOUND_TOKEN` (unset, or an empty presented token, refuses every peer read),
   and writes an audit row for each peer read (`deploy_identity.peer_read`, actor `peer`, in its
   own transaction). Every other admin route still needs an admin session (its `require_role` is a second
   wall). With `ADMIN_PEER_URL`/`ADMIN_PEER_TOKEN` unset the console answers
   `"unreachable — not configured"`. Provisioning the three secrets per environment is the owner's.
6. **Per-coach engine settings, read-only.** `GET /admin/api/engine-health/coaches?q=` lists
   coaches (search as `admin.approvals-and-users` rule 4); `GET
   /admin/api/engine-health/coaches/<coach_id>` answers that coach's NotificationConfig fields
   (`autoNotifyEnabled`, `invitationMode`, reminder and invitation-start type/value/time, quiet
   hours, eligibility rules) and that coach's open vacancies, live invitations and scheduled
   jobs. There is no write route. The excluded players' ids are left out (student data); the
   coach is named, never their email.
7. **Cost.** Each count is one aggregate query; the summary answers in under 1 second on a
   database the size of production's at the time of writing. The console refreshes it only on
   demand (a "Refresh" button), never by polling.

8. **Push reach and failed push registrations (PAD-746, B-678; follows PAD-744).**
   - **(a) The reach.** The summary's `push.activeStudents7d` counts the active students by push
     channel: `total`, `noChannel` (no `device_tokens` row and no `push_subscriptions` row),
     `webPushOnly` (a subscription, no device token), `nativeOnly` and `nativeAndWebPush`. An
     **active student** is a user with a `players` row and at least one
     `conversation_participants` row whose `last_read_at` is within the last 7 days (a
     conversation the client marked read; sending a message does not count), counted once,
     whatever the user's status and even if they also coach. A device token of any platform is
     a native channel. This is PAD-741's definition, kept as is so the count compares with its
     production baseline of 2026-10-22: 33 with no channel, 19 web push only, 115 with a token
     (112 + 3). Counts only, one aggregate query (rule 7); no id or name leaves.
   - **(b) The report.** `POST /api/notifications/registration-failure` (a signed-in user; a
     product route, not one of the console's, so rule 1 does not cover it) takes exactly
     `platform` (`ios`|`android`|`web`), `phase` (`token`|`post` on iOS and Android, where
     `token` is anything that fails before the POST; `subscribe`|`post` on the web),
     `permission` (`granted`|`denied`|`undetermined`|`unknown`), `build` and `errorClass`
     (each 1–60 characters of `[A-Za-z0-9_.-]`: an error's class or `http_<status>`, never
     its message). Any other field or value is refused with 400 and nothing is stored: no
     token, subscription or free text reaches the server. A valid report answers 204, logs one
     WARNING line with the user id and those five fields, and records one `delivery_incidents`
     row `push_registration_failed` (channel `apns`, `fcm` or `webpush` by platform; the error
     class; `detail` = phase, permission and build). One user adds at most 20 rows per 24 hours;
     past that the report answers 204 and is dropped.
   - **(c) On the page.** The summary's `push.registrationFailures7d` counts the last 7 days'
     rows by platform, and the incident counts (rule 2) carry the new kind.
   - **(d) Who reports.** The iOS/Android and web clients report through their registration
     failure hooks (`messaging.push-notifications` rule 15, `auth.push-subscription` rule 9,
     PAD-744): every failed attempt, retries included; a refused permission is not a failure
     and is never reported.

9. **(PAD-689; numbering unconfirmed) Refused live-update streams and dropped pushes.** The
   realtime monitor records one `stream_refused` row (channel `sse`) and one `push_dropped` row
   (channel `push`: the in-process sender cannot tell web push from Expo) for each minute in which
   any happened, the count in `detail` (`messaging.sse-realtime` rule 25a). The incident table
   lists both kinds; their counts are minutes, not events. No migration: `kind` is a plain
   `String(32)`.

10. **The new engine's block (PAD-913; swap plan §3.2, §7).** The summary's `engine` block, computed at
    request time in UTC and present once the store's tables exist:
    - `coaches`: coaches by `engine_version` (`old`, `new`).
    - `sessions`: new-engine sessions (`engine_sessions`) whose class has not started, and of them those
      starting in the next 7 days.
    - `openSpots`: for the new-engine sessions starting in the next 7 days, the open spots by type as the
      engine counts them (`notifications.engine-spots` rule 6: side `left`, `right` or either), summed,
      and how many of them are uncovered (no counting invitation covers them,
      `notifications.engine-planning` rule 12). Read from the store's snapshots in one batch per table
      (rule 7's one exception, bounded by the 7-day window).
    - `invitations`: open invitations (`invitations` rows not answered and not closed) of sessions that
      have not started, split into **counting** (not sorry and `counts_until` after now,
      `notifications.engine-planning` rule 3) and **open, not counting**, each by tier; and the
      invitations sent in the last 24 hours.
    - `approvals`: sessions with a pending request, and dismissed sessions
      (`notifications.engine-planning` rule 14).
    - `alerts`: sessions holding a coach alert (`notifications.engine-planning` rule 11), by reason code.
    - `outbox`: rows still to send (`engine_effects` with no `dispatched_at`) by kind, and how many are
      older than 5 minutes (stuck).
    - `tick`: whether the `engine_tick` job exists, whether it is overdue (rule 2's 5 minutes), and the
      session failures of the last 24 hours (rule 12).
    Counts only: no student is named. The block is absent while no coach is on `new`.
11. **A new-engine coach's view.** For a coach on `new`, rule 6's answer adds `engineVersion` and the
    coach's `EngineSettings` as the store builds them (`notifications.config` rule 19; a `SettingsError`
    is answered as its message, never raised), and lists the coach's new-engine sessions that have not
    started: start, capacity, open spots by type, counting and open-not-counting invitations, the
    approval state and any alert. Students are counted, never named. For a coach on `old`, rule 6 holds
    as written.
12. **A failing session is recorded.** When the engine's tick fails on one session it goes on with the
    rest (`notifications.invitations` rule 21's new reading) and records one `delivery_incidents` row,
    kind `engine_session_failed`, channel `scheduler`, the lesson instance as subject, the error's class,
    in its own short transaction as rule 3's rows are.

### Acceptance Criteria

#### ADMIN-ENGINE-HEALTH-1: The summary counts what the engine holds (rule 2)
- **Given** two open vacancies at round 1 batch 1 and one at round 2 batch 1, one filled vacancy, three NotificationEvents `sent` and one `expired`, and a `support` token
- **When** support GETs `/admin/api/engine-health`
- **Then** `vacancies` reports 2 at `(1,1)` and 1 at `(2,1)` and no filled one, and `invitations` reports 3 live

#### ADMIN-ENGINE-HEALTH-2: Overdue jobs and missing singletons are visible (rule 2)
- **Given** a job store with `process_batches` present, `extend_schedule_window` absent, and one `reminder_lesson_*` job whose `next_run_time` is 10 minutes in the past (pinned clock)
- **When** the summary is read
- **Then** `scheduler` reports one overdue job and `extend_schedule_window` as missing

#### ADMIN-ENGINE-HEALTH-3: A failed email is recorded without failing the caller (rule 3)
- **Given** a mail transport that raises
- **When** a coach approval sends its email
- **Then** the approval still succeeds, one `delivery_incidents` row `email_failed` exists with the coach's user id and no email address in any column, and the summary's 24-hour `email_failed` count is 1

#### ADMIN-ENGINE-HEALTH-4: A failed push is recorded (rule 3)
- **Given** a web push subscription the push service answers 410 to
- **When** a reminder is sent to that user
- **Then** one `push_failed` row with channel `webpush` exists and holds no subscription data

#### ADMIN-ENGINE-HEALTH-5: A missed reminder is recorded (rule 3)
- **Given** a `reminder_lesson_*` job whose run time passed while the scheduler was down beyond its grace time
- **When** the scheduler starts and reports the miss
- **Then** one `reminder_skipped_past_due` row names that lesson instance

#### ADMIN-ENGINE-HEALTH-6: A failing incident insert never breaks a send (rule 3)
- **Given** the `delivery_incidents` insert made to raise
- **When** an email fails
- **Then** the caller's outcome is unchanged and the failure is only logged

#### ADMIN-ENGINE-HEALTH-7: Old incidents are pruned (entities)
- **Given** incidents created 31 and 29 days ago (pinned clock)
- **When** `prune_delivery_incidents` runs
- **Then** only the 29-day-old row remains

#### ADMIN-ENGINE-HEALTH-8: Push receipts are counted (rule 2)
- **Given** receipt rows from the last hour: two `ok`, one `error` `InvalidCredentials`, one `pending`; and one `ok` from 3 days ago
- **When** the summary is read
- **Then** `pushReceipts.last24h` is `ok` 2, `error` 1, `pending` 1, `expired` 0, `errorsByCode` `{InvalidCredentials: 1}`, and `last7d.ok` is 3

#### ADMIN-ENGINE-HEALTH-9: Deploy identity for both environments (rules 4, 5)
- **Given** a backend started with `GIT_SHA=abc1234` and an other-environment `/admin/api/deploy-identity` stub answering `{gitSha: "def5678", alembicHead: "x1"}`, then a stub that times out
- **When** the summary is read twice
- **Then** `deploy.this.gitSha = "abc1234"`, `deploy.this.alembicHead` equals the database's `alembic_version`, `deploy.other.gitSha = "def5678"`; and the second read answers `deploy.other = "unreachable"` within 3 seconds

#### ADMIN-ENGINE-HEALTH-10: Per-coach settings are readable and not writable (rules 1, 6)
- **Given** coach `maria` with `invitation_mode` set and an operator token
- **When** the operator GETs her engine settings, then sends `PUT` and `POST` to the same path
- **Then** the GET answers her settings; the `PUT` and `POST` are 405, and her NotificationConfig is unchanged

#### ADMIN-ENGINE-HEALTH-11: The push reach counts active students by channel (rule 8a)
- **Given** students who marked a conversation read 2 days ago: one with no channel, one
  `inactive` with no channel, one coach who also plays with no channel, one with web push only,
  one with an iOS token only, one with both; one who read 8 days ago; a coach without a
  `players` row who read yesterday
- **When** support reads the summary
- **Then** `push.activeStudents7d` is `{total: 6, noChannel: 3, webPushOnly: 1, nativeOnly: 1,
  nativeAndWebPush: 1}`

#### ADMIN-ENGINE-HEALTH-12: A student counts once (rule 8a)
- **Given** a student who marked two conversations read in the last 7 days
- **When** the summary is read
- **Then** `push.activeStudents7d.total` is 1

#### ADMIN-ENGINE-HEALTH-13: A failed registration is reported, logged, recorded and counted (rules 8b, 8c)
- **Given** a signed-in student
- **When** the iOS app posts `{platform: "ios", phase: "post", permission: "granted", build:
  "33", errorClass: "http_503"}`
- **Then** the answer is 204, one WARNING line names `platform=ios phase=post error=http_503`,
  one `push_registration_failed` row has channel `apns` and `detail` `phase=post
  permission=granted build=33`, and the summary reads `registrationFailures7d.ios = 1`

#### ADMIN-ENGINE-HEALTH-14: Free text and extra fields are refused (rule 8b)
- **Given** a report whose `errorClass` is `"Error: could not reach https://exp.host/--/api"`,
  or one that adds a `token` field
- **When** it is posted
- **Then** the answer is 400 and no row is stored

#### ADMIN-ENGINE-HEALTH-15: One user cannot flood the table (rule 8b)
- **Given** a student who posts 25 valid reports in one hour
- **When** the rows are counted
- **Then** every answer is 204 and 20 rows exist

#### ADMIN-ENGINE-HEALTH-16: No write route on the page (rule 1)
- **Given** the URL map
- **When** the guard test lists rules under `/admin/api/engine-health`
- **Then** every rule allows only `GET`, `HEAD` and `OPTIONS`

#### ADMIN-ENGINE-HEALTH-17: The incident table lists refused streams and dropped pushes (rule 9, PAD-689)
- **Given** a summary whose last-24-hours counts carry `stream_refused: 3` and `push_dropped: 1`
- **When** the engine-health page renders
- **Then** the incident rows "Live updates refused (stream cap)" and "Push dropped (queue full or
  provider paused)" show 3 and 1

#### ADMIN-ENGINE-HEALTH-18: A reminder pass that finds its class already started is recorded (rule 3)
- **Given** a class that started an hour ago, with notifications on
- **When** its reminder pass runs
- **Then** one `delivery_incidents` row of kind `reminder_skipped_past_due` names that occurrence
test: `backend/padel_app/tests/test_pad534_engine_health.py` › `test_a_pass_that_finds_its_class_started_is_recorded`

#### ADMIN-ENGINE-HEALTH-19: The peer token opens deploy identity only, and each use is audited (rule 5)
- **Given** `ADMIN_PEER_INBOUND_TOKEN` set
- **When** `GET /admin/api/deploy-identity` is called with `Authorization: Peer <that token>`
- **Then** the answer is 200 with `gitSha` and `alembicHead` and nothing else, and one audit row `deploy_identity.peer_read` with the actor `peer` is written; a console session's own read writes none
- **And** no header, a wrong token, an unset or empty token setting, any other route with the peer token, and a POST with it are all refused without a `gitSha`
test: `backend/padel_app/tests/test_pad534_engine_health.py` › `test_the_peer_token_opens_deploy_identity_only_and_is_audited` (+1 more)

#### ADMIN-ENGINE-HEALTH-20: A failed incident insert logs nothing of the send it was recording (rule 3, B-254)
- **Given** a web push that fails with an error naming the push endpoint, and the incident insert failing too
- **When** the send returns
- **Then** it reports failure as before, and the log line says the incident could not be recorded without the endpoint or the provider's host
test: `backend/padel_app/tests/test_pad534_engine_health.py` › `test_a_failing_insert_never_logs_the_send_failures_text`

#### ADMIN-ENGINE-HEALTH-21: The failure report's platform decides its channel, and a signed-out caller is refused (rule 8b)
- **Given** a signed-in user
- **When** they POST `/api/notifications/registration-failure` with platform `web`
- **Then** the answer is 204 and the incident's channel is `webpush`
- **And** the same request with no session answers 401
test: `backend/padel_app/tests/test_pad746_push_reach.py` › `test_a_web_failure_maps_to_webpush` (+1 more)

#### ADMIN-ENGINE-HEALTH-22: The page shows the summary's blocks, leaves out one the answer lacks, and refreshes only when asked (rules 2, 5, 7, 8c)
- **Given** support on `/engine-health` and a summary with counts, an overdue job, a missing singleton, an incident count, this deploy's commit and push receipts
- **Then** each count shows in its place, the missing singleton is marked missing, and the receipts show by status with their errors by code
- **And** a summary with no `pushReceipts` or no `push` block shows the page without that block
- **And** whatever `deploy.other` holds (the text of an unconfigured or unreachable peer, null, a number, an identity with null fields), the deploy line says not configured, unreachable or unknown, and the rest of the page still shows
- **And** the summary is fetched again only when `admin-eh-refresh` is pressed
test: `frontend/apps/admin/src/pages/EngineHealthPage.test.tsx` › `shows the engine's numbers, an overdue job, a missing singleton and an unconfigured peer` (+4 more)

#### ADMIN-ENGINE-HEALTH-23: A client reports each failed push registration with closed fields only (rule 8d)
- **Given** the web app or the iOS/Android app registering for push, and the save of the token failing with a 503
- **When** the attempt fails, and again on each retry
- **Then** one report is posted per failed attempt with `platform`, `phase`, `permission`, `build` and an `errorClass` such as `http_503`: never the error's message, the token or a class the server would refuse (those become `unknown`; a class is cut at 60 characters)
- **And** a refused permission and a simulator report nothing; a report that fails is dropped, not retried; a reporter that throws does not stop the registration; a stopped reporter sends nothing
- **And** the web's report goes with the user's own token, outside the API client
test: `frontend/apps/web/src/utils/pushFailureReport.test.ts` › `a save answered 503 sends one report with the closed fields and the user's token` (+9 more)

### Not this spec
- Retrying, re-arming or running the engine by hand (`process_rounds`, "send now") — never from the
  console in this spec.
- Alerting (paging someone when a count crosses a threshold) — a later ticket if wanted.
- Request logs and error tracking (nginx and container logs stay where they are).
- Editing a coach's engine settings — the coach does that in the app (`notifications.config`).

### Notes
- PAD-746 (rule 8): the reach definition and baseline are G's PAD-741 query (prod, read-only,
  2026-10-22 ~19:00Z). The client wiring (rule 8d) lands after PAD-744 (#818), which adds the
  hooks.
- Linear: PAD-534. Epic PAD-530. Depends on PAD-531.
- Facts verified on staging's code on 2026-10-06: vacancies carry `current_round_number` and
  `current_batch_number`; the job store is `SQLAlchemyJobStore` outside tests; `pastdue_<id>` jobs
  have a 6-hour misfire grace (PAD-478); no table recorded failed sends before this spec;
  `GET /api/app/healthz` answered only `{"status": "ok"}`.
- Decision 2026-10-07 (coordinator default, confirmed): `gitSha` and `alembicHead` are on the
  admin API only, never on the public `healthz`; the other-environment read costs the console a
  service token for that environment (wiring left to PAD-534).
- Decision 2026-10-07 (coordinator default, confirmed): `delivery_incidents` rows are kept 30 days.

#### ADMIN-ENGINE-HEALTH-24: The engine block counts sessions, open spots and counting invitations (rule 10)
- **Given** one coach on `new` and one on `old`; two new-engine sessions starting tomorrow (one with a left spot covered by a counting invitation and an uncovered right spot, one full), one that has started; and invitations: two counting (tiers 1 and 2), one answered sorry, one past its `counts_until`, one answered yes
- **When** support GETs `/admin/api/engine-health`
- **Then** `engine.coaches` is 1 old and 1 new, `engine.sessions` is 2, `engine.openSpots` is one left and one right with one uncovered, and `engine.invitations` holds 2 counting (one per tier) and 2 open-not-counting, the answered one in neither
test: `backend/padel_app/tests/test_pad918_engine_health_new_engine.py` › `test_the_engine_block_counts_sessions_spots_and_counting_invitations`

#### ADMIN-ENGINE-HEALTH-25: Approvals, alerts, the outbox and the tick are visible (rule 10)
- **Given** one session with a pending request, one dismissed, one with a no-candidate alert, three outbox rows of which one was written 10 minutes ago (pinned clock), and no `engine_tick` job
- **When** the summary is read
- **Then** `engine.approvals` is 1 pending and 1 dismissed, `engine.alerts` is 1 `no_candidate`, `engine.outbox` is 3 with 1 stuck, and `engine.tick` says the job is missing
test: `backend/padel_app/tests/test_pad918_engine_health_new_engine.py` › `test_approvals_alerts_outbox_and_tick_are_visible`

#### ADMIN-ENGINE-HEALTH-26: No engine block while no coach is on the new engine (rule 10)
- **Given** every coach on `old`
- **When** the summary is read
- **Then** it has no `engine` block and rule 2's blocks are unchanged
test: `backend/padel_app/tests/test_pad918_engine_health_new_engine.py` › `test_no_engine_block_while_no_coach_is_on_the_new_engine`

#### ADMIN-ENGINE-HEALTH-27: A new-engine coach's view shows the engine's settings and sessions, naming no student (rule 11)
- **Given** a coach on `new` with one upcoming session (an open right spot, two counting invitations, a pending approval request)
- **When** support GETs the coach's engine settings
- **Then** the answer has `engineVersion` `new`, the mapped settings, and the session with its open spot, 2 counting invitations and its pending state, and no student id or name anywhere; for a coach whose settings raise `SettingsError`, the answer carries the error's message and still answers 200
test: `backend/padel_app/tests/test_pad918_engine_health_new_engine.py` › `test_a_new_engine_coachs_view_names_no_student`

#### ADMIN-ENGINE-HEALTH-28: A session the tick fails on is recorded and the others go on (rule 12)
- **Given** two new-engine sessions, the first made to raise during the tick
- **When** the tick runs
- **Then** the second is planned, one `engine_session_failed` row names the first's lesson instance with channel `scheduler`, and the summary's `engine.tick` counts 1 failure in 24 hours
test: `backend/padel_app/tests/test_pad918_engine_health_new_engine.py` › `test_a_failing_session_is_recorded_and_the_rest_go_on`

#### ADMIN-ENGINE-HEALTH-29: The page shows the engine block when the summary has one (rule 10)
- **Given** support on `/engine-health` and a summary with an `engine` block
- **Then** coaches by engine, sessions, open spots by type with the uncovered count, counting and open-not-counting invitations by tier, approvals, alerts, the outbox with its stuck count and the tick (missing, overdue, failures) each show in their place
- **And** a summary without an `engine` block shows the page without it
test: `frontend/apps/admin/src/pages/EngineHealthPage.test.tsx` › `shows the new engine's block, and no block when the summary has none`

### Open questions
- What the console reads once vacancies are gone (swap decision 1) — Decision (coordinator, owner away, PAD-912, 2026-11-11; the owner can reverse it): a read-only projection
  per spot type during cutover only, then the engine's own state, because the console is the one
  reader that must see both engines while coaches move.
  Reading (S, owner away, PAD-913, 2026-11-12; the owner can reverse it): the projection is the
  `engine` block itself (rule 10). Old-engine sessions keep rule 2's vacancy counts and new-engine
  sessions show in `engine`, side by side, so no vacancy-shaped copy of the engine's state is built.
- The new engine's tick in the scheduler panel — decision (S, owner away, PAD-913; the owner can reverse it): one job, its last run and its last failure per session, so a failing session shows without hiding the rest (`notifications.invitations` rule 21's new reading).
- The kind for a failing session (rule 12) — decision (S, owner away, PAD-913, 2026-11-12; the owner can
  reverse it): a new `delivery_incidents` kind, `engine_session_failed`, rather than reusing
  `reminder_skipped_past_due`, because the two failures mean different things and a plain `String(32)`
  needs no migration (rule 9).
