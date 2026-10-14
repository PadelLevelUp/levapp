"""PAD-665 — players.search on the server's three search paths: the Players tab
(`coach_players_paginated`), the type-ahead (`notify/player_search`) and the claim candidates.

Best match first, before the limit and the page (rule 6); the coach's roster only — a matching
player on another coach's roster never appears (rule 7, R-032: each "never" beside a control that
does appear).
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def world(app):
    """Coach A: Ana Rita, Mariana Costa, Joana Anacleto, Rui Pedro Basto, a placeholder to claim.
    Coach B: Rui Basto (and Ana Banana) — never in A's results."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        def player(name, username, coach, status="active", phone=None):
            u = User(name=name, username=username, email=f"{username}@test.com", password="hashed",
                     status=status, phone=phone)
            db.session.add(u)
            db.session.flush()
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))
            return p

        coaches = {}
        for key in ("a", "b"):
            u = User(name=f"Coach {key}", username=f"coach_{key}", email=f"c{key}@test.com", password="h")
            db.session.add(u)
            db.session.flush()
            c = Coach(user_id=u.id)
            db.session.add(c)
            db.session.flush()
            coaches[key] = (u, c)
        a, b = coaches["a"][1], coaches["b"][1]
        ids = {
            "mariana": player("Mariana Costa", "mariana", a).id,
            "joana": player("Joana Anacleto", "joana", a, phone="+351 912 345 678").id,
            "ana": player("Ana Rita", "anarita", a).id,
            "rita": player("Rita Zé", "ritaze", a).id,
            "rui_a": player("Rui Pedro Basto", "ruipb", a).id,
            "placeholder": player("Rui P. Basto", "placeholder_rui", a, status="inactive").id,
            "rui_b": player("Rui Basto", "ruib", b).id,
            "banana_b": player("Ana Banana", "banana", b).id,
        }
        db.session.commit()
        return {"a_user": coaches["a"][0].id, "b_user": coaches["b"][0].id, "ids": ids}


def _names(rows, key="name"):
    return [r[key] for r in rows]


def test_players_tab_puts_the_best_match_on_page_one_and_counts_every_tier(app, client, world):
    """Relevance before the page: by name alone "Ana Rita" would lead; "Rita Zé" starts with the
    query (tier 0) and leads instead, and the tier-1 match is still counted."""
    res = client.get(
        "/api/app/coach_players_paginated?search=rita&per_page=1&page=1",
        headers=_auth(app, world["a_user"]),
    )
    assert res.status_code == 200, res.get_data(as_text=True)[:200]
    body = res.get_json()
    assert [r["name"] for r in body["items"]] == ["Rita Zé"]
    assert body["pagination"]["pages"] == 2  # Rita Zé (0), Ana Rita (1)


def test_players_tab_finds_by_phone_digits_it_already_carries(app, client, world):
    res = client.get("/api/app/coach_players_paginated?search=345678", headers=_auth(app, world["a_user"]))
    assert [r["name"] for r in res.get_json()["items"]] == ["Joana Anacleto"]


def test_type_ahead_ranks_before_its_limit(app, client, world):
    from padel_app.services.player_service import search_coach_players
    from padel_app.models.coaches import Coach

    with app.app_context():
        coach_a = Coach.query.filter_by(user_id=world["a_user"]).one()
        assert _names(search_coach_players(coach_a.id, "rita", limit=1)) == ["Rita Zé"]  # by name alone: Ana Rita


@pytest.mark.parametrize("path,rows_of", [
    ("/api/app/coach_players_paginated?search=rui%20basto", lambda body: body["items"]),
    ("/api/app/notify/player_search?q=rui%20basto", lambda body: body["players"]),
])
def test_searching_never_widens_who_appears(app, client, world, path, rows_of):
    res = client.get(path, headers=_auth(app, world["a_user"]))
    assert res.status_code == 200
    names = _names(rows_of(res.get_json()))
    assert names, "the control must find something (R-032)"
    assert "Rui Pedro Basto" in names  # control: A's own player is found
    assert "Rui Basto" not in names    # B's never is
    # and B, searching the same words, sees B's own and not A's
    res_b = client.get(path, headers=_auth(app, world["b_user"]))
    assert _names(rows_of(res_b.get_json())) == ["Rui Basto"]


def test_claim_candidates_use_the_shared_rule_and_stay_on_the_roster(app, client, world):
    pid = world["ids"]["placeholder"]
    res = client.get(f"/api/app/player/{pid}/claim-candidates?search=basto%20rui",
                     headers=_auth(app, world["a_user"]))
    assert res.status_code == 200, res.get_data(as_text=True)[:200]
    body = res.get_json()
    rows = body if isinstance(body, list) else body.get("items")
    names = _names(rows)
    assert "Rui Pedro Basto" in names  # words in any order (the old single substring missed it)
    assert "Rui Basto" not in names    # coach B's player


def test_claim_candidates_keep_the_duplicate_first_then_order_by_tier(app, client, world):
    """Rule 6 for this surface: a same-name candidate leads whatever its tier; then best tier."""
    from padel_app.models import User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        coach_a = Coach.query.filter_by(user_id=world["a_user"]).one()
        for name, username in (("Rui P. Basto", "dup_rui"), ("Basto Rui", "basto_first")):
            u = User(name=name, username=username, email=f"{username}@test.com", password="h", status="active")
            db.session.add(u)
            db.session.flush()
            pl = Player(user_id=u.id)
            db.session.add(pl)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=coach_a.id, player_id=pl.id))
        db.session.commit()
    pid = world["ids"]["placeholder"]  # "Rui P. Basto", inactive
    res = client.get(f"/api/app/player/{pid}/claim-candidates?search=basto",
                     headers=_auth(app, world["a_user"]))
    body = res.get_json()
    rows = body if isinstance(body, list) else body["items"]
    names = _names(rows)
    assert names, "the control must find something (R-032)"
    # same name first; then "Basto Rui" (tier 0) before "Rui Pedro Basto" (tier 1)
    assert names[0] == "Rui P. Basto"
    assert names.index("Basto Rui") < names.index("Rui Pedro Basto")
