"""players.list rule 3 (PAD-516): a roster search matches every typed word in any order."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_player_claim_merge import _coach, _relation, _student


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def roster(app):
    cu, cid, _, _ = _coach(app)
    names = {}
    for username, name in (("p1", "Pedro Mesquita e Sousa"), ("p2", "Sousa Pedrosa"),
                           ("p3", "Pedro Alves"), ("p4", "Ana 100%_ Real")):
        _, pid = _student(app, username=username, name=name)
        _relation(app, cid, pid)
        names[name] = pid
    with app.app_context():
        token = create_access_token(identity=str(cu))
    return {"coach": cid, "headers": {"Authorization": f"Bearer {token}"}, "names": names}


def _names(client, roster, term):
    res = client.get(f"/api/app/coach_players_paginated?per_page=50&search={term}", headers=roster["headers"])
    assert res.status_code == 200
    return sorted(r["name"] for r in res.json["items"])


def test_the_words_match_in_any_order(client, roster):
    assert _names(client, roster, "pedro sousa") == ["Pedro Mesquita e Sousa", "Sousa Pedrosa"]
    assert _names(client, roster, "sousa pedro") == ["Pedro Mesquita e Sousa", "Sousa Pedrosa"]
    assert _names(client, roster, "PEDRO   mesq") == ["Pedro Mesquita e Sousa"]


def test_every_word_is_required(client, roster):
    assert _names(client, roster, "pedro zzz") == []


def test_wildcards_stay_literal_in_every_word(client, roster):
    assert _names(client, roster, "100% real") == ["Ana 100%_ Real"]
    assert _names(client, roster, "_ ana") == ["Ana 100%_ Real"]


def test_the_type_ahead_search_uses_the_same_rule(app, roster):
    from padel_app.services.player_service import search_coach_players

    with app.app_context():
        found = sorted(r["name"] for r in search_coach_players(roster["coach"], "sousa pedro"))
        assert found == ["Pedro Mesquita e Sousa", "Sousa Pedrosa"]
        assert search_coach_players(roster["coach"], "   ") == []
