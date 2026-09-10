"""PAD-270 (audit M1; B-061) — a player's level is written in one place.

History is the record and `coach_in_player.level_id` its cache; the one writer,
`set_roster_level`, sets the cache and records the history row. An edit used to
write no history; `Player.level` was dead; the class-level fallback had copies.
"""
import ast
import importlib.util
import pathlib
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text

from padel_app.sql_db import db

APP_DIR = pathlib.Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _count(sql, **params):
    return db.session.execute(text(sql), params).scalar()


@pytest.fixture
def world(app):
    """A coach with two levels and one active student at level A, with one history entry."""
    from padel_app.models import (
        Association_CoachClub, Association_CoachPlayer, Association_PlayerClub, Club, Coach,
        CoachLevel, Player, PlayerLevelHistory, User,
    )

    with app.app_context():
        coach_user = User(name="Coach Lia", username="pad270_coach", password="x", status="active")
        student_user = User(name="Tomas Student", username="pad270_student", password="x", status="active")
        db.session.add_all([coach_user, student_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        student = Player(user_id=student_user.id)
        club = Club(name="PAD270 Club", description="", location="Porto")
        db.session.add_all([coach, student, club])
        db.session.flush()
        db.session.add_all([
            Association_CoachClub(coach_id=coach.id, club_id=club.id),
            Association_PlayerClub(player_id=student.id, club_id=club.id),
        ])
        level_a = CoachLevel(coach_id=coach.id, label="A", code="A1", display_order=1)
        level_b = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=2)
        db.session.add_all([level_a, level_b])
        db.session.flush()
        rel = Association_CoachPlayer(coach_id=coach.id, player_id=student.id, level_id=level_a.id)
        db.session.add(rel)
        db.session.add(PlayerLevelHistory(coach_id=coach.id, player_id=student.id, level_id=level_a.id,
                                          assigned_at=datetime.utcnow() - timedelta(days=30)))
        db.session.commit()
        return dict(coach_user_id=coach_user.id, coach_id=coach.id, student_id=student.id,
                    rel_id=rel.id, level_a=level_a.id, level_b=level_b.id)


def _history(world, player_id=None):
    return db.session.execute(text(
        "SELECT level_id FROM player_level_history WHERE coach_id = :c AND player_id = :p "
        "ORDER BY assigned_at DESC, id DESC"
    ), {"c": world["coach_id"], "p": player_id or world["student_id"]}).scalars().all()


def _edit(app, client, world, updates, level_before):
    return client.post("/api/app/edit_player", json={
        "player": {"playerId": world["student_id"], "coachId": world["coach_id"], "levelId": str(level_before)},
        "updates": updates,
    }, headers=_headers(app, world["coach_user_id"]))


# --- players.edit rule 2 / players.level-history rule 1 ----------------------

def test_editing_the_level_records_it_in_history_and_the_roster(app, client, world):
    res = _edit(app, client, world, {"levelId": str(world["level_b"])}, world["level_a"])
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert _count("SELECT level_id FROM coach_in_player WHERE id = :r", r=world["rel_id"]) == world["level_b"]
        assert _history(world) == [world["level_b"], world["level_a"]], "an edit wrote no history (B-061)"


def test_an_edit_that_keeps_the_level_writes_no_history(app, client, world):
    res = _edit(app, client, world, {"notes": "keeps working on the volley", "levelId": str(world["level_a"])},
                world["level_a"])
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        assert _history(world) == [world["level_a"]]


def test_the_writer_records_a_change_once(app, world):
    from padel_app.models import Association_CoachPlayer
    from padel_app.services.level_service import set_roster_level

    with app.app_context():
        rel = Association_CoachPlayer.query.get(world["rel_id"])
        assert set_roster_level(rel, world["level_b"]) is not None
        db.session.commit()
        assert set_roster_level(rel, world["level_b"]) is None, "the same level again wrote a second entry"
        assert set_roster_level(rel, None) is None
        db.session.commit()
        assert rel.level_id is None
        assert _history(world) == [world["level_b"], world["level_a"]]


def test_the_claim_merge_records_a_borrowed_level(app, world):
    from padel_app.models import Association_CoachPlayer, Player, User
    from padel_app.services.player_claim_service import _merge_coach_relations

    with app.app_context():
        ghost_user = User(name="Ghost", username="pending-pad270", password=None, status="inactive")
        claimant_user = User(name="Claimant", username="pad270_claimant", password="x", status="active")
        db.session.add_all([ghost_user, claimant_user])
        db.session.flush()
        ghost = Player(user_id=ghost_user.id)
        claimant = Player(user_id=claimant_user.id)
        db.session.add_all([ghost, claimant])
        db.session.flush()
        db.session.add_all([
            Association_CoachPlayer(coach_id=world["coach_id"], player_id=ghost.id, level_id=world["level_b"]),
            Association_CoachPlayer(coach_id=world["coach_id"], player_id=claimant.id, level_id=None),
        ])
        db.session.commit()
        _merge_coach_relations(ghost.id, claimant.id)
        db.session.commit()
        mine = Association_CoachPlayer.query.filter_by(coach_id=world["coach_id"], player_id=claimant.id).one()
        assert mine.level_id == world["level_b"]
        assert _history(world, claimant.id)[:1] == [world["level_b"]], "the borrowed level has no history entry"


def test_an_invitation_records_its_level_once(app, world):
    from padel_app.services.player_invitation_service import create_player_invitation_service

    with app.app_context():
        result = create_player_invitation_service(
            {"coachId": world["coach_id"], "levelId": str(world["level_b"]), "name": "Invited Ines"})
        player_id = result[0]["playerId"] if isinstance(result, tuple) else result["playerId"]
        assert _history(world, player_id) == [world["level_b"]]


# --- players.level-history rule 2 --------------------------------------------

def test_player_level_is_retired(app):
    from padel_app.models import Player

    assert not hasattr(Player, "level"), "Player.level read the first level forever and nothing used it"


# --- one writer, one fallback -------------------------------------------------

def _app_sources():
    skip = {"tests", "seed", "migrations"}
    for path in APP_DIR.rglob("*.py"):
        if skip.intersection(path.relative_to(APP_DIR).parts):
            continue
        yield path


def test_only_the_level_service_writes_a_roster_level():
    offenders = []
    for path in _app_sources():
        if path.name == "level_service.py":
            continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = getattr(node.func, "id", getattr(node.func, "attr", None))
                if name == "PlayerLevelHistory":
                    offenders.append(f"{path.name}:{node.lineno} builds a PlayerLevelHistory")
                if name == "Association_CoachPlayer" and any(k.arg == "level_id" for k in node.keywords):
                    offenders.append(f"{path.name}:{node.lineno} sets a roster level_id")
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if (isinstance(target, ast.Attribute) and target.attr == "level_id"
                            and isinstance(target.value, ast.Name)
                            and target.value.id in {"rel", "mine", "coach_player", "cp", "assoc", "association"}):
                        offenders.append(f"{path.name}:{node.lineno} assigns {target.value.id}.level_id")
    assert offenders == [], "roster levels must go through level_service.set_roster_level: " + "; ".join(offenders)


def test_the_class_level_fallback_lives_in_one_place():
    from padel_app.services import level_service, notification_service

    assert notification_service.effective_level_id is level_service.effective_level_id
    calendar = (APP_DIR / "serializers" / "calendar_event.py").read_text()
    assert "level_id or " not in calendar and "effective_level_id(obj)" in calendar


def test_the_calendar_reports_a_class_level_from_its_lesson(app, world):
    from padel_app.models import Lesson, LessonInstance
    from padel_app.serializers.calendar_event import serialize_calendar_event

    with app.app_context():
        start = datetime.utcnow() + timedelta(days=2)
        lesson = Lesson(title="Level fallback", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000000", status="active",
                        default_level_id=world["level_b"])
        db.session.add(lesson)
        db.session.flush()
        instance = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  max_players=4, status="scheduled", notifications_enabled=True)
        db.session.add(instance)
        db.session.commit()
        assert serialize_calendar_event(instance)["levelId"] == world["level_b"]


# --- the migration ----------------------------------------------------------

def _migration():
    versions = APP_DIR.parent / "migrations" / "versions"
    matches = list(versions.glob("2c18f5a47c8b_pad270_*.py"))
    assert len(matches) == 1, matches
    spec = importlib.util.spec_from_file_location("pad270_mig", matches[0])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_the_migration_backfills_what_edits_never_recorded_and_is_idempotent(app, world):
    from padel_app.models import Association_CoachPlayer

    mod = _migration()
    assert mod.down_revision == "76395824b9cf"
    with app.app_context():
        # An edit before PAD-270: the cache moved to B, the history still says A.
        rel = Association_CoachPlayer.query.get(world["rel_id"])
        rel.level_id = world["level_b"]
        db.session.commit()
        conn = db.session.connection()
        assert mod.backfill_level_history(conn) == 1
        db.session.commit()
        assert _history(world) == [world["level_b"], world["level_a"]]
        assert mod.backfill_level_history(db.session.connection()) == 0, "a second run wrote again"
