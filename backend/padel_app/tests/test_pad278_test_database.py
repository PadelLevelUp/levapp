"""PAD-278 (audit M20, compass R-026) — the test database enforces foreign keys.

Before PAD-278 the suite ran on SQLite with foreign-key enforcement off, so
every `ondelete` in the models was inert and a row pointing at nothing was
accepted. These tests hold on both backends (`LEVAPP_TEST_DB=sqlite|postgres`);
they only use the shared `app` fixture.
"""
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db
from padel_app.tests.helpers import make_coach


def test_a_row_pointing_at_nothing_is_refused(app):
    from padel_app.models import CoachLevel

    with app.app_context():
        db.session.add(CoachLevel(coach_id=999999, label="Ghost", code="G1", display_order=1))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
        assert CoachLevel.query.count() == 0


def test_the_database_runs_ondelete_itself(app):
    """A raw DELETE bypasses the ORM entirely, so only the database's own
    `ON DELETE CASCADE` (coach_levels.coach_id) can remove the child row."""
    from padel_app.models import CoachLevel

    coach_id = make_coach(app)
    with app.app_context():
        db.session.add(CoachLevel(coach_id=coach_id, label="Beginner", code="B1", display_order=1))
        db.session.commit()
        assert CoachLevel.query.filter_by(coach_id=coach_id).count() == 1

        db.session.execute(text("DELETE FROM coaches WHERE id = :id"), {"id": coach_id})
        db.session.commit()
        db.session.expire_all()

        assert CoachLevel.query.filter_by(coach_id=coach_id).count() == 0
