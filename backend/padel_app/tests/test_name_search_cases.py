"""players.search (PAD-665, B-531): the Python twin runs the same cases file as the TypeScript
twin (frontend/packages/config/src/name-search.cases.json, read by name-search.test.ts), so the
server's search and the apps' local pickers cannot drift. Add a case to the file, never here."""
import json
import pathlib

import pytest

from padel_app.services.player_service import fold_search_text, rank_player_match, search_players

CASES = json.loads(
    (
        pathlib.Path(__file__).resolve().parents[3]
        / "frontend" / "packages" / "config" / "src" / "name-search.cases.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.parametrize("text,folded", CASES["fold"])
def test_fold(text, folded):
    assert fold_search_text(text) == folded


@pytest.mark.parametrize("case", CASES["rank"], ids=lambda c: f"{c['name']}/{c['query']}")
def test_rank(case):
    fields = {k: case.get(k) for k in ("name", "nickname", "email", "phone")}
    assert rank_player_match(fields, case["query"]) == case["tier"]


def test_search_players_orders_by_tier_then_name_and_keeps_order_on_blank():
    roster = [
        {"id": 3, "name": "Mariana Costa"},
        {"id": 1, "name": "Joana Anacleto"},
        {"id": 2, "name": "Ana Rita"},
        {"id": 4, "name": "Bruno Dias"},
    ]
    assert [p["name"] for p in search_players(roster, "ana", lambda p: p)] == [
        "Ana Rita", "Joana Anacleto", "Mariana Costa",
    ]
    assert search_players(roster, "  ", lambda p: p) == roster
