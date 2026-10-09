"""players.list rule 4 (PAD-521) and levels rule 10 (PAD-522): the ladder, strongest first."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_player_claim_merge import _relation, _student


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def maria(app):
    """Levels created weakest-first (ids ascending), then ordered strongest-first."""
    from padel_app.models import Coach, CoachLevel, User

    with app.app_context():
        user = User(name="Maria", username="maria521", email="m521@example.com", password="pw", status="active")
        db.session.add(user); db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach); db.session.flush()
        ini = CoachLevel(coach_id=coach.id, code="INI", label="Iniciação", display_order=3)
        comp = CoachLevel(coach_id=coach.id, code="COMP", label="Competição", display_order=1)
        adv = CoachLevel(coach_id=coach.id, code="ADV", label="Avançado", display_order=2)
        db.session.add_all([ini, comp, adv]); db.session.flush()
        ids = {"coach": coach.id, "INI": ini.id, "COMP": comp.id, "ADV": adv.id}
        token = create_access_token(identity=str(user.id))
        db.session.commit()
    ids["headers"] = {"Authorization": f"Bearer {token}"}
    for username, name, code in (("r", "Rita", "INI"), ("z", "Zé", "COMP"), ("a", "Ana", "ADV"), ("b", "Bia", None)):
        _, pid = _student(app, username=f"{username}521", name=name)
        _relation(app, ids["coach"], pid, level_id=ids[code] if code else None)
    return ids


def _order(client, maria, direction):
    res = client.get(f"/api/app/coach_players_paginated?per_page=50&sort_by=level&sort_dir={direction}",
                     headers=maria["headers"])
    assert res.status_code == 200
    return [r["name"] for r in res.json["items"]]


def test_level_high_to_low_lists_the_strongest_first(client, maria):
    assert _order(client, maria, "desc") == ["Zé", "Ana", "Rita", "Bia"]


def test_level_low_to_high_is_the_reverse_with_no_level_last(client, maria):
    assert _order(client, maria, "asc") == ["Rita", "Ana", "Zé", "Bia"]


def test_an_unordered_level_is_the_weakest_in_both_directions(app, client, maria):
    from padel_app.models import CoachLevel

    with app.app_context():
        loose = CoachLevel(coach_id=maria["coach"], code="X", label="Sem ordem", display_order=0)
        db.session.add(loose); db.session.commit()
        loose_id = loose.id
    _, pid = _student(app, username="u521", name="Ugo")
    _relation(app, maria["coach"], pid, level_id=loose_id)
    assert _order(client, maria, "desc") == ["Zé", "Ana", "Rita", "Ugo", "Bia"]
    assert _order(client, maria, "asc") == ["Ugo", "Rita", "Ana", "Zé", "Bia"]


def test_the_levels_list_comes_strongest_first(client, maria):
    res = client.get("/api/app/coach_levels", headers=maria["headers"])
    assert res.status_code == 200
    assert [lvl["code"] for lvl in res.json] == ["COMP", "ADV", "INI"]


def test_a_search_keeps_the_level_order(client, maria):
    """PAD-516 + PAD-521: the search filters in Python after the SQL sort, so High→Low still holds."""
    res = client.get("/api/app/coach_players_paginated?per_page=50&sort_by=level&sort_dir=desc&search=a",
                     headers=maria["headers"])
    assert [r["name"] for r in res.json["items"]] == ["Ana", "Rita", "Bia"]
