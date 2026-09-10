"""auth.coach-approval — LevApp admin approves self-registered coaches (PAD-210)."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _make_user(app, username, *, superadmin=False, email=None):
    from padel_app.models import User

    with app.app_context():
        user = User(
            name=username.title(),
            username=username,
            email=email,
            password="pw",
            status="active",
            is_superadmin=superadmin,
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _make_coach(app, username, *, status=None, email=None):
    from padel_app.models import Coach

    user_id = _make_user(app, username, email=email)
    with app.app_context():
        coach = Coach(user_id=user_id) if status is None else Coach(user_id=user_id, approval_status=status)
        db.session.add(coach)
        db.session.commit()
        return user_id, coach.id


def _register_coach(client, username="rui", email="rui@example.com"):
    res = client.post(
        "/api/auth/register",
        json={
            "role": "coach",
            "name": "Rui Costa",
            "username": username,
            "email": email,
            "password": "Segura123",
        },
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()


# --- Existing coaches are approved by the migration / ORM default ---------

def test_existing_creation_paths_yield_approved_coaches(app):
    """The ORM default is `approved`: every path other than self-registration
    (invitation accept, editor, tests) represents a coach somebody vouched for.
    The Alembic migration backfills pre-existing rows to `approved` too
    (`UPDATE coaches SET approval_status='approved'` in a9c1e2d3f4b5)."""
    from padel_app.models import Coach

    _, coach_id = _make_coach(app, "legacy1")
    _, coach_id2 = _make_coach(app, "legacy2")
    with app.app_context():
        assert Coach.query.get(coach_id).approval_status == "approved"
        assert Coach.query.get(coach_id2).approval_status == "approved"


def test_migration_backfills_existing_coaches_to_approved():
    import importlib.util, pathlib

    path = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions" / "a9c1e2d3f4b5_add_coach_approval.py"
    src = path.read_text()
    assert "UPDATE coaches SET approval_status = 'approved'" in src
    assert "server_default='pending'" in src
    assert "down_revision = 'f1a2b3c4d5e6'" in src


# --- Superadmin lists and approves a pending coach -------------------------

def test_superadmin_lists_and_approves_pending_coach(client, app):
    from padel_app.models import Coach, User

    _register_coach(client)
    admin_id = _make_user(app, "admin", superadmin=True)

    res = client.get("/api/app/admin/coach-approvals", headers=_auth(app, admin_id))
    assert res.status_code == 200
    rows = res.get_json()
    assert len(rows) == 1
    row = rows[0]
    assert row["username"] == "rui"
    assert row["name"] == "Rui Costa"
    assert row["email"] == "rui@example.com"
    assert row["requestedAt"]
    coach_id = row["coachId"]

    res = client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id))
    assert res.status_code == 200
    assert res.get_json()["approvalStatus"] == "approved"

    with app.app_context():
        coach = Coach.query.get(coach_id)
        assert coach.approval_status == "approved"
        assert coach.approved_by_user_id == admin_id
        assert coach.approved_at is not None
        rui_id = User.query.filter_by(username="rui").first().id
        me = client.get("/api/auth/me", headers=_auth(app, rui_id)).get_json()
    assert me["coachApproval"] == "approved"

    # list is now empty; approving again is idempotent
    assert client.get("/api/app/admin/coach-approvals", headers=_auth(app, admin_id)).get_json() == []
    assert client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id)).status_code == 200


def test_pending_list_is_oldest_first(client, app):
    admin_id = _make_user(app, "admin", superadmin=True)
    _register_coach(client, "first", "first@example.com")
    _register_coach(client, "second", "second@example.com")
    rows = client.get("/api/app/admin/coach-approvals", headers=_auth(app, admin_id)).get_json()
    assert [r["username"] for r in rows] == ["first", "second"]


# --- Rejection stores the reason and blocks the coach ----------------------

def test_rejection_stores_reason_and_blocks_coach(client, app):
    from padel_app.models import Coach, User

    _register_coach(client)
    admin_id = _make_user(app, "admin", superadmin=True)
    with app.app_context():
        coach = Coach.query.first()
        coach_id, rui_id = coach.id, coach.user_id

    res = client.post(
        f"/api/app/admin/coach-approvals/{coach_id}/reject",
        json={"reason": "not a coach"},
        headers=_auth(app, admin_id),
    )
    assert res.status_code == 200
    with app.app_context():
        coach = Coach.query.get(coach_id)
        assert coach.approval_status == "rejected"
        assert coach.rejection_reason == "not a coach"

    # PAD-233 rule 10: rejection disables the login, so every token of the
    # coach is dead — 401 rather than the pre-PAD-233 403 COACH_NOT_APPROVED.
    res = client.post("/api/app/club", json={"name": "Rui Padel"}, headers=_auth(app, rui_id))
    assert res.status_code == 401
    with app.app_context():
        assert User.query.get(rui_id).status == "disabled"

    # deciding a non-pending coach the other way is 410
    assert client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id)).status_code == 410
    assert client.get("/api/auth/me", headers=_auth(app, rui_id)).status_code == 401


# --- Ordinary coach cannot approve ------------------------------------------

def test_ordinary_coach_cannot_approve(client, app):
    from padel_app.models import Coach

    _register_coach(client)
    maria_id, _ = _make_coach(app, "maria", status="approved")
    with app.app_context():
        coach_id = Coach.query.filter_by(approval_status="pending").first().id

    assert client.get("/api/app/admin/coach-approvals", headers=_auth(app, maria_id)).status_code == 403
    assert client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, maria_id)).status_code == 403
    with app.app_context():
        assert Coach.query.get(coach_id).approval_status == "pending"


def test_student_cannot_approve(client, app):
    from padel_app.models import Player

    _register_coach(client)
    student_id = _make_user(app, "student1")
    with app.app_context():
        db.session.add(Player(user_id=student_id))
        db.session.commit()
    assert client.get("/api/app/admin/coach-approvals", headers=_auth(app, student_id)).status_code == 403


# --- Invited coach is approved at creation ---------------------------------

def test_invited_coach_is_approved_at_creation(client, app):
    from datetime import datetime, timedelta

    from padel_app.models import Association_CoachClub, Club, Coach, CoachInvitation, User

    inviter_id, inviter_coach_id = _make_coach(app, "inviter")
    with app.app_context():
        club = Club(name="Inviting Club")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=inviter_coach_id, club_id=club.id))
        inv = CoachInvitation(
            club_id=club.id,
            token="tok-approve-me",
            invited_by_coach_id=inviter_coach_id,
            status="pending",
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.session.add(inv)
        db.session.commit()

    res = client.post(
        "/api/app/coach-invitations/tok-approve-me/accept",
        json={"name": "New Coach", "username": "newcoach", "password": "pw123456"},
    )
    assert res.status_code in (200, 201), res.get_json()
    with app.app_context():
        user = User.query.filter_by(username="newcoach").first()
        assert Coach.query.filter_by(user_id=user.id).first().approval_status == "approved"


# --- Pending coach keeps per-user access -----------------------------------

def test_pending_coach_keeps_per_user_access(client, app):
    from padel_app.models import User

    _register_coach(client)
    with app.app_context():
        rui_id = User.query.filter_by(username="rui").first().id
    assert client.get("/api/auth/me", headers=_auth(app, rui_id)).status_code == 200
    res = client.patch("/api/auth/me", json={"language": "en"}, headers=_auth(app, rui_id))
    assert res.status_code == 200
    assert res.get_json()["language"] == "en"


# --- Approval email is best-effort -----------------------------------------

def test_approval_email_is_best_effort(client, app, monkeypatch):
    from padel_app.models import Coach
    from padel_app.tools import email_tools

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", boom)
    _register_coach(client)  # signup survives a failing admin mail too
    admin_id = _make_user(app, "admin", superadmin=True)
    with app.app_context():
        coach_id = Coach.query.first().id
    res = client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id))
    assert res.status_code == 200
    with app.app_context():
        assert Coach.query.get(coach_id).approval_status == "approved"


def test_admin_notified_on_signup_only_when_configured(client, app, monkeypatch):
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email", lambda subject, recipients, body=None, html=None: sent.append(recipients))

    # PAD-234: signup also mails the coach their verification code, so only
    # the admin's recipient list is what this test is about.
    admin_mail = lambda: [r for r in sent if r == ["admin@levapp.app"]]  # noqa: E731

    app.config["ADMIN_NOTIFY_EMAIL"] = None
    _register_coach(client, "one", "one@example.com")
    assert admin_mail() == []

    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    _register_coach(client, "two", "two@example.com")
    assert admin_mail() == [["admin@levapp.app"]]


def test_coach_is_emailed_on_approval(client, app, monkeypatch):
    from padel_app.models import Coach
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email", lambda subject, recipients, body=None, html=None: sent.append(recipients))
    _register_coach(client)
    admin_id = _make_user(app, "admin", superadmin=True)
    with app.app_context():
        coach_id = Coach.query.first().id
    client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id))
    assert ["rui@example.com"] in sent


# --- NO_CLUB: approved coach without a club gets 409, never 500 ------------

def test_approved_coach_without_club_gets_409_no_club(client, app):
    rui_id, _ = _make_coach(app, "rui", status="approved")
    res = client.post("/api/app/add_player", json={"name": "X"}, headers=_auth(app, rui_id))
    assert res.status_code == 409
    assert res.get_json()["error"] == "NO_CLUB"
    res = client.get("/api/app/players", headers=_auth(app, rui_id))
    assert res.status_code == 409


def test_approved_coach_creates_a_club(client, app):
    from padel_app.models import Association_CoachClub, Club

    rui_id, coach_id = _make_coach(app, "rui", status="approved")
    res = client.post("/api/app/club", json={"name": "Rui Padel", "location": "Porto"}, headers=_auth(app, rui_id))
    assert res.status_code == 201, res.get_json()
    with app.app_context():
        club = Club.query.filter_by(name="Rui Padel").first()
        assert club is not None
        assert Association_CoachClub.query.filter_by(coach_id=coach_id, club_id=club.id).count() == 1
        me = client.get("/api/auth/me", headers=_auth(app, rui_id)).get_json()
    assert me["clubs"] == [{"id": club.id, "name": "Rui Padel"}]


# --- Approval email is branded and in the coach's language (PAD-234) --------

def test_approval_email_is_branded_and_localised(client, app, monkeypatch):
    from padel_app.models import Coach, User
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(
        email_tools,
        "send_email",
        lambda subject, recipients, body=None, html=None: sent.append((subject, recipients, body, html)),
    )
    app.config["PUBLIC_WEB_ORIGIN"] = "https://staging.levapp.app"
    admin_id = _make_user(app, "admin", superadmin=True)
    _register_coach(client)
    sent.clear()  # drop the verification-code mail

    with app.app_context():
        rui = User.query.filter_by(username="rui").first()
        rui.language = "pt"
        db.session.commit()
        coach_id = rui.coach.id
    res = client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id))
    assert res.status_code == 200
    assert len(sent) == 1
    subject, recipients, body, html = sent[0]
    assert recipients == ["rui@example.com"]
    assert subject == "A tua conta de treinador foi aprovada"
    assert "LevApp" in html and "https://staging.levapp.app" in html
    assert body and "https://staging.levapp.app" in body

    # English coach, English mail.
    _register_coach(client, username="john", email="john@example.com")
    sent.clear()
    with app.app_context():
        john = User.query.filter_by(username="john").first()
        john.language = "en"
        db.session.commit()
        john_coach_id = john.coach.id
    client.post(f"/api/app/admin/coach-approvals/{john_coach_id}/approve", headers=_auth(app, admin_id))
    assert sent[0][0] == "Your coach account is approved"


# ── PAD-233: rejection disables the login; the coach can ask again ──────────

def _register_and_reject(client, app, reason="not a coach"):
    body = _register_coach(client)
    admin_id = _make_user(app, "admin", superadmin=True)
    from padel_app.models import Coach

    with app.app_context():
        coach_id = Coach.query.filter_by(user_id=body["user"]["id"]).first().id
    res = client.post(
        f"/api/app/admin/coach-approvals/{coach_id}/reject",
        json={"reason": reason},
        headers=_auth(app, admin_id),
    )
    assert res.status_code == 200, res.get_json()
    return body["user"]["id"], coach_id, admin_id


def test_rejection_disables_user_and_kills_sessions(client, app):
    body = _register_coach(client)
    token = body["accessToken"]
    hdr = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=hdr).status_code == 200
    admin_id = _make_user(app, "admin", superadmin=True)
    from padel_app.models import Coach, User

    with app.app_context():
        coach_id = Coach.query.filter_by(user_id=body["user"]["id"]).first().id
    res = client.post(f"/api/app/admin/coach-approvals/{coach_id}/reject", json={"reason": "x"},
                      headers=_auth(app, admin_id))
    assert res.status_code == 200
    with app.app_context():
        assert db.session.get(User, body["user"]["id"]).status == "disabled"
    assert client.get("/api/auth/me", headers=hdr).status_code == 401
    assert client.get("/api/auth/me", headers=_auth(app, body["user"]["id"])).status_code == 401


def test_login_tells_rejected_coach_why(client, app):
    _register_and_reject(client, app)
    res = client.post("/api/auth/login", json={"username": "rui", "password": "Segura123"})
    assert res.status_code == 403
    assert res.get_json() == {"error": "COACH_REJECTED", "reason": "not a coach"}
    assert "accessToken" not in res.get_json()
    res = client.post("/api/auth/login", json={"username": "rui", "password": "wrong"})
    assert res.status_code == 401
    assert "reason" not in res.get_json()


def test_rejected_coach_can_reapply(client, app, monkeypatch):
    from padel_app.models import Coach, User
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email",
                        lambda subject, recipients, body=None, html=None: sent.append((subject, list(recipients))) or "Sent")
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    user_id, coach_id, admin_id = _register_and_reject(client, app)
    sent.clear()

    res = client.post("/api/auth/coach-approval/reapply", json={"username": "rui", "password": "Segura123"})
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["accessToken"] and body["user"]["id"] == user_id
    with app.app_context():
        coach = db.session.get(Coach, coach_id)
        assert coach.approval_status == "pending" and coach.rejection_reason is None
        assert db.session.get(User, user_id).status == "active"
    assert [s for s in sent if s[1] == ["admin@levapp.app"]], sent
    listed = client.get("/api/app/admin/coach-approvals", headers=_auth(app, admin_id)).get_json()
    assert any(row["username"] == "rui" for row in listed)
    # The fresh token works and /me reports pending.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['accessToken']}"})
    assert me.status_code == 200 and me.get_json()["coachApproval"] == "pending"
    # Pending again → 410; wrong password → 401 and nothing changes.
    assert client.post("/api/auth/coach-approval/reapply", json={"username": "rui", "password": "Segura123"}).status_code == 410
    _register_and_reject_second = None  # noqa: F841 (readability)


def test_reapply_rejects_wrong_password_and_deleted_accounts(client, app):
    from padel_app.models import Coach, User

    user_id, coach_id, _ = _register_and_reject(client, app)
    res = client.post("/api/auth/coach-approval/reapply", json={"username": "rui", "password": "wrong"})
    assert res.status_code == 401
    with app.app_context():
        assert db.session.get(Coach, coach_id).approval_status == "rejected"
        # A deleted account (email cleared) cannot be resurrected through re-application.
        user = db.session.get(User, user_id)
        user.email = None
        db.session.commit()
    res = client.post("/api/auth/coach-approval/reapply", json={"username": "rui", "password": "Segura123"})
    assert res.status_code == 410
