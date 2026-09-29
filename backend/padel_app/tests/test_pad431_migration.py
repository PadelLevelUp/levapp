"""PAD-431 migration (evaluations.competencies Notes, D2; criterion "Existing technique and tactics
rows are placed under their category"): `evaluation_categories.parent_id` (self-FK, ON DELETE
CASCADE), backfilled per coach — each `technique` / `tactics` group row goes under the coach's row
keyed `technique` / `tactics`, created (active iff a sub-category is) when missing, unless the coach
already holds a row of that name. `general`, `custom` and legacy rows stay top-level; no name,
scale, flag or score changes. Every DDL guarded, so a second run changes nothing. Downgrade drops
the column.

Postgres only, like test_pad423_scale_migration.py: the sqlite backend builds its schema with
`create_all` and never walks a revision. Seeded with raw SQL at the parent revision. The session is
released before every Alembic call, and the `finally` returns the database to head.
"""
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "149faa7df297"  # PAD-423
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")


def _release():
    db.session.commit()
    db.session.remove()


def _cols(table):
    return {
        r[0]
        for r in db.session.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"), {"t": table}
        )
    }


def _coach(username):
    from padel_app.models import Coach, User

    user = User(name=username, username=username, email=f"{username}@t.test", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    db.session.add(coach)
    db.session.flush()
    return coach.id


def _row(coach_id, name, key, group, active=True):
    return db.session.execute(text(
        "INSERT INTO evaluation_categories (coach_id, name, scale_min, scale_max, catalogue_key, competency_group, "
        "is_active, created_at, updated_at) VALUES (:c, :n, 1, 5, :k, :g, :a, now(), now()) RETURNING id"
    ), {"c": coach_id, "n": name, "k": key, "g": group, "a": active}).scalar()


def _snapshot():
    return db.session.execute(text(
        "SELECT id, name, scale_min, scale_max, catalogue_key, competency_group, is_active "
        "FROM evaluation_categories WHERE coach_id IN (SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id "
        "WHERE u.username LIKE 'p431m_%') ORDER BY id"
    )).all()


def test_the_migration_places_sub_level_rows_under_their_category(app):
    from flask_migrate import downgrade, upgrade

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "parent_id" not in _cols("evaluation_categories")
            _release()

            # Carla: Víbora and Smash (technique group, Smash off), no Técnica row; Tática and one of its
            # entries; a custom row and a legacy row.
            carla = _coach("p431m_carla")
            vibora = _row(carla, "Víbora", "vibora", "technique")
            smash = _row(carla, "Smash", "smash", "technique", active=False)
            tactics = _row(carla, "Tática", "tactics", "general")
            transition = _row(carla, "Transição", "transition", "tactics")
            custom = _row(carla, "Saque cruzado", None, "custom")
            legacy = _row(carla, "Resistência", None, None)
            # Dora: only Bandeja, but a legacy row already named "Técnica" — no Técnica row can be made.
            dora = _coach("p431m_dora")
            dora_legacy = _row(dora, "Técnica", None, None)
            bandeja = _row(dora, "Bandeja", "bandeja", "technique")
            # Eva: only a switched-off Serviço — her created Técnica is off too.
            eva = _coach("p431m_eva")
            serve = _row(eva, "Serviço", "serve", "technique", active=False)
            _release()
            before = _snapshot()
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            assert "parent_id" in _cols("evaluation_categories")

            def parent(row_id):
                return db.session.execute(text("SELECT parent_id FROM evaluation_categories WHERE id = :i"),
                                          {"i": row_id}).scalar()

            def technique_row(coach_id):
                return db.session.execute(text(
                    "SELECT id, is_active, parent_id, competency_group, name FROM evaluation_categories "
                    "WHERE coach_id = :c AND catalogue_key = 'technique'"
                ), {"c": coach_id}).first()

            carla_technique = technique_row(carla)
            assert carla_technique is not None and carla_technique[1:] == (True, None, "general", "Técnica")
            assert parent(vibora) == parent(smash) == carla_technique[0]
            assert parent(transition) == tactics
            assert parent(tactics) is None and parent(custom) is None and parent(legacy) is None

            assert technique_row(dora) is None  # the name is taken: nothing created, Bandeja stays top-level
            assert parent(bandeja) is None and parent(dora_legacy) is None

            eva_technique = technique_row(eva)
            assert eva_technique is not None and eva_technique[1] is False and parent(serve) == eva_technique[0]

            # No existing row changed; the only new rows are the two Técnica rows.
            after = _snapshot()
            assert [r for r in after if r[0] in {r0[0] for r0 in before}] == before
            assert len(after) == len(before) + 2
            _release()

            # A second run is a no-op.
            upgrade(directory=MIGRATIONS_DIR)
            assert len(_snapshot()) == len(after)
            _release()

            # Down: the column goes; the rows the migration created stay (ordinary catalogue rows).
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "parent_id" not in _cols("evaluation_categories")
            assert len(_snapshot()) == len(after)
            _release()
        finally:
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            db.session.execute(text(
                "DELETE FROM coaches WHERE id IN (SELECT c.id FROM coaches c JOIN users u ON u.id = c.user_id "
                "WHERE u.username LIKE 'p431m_%')"
            ))
            db.session.execute(text("DELETE FROM users WHERE username LIKE 'p431m_%'"))
            _release()
