"""PAD-293 / B-070 — the AI import analysis must see the coach's existing levels.

`/import/analyze` streams `stream_import_analysis()` as a plain generator, so the
WSGI server iterates it AFTER Flask popped the request context. The only
database read inside the stream — the coach's level ladder — then fails, the
failure is downgraded to a log warning, and the analysis proceeds as if the
coach had no levels: every level value in the spreadsheet is dropped and the
"Coach Levels" table never appears. import.analyze rule 7.

The LLM is patched out; the pipeline's parsing steps are patched to canned data
so the test exercises the streaming and lookup path only.
"""
import io
import json
from unittest.mock import patch

from flask_jwt_extended import create_access_token

import pytest

from padel_app.tests.helpers import make_coach


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"

RAW = {
    "Coach Levels": [{"code": "Iniciacao", "label": "Iniciação"}],
    "Players": [{"name": "Ana Silva", "level_code": "Iniciacao"}],
}
MAPPING = json.dumps({"mapping": {"Iniciacao": "INI", "Iniciação": "INI"}})


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.sql_db import db

    coach_id = make_coach(app)
    with app.app_context():
        for order, (code, label) in enumerate([("ADV", "Avançado"), ("INI", "Iniciação")], 1):
            db.session.add(CoachLevel(coach_id=coach_id, code=code, label=label, display_order=order))
        db.session.commit()
        return Coach.query.get(coach_id).user_id


def _events(response):
    body = b"".join(response.response).decode()
    return [json.loads(line[len("data: "):]) for line in body.splitlines() if line.startswith("data: ")]


def _analyze(app, client, user_id):
    pipeline = "padel_app.services.ai_service.ImportPipeline"
    with patch(f"{pipeline}.parse", return_value={"Folha1": [["x"]]}), \
         patch(f"{pipeline}.filter_sheets", side_effect=lambda sheets: sheets), \
         patch(f"{pipeline}.detect_segments", return_value=["segment"]), \
         patch(f"{pipeline}.map_segments", return_value=RAW), \
         patch("padel_app.services.ai_service.call_llm", return_value=MAPPING) as llm:
        res = client.post(
            "/api/app/import/analyze",
            data={"file": (io.BytesIO(b"xlsx-bytes"), "roster.xlsx")},
            content_type="multipart/form-data",
            headers=_auth_header(app, user_id),
        )
        assert res.status_code == 200
        return _events(res), llm


def test_analysis_maps_spreadsheet_levels_onto_the_coachs_existing_levels(app, client):
    user_id = _seed(app)
    events, llm = _analyze(app, client, user_id)

    errors = [e for e in events if e["type"] == "error"]
    assert not errors, errors
    tables = [e for e in events if e["type"] == "tables"]
    assert len(tables) == 1, [e["type"] for e in events]

    final = tables[0]["tables"]
    assert [lvl["code"] for lvl in final.get("Coach Levels", [])] == ["INI"]
    assert final["Players"][0]["level_code"] == "INI"
    # the level mapping is the one LLM call this run makes — it only happens
    # when the coach's existing levels were actually fetched
    assert any(c.kwargs.get("label") == "map_levels" for c in llm.call_args_list)


def test_analysis_without_existing_levels_still_streams_tables(app, client):
    """A coach with no ladder yet gets players with their level left unmapped, no error."""
    from padel_app.models.coaches import Coach

    coach_id = make_coach(app)
    with app.app_context():
        user_id = Coach.query.get(coach_id).user_id
    events, llm = _analyze(app, client, user_id)

    assert not [e for e in events if e["type"] == "error"]
    final = [e for e in events if e["type"] == "tables"][0]["tables"]
    assert "Coach Levels" not in final
    assert final["Players"][0]["level_code"] == "Iniciacao"
    assert llm.call_count == 0
