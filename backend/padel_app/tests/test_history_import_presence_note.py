"""History import D4 — attendance.presence rule 11: `presences.note`.

A private nullable note per student per occurrence. The onboarding import writes it; nothing reads
it and no payload carries it yet. Criteria ATTENDANCE-PRESENCE-8 and 9.
"""
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad271_presence_response import PATCHES, _presence, _world


@pytest.mark.criterion("ATTENDANCE-PRESENCE-8")
def test_a_presence_stores_a_note_and_defaults_to_none(app):
    """[ATTENDANCE-PRESENCE-8] Stored as given (trimmed), null by default, blank is null, capped at 1000."""
    ids = _world(app)
    with app.app_context():
        p = _presence(ids)
        assert p.note is None
        p.note = "  chegou atrasado "
        db.session.commit()
        assert _presence(ids).note == "chegou atrasado"
        p.note = "   "
        db.session.commit()
        assert _presence(ids).note is None
        p.note = "x" * 1500
        db.session.commit()
        assert len(_presence(ids).note) == 1000


@pytest.mark.criterion("ATTENDANCE-PRESENCE-9")
def test_marking_clearing_and_answering_leave_the_note_and_no_payload_carries_it(app):
    """[ATTENDANCE-PRESENCE-9] The coach's mark, the clear and the student's answer never touch it."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.serializers.presence import serialize_presence
    from padel_app.services.lesson_service import add_presences
    from padel_app.services.notification_service import respond_to_reminder

    ids = _world(app)
    with app.app_context():
        p = _presence(ids)
        p.note = "observação"
        db.session.commit()
        instance = LessonInstance.query.get(ids["instance_id"])
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(ids["instance_id"], "yes", ids["alice_user"])
            assert _presence(ids).note == "observação"
            add_presences(instance, [{"playerId": ids["alice"], "status": "present"}])
            assert _presence(ids).note == "observação"
            add_presences(instance, [{"playerId": ids["alice"], "status": "absent", "justification": "justified"}])
            assert _presence(ids).note == "observação"
            add_presences(instance, [{"playerId": ids["alice"], "clear": True}])
        db.session.commit()
        assert _presence(ids).note == "observação"
        assert "note" not in serialize_presence(_presence(ids))


@pytest.mark.criterion("ATTENDANCE-PRESENCE-8")
def test_the_note_migration_parents_on_the_setup_guide_migration():
    """[ATTENDANCE-PRESENCE-8] The note column's migration follows staging's 3696b022341c: one chain, one head."""
    from pathlib import Path

    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "migrations"))
    assert ScriptDirectory.from_config(cfg).get_revision("32e30677a843").down_revision == "3696b022341c"
