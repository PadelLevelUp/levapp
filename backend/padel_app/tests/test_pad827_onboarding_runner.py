"""import.onboarding-runner (PAD-827): the team's `flask onboarding` command.

One operator command loads a new coach's students, weekly classes and enrolments from a JSON file
onto that coach only, once, with a dry run, a full undo and a row in the import history. Every test
drives the real CLI; every "nothing was created" cell compares the tables before and after, and the
"nobody was told" cell sits beside the same roster created with notifications on (R-032).

All names are invented.
"""
import hashlib
import json
from datetime import timedelta

import pytest

from padel_app.sql_db import db

ONBOARDING_ID = "2026_11_05_rui_coach"
COACH_NAME = "Rui Coach"
CLUB_NAME = "Clube Teste"


# ---------------------------------------------------------------------------
# seed and file builders
# ---------------------------------------------------------------------------

def _seed(app, *, levels=("3", "4"), season=True, coach_name=COACH_NAME, username="rui_coach"):
    """A coach at a club, with a ladder and (optionally) a season covering the whole year."""
    from padel_app.models import Association_CoachClub, Club, Coach, CoachLevel, User
    from padel_app.models.coach_seasons import CoachSeason

    with app.app_context():
        user = User(name=coach_name, username=username, password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        club = Club(name=CLUB_NAME, description="", location="Porto")
        db.session.add_all([coach, club])
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        for order, code in enumerate(levels, start=1):
            db.session.add(CoachLevel(coach_id=coach.id, label=f"Nivel {code}", code=code, display_order=order))
        if season:
            db.session.add(CoachSeason(coach_id=coach.id, label="Ano", start_day=1, start_month=1,
                                       end_day=31, end_month=12))
        db.session.commit()
        return {"coach_id": coach.id, "club_id": club.id, "database": db.engine.url.database}


def _monday(weeks_ahead=2):
    """A Monday comfortably in the future on the club's clock, so no reminder time has passed."""
    from padel_app.utils.dates import club_now_naive

    today = club_now_naive().date()
    return today + timedelta(days=(7 - today.weekday()) % 7 + 7 * weeks_ahead)


def _file(ids, **overrides):
    """A valid onboarding: 3 players, 2 weekly classes, 3 enrolments."""
    monday = _monday()
    data = {
        "id": ONBOARDING_ID,
        "coach": {"id": ids["coach_id"], "name": COACH_NAME,
                  "club": {"id": ids["club_id"], "name": CLUB_NAME}},
        "expects": {"players": 0, "classes": 0},
        "notes": ["Laranja ficou de fora"],
        "players": [
            {"name": "Júlio Exemplo", "level_code": "3"},
            {"name": "Ana Lima"},
            {"name": "Bruno Faria", "phone": "+351910000001", "side": "left"},
        ],
        "classes": [
            {"title": "Segunda 07:00", "date": monday.isoformat(), "start_time": "07:00",
             "end_time": "08:30", "max_players": 4,
             "until": (monday + timedelta(weeks=30)).isoformat(),
             "players": ["Júlio Exemplo", "Ana Lima"]},
            {"title": "Terça 18:00", "date": (monday + timedelta(days=1)).isoformat(),
             "start_time": "18:00", "end_time": "19:30", "max_players": 8, "until": "season_end",
             "level_code": "4", "players": ["Bruno Faria"]},
        ],
    }
    data.update(overrides)
    return data


def _write(tmp_path, data, name="onboarding.json"):
    path = tmp_path / name
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return str(path)


def _apply(app, path, database=None, *, dry_run=False, stdin=None):
    args = ["onboarding", "apply", path]
    if dry_run:
        args.append("--dry-run")
    if database is not None:
        args += ["--database", database]
    return app.test_cli_runner().invoke(args=args, input=stdin)


def _revert(app, onboarding_id, database):
    return app.test_cli_runner().invoke(args=["onboarding", "revert", onboarding_id, "--database", database])


def _rows(app):
    """The size of every table a run may write — the "nothing was created" evidence."""
    from padel_app.models import (
        Association_CoachLesson, Association_CoachPlayer, Association_PlayerLesson, Lesson,
        Player, PlayerLevelHistory, User,
    )
    from padel_app.models.bulk_import import BulkImport

    with app.app_context():
        return {m.__tablename__: m.query.count() for m in (
            User, Player, Association_CoachPlayer, PlayerLevelHistory, Lesson,
            Association_CoachLesson, Association_PlayerLesson, BulkImport,
        )}


def _run_row(app):
    from padel_app.models.bulk_import import BulkImport

    with app.app_context():
        row = BulkImport.query.filter_by(filename=f"onboarding:{ONBOARDING_ID}").one_or_none()
        if row is None:
            return None
        return {"id": row.id, "coach_id": row.coach_id, "status": row.status,
                "summary": json.loads(row.summary), "record_ids": json.loads(row.record_ids)}


# ---------------------------------------------------------------------------
# rule 5 — dry run
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-1")
def test_a_dry_run_shows_the_plan_and_writes_nothing(app, tmp_path):
    ids = _seed(app)
    before = _rows(app)

    result = _apply(app, _write(tmp_path, _file(ids)), dry_run=True)

    assert result.exit_code == 0, result.output
    for expected in (ids["database"], COACH_NAME, CLUB_NAME, "3 players", "2 classes",
                     "Segunda 07:00", "2/4", "Terça 18:00", "1/8", "Laranja ficou de fora"):
        assert expected in result.output, (expected, result.output)
    assert _rows(app) == before


# ---------------------------------------------------------------------------
# rules 7, 8, 10 — apply
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-2")
def test_apply_creates_the_students_classes_and_enrolments_on_that_coach(app, tmp_path):
    from padel_app.models import Association_CoachPlayer, Association_PlayerLesson, Coach, Lesson

    ids = _seed(app)
    data = _file(ids)
    path = _write(tmp_path, data)

    result = _apply(app, path, ids["database"])

    assert result.exit_code == 0, result.output
    monday = _monday()
    with app.app_context():
        coach = db.session.get(Coach, ids["coach_id"])
        links = Association_CoachPlayer.query.filter_by(coach_id=coach.id).all()
        by_name = {link.player.user.name: link for link in links}
        assert sorted(by_name) == ["Ana Lima", "Bruno Faria", "Júlio Exemplo"]
        for link in links:
            user = link.player.user
            assert user.email is None, user.email
            assert user.username.startswith("pending-"), user.username
        assert by_name["Júlio Exemplo"].level.code == "3"
        assert by_name["Ana Lima"].level_id is None
        assert by_name["Bruno Faria"].side == "left"
        assert by_name["Bruno Faria"].player.user.phone == "+351910000001"

        lessons = {rel.lesson.title: rel.lesson for rel in coach.lessons_relations}
        assert sorted(lessons) == ["Segunda 07:00", "Terça 18:00"]
        first = lessons["Segunda 07:00"]
        assert first.club_id == ids["club_id"]
        assert first.start_datetime.isoformat() == f"{monday.isoformat()}T07:00:00"
        assert first.end_datetime.isoformat() == f"{monday.isoformat()}T08:30:00"
        assert first.is_recurring is True
        assert json.loads(first.recurrence_rule) == {"frequency": "weekly", "daysOfWeek": [1]}
        assert first.recurrence_end == monday + timedelta(weeks=30)
        assert first.max_players == 4 and first.type == "academy"
        assert [rel.coach_id for rel in first.coaches_relations] == [coach.id]
        enrolled = {
            row.player.user.name
            for row in Association_PlayerLesson.query.filter_by(lesson_id=first.id)
        }
        assert enrolled == {"Júlio Exemplo", "Ana Lima"}

        second = lessons["Terça 18:00"]
        assert json.loads(second.recurrence_rule)["daysOfWeek"] == [2]
        assert second.recurs_until_season_end is True
        assert second.recurrence_end.month == 12 and second.recurrence_end.day == 31
        assert second.level.code == "4"
        assert Lesson.query.count() == 2

    row = _run_row(app)
    assert row is not None, "no bulk_imports row for the onboarding"
    assert row["coach_id"] == ids["coach_id"] and row["status"] == "active"
    assert row["summary"] == {"Players": 3, "Classes": 2, "Players in Classes": 3}
    created = row["record_ids"]
    assert {k: len(created[k]) for k in ("users", "players", "coach_players", "lessons", "player_lessons")} == {
        "users": 3, "players": 3, "coach_players": 3, "lessons": 2, "player_lessons": 3,
    }
    assert len(created["player_level_history"]) == 1
    with open(path, "rb") as fh:
        assert created["_onboarding"] == {"id": ONBOARDING_ID, "sha256": hashlib.sha256(fh.read()).hexdigest()}


def test_the_file_can_come_from_standard_input(app, tmp_path):
    ids = _seed(app)

    result = _apply(app, "-", ids["database"], stdin=json.dumps(_file(ids)))

    assert result.exit_code == 0, result.output
    assert _run_row(app)["summary"]["Players"] == 3


def test_the_run_shows_in_the_coachs_import_history(app, tmp_path):
    from padel_app.models import Coach
    from padel_app.services.import_service import get_import_history

    ids = _seed(app)
    assert _apply(app, _write(tmp_path, _file(ids)), ids["database"]).exit_code == 0

    with app.app_context():
        history = get_import_history(db.session.get(Coach, ids["coach_id"]))
    assert [(h["filename"], h["status"], h["summary"]) for h in history] == [
        (f"onboarding:{ONBOARDING_ID}", "active", {"Players": 3, "Classes": 2, "Players in Classes": 3}),
    ]


# ---------------------------------------------------------------------------
# rule 9 — nobody is contacted
# ---------------------------------------------------------------------------

def _record_outgoing(monkeypatch):
    sent = {"added": [], "email": [], "push": []}
    real = __import__("padel_app.services.system_messages", fromlist=["x"]).notify_student_added_to_class

    def _added(coach, player_id, **kw):
        sent["added"].append(player_id)
        return real(coach, player_id, **kw)

    monkeypatch.setattr("padel_app.services.system_messages.notify_student_added_to_class", _added)
    monkeypatch.setattr("padel_app.tools.email_tools.send_email",
                        lambda *a, **kw: sent["email"].append((a, kw)))
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification",
                        lambda *a, **kw: sent["push"].append((a, kw)))
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user",
                        lambda *a, **kw: sent["push"].append((a, kw)))
    return sent


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-3")
def test_no_student_is_contacted(app, tmp_path, monkeypatch):
    from padel_app.models import Association_CoachPlayer, Club, Coach, Lesson, Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.lesson_service import add_class_service

    ids = _seed(app)
    data = _file(ids)
    data["classes"][1]["notifications"] = True
    sent = _record_outgoing(monkeypatch)

    result = _apply(app, _write(tmp_path, data), ids["database"])

    assert result.exit_code == 0, result.output
    with app.app_context():
        assert Lesson.query.count() == 2  # the subject exists: classes with students were created
        assert sent == {"added": [], "email": [], "push": []}
        assert Message.query.count() == 0
        assert NotificationEvent.query.count() == 0
        flags = {lesson.title: lesson.notifications_enabled for lesson in Lesson.query}
        assert flags == {"Segunda 07:00": False, "Terça 18:00": True}

        # Control: the same roster through the same service with notifications on does tell them.
        coach = db.session.get(Coach, ids["coach_id"])
        player_ids = [link.player_id for link in Association_CoachPlayer.query.filter_by(coach_id=coach.id)]
        monday = _monday()
        add_class_service(
            {"name": "Controlo", "classType": "academy", "date": monday.isoformat(), "startTime": "10:00",
             "endTime": "11:00", "maxPlayers": 4, "playerIds": player_ids, "isRecurring": False},
            coach, db.session.get(Club, ids["club_id"]), notify_students=True,
        )
        db.session.commit()
        assert sorted(sent["added"]) == sorted(player_ids)


# ---------------------------------------------------------------------------
# rules 4c, 11 — once
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-4")
def test_a_second_apply_is_refused_also_after_a_revert(app, tmp_path):
    ids = _seed(app)
    path = _write(tmp_path, _file(ids))
    assert _apply(app, path, ids["database"]).exit_code == 0
    after_first = _rows(app)

    # The roster now differs from `expects`; the refusal must still name the earlier run.
    again = _apply(app, path, ids["database"])
    assert again.exit_code == 1, again.output
    assert "already applied" in again.output and "active" in again.output
    assert _rows(app) == after_first

    reverted = _revert(app, ONBOARDING_ID, ids["database"])
    assert reverted.exit_code == 0, reverted.output
    after_revert = _rows(app)
    assert after_revert["lessons"] == 0 and after_revert["players"] == 0  # the revert really emptied it

    third = _apply(app, path, ids["database"])
    assert third.exit_code == 1, third.output
    assert "already applied" in third.output and "reverted" in third.output
    assert _rows(app) == after_revert


# ---------------------------------------------------------------------------
# rule 4a — the right coach
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case, expected", [
    ("coach name", 'coach #{coach_id} is "Rui Coach"'),
    ("club id", "current club"),
    ("club name", "current club"),
    ("missing coach", "no coach with id 987654"),
])
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-5")
def test_the_wrong_coach_is_refused(app, tmp_path, case, expected):
    ids = _seed(app)
    data = _file(ids)
    if case == "coach name":
        data["coach"]["name"] = "Another Name"
    elif case == "club id":
        data["coach"]["club"]["id"] = ids["club_id"] + 100
    elif case == "club name":
        data["coach"]["club"]["name"] = "Outro Clube"
    else:
        data["coach"]["id"] = 987654
    before = _rows(app)

    result = _apply(app, _write(tmp_path, data), ids["database"])

    assert result.exit_code == 1, result.output
    assert expected.format(**ids) in result.output, result.output
    assert _rows(app) == before


def test_another_coach_with_the_same_club_is_not_touched(app, tmp_path):
    """The file's coach id decides; a second coach in the same club gains nothing."""
    from padel_app.models import Association_CoachClub, Association_CoachLesson, Association_CoachPlayer, Coach, User

    ids = _seed(app)
    with app.app_context():
        user = User(name="Outra Treinadora", username="outra", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        other = Coach(user_id=user.id)
        db.session.add(other)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=other.id, club_id=ids["club_id"]))
        db.session.commit()
        other_id = other.id

    assert _apply(app, _write(tmp_path, _file(ids)), ids["database"]).exit_code == 0

    with app.app_context():
        assert Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"]).count() == 3
        assert Association_CoachPlayer.query.filter_by(coach_id=other_id).count() == 0
        assert Association_CoachLesson.query.filter_by(coach_id=other_id).count() == 0


# ---------------------------------------------------------------------------
# rule 4b — starting state
# ---------------------------------------------------------------------------

def _own_player(app, coach_id, name="Aluno Antigo"):
    from padel_app.models import Association_CoachPlayer, Player, User

    with app.app_context():
        user = User(name=name, username=name.lower().replace(" ", "_"), password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player.id))
        db.session.commit()
        return player.id


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-6")
def test_a_starting_state_that_is_not_the_expected_one_is_refused(app, tmp_path):
    ids = _seed(app)
    _own_player(app, ids["coach_id"])
    before = _rows(app)

    result = _apply(app, _write(tmp_path, _file(ids)), ids["database"])

    assert result.exit_code == 1, result.output
    assert "expects 0 players and 0 classes" in result.output and "found 1 players and 0 classes" in result.output
    assert _rows(app) == before


# ---------------------------------------------------------------------------
# rule 6 — the database is named
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("database", [None, "some_other_database"], ids=["missing", "different"])
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-7")
def test_a_real_run_must_name_its_database(app, tmp_path, database):
    ids = _seed(app)
    path = _write(tmp_path, _file(ids))
    before = _rows(app)

    result = _apply(app, path, database)

    assert result.exit_code == 1, result.output
    assert "--database" in result.output and ids["database"] in result.output
    assert _rows(app) == before
    # The same file is accepted once the name is right: the refusal was about the name alone.
    assert _apply(app, path, ids["database"]).exit_code == 0


# ---------------------------------------------------------------------------
# rule 3 — the file is checked first, and completely
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-8")
def test_file_problems_are_all_reported_before_the_database_is_read(app, tmp_path):
    ids = _seed(app)
    monday = _monday()
    data = _file(ids, id="Wrong Id")
    data["coach"]["id"] = 987654  # would be "no coach with id" if the database were read
    data["players"] = [{"name": "Júlio Exemplo"}, {"name": "julio  exemplo"}, {"name": "Ana Lima"},
                       {"name": "Bruno Faria"}]
    data["classes"] = [
        {"title": "Fantasma", "date": monday.isoformat(), "start_time": "07:00", "end_time": "08:30",
         "max_players": 4, "until": "season_end", "players": ["Ghost"]},
        {"title": "Cheia", "date": monday.isoformat(), "start_time": "09:00", "end_time": "10:00",
         "max_players": 2, "until": "season_end", "players": ["Júlio Exemplo", "Ana Lima", "Bruno Faria"]},
        {"title": "Ao contrário", "date": monday.isoformat(), "start_time": "12:00", "end_time": "11:00",
         "max_players": 4, "until": "season_end", "players": []},
        {"title": "Sem fim", "date": monday.isoformat(), "start_time": "13:00", "end_time": "14:00",
         "max_players": 4, "players": []},
    ]
    before = _rows(app)

    result = _apply(app, _write(tmp_path, data), dry_run=True)

    assert result.exit_code == 1, result.output
    for problem in ('id "Wrong Id"', "duplicate player name", '"Ghost"', 'class "Cheia"', "max_players",
                    'class "Ao contrário"', "end_time", 'class "Sem fim"', "until"):
        assert problem in result.output, (problem, result.output)
    assert "no coach with id" not in result.output
    assert _rows(app) == before


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-9")
def test_no_age_confirmation_is_asked(app, tmp_path):
    """Rule 3g (owner decision, 2026-11-05): roster players have no login; the file is not asked."""
    ids = _seed(app)
    data = _file(ids, confirms_adults=False)  # a leftover field is not a reason to refuse
    assert "confirms_adults" not in _file(ids)

    result = _apply(app, _write(tmp_path, data), ids["database"])

    assert result.exit_code == 0, result.output
    assert _run_row(app)["summary"]["Players"] == 3


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-10")
def test_values_the_columns_cannot_hold_and_a_repeated_email_are_refused(app, tmp_path):
    ids = _seed(app)
    data = _file(ids)
    data["players"][0]["phone"] = "+351 910 000 001 ext. 4455"   # users.phone holds 20
    data["players"][1]["email"] = "par@example.com"
    data["players"][2]["email"] = "PAR@example.com"
    data["classes"][0]["title"] = "T" * 256                       # lessons.title holds 255
    before = _rows(app)

    result = _apply(app, _write(tmp_path, data), dry_run=True)

    assert result.exit_code == 1, result.output
    for problem in ('player "Júlio Exemplo": phone is longer than 20', "par@example.com is also the email of",
                    "title is longer than 255"):
        assert problem in result.output, (problem, result.output)
    assert _rows(app) == before


def test_a_file_that_is_not_json_is_refused(app, tmp_path):
    ids = _seed(app)
    path = tmp_path / "broken.json"
    path.write_text("{ not json", encoding="utf-8")

    result = _apply(app, str(path), ids["database"])

    assert result.exit_code == 1, result.output
    assert "not valid JSON" in result.output


# ---------------------------------------------------------------------------
# rules 4d, 4f — levels, names, titles
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case, expected", [
    ("level", 'level code "9"'),
    ("class level", 'level code "9"'),
    ("name", '"ana lima" is already on'),
    ("title", 'class "Segunda 07:00" already exists'),
])
@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-11")
def test_an_unknown_level_a_taken_name_and_a_taken_title_are_refused(app, tmp_path, case, expected):
    from padel_app.models import Club, Coach
    from padel_app.services.lesson_service import add_class_service

    ids = _seed(app)
    data = _file(ids)
    if case == "level":
        data["players"][1]["level_code"] = "9"
    elif case == "class level":
        data["classes"][0]["level_code"] = "9"
    elif case == "name":
        _own_player(app, ids["coach_id"], name="Ana Lima")
        data["players"][1]["name"] = "ana lima"
        data["classes"][0]["players"] = ["Júlio Exemplo", "ana lima"]
        data["expects"] = {"players": 1, "classes": 0}
    else:
        with app.app_context():
            add_class_service(
                {"name": "Segunda 07:00", "classType": "academy", "date": _monday().isoformat(),
                 "startTime": "07:00", "endTime": "08:30", "maxPlayers": 4, "playerIds": [],
                 "isRecurring": False},
                db.session.get(Coach, ids["coach_id"]), db.session.get(Club, ids["club_id"]),
                notify_students=False,
            )
            db.session.commit()
        data["expects"] = {"players": 0, "classes": 1}
    before = _rows(app)

    result = _apply(app, _write(tmp_path, data), ids["database"])

    assert result.exit_code == 1, result.output
    assert expected in result.output, result.output
    assert _rows(app) == before


# ---------------------------------------------------------------------------
# rule 4e — existing accounts
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-12")
def test_an_existing_account_is_joined_only_when_the_file_says_so(app, tmp_path):
    from padel_app.models import Association_CoachPlayer, User

    ids = _seed(app)
    with app.app_context():
        existing = User(name="Ana M. Lima", username="ana_existing", password="x", status="active",
                        email="ana@example.com")
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id
    data = _file(ids)
    data["players"][1]["email"] = "ANA@example.com"
    before = _rows(app)

    refused = _apply(app, _write(tmp_path, data), ids["database"])

    assert refused.exit_code == 1, refused.output
    assert "ana@example.com" in refused.output and "link_existing" in refused.output
    assert _rows(app) == before

    data["players"][1]["link_existing"] = True
    accepted = _apply(app, _write(tmp_path, data), ids["database"])

    assert accepted.exit_code == 0, accepted.output
    with app.app_context():
        assert User.query.count() == before["users"] + 2  # two new students, not three
        user = db.session.get(User, existing_id)
        link = Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"], player_id=user.player.id).one()
        assert link is not None
    row = _run_row(app)
    assert row["summary"] == {"Players": 3, "Classes": 2, "Players in Classes": 3}
    assert existing_id not in row["record_ids"]["users"]


# ---------------------------------------------------------------------------
# rule 4g — seasons
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-13")
def test_no_season_no_endless_class(app, tmp_path):
    ids = _seed(app, season=False)
    data = _file(ids)
    before = _rows(app)

    refused = _apply(app, _write(tmp_path, data), ids["database"])

    assert refused.exit_code == 1, refused.output
    assert "no season" in refused.output and 'class "Terça 18:00"' in refused.output
    assert _rows(app) == before

    data["classes"][1]["until"] = (_monday() + timedelta(weeks=20)).isoformat()
    accepted = _apply(app, _write(tmp_path, data), ids["database"])
    assert accepted.exit_code == 0, accepted.output


# ---------------------------------------------------------------------------
# rule 11 — all or nothing
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-14")
def test_a_run_that_fails_part_way_leaves_nothing(app, tmp_path, monkeypatch):
    from padel_app.services import lesson_service

    ids = _seed(app)
    path = _write(tmp_path, _file(ids))
    before = _rows(app)
    real = lesson_service.add_class_service
    calls = []

    def _fails_on_the_second(data, coach, club, **kw):
        calls.append(data["name"])
        if len(calls) == 2:
            raise RuntimeError("court service is down")
        return real(data, coach, club, **kw)

    monkeypatch.setattr(lesson_service, "add_class_service", _fails_on_the_second)

    failed = _apply(app, path, ids["database"])

    assert calls == ["Segunda 07:00", "Terça 18:00"]  # the first class really was created first
    assert failed.exit_code == 1, failed.output
    assert "court service is down" in failed.output and 'class "Terça 18:00"' in failed.output
    assert _rows(app) == before
    assert _run_row(app) is None

    monkeypatch.setattr(lesson_service, "add_class_service", real)
    retried = _apply(app, path, ids["database"])
    assert retried.exit_code == 0, retried.output
    assert _run_row(app)["summary"] == {"Players": 3, "Classes": 2, "Players in Classes": 3}


# ---------------------------------------------------------------------------
# rule 12 — ownership
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-15")
def test_ownership_is_checked_on_what_was_created(app, tmp_path, monkeypatch):
    from padel_app.models import Association_CoachLesson, Coach, User
    from padel_app.services import lesson_service

    ids = _seed(app)
    with app.app_context():
        user = User(name="Intruso", username="intruso", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        intruder = Coach(user_id=user.id)
        db.session.add(intruder)
        db.session.commit()
        intruder_id = intruder.id
    before = _rows(app)
    real = lesson_service.add_class_service

    def _also_links_another_coach(data, coach, club, **kw):
        lesson = real(data, coach, club, **kw)
        if data["name"] == "Terça 18:00":
            db.session.add(Association_CoachLesson(coach_id=intruder_id, lesson_id=lesson.id))
            db.session.commit()
        return lesson

    monkeypatch.setattr(lesson_service, "add_class_service", _also_links_another_coach)

    result = _apply(app, _write(tmp_path, _file(ids)), ids["database"])

    assert result.exit_code == 1, result.output
    assert "ownership" in result.output and 'class "Terça 18:00"' in result.output
    assert _rows(app) == before
    assert _run_row(app) is None


# ---------------------------------------------------------------------------
# rule 13 — revert
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-16")
def test_revert_removes_exactly_what_the_run_created(app, tmp_path):
    from padel_app.models import Association_CoachPlayer, Club, Coach, Lesson, User
    from padel_app.services.lesson_service import add_class_service

    ids = _seed(app)
    own_player = _own_player(app, ids["coach_id"])
    with app.app_context():
        add_class_service(
            {"name": "Aula Antiga", "classType": "academy", "date": _monday().isoformat(),
             "startTime": "20:00", "endTime": "21:00", "maxPlayers": 4, "playerIds": [own_player],
             "isRecurring": False},
            db.session.get(Coach, ids["coach_id"]), db.session.get(Club, ids["club_id"]),
            notify_students=False,
        )
        db.session.commit()
    before = _rows(app)
    path = _write(tmp_path, _file(ids, expects={"players": 1, "classes": 1}))
    assert _apply(app, path, ids["database"]).exit_code == 0
    assert _rows(app)["lessons"] == before["lessons"] + 2  # the run really added to the coach's own

    result = _revert(app, ONBOARDING_ID, ids["database"])

    assert result.exit_code == 0, result.output
    after = _rows(app)
    assert after == {**before, "bulk_imports": 1}
    with app.app_context():
        assert [lesson.title for lesson in Lesson.query] == ["Aula Antiga"]
        assert [link.player_id for link in Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"])] == [own_player]
        assert User.query.filter_by(name="Júlio Exemplo").count() == 0
    assert _run_row(app)["status"] == "reverted"

    twice = _revert(app, ONBOARDING_ID, ids["database"])
    assert twice.exit_code == 1 and "already reverted" in twice.output, twice.output
    unknown = _revert(app, "2026_01_01_nobody", ids["database"])
    assert unknown.exit_code == 1 and "no onboarding" in unknown.output, unknown.output
    assert _rows(app) == after


@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-7")
def test_revert_must_name_its_database(app, tmp_path):
    ids = _seed(app)
    assert _apply(app, _write(tmp_path, _file(ids)), ids["database"]).exit_code == 0
    applied = _rows(app)

    result = app.test_cli_runner().invoke(args=["onboarding", "revert", ONBOARDING_ID])

    assert result.exit_code == 1, result.output
    assert "--database" in result.output
    assert _rows(app) == applied


# ---------------------------------------------------------------------------
# rule 14 — list
# ---------------------------------------------------------------------------

@pytest.mark.criterion("IMPORT-ONBOARDING-RUNNER-17")
def test_list_shows_the_runs(app, tmp_path):
    ids = _seed(app)
    assert _apply(app, _write(tmp_path, _file(ids)), ids["database"]).exit_code == 0
    assert _revert(app, ONBOARDING_ID, ids["database"]).exit_code == 0
    second = _file(ids, id="2026_11_06_rui_coach_b")
    assert _apply(app, _write(tmp_path, second, "second.json"), ids["database"]).exit_code == 0

    result = app.test_cli_runner().invoke(args=["onboarding", "list"])

    assert result.exit_code == 0, result.output
    lines = [line for line in result.output.splitlines() if "rui_coach" in line]
    assert len(lines) == 2, result.output
    assert ONBOARDING_ID in lines[0] and "reverted" in lines[0] and COACH_NAME in lines[0]
    assert "2026_11_06_rui_coach_b" in lines[1] and "active" in lines[1]
    assert "3 players" in lines[1] and "2 classes" in lines[1]
