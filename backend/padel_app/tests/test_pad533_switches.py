"""admin.clubs-and-switches rules 5–6 (PAD-533): capability kill-switches, the 30 s cache, the screen."""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role


@pytest.fixture(autouse=True)
def _fresh_cache():
    from padel_app.utils.client_capabilities import reset_switch_cache

    reset_switch_cache()
    yield
    reset_switch_cache()


@pytest.fixture
def staff(app):
    return {
        "owner": bearer(admin_token(app, make_role(app, "own533@levapp.app", "owner"))),
        "operator": bearer(admin_token(app, make_role(app, "op533s@levapp.app", "operator"))),
        "support": bearer(admin_token(app, make_role(app, "sup533s@levapp.app", "support"))),
    }


def test_every_capability_is_registered():
    """A new capability constant must be on the switch screen."""
    from padel_app.utils import client_capabilities as cc

    constants = {v for k, v in vars(cc).items() if k.isupper() and isinstance(v, str) and k != "HEADER"}
    assert constants == set(cc.CAPABILITIES)
    assert set(cc.CAPABILITIES.values()) <= {"feature", "compat"}


def test_a_kill_switch_withholds_a_capability_from_every_client(app, client, staff):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player
    from padel_app.tests.test_pad128_eligibility import _add_student, _seed
    from padel_app.tests.test_pad130_open_spots import _config
    from padel_app.utils.dates import utcnow_naive

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    app.config["JWT_SECRET_KEY"] = app.config.get("JWT_SECRET_KEY") or "test-jwt-secret"
    with app.app_context():
        pid = _add_student(ids["coach_id"], "student533", level_id=ids["level_ids"]["5"])
        db.session.commit()
        token = create_access_token(identity=str(db.session.get(Player, pid).user_id))
        now = utcnow_naive()
    window = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()}
    student = {"Authorization": f"Bearer {token}", "X-LevApp-Capabilities": "open-spots"}

    def open_spots():
        events = client.get("/api/app/calendar", query_string=window, headers=student).get_json()
        return [e for e in events if e.get("openSpot")]

    assert len(open_spots()) == 1
    r = client.put("/admin/api/settings/capabilities/open-spots", headers=staff["owner"],
                   json={"off": True, "reason": "B-xxx incident"})
    assert r.status_code == 200
    assert open_spots() == []                 # this worker's cache was busted by the write
    r = client.put("/admin/api/settings/capabilities/open-spots", headers=staff["owner"], json={"off": False})
    assert r.status_code == 200
    assert len(open_spots()) == 1
    rows = audit_rows(app, "capability.switch")
    assert [(r["before"]["off"], r["after"]["off"]) for r in rows] == [(False, True), (True, False)]


def test_the_cache_bounds_the_delay(app, monkeypatch):
    """A worker that read at T sees a change made elsewhere at T+1 s by T+31 s, and not before T+30 s."""
    from padel_app.models.app_setting import AppSetting
    from padel_app.utils import client_capabilities as cc, dates

    t = datetime(2026, 10, 8, 12, 0, 0)
    clock = {"now": t}
    monkeypatch.setattr(dates, "utcnow_naive", lambda: clock["now"])
    with app.app_context():
        assert cc.switched_off() == {}                                   # read at T
        db.session.add(AppSetting(key="capability_kill_switches",
                                  value={"open-spots": {"off": True, "reason": "elsewhere"}}))
        db.session.commit()                                              # another worker writes at T+1 s
        clock["now"] = t + timedelta(seconds=29)
        assert cc.switched_off() == {}                                   # still cached
        clock["now"] = t + timedelta(seconds=31)
        assert cc.switched_off()["open-spots"]["off"] is True            # within the bound


def test_switching_off_needs_a_reason_and_unknown_capabilities_are_refused(app, client, staff):
    r = client.put("/admin/api/settings/capabilities/open-spots", headers=staff["owner"], json={"off": True})
    assert r.status_code == 400 and r.get_json() == {"error": "REASON_REQUIRED"}
    r = client.put("/admin/api/settings/capabilities/open-spots", headers=staff["owner"], json={"off": True, "reason": "bug"})
    assert r.status_code == 400
    assert client.put("/admin/api/settings/capabilities/no-such-thing", headers=staff["owner"],
                      json={"off": True, "reason": "a reason"}).status_code == 404
    from padel_app.services.app_settings_service import capability_kill_switches

    with app.app_context():
        assert capability_kill_switches() == {}


def test_operators_and_support_cannot_flip_a_kill_switch(app, client, staff):
    for who in ("operator", "support"):
        r = client.put("/admin/api/settings/capabilities/open-spots", headers=staff[who],
                       json={"off": True, "reason": "not allowed"})
        assert r.status_code == 403
    from padel_app.services.app_settings_service import capability_kill_switches

    with app.app_context():
        assert capability_kill_switches() == {}
    assert [r["outcome"] for r in audit_rows(app, "capability.switch")] == ["denied", "denied"]


def test_the_screen_lists_every_capability_with_its_last_change(app, client, staff):
    client.put("/admin/api/settings/capabilities/evaluations", headers=staff["owner"],
               json={"off": True, "reason": "dashboard block misdraws"})
    items = client.get("/admin/api/settings/capabilities", headers=staff["support"]).get_json()["items"]
    by_name = {i["capability"]: i for i in items}
    assert set(by_name) == {"open-spots", "evaluations", "class-type-defaults", "coach-invite-email", "terms-acceptance"}
    assert by_name["evaluations"]["off"] is True and by_name["evaluations"]["reason"] == "dashboard block misdraws"
    assert by_name["evaluations"]["changedBy"] == "own533@levapp.app" and by_name["evaluations"]["changedAt"]
    assert by_name["open-spots"]["off"] is False and by_name["open-spots"]["changedAt"] is None
    assert by_name["terms-acceptance"]["kind"] == "compat"
