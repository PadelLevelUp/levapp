"""PAD-531 admin.foundation rules 8, 9: every write is audited in the same transaction; the log
is append-only and searchable."""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role


def test_the_write_and_its_audit_row_commit_together(app, client, monkeypatch):
    owner = make_role(app, "boss@levapp.app", "owner")
    token = admin_token(app, owner)
    from padel_app.services.admin import audit_service

    real_record = audit_service.record

    def exploding(ctx, outcome, request_id):
        if outcome == "ok":
            raise RuntimeError("audit insert refused")
        return real_record(ctx, outcome, request_id)

    monkeypatch.setattr(audit_service, "record", exploding)
    app.config["PROPAGATE_EXCEPTIONS"] = False  # answer 500 as production would, instead of re-raising
    r = client.post("/admin/api/roles", headers=bearer(token), json={"email": "rui@levapp.app", "role": "support"})
    assert r.status_code == 500
    from padel_app.models.admin_role import AdminRole

    with app.app_context():
        assert AdminRole.query.filter_by(email="rui@levapp.app").first() is None
    assert [row for row in audit_rows(app, "role.grant") if row["outcome"] == "ok"] == []

    monkeypatch.setattr(audit_service, "record", real_record)
    r = client.post("/admin/api/roles", headers=bearer(token), json={"email": "rui@levapp.app", "role": "support"})
    assert r.status_code == 201
    with app.app_context():
        assert AdminRole.query.filter_by(email="rui@levapp.app").first() is not None
    ok = [row for row in audit_rows(app, "role.grant") if row["outcome"] == "ok"]
    assert len(ok) == 1 and ok[0]["requestId"] == r.headers["X-Request-Id"]


def test_the_audit_log_cannot_be_changed(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    client.post("/admin/api/roles", headers=bearer(admin_token(app, owner)), json={"email": "rui@levapp.app", "role": "support"})
    for rule in app.url_map.iter_rules():
        if rule.rule.startswith("/admin/api/audit"):
            assert not ({"PUT", "PATCH", "DELETE"} & set(rule.methods)), rule
    from padel_app.models.admin_audit_log import AdminAuditLog, AdminAuditLogImmutable

    with app.app_context():
        row = AdminAuditLog.query.first()
        row.after = {"tampered": True}
        with pytest.raises(AdminAuditLogImmutable):
            db.session.flush()
        db.session.rollback()
        row = AdminAuditLog.query.first()
        db.session.delete(row)
        with pytest.raises(AdminAuditLogImmutable):
            db.session.flush()
        db.session.rollback()
        assert AdminAuditLog.query.first().after == {"email": "rui@levapp.app", "role": "support"}


def test_the_audit_log_lists_newest_first_with_filters_and_pages(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    token = admin_token(app, owner)
    for i in range(55):
        assert client.post("/admin/api/roles", headers=bearer(token), json={"email": f"u{i}@levapp.app", "role": "support"}).status_code == 201
    page1 = client.get("/admin/api/audit", headers=bearer(token)).get_json()
    assert len(page1["items"]) == 50 and page1["hasMore"] is True and page1["page"] == 1
    assert page1["items"][0]["after"]["email"] == "u54@levapp.app"
    page2 = client.get("/admin/api/audit?page=2", headers=bearer(token)).get_json()
    assert len(page2["items"]) == 5 and page2["hasMore"] is False
    by_action = client.get("/admin/api/audit?action=role.revoke", headers=bearer(token)).get_json()
    assert by_action["items"] == []
    some_id = page2["items"][0]["targetId"]
    by_target = client.get(f"/admin/api/audit?targetType=admin_role&targetId={some_id}", headers=bearer(token)).get_json()
    assert len(by_target["items"]) == 1
    by_actor = client.get("/admin/api/audit?actorEmail=nobody@levapp.app", headers=bearer(token)).get_json()
    assert by_actor["items"] == []
    from padel_app.utils.dates import utcnow_naive

    future = (utcnow_naive() + timedelta(days=1)).isoformat() + "Z"
    assert client.get(f"/admin/api/audit?from={future}", headers=bearer(token)).get_json()["items"] == []
    assert len(client.get(f"/admin/api/audit?to={future}", headers=bearer(token)).get_json()["items"]) == 50
    # Every item is camelCase with UTC ISO times (R-022, R-023).
    item = page1["items"][0]
    assert set(item) >= {"createdAt", "actorEmail", "actorRole", "action", "targetType", "targetId", "before", "after", "requestId", "outcome"}
    assert item["createdAt"].endswith("+00:00")  # UTC, as every other API time (R-023)


def test_a_service_error_is_rolled_back_and_recorded(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    token = admin_token(app, owner)
    r = client.post("/admin/api/roles", headers=bearer(token), json={"email": "rui@gmail.com", "role": "support"})
    assert r.status_code == 400
    rows = audit_rows(app, "role.grant")
    assert len(rows) == 1 and rows[0]["outcome"] == "error" and rows[0]["actorEmail"] == "boss@levapp.app"
