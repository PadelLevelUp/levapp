---
id: delivery.production-activity-reset
status: implementing
depends_on: []
implements: ../../specs-business/delivery/production-starts-clean-for-real-use.business.md
governed_by: []
---

# delivery.production-activity-reset

> Linear: PAD-632. Owner request (via the orchestrator), 2026-10-11: clear production activity
> before real use; every account stays. The script is run by the operator after a backup and the
> owner's go, never by a session.

### Intent
One reviewed, rehearsed script removes the trial period's activity from production and nothing
else, in a single transaction, with a dry run that shows what it would do.

### Entities
- **DELETES:** Message, MessageReaction, MessageReport, ConversationParticipant, Conversation,
  ReminderAttempt, NotificationEvent, Vacancy, WaitingListEntry, StandingWaitingListEntry,
  ReplacementApprovalPrompt, ClassRequest (+ the CalendarBlock hold it owns), ClassJoinRequest,
  Presence (started occurrences only), EvaluationRecord / EvaluationEntry / EvaluationShare,
  PlayerLevelHistory, and APScheduler follow-up jobs.
- **KEEPS:** User, Coach, Player, Club, Court, Lesson, LessonInstance, series rosters
  (`player_in_lesson`), future presences, `coach_in_player` (levels), levels, categories,
  CoachPlayerNote, invitations, join tokens, every other scheduler job.

### Rules
1. **One transaction, dry run by default.** `backend/scripts/prod_reset_activity.sql` runs under
   psql in one transaction that locks the tables it writes. It prints every table's count before
   and after, then ROLLS BACK unless run with `-v apply=1`.
2. **The demo coach is spared.** `spare_coach_id` (default 3) and every row of its students,
   classes and conversations stay. The script refuses to run if that coach's username does not
   start with `applereview`.
3. **Attendance history goes; enrolment stays.** A presence on an occurrence that has started (on
   the club's wall clock, R-023) is deleted. A presence on a future occurrence IS that occurrence's
   enrolment (`classes.instance-enrollment` rule 1, PAD-259) and stays.
4. **Current levels do not move.** `coach_in_player.level_id` is the current level every read uses
   (`players.level-history` rule 2); history is only its record. The script asserts the levels are
   identical before it commits.
5. **Conversations go.** The app recreates a coach–student conversation on demand
   (`Conversation.get_or_insert`, on the system-message path and on `POST /app/conversation`).
   `conversations.last_message_id` is cleared before the messages go.
6. **No trial reminder is sent again.** The `reminder_*_retry_*` and `ask_*` scheduler jobs follow up
   reminder attempts that are deleted; left behind they would count 0 sent and send reminder 1
   again, so they are deleted. Base reminder (`reminder_<instance>`, `reminder_lesson_*`),
   invitation-start (`invite_start_lesson_*`) and system jobs reference only lessons and
   occurrences, which stay, and fire as before.
7. **No orphans.** The delete order follows the foreign keys; every key into a deleted table
   cascades or sets null, and no kept table references a deleted one. The script asserts no
   message outlives its conversation and no `last_message_id` dangles.

### Acceptance Criteria

#### The dry run reports and changes nothing (rule 1)
- **Given** a database with activity
- **When** the script runs without `apply`
- **Then** it prints every table's counts and "DRY RUN: rolled back", and no count changes

#### Apply clears the activity and spares the demo coach (rules 1, 2)
- **Given** a real coach and the demo coach, each with a conversation, a message, presences, a
  reminder attempt, an invitation event, a vacancy and a level-history row
- **When** the script runs with `apply=1`
- **Then** only the demo coach's rows remain

#### A future enrolment stays, attendance history goes (rule 3)
- **Then** the real student's presence on next week's class remains, and on last week's is gone

#### Current levels do not move (rule 4)
- **Then** every `coach_in_player` row keeps its level

#### Only follow-ups of deleted reminders leave the scheduler (rule 6)
- **Then** `reminder_<id>_retry_*` and `ask_<id>_*` are gone; `reminder_<id>`, `invite_start_lesson_*`
  and the demo coach's follow-up remain

#### A spare coach that is not the reviewer account stops the script (rule 2)
- **Given** the spare coach's username does not start with `applereview`
- **Then** the script exits with an error and changes nothing

#### A second run deletes nothing (rule 1)
- **Then** applying it again leaves every count as the first run left it

### Notes
- Tests: `backend/padel_app/tests/test_pad632_prod_reset_activity.py` (postgres backend only; runs
  the script through psql).
- Rehearsal on a copy of staging, 2026-10-11 — counts in the PR (#PR) and on PAD-632.
