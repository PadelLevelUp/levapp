"""PAD-606 — nothing personal survives a staging restore (delivery.staging-data-sync rules 9-12).

`backend/scripts/staging-scrub.sql` runs in the staging database after every restore. Three
layers of proof:
- the guard (every backend): each String/Text/JSON column declared in the models is either named on
  a ``-- scrubbed:`` line of the SQL file or on NON_PERSONAL below, so a new personal column cannot
  be added without deciding how staging treats it;
- the wiring (every backend): sync-staging-db.sh runs the file before the app starts again;
- the behaviour (Postgres only, CI's Postgres lane): seed real-looking people, run the file, count
  what survives.
"""
import os
import re
from datetime import date
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
SCRUB_SQL = SCRIPTS / "staging-scrub.sql"

# Columns that hold no personal data: enums, statuses, codes, ids, hashes of secrets, config,
# coach-authored training content and business data (rule 9, "kept on purpose").
NON_PERSONAL = {
    "admin_audit_log.actor_email",  # staff (console sign-in), kept on purpose
    "admin_audit_log.actor_role", "admin_audit_log.action", "admin_audit_log.target_type",
    "admin_audit_log.target_id", "admin_audit_log.request_id", "admin_audit_log.outcome",
    "admin_roles.email", "admin_roles.role", "admin_roles.granted_by_email",  # staff
    "app_settings.key", "app_settings.value",
    "backend_app.name", "backend_app.app_model_name", "backend_app.color",
    "bulk_imports.status", "bulk_imports.summary", "bulk_imports.record_ids",  # counts and ids
    "calendar_blocks.type", "calendar_blocks.recurrence_rule",
    "class_join_requests.status",
    "class_requests.invitee_player_ids", "class_requests.recurrence", "class_requests.status",
    "class_requests.decided_by",
    "club_join_requests.status",
    "clubs.name", "clubs.description", "clubs.location",  # business data
    "coach_exercise.role", "coach_exercise_group.role",
    "coach_in_player.side",
    "coach_invitations.token_hash", "coach_invitations.status",
    "coach_join_tokens.token_hash",
    "coach_levels.label", "coach_levels.code",
    "coach_player_notes.type",
    "coach_seasons.label",
    "coaches.working_hours", "coaches.approval_status",
    "conversations.participant_key",  # built from ids
    "courts.name",
    "deletion_audit.entity", "deletion_audit.action",
    "delivery_incidents.kind", "delivery_incidents.channel", "delivery_incidents.subject_type",
    "delivery_incidents.error_class",
    "device_tokens.platform",
    "digital_consent_ages.country",
    "evaluation_categories.name", "evaluation_categories.catalogue_key",
    "evaluation_categories.competency_group",
    "evaluation_shares.category_ids", "evaluation_shares.evolution",
    "exercise_groups.name", "exercise_groups.description",  # coach training content
    "exercises.name", "exercises.description", "exercises.type", "exercises.custom_type",
    "exercises.level_ids", "exercises.diagram", "exercises.notes",
    "imageables.type",
    "images.content_type",
    "lesson_instances.eligibility_rules", "lesson_instances.status",
    "lesson_instances.overridden_fields",
    "lessons.recurrence_rule", "lessons.type", "lessons.color", "lessons.status",
    "lessons.eligibility_rules", "lessons.excluded_dates",
    "message_reactions.emoji",
    "messages.message_type",
    "needs_you_snoozes.item_id",
    "notification_configs.invitation_mode", "notification_configs.reminder_type",
    "notification_configs.reminder_time", "notification_configs.invitation_start_type",
    "notification_configs.invitation_start_time", "notification_configs.evaluation_reminder_type",
    "notification_configs.quiet_hours_start", "notification_configs.quiet_hours_end",
    "notification_configs.priority_criteria", "notification_configs.notification_groups",
    "notification_configs.message_templates", "notification_configs.invitation_groups",
    "notification_configs.tiebreakers", "notification_configs.excluded_player_ids",
    "notification_configs.eligibility_rules",
    "notification_events.type", "notification_events.status", "notification_events.answer",
    "notification_events.answered_by", "notification_events.retired_reason",
    "player_claim_requests.status",
    "player_invitations.token_hash", "player_invitations.status",
    "player_merges.trigger", "player_merges.counts",
    "presences.status", "presences.justification", "presences.response",
    "presences.recorded_by", "presences.enrolment_source",
    "reminder_attempts.response",
    "replacement_approval_prompts.bundle_id", "replacement_approval_prompts.status",
    "seasons_legacy.name",
    "token_blocklist.jti",
    "users.status", "users.language", "users.country",
    "users.terms_version", "users.privacy_version",
    "vacancies.side", "vacancies.status", "vacancies.approval_status",
    "waiting_list_entries.added_by",
    # Added on staging after the scrub was written (merge of 2026-10-21): states and the staff email
    # that closed a report (staff emails stay, as in admin_audit_log), a court side, a provider name.
    "message_reports.status", "message_reports.outcome", "message_reports.closed_by",
    "presences.side",
    "user_identities.provider",
}


def _scrubbed_columns():
    names = set()
    for line in SCRUB_SQL.read_text().splitlines():
        if line.startswith("-- scrubbed:"):
            names.update(line.split(":", 1)[1].split())
    return names


def _text_columns():
    import padel_app.models  # noqa: F401  (registers every table)
    from sqlalchemy import JSON, String, Text

    from padel_app.sql_db import db

    return {
        f"{t.name}.{c.name}"
        for t in db.metadata.tables.values()
        for c in t.columns
        if isinstance(c.type, (String, Text, JSON))
    }


def test_every_text_column_is_scrubbed_or_declared_non_personal():
    columns = _text_columns()
    assert len(columns) > 150, "the guard must find the models (R-032)"
    scrubbed = _scrubbed_columns()
    undecided = sorted(columns - scrubbed - NON_PERSONAL)
    assert undecided == [], f"decide how staging scrubs these (staging-scrub.sql or NON_PERSONAL): {undecided}"
    both = sorted(scrubbed & NON_PERSONAL)
    assert both == [], f"listed as scrubbed AND non-personal: {both}"
    stale = sorted((scrubbed | NON_PERSONAL) - columns)
    assert stale == [], f"no such column any more: {stale}"


def test_every_listed_column_is_actually_written_by_the_sql():
    sql = SCRUB_SQL.read_text()
    statements = [
        "\n".join(line for line in chunk.splitlines() if not line.strip().startswith("--"))
        for chunk in re.split(r";\s*\n", sql)
    ]
    for name in sorted(_scrubbed_columns()):
        table, column = name.split(".")
        if table in ("push_subscriptions", "device_tokens"):
            assert re.search(rf"DELETE FROM {table};", sql), name
            continue
        writes = [
            s for s in statements
            if re.search(rf"\bUPDATE {table}\b", s) and re.search(rf"\b{column}\s*=", s)
        ]
        assert writes, f"{name} is listed as scrubbed but no UPDATE {table} sets it"


def test_the_sync_runs_the_scrub_before_staging_starts_again():
    script = (SCRIPTS / "sync-staging-db.sh").read_text()
    assert "staging-scrub.sql" in script
    run = script.index("staging-scrub.sql\"")
    assert "trap restart_app EXIT" in script[:run], "the app restarts only after the scrub (EXIT trap)"
    assert "-v ON_ERROR_STOP=1" in script and " -1 " in script, "one transaction, stop on error"
    assert "STAGING_TEST_PASSWORD" in script, "the hash comes from the staging secret"
    assert "update users set email" not in script.lower(), "the email rewrite lives in the SQL file now"


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="the scrub is Postgres SQL (jsonb, make_date, DO blocks)",
)
def test_on_postgres_nothing_personal_survives(app):
    """Seed real-looking people and their text, run the file, count what survives."""
    from sqlalchemy import text

    from padel_app.sql_db import db

    real_name = re.compile(r"^(Coach|Player) \d+$")
    with app.app_context():
        from padel_app.models import (
            Association_CoachPlayer, Conversation, DeviceToken, Message, Player, PushSubscription, User,
        )
        from padel_app.models.coaches import Coach

        # Seeded through the ORM so every column default is the app's own (raw INSERTs missed the
        # NOT NULL columns without a server default, e.g. users.is_admin).
        ana = User(name="Ana Ferreira", username="ana.ferreira@gmail.com", email="ana.ferreira@gmail.com",
                   phone="+351912345678", birth_date=date(1988, 6, 14), password="pbkdf2:sha256:1$a$b")
        joao = User(name="João Martins", username="joaom", email="joao.martins@sapo.pt",
                    phone="+351934567890", birth_date=date(2009, 3, 2), password="pbkdf2:sha256:1$c$d")
        rita = User(name="Rita Sousa", username="pending-0123456789abcdef")
        db.session.add_all([ana, joao, rita])
        db.session.flush()
        coach = Coach(user_id=ana.id)
        player = Player(user_id=joao.id)
        pending_player = Player(user_id=rita.id)
        db.session.add_all([coach, player, pending_player])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id,
                                               notes="Joelho direito lesionado"))
        conv = Conversation(participant_key=Conversation.build_participant_key([ana.id, joao.id]))
        db.session.add(conv)
        db.session.flush()
        db.session.add(Message(conversation_id=conv.id, sender_id=ana.id,
                               text="Olá João, amanhã às 9h no clube",
                               msg_metadata={"playerName": "João Martins", "lessonId": 4}))
        db.session.add(PushSubscription(user_id=joao.id, subscription_json='{"endpoint": "https://fcm.googleapis.com/x"}'))
        db.session.add(DeviceToken(user_id=joao.id, token="ExponentPushToken[abc]", platform="ios"))
        db.session.commit()
        u_coach, u_student, u_pending = ana.id, joao.id, rita.id

        conn = db.session.connection()

        def ins(sql, **kw):
            return conn.execute(text(sql), kw).scalar()

        counts_before = {t: ins(f"SELECT count(*) FROM {t}") for t in ("users", "messages", "players", "coach_in_player")}

        sql = SCRUB_SQL.read_text().replace(":'pwhash'", "'pbkdf2:sha256:600000$shared$hash'")
        raw = conn.connection.dbapi_connection.cursor()
        raw.execute(sql)

        users = conn.execute(text("SELECT id, name, username, email, phone, birth_date, password FROM users")).all()
        by_id = {u.id: u for u in users}
        assert all(real_name.match(u.name) for u in users), [u.name for u in users]
        assert by_id[u_coach].username == "staging-coach" and by_id[u_student].username == "staging-student"
        assert by_id[u_pending].username == "pending-0123456789abcdef", "placeholders keep their prefix"
        assert all(u.email is None or u.email.endswith("@staging.invalid") for u in users)
        assert all(u.phone is None for u in users)
        assert by_id[u_student].birth_date == date(2009, 1, 1), "the year stays, for age rules"
        assert {u.password for u in users if u.password} == {"pbkdf2:sha256:600000$shared$hash"}
        assert ins("SELECT text FROM messages") .startswith("Mensagem ")
        assert "playerName" not in ins("SELECT msg_metadata::text FROM messages")
        assert ins("SELECT msg_metadata->>'lessonId' FROM messages") == "4", "ids in metadata stay"
        assert ins("SELECT notes FROM coach_in_player") is None
        assert ins("SELECT count(*) FROM push_subscriptions") == 0
        assert ins("SELECT count(*) FROM device_tokens") == 0
        assert {t: ins(f"SELECT count(*) FROM {t}") for t in counts_before} == counts_before


def test_only_the_staging_deploy_carries_the_shared_password():
    """Rule 10: the secret reaches the staging container (which hashes it) and nothing else."""
    workflows = SCRIPTS.parents[1] / ".github" / "workflows"
    staging = (workflows / "deploy-staging.yaml").read_text()
    assert '-e STAGING_TEST_PASSWORD="${{ secrets.STAGING_TEST_PASSWORD }}"' in staging
    assert 'source: "backend/scripts/sync-staging-db.sh,backend/scripts/staging-scrub.sql"' in staging
    assert "STAGING_TEST_PASSWORD" not in (workflows / "deploy-prod.yaml").read_text()
