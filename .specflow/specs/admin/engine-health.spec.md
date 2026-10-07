---
id: admin.engine-health
status: implemented
depends_on: [admin.foundation, notifications.invitations, notifications.waiting-list, notifications.reminders, notifications.config, messaging.push-notifications]
implements: ../../specs-business/admin/staff-operate-the-platform-without-the-database.business.md
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
  `alembic_version`
- **CREATES:** `delivery_incidents` — `id`, `created_at`, `kind`
  (`email_failed`|`push_failed`|`reminder_skipped_past_due`), `channel`
  (`email`|`webpush`|`apns`|`fcm`|`expo`|`scheduler`; an Expo receipt maps the device's platform
  to `apns` (ios) or `fcm` (android) and is `expo` when the device row does not say), `user_id` (FK → users, SET NULL, nullable),
  `subject_type` / `subject_id` (nullable: the lesson instance, vacancy or notification the
  incident belongs to), `error_class` (String(120)), `detail` (String(500), truncated). No
  recipient address, message body, device token or push key is stored. Rows older than 30 days
  are deleted by a daily scheduler job `prune_delivery_incidents` (R-010 naming: fixed id).
- **WRITES:** `delivery_incidents` only, from the existing failure paths (rule 3). The page
  itself writes nothing.

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
     `extend_schedule_window`, `prune_delivery_incidents`), the count whose `next_run_time` is
     more than 5 minutes in the past (overdue), and whether each fixed singleton exists.
   - `incidents`: counts of `delivery_incidents` by `kind` for the last 24 hours and the last
     7 days, with the 20 most recent rows.
   - `accounts`: users by `status` (`inactive`/`active`/`disabled`), coaches by
     `approval_status`, players, and accounts created in the last 7 days.
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
   its `ADMIN_PEER_INBOUND_TOKEN` (unset refuses every peer read), and logs each peer read naming
   "peer". Every other admin route still needs an admin session (its `require_role` is a second
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

### Acceptance Criteria

#### The summary counts what the engine holds (rule 2)
- **Given** two open vacancies at round 1 batch 1 and one at round 2 batch 1, one filled vacancy, three NotificationEvents `sent` and one `expired`, and a `support` token
- **When** support GETs `/admin/api/engine-health`
- **Then** `vacancies` reports 2 at `(1,1)` and 1 at `(2,1)` and no filled one, and `invitations` reports 3 live

#### Overdue jobs and missing singletons are visible (rule 2)
- **Given** a job store with `process_batches` present, `extend_schedule_window` absent, and one `reminder_lesson_*` job whose `next_run_time` is 10 minutes in the past (pinned clock)
- **When** the summary is read
- **Then** `scheduler` reports one overdue job and `extend_schedule_window` as missing

#### A failed email is recorded without failing the caller (rule 3)
- **Given** a mail transport that raises
- **When** a coach approval sends its email
- **Then** the approval still succeeds, one `delivery_incidents` row `email_failed` exists with the coach's user id and no email address in any column, and the summary's 24-hour `email_failed` count is 1

#### A failed push is recorded (rule 3)
- **Given** a web push subscription the push service answers 410 to
- **When** a reminder is sent to that user
- **Then** one `push_failed` row with channel `webpush` exists and holds no subscription data

#### A missed reminder is recorded (rule 3)
- **Given** a `reminder_lesson_*` job whose run time passed while the scheduler was down beyond its grace time
- **When** the scheduler starts and reports the miss
- **Then** one `reminder_skipped_past_due` row names that lesson instance

#### A failing incident insert never breaks a send (rule 3)
- **Given** the `delivery_incidents` insert made to raise
- **When** an email fails
- **Then** the caller's outcome is unchanged and the failure is only logged

#### Old incidents are pruned (entities)
- **Given** incidents created 31 and 29 days ago (pinned clock)
- **When** `prune_delivery_incidents` runs
- **Then** only the 29-day-old row remains

#### Deploy identity for both environments (rules 4, 5)
- **Given** a backend started with `GIT_SHA=abc1234` and an other-environment `/admin/api/deploy-identity` stub answering `{gitSha: "def5678", alembicHead: "x1"}`, then a stub that times out
- **When** the summary is read twice
- **Then** `deploy.this.gitSha = "abc1234"`, `deploy.this.alembicHead` equals the database's `alembic_version`, `deploy.other.gitSha = "def5678"`; and the second read answers `deploy.other = "unreachable"` within 3 seconds

#### Per-coach settings are readable and not writable (rules 1, 6)
- **Given** coach `maria` with `invitation_mode` set and an operator token
- **When** the operator GETs her engine settings, then sends `PUT` and `POST` to the same path
- **Then** the GET answers her settings; the `PUT` and `POST` are 405, and her NotificationConfig is unchanged

#### No write route on the page (rule 1)
- **Given** the URL map
- **When** the guard test lists rules under `/admin/api/engine-health`
- **Then** every rule allows only `GET`, `HEAD` and `OPTIONS`

### Not this spec
- Retrying, re-arming or running the engine by hand (`process_rounds`, "send now") — never from the
  console in this spec.
- Alerting (paging someone when a count crosses a threshold) — a later ticket if wanted.
- Request logs and error tracking (nginx and container logs stay where they are).
- Editing a coach's engine settings — the coach does that in the app (`notifications.config`).

### Notes
- Linear: PAD-534. Epic PAD-530. Depends on PAD-531.
- Facts verified on staging's code on 2026-10-06: vacancies carry `current_round_number` and
  `current_batch_number`; the job store is `SQLAlchemyJobStore` outside tests; `pastdue_<id>` jobs
  have a 6-hour misfire grace (PAD-478); no table recorded failed sends before this spec;
  `GET /api/app/healthz` answered only `{"status": "ok"}`.
- Decision 2026-10-07 (coordinator default, confirmed): `gitSha` and `alembicHead` are on the
  admin API only, never on the public `healthz`; the other-environment read costs the console a
  service token for that environment (wiring left to PAD-534).
- Decision 2026-10-07 (coordinator default, confirmed): `delivery_incidents` rows are kept 30 days.
