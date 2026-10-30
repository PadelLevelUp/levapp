"""PAD-781 — revision 13395db9fee4 rewrites stored emails to their normalised form (auth.password-recovery
rule 12): idempotent, never colliding, and reversible through the originals it keeps."""
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


def test_the_downgrade_puts_every_original_back_and_drops_its_table(app, users, migration):
    _run(app, migration.normalise)

    assert _run(app, migration.restore) == 2
    assert _emails(app, users) == ROWS
    with app.app_context():
        assert migration.ORIGINALS not in sa.inspect(db.engine).get_table_names()


def test_the_downgrade_leaves_an_address_changed_since_the_upgrade(app, users, migration):
    _run(app, migration.normalise)
    with app.app_context():
        db.session.execute(sa.text("UPDATE users SET email = 'moved@example.com' WHERE id = :id"),
                           {"id": users["padded"]})
        db.session.commit()

    assert _run(app, migration.restore) == 1
    emails = _emails(app, users)
    assert emails["padded"] == "moved@example.com"
    assert emails["case_only"] == ROWS["case_only"]


def test_autogenerate_never_proposes_dropping_the_originals_table():
    from padel_app.tools.alembic_filters import include_object

    assert include_object(None, "pad781_email_originals", "table", True, None) is False
