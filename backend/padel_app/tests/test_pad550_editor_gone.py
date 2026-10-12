"""PAD-550 — admin.approvals-and-users rule 10c, criterion "The editor is gone".

The generic editor (the `/editor` pages, `/api/editor/*` and the legacy `/api/<crud>`
routes), its `EDITOR_ENABLED` switch and the `MODELS` registry are deleted. The test app
carries no editor config at all, so a 404 here is the route being absent, not gated.
"""
import ast
import pathlib

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _superadmin_headers(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="root", username="root550", password="x", status="active", is_superadmin=True)
        db.session.add(user)
        db.session.commit()
        return {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}


@pytest.mark.parametrize("path", ["/editor/", "/api/editor/models", "/api/query/user"])
def test_the_editor_routes_are_gone(app, client, path):
    res = client.get(path, headers=_superadmin_headers(app))

    assert res.status_code == 404, (path, res.status_code)


def test_no_url_rule_names_the_editor_or_the_crud_api(app):
    rules = [rule.rule for rule in app.url_map.iter_rules()]

    assert not [r for r in rules if r.startswith(("/editor", "/api/editor", "/api/create/", "/api/edit/", "/api/delete/"))]


def test_the_root_answers_json_not_a_redirect_to_the_editor(client):
    res = client.get("/")

    assert res.status_code == 200
    assert res.get_json() == {"service": "levapp-api"}


def test_the_editor_switch_is_gone_from_the_config_module():
    import padel_app.config as config

    assert not hasattr(config, "editor_enabled_from_env")
    assert not hasattr(config.Config, "EDITOR_ENABLED_DEFAULT")


def test_the_modules_package_names_no_editor_blueprint():
    import padel_app.modules as modules

    source = pathlib.Path(modules.__file__).read_text()
    names = {alias.name for node in ast.walk(ast.parse(source)) if isinstance(node, ast.ImportFrom) for alias in node.names}

    assert not names & {"api", "editor", "editor_api"}
    assert not {"api", "editor", "editor_api"} & set(modules.__all__)
    for gone in ("api", "editor", "editor_api"):
        assert not (pathlib.Path(modules.__file__).parent / f"{gone}.py").exists()


def test_the_models_package_has_no_registry():
    import padel_app.models as models

    assert not hasattr(models, "MODELS")
