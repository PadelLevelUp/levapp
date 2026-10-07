"""PAD-531 admin.foundation rules 3, 4, 5, 10, 11: tokens, roles per request, the role matrix,
request ids and the host check.

"Tokens do not cross" is the B-381 pin: a token carrying `aud` must be refused by the product
side (mutant: the `aud` line removed from the blocklist loader → the admin token acts as user
<sub>), and a product token must be refused by the admin side.
"""
import re
import uuid

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role, make_user, signing

UUID4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def _product_token(app, user_id):
    from padel_app.utils.tokens import issue_access_token

    signing(app)
    with app.app_context():
        return issue_access_token(user_id)


def test_tokens_do_not_cross(app, client):
    # A superadmin product user whose id equals the admin role id: the collision B-381 exploits.
    user_id = make_user(app, "boss", "boss@levapp.app", superadmin=True)
    role_id = make_role(app, "ana@levapp.app", "owner")
    assert role_id == user_id  # the first row of each table; the worst case
    admin = admin_token(app, role_id)
    product = _product_token(app, user_id)

    me = client.get("/api/auth/me", headers=bearer(admin))
    assert me.status_code == 401, me.get_json()

    audit = client.get("/admin/api/audit", headers=bearer(product))
    assert audit.status_code == 401 and audit.get_json() == {"error": "ADMIN_TOKEN_REQUIRED"}

    # Neither request changed a row.
    from padel_app.models.admin_audit_log import AdminAuditLog
    from padel_app.models.admin_role import AdminRole

    with app.app_context():
        assert AdminAuditLog.query.count() == 0
        assert AdminRole.query.get(role_id).revoked_at is None


def test_a_product_token_still_works_on_the_product(app, client):
    user_id = make_user(app, "pedro", "pedro@example.com")
    assert client.get("/api/auth/me", headers=bearer(_product_token(app, user_id))).status_code == 200


def test_the_admin_token_works_on_the_console(app, client):
    role_id = make_role(app, "ana@levapp.app", "support")
    r = client.get("/admin/api/auth/me", headers=bearer(admin_token(app, role_id)))
    assert r.status_code == 200
    assert r.get_json()["email"] == "ana@levapp.app" and r.get_json()["role"] == "support"


def test_no_token_is_401(client):
    signing(client.application)
    assert client.get("/admin/api/audit").get_json() == {"error": "ADMIN_TOKEN_REQUIRED"}
    assert client.get("/admin/api/audit", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_a_revoked_role_ends_access_on_the_next_request(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    ana = make_role(app, "ana@levapp.app", "operator")
    ana_token = admin_token(app, ana)
    assert client.get("/admin/api/audit", headers=bearer(ana_token)).status_code == 200
    r = client.delete(f"/admin/api/roles/{ana}", headers=bearer(admin_token(app, owner)))
    assert r.status_code == 200, r.get_json()
    assert client.get("/admin/api/audit", headers=bearer(ana_token)).status_code == 401


def test_logout_ends_the_session(app, client):
    role_id = make_role(app, "ana@levapp.app", "support")
    token = admin_token(app, role_id)
    assert client.post("/admin/api/auth/logout", headers=bearer(token)).status_code == 200
    assert client.get("/admin/api/auth/me", headers=bearer(token)).status_code == 401
    from padel_app.models import TokenBlocklist

    with app.app_context():
        assert TokenBlocklist.query.count() == 1


SESSION_ROUTES = {"admin_api.auth_google", "admin_api.auth_logout"}


def _write_rules(app):
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith("/admin/api/"):
            continue
        methods = set(rule.methods) - {"GET", "HEAD", "OPTIONS"}
        if methods and rule.endpoint not in SESSION_ROUTES:
            yield rule, sorted(methods)


def test_support_cannot_write(app, client):
    support = make_role(app, "sup@levapp.app", "support")
    target = make_role(app, "ana@levapp.app", "operator")
    token = admin_token(app, support)
    seen = 0
    for rule, methods in _write_rules(app):
        # The role check runs before any lookup, so every id placeholder may name the target row.
        path = re.sub(r"<int:\w+>", str(target), rule.rule)
        for method in methods:
            r = client.open(path, method=method, headers=bearer(token), json={"email": "x@levapp.app", "role": "support"})
            assert r.status_code == 403 and r.get_json() == {"error": "ADMIN_ROLE_TOO_LOW"}, (path, method, r.get_json())
            seen += 1
    assert seen >= 3  # grant, change, revoke at least
    from padel_app.models.admin_role import AdminRole

    with app.app_context():
        assert AdminRole.query.count() == 2
        assert AdminRole.query.get(target).role == "operator" and AdminRole.query.get(target).revoked_at is None
    from padel_app.tests.admin_helpers import audit_rows

    rows = audit_rows(app)
    assert rows and all(r["outcome"] == "denied" for r in rows)


def test_request_ids_are_echoed_and_stored(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    token = admin_token(app, owner)
    r = client.post("/admin/api/roles", headers={**bearer(token), "X-Request-Id": "abc-12345"},
                    json={"email": "rui@levapp.app", "role": "support"})
    assert r.status_code == 201 and r.headers["X-Request-Id"] == "abc-12345"
    r2 = client.post("/admin/api/roles", headers={**bearer(token), "X-Request-Id": "<script>"},
                     json={"email": "zé@levapp.app", "role": "support"})
    assert r2.status_code == 201
    fresh = r2.headers["X-Request-Id"]
    assert UUID4.match(fresh), fresh
    from padel_app.tests.admin_helpers import audit_rows

    rows = audit_rows(app, "role.grant")
    assert [row["requestId"] for row in rows] == ["abc-12345", fresh]


def test_the_blueprint_is_invisible_on_the_product_host(app_with_config):
    app = app_with_config({"ADMIN_HOSTS": ("admin.levapp.app",)})
    role_id = make_role(app, "ana@levapp.app", "support")
    token = admin_token(app, role_id)
    client = app.test_client()
    assert client.get("/admin/api/audit", headers={**bearer(token), "Host": "levapp.app"}).status_code == 404
    assert client.get("/admin/api/auth/config", headers={"Host": "levapp.app"}).status_code == 404
    assert client.get("/admin/api/audit", headers={**bearer(token), "Host": "admin.levapp.app"}).status_code == 200
    assert client.get("/admin/api/audit", headers={**bearer(token), "Host": "admin.levapp.app:443"}).status_code == 200


def test_the_product_routes_are_unaffected_by_the_host_list(app_with_config):
    app = app_with_config({"ADMIN_HOSTS": ("admin.levapp.app",)})
    assert app.test_client().get("/api/app/healthz", headers={"Host": "levapp.app"}).status_code == 200
