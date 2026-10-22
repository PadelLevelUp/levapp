"""PAD-672 slice 2 — notifications.config rule 3a and classes.join-requests rule 21: a coach may let
eligible join requests in automatically. Off by default (owner Q3); never in semi-automatic mode.

Every "waits for the coach" cell sits beside the accepted control (R-032).
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad672_side_on_requests_and_waiting_list import (  # noqa: F401 — fixture
    CAPABLE, _ask, _jwt_secret, _requests, _world,
)


def _auto(app, ids, on=True):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one().auto_accept_join_requests = on
        db.session.commit()


def _enrolled(app, ids):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        return ids["player_id"] in db.session.get(LessonInstance, ids["class"]).enrolled_player_ids


def test_off_by_default_a_request_waits_for_the_coach(app, client):
    ids = _world(app, spot_sides=("left",))
    assert _ask(client, ids, CAPABLE, side="left").status_code == 201
    assert _requests(app, ids) == [("pending", "left")] and not _enrolled(app, ids)


def test_on_an_eligible_request_with_a_spot_of_its_side_is_accepted_at_once(app, client):
    ids = _world(app, spot_sides=("left",))
    _auto(app, ids)
    resp = _ask(client, ids, CAPABLE, side="left")
    assert resp.status_code == 201 and resp.get_json()["status"] == "accepted"
    assert _requests(app, ids) == [("accepted", "left")] and _enrolled(app, ids)


@pytest.mark.parametrize("why", ["excluded", "old-client-no-side-spot"])
def test_on_a_request_failing_a_coach_check_waits_for_the_coach(app, client, why):
    """An excluded student; an old client (no side named, its profile side recorded) whose side has
    no open spot. (An ineligible request is refused at creation, rule 3, so it never reaches here.)"""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.test_pad672_side_on_requests_and_waiting_list import OLD_CLIENT

    ids = _world(app, spot_sides=("right",) if why == "old-client-no-side-spot" else ("left",))
    _auto(app, ids)
    if why == "excluded":
        with app.app_context():
            config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one()
            config.excluded_players_enabled = True
            config.excluded_player_ids = [str(ids["player_id"])]
            db.session.commit()
    headers, body = (OLD_CLIENT, {}) if why == "old-client-no-side-spot" else (CAPABLE, {"side": "left"})
    resp = _ask(client, ids, headers, **body)
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert _requests(app, ids)[0][0] == "pending" and not _enrolled(app, ids)


def _save(client, ids, body):
    from flask_jwt_extended import create_access_token
    from padel_app.models import Coach

    with client.application.app_context():
        token = create_access_token(identity=str(db.session.get(Coach, ids["coach_id"]).user_id))
    return client.post("/api/app/notify/config", json=body, headers={"Authorization": f"Bearer {token}"})


def test_it_cannot_be_turned_on_in_semi_automatic_mode(app, client):
    ids = _world(app, spot_sides=("left",))
    assert _save(client, ids, {"invitationMode": "semi_automatic"}).status_code == 200
    refused = _save(client, ids, {"autoAcceptJoinRequests": True})
    assert refused.status_code == 400
    ok = _save(client, ids, {"invitationMode": "automatic", "autoAcceptJoinRequests": True})
    assert ok.status_code == 200 and ok.get_json()["autoAcceptJoinRequests"] is True


def test_switching_to_semi_automatic_turns_it_off_and_says_so(app, client):
    ids = _world(app, spot_sides=("left",))
    assert _save(client, ids, {"autoAcceptJoinRequests": True}).get_json()["autoAcceptJoinRequests"] is True
    resp = _save(client, ids, {"invitationMode": "semi_automatic"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["autoAcceptJoinRequests"] is False and body["notice"] == "auto_accept_off"
    # The control: a save that does not switch the mode carries no notice.
    assert "notice" not in _save(client, ids, {"autoNotifyEnabled": True}).get_json()
