---
id: notifications.config
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/notifications/coach-tunes-the-invitation-engine.business.md
governed_by: []
---

# notifications.config


### Intent
Coaches configure the notification engine: timing, restrictions, matching rules, tiebreakers, and message templates.

### Entities
- **NotificationConfig** (`notification_configs`), one row per coach (PAD-279, audit M21). **Typed columns** for every scalar setting: auto_notify_enabled, invitation_mode (automatic|semi_automatic), reminder_type / reminder_value / reminder_time (the first reminder), invitation_start_type / invitation_start_value / invitation_start_time (the invitation window), reminder_count, hours_between_reminders, cancellation_deadline_hours, max_simultaneous_enabled / max_simultaneous_value, max_total_enabled / max_total_value, min_time_before_class_enabled / min_time_before_class_value, max_invites_per_student_per_day_enabled / max_invites_per_student_per_day_value, quiet_hours_enabled, max_inactive_time_enabled / max_inactive_time_value, exclude_inactive_accounts, excluded_players_enabled, open_spots_visible (nullable). **List-shaped JSON** stays JSON, stamped by `schema_version`: priority_criteria, notification_groups, message_templates, invitation_groups, tiebreakers, excluded_player_ids, eligibility_rules (nullable — see 7a). The former `rounds`, `invitation_start_timing`, `reminder_timing` and `restrictions` JSON columns no longer exist.

### Rules
1. One config per coach (upserted on first access)
2. `auto_notify_enabled` toggles the automatic invitation engine
3. `invitation_mode`: `"automatic"` (default) or `"semi_automatic"`. Only relevant when `auto_notify_enabled` is true. In `semi_automatic` mode, vacancies require coach approval before the engine sends invitations (see notifications.semi-auto-approval); in `automatic` mode behavior is unchanged
4. First reminder timing (`reminder_type`, `reminder_value`, `reminder_time`; on the wire `reminderTiming.firstReminder`): `{type: "hours_before", value: N}` or `{type: "days_before", days: N, time: "HH:MM"}`. `hours_before` counts real hours before the class's start, and `time` is the club's wall clock on the class's own date (`notifications.reminders` rule 15, PAD-256)
5. Invitation window (`invitation_start_type`, `invitation_start_value`, `invitation_start_time`; on the wire `reminderTiming.invitationStart`): when to start sending invitations after a vacancy. One home only — the duplicate `invitation_start_timing` column and its precedence dance are gone (PAD-279)
6. Restrictions (typed columns, composed on the wire as the `restrictions` object): maxSimultaneous, maxTotal, maxInactiveTime, minTimeBeforeClass, maxInvitesPerStudentPerDay, quietHours, excludedPlayers, excludeUnpaidSubscription (labelled "Exclude inactive accounts" — rule 7c)
6a. **(PAD-136)** `quietHours` is a **club-local wall clock** window of **22:00–07:00**, evaluated against
   the club timezone (`Europe/Lisbon`), consistent with `calendar` rule 6. The bounds are
   currently fixed constants — `quietHours` carries only `{enabled}` and no start/end — so
   "22:00–07:00" is the behaviour, not a default the coach can override. Because instants are
   stored as naive UTC, the check MUST convert to club-local before comparing the hour;
   comparing a UTC hour makes the window drift to 23:00–08:00 local through Portuguese summer
   time (WEST = UTC+1) while reading correctly in winter (WET = UTC+0). Only restrictions with
   wall-clock semantics need this conversion: `maxTotal` (a count) carries none, and
   `minTimeBeforeClass` (a duration) only needs the class's wall-clock start turned into an instant
   (`notifications.invitations` rule 11, PAD-256). `maxInvitesPerStudentPerDay` DOES carry them — see rule 6b.
6b. **(PAD-144)** `maxInvitesPerStudentPerDay` counts over the **club-local calendar day**
   (`Europe/Lisbon`), not the UTC day. "Per day" is a wall clock the coach reads off their own
   calendar, so the counting window is local midnight → local midnight, and the boundary must be
   *derived* in club-local time and then *converted back* to naive UTC for comparison against
   `NotificationEvent.created_at` (which is stored naive UTC). Deriving it with a bare
   `.replace(hour=0, ...)` on a naive-UTC instant pins the window to UTC midnight, which through
   Portuguese summer time runs 01:00 local → 01:00 local: invitations sent between 00:00 and
   01:00 local count against the *previous* day's quota, so a student can receive more than the
   configured number within one local day. Like rule 6a this self-corrects in winter, so it
   presents as intermittent.
   This is the same defect family as rule 6a and `calendar` rule 6; the round-trip back to UTC is
   the part rule 6a did not need, because comparing an hour never had to leave local time.
6c. **`maxTotal` is a budget per CLASS OCCURRENCE (PAD-432).** It caps the invitations for one
   class instance (`lesson_instance_id`, one date of a class) across ALL its open spots, counting the
   ones still pending (`sent`) and the ones accepted (`confirmed`) together: two open spots in one
   occurrence share one budget, each new batch is trimmed to what remains, and an occurrence at its
   budget invites no one more (`notification_service._check_restrictions` and
   `_send_invitation_batch`). **Queued and expired invitations do not count**: a queued one is not
   charged until it is sent, and an invitation that expires gives its place back to the budget, so
   "max total" is not a lifetime cap. The settings copy says "Max total per class" / "Invitations
   for one class date, pending and accepted together".
7. `invitation_groups`: ordered rule-based groups for matching (attribute, operation, value)
7a. `eligibility_rules` (nullable) and `open_spots_visible` (nullable) are the **coach-standard tier**
   of `eligibility.rules` and `eligibility.open-spot-visibility`. `NULL` means unset at this tier,
   and unset is not a value — see `eligibility.cascade` rule 1. They round-trip through
   `GET|POST /api/app/notify/config` as `eligibilityRules` and `openSpotsVisible`.
7b. `invitation_groups` and `eligibility_rules` are **separate settings with separate meanings**:
   groups order who gets asked first, eligibility decides who may join at all. Neither is derived
   from the other, and existing coaches' `invitation_groups` are never migrated into
   `eligibility_rules` (`eligibility.rules` rule 10).
7c. **Account status, not payment (PAD-132, closed 2026-09-10).** The `subscription_status` group
   attribute and the `excludeUnpaidSubscription` restriction read `users.status`, which is
   **account activation** (`inactive | active | disabled`), not payment state — there is no payment
   model anywhere in the product. Every label and description on both platforms now says so
   ("Account status", "Exclude inactive accounts"); the two **wire identifiers are kept** because
   they are stored inside every coach's saved config JSON and consumed by the engine, the
   simulation and both clients — renaming them would be a data migration for no behaviour change
   (decision `2026-09-10-account-status-not-payment`). `eligibility.rules` rule 5 explains why
   eligibility offers no payments attribute.
8. `tiebreakers`: ordered ranking criteria (level, attendance, side, account status)
9. `message_templates`: customizable text for invite, confirm, decline, reminder, etc.
10. Updating timing configs reschedules all future scheduler jobs
11. `cancellation_deadline_hours` (default 24; on the wire `restrictions.cancellationDeadlineHours`): hours before class start after which a student cancellation is still allowed but flagged as a "late cancellation" (see attendance.confirm). Exposed and round-tripped through `GET|POST /api/app/notify/config`

12. **Typed storage, stable wire shape (PAD-279, audit M21).** Every scalar setting lives in its own
   typed column with a database default; nothing scalar is read out of a JSON blob any more, so a
   NULL can never be "defaulted" into a filter (the idiom behind PAD-122). The list-shaped settings
   that remain JSON carry `schema_version` (1 today) so a later shape change can be migrated by
   version instead of by sniffing keys. `GET|POST /api/app/notify/config` keeps its camelCase shape
   exactly — `restrictions` and `reminderTiming` are composed from and decomposed into the columns
   server-side, and a POST that omits a restriction key leaves that column at its default, as the
   merge-over-defaults read always did — so neither client changes for this rule. The legacy
   `rounds` are gone with their column: an empty `invitation_groups` list now resolves to the
   built-in three groups (same level and side, same level, everyone), which is the same three
   waves `rounds` fell back to, so nobody's invitations change. The one-off migration backfills
   every row from its old JSON; a row whose blob does not parse or carries a wrong type keeps the
   column defaults for the unreadable part (the value the old getter returned for it), is logged,
   and is never skipped or failed. A stored `reminder_timing` with neither `firstReminder` nor
   `type` is a timing the scheduler could never fire; it is kept as **no reminder** (`reminder_type =
   "none"`, which the scheduler still schedules nothing for — the only shape whose backfill would
   otherwise change what students receive) and is logged, while any `reminderCount` /
   `hoursBetweenReminders` / `invitationStart` it does carry are kept. The coach turns reminders on
   by picking a timing in Settings, as before. Booleans stored as `0`/`1` or `"true"`/`"false"` by an older client are read the
   way the old truthiness check read them, not reset to the default.

13. **(PAD-404) The evaluation reminder's two columns.** `evaluation_reminder_type varchar(16)
   NOT NULL DEFAULT 'never'` and `evaluation_reminder_value int NULL` live on this row because
   it is where per-coach typed settings live, but they belong to `evaluations.reminders`
   (rules 1–3) and are read and written only by `GET|PUT /api/app/evaluation_settings` — never
   by `GET|POST /api/app/notify/config`, whose wire shape does not change. They are **not** the
   class reminder of rule 4 (`reminder_type` / `reminder_value` / `reminder_time`); the
   `evaluation_` prefix is the whole difference and the spec names both so nobody wires one to
   the other. The `GET` of the evaluation setting must not upsert a row (rule 1 is the class
   config's behaviour, not this setting's).

14. **(PAD-433) One restrictions section, on both clients.** Web (`RestrictionsPanel`) and iOS
   (Settings → Auto-Invite Engine → Restrictions) show the same nine controls over the same
   `restrictions` object of `GET|POST /api/app/notify/config`: `maxSimultaneous` 1–20 step 1,
   `maxTotal` 1–50 step 1, `maxInactiveTime` 15–1440 min step 15, `minTimeBeforeClass` 5–240 min
   step 5, `maxInvitesPerStudentPerDay` 1–10 step 1, the `quietHours`, `excludedPlayers` and
   `excludeUnpaidSubscription` toggles, and `cancellationDeadlineHours` 0–168 h step 1 (no toggle).
   The bounds and steps live in ONE place, `RESTRICTION_BOUNDS` in `@levelup/config`, and a step
   clamps to them; neither client carries its own copy, so the two cannot drift. A disabled
   stepper row hides its value, as on web. While `autoNotifyEnabled` is false the section stays
   visible but its controls are disabled, as on web (`NotificationsEngineSection`'s `disabled`).
   **Words (PAD-450):** `maxSimultaneous` caps invitations, so it reads "Máximo de convites
   simultâneos / Quantos alunos são convidados ao mesmo tempo" (en "Max simultaneous invitations / How
   many students are invited at the same time"), and `maxTotal` reads as rule 6c says. Quiet hours and
   the minimum time before class keep "notificações / notify": `_check_restrictions` also gates the
   reminder armed for a student who joins late, so they cover more than invitations.
14a. **Excluded players are named (B-168).** `GET /api/app/notify/config` adds a read-only
   `excludedPlayerNames` map `{playerId: name}` for every id in `restrictions.excludedPlayers.playerIds`
   that is still one of the coach's players and not a deleted account (`users.status != "disabled"`, as the
   search, PAD-268); `POST` ignores the key. Each client's chip shows that
   name (or the name picked from the search in this session) and falls back to the id only for a
   player the coach no longer has. The key is additive: App Store clients that do not read it are
   unaffected.

### Acceptance Criteria

#### Get or create config
- **Given** a coach with no existing config
- **When** GET `/api/app/notification_config`
- **Then** a default config is created and returned

#### Update config
- **Given** an existing config
- **When** POST `/api/app/notification_config` with `{"auto_notify_enabled": true, "reminder_timing": {"type": "hours_before", "value": 24}}`
- **Then** the config is updated
- **And** scheduler jobs are rescheduled based on new timing

#### Update invitation mode
- **Given** an existing config with `auto_notify_enabled: true`
- **When** POST `/api/app/notification_config` with `{"invitation_mode": "semi_automatic"}`
- **Then** the config is updated
- **And** subsequently created vacancies require coach approval before invitations are sent

#### Coach configures cancellation deadline in Settings (PAD-45)
- **Given** an authenticated coach on Settings → Notifications
- **When** they open the Restrictions section
- **Then** a "Cancellation deadline" control is shown with an hours-before-class value defaulting to 24
- **And** changing the value and saving persists it via POST `/app/notify/config` under `restrictions.cancellationDeadlineHours`
- **And** the new value survives a page reload

#### The config API keeps its shape over typed columns (PAD-279)
- **Given** a coach whose settings were saved before PAD-279 as JSON blobs — a nested `reminderTiming`, a `restrictions` object with a non-default `maxSimultaneous` and `cancellationDeadlineHours`, and an `invitation_start_timing` column of its own
- **When** the migration runs and the coach loads GET `/api/app/notify/config`
- **Then** `reminderTiming`, `restrictions` and the resolved invitation window read exactly as before, from the typed columns, and no `rounds` key is present
- **And** running the migration a second time changes nothing
- **And** a row whose old blob is not valid JSON keeps every default for that blob and the migration still completes

#### An empty invitation-group list means the built-in groups (PAD-279)
- **Given** a coach whose `invitation_groups` is `[]`
- **When** a vacancy opens
- **Then** the engine runs the three built-in groups in order, exactly the waves the removed `rounds` fallback produced

#### A timing the scheduler could not fire becomes the default, its counts survive (PAD-279)
- **Given** a coach whose stored `reminder_timing` is `{"reminderCount": 2, "hoursBetweenReminders": 6}` (no `firstReminder`, no `type`) and whose `restrictions` carry `"enabled": 1` and `"enabled": "false"` values
- **When** the migration runs
- **Then** the row still sends no reminder (`reminder_type = "none"`, the scheduler creates no reminder job), is logged with its id, and `reminderCount` is 2 and `hoursBetweenReminders` is 6
- **And** the `1` reads as enabled and the `"false"` as disabled

#### maxTotal is one budget per class date, shared by its open spots (PAD-432)
- **Given** a coach with `maxTotal` = 3 (enabled) and a class occurrence with two open spots, where 2 invitations for it are already `sent`
- **When** the engine builds the next invitation batch for that occurrence, with 5 eligible students
- **Then** at most 1 invitation goes out (the batch is trimmed to the remaining budget of 3 − 2), whichever open spot it is for
- **And** once 3 are `sent`/`confirmed` for that occurrence, the eligibility gate refuses further invitations for it

#### An expired invitation gives its place back (PAD-432)
- **Given** the same occurrence at its budget of 3, where one of the 3 invitations then expires
- **When** the engine checks the occurrence again
- **Then** one more invitation may be sent: `expired` (and `queued`) invitations do not count against `maxTotal`

#### iOS shows the same nine restriction controls as web (PAD-433)
- **Given** a coach on iOS Settings with restrictions `maxSimultaneous {enabled: true, value: 3}`, `maxTotal {enabled: true, value: 10}`, `quietHours {enabled: true}` and `cancellationDeadlineHours` 24
- **When** they open the Restrictions section of the Auto-Invite Engine card
- **Then** the nine controls of rule 14 are shown, in web's order, with "3", "10" and "24" as the values and the quiet-hours switch on

#### A step clamps at the shared bounds (PAD-433)
- **Given** `maxSimultaneous` at 20, `maxInactiveTime` at 15, and `cancellationDeadlineHours` at 0
- **When** the coach presses + on `maxSimultaneous`, − on `maxInactiveTime` and − on the cancellation deadline, on either client
- **Then** the values stay 20, 15 and 0, and the pressed button is disabled; a − on `maxInactiveTime` at 60 gives 45 (step 15)

#### An excluded player is named after a reload (PAD-433, B-168)
- **Given** a coach whose saved `restrictions.excludedPlayers` is `{enabled: true, playerIds: ["<Alice's player id>"]}`
- **When** they load `GET /api/app/notify/config` and open the Restrictions section on either client
- **Then** the response carries `excludedPlayerNames: {"<Alice's player id>": "Alice Andrade"}` and the chip reads "Alice Andrade", not the id
- **And** a `POST` carrying `excludedPlayerNames` changes nothing stored

#### A restriction changed on iOS survives reopening Settings (PAD-433)
- **Given** a coach on iOS Settings with `maxSimultaneous` at 3
- **When** they press + once, leave Settings and open it again
- **Then** `maxSimultaneous` reads 4, read back from `GET /api/app/notify/config`

