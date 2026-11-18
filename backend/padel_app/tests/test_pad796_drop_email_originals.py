"""PAD-796 — revision f796ea7e680b drops ``pad781_email_originals``, the copies of email addresses
13395db9fee4 kept (auth.password-recovery rule 12); its downgrade is a no-op."""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

_VERSIONS = Path(__file__).resolve().parents[2] / "migrations/versions"


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, _VERSIONS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def pad781():
    return _load("pad781_migration", "13395db9fee4_pad781_normalise_stored_emails.py")


@pytest.fixture
def pad796():
    return _load("pad796_migration", "f796ea7e680b_pad796_drop_email_originals.py")


def _run(app, fn):
    with app.app_context():
        db.session.remove()
        with db.engine.begin() as conn:
            return fn(conn)


def _tables(app):
    with app.app_context():
        return set(sa.inspect(db.engine).get_table_names())


def _emails(app):
    with app.app_context():
        rows = db.session.execute(sa.text("SELECT id, email FROM users")).all()
        db.session.remove()
    return dict(rows)


@pytest.fixture
def users(app):
    from padel_app.models import User

    with app.app_context():
        for key, email in {"padded": "  Padded@Example.COM ", "normal": "normal@example.com"}.items():
            db.session.add(User(name=key, username=f"u796_{key}", email=email,
                                password=generate_password_hash("Secret123!"), status="active"))
        db.session.commit()
        db.session.remove()


@pytest.mark.criterion("AUTH-PASSWORD-RECOVERY-29")
def test_the_upgrade_drops_the_originals_and_keeps_the_normalised_rows(app, users, pad781, pad796):
    assert _run(app, pad781.normalise) == 1
    assert pad796.ORIGINALS in _tables(app)
    normalised = _emails(app)

    _run(app, pad796.drop)

    assert pad796.ORIGINALS not in _tables(app)
    assert _emails(app) == normalised
    assert "padded@example.com" in normalised.values()


@pytest.mark.criterion("AUTH-PASSWORD-RECOVERY-29")
def test_the_downgrade_changes_nothing_and_the_upgrade_runs_again(app, users, pad781, pad796):
    _run(app, pad781.normalise)
    _run(app, pad796.drop)
    before = _emails(app)

    pad796.downgrade()  # a no-op: it never reaches the database
    _run(app, pad796.drop)  # a second upgrade, the table already gone

    assert pad796.ORIGINALS not in _tables(app)
    assert _emails(app) == before
    assert pad796.down_revision == "56e434e584d3"


@pytest.mark.criterion("AUTH-PASSWORD-RECOVERY-29")
def test_autogenerate_no_longer_treats_the_originals_table_as_external():
    from padel_app.tools.alembic_filters import EXTERNAL_TABLES, include_object

    assert "pad781_email_originals" not in EXTERNAL_TABLES
    assert include_object(None, "pad781_email_originals", "table", True, None) is True
