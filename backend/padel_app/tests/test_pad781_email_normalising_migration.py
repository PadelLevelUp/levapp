"""PAD-781 — revision 13395db9fee4 rewrites stored emails to their normalised form (auth.password-recovery
rule 12): idempotent and never colliding. Since PAD-796 its downgrade is a no-op (the originals it kept are
dropped by f796ea7e680b; see test_pad796_drop_email_originals.py)."""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

_PATH = Path(__file__).resolve().parents[2] / "migrations/versions/13395db9fee4_pad781_normalise_stored_emails.py"


@pytest.fixture
def migration():
    spec = importlib.util.spec_from_file_location("pad781_migration", _PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ROWS = {
    "padded": "  Padded@Example.COM ",
    "case_only": "Case.Only@Example.com",
    "taken_upper": "Taken@Example.com",  # its normalised form is held by "taken_lower"
    "taken_lower": "taken@example.com",
    "normal": "normal@example.com",
    "blank": "   ",
    "none": None,
}


@pytest.fixture
def users(app):
    from padel_app.models import User

    with app.app_context():
        ids = {}
        for key, email in ROWS.items():
            user = User(name=key, username=f"u781_{key}", email=email,
                        password=generate_password_hash("Secret123!"), status="active")
            db.session.add(user)
            db.session.flush()
            ids[key] = user.id
        db.session.commit()
        db.session.remove()
        return ids


def _emails(app, ids):
    with app.app_context():
        rows = db.session.execute(sa.text("SELECT id, email FROM users")).all()
        db.session.remove()
    by_id = dict(rows)
    return {key: by_id[pk] for key, pk in ids.items()}


def _run(app, fn):
    with app.app_context():
        db.session.remove()
        with db.engine.begin() as conn:
            return fn(conn)


def test_upgrade_normalises_the_rows_that_differ_and_nothing_else(app, users, migration):
    assert _run(app, migration.normalise) == 2

    assert _emails(app, users) == {
        "padded": "padded@example.com",
        "case_only": "case.only@example.com",
        "taken_upper": "Taken@Example.com",  # left: another account holds taken@example.com
        "taken_lower": "taken@example.com",
        "normal": "normal@example.com",
        "blank": "   ",
        "none": None,
    }


def test_a_second_upgrade_changes_nothing(app, users, migration):
    _run(app, migration.normalise)
    after_first = _emails(app, users)

    assert _run(app, migration.normalise) == 0
    assert _emails(app, users) == after_first


@pytest.mark.criterion("AUTH-PASSWORD-RECOVERY-28")
def test_the_downgrade_changes_nothing(app, users, migration):
    _run(app, migration.normalise)
    after_upgrade = _emails(app, users)

    migration.downgrade()  # a no-op: it never reaches the database

    assert not hasattr(migration, "restore")
    assert _emails(app, users) == after_upgrade
