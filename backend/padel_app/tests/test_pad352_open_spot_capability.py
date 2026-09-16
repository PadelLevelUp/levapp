"""PAD-352 — open spots reach only a client that declares it understands them.

eligibility.open-spot-visibility rule 12 and classes.detail-visibility rule 5.
App Store 1.0 and 1.1.0 predate PAD-130's `openSpot` flag, send only an
Authorization header, and draw every calendar event as the student's own class.
So a request that does not list `open-spots` in `X-LevApp-Capabilities` gets no
open-spot events and cannot open an open-spot class by id. It fails closed.

Every "gets nothing" assertion sits next to a control showing the same student
WOULD get the class with the declaration (R-032): an empty list proves nothing
unless the subject was there to be found.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.tests.test_pad130_open_spots import _config
from padel_app.utils.dates import utcnow_naive

DECLARED = {"X-LevApp-Capabilities": "open-spots"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _world(app, *, visible):
    """PAD-128's seed: one future class at level 5 with room, a coach with no bar.
    Adds a rostered level-5 student who is NOT enrolled in it."""
    from padel_app.models.players import Player

    ids = _seed(app, eligibility_rules=None)
    if visible:
        _config(app, ids, open_spots_visible=True)
    with app.app_context():
        pid = _add_student(ids["coach_id"], "browser", level_id=ids["level_ids"]["5"])
        db.session.commit()
        token = create_access_token(identity=str(db.session.get(Player, pid).user_id))
    ids.update(player_id=pid, auth={"Authorization": f"Bearer {token}"})
    return ids


def _calendar(client, ids, extra_headers=None):
    now = utcnow_naive()
    window = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()}
    resp = client.get("/api/app/calendar", query_string=window, headers={**ids["auth"], **(extra_headers or {})})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    return resp.get_json()


def _open_ids(events):
    return [e["originalId"] for e in events if e.get("openSpot")]


# ── the calendar: the 2×2 ─────────────────────────────────────────────────────


def test_a_visible_class_reaches_only_a_client_that_declares_open_spots(app, client):
    ids = _world(app, visible=True)
    # Control: a declaring client sees the class as an open spot.
    assert _open_ids(_calendar(client, ids, DECLARED)) == [ids["instance_id"]]
    # The same student, same range, no declaration: rule 9's calendar. The class
    # appears in no form at all, flagged or not.
    undeclared = _calendar(client, ids)
    assert _open_ids(undeclared) == []
    assert ids["instance_id"] not in [e.get("originalId") for e in undeclared]


def test_with_the_toggle_off_no_client_gets_it_whatever_it_declares(app, client):
    ids = _world(app, visible=False)
    assert _open_ids(_calendar(client, ids, DECLARED)) == []
    assert _open_ids(_calendar(client, ids)) == []


@pytest.mark.parametrize(
    "value,declared",
    [
        ("open-spots", True),
        ("Open-Spots", True),  # tokens are case-insensitive
        (" later-thing ,open-spots ", True),  # a list, whitespace ignored
        ("open-spots-v2", False),  # a different token, not a prefix match
        ("openspots", False),
        ("", False),
    ],
)
def test_the_declaration_is_a_token_in_a_comma_separated_list(app, client, value, declared):
    ids = _world(app, visible=True)
    assert _open_ids(_calendar(client, ids, DECLARED)) == [ids["instance_id"]]  # control
    got = _open_ids(_calendar(client, ids, {"X-LevApp-Capabilities": value}))
    assert got == ([ids["instance_id"]] if declared else [])


# ── class detail by id (classes.detail-visibility rule 5) ────────────────────

READS = [
    ("post", "/api/app/class_instance", True),
    ("get", "/api/app/lesson_instance/{iid}", False),
    ("get", "/api/app/lesson_instance/{iid}/presences", False),
]


@pytest.mark.parametrize("method,path,by_query", READS)
def test_an_open_spot_opens_by_id_only_for_a_declaring_client(app, client, method, path, by_query):
    ids = _world(app, visible=True)
    url = path.format(iid=ids["instance_id"])
    query = {"model": "LessonInstance", "id": ids["instance_id"]} if by_query else None
    call = getattr(client, method)

    declared = call(url, query_string=query, headers={**ids["auth"], **DECLARED})
    assert declared.status_code == 200, declared.get_data(as_text=True)[:200]

    undeclared = call(url, query_string=query, headers=ids["auth"])
    assert undeclared.status_code == 403, undeclared.get_data(as_text=True)[:200]


# ── PAD-350's [I]: no attendance action on an open spot ──────────────────────


def test_an_old_client_cannot_cancel_attendance_on_an_open_spot(app, client):
    from padel_app.models import Presence

    ids = _world(app, visible=True)
    assert _open_ids(_calendar(client, ids, DECLARED)) == [ids["instance_id"]]  # it IS advertised to them

    for headers in (ids["auth"], {**ids["auth"], **DECLARED}):
        resp = client.post(
            "/api/app/notify/cancel_attendance",
            json={"lessonInstanceId": ids["instance_id"]},
            headers=headers,
        )
        assert resp.status_code == 403, resp.get_data(as_text=True)[:200]
    with app.app_context():
        assert Presence.query.filter_by(player_id=ids["player_id"], lesson_instance_id=ids["instance_id"]).count() == 0


# ── the header must survive a cross-origin preflight ─────────────────────────


def test_the_capabilities_header_is_allowed_in_a_cors_preflight(client):
    resp = client.options(
        "/api/app/calendar",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization, x-levapp-capabilities",
        },
    )
    allowed = [h.strip().lower() for h in resp.headers.get("Access-Control-Allow-Headers", "").split(",") if h.strip()]
    assert "authorization" in allowed, f"the preflight was not answered by the CORS layer: {dict(resp.headers)}"
    assert "x-levapp-capabilities" in allowed
