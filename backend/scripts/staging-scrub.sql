-- =============================================================================
-- staging-scrub.sql — nothing personal survives a staging restore (PAD-606)
--
-- Spec: delivery.staging-data-sync rules 9-12. Run by sync-staging-db.sh right after the restore,
-- before the staging app starts, in ONE transaction:
--   psql -1 -v ON_ERROR_STOP=1 -v pwhash="<werkzeug hash or empty>" -d padel_app_staging -f staging-scrub.sql
-- Keeps row counts, ids, dates, statuses and every UNIQUE constraint. The guard
-- (test_pad606_staging_scrub.py) fails when a String/Text/JSON column in the models is neither
-- scrubbed here (listed on a "-- scrubbed:" line) nor on its non-personal list.
-- =============================================================================

-- scrubbed: users.name users.username users.email users.phone users.abbreviation users.password
-- scrubbed: users.email_verification_code_hash users.password_reset_code_hash users.notif_block_reason
-- People. Usernames and emails go through a temporary value first, so the UNIQUE constraints never
-- see two rows with the same new value mid-update.
UPDATE users SET username = 'scrub-tmp-' || id WHERE username NOT LIKE 'pending-%';
UPDATE users SET username = 'user' || id WHERE username LIKE 'scrub-tmp-%';
UPDATE users
   SET email = 'scrub-tmp-' || id
 WHERE email IS NOT NULL;
-- PAD-498 (auth.password-recovery rule 11, B-276): the email rewrite clears the recovery and verification codes in the same statement.
UPDATE users SET email = 'user' || id || '@staging.invalid', password_reset_code_hash = null, password_reset_expires_at = null, password_reset_sent_at = null, password_reset_attempts = 0, email_verification_code_hash = null, email_verification_expires_at = null, email_verification_sent_at = null, email_verification_attempts = 0 where email is not null;
UPDATE users SET
    name = CASE WHEN EXISTS (SELECT 1 FROM coaches c WHERE c.user_id = users.id)
                THEN 'Coach ' || id ELSE 'Player ' || id END,
    phone = NULL,
    abbreviation = NULL,
    notif_block_reason = NULL,
    generated_code = NULL,
    birth_date = CASE WHEN birth_date IS NULL THEN NULL
                      ELSE make_date(EXTRACT(YEAR FROM birth_date)::int, 1, 1) END;
-- Rule 10: one shared password (its hash, from the staging secret); no secret = no usable password.
UPDATE users SET password = CASE WHEN :'pwhash' = '' THEN 'scrubbed-no-login' ELSE :'pwhash' END
WHERE password IS NOT NULL;

-- Rule 11: two known tester logins on real-shaped data.
WITH coach AS (
    SELECT c.user_id, c.id AS coach_id
    FROM coaches c JOIN coach_in_player cp ON cp.coach_id = c.id
    GROUP BY c.id, c.user_id ORDER BY count(*) DESC, c.id LIMIT 1
)
UPDATE users SET username = 'staging-coach', email = 'staging-coach@staging.invalid'
WHERE id = (SELECT user_id FROM coach);
WITH coach AS (
    SELECT c.id AS coach_id
    FROM coaches c JOIN coach_in_player cp ON cp.coach_id = c.id
    GROUP BY c.id ORDER BY count(*) DESC, c.id LIMIT 1
)
UPDATE users SET username = 'staging-student', email = 'staging-student@staging.invalid'
WHERE id = (SELECT p.user_id FROM players p JOIN coach_in_player cp ON cp.player_id = p.id
            WHERE cp.coach_id = (SELECT coach_id FROM coach) AND p.user_id IS NOT NULL
            ORDER BY p.id LIMIT 1);

-- scrubbed: coach_invitations.email
UPDATE coach_invitations SET email = 'invite' || id || '@staging.invalid' WHERE email IS NOT NULL;

-- Free text written by people.
-- scrubbed: messages.text
UPDATE messages SET text = 'Mensagem ' || id;
-- scrubbed: coach_player_notes.text coach_in_player.notes
UPDATE coach_player_notes SET text = 'Nota ' || id;
UPDATE coach_in_player SET notes = NULL WHERE notes IS NOT NULL;
-- scrubbed: evaluation_entries.comment evaluation_records.note
UPDATE evaluation_entries SET comment = NULL WHERE comment IS NOT NULL;
UPDATE evaluation_records SET note = NULL WHERE note IS NOT NULL;
-- scrubbed: class_requests.note class_join_requests.note message_reports.reason
UPDATE class_requests SET note = NULL WHERE note IS NOT NULL;
UPDATE class_join_requests SET note = NULL WHERE note IS NOT NULL;
UPDATE message_reports SET reason = NULL WHERE reason IS NOT NULL;
-- scrubbed: calendar_blocks.title calendar_blocks.description
UPDATE calendar_blocks SET title = CASE WHEN title IS NULL THEN NULL ELSE 'Bloqueio ' || id END,
    description = NULL;
-- scrubbed: lessons.title lessons.description lesson_instances.overwrite_title lesson_instances.notes
UPDATE lessons SET title = 'Aula ' || id, description = NULL;
UPDATE lesson_instances SET
    overwrite_title = CASE WHEN overwrite_title IS NULL THEN NULL ELSE 'Aula ' || lesson_id END,
    notes = NULL;
-- scrubbed: coaches.rejection_reason conversations.group_name deletion_audit.label deletion_audit.details
UPDATE coaches SET rejection_reason = 'Motivo removido' WHERE rejection_reason IS NOT NULL;
UPDATE conversations SET group_name = 'Grupo ' || id WHERE group_name IS NOT NULL;
UPDATE deletion_audit SET label = CASE WHEN label IS NULL THEN NULL ELSE 'Registo ' || id END,
    details = NULL;
-- scrubbed: delivery_incidents.detail bulk_imports.filename
UPDATE delivery_incidents SET detail = NULL WHERE detail IS NOT NULL;
UPDATE bulk_imports SET filename = 'import-' || id || '.csv' WHERE filename IS NOT NULL;

-- Copies of names and notes inside JSON: drop every key that names a person or carries text.
-- scrubbed: messages.msg_metadata evaluation_shares.card
UPDATE messages SET msg_metadata = (
    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
    FROM jsonb_each(msg_metadata::jsonb) AS e(k, v)
    WHERE k !~* '(name|text|note|email|phone|comment)'
)::json
WHERE msg_metadata IS NOT NULL AND jsonb_typeof(msg_metadata::jsonb) = 'object';
UPDATE evaluation_shares SET card = (
    SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
    FROM jsonb_each(card::jsonb) AS e(k, v)
    WHERE k !~* '(name|text|note|email|phone|comment)'
)::json
WHERE jsonb_typeof(card::jsonb) = 'object';
-- scrubbed: replacement_approval_prompts.queue_snapshot admin_audit_log.before admin_audit_log.after
UPDATE replacement_approval_prompts SET queue_snapshot = NULL WHERE queue_snapshot IS NOT NULL;
-- Raw SQL on purpose: the ORM refuses changes to the audit log; staff actor emails stay.
UPDATE admin_audit_log SET before = NULL, after = NULL;

-- scrubbed: coach_in_player.nickname
-- PAD-660: the coach's private nickname for a student is as personal as the name.
UPDATE coach_in_player SET nickname = 'Alcunha ' || id WHERE nickname IS NOT NULL;

-- scrubbed: message_reports.message_text
-- PAD-639: the reported text is a copy of a message; the report's status, outcome and the staff
-- email that closed it stay (staff emails stay, as in the audit log).
UPDATE message_reports SET message_text = 'Mensagem removida' WHERE message_text IS NOT NULL;

-- scrubbed: user_identities.email user_identities.subject
-- A social sign-in link names a real Google/Apple account; staging signs in by password only.
UPDATE user_identities SET email = CASE WHEN email IS NULL THEN NULL ELSE 'identity' || id || '@staging.invalid' END,
    subject = 'scrubbed-' || id;

-- scrubbed: images.object_key
-- Upload keys embed the original file name. The placeholder step seeds these keys afterwards.
UPDATE images SET object_key = 'images/scrubbed/' || id;

-- scrubbed: push_subscriptions.subscription_json device_tokens.token
-- Delivery channels: nothing on staging may reach a phone (PAD-624 also disables Expo sends).
DELETE FROM push_subscriptions;
DELETE FROM device_tokens;
-- Production's scheduled jobs (pickled args) must not run on staging; the scheduler re-arms on boot.
DO $$ BEGIN
    IF to_regclass('public.apscheduler_jobs') IS NOT NULL THEN
        EXECUTE 'DELETE FROM apscheduler_jobs';
    END IF;
END $$;
