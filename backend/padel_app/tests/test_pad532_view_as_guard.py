"""PAD-532 rule 9 guard (#584 review, 2026-10-08): no product GET shows a private message
under a view-as token, whatever route it is.

A coach and a student share a conversation whose messages carry SENTINEL. Every GET rule under
/api/ in the URL map is called under each of their view-as tokens (id placeholders filled with
the seeded ids); no response body may contain SENTINEL. A route added tomorrow is covered
the day it exists. The review found the first leak this way: the dashboard's
messages_overview (latest preview and reply items).

Also here: a refused write outside messaging; the per-request recheck that the actor is still
an operator; staff targets refused; the calendar read on a real recurring class.
"""
import re
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role, make_user, signing

SENTINEL = "SENTINEL-private-message-7f3a"


@pytest.fixture
def world(app, monkeypatch):
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.services import messaging_service
    from padel_app.services.messaging_service import create_message_service
    from padel_app.tests.test_pad128_eligibility import _add_student, _seed

    signing(app)
    monkeypatch.setattr(messaging_service, "publish", lambda *a, **k: None)
    ids = _seed(app)
    with app.app_context():
        pid = _add_student(ids["coach_id"], "va_student")
        db.session.commit()
        student_user_id = db.session.get(Player, pid).user_id
        # A recurring series, so the calendar has never-materialised occurrences.
        lesson = db.session.get(Lesson, ids["lesson_id"])
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        lesson.is_recurring = True
        lesson.recurrence_rule = '{"frequency": "weekly", "daysOfWeek": [%d]}' % ((lesson.start_datetime.weekday() + 1) % 7)
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=6)).date()
        conv = Conversation(is_group=False, participant_key=Conversation.build_participant_key([ids["coach_user_id"], student_user_id]))
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conv.id, user_id=ids["coach_user_id"]),
            ConversationParticipant(conversation_id=conv.id, user_id=student_user_id),
        ])
        db.session.commit()
        conv_id = conv.id
        m1 = create_message_service({"text": f"{SENTINEL} from coach", "conversationId": conv_id}, ids["coach_user_id"])
        m2 = create_message_service({"text": f"{SENTINEL} from student", "conversationId": conv_id}, student_user_id)
        msg_ids = [getattr(m1, "id", None) or 1, getattr(m2, "id", None) or 1]
    op = admin_token(app, make_role(app, "op@levapp.app", "operator"))
    return {**ids, "student_user_id": student_user_id, "conv_id": conv_id, "msg_ids": msg_ids, "op": op}


def _view_as(client, op, user_id):
    r = client.post(f"/admin/api/users/{user_id}/view-as", headers=bearer(op))
    assert r.status_code == 200, r.get_json()
    return r.get_json()["url"].split("#", 1)[1]


def _fill(rule, world):
    def value(match):
        conv, name = match.group(1), match.group(2)
        if conv == "int":
            if "conversation" in name:
                return str(world["conv_id"])
            if "message" in name:
                return str(world["msg_ids"][0])
            if name in ("user_id", "id"):
                return str(world["student_user_id"])
            return "1"
        return "x"

    return re.sub(r"<(?:(\w+):)?(\w+)>", lambda m: value(re.match(r"(?:(\w+):)?(\w+)", m.group(0)[1:-1])), rule)


QUERY = "from=2026-01-01T00:00:00&to=2027-12-31T23:59:59&date=2026-10-07&start=2026-01-01&end=2027-12-31&q=a&limit=100"


def test_no_product_get_shows_a_private_message_under_view_as(app, client, world):
    app.config["PROPAGATE_EXCEPTIONS"] = False
    tokens = {"coach": _view_as(client, world["op"], world["coach_user_id"]),
              "student": _view_as(client, world["op"], world["student_user_id"])}
    # Control: the same reads WITHOUT view-as do show the sentinel somewhere, so the walk can see it.
    from flask_jwt_extended import create_access_token

    with app.app_context():
        plain = create_access_token(identity=str(world["coach_user_id"]))
    control = client.get("/api/app/conversations", headers=bearer(plain)).get_data(as_text=True)
    assert SENTINEL in control

    walked, leaks = 0, []
    for rule in app.url_map.iter_rules():
        if "GET" not in rule.methods or not rule.rule.startswith("/api/") or rule.rule.startswith("/api/app/events"):
            continue
        path = _fill(rule.rule, world)
        for who, token in tokens.items():
            r = client.get(f"{path}?{QUERY}", headers=bearer(token))
            walked += 1
            if SENTINEL in r.get_data(as_text=True):
                leaks.append(f"{who}: {rule.rule} ({r.status_code})")
    assert walked > 100, walked  # the walk really covered the API
    assert leaks == [], f"private message text under view-as: {leaks}"


def test_a_write_outside_messaging_is_refused(app, client, world):
    from padel_app.models import TokenBlocklist

    token = _view_as(client, world["op"], world["coach_user_id"])
    r = client.post("/api/auth/logout", headers=bearer(token))
    assert r.status_code == 403 and r.get_json() == {"error": "VIEW_AS_READ_ONLY"}
    with app.app_context():
        assert TokenBlocklist.query.count() == 0


def test_the_view_ends_when_the_actor_stops_being_an_operator(app, client, world):
    from padel_app.models.admin_role import AdminRole

    token = _view_as(client, world["op"], world["coach_user_id"])
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 200
    with app.app_context():
        AdminRole.query.filter_by(email="op@levapp.app").one().role = "owner"  # promoted: not an operator any more
        db.session.commit()
    r = client.get("/api/auth/me", headers=bearer(token))
    assert r.status_code == 401 and r.get_json() == {"error": "VIEW_AS_REVOKED"}
    with app.app_context():
        row = AdminRole.query.filter_by(email="op@levapp.app").one()
        row.role = "operator"
        from padel_app.utils.dates import utcnow_naive

        row.revoked_at = utcnow_naive()
        db.session.commit()
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401


@pytest.mark.parametrize("kind", ["superadmin", "console_role"])
def test_staff_accounts_cannot_be_viewed_as(app, client, world, kind):
    if kind == "superadmin":
        target = make_user(app, "boss", "boss@example.com", superadmin=True)
    else:
        target = make_user(app, "ana", "ana@levapp.app")
        make_role(app, "ana@levapp.app", "support", user_id=target)
    r = client.post(f"/admin/api/users/{target}/view-as", headers=bearer(world["op"]))
    assert r.status_code == 403 and r.get_json() == {"error": "VIEW_AS_TARGET_STAFF"}


def test_the_calendar_read_materialises_nothing(app, client, world):
    """The spec's case on the real calendar route: a week with a never-materialised occurrence of a
    recurring class. (No product GET materialises today; this pins it, and the commit-to-flush rule
    covers any GET that starts to.)"""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson

    token = _view_as(client, world["op"], world["coach_user_id"])
    with app.app_context():
        start = db.session.get(Lesson, world["lesson_id"]).start_datetime
        before = LessonInstance.query.count()
    frm = (start + timedelta(weeks=1)).date().isoformat()
    to = (start + timedelta(weeks=3)).date().isoformat()
    r = client.get(f"/api/app/calendar?from={frm}T00:00:00&to={to}T23:59:59", headers=bearer(token))
    assert r.status_code == 200
    assert any(e.get("model") == "Lesson" for e in r.get_json()), "the week shows a virtual occurrence"
    with app.app_context():
        assert LessonInstance.query.count() == before
