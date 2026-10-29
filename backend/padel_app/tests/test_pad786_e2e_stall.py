"""PAD-786 — client.pull-to-refresh rule 6: the E2E stall switch.

`POST /api/app/debug/stall {"path", "seconds"}` makes requests under `path` wait before they are
handled, until `DELETE /api/app/debug/stall`; both are 404 and nothing waits without the
E2E_DEBUG_ENDPOINTS flag. `time.sleep` is replaced so the tests record the waits instead of
taking them.
"""
import pytest

from padel_app.utils import e2e_stall

SWITCH = "/api/app/debug/stall"
TARGET = "/api/app/coach_players_paginated"


@pytest.fixture
def waits(monkeypatch):
    recorded = []
    monkeypatch.setattr(e2e_stall.time, "sleep", recorded.append)
    monkeypatch.delenv("E2E_DEBUG_ENDPOINTS", raising=False)
    yield recorded
    e2e_stall.disarm()


def test_off_the_flag_the_switch_is_404_and_nothing_waits(app, waits):
    app.config["E2E_DEBUG_ENDPOINTS"] = None
    client = app.test_client()
    assert client.post(SWITCH, json={"path": TARGET, "seconds": 30}).status_code == 404
    assert client.delete(SWITCH).status_code == 404
    # Even armed directly, a backend without the flag never waits.
    e2e_stall.arm(TARGET, 30)
    client.get(TARGET)
    assert waits == []


def test_on_the_flag_requests_under_the_path_wait_until_disarmed(app, waits):
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    client = app.test_client()
    res = client.post(SWITCH, json={"path": TARGET, "seconds": 60})
    assert res.status_code == 200
    assert res.get_json() == {"path": TARGET, "seconds": 60.0}

    client.get(TARGET)
    client.get("/api/app/coach_levels")
    assert waits == [60.0], "only the armed path waits"

    # The switch never waits on itself, so a flow can always lift it.
    assert client.delete(SWITCH).status_code == 200
    client.get(TARGET)
    assert waits == [60.0], "nothing waits once disarmed"


def test_a_stall_is_capped_and_needs_an_api_path(app, waits):
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    client = app.test_client()
    assert client.post(SWITCH, json={"seconds": 5}).status_code == 400
    assert client.post(SWITCH, json={"path": "/etc", "seconds": 5}).status_code == 400
    assert client.post(SWITCH, json={"path": TARGET, "seconds": "soon"}).status_code == 400
    res = client.post(SWITCH, json={"path": TARGET, "seconds": 9999})
    assert res.get_json()["seconds"] == e2e_stall.MAX_STALL_SECONDS
