"""PAD-638 — admin.data-retention with the owner's periods (2026-10-21): ON by default as config,
bounded batches, and the one sanctioned removal from the append-only admin audit log.

Every date below derives from the pinned NOW, never from the real clock (B-100): the sweep is called
with now=NOW, and every timestamp a row is compared on is written explicitly.

    pytest padel_app/tests/test_pad638_retention_periods.py -v
"""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed

NOW = datetime(2027, 3, 10, 12, 0)


def _ago(days, hours=0):
    return NOW - timedelta(days=days, hours=hours)


def _sweep(app):
    from padel_app.services.retention_service import run_retention

    with app.app_context():
        return run_retention(now=NOW)


def _exists(app, model, ident):
    with app.app_context():
        return db.session.get(model, ident) is not None


def _set(app, value):
    from padel_app.models.app_setting import AppSetting

    with app.app_context():
        row = db.session.get(AppSetting, "data_retention") or AppSetting(key="data_retention")
        row.value = value
        db.session.add(row)
        db.session.commit()


def _occurrence(ids, ended_days_ago):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance

    start = _ago(ended_days_ago, hours=1)
    inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                          end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
    return inst


def _admin_row(created_at, tag):
    from padel_app.models.admin_audit_log import AdminAuditLog

    # created_at set at insert: the row is append-only, so it cannot be moved afterwards.
    return AdminAuditLog(actor_email="ops@levapp.app", actor_role="owner", action="x", target_type="user",
                         target_id=tag, outcome="ok", request_id=f"req-{tag}", created_at=created_at)


# ── rule 1: the owner's periods are on with no setting ─────────────────────────

def test_the_owners_periods_apply_with_no_setting(app):
    from padel_app.models import Conversation, Message, NotificationEvent, ReminderAttempt, User
    from padel_app.models.admin_audit_log import AdminAuditLog
    from padel_app.models.coach_join_token import CoachJoinToken
    from padel_app.models.deletion_audit import DeletionAudit
    from padel_app.models.player_invitation import PlayerInvitation
    from padel_app.models import Club

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "periods-student", ids["level_ids"]["5"])
        # invitations and join tokens: 30 days after expiry
        inv_old = PlayerInvitation(player_id=student, token_hash="1" * 64, invited_by_coach_id=ids["coach_id"],
                                   expires_at=_ago(31))
        inv_new = PlayerInvitation(player_id=student, token_hash="2" * 64, invited_by_coach_id=ids["coach_id"],
                                   expires_at=_ago(29))
        club = Club(name="Periods club")
        db.session.add(club)
        db.session.flush()
        tok_old = CoachJoinToken(coach_id=ids["coach_id"], club_id=club.id, token_hash="3" * 64, expires_at=_ago(31))
        tok_new = CoachJoinToken(coach_id=ids["coach_id"], club_id=club.id, token_hash="4" * 64, expires_at=_ago(29))
        # code hashes: 30 days after expiry
        codes_old = User(name="Co", username="codes-old-638p", password="x", status="active",
                         email_verification_code_hash="h", email_verification_expires_at=_ago(31))
        codes_new = User(name="Cn", username="codes-new-638p", password="x", status="active",
                         password_reset_code_hash="h", password_reset_expires_at=_ago(29))
        # notification history: 12 months after the occurrence ended
        old_inst, new_inst = _occurrence(ids, 366), _occurrence(ids, 364)
        ev_old = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=old_inst.id, player_id=student,
                                   type="auto", status="expired")
        ev_new = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=new_inst.id, player_id=student,
                                   type="auto", status="expired")
        at_old = ReminderAttempt(lesson_instance_id=old_inst.id, player_id=student, number=1, sent_at=_ago(367))
        at_new = ReminderAttempt(lesson_instance_id=new_inst.id, player_id=student, number=1, sent_at=_ago(365))
        # audit logs: 5 years
        da_old = DeletionAudit(entity="player", entity_id=1, action="deleted", label="o", details={})
        da_new = DeletionAudit(entity="player", entity_id=2, action="deleted", label="n", details={})
        aa_old, aa_new = _admin_row(_ago(1826), "old"), _admin_row(_ago(1824), "new")
        # kept forever by default: a deleted message (its row) — owner, 2026-10-21
        a = User(name="A", username="msg-a-638p", password="x", status="active")
        b = User(name="B", username="msg-b-638p", password="x", status="active")
        db.session.add_all([inv_old, inv_new, tok_old, tok_new, codes_old, codes_new, ev_old, ev_new,
                            at_old, at_new, da_old, da_new, aa_old, aa_new, a, b])
        db.session.flush()
        conv = Conversation.get_or_insert([a.id, b.id])
        msg = Message(conversation_id=conv.id, sender_id=a.id, text="written before PAD-639", is_deleted=True)
        db.session.add(msg)
        db.session.flush()
        da_old.created_at, da_new.created_at = _ago(1826), _ago(1824)
        msg.updated_at = _ago(3000)
        db.session.commit()
        gone = [(PlayerInvitation, inv_old.id), (CoachJoinToken, tok_old.id), (NotificationEvent, ev_old.id),
                (ReminderAttempt, at_old.id), (DeletionAudit, da_old.id), (AdminAuditLog, aa_old.id)]
        kept = [(PlayerInvitation, inv_new.id), (CoachJoinToken, tok_new.id), (NotificationEvent, ev_new.id),
                (ReminderAttempt, at_new.id), (DeletionAudit, da_new.id), (AdminAuditLog, aa_new.id)]
        user_ids = (codes_old.id, codes_new.id)
        msg_id = msg.id

    report = _sweep(app)

    for name, days in [("expired_invitations", 30), ("code_hashes", 30), ("notification_history", 365),
                       ("audit_logs", 1825), ("admin_audit_log", 1825)]:
        assert report[name]["enabled"] is True and report[name]["days"] == days, (name, report[name])
        assert report[name].get("error") is None, (name, report[name])
    assert report["expired_invitations"]["removed"] == 2
    assert report["notification_history"]["removed"] == 2
    assert report["code_hashes"]["removed"] == 1
    assert report["audit_logs"]["removed"] == 1
    assert report["admin_audit_log"]["removed"] == 1
    for model, ident in gone:
        assert not _exists(app, model, ident), model.__name__
    for model, ident in kept:
        assert _exists(app, model, ident), model.__name__
    with app.app_context():
        old_user, new_user = (db.session.get(User, i) for i in user_ids)
        assert old_user.email_verification_code_hash is None
        assert new_user.password_reset_code_hash == "h"
        assert db.session.get(Message, msg_id).text == "written before PAD-639"
    assert report["deleted_message_text"]["keep"] is True
    assert report["stale_placeholders"]["keep"] is True


def test_a_config_value_moves_a_default_period(app):
    from padel_app.models.player_invitation import PlayerInvitation

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "config-student", ids["level_ids"]["5"])
        inv = PlayerInvitation(player_id=student, token_hash="5" * 64, invited_by_coach_id=ids["coach_id"],
                               expires_at=_ago(40))
        db.session.add(inv)
        db.session.commit()
        inv_id = inv.id

    app.config["RETENTION_DAYS_EXPIRED_INVITATIONS"] = 60
    report = _sweep(app)
    assert report["expired_invitations"]["days"] == 60
    assert _exists(app, PlayerInvitation, inv_id)

    app.config["RETENTION_DAYS_EXPIRED_INVITATIONS"] = "not a number"  # falls back to the code default
    assert _sweep(app)["expired_invitations"]["days"] == 30
    assert not _exists(app, PlayerInvitation, inv_id)


@pytest.mark.parametrize("value, expected", [
    (None, {"enabled": True, "days": 30}),
    ({}, {"enabled": True, "days": 30}),
    ({"code_hashes": {"enabled": False}}, {"enabled": False, "days": 30}),
    ({"code_hashes": {"days": 7}}, {"enabled": True, "days": 7}),
    ({"code_hashes": {"enabled": True, "days": 0}}, {"enabled": False, "days": 30}),
    ({"code_hashes": {"enabled": "yes", "days": 5}}, {"enabled": False, "days": 5}),
])
def test_the_setting_overrides_the_default(app, value, expected):
    from padel_app.services.retention_service import retention_settings

    if value is not None:
        _set(app, value)
    with app.app_context():
        assert retention_settings()["code_hashes"] == expected


def test_switched_off_is_counted_and_nothing_removed(app):
    from padel_app.models import User

    with app.app_context():
        u = User(name="Off", username="off-638p", password="x", status="active",
                 email_verification_code_hash="h", email_verification_expires_at=_ago(31))
        db.session.add(u)
        db.session.commit()
        uid = u.id
    _set(app, {"code_hashes": {"enabled": False}})

    report = _sweep(app)

    assert (report["code_hashes"]["due"], report["code_hashes"]["removed"]) == (1, 0)
    with app.app_context():
        assert db.session.get(User, uid).email_verification_code_hash == "h"


# ── rule 3: bounded and idempotent ─────────────────────────────────────────────

def test_a_run_is_bounded_and_the_next_one_finishes(app):
    from padel_app.models import ReminderAttempt

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "batch-student", ids["level_ids"]["5"])
        inst = _occurrence(ids, 400)
        for n in range(5):
            db.session.add(ReminderAttempt(lesson_instance_id=inst.id, player_id=student, number=n + 1,
                                           sent_at=_ago(401)))
        db.session.commit()
    app.config["RETENTION_BATCH_SIZE"] = 2
    app.config["RETENTION_MAX_BATCHES"] = 2

    first = _sweep(app)["notification_history"]
    second = _sweep(app)["notification_history"]
    third = _sweep(app)["notification_history"]

    assert (first["due"], first["removed"]) == (5, 4)
    assert (second["due"], second["removed"]) == (1, 1)
    assert (third["due"], third["removed"]) == (0, 0)
    with app.app_context():
        assert ReminderAttempt.query.count() == 0


def test_code_hashes_are_cleared_in_batches(app):
    from padel_app.models import User

    with app.app_context():
        for n in range(3):
            db.session.add(User(name=f"B{n}", username=f"batch-codes-{n}-638p", password="x", status="active",
                                password_reset_code_hash="h", password_reset_expires_at=_ago(31)))
        db.session.commit()
    app.config["RETENTION_BATCH_SIZE"] = 1
    app.config["RETENTION_MAX_BATCHES"] = 2

    assert _sweep(app)["code_hashes"]["removed"] == 2
    assert _sweep(app)["code_hashes"]["removed"] == 1


# ── rule 5: the one exception to the append-only audit log ─────────────────────

def test_the_audit_log_refuses_every_delete_but_the_sweeps(app):
    from padel_app.models.admin_audit_log import AdminAuditLog, AdminAuditLogImmutable

    with app.app_context():
        old, recent = _admin_row(_ago(2000), "o5"), _admin_row(_ago(10), "r5")
        db.session.add_all([old, recent])
        db.session.commit()
        old_id, recent_id = old.id, recent.id

    with app.app_context():
        db.session.delete(db.session.get(AdminAuditLog, recent_id))
        with pytest.raises(AdminAuditLogImmutable):
            db.session.flush()
        db.session.rollback()
        with pytest.raises(AdminAuditLogImmutable):
            AdminAuditLog.query.filter(AdminAuditLog.id == recent_id).delete(synchronize_session=False)
        db.session.rollback()
        with pytest.raises(AdminAuditLogImmutable):
            AdminAuditLog.query.filter(AdminAuditLog.id == recent_id).update(
                {AdminAuditLog.outcome: "error"}, synchronize_session=False)
        db.session.rollback()

    assert _sweep(app)["admin_audit_log"]["removed"] == 1
    assert not _exists(app, AdminAuditLog, old_id) and _exists(app, AdminAuditLog, recent_id)
    with app.app_context():
        assert not db.session.info.get("retention_sweep")  # the flag never outlives the sweep
