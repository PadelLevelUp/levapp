"""players.search (PAD-665, B-531): the Python twin runs the same cases file as the TypeScript
twin (frontend/packages/config/src/name-search.cases.json, read by name-search.test.ts), so the
server's search and the apps' local pickers cannot drift. Add a case to the file, never here."""
import json
import pathlib

import pytest

CASES = json.loads(
    (
        pathlib.Path(__file__).resolve().parents[3]
        / "frontend" / "packages" / "config" / "src" / "name-search.cases.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.parametrize("text,folded", CASES["fold"])
def test_fold(text, folded):
    from padel_app.services.player_service import fold_search_text  # R-006

    assert fold_search_text(text) == folded


@pytest.mark.parametrize("case", CASES["rank"], ids=lambda c: f"{c['name']}/{c['query']}")
def test_rank(case):
    from padel_app.services.player_service import rank_player_match  # R-006

    fields = {k: case.get(k) for k in ("name", "nickname", "email", "phone")}
    assert rank_player_match(fields, case["query"]) == case["tier"]


@pytest.mark.parametrize("case", CASES["order"], ids=lambda c: c["query"] + ":" + ",".join(c["expect"]))
def test_order(case):
    """Rule 6's order — tier, folded name, name as written, id (ASCII-digit ids as numbers, first)."""
    from padel_app.services.player_service import search_players  # R-006

    got = search_players(case["players"], case["query"], lambda p: p)
    assert [p["id"] for p in got] == case["expect"]
