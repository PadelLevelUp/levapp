"""PAD-532 admin.approvals-and-users rules 4–7, 10c: the user directory, and the retired editor."""
import pathlib
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role, make_user, signing

BACKEND = pathlib.Path(__file__).resolve().parents[2]


@pytest.fixture
def sup(app):
    return admin_token(app, make_role(app, "sup@levapp.app", "support"))


@pytest.fixture
def op(app):
    return admin_token(app, make_role(app, "op@levapp.app", "operator"))


def test_search_finds_by_name_username_and_email(app, client, sup):
    # The username and email must not contain "joao": only the accented name can match it.
    joao = make_user(app, "jsilva", "js@example.com")
    with app.app_context():
        from padel_app.models import User

        User.query.get(joao).name = "João Silva"
        db.session.commit()
    joana = make_user(app, "joanar", "jr@example.com")
    with app.app_context():
        User.query.get(joana).name = "Joana Reis"
        db.session.commit()
    r = client.get("/admin/api/users?q=joao", headers=bearer(sup)).get_json()
    assert [u["userId"] for u in r["items"]] == [joao] and r["nextCursor"] is None
    assert [u["userId"] for u in client.get("/admin/api/users?q=js@ex", headers=bearer(sup)).get_json()["items"]] == [joao]
    short = client.get("/admin/api/users?q=j", headers=bearer(sup))
    assert short.status_code == 400 and short.get_json() == {"error": "QUERY_TOO_SHORT"}
    row = r["items"][0]
    assert set(row) == {"userId", "name", "username", "email", "emailVerified", "status", "roles", "createdAt"}


def test_search_pages_at_fifty_with_a_cursor(app, client, sup):
    for i in range(55):
        make_user(app, f"pager{i:02d}", f"pager{i:02d}@example.com")
    first = client.get("/admin/api/users?q=pager", headers=bearer(sup)).get_json()
    assert len(first["items"]) == 50 and first["nextCursor"]
    second = client.get(f"/admin/api/users?q=pager&cursor={first['nextCursor']}", headers=bearer(sup)).get_json()
    assert len(second["items"]) == 5 and second["nextCursor"] is None
    assert not ({u["userId"] for u in first["items"]} & {u["userId"] for u in second["items"]})


def test_the_user_view_never_leaks_secrets(app, client, sup):
    from padel_app.models import DeviceToken, User

    uid = make_user(app, "rita", "rita@example.com")
    with app.app_context():
        user = User.query.get(uid)
        user.password = "pbkdf2:sha256:SECRET-HASH-VALUE"
        user.email_verification_code_hash = "CODE-HASH-VALUE"
        user.password_reset_code_hash = "RESET-HASH-VALUE"
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[DEVICE-TOKEN-VALUE]", platform="ios"))
        db.session.commit()
    r = client.get(f"/admin/api/users/{uid}", headers=bearer(sup))
    assert r.status_code == 200
    text = r.get_data(as_text=True)
    for secret in ("SECRET-HASH-VALUE", "CODE-HASH-VALUE", "RESET-HASH-VALUE", "DEVICE-TOKEN-VALUE"):
        assert secret not in text
    body = r.get_json()
    assert body["emailVerified"] is False and body["status"] == "active" and body["pushRegistered"] is True
    assert client.get("/admin/api/users/999999", headers=bearer(sup)).status_code == 404


def test_disable_signs_the_user_out_everywhere_and_enable_lets_them_back(app, client, op):
    pedro = make_user(app, "pedro", "pedro@example.com")
    with app.app_context():
        phone = bearer(create_access_token(identity=str(pedro)))
        laptop = bearer(create_access_token(identity=str(pedro)))
    assert client.get("/api/auth/me", headers=phone).status_code == 200
    assert client.post(f"/admin/api/users/{pedro}/disable", headers=bearer(op), json={}).get_json() == {"error": "REASON_REQUIRED"}
    r = client.post(f"/admin/api/users/{pedro}/disable", headers=bearer(op), json={"reason": "abuse report"})
    assert r.status_code == 200 and r.get_json()["status"] == "disabled"
    assert client.get("/api/auth/me", headers=phone).status_code == 401
    assert client.get("/api/auth/me", headers=laptop).status_code == 401
    row = [a for a in audit_rows(app, "user.disable") if a["outcome"] == "ok"][0]
    assert row["after"] == {"status": "disabled", "reason": "abuse report"} and row["before"] == {"status": "active"}
    assert client.post(f"/admin/api/users/{pedro}/enable", headers=bearer(op)).get_json()["status"] == "active"
    with app.app_context():
        fresh = bearer(create_access_token(identity=str(pedro)))
    assert client.get("/api/auth/me", headers=fresh).status_code == 200
    # Idempotent: enabling an active user is still 200.
    assert client.post(f"/admin/api/users/{pedro}/enable", headers=bearer(op)).status_code == 200


def test_enable_does_not_reapprove_a_rejected_coach(app, client, op):
    from padel_app.models import Coach, User

    rui = make_user(app, "rui", "rui@example.com", status="disabled")
    with app.app_context():
        db.session.add(Coach(user_id=rui, approval_status="rejected"))
        db.session.commit()
    client.post(f"/admin/api/users/{rui}/enable", headers=bearer(op))
    with app.app_context():
        assert User.query.get(rui).status == "active"
        assert Coach.query.filter_by(user_id=rui).one().approval_status == "rejected"


def test_resend_verification_follows_the_product_limits(app, client, op, monkeypatch):
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email", lambda subject, recipients, body=None, html=None: sent.append(recipients))
    rita = make_user(app, "rita", "rita@example.com")
    first = client.post(f"/admin/api/users/{rita}/resend-verification", headers=bearer(op))
    assert first.status_code == 200 and first.get_json()["sent"] is True
    second = client.post(f"/admin/api/users/{rita}/resend-verification", headers=bearer(op))
    assert second.status_code == 429 and second.get_json()["error"] == "RESEND_TOO_SOON"
    assert second.get_json()["retryAfterSeconds"] >= 1
    assert sent == [["rita@example.com"]]
    rows = audit_rows(app, "user.resend_verification")
    assert [r["outcome"] for r in rows] == ["ok", "error"]
    noemail = make_user(app, "noemail", None)
    assert client.post(f"/admin/api/users/{noemail}/resend-verification", headers=bearer(op)).get_json()["error"] == "NO_EMAIL"


def test_a_bad_cursor_is_400_not_500(app, client, sup):
    make_user(app, "pager01", "pager01@example.com")
    for cursor in ("abc", "-5"):
        r = client.get(f"/admin/api/users?q=pager&cursor={cursor}", headers=bearer(sup))
        assert r.status_code == 400 and r.get_json() == {"error": "BAD_CURSOR"}, cursor


def test_enable_only_undoes_a_disable(app, client, op):
    from padel_app.models import User

    invited = make_user(app, "invited", "invited@example.com", status="inactive")
    r = client.post(f"/admin/api/users/{invited}/enable", headers=bearer(op))
    assert r.status_code == 200
    with app.app_context():
        assert User.query.get(invited).status == "inactive"


def test_resend_mails_only_after_the_audit_commit(app, client, op, monkeypatch):
    from padel_app.models import User
    from padel_app.services.admin import audit_service
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email", lambda subject, recipients, body=None, html=None: sent.append(recipients))
    real = audit_service.record

    def refuse(ctx, outcome, request_id):
        if outcome == "ok":
            raise RuntimeError("audit insert refused")
        return real(ctx, outcome, request_id)

    monkeypatch.setattr(audit_service, "record", refuse)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    rita = make_user(app, "rita", "rita@example.com")
    assert client.post(f"/admin/api/users/{rita}/resend-verification", headers=bearer(op)).status_code == 500
    assert sent == []
    with app.app_context():
        assert User.query.get(rita).email_verification_sent_at is None


def test_a_coach_view_lists_its_approval_rows(app, client, op, monkeypatch):
    from padel_app.models import Coach
    from padel_app.tools import email_tools

    monkeypatch.setattr(email_tools, "send_email", lambda *a, **k: None)
    rui = make_user(app, "rui", "rui@example.com")
    with app.app_context():
        coach = Coach(user_id=rui, approval_status="pending")
        db.session.add(coach)
        db.session.commit()
        coach_id = coach.id
    client.post(f"/admin/api/coach-approvals/{coach_id}/approve", headers=bearer(op))
    body = client.get(f"/admin/api/users/{rui}", headers=bearer(op)).get_json()
    assert "coach.approve" in [a["action"] for a in body["audit"]]


def test_support_reads_but_cannot_change_users(app, client, sup):
    pedro = make_user(app, "pedro", "pedro@example.com")
    for path in ("disable", "enable", "resend-verification"):
        r = client.post(f"/admin/api/users/{pedro}/{path}", headers=bearer(sup), json={"reason": "x"})
        assert r.status_code == 403, path
    from padel_app.models import User

    with app.app_context():
        assert User.query.get(pedro).status == "active"


def test_the_user_view_lists_its_audit_rows_and_role(app, client, op):
    uid = make_user(app, "ana", "ana@levapp.app")
    make_role(app, "ana@levapp.app", "support", user_id=uid)
    client.post(f"/admin/api/users/{uid}/disable", headers=bearer(op), json={"reason": "test"})
    body = client.get(f"/admin/api/users/{uid}", headers=bearer(op)).get_json()
    assert [a["action"] for a in body["audit"]] == ["user.disable"]
    assert body["adminRole"]["role"] == "support"


def test_the_editor_is_unreachable_where_it_deploys():
    """Rule 10c: no deployed template switches the generic editor on."""
    for template in (".env.staging", ".env.prod"):
        lines = [l for l in (BACKEND / template).read_text().splitlines() if not l.startswith("#")]
        assert not any(l.startswith("EDITOR_ENABLED") for l in lines), template
