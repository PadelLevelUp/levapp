"""
PAD-246 — the four retired class swatches (red, orange, yellow, green) are
remapped once to hues that cannot be mistaken for a status.

Covered spec: calendar.mobile-views (rule 6)
Criterion: "Retired colours are remapped once"
"""
import glob
import importlib.util
import os
from datetime import datetime

from padel_app.sql_db import db


def _load_migration():
    here = os.path.dirname(__file__)
    versions = os.path.join(here, "..", "..", "migrations", "versions")
    matches = glob.glob(os.path.join(versions, "*_pad246_remap_retired_class_colors.py"))
    assert len(matches) == 1, matches
    spec = importlib.util.spec_from_file_location("pad246_remap", matches[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_lesson(club_id, color):
    from padel_app.models.lessons import Lesson

    lesson = Lesson(
        title=f"Colour {color}",
        start_datetime=datetime(2026, 9, 8, 10, 0),
        end_datetime=datetime(2026, 9, 8, 11, 0),
        is_recurring=False,
        type="academy",
        max_players=4,
        status="active",
        club_id=club_id,
        color=color,
    )
    db.session.add(lesson)
    db.session.flush()
    return lesson.id


def test_remap_class_color_maps_only_the_retired_hues():
    from padel_app.tools.class_colors import remap_class_color

    assert remap_class_color("#ef4444") == "#A21CAF"
    assert remap_class_color("#f97316") == "#0891B2"
    assert remap_class_color("#eab308") == "#0D9488"
    assert remap_class_color("#22c55e") == "#0D9488"
    assert remap_class_color("#EF4444") == "#A21CAF"
    assert remap_class_color("#0ea5e9") == "#0ea5e9"
    assert remap_class_color("#123456") == "#123456"
    assert remap_class_color(None) is None


def test_remap_mirrors_the_frontend_swatch_module():
    """The two lists are hand-mirrored; this pins them together."""
    from padel_app.tools.class_colors import RETIRED_CLASS_COLOR_REMAP

    here = os.path.dirname(__file__)
    ts = os.path.join(
        here, "..", "..", "..", "frontend", "packages", "config", "src", "class-colors.ts"
    )
    source = open(ts, encoding="utf-8").read()
    for old, new in RETIRED_CLASS_COLOR_REMAP.items():
        assert f'"{old}": "{new}"' in source, (old, new)


def test_migration_remaps_stored_colours_and_is_idempotent(app):
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    migration = _load_migration()

    with app.app_context():
        club = Club(name="Remap Club", description="c", location="x")
        db.session.add(club)
        db.session.flush()

        ids = {
            color: _make_lesson(club.id, color)
            for color in ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#123456"]
        }
        db.session.commit()

        expected = {
            "#ef4444": "#A21CAF",
            "#f97316": "#0891B2",
            "#eab308": "#0D9488",
            "#22c55e": "#0D9488",
            "#0ea5e9": "#0ea5e9",
            "#123456": "#123456",
        }

        for _ in range(2):
            migration.apply_remap(db.session.connection())
            db.session.commit()
            db.session.expire_all()
            for original, lesson_id in ids.items():
                assert db.session.get(Lesson, lesson_id).color == expected[original], original
