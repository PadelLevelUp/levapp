"""PAD-645 — auth.login rule 13, criterion "No route accepts an empty password".

The server-rendered `/auth/` blueprint (index, register, login, logout) took a password with no
empty-password guard, so an account whose stored hash was hash("") opened a session with "".
It is deleted together with Flask-Login, which only it used, and the `backend_app` table of the
retired editor (PAD-550) is dropped.
"""
import pathlib
import re

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

BACKEND = pathlib.Path(__file__).resolve().parents[2]
FLASK_LOGIN_IMPORT = re.compile(r"^\s*(from|import)\s+flask_login\b", re.M)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _empty_password_user(app):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name="Ana", username="ana645", email="ana645@example.com",
                    password=generate_password_hash(""), status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()


@pytest.mark.parametrize("path", ["/auth/", "/auth/login", "/auth/register", "/auth/logout"])
def test_the_legacy_auth_routes_are_gone(app, client, path):
    _empty_password_user(app)

    res = client.post(path, data={"username": "ana645", "password": ""})

    assert res.status_code == 404, (path, res.status_code)


def test_the_api_login_refuses_an_empty_password(app, client):
    _empty_password_user(app)

    res = client.post("/api/auth/login", json={"username": "ana645", "password": ""})

    assert res.status_code == 400
    assert "accessToken" not in (res.get_json() or {})


def test_no_blueprint_registers_under_auth(app):
    assert "auth" not in app.blueprints
    legacy = [r.rule for r in app.url_map.iter_rules() if r.rule == "/auth" or r.rule.startswith("/auth/")]
    assert legacy == []


def test_flask_login_is_gone(app):
    assert not hasattr(app, "login_manager")
    importers = [
        str(path.relative_to(BACKEND))
        for path in (BACKEND / "padel_app").rglob("*.py")
        if FLASK_LOGIN_IMPORT.search(path.read_text(encoding="utf-8"))
    ]
    assert importers == []
    assert "flask-login" not in (BACKEND / "pyproject.toml").read_text(encoding="utf-8").lower()


def test_the_legacy_templates_are_gone():
    templates = BACKEND / "padel_app" / "templates"
    assert not templates.exists() or not any(templates.rglob("*.html"))


def test_backend_app_is_not_a_model(app):
    from padel_app import models

    assert "backend_app" not in db.metadata.tables
    assert not hasattr(models, "Backend_App")
