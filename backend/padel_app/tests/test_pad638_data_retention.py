"""PAD-638 (PAD-602 D5) — admin.data-retention: one daily sweep, one switch and period per kind of
personal data, all OFF until the owner decides (the `data_retention` app setting).

    pytest padel_app/tests/test_pad638_data_retention.py -v
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.utils.dates import utcnow_naive

NOW = utcnow_naive()


def _days_ago(n):
    return NOW - timedelta(days=n)


def _enable(app, **items):
    """`items`: name → days. Writes the `data_retention` row with those items on."""
    from padel_app.models.app_setting import AppSetting

    with app.app_context():
        row = db.session.get(AppSetting, "data_retention") or AppSetting(key="data_retention")
        row.value = {name: {"enabled": True, "days": days} for name, days in items.items()}
        db.session.add(row)
        db.session.commit()


def _sweep(app):
    from padel_app.services.retention_service import run_retention

    with app.app_context():
        return run_retention(now=NOW)


def _exists(app, model, ident):
    with app.app_context():
        return db.session.get(model, ident) is not None


# ── placeholders ──────────────────────────────────────────────────────────────

def _placeholder(app, ids, name, *, created_days_ago, coaches=None, class_days_ago=None):
    """A never-activated student (no password) on `coaches` (default: the seeded coach)."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence

    with app.app_context():
        user = User(name=name, username=f"pending-{name}", password=None, status="inactive",
                    created_at=_days_ago(created_days_ago))
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        for coach_id in coaches or [ids["coach_id"]]:
            db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player.id))
        if class_days_ago is not None:
            start = _days_ago(class_days_ago)
            inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                                  end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
            db.session.add(Presence(lesson_instance_id=inst.id, player_id=player.id, status="present"))
        db.session.commit()
        return player.id, user.id


def _second_coach(app):
    from padel_app.models import Coach, User

    with app.app_context():
        u = User(name="Other coach", username="other-coach-638", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        c = Coach(user_id=u.id)
        db.session.add(c)
        db.session.commit()
        return c.id


def test_everything_is_off_until_a_setting_turns_it_on(app):
    ids = _seed(app)
    player_id, user_id = _placeholder(app, ids, "quiet", created_days_ago=400)

    report = _sweep(app)

    # Owner, 2026-10-12: never-activated students are kept until the coach removes them.
    assert report["stale_placeholders"] == {"enabled": False, "keep": True, "days": None, "due": None, "removed": 0}
    from padel_app.models.players import Player
    assert _exists(app, Player, player_id)


def test_keep_means_no_period_and_nothing_removed(app):
    from padel_app.models import User

    with app.app_context():
        u = User(name="K", username="keep638", password="x", status="active",
                 email_verification_code_hash="h", email_verification_expires_at=_days_ago(30))
        db.session.add(u)
        db.session.commit()
        uid = u.id
    from padel_app.models.app_setting import AppSetting
    with app.app_context():
        db.session.add(AppSetting(key="data_retention", value={"code_hashes": {"keep": True, "enabled": True, "days": 1}}))
        db.session.commit()

    report = _sweep(app)

    assert report["code_hashes"] == {"enabled": False, "keep": True, "days": None, "due": None, "removed": 0}
    with app.app_context():
        assert db.session.get(User, uid).email_verification_code_hash == "h"


def test_a_stale_placeholder_is_deleted_through_the_roster_removal(app):
    from padel_app.models import User
    from padel_app.models.deletion_audit import DeletionAudit
    from padel_app.models.players import Player

    ids = _seed(app)
    stale, stale_user = _placeholder(app, ids, "stale", created_days_ago=400)
    recent_class, _ = _placeholder(app, ids, "recentclass", created_days_ago=400, class_days_ago=100)
    young, _ = _placeholder(app, ids, "young", created_days_ago=100)
    shared, _ = _placeholder(app, ids, "shared", created_days_ago=400, coaches=[ids["coach_id"], _second_coach(app)])
    with app.app_context():
        active = _add_student(ids["coach_id"], "active-student", ids["level_ids"]["5"])
        db.session.get(User, db.session.get(Player, active).user_id).created_at = _days_ago(400)
        db.session.commit()
    # Each guard on its own (review): no password but active (a social sign-in), and inactive with a
    # password. Neither is a placeholder.
    social, social_user = _placeholder(app, ids, "social", created_days_ago=400)
    passworded, passworded_user = _placeholder(app, ids, "passworded", created_days_ago=400)
    with app.app_context():
        db.session.get(User, social_user).status = "active"
        db.session.get(User, passworded_user).password = "hash"
        db.session.commit()
    _enable(app, stale_placeholders=365)

    report = _sweep(app)

    assert report["stale_placeholders"]["removed"] == 1
    assert not _exists(app, Player, stale) and not _exists(app, User, stale_user)
    for kept in (recent_class, young, shared, active, social, passworded):
        assert _exists(app, Player, kept)
    with app.app_context():
        audit = DeletionAudit.query.filter_by(entity="player", entity_id=stale).one()
        assert audit.action == "deleted"


# ── deleted message text ──────────────────────────────────────────────────────

def test_deleted_messages_lose_their_text_after_the_period(app):
    from padel_app.models import Conversation, Message, User

    with app.app_context():
        a = User(name="A", username="a638", password="x", status="active")
        b = User(name="B", username="b638", password="x", status="active")
        db.session.add_all([a, b])
        db.session.flush()
        conv = Conversation.get_or_insert([a.id, b.id])
        old = Message(conversation_id=conv.id, sender_id=a.id, text="old secret", is_deleted=True,
                      msg_metadata={"x": 1})
        recent = Message(conversation_id=conv.id, sender_id=a.id, text="recent", is_deleted=True)
        live = Message(conversation_id=conv.id, sender_id=a.id, text="live")
        db.session.add_all([old, recent, live])
        db.session.flush()
        old.updated_at = _days_ago(40)
        recent.updated_at = _days_ago(10)
        live.updated_at = _days_ago(40)
        db.session.commit()
        ids = (old.id, recent.id, live.id)
    _enable(app, deleted_message_text=30)

    assert _sweep(app)["deleted_message_text"]["removed"] == 1
    with app.app_context():
        o, r, lv = (db.session.get(Message, i) for i in ids)
        assert (o.text, o.msg_metadata, o.attachment_id) == ("", None, None)
        assert r.text == "recent" and lv.text == "live"


# ── expired invitations and tokens ────────────────────────────────────────────

def test_expired_invitations_and_join_tokens_go_after_the_period(app):
    from padel_app.models.coach_join_token import CoachJoinToken
    from padel_app.models.player_invitation import PlayerInvitation

    ids = _seed(app)
    player_id, _ = _placeholder(app, ids, "invited", created_days_ago=10)
    with app.app_context():
        old = PlayerInvitation(player_id=player_id, token_hash="a" * 64, invited_by_coach_id=ids["coach_id"],
                               expires_at=_days_ago(40))
        fresh = PlayerInvitation(player_id=player_id, token_hash="b" * 64, invited_by_coach_id=ids["coach_id"],
                                 expires_at=_days_ago(5))
        from padel_app.models import Club

        club = Club(name="Retention club")
        db.session.add(club)
        db.session.flush()
        tok_old = CoachJoinToken(coach_id=ids["coach_id"], club_id=club.id, token_hash="c" * 64,
                                 expires_at=_days_ago(40))
        tok_live = CoachJoinToken(coach_id=ids["coach_id"], club_id=club.id, token_hash="d" * 64,
                                  expires_at=NOW + timedelta(days=5))
        db.session.add_all([old, fresh, tok_old, tok_live])
        db.session.commit()
        keep = (old.id, fresh.id, tok_old.id, tok_live.id)
    _enable(app, expired_invitations=30)

    assert _sweep(app)["expired_invitations"]["removed"] == 2
    assert not _exists(app, PlayerInvitation, keep[0]) and _exists(app, PlayerInvitation, keep[1])
    assert not _exists(app, CoachJoinToken, keep[2]) and _exists(app, CoachJoinToken, keep[3])


# ── notification history ──────────────────────────────────────────────────────

def test_notification_history_of_old_classes_goes(app):
    from padel_app.models import NotificationEvent, ReminderAttempt
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app)
    with app.app_context():
        student = _add_student(ids["coach_id"], "notified", ids["level_ids"]["5"])
        made = []
        for days in (400, 10):
            start = _days_ago(days)
            inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                                  end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
            ev = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=inst.id, player_id=student,
                                   type="auto", status="expired")
            at = ReminderAttempt(lesson_instance_id=inst.id, player_id=student, number=1, sent_at=start)
            db.session.add_all([ev, at])
            db.session.flush()
            made.append((ev.id, at.id))
        db.session.commit()
    _enable(app, notification_history=365)

    assert _sweep(app)["notification_history"]["removed"] == 2
    assert not _exists(app, NotificationEvent, made[0][0]) and not _exists(app, ReminderAttempt, made[0][1])
    assert _exists(app, NotificationEvent, made[1][0]) and _exists(app, ReminderAttempt, made[1][1])


# ── code hashes ───────────────────────────────────────────────────────────────

def test_expired_code_hashes_are_cleared(app):
    from padel_app.models import User

    with app.app_context():
        u = User(name="C", username="codes638", password="x", status="active",
                 email_verification_code_hash="h1", email_verification_expires_at=_days_ago(3),
                 email_verification_sent_at=_days_ago(3),
                 password_reset_code_hash="h2", password_reset_expires_at=NOW - timedelta(hours=1),
                 password_reset_sent_at=NOW - timedelta(hours=2))
        db.session.add(u)
        db.session.commit()
        uid = u.id
    _enable(app, code_hashes=1)

    assert _sweep(app)["code_hashes"]["removed"] == 1
    with app.app_context():
        u = db.session.get(User, uid)
        assert (u.email_verification_code_hash, u.email_verification_expires_at) == (None, None)
        assert u.password_reset_code_hash == "h2"  # expired one hour ago: inside the period


# ── audit logs ────────────────────────────────────────────────────────────────

def test_old_deletion_audit_rows_go_and_the_admin_log_is_never_touched(app):
    from padel_app.models.admin_audit_log import AdminAuditLog
    from padel_app.models.deletion_audit import DeletionAudit

    with app.app_context():
        old = DeletionAudit(entity="player", entity_id=1, action="deleted", label="x", details={})
        new = DeletionAudit(entity="player", entity_id=2, action="deleted", label="y", details={})
        admin = AdminAuditLog(actor_email="ops@levapp.app", actor_role="owner", action="x",
                              target_type="user", target_id="1", outcome="ok", request_id="req-638",
                              created_at=_days_ago(2000))  # set at insert: the row is append-only
        db.session.add_all([old, new, admin])
        db.session.flush()
        old.created_at = _days_ago(2000)
        db.session.commit()
        ids = (old.id, new.id, admin.id)
    _enable(app, audit_logs=1095)

    assert _sweep(app)["audit_logs"]["removed"] == 1
    assert not _exists(app, DeletionAudit, ids[0]) and _exists(app, DeletionAudit, ids[1])
    assert _exists(app, AdminAuditLog, ids[2])  # admin.foundation rule 9: append-only


# ── isolation ─────────────────────────────────────────────────────────────────

def test_one_failing_item_does_not_stop_the_others(app, monkeypatch):
    from padel_app.models import User
    from padel_app.services import retention_service

    with app.app_context():
        u = User(name="D", username="codes638b", password="x", status="active",
                 email_verification_code_hash="h", email_verification_expires_at=_days_ago(3))
        db.session.add(u)
        db.session.commit()
        uid = u.id

    def boom(now, days, apply):
        raise RuntimeError("boom")

    monkeypatch.setitem(retention_service.ITEMS, "deleted_message_text",
                        (retention_service.ITEMS["deleted_message_text"][0], boom))
    _enable(app, deleted_message_text=30, code_hashes=1)

    report = _sweep(app)

    assert report["deleted_message_text"]["error"] == "boom"
    assert report["code_hashes"]["removed"] == 1
    with app.app_context():
        assert db.session.get(User, uid).email_verification_code_hash is None


@pytest.mark.parametrize("value, days", [(None, 1), ({}, 1), ({"code_hashes": {"enabled": True, "days": 0}}, 1),
                                         ({"code_hashes": {"enabled": "yes", "days": 5}}, 5)])
def test_a_missing_or_odd_setting_is_off(app, value, days):
    from padel_app.models.app_setting import AppSetting
    from padel_app.services.retention_service import retention_settings

    with app.app_context():
        if value is not None:
            db.session.add(AppSetting(key="data_retention", value=value))
            db.session.commit()
        # A stored period is kept even while OFF; a missing or non-positive one falls back.
        assert retention_settings()["code_hashes"] == {"enabled": False, "days": days}


# ── review round ──────────────────────────────────────────────────────────────

def test_a_deleted_message_frees_its_image(app, monkeypatch):
    """Review: blanking attachment_id alone left the image row and its bucket object behind."""
    from padel_app.model import Image
    from padel_app.models import Conversation, Message, User
    from padel_app.services import image_cleanup

    freed = []
    monkeypatch.setattr(image_cleanup, "delete_stored_object", lambda key, **kw: freed.append(key))
    with app.app_context():
        a = User(name="A", username="img638a", password="x", status="active")
        b = User(name="B", username="img638b", password="x", status="active")
        db.session.add_all([a, b])
        db.session.flush()
        conv = Conversation.get_or_insert([a.id, b.id])
        img = Image(object_key="uploads/638.jpg")
        db.session.add(img)
        db.session.flush()
        m = Message(conversation_id=conv.id, sender_id=a.id, text="", is_deleted=True, attachment_id=img.id)
        db.session.add(m)
        db.session.flush()
        m.updated_at = _days_ago(40)
        db.session.commit()
        image_id = img.id
    _enable(app, deleted_message_text=30)

    assert _sweep(app)["deleted_message_text"]["removed"] == 1
    assert not _exists(app, Image, image_id)
    assert freed == ["uploads/638.jpg"]


def test_a_placeholder_sweep_that_fails_midway_reports_what_it_removed(app, monkeypatch):
    """Review: each removal commits on its own, so a failure at row 2 must not hide row 1."""
    from padel_app.services import player_service

    ids = _seed(app)
    for name in ("p1", "p2", "p3"):
        _placeholder(app, ids, name, created_days_ago=400)
    real = player_service.remove_player_service
    calls = {"n": 0}

    def flaky(data, actor_user_id=None):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("db hiccup")
        return real(data, actor_user_id)

    monkeypatch.setattr(player_service, "remove_player_service", flaky)
    _enable(app, stale_placeholders=365, code_hashes=1)

    report = _sweep(app)

    assert report["stale_placeholders"]["removed"] == 1
    assert report["stale_placeholders"]["error"] == "db hiccup"
    assert report["code_hashes"].get("error") is None  # the session was left clean for the next item


def test_the_dry_count_is_what_an_enabled_sweep_removes(app):
    """Review: one due row of every kind; OFF counts them and removes nothing, ON removes exactly that."""
    from padel_app.models import Conversation, Message, NotificationEvent, User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.deletion_audit import DeletionAudit
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.player_invitation import PlayerInvitation

    ids = _seed(app)
    player_id, _ = _placeholder(app, ids, "dueplace", created_days_ago=400)
    with app.app_context():
        a = User(name="A", username="due638a", password="x", status="active",
                 email_verification_code_hash="h", email_verification_expires_at=_days_ago(3))
        b = User(name="B", username="due638b", password="x", status="active")
        db.session.add_all([a, b])
        db.session.flush()
        conv = Conversation.get_or_insert([a.id, b.id])
        m = Message(conversation_id=conv.id, sender_id=a.id, text="old", is_deleted=True)
        start = _days_ago(400)
        inst = LessonInstance(lesson_id=ids["lesson_id"], start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=4, status="scheduled")
        db.session.add_all([m, inst])
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=inst.id))
        student = _add_student(ids["coach_id"], "due-student", ids["level_ids"]["5"])
        db.session.add(NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=inst.id, player_id=student,
                                         type="auto", status="expired"))
        # Not the placeholder's: its removal (first item) would cascade the invitation away.
        db.session.add(PlayerInvitation(player_id=student, token_hash="e" * 64,
                                        invited_by_coach_id=ids["coach_id"], expires_at=_days_ago(40)))
        audit = DeletionAudit(entity="player", entity_id=9, action="deleted", label="z", details={})
        db.session.add(audit)
        db.session.flush()
        m.updated_at = _days_ago(40)
        audit.created_at = _days_ago(2000)
        db.session.commit()

    from padel_app.services.retention_service import ITEMS

    _enable(app, stale_placeholders=0)  # an explicit (invalid-days) entry: OFF, counted, not "keep"
    off = _sweep(app)
    assert set(off) == set(ITEMS)
    assert all(off[name]["removed"] == 0 and off[name]["due"] >= 1 for name in off), off
    _enable(app, **{name: off[name]["days"] for name in off})
    on = _sweep(app)
    for name in off:
        assert on[name]["removed"] == off[name]["due"], (name, off[name], on[name])
