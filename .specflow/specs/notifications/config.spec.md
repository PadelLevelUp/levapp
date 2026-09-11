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
7. `invitation_groups`: ordered rule-based groups for matching (attribute, operation, value)
7a. **(pending PAD-128)** `eligibility_rules` (nullable) and `open_spots_visible` (nullable) are the **coach-standard tier**
   of `eligibility.rules` and `eligibility.open-spot-visibility`. `NULL` means unset at this tier,
   and unset is not a value — see `eligibility.cascade` rule 1. They round-trip through
   `GET|POST /api/app/notify/config` as `eligibilityRules` and `openSpotsVisible`.
7b. **(pending PAD-128)** `invitation_groups` and `eligibility_rules` are **separate settings with separate meanings**:
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
   and is never skipped or failed.

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
