"""PAD-268 / B-037 — auth.account-deletion: deleting an account removes the
person from the future and keeps the coach's records.

One world per test: a coach in a club, the deleting student Rita (on the roster,
with a device token, a web-push subscription, blocks both ways, a calendar
block, a class tomorrow, a recurring series, a validated class last week, an
old one-off class, a standing waiting-list entry, an evaluation and a message)
and a bystander student Bruno.
"""
import json
from dataclasses import fields
from datetime import timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash, generate_password_hash

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _world(app):
    from padel_app.models import (
        Association_CoachClub,
        Association_CoachLesson,
        Association_CoachLessonInstance,
        Association_CoachPlayer,
        Association_PlayerLesson,
        Association_PlayerLessonInstance,
        Club,
        Presence,
        StandingWaitingListEntry,
        User,
        WaitingListEntry,
    )
    from padel_app.models.blocked_user import BlockedUser
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.evaluation_category import EvaluationCategory
    from padel_app.models.evaluation_entry import EvaluationEntry
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.messages import Message
    from padel_app.models.players import Player
    from padel_app.models.push_subscriptions import PushSubscription
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    now = utcnow_naive()
    ids = {}
    with app.app_context():
        coach_user = User(name="Coach Del", username="del_coach", password="x", status="active")
        db.session.add(coach_user)
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        club = Club(name="Del Club", description="d", location="l")
        db.session.add_all([coach, club])
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        level = CoachLevel(coach_id=coach.id, label="B1", code="B1", display_order=1)
        db.session.add(level)
        db.session.flush()

        rita_user = User(
            name="Rita Leaves", username="rita", email="rita@example.com", phone="999",
            abbreviation="RL", password=generate_password_hash("pw"), status="active",
        )
        bruno_user = User(name="Bruno Stays", username="bruno", password="x", status="active")
        db.session.add_all([rita_user, bruno_user])
        db.session.flush()
        rita = Player(user_id=rita_user.id)
        bruno = Player(user_id=bruno_user.id)
        db.session.add_all([rita, bruno])
        db.session.flush()
        # Rita's roster row has no level so the paginated "missing level" alert counts her.
        rita_cp = Association_CoachPlayer(coach_id=coach.id, player_id=rita.id, notes="backhand")
        db.session.add(rita_cp)
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=bruno.id, level_id=level.id))
        db.session.flush()

        def lesson(title, start, *, weekly_until=None):
            l = Lesson(
                title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                is_recurring=weekly_until is not None,
                recurrence_rule=(json.dumps({"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]})
                                 if weekly_until else None),
                recurrence_end=weekly_until, type="academy", max_players=4, color="#000",
                status="active", club_id=club.id,
            )
            db.session.add(l)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=l.id))
            return l

        def instance(l, start):
            inst = LessonInstance(
                lesson_id=l.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                max_players=4, status="scheduled", level_id=level.id, notifications_enabled=True,
                original_lesson_occurence_date=start.date(),
            )
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
            return inst

        future = instance(lesson("Tomorrow", now + timedelta(days=1)), now + timedelta(days=1))
        db.session.add(Association_PlayerLessonInstance(player_id=rita.id, lesson_instance_id=future.id))
        db.session.add(Presence(lesson_instance_id=future.id, player_id=rita.id, invited=True))

        past = instance(lesson("Last week", now - timedelta(days=7)), now - timedelta(days=7))
        db.session.add(Association_PlayerLessonInstance(player_id=rita.id, lesson_instance_id=past.id))
        db.session.add(Presence(lesson_instance_id=past.id, player_id=rita.id, status="present", validated=True))
        db.session.add(Association_PlayerLessonInstance(player_id=bruno.id, lesson_instance_id=past.id))
        db.session.add(Presence(lesson_instance_id=past.id, player_id=bruno.id, status="present", validated=True))

        series = lesson("Weekly", now - timedelta(days=2), weekly_until=(now + timedelta(weeks=8)).date())
        db.session.add(Association_PlayerLesson(player_id=rita.id, lesson_id=series.id))
        old_single = lesson("Old one-off", now - timedelta(days=30))
        db.session.add(Association_PlayerLesson(player_id=rita.id, lesson_id=old_single.id))

        wl_a = instance(lesson("Full A", now + timedelta(days=3)), now + timedelta(days=3))
        wl_b = instance(lesson("Full B", now + timedelta(days=4)), now + timedelta(days=4))
        standing = StandingWaitingListEntry(
            coach_id=coach.id, player_id=rita.id, credits_total=3, credits_used=0,
            expires_at=now + timedelta(days=30), is_active=True,
        )
        db.session.add(standing)
        db.session.flush()
        db.session.add(WaitingListEntry(lesson_instance_id=wl_a.id, player_id=rita.id, coach_id=coach.id,
                                        standing_entry_id=standing.id, is_active=True))
        db.session.add(WaitingListEntry(lesson_instance_id=wl_b.id, player_id=rita.id, coach_id=coach.id,
                                        standing_entry_id=None, is_active=True))

        db.session.add(DeviceToken(user_id=rita_user.id, token="ios-tok-rita", platform="ios"))
        db.session.add(PushSubscription(user_id=rita_user.id, subscription_json="{}"))
        db.session.add(BlockedUser(blocker_id=rita_user.id, blocked_id=bruno_user.id))
        db.session.add(BlockedUser(blocker_id=bruno_user.id, blocked_id=rita_user.id))
        db.session.add(CalendarBlock(user_id=rita_user.id, type="unavailable", title="Exam",
                                     start_datetime=now + timedelta(days=2),
                                     end_datetime=now + timedelta(days=2, hours=2), is_recurring=False))

        category = EvaluationCategory(coach_id=coach.id, name="Serve")
        db.session.add(category)
        db.session.flush()
        db.session.add(EvaluationEntry(coach_player_id=rita_cp.id, category_id=category.id, score=7))

        conv = _get_or_create_direct_conversation(coach_user.id, rita_user.id)
        db.session.add(Message(text="see you tomorrow", sender_id=rita_user.id, conversation_id=conv.id))
        db.session.commit()

        ids.update(
            coach_id=coach.id, coach_user_id=coach_user.id, club_id=club.id,
            rita_id=rita.id, rita_user_id=rita_user.id, bruno_id=bruno.id, bruno_user_id=bruno_user.id,
            rita_cp_id=rita_cp.id, future_id=future.id, past_id=past.id, series_id=series.id,
            old_single_id=old_single.id, standing_id=standing.id, wl_a_id=wl_a.id, wl_b_id=wl_b.id,
            conversation_id=conv.id,
        )
    return ids


def _delete(app, client, ids):
    res = client.delete("/api/auth/me", headers=_auth(app, ids["rita_user_id"]))
    assert res.status_code == 200, res.get_json()


# ── rule 2: the account itself is gone ───────────────────────────────────────

def test_the_account_row_is_scrubbed_and_unusable(app, client):
    from padel_app.models import User

    ids = _world(app)
    _delete(app, client, ids)
    with app.app_context():
        user = db.session.get(User, ids["rita_user_id"])
        assert user.status == "disabled" and user.name == "Deleted user"
        assert user.username.startswith("deleted-") and not user.username.startswith("pending-")
        assert user.password and not check_password_hash(user.password, "pw")
        assert (user.email, user.phone, user.abbreviation, user.generated_code, user.user_image_id) == (
            None, None, None, None, None)


# ── rule 3: every session ends, including the legacy session login ────────────
#
# The shared conftest app cannot exercise /auth/login: create_app(test_config)
# skips the Config class, so there is no SECRET_KEY and no SESSION_TYPE, and
# Flask-Session then installs a null session interface at build time (every
# session write raises "no secret key"). These tests build an app the way
# production configures sessions instead.

LEGACY_LOGIN = "/auth/login"


@pytest.fixture
def session_app():
    import os
    import tempfile

    from padel_app import create_app
    from padel_app.sql_db import init_db

    fd, path = tempfile.mkstemp()
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "SECRET_KEY": "test-secret",
        "SESSION_TYPE": "filesystem",
        "JWT_SECRET_KEY": "test-jwt-secret",
    })
    with app.app_context():
        init_db(app)
        db.create_all()
    yield app
    os.close(fd)
    os.unlink(path)


def _logged_in(client):
    with client.session_transaction() as session:
        return "_user_id" in session


def _legacy_user(app, username, status):
    from padel_app.models import User

    with app.app_context():
        user = User(name=username, username=username, password=generate_password_hash("pw"), status=status)
        db.session.add(user)
        db.session.commit()
        return user.id


def test_legacy_session_login_still_admits_an_active_account(session_app):
    """Guard: the refusal below is about status, not a broken login."""
    client = session_app.test_client()
    _legacy_user(session_app, "on_user", "active")
    res = client.post(LEGACY_LOGIN, data={"username": "on_user", "password": "pw"})
    assert res.status_code == 302 and _logged_in(client)


def test_legacy_session_login_refuses_a_disabled_account(session_app):
    client = session_app.test_client()
    _legacy_user(session_app, "off_user", "disabled")
    res = client.post(LEGACY_LOGIN, data={"username": "off_user", "password": "pw"})
    assert res.status_code == 401 and not _logged_in(client)  # auth.login rule 12 (B-053)


def test_a_deleted_student_cannot_use_the_legacy_login(session_app):
    client = session_app.test_client()
    ids = _world(session_app)
    _delete(session_app, client, ids)
    res = client.post(LEGACY_LOGIN, data={"username": "rita", "password": "pw"})
    assert res.status_code == 200 and not _logged_in(client)  # deletion scrubs the credentials, so the ordinary wrong-credentials answer refuses it first (auth.login rule 12)


def test_an_open_legacy_session_of_a_disabled_account_is_dropped(app):
    """flask-login's user loader must not hand a disabled account back to a live session."""
    user_id = _legacy_user(app, "was_on", "disabled")
    with app.app_context():
        assert app.login_manager._user_callback(str(user_id)) is None


# ── rule 4: pushes stop ──────────────────────────────────────────────────────

def test_device_tokens_and_push_subscriptions_are_deleted(app, client):
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.push_subscriptions import PushSubscription

    ids = _world(app)
    _delete(app, client, ids)
    with app.app_context():
        assert DeviceToken.query.filter_by(user_id=ids["rita_user_id"]).count() == 0
        assert PushSubscription.query.filter_by(user_id=ids["rita_user_id"]).count() == 0


# ── rule 5: their own social state goes ──────────────────────────────────────

def test_blocks_both_ways_and_calendar_blocks_are_deleted(app, client):
    from padel_app.models.blocked_user import BlockedUser
    from padel_app.models.calendar_blocks import CalendarBlock

    ids = _world(app)
    _delete(app, client, ids)
    uid = ids["rita_user_id"]
    with app.app_context():
        assert BlockedUser.query.filter((BlockedUser.blocker_id == uid) | (BlockedUser.blocked_id == uid)).count() == 0
        assert CalendarBlock.query.filter_by(user_id=uid).count() == 0


# ── rule 6: a student leaves the future, silently ────────────────────────────

def test_the_student_leaves_future_classes_only_and_silently(app, client):
    from padel_app.models import (
        Association_PlayerLesson,
        Association_PlayerLessonInstance,
        NotificationEvent,
        Presence,
        Vacancy,
    )

    ids = _world(app)
    with app.app_context():
        vacancies, events = Vacancy.query.count(), NotificationEvent.query.count()
    _delete(app, client, ids)
    pid = ids["rita_id"]
    with app.app_context():
        enrolled = {r.lesson_instance_id for r in Association_PlayerLessonInstance.query.filter_by(player_id=pid)}
        presences = {p.lesson_instance_id for p in Presence.query.filter_by(player_id=pid)}
        series = {r.lesson_id for r in Association_PlayerLesson.query.filter_by(player_id=pid)}
        assert ids["future_id"] not in enrolled and ids["future_id"] not in presences
        assert ids["past_id"] in enrolled and ids["past_id"] in presences, "the past stays"
        assert ids["series_id"] not in series, "a series with occurrences ahead is left"
        assert ids["old_single_id"] in series, "a class that already happened is the coach's record"
        assert (Vacancy.query.count(), NotificationEvent.query.count()) == (vacancies, events), "silent"


def test_waiting_list_credits_stop_being_spent(app, client):
    from padel_app.models import StandingWaitingListEntry, WaitingListEntry

    ids = _world(app)
    _delete(app, client, ids)
    with app.app_context():
        assert db.session.get(StandingWaitingListEntry, ids["standing_id"]).is_active is False
        assert WaitingListEntry.query.filter_by(player_id=ids["rita_id"], is_active=True).count() == 0


# ── rule 7: the engine never picks a deleted account ─────────────────────────

def test_a_deleted_student_on_a_roster_consumes_no_invite_round(app, client):
    from padel_app.models import LessonInstance, NotificationEvent, Vacancy
    from padel_app.services.account_service import delete_account_service
    from padel_app.services.notification_service import evaluate_candidates, trigger_invitations
    from padel_app.tests.test_notification_integration import (
        _create_coach,
        _create_coach_player,
        _create_instance,
        _create_level,
        _create_player,
        _create_user,
        _seed_notification_config,
    )

    with app.app_context():
        coach = _create_coach(_create_user("Coach", "eng_coach"))
        level = _create_level(coach)
        gone_user = _create_user("Gone Student", "eng_gone")
        gone = _create_player(gone_user)
        stay = _create_player(_create_user("Stay Student", "eng_stay"))
        _create_coach_player(coach, gone, level)
        _create_coach_player(coach, stay, level)
        instance = _create_instance(coach, level, enrolled_players=[], max_players=1)
        config = _seed_notification_config(coach.id, auto_notify=True)
        assert config.get_restrictions()["excludeUnpaidSubscription"]["enabled"] is False
        db.session.commit()
        gone_user_id, gone_id, stay_id, instance_id, coach_id = gone_user.id, gone.id, stay.id, instance.id, coach.id

    with app.app_context():
        delete_account_service(gone_user_id)

    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            trigger_invitations(instance, coach_id)
        assert NotificationEvent.query.filter_by(player_id=gone_id).count() == 0
        assert NotificationEvent.query.filter_by(player_id=stay_id).count() == 1

        from padel_app.models.notification_config import NotificationConfig
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance_id).first()
        verdicts = evaluate_candidates(
            vacancy, instance, coach_id, NotificationConfig.query.filter_by(coach_id=coach_id).first(),
            wave=("round", 1), explain=True,
        )
        reason = {v.cp.player_id: getattr(v, fields(v)[1].name) for v in verdicts}
        assert reason[gone_id] == "inactive_account"


# ── rule 8: the coach's records are kept ─────────────────────────────────────

def test_the_coachs_records_and_sent_messages_are_kept(app, client):
    from padel_app.models import Association_CoachPlayer, Presence, User
    from padel_app.models.evaluation_entry import EvaluationEntry
    from padel_app.models.messages import Message

    ids = _world(app)
    _delete(app, client, ids)
    with app.app_context():
        assert Presence.query.filter_by(player_id=ids["rita_id"], lesson_instance_id=ids["past_id"]).count() == 1
        cp = db.session.get(Association_CoachPlayer, ids["rita_cp_id"])
        assert cp is not None and cp.notes == "backhand"
        assert EvaluationEntry.query.filter_by(coach_player_id=ids["rita_cp_id"]).count() == 1
        msg = Message.query.filter_by(conversation_id=ids["conversation_id"]).one()
        assert db.session.get(User, msg.sender_id).name == "Deleted user"


# ── rule 8 + owner decision (a): roster lists and pickers hide the account ───

def _names(payload):
    return sorted(p.get("name") for p in payload)


def test_roster_lists_and_pickers_hide_a_deleted_student(app, client):
    from padel_app.models import User
    from padel_app.services.messaging_service import get_messageable_users_service

    ids = _world(app)
    _delete(app, client, ids)
    coach = _auth(app, ids["coach_user_id"])

    players = client.get("/api/app/players", headers=coach)
    assert players.status_code == 200, players.get_json()
    assert _names(players.get_json()) == ["Bruno Stays"]

    coach_players = client.get("/api/app/coach_players", headers=coach).get_json()
    assert _names(coach_players) == ["Bruno Stays"]

    paginated = client.get("/api/app/coach_players_paginated", headers=coach).get_json()
    assert _names(paginated["items"]) == ["Bruno Stays"]
    assert paginated["pagination"]["total"] == 1
    assert paginated["alerts"]["missingLevel"] == 0, "Rita had no level; she must not count"

    # "s" matches both "Bruno Stays" and the deleted row's "Deleted user".
    search = client.get("/api/app/notify/player_search?q=s", headers=coach).get_json()
    assert _names(search["players"]) == ["Bruno Stays"]

    users = client.get("/api/app/users", headers=coach).get_json()
    assert ids["rita_user_id"] not in {u["id"] for u in users}

    with app.app_context():
        messageable = get_messageable_users_service(db.session.get(User, ids["coach_user_id"]))
        assert ids["rita_user_id"] not in {getattr(u, "id", u) for u in messageable}


# ── rule 10: a deleting coach gets the account-level parts only ──────────────

def test_a_deleting_coach_keeps_their_classes(app, client):
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.lessons import Lesson
    from padel_app.models import User

    ids = _world(app)
    with app.app_context():
        db.session.add(DeviceToken(user_id=ids["coach_user_id"], token="ios-tok-coach", platform="ios"))
        db.session.commit()
        lessons = Lesson.query.count()
    res = client.delete("/api/auth/me", headers=_auth(app, ids["coach_user_id"]))
    assert res.status_code == 200
    with app.app_context():
        assert DeviceToken.query.filter_by(user_id=ids["coach_user_id"]).count() == 0
        assert db.session.get(User, ids["coach_user_id"]).username.startswith("deleted-")
        assert Lesson.query.count() == lessons


# ── owner decision (a): the Presences page drops the account and stays consistent ─

def test_presences_table_drops_a_deleted_student_and_the_charts_still_agree(app, client):
    """Rule 8: /presence_stats is a roster list, so a deleted student leaves it;
    the no-filter trend counts the same player set, so the KPI tile, the sum of
    the table rows and the trend total stay equal (PAD-192: charts follow the table)."""
    ids = _world(app)
    _delete(app, client, ids)
    coach = _auth(app, ids["coach_user_id"])

    stats = client.get("/api/app/presence_stats", headers=coach)
    assert stats.status_code == 200, stats.get_json()
    stats = stats.get_json()
    trend = client.get("/api/app/presence_trend", headers=coach).get_json()

    assert ids["rita_id"] not in {row["playerId"] for row in stats["players"]}
    assert stats["totals"]["presences"] == sum(row["total"] for row in stats["players"]) == trend["total"] == 1



# ── rule 8: the coach home counts a deleted account nowhere forward-looking ──

def test_the_week_pulse_does_not_count_a_deleted_student(app):
    from datetime import datetime

    from padel_app.helpers.dashboard.coach_home import build_week_pulse_block
    from padel_app.models import User
    from padel_app.services.account_service import delete_account_service
    from padel_app.tests.test_dashboard_coach_home import _seed

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, _, _ = _seed(app, now=now)
    with app.app_context():
        # ch_p3 is signed up only to tomorrow's class, and is still on the roster row.
        gone_user_id = User.query.filter_by(username="ch_p3").one().id
    with app.app_context():
        delete_account_service(gone_user_id)

    with app.app_context():
        players = build_week_pulse_block(coach_id=coach_id, now=now)["data"]["players"]
    assert players == {"active": 3, "total": 3, "idle": 0}


def test_the_reply_queue_skips_a_deleted_sender(app):
    from datetime import datetime

    from padel_app.helpers.dashboard.coach_home import reply_items
    from padel_app.models import Conversation, ConversationParticipant, Message, User
    from padel_app.tests.test_dashboard_coach_home import _seed

    now = datetime(2026, 8, 4, 10, 0)
    _, coach_user_id, _ = _seed(app, now=now)
    with app.app_context():
        for i, (name, status) in enumerate((("Active Sender", "active"), ("Gone Sender", "disabled"))):
            other = User(name=name, username=f"rq_{i}", password="x", status=status)
            db.session.add(other)
            db.session.flush()
            conv = Conversation(participant_key=Conversation.build_participant_key([coach_user_id, other.id]), is_group=False)
            db.session.add(conv)
            db.session.flush()
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=coach_user_id))
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=other.id))
            # The deleted sender's message is the newest, so a filter applied after
            # the per-conversation pick would still have to drop it explicitly.
            db.session.add(Message(text=f"from {name}", sender_id=other.id, conversation_id=conv.id,
                                   sent_at=now - timedelta(minutes=10 - 5 * i)))
        db.session.commit()

    with app.app_context():
        items = reply_items(user_id=coach_user_id)
    assert [i["personName"] for i in items] == ["Active Sender"]
