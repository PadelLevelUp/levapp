"""PAD-532 admin.approvals-and-users rules 1, 2, 3, 10, 10b: coach approvals and the approval gate
move to the staff console with the whole existing flow unchanged.

Side effects are captured at their sources: `email_tools.send_email`, the two push senders and
`hubspot_sync.sync_coach_status`. They must run only after the write and its audit row commit
(admin.foundation rule 8)."""
import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role, make_user, signing


@pytest.fixture
def captured(monkeypatch):
    from padel_app.services import hubspot_sync
    from padel_app.tools import email_tools
    from padel_app.utils import expo_push, push_notifications

    out = {"mail": [], "web": [], "expo": [], "crm": []}
    monkeypatch.setattr(email_tools, "send_email", lambda subject, recipients, body=None, html=None: out["mail"].append((subject, recipients, body)))
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda user_id, title, body, url=None, **kw: out["web"].append((user_id, url)))
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda user_id, title, body, data=None, **kw: out["expo"].append((user_id, data)))
    monkeypatch.setattr(hubspot_sync, "sync_coach_status", lambda coach: out["crm"].append((coach.id, coach.approval_status)))
    return out


def _coach(app, username, status="pending", language="pt", email=None):
    from padel_app.models import Coach, User

    signing(app)
    with app.app_context():
        user = User(name=username.title(), username=username, email=email or f"{username}@example.com",
                    password="x", status="active", language=language)
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status=status)
        db.session.add(coach)
        db.session.commit()
        return user.id, coach.id


def _coach_state(app, coach_id):
    from padel_app.models import Coach

    with app.app_context():
        coach = Coach.query.get(coach_id)
        return coach.approval_status, coach.approved_by_user_id, coach.rejection_reason, coach.user.status


def test_the_console_lists_and_approves_a_pending_coach_with_the_full_side_effects(app, client, captured):
    _, rui = _coach(app, "rui")
    ana = admin_token(app, make_role(app, "ana@levapp.app", "operator"))
    listed = client.get("/admin/api/coach-approvals", headers=bearer(ana)).get_json()["items"]
    assert [c["coachId"] for c in listed] == [rui]
    assert set(listed[0]) >= {"coachId", "userId", "name", "username", "email", "emailVerified", "requestedAt"}

    r = client.post(f"/admin/api/coach-approvals/{rui}/approve", headers=bearer(ana))
    assert r.status_code == 200 and r.get_json() == {"coachId": rui, "approvalStatus": "approved"}
    status, approved_by, _, _ = _coach_state(app, rui)
    assert status == "approved" and approved_by is None  # ana has no linked product account
    assert [s for s, _, _ in captured["mail"]] == ["A tua conta de treinador foi aprovada"]
    assert len(captured["web"]) == 1 and len(captured["expo"]) == 1
    assert captured["crm"] == [(rui, "approved")]
    row = audit_rows(app, "coach.approve")
    assert len(row) == 1 and row[0]["actorEmail"] == "ana@levapp.app" and row[0]["outcome"] == "ok"
    assert row[0]["before"]["approvalStatus"] == "pending" and row[0]["after"]["approvalStatus"] == "approved"
    assert (row[0]["targetType"], row[0]["targetId"]) == ("coach", str(rui))


def test_an_operator_with_a_linked_account_is_the_approver(app, client, captured):
    _, rui = _coach(app, "rui")
    boss = make_user(app, "boss", "boss@levapp.app")
    token = admin_token(app, make_role(app, "boss@levapp.app", "operator", user_id=boss))
    client.post(f"/admin/api/coach-approvals/{rui}/approve", headers=bearer(token))
    assert _coach_state(app, rui)[1] == boss


def test_rejection_behaves_as_in_the_product(app, client, captured):
    from flask_jwt_extended import create_access_token

    rui_user, rui = _coach(app, "rui")
    with app.app_context():
        product = create_access_token(identity=str(rui_user))
    assert client.get("/api/auth/me", headers=bearer(product)).status_code == 200
    op = admin_token(app, make_role(app, "ana@levapp.app", "operator"))
    r = client.post(f"/admin/api/coach-approvals/{rui}/reject", headers=bearer(op), json={"reason": "not a coach"})
    assert r.status_code == 200
    assert _coach_state(app, rui) == ("rejected", None, "not a coach", "disabled")
    assert client.get("/api/auth/me", headers=bearer(product)).status_code == 401
    after = audit_rows(app, "coach.reject")[0]["after"]
    assert after == {"approvalStatus": "rejected", "rejectionReason": "not a coach", "userStatus": "disabled"}
    assert captured["crm"] == [(rui, "rejected")]
    assert captured["mail"] == []  # the product sends no rejection mail either


def test_a_decided_coach_answers_410(app, client, captured):
    _, maria = _coach(app, "maria", status="approved")
    op = admin_token(app, make_role(app, "ana@levapp.app", "operator"))
    assert client.post(f"/admin/api/coach-approvals/{maria}/reject", headers=bearer(op)).status_code == 410
    rows = audit_rows(app, "coach.reject")
    assert len(rows) == 1 and rows[0]["outcome"] == "error"
    assert _coach_state(app, maria)[0] == "approved"
    assert captured["crm"] == []


def test_support_cannot_approve(app, client, captured):
    _, rui = _coach(app, "rui")
    sup = admin_token(app, make_role(app, "sup@levapp.app", "support"))
    assert client.post(f"/admin/api/coach-approvals/{rui}/approve", headers=bearer(sup)).status_code == 403
    assert _coach_state(app, rui)[0] == "pending"
    assert captured["mail"] == [] and captured["crm"] == []


def test_side_effects_wait_for_the_audit_commit(app, client, captured, monkeypatch):
    """Rule 8: an approval whose audit row cannot be written is not an approval — no mail, no push, no CRM."""
    from padel_app.services.admin import audit_service

    real = audit_service.record

    def refuse(ctx, outcome, request_id):
        if outcome == "ok":
            raise RuntimeError("audit insert refused")
        return real(ctx, outcome, request_id)

    monkeypatch.setattr(audit_service, "record", refuse)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    _, rui = _coach(app, "rui")
    op = admin_token(app, make_role(app, "ana@levapp.app", "operator"))
    assert client.post(f"/admin/api/coach-approvals/{rui}/approve", headers=bearer(op)).status_code == 500
    assert _coach_state(app, rui)[0] == "pending"
    assert captured == {"mail": [], "web": [], "expo": [], "crm": []}


def test_the_product_admin_routes_are_gone(app, client):
    boss = make_user(app, "boss", "boss@levapp.app", superadmin=True)
    from flask_jwt_extended import create_access_token

    with app.app_context():
        headers = bearer(create_access_token(identity=str(boss)))
    assert client.get("/api/app/admin/coach-approvals", headers=headers).status_code == 404
    assert client.post("/api/app/admin/coach-approvals/1/approve", headers=headers).status_code == 404
    assert client.get("/api/app/admin/settings", headers=headers).status_code == 404
    assert client.put("/api/app/admin/settings", headers=headers, json={"coachApprovalRequired": False}).status_code == 404


def test_the_approval_gate_is_in_the_console(app, client, captured):
    sup = admin_token(app, make_role(app, "sup@levapp.app", "support"))
    op = admin_token(app, make_role(app, "ana@levapp.app", "operator"))
    assert client.get("/admin/api/settings/coach-approval", headers=bearer(sup)).get_json() == {
        "coachApprovalRequired": True, "source": "environment",
    }
    assert client.put("/admin/api/settings/coach-approval", headers=bearer(sup), json={"coachApprovalRequired": False}).status_code == 403
    assert client.put("/admin/api/settings/coach-approval", headers=bearer(op), json={"coachApprovalRequired": "no"}).status_code == 400
    r = client.put("/admin/api/settings/coach-approval", headers=bearer(op), json={"coachApprovalRequired": False})
    assert r.get_json() == {"coachApprovalRequired": False, "source": "database"}
    from padel_app.services.app_settings_service import coach_approval_required

    with app.app_context():
        assert coach_approval_required() is False
    ok = [row for row in audit_rows(app, "settings.coach_approval") if row["outcome"] == "ok"]
    assert len(ok) == 1
    assert ok[0]["before"] == {"coachApprovalRequired": True} and ok[0]["after"] == {"coachApprovalRequired": False}


def test_the_pending_coach_alert_points_at_the_console(app, captured):
    """Rule 10 + decision 2026-10-07: owners and operators with a linked account, plus the
    superadmins during the transition; never support; the destination is the console."""
    from padel_app.services.coach_approval_service import notify_admin_of_pending_coach
    from padel_app.models import Coach

    app.config["ADMIN_CONSOLE_URL"] = "https://admin.staging.levapp.app"
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    owner_u = make_user(app, "own", "own@levapp.app")
    op_u = make_user(app, "opr", "opr@levapp.app")
    sup_u = make_user(app, "spt", "spt@levapp.app")
    legacy = make_user(app, "legacy", "legacy@example.com", superadmin=True)
    make_role(app, "own@levapp.app", "owner", user_id=owner_u)
    make_role(app, "opr@levapp.app", "operator", user_id=op_u)
    make_role(app, "spt@levapp.app", "support", user_id=sup_u)
    make_role(app, "gone@levapp.app", "operator", user_id=make_user(app, "gone", "gone@levapp.app"), revoked=True)
    _, rui = _coach(app, "rui")
    with app.app_context():
        notify_admin_of_pending_coach(Coach.query.get(rui))
    alerted = sorted(uid for uid, _ in captured["web"])
    assert alerted == sorted([owner_u, op_u, legacy])
    assert {url for _, url in captured["web"]} == {"https://admin.staging.levapp.app/approvals"}
    assert {d["path"] for _, d in captured["expo"]} == {"https://admin.staging.levapp.app/approvals"}
    admin_mail = [body for subject, to, body in captured["mail"] if to == ["admin@levapp.app"]]
    assert len(admin_mail) == 1 and "https://admin.staging.levapp.app/approvals" in admin_mail[0]
    assert "Settings → Admin" not in admin_mail[0]
    # The alert mail each recipient gets carries the same console link, absolute, not glued to the
    # product origin (review finding 1: "https://staging.levapp.apphttps://admin…").
    alert_mail = [body for subject, to, body in captured["mail"] if to == ["own@levapp.app"]]
    assert len(alert_mail) == 1
    assert ": https://admin.staging.levapp.app/approvals" in alert_mail[0]
    assert "apphttps" not in alert_mail[0]


def test_no_console_url_means_no_wrong_link(app, captured, caplog):
    """#568 review: with ADMIN_CONSOLE_URL unset, a console alert would point at the product
    origin + /approvals, a page that does not exist. Refuse the push and the alert mail, log a
    warning; the ADMIN_NOTIFY_EMAIL mail still says a coach is waiting, without a bare path."""
    import logging

    from padel_app.models import Coach
    from padel_app.services.coach_approval_service import notify_admin_of_pending_coach

    app.config["ADMIN_CONSOLE_URL"] = ""
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    owner_u = make_user(app, "own", "own@levapp.app")
    make_role(app, "own@levapp.app", "owner", user_id=owner_u)
    _, rui = _coach(app, "rui")
    with caplog.at_level(logging.WARNING), app.app_context():
        notify_admin_of_pending_coach(Coach.query.get(rui))
    assert captured["web"] == [] and captured["expo"] == []
    assert [to for _, to, _ in captured["mail"]] == [["admin@levapp.app"]]
    assert "/approvals" not in captured["mail"][0][2]
    assert "ADMIN_CONSOLE_URL" in caplog.text
