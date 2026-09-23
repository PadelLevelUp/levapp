"""PAD-324: a push must point where its web sibling points.

The join-request push told the web "/messages/<conversationId>" and told iOS
`{"type": "class", "classInstanceId": …}`. Those are different destinations for
one event, and the second one cannot work: `messaging.push-notifications` rule 7
reserves `type: "class"` for pushes with NO message behind them, because the
class screen rebuilds its event from (model, originalId, date) route params a
push cannot carry — so the tap shows "could not find this class" before the app
ever asks the server. That is why the owner's screenshot said *encontrar*
rather than *carregar*.
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_pad131_join_requests import _config, _request, _seed, _student


def _pushes(app, ids, player_id):
    """Both pushes for one join request: (web url, expo data)."""
    with patch("padel_app.services.notification_service.publish"), \
         patch("padel_app.utils.push_notifications.send_push_notification") as web, \
         patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo:
        expo.return_value = True
        _request(app, ids, player_id)
    assert web.call_count == 1, "the coach is told once on the web"
    assert expo.call_count == 1, "and once on the device"
    return web.call_args.kwargs["url"], expo.call_args.kwargs["data"]


def test_both_pushes_for_a_join_request_point_at_the_same_thread(app):
    from padel_app.models import Conversation

    ids = _seed(app)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "asker")

    url, data = _pushes(app, ids, pid)

    with app.app_context():
        conv_ids = {c.id for c in Conversation.query.all()}

    assert data["type"] == "message", (
        'type "class" is reserved for pushes with no message behind them; this '
        "one has a message, and on iOS that payload lands on an error screen"
    )
    assert data["conversationId"] in conv_ids
    # PAD-408: the parity guard extends to the message id — both channels must
    # name the same message, not just the same conversation.
    assert url == "/messages/{}?message={}".format(
        data["conversationId"], data.get("messageId")
    ), (
        "the web and device pushes must name the same destination and message"
    )


def test_the_class_id_survives_as_context_but_is_not_the_target(app):
    """Rule 7: a classInstanceId on a message push is context and must not win."""
    ids = _seed(app)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "asker")

    _url, data = _pushes(app, ids, pid)

    assert data["classInstanceId"] == ids["instance_id"]
    assert data["type"] == "message"


# --- the same defect on the class-request push -----------------------------

def test_both_pushes_for_a_class_request_point_at_the_same_thread(app):
    """`class_request` is not one of the contract's two shapes either, so the
    tap opened the app and did nothing — a dead tap rather than a wrong screen,
    which is presumably why it lasted."""
    from padel_app.models import Conversation
    from padel_app.tests.test_pad104_class_requests import _request as _class_request
    from padel_app.tests.test_pad104_class_requests import _setup as _seed_requests

    ids = _seed_requests(app)
    with patch("padel_app.realtime.publish"), \
         patch("padel_app.utils.push_notifications.send_push_notification") as web, \
         patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo:
        expo.return_value = True
        _class_request(app, ids)

    assert web.call_count == 1 and expo.call_count == 1
    url = web.call_args.kwargs["url"]
    data = expo.call_args.kwargs["data"]

    with app.app_context():
        conv_ids = {c.id for c in Conversation.query.all()}

    assert data["type"] == "message"
    assert data["conversationId"] in conv_ids
    # PAD-408: the parity guard extends to the message id — both channels must
    # name the same message, not just the same conversation.
    assert url == "/messages/{}?message={}".format(
        data["conversationId"], data.get("messageId")
    )
    assert "classRequestId" in data, "the request id survives as context"
