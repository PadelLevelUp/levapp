"""PAD-531 admin.foundation rules 5, 7: only the owner manages roles; there is always an owner;
roles only for the company domain; a revoked email's row is re-activated on grant."""
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role, make_user


def test_only_the_owner_manages_roles(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    operator = make_role(app, "ana@levapp.app", "operator")
    body = {"email": "rui@levapp.app", "role": "support"}
    assert client.post("/admin/api/roles", headers=bearer(admin_token(app, operator)), json=body).status_code == 403
    r = client.post("/admin/api/roles", headers=bearer(admin_token(app, owner)), json=body)
    assert r.status_code == 201, r.get_json()
    assert r.get_json()["email"] == "rui@levapp.app" and r.get_json()["role"] == "support"
    rows = audit_rows(app, "role.grant")
    ok = [row for row in rows if row["outcome"] == "ok"]
    assert len(ok) == 1
    assert ok[0]["after"] == {"email": "rui@levapp.app", "role": "support"} and ok[0]["before"] is None
    assert ok[0]["actorEmail"] == "boss@levapp.app" and ok[0]["actorRole"] == "owner"
    assert ok[0]["targetType"] == "admin_role"
    denied = [row for row in rows if row["outcome"] == "denied"]
    assert len(denied) == 1 and denied[0]["actorEmail"] == "ana@levapp.app"


def test_the_last_owner_cannot_be_removed(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    token = admin_token(app, owner)
    assert client.delete(f"/admin/api/roles/{owner}", headers=bearer(token)).get_json() == {"error": "LAST_OWNER"}
    r = client.post(f"/admin/api/roles/{owner}", headers=bearer(token), json={"role": "operator"})
    assert r.status_code == 409 and r.get_json() == {"error": "LAST_OWNER"}
    from padel_app.models.admin_role import AdminRole

    with app.app_context():
        row = AdminRole.query.get(owner)
        assert row.role == "owner" and row.revoked_at is None
    # A second owner makes the downgrade possible.
    make_role(app, "second@levapp.app", "owner")
    assert client.post(f"/admin/api/roles/{owner}", headers=bearer(token), json={"role": "operator"}).status_code == 200


def test_roles_only_for_the_company_domain(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    r = client.post("/admin/api/roles", headers=bearer(admin_token(app, owner)), json={"email": "someone@gmail.com", "role": "support"})
    assert r.status_code == 400 and r.get_json() == {"error": "NOT_STAFF_DOMAIN"}
    r = client.post("/admin/api/roles", headers=bearer(admin_token(app, owner)), json={"email": "x@levapp.app.evil.com", "role": "support"})
    assert r.status_code == 400


def test_an_unknown_role_and_a_duplicate_are_refused(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    token = admin_token(app, owner)
    assert client.post("/admin/api/roles", headers=bearer(token), json={"email": "rui@levapp.app", "role": "god"}).get_json() == {"error": "INVALID_ROLE"}
    assert client.post("/admin/api/roles", headers=bearer(token), json={"email": "boss@levapp.app", "role": "support"}).status_code == 409


def test_granting_a_revoked_email_reactivates_its_row(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    old = make_role(app, "rui@levapp.app", "operator", revoked=True)
    r = client.post("/admin/api/roles", headers=bearer(admin_token(app, owner)), json={"email": "Rui@LevApp.app", "role": "support"})
    assert r.status_code == 201 and r.get_json()["id"] == old
    from padel_app.models.admin_role import AdminRole

    with app.app_context():
        assert AdminRole.query.count() == 2
        row = AdminRole.query.get(old)
        assert row.role == "support" and row.revoked_at is None and row.granted_by_email == "boss@levapp.app"


def test_grant_links_the_product_account_with_the_same_email(app, client):
    user_id = make_user(app, "rui", "Rui@levapp.app")
    owner = make_role(app, "boss@levapp.app", "owner")
    r = client.post("/admin/api/roles", headers=bearer(admin_token(app, owner)), json={"email": "rui@levapp.app", "role": "operator"})
    assert r.get_json()["userId"] == user_id


def test_change_and_revoke_write_before_and_after(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    rui = make_role(app, "rui@levapp.app", "support")
    token = admin_token(app, owner)
    assert client.post(f"/admin/api/roles/{rui}", headers=bearer(token), json={"role": "operator"}).status_code == 200
    assert client.delete(f"/admin/api/roles/{rui}", headers=bearer(token)).status_code == 200
    change = audit_rows(app, "role.change")[0]
    assert change["before"] == {"email": "rui@levapp.app", "role": "support"}
    assert change["after"] == {"email": "rui@levapp.app", "role": "operator"}
    revoke = audit_rows(app, "role.revoke")[0]
    assert revoke["before"] == {"email": "rui@levapp.app", "role": "operator"} and revoke["after"] is None
    listing = client.get("/admin/api/roles", headers=bearer(token)).get_json()["items"]
    assert [(i["email"], i["active"]) for i in listing] == [("boss@levapp.app", True), ("rui@levapp.app", False)]
    assert client.delete(f"/admin/api/roles/{rui}", headers=bearer(token)).status_code == 404
