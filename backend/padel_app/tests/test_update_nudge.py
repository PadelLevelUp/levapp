"""messaging.update-nudge: an old iOS build (User-Agent LevApp/<n>, n <= 37) is told once, in a plain
Assistant message and a push, to update to 1.3.5. Postgres runs the two-at-once proof as well."""
import logging
import os
import threading

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from padel_app.models import Conversation, Message
from padel_app.models.app_setting import AppSetting
from padel_app.models.users import User
from padel_app.services import update_nudge_service as nudge_service
from padel_app.sql_db import db

OLD_UA = "LevApp/37 CFNetwork/1494.0.7 Darwin/23.4.0"
ME = "/api/auth/me"


@pytest.fixture(autouse=True)
def _env(app, monkeypatch):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    monkeypatch.delenv("UPDATE_NUDGE_ENABLED", raising=False)
    nudge_service.reset_cache()
    yield
    nudge_service.reset_cache()


@pytest.fixture
def sent(monkeypatch):
    """Every publish and push the nudge makes, instead of making it."""
    calls = {"publish": [], "web": [], "expo": []}
    monkeypatch.setattr("padel_app.realtime.publish", lambda event_, recipients=None, *a, **k: calls["publish"].append(event_))
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification",
                        lambda **kw: calls["web"].append(kw))
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user",
                        lambda user_id, **kw: calls["expo"].append({"user_id": user_id, **kw}))
    return calls


def _user(app, name="u1", language="pt"):
    with app.app_context():
        user = User(name=name.title(), username=name, email=f"{name}@t.test", password="x", status="active",
                    language=language)
        db.session.add(user)
        db.session.commit()
        return user.id


def _get(app, client, user_id, ua=OLD_UA, path=ME, method="get", token=True):
    headers = {"User-Agent": ua} if ua is not None else {"User-Agent": ""}
    if token:
        with app.app_context():
            headers["Authorization"] = f"Bearer {create_access_token(identity=str(user_id))}"
    response = getattr(client, method)(path, headers=headers)
    nudge_service.wait_idle()  # the nudge runs on its own thread
    return response


def _nudges(app):
    with app.app_context():
        return [m for m in Message.query.all()
                if isinstance(m.msg_metadata, dict) and m.msg_metadata.get("kind") == "update-nudge"]


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-1")
def test_an_old_build_gets_a_plain_assistant_message_and_one_push(app, client, sent):
    uid = _user(app)
    response = _get(app, client, uid)
    assert response.status_code == 200
    (msg,) = _nudges(app)
    with app.app_context():
        assistant = User.query.filter_by(username="levelup-assistant").one()
        conv = db.session.get(Conversation, msg.conversation_id)
        assert msg.sender_id == assistant.id
        assert msg.message_type == "text"  # never engine_alert: b37 draws that type specially
        assert msg.msg_metadata == {"kind": "update-nudge", "maxBuild": 37}
        assert conv.participant_key == Conversation.build_participant_key([assistant.id, uid])
    assert msg.text == nudge_service.TEXTS["pt"]
    assert [c["type"] for c in sent["publish"]] == ["message_created"]
    (web,) = sent["web"]
    (expo,) = sent["expo"]
    assert web["body"] == expo["body"] == msg.text
    assert web["title"] == expo["title"] == "LevApp 1.3.5"
    assert web["url"] == f"/messages/{msg.conversation_id}"
    assert expo["user_id"] == uid and expo["data"]["conversationId"] == msg.conversation_id


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-2")
@pytest.mark.parametrize("case", ["build38", "newer", "browser", "no-agent", "unauthenticated", "failed", "sign-out"])
def test_other_requests_do_nothing(app, client, sent, case, caplog):
    uid = _user(app)
    if case == "build38":
        response = _get(app, client, uid, ua="LevApp/38 CFNetwork/1494.0.7 Darwin/23.4.0")
    elif case == "newer":
        response = _get(app, client, uid, ua="LevApp/120 CFNetwork/1494.0.7 Darwin/23.4.0")
    elif case == "browser":
        response = _get(app, client, uid, ua="Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15")
    elif case == "no-agent":
        response = _get(app, client, uid, ua=None)
    elif case == "unauthenticated":
        response = _get(app, client, uid, token=False)
        assert response.status_code == 401
    elif case == "failed":
        response = _get(app, client, uid, path="/api/app/no-such-route")
        assert response.status_code >= 400
    else:
        response = _get(app, client, uid, path="/api/auth/logout", method="post")
    assert "update nudge failed" not in caplog.text  # skipping is not an error
    assert not _nudges(app)
    with app.app_context():
        assert Message.query.count() == 0 and Conversation.query.count() == 0
    assert sent == {"publish": [], "web": [], "expo": []}


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-3")
def test_a_second_request_from_any_worker_adds_nothing(app, client, sent):
    uid = _user(app)
    _get(app, client, uid)
    _get(app, client, uid)  # this worker knows: no query
    nudge_service.reset_cache()  # another worker: it must find the message in the database
    _get(app, client, uid)
    assert len(_nudges(app)) == 1
    assert len(sent["web"]) == len(sent["expo"]) == len(sent["publish"]) == 1


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-3")
@pytest.mark.skipif(os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
                    reason="two concurrent writers exist only on Postgres")
def test_two_requests_at_once_post_once(app, sent):
    """Both threads are held at the check for an existing nudge; without the row lock both would
    pass it and post. With the lock the second thread waits for the lock before it gets there, so
    the gate times out for it and it then finds the first's message."""
    uid = _user(app)
    with app.app_context():  # the conversation exists already, so only the lock can serialise the two
        from padel_app.services.replacement_approval_service import _get_or_create_assistant_conversation

        _get_or_create_assistant_conversation(uid)
        db.session.commit()
    gate = threading.Barrier(2)
    results, errors = [], []

    def hold(conn, cursor, statement, *_a, **_k):
        if statement.lstrip().upper().startswith("SELECT") and "FROM MESSAGES" in statement.upper() \
                and "MSG_METADATA" in statement.upper():
            try:
                gate.wait(timeout=2)
            except threading.BrokenBarrierError:
                pass

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", hold)

    def run():
        try:
            with app.app_context():
                results.append(nudge_service.nudge(uid))
                db.session.remove()
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=run) for _ in range(2)]
    try:
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
    finally:
        event.remove(engine, "before_cursor_execute", hold)
    assert not errors
    assert sorted(results) == [False, True]
    assert len(_nudges(app)) == 1
    assert len(sent["web"]) == len(sent["expo"]) == 1


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-4")
@pytest.mark.parametrize("language,expected", [("pt", "pt"), ("en", "en"), ("fr", "fr"), ("es", "pt")])
def test_the_text_follows_the_users_language(app, client, sent, language, expected):
    uid = _user(app, language=language)
    _get(app, client, uid)
    (msg,) = _nudges(app)
    assert msg.text == nudge_service.TEXTS[expected]
    assert "1.3.5" in msg.text


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-5")
@pytest.mark.parametrize("broken", ["nudge", "publish", "push"])
def test_a_failing_nudge_never_fails_the_request(app, client, sent, monkeypatch, caplog, broken):
    uid = _user(app)
    plain = _get(app, client, uid, ua="LevApp/38")
    boom = RuntimeError("boom")

    def raiser(*_a, **_k):
        raise boom

    if broken == "nudge":
        monkeypatch.setattr(nudge_service, "nudge", raiser)
    elif broken == "publish":
        monkeypatch.setattr("padel_app.realtime.publish", raiser)
    else:
        monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", raiser)
    with caplog.at_level(logging.ERROR):
        response = _get(app, client, uid)
    assert response.status_code == plain.status_code == 200
    assert response.get_json() == plain.get_json()
    assert "update nudge failed" in caplog.text


@pytest.mark.criterion("MESSAGING-UPDATE-NUDGE-6")
def test_the_switch_turns_it_off_and_the_row_beats_the_env(app, client, sent, monkeypatch):
    uid = _user(app)
    with app.app_context():
        db.session.add(AppSetting(key="update_nudge_enabled", value=False))
        db.session.commit()
    _get(app, client, uid)
    assert not _nudges(app) and sent["web"] == []
    # env off, no row
    with app.app_context():
        db.session.delete(db.session.get(AppSetting, "update_nudge_enabled"))
        db.session.commit()
    nudge_service.reset_cache()
    monkeypatch.setenv("UPDATE_NUDGE_ENABLED", "0")
    _get(app, client, uid)
    assert not _nudges(app)
    # the row on wins over the env off
    with app.app_context():
        db.session.add(AppSetting(key="update_nudge_enabled", value=True))
        db.session.commit()
    nudge_service.reset_cache()
    _get(app, client, uid)
    assert len(_nudges(app)) == 1
