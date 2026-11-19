"""PAD-834 — the roster says who is pending registration and when they were added
(players.list rules 5, 13, 14).

`pendingRegistration` is the placeholder of players.remove rule 5 (never activated, no
password), not `!validated`: a Google/Apple sign-up is active with no password and has an
account.
"""
from datetime import datetime

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _student(coach, name, username, *, status, password, level_id=None, side="left", created_at=None):
    from padel_app.models import Association_CoachPlayer, Player, User

    user = User(name=name, username=username, password=password, status=status)
    db.session.add(user)
    db.session.flush()
    player = Player(user_id=user.id)
    db.session.add(player)
    db.session.flush()
    rel = Association_CoachPlayer(coach_id=coach.id, player_id=player.id, level_id=level_id, side=side)
    if created_at is not None:
        rel.created_at = created_at
    db.session.add(rel)
    db.session.flush()
    return player, rel


@pytest.fixture
def coach(app):
    from padel_app.models import Coach, CoachLevel, User

    with app.app_context():
        user = User(name="Coach Ana", username="pad834_coach", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        level = CoachLevel(coach_id=coach.id, label="Iniciação", code="I1", display_order=1)
        db.session.add(level)
        db.session.commit()
        return dict(user_id=user.id, coach_id=coach.id, level_id=level.id)


def _rows_by_name(payload):
    items = payload["items"] if isinstance(payload, dict) else payload
    return {row["name"]: row for row in items}


@pytest.mark.criterion("PLAYERS-LIST-14")
def test_pending_is_the_placeholder_not_a_missing_password(app, client, coach):
    from padel_app.models import Coach

    with app.app_context():
        c = db.session.get(Coach, coach["coach_id"])
        placeholder, _ = _student(c, "Ghost Placeholder", "pad834_ghost", status="inactive", password=None,
                                  level_id=coach["level_id"])
        _student(c, "Google Student", "pad834_google", status="active", password=None, level_id=coach["level_id"])
        _student(c, "Half Registered", "pad834_half", status="inactive", password="x", level_id=coach["level_id"])
        db.session.commit()
        placeholder_id = placeholder.id

    headers = _headers(app, coach["user_id"])
    for url in ("/api/app/coach_players", "/api/app/coach_players_paginated"):
        res = client.get(url, headers=headers)
        assert res.status_code == 200
        rows = _rows_by_name(res.get_json())
        assert rows["Ghost Placeholder"]["pendingRegistration"] is True, url
        assert rows["Google Student"]["pendingRegistration"] is False, url
        assert rows["Half Registered"]["pendingRegistration"] is False, url
        # players.list rule 11 is unchanged: the Google student is still not `validated`.
        assert rows["Google Student"]["validated"] is False, url

    row = _rows_by_name(client.get("/api/app/coach_players", headers=headers).get_json())["Ghost Placeholder"]
    res = client.post("/api/app/edit_player", headers=headers,
                      json={"player": row, "updates": {**row, "phone": "912000000"}})
    assert res.status_code == 200, res.get_json()
    edited = res.get_json()
    edited = edited.get("player", edited) if isinstance(edited, dict) else edited
    assert edited["playerId"] == placeholder_id
    assert edited["pendingRegistration"] is True
    assert "addedAt" in edited


@pytest.mark.criterion("PLAYERS-LIST-14")
def test_added_at_is_the_link_date_or_null(app, client, coach):
    from padel_app.models import Coach

    with app.app_context():
        c = db.session.get(Coach, coach["coach_id"])
        _, dated = _student(c, "Dated Student", "pad834_dated", status="inactive", password=None,
                            created_at=datetime(2026, 11, 10, 23, 30, 0))
        _, undated = _student(c, "Undated Student", "pad834_undated", status="active", password="x")
        db.session.commit()
        # A link with no creation instant: only raw SQL can leave one (every app path uses the ORM default).
        db.session.execute(text("UPDATE coach_in_player SET created_at = NULL WHERE id = :id"), {"id": undated.id})
        db.session.commit()

    rows = _rows_by_name(client.get("/api/app/coach_players", headers=_headers(app, coach["user_id"])).get_json())
    assert rows["Dated Student"]["addedAt"] == "2026-11-10T23:30:00+00:00"
    assert rows["Undated Student"]["addedAt"] is None


@pytest.fixture
def roster_of_thirty(app, coach):
    """30 rows: 4 pending (one of them with no level), 3 more with no level, 2 more with no
    side, 21 complete; plus one disabled account with no level, which no count includes."""
    from padel_app.models import Coach

    with app.app_context():
        c = db.session.get(Coach, coach["coach_id"])
        lvl = coach["level_id"]
        n = 0

        def add(kind, **kw):
            nonlocal n
            n += 1
            _student(c, f"{kind} {n:02d}", f"pad834_{kind.lower()}_{n:02d}", **kw)

        add("Pending", status="inactive", password=None, level_id=None)
        for _ in range(3):
            add("Pending", status="inactive", password=None, level_id=lvl)
        for _ in range(3):
            add("NoLevel", status="active", password="x", level_id=None)
        for _ in range(2):
            add("NoSide", status="active", password="x", level_id=lvl, side=None)
        for _ in range(21):
            add("Complete", status="active", password="x", level_id=lvl)
        add("Disabled", status="disabled", password="x", level_id=None)
        db.session.commit()
    return coach


@pytest.mark.criterion("PLAYERS-LIST-15")
def test_alert_counts_ignore_page_search_and_filter(app, client, roster_of_thirty):
    headers = _headers(app, roster_of_thirty["user_id"])
    expected = {"missingLevel": 4, "missingSide": 2, "incomplete": 6, "pendingRegistration": 4}
    for query in ("page=1&per_page=25", "page=2&per_page=25", "pending=true", "incomplete=true", "search=zzz"):
        res = client.get(f"/api/app/coach_players_paginated?{query}", headers=headers)
        assert res.status_code == 200
        assert res.get_json()["alerts"] == expected, query


@pytest.mark.criterion("PLAYERS-LIST-15")
def test_the_pending_filter(app, client, roster_of_thirty):
    headers = _headers(app, roster_of_thirty["user_id"])
    body = client.get("/api/app/coach_players_paginated?pending=true&per_page=100", headers=headers).get_json()
    names = sorted(row["name"] for row in body["items"])
    assert names == ["Pending 01", "Pending 02", "Pending 03", "Pending 04"]
    assert all(row["pendingRegistration"] for row in body["items"])
    assert body["pagination"]["total"] == 4
