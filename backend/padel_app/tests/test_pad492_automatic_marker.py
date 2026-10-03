"""
PAD-492 — automatic messages are told apart from typed ones (messaging.messages rule 6).

`serialize_message` derives `isAutomatic` from what every automatic writer already stores:
a `message_type` other than "text", or a non-null `msg_metadata`. The human send path
(`POST /api/app/message`) writes neither. Two kinds of test pin that:

- a source guard that enumerates every `Message(` construction in the backend from the code
  itself (not from a hand-kept list), so an automatic message added later without a marker
  fails here instead of silently rendering as if a person typed it;
- behaviour: a typed message is never automatic, whatever its body sends; a template reply
  with no type and no metadata is; a deleted message withholds the flag with its content.
"""
import ast
from pathlib import Path

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

BACKEND = Path(__file__).resolve().parents[1]  # backend/padel_app
SKIP_DIRS = {"tests", "seed", "migrations"}

# The one construction that is NOT automatic: the human send path builds an empty Message and
# fills it from a server-built payload (text, conversation, sender, sent_at) plus reply_to_id.
HUMAN_PATH = ("services/messaging_service.py", "create_message_service")


def _imports_model_message(tree) -> bool:
    """True when the module's `Message` is the chat model (padel_app.models), not e.g.
    flask_mail's email Message."""
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and any(a.name == "Message" for a in node.names):
            module = node.module or ""
            if module.endswith("models") or ".models." in module or module.startswith("models"):
                return True
    return False


def _dict_returning_functions(tree) -> set:
    """Module functions whose every `return` is a dict literal, so `msg_metadata=f(...)` is
    never null."""
    names = set()
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            returns = [n for n in ast.walk(node) if isinstance(n, ast.Return)]
            if returns and all(isinstance(r.value, ast.Dict) for r in returns):
                names.add(node.name)
    return names


def _message_constructions():
    """Every construction of the chat `Message` model in backend/padel_app outside
    tests/seed/migrations, with the function it sits in and the module's dict-returning
    helpers."""
    found = []
    for path in sorted(BACKEND.rglob("*.py")):
        rel = path.relative_to(BACKEND).as_posix()
        if rel.split("/")[0] in SKIP_DIRS:
            continue
        tree = ast.parse(path.read_text(), filename=rel)
        if not _imports_model_message(tree):
            continue
        helpers = _dict_returning_functions(tree)
        for func in ast.walk(tree):
            if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for node in ast.walk(func):
                if not isinstance(node, ast.Call):
                    continue
                callee = node.func
                name = callee.id if isinstance(callee, ast.Name) else getattr(callee, "attr", None)
                if name == "Message":
                    found.append((rel, func.name, node, helpers))
    # A call nested in an inner function is seen under both; keep the innermost.
    seen, unique = set(), []
    for rel, fname, node, helpers in reversed(found):
        key = (rel, node.lineno, node.col_offset)
        if key not in seen:
            seen.add(key)
            unique.append((rel, fname, node, helpers))
    return list(reversed(unique))


def _marks_itself(call: ast.Call, helpers=frozenset()) -> bool:
    kw = {k.arg: k.value for k in call.keywords if k.arg}
    mtype = kw.get("message_type")
    if isinstance(mtype, ast.Constant) and isinstance(mtype.value, str) and mtype.value != "text":
        return True
    meta = kw.get("msg_metadata")
    if isinstance(meta, ast.Dict):
        return True
    # `msg_metadata or {}` — never null by construction (_send_system_message).
    if isinstance(meta, ast.BoolOp) and isinstance(meta.op, ast.Or) and isinstance(meta.values[-1], ast.Dict):
        return True
    # `msg_metadata=_meta(row, kind)` where every return of `_meta` is a dict literal.
    if isinstance(meta, ast.Call) and isinstance(meta.func, ast.Name) and meta.func.id in helpers:
        return True
    return False


def test_every_automatic_writer_marks_its_message():
    sites = _message_constructions()
    assert len(sites) >= 8, f"the scan found too few Message( sites to be real: {sites}"

    human = [(rel, fn) for rel, fn, node, _h in sites if not node.args and not node.keywords]
    assert human == [HUMAN_PATH], (
        "the only bare Message() must be the human send path; a new one cannot be told "
        f"apart from a typed message: {human}"
    )

    unmarked = [
        f"{rel}:{node.lineno} in {fn}()"
        for rel, fn, node, helpers in sites
        if (rel, fn) != HUMAN_PATH and not _marks_itself(node, helpers)
    ]
    assert unmarked == [], (
        "these automatic writers store neither a non-'text' message_type nor a msg_metadata "
        "dict, so their messages would render as if a person typed them (messaging.messages "
        f"rule 6): {unmarked}"
    )


def test_the_system_send_helper_is_scanned_and_its_callers_exist():
    """Every caller of `_send_system_message` is marked through the helper's own
    `msg_metadata or {}`; make sure the scan really saw that write and that it has callers."""
    sites = _message_constructions()
    assert any(
        rel == "services/notification_service.py" and fn == "_send_system_message" and _marks_itself(node)
        for rel, fn, node, _h in sites
    )
    callers = 0
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND).as_posix()
        if rel.split("/")[0] in SKIP_DIRS:
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Call):
                callee = node.func
                name = callee.id if isinstance(callee, ast.Name) else getattr(callee, "attr", None)
                if name == "_send_system_message":
                    callers += 1
    assert callers >= 10


# ── behaviour ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def pair(app):
    """A coach with one student on its roster."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        cu = User(name="P492 Coach", username="p492_coach", password="x", status="active")
        su = User(name="P492 Student", username="p492_student", password="x", status="active")
        db.session.add_all([cu, su])
        db.session.flush()
        coach, player = Coach(user_id=cu.id), Player(user_id=su.id)
        db.session.add_all([coach, player])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        db.session.commit()
        return {"coach_user_id": cu.id, "student_user_id": su.id}


def _thread(client, app, pair):
    resp = client.post(
        "/api/app/conversation",
        json={"otherParticipants": [pair["coach_user_id"]]},
        headers=_auth(app, pair["student_user_id"]),
    )
    assert resp.status_code in (200, 201), resp.get_json()
    return resp.get_json()["id"]


def _messages(client, app, user_id, conversation_id):
    resp = client.get(f"/api/app/conversation/{conversation_id}?limit=50", headers=_auth(app, user_id))
    assert resp.status_code == 200
    return resp.get_json()["messages"]


def test_a_typed_message_is_never_automatic(client, app, pair):
    from padel_app.models import Message

    conv = _thread(client, app, pair)
    sent = client.post(
        "/api/app/message",
        json={
            "conversationId": conv,
            "text": "hi coach",
            "messageType": "notification_reminder",
            "message_type": "notification_reminder",
            "metadata": {"x": 1},
            "msg_metadata": {"x": 1},
        },
        headers=_auth(app, pair["student_user_id"]),
    )
    assert sent.status_code in (200, 201), sent.get_json()
    assert sent.get_json()["isAutomatic"] is False

    with app.app_context():
        row = db.session.get(Message, int(sent.get_json()["id"]))
        assert row.message_type == "text"
        assert row.msg_metadata is None

    (msg,) = _messages(client, app, pair["coach_user_id"], conv)
    assert msg["isAutomatic"] is False


def test_a_template_reply_with_no_type_or_metadata_is_automatic(client, app, pair):
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        msg = _send_system_message(
            pair["coach_user_id"], pair["student_user_id"], "The spot was filled.", push=False
        )
        conv = msg.conversation_id

    (row,) = _messages(client, app, pair["student_user_id"], conv)
    assert row["isAutomatic"] is True


def test_a_notice_sent_as_the_student_is_automatic(app, pair):
    """Some notices go out with the STUDENT as sender (return refused, join request, class
    request). They carry metadata, so they are automatic, not the student typing."""
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    with app.app_context():
        conv = _get_or_create_direct_conversation(pair["coach_user_id"], pair["student_user_id"])
        msg = Message(
            text="wanted to re-join", sender_id=pair["student_user_id"], conversation_id=conv.id,
            message_type="text", msg_metadata={"returnRefused": True},
        )
        msg.create()
        assert serialize_message(msg, None)["isAutomatic"] is True


def test_a_deleted_message_withholds_the_flag(app, pair):
    from padel_app.serializers.message import serialize_message
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        msg = _send_system_message(
            pair["coach_user_id"], pair["student_user_id"], "Reminder", push=False
        )
        msg.is_deleted = True
        db.session.commit()
        assert serialize_message(msg, None)["isAutomatic"] is False
