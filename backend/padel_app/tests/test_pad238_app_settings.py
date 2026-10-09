"""
PAD-238 item 3, shipped by PAD-279 — the coach-approval gate is an app setting
(auth.coach-approval rule 9 and the criterion "Admin switches the approval gate
off and on"): an `app_settings` row wins, the env flag is the fallback, the
superadmin reads and flips it over the API, nobody else can, and flipping it
never touches an existing coach.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app, username, *, superadmin=False, coach=False):
    from padel_app.models import Coach, User

    with app.app_context():
        user = User(name=username.title(), username=username, email=f"{username}@t.test",
                    password="pw", status="active", is_superadmin=superadmin)
        db.session.add(user)
        db.session.flush()
        if coach:
            db.session.add(Coach(user_id=user.id, approval_status="approved"))
        db.session.commit()
        return {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}, user.id


def _console(app, user_id=None, role="operator"):
    """Bearer headers for a staff-console session (admin token) on a role row linked to `user_id`."""
    from padel_app.models.admin_role import AdminRole
    from padel_app.tests.admin_helpers import admin_token, bearer, make_role

    email = f"console-{role}-{user_id or 0}@levapp.app"
    with app.app_context():
        row = AdminRole.query.filter_by(email=email).first()
        role_id = row.id if row else None
    if role_id is None:
        role_id = make_role(app, email, role, user_id=user_id)
    return bearer(admin_token(app, role_id))


def _register_coach(client, username):
    res = client.post("/api/auth/register", json={
        "role": "coach", "name": "Rui Costa", "username": username,
        "email": f"{username}@example.com", "password": "Segura123",
        "birthDate": "2000-01-01", "country": "PT",
    })
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def test_the_env_flag_is_the_fallback_when_no_row_exists(app):
    from padel_app.services.app_settings_service import (
        admin_settings_payload,
        coach_approval_required,
    )

    with app.app_context():
        app.config["COACH_APPROVAL_REQUIRED"] = True
        assert coach_approval_required() is True
        assert admin_settings_payload() == {"coachApprovalRequired": True, "source": "environment"}
        app.config["COACH_APPROVAL_REQUIRED"] = False
        assert coach_approval_required() is False


def test_a_stored_row_wins_over_the_env_flag(app):
    from padel_app.models import AppSetting
    from padel_app.services.app_settings_service import (
        admin_settings_payload,
        coach_approval_required,
        set_coach_approval_required,
    )

    with app.app_context():
        app.config["COACH_APPROVAL_REQUIRED"] = True
        set_coach_approval_required(False, updated_by_user_id=None)
        assert coach_approval_required() is False
        assert admin_settings_payload() == {"coachApprovalRequired": False, "source": "database"}
        row = db.session.get(AppSetting, "coach_approval_required")
        assert row is not None and row.value is False and row.updated_at is not None
        # Idempotent: setting the same value again is a no-op that still answers.
        set_coach_approval_required(False, updated_by_user_id=None)
        assert coach_approval_required() is False
        # A stored value that is not a boolean is treated as unset.
        row.value = "maybe"
        db.session.commit()
        assert coach_approval_required() is True
        assert admin_settings_payload()["source"] == "environment"


def test_registration_honours_the_stored_setting(client, app):
    from padel_app.models import Coach
    from padel_app.services.app_settings_service import set_coach_approval_required

    app.config["COACH_APPROVAL_REQUIRED"] = True
    with app.app_context():
        set_coach_approval_required(False, updated_by_user_id=None)
    _register_coach(client, "rui_off")
    with app.app_context():
        assert Coach.query.join(Coach.user).filter_by(username="rui_off").one().approval_status == "approved"
        set_coach_approval_required(True, updated_by_user_id=None)
    _register_coach(client, "rui_on")
    with app.app_context():
        assert Coach.query.join(Coach.user).filter_by(username="rui_on").one().approval_status == "pending"
        # Flipping the gate never rewrites an existing coach.
        assert Coach.query.join(Coach.user).filter_by(username="rui_off").one().approval_status == "approved"


def test_operator_reads_and_flips_the_setting_over_the_console(client, app):
    _, admin_id = _user(app, "admin", superadmin=True)
    operator = _console(app, admin_id)
    app.config["COACH_APPROVAL_REQUIRED"] = True
    url = "/admin/api/settings/coach-approval"

    res = client.get(url, headers=operator)
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"coachApprovalRequired": True, "source": "environment"}

    res = client.put(url, headers=operator, json={"coachApprovalRequired": False})
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"coachApprovalRequired": False, "source": "database"}
    assert client.get(url, headers=operator).get_json()["coachApprovalRequired"] is False

    with app.app_context():
        from padel_app.models import AppSetting
        assert db.session.get(AppSetting, "coach_approval_required").updated_by_user_id == admin_id

    res = client.put(url, headers=operator, json={"coachApprovalRequired": "no"})
    assert res.status_code == 400
    assert res.get_json() == {"error": "COACH_APPROVAL_REQUIRED_MUST_BE_BOOLEAN"}

    res = client.put(url, headers=operator, json={"coachApprovalRequired": True})
    assert res.status_code == 200 and res.get_json()["coachApprovalRequired"] is True


def test_a_support_role_reads_but_cannot_flip_and_the_product_route_is_gone(client, app):
    product, user_id = _user(app, "joao", coach=True)
    url = "/admin/api/settings/coach-approval"
    support = _console(app, user_id, role="support")
    assert client.get(url, headers=support).status_code == 200
    assert client.put(url, headers=support, json={"coachApprovalRequired": False}).status_code == 403
    assert client.get(url).status_code == 401
    # PAD-532: the old product routes answer 404, for a coach and for the settings alike.
    assert client.get("/api/app/admin/settings", headers=product).status_code == 404
    assert client.put("/api/app/admin/settings", headers=product,
                      json={"coachApprovalRequired": False}).status_code == 404
