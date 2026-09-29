"""PAD-403 — what only a real database can prove about migration e25428020888
(evaluations.legacy-conversion rules 2, 3 and 6): the real Alembic revision walks
up -> down -> up on Postgres. The converted values are exact; the originals are
kept exactly (FLOAT, so 8.5 survives); the downgrade restores every row; a share
snapshot is never touched; and figures read after the conversion (the evolution
series) come from the converted stars.

Postgres only: the sqlite backend builds its schema with ``create_all`` (the rules
themselves are walked on scratch SQLite in test_pad403_migration). This mirrors
test_pad363_migration_postgres: rows are seeded with raw SQL at the parent revision,
and the ORM session is released before every Alembic call, because a connection
left idle in a transaction blocks the DDL.
"""
import json
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "2240837cb663"
REVISION = "e25428020888"
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")

ENTRIES = (
    "SELECT count(*) AS n, md5(string_agg(id::text || '|' || score::text || '|' || evaluated_at::text || '|' || "
    "category_id::text, ',' ORDER BY id)) AS digest FROM evaluation_entries"
)
CATEGORIES = (
    "SELECT md5(string_agg(id::text || '|' || coalesce(scale_min::text, '-') || '|' || "
    "coalesce(scale_max::text, '-'), ',' ORDER BY id)) AS digest FROM evaluation_categories"
)
SHARES = "SELECT md5(string_agg(id::text || '|' || card::text, ',' ORDER BY id)) AS digest FROM evaluation_shares"

# (category key, score, evaluated_at): Forehand 1-10, Volley 0-10, Technique a 1-5 competency
SEED = (
    ("forehand", 7.0, "2026-07-01 10:00:00"),
    ("forehand", 9.0, "2026-08-01 10:00:00"),
    ("forehand", 8.5, "2026-09-01 10:00:00"),   # non-whole: ceil(4.25) = 5, kept exactly
    ("volley", 0.0, "2026-09-01 10:00:00"),     # the 0-10 bottom: 1 star, never 0
    ("volley", 10.0, "2026-09-02 10:00:00"),
    ("technique", 4.0, "2026-09-01 10:00:00"),  # a catalogue competency: untouched
)
CONVERTED = {7.0: 4.0, 9.0: 5.0, 8.5: 5.0, 0.0: 1.0, 10.0: 5.0}
CARD = {"categories": [{"name": "Forehand", "score": 7, "scaleMax": 10}], "note": None}


def _release():
    db.session.commit()
    db.session.remove()


def _one(sql, **params):
    return dict(db.session.execute(text(sql), params).mappings().one())


def _columns(table):
    rows = db.session.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"), {"t": table}
    )
    return {r[0] for r in rows}


def test_the_conversion_walks_up_and_down_exactly_and_never_touches_a_share(app):
    from flask_migrate import downgrade, upgrade

    from padel_app.models import Association_CoachPlayer, Coach, Player, User

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "score_before_conversion" not in _columns("evaluation_entries")

            coach_user = User(name="C", username="p403m_c", email="p403m_c@t.test", password="x", status="active")
            student_user = User(name="S", username="p403m_s", email="p403m_s@t.test", password="x", status="active")
            db.session.add_all([coach_user, student_user])
            db.session.flush()
            coach, player = Coach(user_id=coach_user.id), Player(user_id=student_user.id)
            db.session.add_all([coach, player])
            db.session.flush()
            link = Association_CoachPlayer(coach_id=coach.id, player_id=player.id)
            db.session.add(link)
            db.session.flush()
            coach_id, player_id, link_id = coach.id, player.id, link.id

            ids = {}
            for key, name, low, high, group in (
                ("forehand", "Forehand", 1, 10, None),
                ("volley", "Volley", 0, 10, None),
                ("technique", "Técnica", 1, 5, "technique"),
            ):
                ids[key] = db.session.execute(
                    text("INSERT INTO evaluation_categories (coach_id, name, scale_min, scale_max, competency_group, "
                         "is_active, created_at, updated_at) VALUES (:c, :n, :lo, :hi, :g, true, now(), now()) RETURNING id"),
                    {"c": coach_id, "n": name, "lo": low, "hi": high, "g": group},
                ).scalar()
            records = {}
            for key, score, when in SEED:
                day = when[:10]
                if day not in records:
                    records[day] = db.session.execute(
                        text("INSERT INTO evaluation_records (coach_player_id, evaluated_on, created_at, updated_at) "
                             "VALUES (:l, CAST(:d AS DATE), now(), now()) RETURNING id"), {"l": link_id, "d": day},
                    ).scalar()
                db.session.execute(
                    text("INSERT INTO evaluation_entries (coach_player_id, category_id, record_id, score, evaluated_at, "
                         "created_at, updated_at) VALUES (:l, :c, :r, :s, CAST(:w AS TIMESTAMP), now(), now())"),
                    {"l": link_id, "c": ids[key], "r": records[day], "s": score, "w": when},
                )
            # A card shared before the conversion (rule 6: the snapshot keeps the numbers it froze).
            db.session.execute(
                text("INSERT INTO evaluation_shares (record_id, shared_at, category_ids, evolution, include_note, card, "
                     "created_at, updated_at) VALUES (:r, now(), CAST(:ci AS JSON), 'none', false, CAST(:card AS JSON), now(), now())"),
                {"r": records["2026-07-01"], "ci": json.dumps([ids["forehand"]]), "card": json.dumps(CARD)},
            )
            _release()
            entries_before, categories_before, shares_before = _one(ENTRIES), _one(CATEGORIES), _one(SHARES)
            assert entries_before["n"] == len(SEED)
            _release()

            upgrade(directory=MIGRATIONS_DIR, revision=REVISION)
            rows = db.session.execute(text(
                "SELECT e.score, e.score_before_conversion, c.name FROM evaluation_entries e "
                "JOIN evaluation_categories c ON c.id = e.category_id ORDER BY e.id")).fetchall()
            for (key, score, _when), (after, before, name) in zip(SEED, rows):
                if key == "technique":
                    assert (after, before) == (score, None), f"{name}: a competency is never converted"
                else:
                    assert (after, before) == (CONVERTED[score], score), f"{name} {score}"
            scales = {r[0]: tuple(r[1:]) for r in db.session.execute(text(
                "SELECT name, scale_min, scale_max, scale_min_before_conversion, scale_max_before_conversion "
                "FROM evaluation_categories ORDER BY id")).fetchall()}
            assert scales == {"Forehand": (1, 5, 1, 10), "Volley": (1, 5, 0, 10), "Técnica": (1, 5, None, None)}
            assert _one("SELECT data_type FROM information_schema.columns WHERE table_name = 'evaluation_entries' "
                        "AND column_name = 'score_before_conversion'")["data_type"] == "double precision"
            assert _one(SHARES) == shares_before, "a share snapshot keeps the numbers it froze"
            after_first = _one(ENTRIES)
            assert after_first != entries_before
            _release()

            # Figures follow the new values (rule 6, R-048: computed on read, nothing cached).
            # Service code reads the HEAD schema (PAD-423 added evaluation_entries.scale_min/max),
            # so walk to head before calling it; the downgrade below unwinds the whole chain.
            from padel_app.services.evaluation_api_service import evolution

            upgrade(directory=MIGRATIONS_DIR)
            _release()
            forehand = evolution(db.session.get(Coach, coach_id), player_id, ids["forehand"])
            assert [point["mean"] for point in forehand["series"]] == [4.0, 5.0, 5.0]
            assert (forehand["scaleMin"], forehand["scaleMax"]) == (1, 5)
            _release()

            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "score_before_conversion" not in _columns("evaluation_entries")
            assert "scale_min_before_conversion" not in _columns("evaluation_categories")
            assert _one(ENTRIES) == entries_before, "the downgrade restores every score exactly"
            assert _one(CATEGORIES) == categories_before
            assert _one(SHARES) == shares_before
            _release()

            upgrade(directory=MIGRATIONS_DIR, revision=REVISION)
            assert _one(ENTRIES) == after_first, "a second conversion lands on the same rows"
            assert _one(SHARES) == shares_before
            _release()
        finally:
            db.session.rollback()
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            _release()
