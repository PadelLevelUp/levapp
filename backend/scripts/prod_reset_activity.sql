-- PAD-632: clear production ACTIVITY before real use. Every account stays.
-- Spec: .specflow/specs/delivery/production-activity-reset.spec.md
--
-- ONE transaction. DRY RUN by default: it prints the counts before and after each table, then
-- ROLLS BACK. Only `-v apply=1` commits. Run it after a backup and the owner's go:
--
--   dry run: psql -v ON_ERROR_STOP=1 -v apply=0 -U padel_app_user -d padel_app -f prod_reset_activity.sql
--   apply:   psql -v ON_ERROR_STOP=1 -v apply=1 -U padel_app_user -d padel_app -f prod_reset_activity.sql
--
-- On the VM, pipe the file over stdin: ... | sudo docker exec -i postgres psql -v ON_ERROR_STOP=1 -v apply=0 -U padel_app_user -d padel_app
--
-- SPARED: the App Store reviewer's demo coach (`spare_coach_id`, default 3) and everything of its
-- students, while the review is open. The script aborts if that coach's username does not start
-- with "applereview", so a renumbered database never spares the wrong coach.
--
-- DELETED (owner's scope, minus the spared rows):
--   messages, message_reactions, message_reports, conversation_participants, conversations
--   reminder_attempts, notification_events
--   vacancies, waiting_list_entries, standing_waiting_list_entries, replacement_approval_prompts,
--   class_requests (+ the calendar hold blocks they own), class_join_requests
--   presences OF OCCURRENCES THAT HAVE ENDED (attendance history). A future or running
--     occurrence's presences ARE its enrolment (PAD-259) and stay.
--   evaluation_records / evaluation_entries / evaluation_shares, player_level_history
--   apscheduler follow-up jobs (`reminder_*_retry_*`, `ask_*`): they follow up reminder_attempts
--     that no longer exist, and would send reminder 1 again.
-- KEPT: users, coaches, players, clubs, courts, lessons, lesson_instances, series rosters,
--   future enrolments, levels (coach_in_player.level_id is the current level), categories,
--   coach_player_notes, invitations, join tokens, every other scheduler job.

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\if :{?spare_coach_id}
\else
  \set spare_coach_id 3
\endif

BEGIN;
-- A live transaction holding one of these tables makes the run give up, not wait forever.
SET LOCAL lock_timeout = '10s';

-- Nothing writes to these tables while the transaction runs (readers are not blocked).
LOCK TABLE messages, message_reactions, message_reports, conversation_participants, conversations,
  reminder_attempts, notification_events, vacancies, waiting_list_entries,
  standing_waiting_list_entries, replacement_approval_prompts, class_requests, class_join_requests,
  presences, evaluation_records, evaluation_entries, evaluation_shares, player_level_history,
  calendar_blocks, apscheduler_jobs
  IN SHARE ROW EXCLUSIVE MODE;

-- ── the spared set ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE spare_coach ON COMMIT DROP AS
  SELECT c.id, c.user_id FROM coaches c JOIN users u ON u.id = c.user_id
  WHERE c.id = :spare_coach_id AND u.username LIKE 'applereview%';

DO $$
BEGIN
  IF (SELECT count(*) FROM spare_coach) <> 1 THEN
    RAISE EXCEPTION 'spare coach is not the App Store reviewer account: refusing to run';
  END IF;
END $$;

CREATE TEMP TABLE spare_player ON COMMIT DROP AS
  SELECT DISTINCT cp.player_id AS id, p.user_id FROM coach_in_player cp JOIN players p ON p.id = cp.player_id
  WHERE cp.coach_id IN (SELECT id FROM spare_coach);
CREATE TEMP TABLE spare_user ON COMMIT DROP AS
  SELECT user_id AS id FROM spare_coach UNION SELECT user_id FROM spare_player WHERE user_id IS NOT NULL;
CREATE TEMP TABLE spare_instance ON COMMIT DROP AS
  SELECT lesson_instance_id AS id FROM coach_in_lesson_instance WHERE coach_id IN (SELECT id FROM spare_coach);
CREATE TEMP TABLE spare_lesson ON COMMIT DROP AS
  SELECT lesson_id AS id FROM coach_in_lesson WHERE coach_id IN (SELECT id FROM spare_coach);
CREATE TEMP TABLE spare_coach_player ON COMMIT DROP AS
  SELECT id FROM coach_in_player
  WHERE coach_id IN (SELECT id FROM spare_coach) OR player_id IN (SELECT id FROM spare_player);
CREATE TEMP TABLE spare_conversation ON COMMIT DROP AS
  SELECT DISTINCT conversation_id AS id FROM conversation_participants WHERE user_id IN (SELECT id FROM spare_user);
-- Class times are the club's wall clock (R-023): "over" is compared on Lisbon time. A class that is
-- running during the reset keeps its roster (the coach may be taking attendance).
CREATE TEMP TABLE ended_instance ON COMMIT DROP AS
  SELECT id FROM lesson_instances WHERE end_datetime < (now() AT TIME ZONE 'Europe/Lisbon');

-- ── what must not move ─────────────────────────────────────────────────────────
-- One definition, read before the deletes and again before the commit.
CREATE TEMP VIEW guard_now AS SELECT
  (SELECT md5(coalesce(string_agg(coach_id || ':' || player_id || ':' || coalesce(level_id::text, '-'), ',' ORDER BY id), ''))
     FROM coach_in_player) AS levels,
  (SELECT count(*) FROM presences WHERE lesson_instance_id NOT IN (SELECT id FROM ended_instance)) AS future_enrolments,
  (SELECT count(*) FROM player_in_lesson) AS series_rosters,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM lesson_instances) AS instances,
  (SELECT count(*) FROM messages m WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.id = m.conversation_id)) AS orphan_messages,
  (SELECT count(*) FROM conversations c WHERE c.last_message_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = c.last_message_id)) AS dangling_last_message;
CREATE TEMP TABLE guard_before ON COMMIT DROP AS SELECT * FROM guard_now;

CREATE TEMP TABLE counts (tbl text PRIMARY KEY, before bigint, after bigint) ON COMMIT DROP;
INSERT INTO counts (tbl, before)
SELECT t, (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || t, false, true, '')))[1]::text::bigint
FROM unnest(ARRAY['messages','message_reactions','message_reports','conversation_participants','conversations',
  'reminder_attempts','notification_events','vacancies','waiting_list_entries','standing_waiting_list_entries',
  'replacement_approval_prompts','class_requests','class_join_requests','presences','evaluation_records',
  'evaluation_entries','evaluation_shares','player_level_history','calendar_blocks','apscheduler_jobs']) AS t;

-- ── 2. notification history ────────────────────────────────────────────────────
DELETE FROM reminder_attempts
WHERE lesson_instance_id NOT IN (SELECT id FROM spare_instance) AND player_id NOT IN (SELECT id FROM spare_player);

DELETE FROM notification_events
WHERE coach_id NOT IN (SELECT id FROM spare_coach)
  AND lesson_instance_id NOT IN (SELECT id FROM spare_instance) AND player_id NOT IN (SELECT id FROM spare_player);

-- ── 3. invitations and waiting lists ───────────────────────────────────────────
DELETE FROM replacement_approval_prompts
WHERE coach_id NOT IN (SELECT id FROM spare_coach);

DELETE FROM waiting_list_entries
WHERE coach_id NOT IN (SELECT id FROM spare_coach)
  AND lesson_instance_id NOT IN (SELECT id FROM spare_instance) AND player_id NOT IN (SELECT id FROM spare_player);

DELETE FROM standing_waiting_list_entries
WHERE coach_id NOT IN (SELECT id FROM spare_coach) AND player_id NOT IN (SELECT id FROM spare_player);

-- A vacancy's events and prompts CASCADE with it. A demo student who also trains with a real coach
-- keeps their event on that coach's vacancy, so a vacancy something spared still points at stays.
DELETE FROM vacancies v
WHERE v.coach_id NOT IN (SELECT id FROM spare_coach) AND v.lesson_instance_id NOT IN (SELECT id FROM spare_instance)
  AND NOT EXISTS (SELECT 1 FROM notification_events ne WHERE ne.vacancy_id = v.id)
  AND NOT EXISTS (SELECT 1 FROM replacement_approval_prompts rp WHERE rp.vacancy_id = v.id);

DELETE FROM class_join_requests
WHERE coach_id NOT IN (SELECT id FROM spare_coach)
  AND lesson_instance_id NOT IN (SELECT id FROM spare_instance) AND player_id NOT IN (SELECT id FROM spare_player);

-- A pending class request holds a slot on the coach's calendar; the hold goes with it.
CREATE TEMP TABLE released_hold ON COMMIT DROP AS
  SELECT hold_block_id AS id FROM class_requests
  WHERE hold_block_id IS NOT NULL
    AND coach_id NOT IN (SELECT id FROM spare_coach) AND player_id NOT IN (SELECT id FROM spare_player);
DELETE FROM class_requests
WHERE coach_id NOT IN (SELECT id FROM spare_coach) AND player_id NOT IN (SELECT id FROM spare_player);
DELETE FROM calendar_blocks WHERE id IN (SELECT id FROM released_hold);

-- ── 4. attendance and evaluation history ───────────────────────────────────────
DELETE FROM evaluation_shares
WHERE record_id IN (SELECT id FROM evaluation_records WHERE coach_player_id NOT IN (SELECT id FROM spare_coach_player));
DELETE FROM evaluation_entries
WHERE coach_player_id NOT IN (SELECT id FROM spare_coach_player)
   OR record_id IN (SELECT id FROM evaluation_records WHERE coach_player_id NOT IN (SELECT id FROM spare_coach_player));
DELETE FROM evaluation_records WHERE coach_player_id NOT IN (SELECT id FROM spare_coach_player);

DELETE FROM player_level_history
WHERE coach_id NOT IN (SELECT id FROM spare_coach) AND player_id NOT IN (SELECT id FROM spare_player);

DELETE FROM presences
WHERE lesson_instance_id IN (SELECT id FROM ended_instance)
  AND lesson_instance_id NOT IN (SELECT id FROM spare_instance) AND player_id NOT IN (SELECT id FROM spare_player);

-- ── 1. messages and conversations ──────────────────────────────────────────────
-- The app recreates a coach–student conversation on demand (Conversation.get_or_insert, on the
-- system-message path and on POST /conversation), so the rows go.
DELETE FROM message_reactions
WHERE message_id IN (SELECT id FROM messages WHERE conversation_id NOT IN (SELECT id FROM spare_conversation));
DELETE FROM message_reports
WHERE message_id IN (SELECT id FROM messages WHERE conversation_id NOT IN (SELECT id FROM spare_conversation));
UPDATE conversations SET last_message_id = NULL
WHERE id NOT IN (SELECT id FROM spare_conversation);
DELETE FROM messages WHERE conversation_id NOT IN (SELECT id FROM spare_conversation);
DELETE FROM conversation_participants WHERE conversation_id NOT IN (SELECT id FROM spare_conversation);
DELETE FROM conversations WHERE id NOT IN (SELECT id FROM spare_conversation);

-- ── scheduler follow-ups of the deleted reminder attempts ──────────────────────
-- Job families (backend/padel_app/scheduler.py):
--   reminder_<instance>, reminder_lesson_<lesson>_<date>, invite_start_<instance>,
--   invite_start_lesson_<lesson>_<date>, pastdue_<instance>, process_batches,
--   extend_schedule_window, prune_delivery_incidents          -> KEPT (lessons/occurrences stay)
--   reminder_<instance>_retry_<ts>, reminder_lesson_<lesson>_<date>_retry_<ts>,
--   ask_<instance>_<player>_<ts>                               -> DELETED: they follow up attempts that
--     no longer exist and would send reminder 1 again. The demo coach's stay, and so does a
--     spared student's own ask pass.
DELETE FROM apscheduler_jobs j
WHERE (j.id ~ '^reminder_[0-9]+_retry_[0-9]+$' OR j.id ~ '^reminder_lesson_[0-9]+_[0-9-]+_retry_[0-9]+$'
       OR j.id ~ '^ask_[0-9]+_[0-9]+_[0-9]+$')
  AND coalesce(substring(j.id FROM '^reminder_([0-9]+)_retry_'), substring(j.id FROM '^ask_([0-9]+)_'), '-1')::int
      NOT IN (SELECT id FROM spare_instance)
  AND coalesce(substring(j.id FROM '^reminder_lesson_([0-9]+)_')::int, -1) NOT IN (SELECT id FROM spare_lesson)
  AND coalesce(substring(j.id FROM '^ask_[0-9]+_([0-9]+)_')::int, -1) NOT IN (SELECT id FROM spare_player);

-- ── report ─────────────────────────────────────────────────────────────────────
UPDATE counts SET after =
  (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || tbl, false, true, '')))[1]::text::bigint;

\echo
\echo '== rows per table: before -> after (deleted) =='
SELECT tbl AS "table", before, after, before - after AS deleted FROM counts ORDER BY tbl;

\echo '== guards: must all be true =='
SELECT n.levels = b.levels AS current_levels_unchanged,
       n.future_enrolments = b.future_enrolments AS future_enrolments_unchanged,
       n.series_rosters = b.series_rosters AS series_rosters_unchanged,
       n.users = b.users AS users_unchanged,
       n.instances = b.instances AS instances_unchanged,
       n.orphan_messages = 0 AS no_orphan_messages,
       n.dangling_last_message = 0 AS no_dangling_last_message
FROM guard_now n, guard_before b;

\echo '== spared (App Store demo coach and its students) =='
SELECT (SELECT count(*) FROM spare_player) AS students,
       (SELECT count(*) FROM spare_conversation) AS conversations_kept,
       (SELECT count(*) FROM messages) AS messages_kept,
       (SELECT count(*) FROM presences WHERE lesson_instance_id IN (SELECT id FROM spare_instance)) AS presences_kept;

-- Every guard is enforced: one that is not true aborts the transaction, whatever `apply` says.
DO $$
DECLARE n guard_now%ROWTYPE; b guard_now%ROWTYPE;
BEGIN
  SELECT * INTO n FROM guard_now;
  SELECT * INTO b FROM guard_before;
  IF n.levels IS DISTINCT FROM b.levels OR n.future_enrolments <> b.future_enrolments
     OR n.series_rosters <> b.series_rosters OR n.users <> b.users OR n.instances <> b.instances
     OR n.orphan_messages <> 0 OR n.dangling_last_message <> 0 THEN
    RAISE EXCEPTION 'a guard failed: rolling back';
  END IF;
END $$;

-- The view reads temp tables that drop at COMMIT; it goes first.
DROP VIEW guard_now;

\if :apply
  COMMIT;
  \echo 'APPLIED: committed.'
\else
  ROLLBACK;
  \echo 'DRY RUN: rolled back, nothing changed. Re-run with -v apply=1 to commit.'
\endif
