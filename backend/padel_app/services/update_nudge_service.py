"""messaging.update-nudge: once per user, an old iOS build is told in the Assistant conversation and by
push to update to 1.3.5. Runs on its own thread (so its own database session) once the request is
authenticated, and never fails or slows the request (rule 5). Temporary: retire it, with the constant below, once nobody is on <= 37.
"""
import logging
import os
import re
import threading
import time

from flask import current_app, request
from flask_jwt_extended import get_jwt, get_jwt_identity
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)

#: The newest build that is told to update (1.3.4 (37) is the last slow one; 1.3.5 is build 38).
UPDATE_NUDGE_MAX_BUILD = 37
NUDGE_KIND = "update-nudge"
PUSH_TITLE = "LevApp 1.3.5"
SETTING_KEY = "update_nudge_enabled"
SWITCH_CACHE_SECONDS = 30

#: The iOS app's default CFNetwork User-Agent: `LevApp/<build> CFNetwork/... Darwin/...`.
_UA_BUILD = re.compile(r"^LevApp/(\d+)\b")

TEXTS = {
    "pt": "A LevApp 1.3.5 já está na App Store. Atualiza a app: a versão que tens tem um erro que a torna muito lenta.",
    "en": "LevApp 1.3.5 is now on the App Store. Update the app: the version you have has a bug that makes it very slow.",
    "fr": "LevApp 1.3.5 est disponible sur l'App Store. Mets à jour l'app : ta version a un bug qui la rend très lente.",
}

#: Users this worker knows hold the nudge: their requests then cost no query at all.
_done: set[int] = set()
#: Users whose nudge is being checked right now by this worker: a startup's several requests start one.
_inflight: set[int] = set()
_lock = threading.Lock()
_threads: list[threading.Thread] = []
_switch = {"value": None, "read_at": None}


def reset_cache() -> None:
    """Forget what this worker knows (a test, or a changed switch)."""
    with _lock:
        _done.clear()
        _inflight.clear()
    _switch.update(value=None, read_at=None)


def wait_idle(timeout: float = 30.0) -> None:
    """Join the nudge threads started so far (tests)."""
    for thread in list(_threads):
        thread.join(timeout)
    _threads[:] = [t for t in _threads if t.is_alive()]


def old_build(user_agent) -> int | None:
    """The build number of an old iOS build's User-Agent, else None. No database."""
    match = _UA_BUILD.match(user_agent or "")
    if match is None:
        return None
    build = int(match.group(1))
    return build if build <= UPDATE_NUDGE_MAX_BUILD else None


def enabled() -> bool:
    """Rule 6: the `app_settings` row, else `UPDATE_NUDGE_ENABLED`, else on; cached 30 s per worker."""
    now = time.monotonic()
    read_at = _switch["read_at"]
    if read_at is None or now - read_at >= SWITCH_CACHE_SECONDS or now < read_at:
        from padel_app.models.app_setting import AppSetting
        from padel_app.sql_db import db

        row = db.session.get(AppSetting, SETTING_KEY)
        if row is not None and isinstance(row.value, bool):
            value = row.value
        else:
            value = (os.getenv("UPDATE_NUDGE_ENABLED") or "1").strip().lower() not in ("0", "false", "no", "off")
        _switch.update(value=value, read_at=now)
    return bool(_switch["value"])


def text_for(language) -> str:
    return TEXTS.get((language or "").lower(), TEXTS["pt"])


def nudge(user_id: int) -> bool:
    """Post and push the nudge unless the user's Assistant conversation already holds one. The check
    and the post run under a lock on the conversation row, so of two requests at once exactly one
    posts (rule 2). Returns True when this call posted."""
    from padel_app.models import Conversation, Message, User
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.messaging_service import get_unread_count
    from padel_app.services.replacement_approval_service import _get_or_create_assistant_conversation
    from padel_app.sql_db import db
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.utils.push_notifications import send_push_notification

    user = db.session.get(User, user_id)
    if user is None:
        return False
    try:
        conv, assistant = _get_or_create_assistant_conversation(user_id)
    except IntegrityError:
        # Two first nudges at once both created the Assistant user (its creation is not race-safe);
        # the loser starts over and finds the winner's row.
        db.session.rollback()
        conv, assistant = _get_or_create_assistant_conversation(user_id)
    # The lock is taken before the check, and the check is a fresh statement, so a request that waited
    # for the lock sees the winner's committed message (read committed).
    db.session.query(Conversation).filter(Conversation.id == conv.id).with_for_update().one()
    held = db.session.query(Message.msg_metadata).filter(
        Message.conversation_id == conv.id, Message.sender_id == assistant.id
    ).all()
    if any(isinstance(meta, dict) and meta.get("kind") == NUDGE_KIND for (meta,) in held):
        db.session.rollback()
        _done.add(user_id)
        return False
    text = text_for(user.language)
    msg = Message(text=text, sender_id=assistant.id, conversation_id=conv.id,
                  msg_metadata={"kind": NUDGE_KIND, "maxBuild": UPDATE_NUDGE_MAX_BUILD})
    db.session.add(msg)
    db.session.commit()
    _done.add(user_id)
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    url = f"/messages/{conv.id}"
    send_push_notification(user_id=user_id, title=PUSH_TITLE, body=text, url=url)
    send_expo_push_to_user(user_id, title=PUSH_TITLE, body=text,
                           data={"type": "message", "conversationId": conv.id, "messageId": msg.id},
                           badge=get_unread_count(user_id))
    return True


def _run(app, user_id: int) -> None:
    """The thread's body. A thread has its own database session (Flask-SQLAlchemy scopes the session by
    thread), so the nudge neither commits nor rolls back what the request left pending."""
    try:
        with app.app_context():
            if enabled():
                nudge(user_id)
    except Exception:
        logger.exception("update nudge failed; the response is unchanged")
    finally:
        with _lock:
            _inflight.discard(user_id)


def _spawn(app, user_id: int) -> None:
    _threads[:] = [t for t in _threads if t.is_alive()]
    thread = threading.Thread(target=_run, args=(app, user_id), name="update-nudge", daemon=True)
    _threads.append(thread)
    thread.start()


def after_request(response):
    """Flask `after_request`: the response is returned unchanged whatever happens (rule 5)."""
    try:
        # Rule 1: the User-Agent first, the cheapest test, so every other request pays nothing.
        if old_build(request.headers.get("User-Agent")) is None or response.status_code >= 400:
            return response
        if request.endpoint in ("auth_api.logout", "auth_api.delete_me"):
            return response
        try:
            claims = get_jwt()
        except RuntimeError:  # no verified token on this request (a login, a public route)
            return response
        identity = get_jwt_identity()
        if identity is None or claims.get("view_as"):
            return response
        user_id = int(identity)
        if user_id in _done:
            return response
        with _lock:
            if user_id in _inflight:
                return response
            _inflight.add(user_id)
        try:
            _spawn(current_app._get_current_object(), user_id)
        except Exception:
            with _lock:
                _inflight.discard(user_id)
            raise
    except Exception:
        logger.exception("update nudge failed; the response is unchanged")
    return response
