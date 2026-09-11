"""PAD-283 / PAD-284 / PAD-285 — dashboard.blocks rule 10: where each needs-you
item lands. The validation card opens the Presences tab WITH the validate view
open on its week; a reply opens THAT conversation (the web route is
`/messages/<id>`, which iOS maps to its conversation screen); an empty-seats
"Convidar" opens the class with Notificar already open.
"""
from datetime import datetime

from padel_app.tests.test_dashboard_coach_home import _seed


def test_validation_href_opens_the_validate_view_on_its_week(app):
    from padel_app.helpers.dashboard.coach_home import validation_href

    assert validation_href(0) == "/presences?validate=1"
    assert validation_href(-1) == "/presences?validate=1&week=-1"


def test_empty_seats_href_opens_notify(app):
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)
    with app.app_context():
        block = build_needs_you_block(coach_id=coach_id, user_id=user_id, now=now)
    seats = next(i for i in block["data"]["items"] if i["kind"] == "empty_seats")
    assert seats["href"].startswith("/calendar?classId=")
    assert "&date=2026-08-04" in seats["href"]
    assert seats["href"].endswith("&notify=1")
    # The hero and the schedule keep the plain calendar link — only "Convidar" means notify.
    validation = next(i for i in block["data"]["items"] if i["kind"] == "validation")
    assert validation["href"] == "/presences?validate=1&week=-1"


def test_reply_href_is_the_conversation_route(app):
    from padel_app.sql_db import db
    from padel_app.helpers.dashboard.coach_home import reply_items
    from padel_app.models import Message, User
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)
    with app.app_context():
        student = User.query.filter_by(username="ch_p0").first()
        conv = _get_or_create_direct_conversation(user_id, student.id)
        msg = Message(text="Olá treinador", sender_id=student.id, conversation_id=conv.id, message_type="text")
        db.session.add(msg)
        db.session.commit()
        conv_id = conv.id
        items = reply_items(user_id=user_id)
    assert [i["kind"] for i in items] == ["reply"]
    assert items[0]["href"] == f"/messages/{conv_id}"
