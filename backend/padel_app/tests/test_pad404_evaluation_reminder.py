"""PAD-404 — evaluations.reminders: the "Frequência de avaliações" setting and the
server-computed `due` marker on the class panel and the players list (R-048).

Every date here hangs off the pinned instant NOW (memory: pinned-now tests must pin
their fixtures) — never off the wall clock. The class panel is read through
POST /class_instance/evaluations (evaluations.class-panel rule 8) and the roster
through GET /coach_players and /coach_players_paginated (players.list rule 9).
"""
import datetime as dt

import pytest
from sqlalchemy import event

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student
from padel_app.tests.test_pad362_evaluation_contract import _headers, _jwt_secret  # noqa: F401

BASE = "/api/app"
NOW = dt.datetime(2026, 9, 21, 10, 0, 0)          # 2026-09-21 on the club's clock
SETTINGS = f"{BASE}/evaluation_settings"


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401
    import padel_app.services.player_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _day(days_ago: int) -> dt.datetime:
    """An instant `days_ago` days before NOW, mid-morning, so its club day is unambiguous."""
    return NOW - dt.timedelta(days=days_ago)


# ── world ────────────────────────────────────────────────────────────────────


def _world(app):
    """Coach Ana with Rui (the seeded student), Sara and Tiago on the roster."""
    from padel_app.models import Association_CoachPlayer

    ids = _seed_coach_and_student(app)
    with app.app_context():
        rel = Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"])
        db.session.add(rel)
        db.session.commit()
        ids["rui"] = {"player_id": ids["student_id"], "rel_id": rel.id}
    ids["sara"] = _player(app, ids["coach_id"], "Sara Student", "sara-404")
    ids["tiago"] = _player(app, ids["coach_id"], "Tiago Student", "tiago-404")
    return ids


def _player(app, coach_id, name, username):
    from padel_app.models import Association_CoachPlayer, Player, User

    with app.app_context():
        user = User(name=name, username=username, password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        rel = Association_CoachPlayer(coach_id=coach_id, player_id=player.id)
        db.session.add(rel)
        db.session.commit()
        return {"player_id": player.id, "rel_id": rel.id, "user_id": user.id}


def _record(app, rel_id, when):
    """A class-less record for the link, filed on `when`'s club day (as the record API does)."""
    from padel_app.services import evaluation_record_service as svc

    with app.app_context():
        record = svc.get_or_create_record(rel_id, day=svc.record_day(when))
        db.session.commit()
        return record.id


def _occurrence(app, coach_id, start, *, title="Aula"):
    """One materialised occurrence of the coach's class, starting at `start` (pinned-derived)."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson

    with app.app_context():
        club = Club.query.first()
        if club is None:
            club = Club(name="PAD-404 Club", description="", location="City")
            db.session.add(club)
            db.session.flush()
        end = start + dt.timedelta(hours=1)
        lesson = Lesson(title=title, start_datetime=start, end_datetime=end, is_recurring=False,
                        type="academy", max_players=4, color="#000000", status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        instance = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=end,
                                  max_players=4, status="scheduled", notifications_enabled=False)
        db.session.add(instance)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=instance.id))
        db.session.commit()
        return {"instance_id": instance.id, "lesson_id": lesson.id, "date": start.date().isoformat()}


def _presence(app, instance_id, player_id, status):
    """A roster row on the occurrence: `status` is 'present', 'absent' or None (unmarked)."""
    from padel_app.models.presences import Presence

    with app.app_context():
        db.session.add(Presence(lesson_instance_id=instance_id, player_id=player_id, status=status))
        db.session.commit()


def _coach(app, ids):
    return _headers(app, ids["coach_user_id"])


def _put_setting(app, client, ids, body):
    return client.put(SETTINGS, json=body, headers=_coach(app, ids))


def _set(app, client, ids, reminder, every_n=None):
    body = {"reminder": reminder}
    if every_n is not None:
        body["everyN"] = every_n
    res = _put_setting(app, client, ids, body)
    assert res.status_code == 200, res.get_data(as_text=True)


def _panel(app, client, ids, occ):
    res = client.post(
        f"{BASE}/class_instance/evaluations?model=LessonInstance&id={occ['instance_id']}&date={occ['date']}",
        headers=_coach(app, ids),
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    return {p["playerId"]: p["due"] for p in res.get_json()["participants"]}


def _roster(app, client, ids):
    res = client.get(f"{BASE}/coach_players", headers=_coach(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return {row["playerId"]: row["due"] for row in res.get_json()}


def _roster_page(app, client, ids, per_page=50):
    res = client.get(f"{BASE}/coach_players_paginated?page=1&per_page={per_page}", headers=_coach(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return {row["playerId"]: row["due"] for row in res.get_json()["items"]}


def _config_rows(app, coach_id):
    from padel_app.models import NotificationConfig

    with app.app_context():
        return NotificationConfig.query.filter_by(coach_id=coach_id).count()


def _due_by_name(ids, due_map):
    return {name: due_map[ids[name]["player_id"]] for name in ("rui", "sara", "tiago")}


def _panel_with_everyone(app, ids):
    """A future occurrence with the three on its roster, unmarked — the surface under test."""
    occ = _occurrence(app, ids["coach_id"], NOW + dt.timedelta(days=2), title="Painel")
    for name in ("rui", "sara", "tiago"):
        _presence(app, occ["instance_id"], ids[name]["player_id"], None)
    return occ


# ── rule 2 / 8: the setting ──────────────────────────────────────────────────


def test_a_coach_without_a_config_row_reads_the_default_and_no_row_is_created(app, client):
    ids = _world(app)
    assert _config_rows(app, ids["coach_id"]) == 0

    res = client.get(SETTINGS, headers=_coach(app, ids))

    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"reminder": "never"}
    assert _config_rows(app, ids["coach_id"]) == 0, "a GET must not upsert a notification_configs row"


def test_the_setting_round_trips_and_a_zero_is_refused_not_dropped(app, client):
    ids = _world(app)

    first = _put_setting(app, client, ids, {"reminder": "every_n_classes", "everyN": 3})
    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json() == {"reminder": "every_n_classes", "everyN": 3}

    absent = _put_setting(app, client, ids, {"reminder": "every_n_classes"})
    assert absent.status_code == 200, absent.get_data(as_text=True)
    assert absent.get_json() == {"reminder": "every_n_classes", "everyN": 3}, "an absent everyN keeps the stored N"

    zero = _put_setting(app, client, ids, {"reminder": "every_n_classes", "everyN": 0})
    assert zero.status_code == 400, zero.get_data(as_text=True)

    read = client.get(SETTINGS, headers=_coach(app, ids))
    assert read.get_json() == {"reminder": "every_n_classes", "everyN": 3}, "the refused 0 left 3 stored"


@pytest.mark.parametrize("body", [
    {"reminder": "weekly"},                                    # unknown reminder
    {"reminder": "every_n_classes"},                           # N required on a fresh every_n_classes
    {"reminder": "every_n_classes", "everyN": 100},            # out of 1–99
    {"reminder": "every_n_classes", "everyN": "2"},            # a string is not an integer
    {"reminder": "every_n_classes", "everyN": True},           # a bool is not an integer
    {"reminder": "every_n_classes", "everyN": None},           # null is not "not sent"
    {},                                                        # reminder required
])
def test_an_invalid_setting_is_400_and_nothing_is_stored(app, client, body):
    ids = _world(app)

    res = _put_setting(app, client, ids, body)

    assert res.status_code == 400, res.get_data(as_text=True)
    assert client.get(SETTINGS, headers=_coach(app, ids)).get_json() == {"reminder": "never"}


def test_never_and_monthly_ignore_every_n(app, client):
    ids = _world(app)

    res = _put_setting(app, client, ids, {"reminder": "never", "everyN": 4})
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"reminder": "never"}
    assert client.get(SETTINGS, headers=_coach(app, ids)).get_json() == {"reminder": "never"}


def test_the_setting_leaves_the_class_reminder_alone(app, client):
    """notifications.config rule 13: evaluation_reminder_* are not reminder_type/_value."""
    from padel_app.models import NotificationConfig

    ids = _world(app)
    _set(app, client, ids, "every_n_classes", 2)

    with app.app_context():
        row = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one()
        assert (row.evaluation_reminder_type, row.evaluation_reminder_value) == ("every_n_classes", 2)
        assert (row.reminder_type, row.reminder_value) == ("hours_before", 48)


def test_a_student_cannot_read_or_write_the_setting(app, client):
    ids = _world(app)
    student = _headers(app, ids["student_user_id"])

    assert client.get(SETTINGS, headers=student).status_code == 403
    assert client.put(SETTINGS, json={"reminder": "never"}, headers=student).status_code == 403


# ── rule 3 / 4: the marker, on both surfaces ────────────────────────────────


def test_monthly_marks_the_players_not_evaluated_in_30_days(app, client):
    ids = _world(app)
    _record(app, ids["rui"]["rel_id"], _day(32))     # 2026-08-20 → due
    _record(app, ids["sara"]["rel_id"], _day(29))    # 2026-08-23 → not due
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "monthly")

    expected = {"rui": True, "sara": False, "tiago": True}
    assert _due_by_name(ids, _panel(app, client, ids, occ)) == expected
    assert _due_by_name(ids, _roster(app, client, ids)) == expected
    assert _due_by_name(ids, _roster_page(app, client, ids)) == expected


def test_monthly_counts_today_inclusive_and_only_this_coachs_records(app, client):
    from padel_app.models import Association_CoachPlayer, User
    from padel_app.models.coaches import Coach

    ids = _world(app)
    # Rule 3's boundary: "the last 30 days, today inclusive" is today and the 29 days before it.
    _record(app, ids["rui"]["rel_id"], _day(30))     # exactly 30 days ago: outside the window → due
    _record(app, ids["tiago"]["rel_id"], _day(29))   # 29 days ago: inside → not due
    # Sara was evaluated yesterday, but by ANOTHER coach — it does not count for Ana.
    with app.app_context():
        other_user = User(name="Other Coach", username="other-coach-404", password="x", status="active")
        db.session.add(other_user)
        db.session.flush()
        other = Coach(user_id=other_user.id)
        db.session.add(other)
        db.session.flush()
        other_rel = Association_CoachPlayer(coach_id=other.id, player_id=ids["sara"]["player_id"])
        db.session.add(other_rel)
        db.session.commit()
        other_rel_id = other_rel.id
    _record(app, other_rel_id, _day(1))
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "monthly")

    assert _due_by_name(ids, _panel(app, client, ids, occ)) == {"rui": True, "sara": True, "tiago": False}


def test_every_n_classes_counts_attendance_since_the_newest_record(app, client):
    ids = _world(app)
    _record(app, ids["rui"]["rel_id"], _day(20))     # 2026-09-01
    _record(app, ids["sara"]["rel_id"], _day(20))
    earlier = _occurrence(app, ids["coach_id"], _day(13))   # 2026-09-08
    later = _occurrence(app, ids["coach_id"], _day(6))      # 2026-09-15
    _presence(app, earlier["instance_id"], ids["rui"]["player_id"], "present")
    _presence(app, later["instance_id"], ids["rui"]["player_id"], "present")
    _presence(app, earlier["instance_id"], ids["sara"]["player_id"], "present")
    _presence(app, later["instance_id"], ids["sara"]["player_id"], "absent")
    _presence(app, earlier["instance_id"], ids["tiago"]["player_id"], "present")   # never evaluated, present once
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "every_n_classes", 2)

    expected = {"rui": True, "sara": False, "tiago": False}
    assert _due_by_name(ids, _panel(app, client, ids, occ)) == expected
    assert _due_by_name(ids, _roster(app, client, ids)) == expected


def test_every_n_classes_never_counts_an_occurrence_that_has_not_happened_yet(app, client):
    """A future class pre-marked `present` was not attended: it cannot make anyone due."""
    ids = _world(app)
    ahead = _occurrence(app, ids["coach_id"], NOW + dt.timedelta(days=3), title="Ainda não")
    _presence(app, ahead["instance_id"], ids["tiago"]["player_id"], "present")
    today = _occurrence(app, ids["coach_id"], NOW - dt.timedelta(hours=2), title="Hoje")
    _presence(app, today["instance_id"], ids["sara"]["player_id"], "present")   # today's class counts
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "every_n_classes", 1)

    expected = {"rui": False, "sara": True, "tiago": False}
    assert _due_by_name(ids, _panel(app, client, ids, occ)) == expected
    assert _due_by_name(ids, _roster(app, client, ids)) == expected


def test_every_n_classes_ignores_occurrences_before_the_record_and_unmarked_rows(app, client):
    ids = _world(app)
    before = _occurrence(app, ids["coach_id"], _day(25))    # before Rui's record: does not count
    _presence(app, before["instance_id"], ids["rui"]["player_id"], "present")
    _record(app, ids["rui"]["rel_id"], _day(20))
    after = _occurrence(app, ids["coach_id"], _day(6))
    _presence(app, after["instance_id"], ids["rui"]["player_id"], None)   # unmarked: does not count
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "every_n_classes", 1)

    assert _due_by_name(ids, _panel(app, client, ids, occ))["rui"] is False


def test_every_n_classes_counts_two_occurrences_in_one_week_as_two(app, client):
    ids = _world(app)
    _record(app, ids["rui"]["rel_id"], _day(20))
    monday = _occurrence(app, ids["coach_id"], _day(7), title="Segunda")
    wednesday = _occurrence(app, ids["coach_id"], _day(5), title="Quarta")
    _presence(app, monday["instance_id"], ids["rui"]["player_id"], "present")
    _presence(app, wednesday["instance_id"], ids["rui"]["player_id"], "present")
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "every_n_classes", 2)

    assert _due_by_name(ids, _panel(app, client, ids, occ))["rui"] is True


def test_never_marks_nobody_including_the_never_evaluated(app, client):
    ids = _world(app)
    occ = _panel_with_everyone(app, ids)
    _set(app, client, ids, "never")

    assert _due_by_name(ids, _panel(app, client, ids, occ)) == {"rui": False, "sara": False, "tiago": False}
    assert _due_by_name(ids, _roster(app, client, ids)) == {"rui": False, "sara": False, "tiago": False}


def test_a_coach_who_never_set_anything_reads_the_never_answer_without_a_row(app, client):
    """Rule 7 — the 2×2's fourth cell: today's behaviour (no marker) for every existing coach."""
    ids = _world(app)
    _record(app, ids["rui"]["rel_id"], _day(32))
    _record(app, ids["sara"]["rel_id"], _day(29))
    occ = _panel_with_everyone(app, ids)
    assert _config_rows(app, ids["coach_id"]) == 0

    nobody = {"rui": False, "sara": False, "tiago": False}   # the `never` answer: today's behaviour
    assert _due_by_name(ids, _panel(app, client, ids, occ)) == nobody
    assert _due_by_name(ids, _roster(app, client, ids)) == nobody
    assert _due_by_name(ids, _roster_page(app, client, ids)) == nobody
    assert _config_rows(app, ids["coach_id"]) == 0, "neither read may create a notification_configs row"


# ── rule 3: one query per surface ───────────────────────────────────────────


def _statements(app, fn):
    """How many SQL statements `fn()` issues."""
    count = {"n": 0}

    def _tick(*_args, **_kwargs):
        count["n"] += 1

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", _tick)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", _tick)
    return count["n"]


@pytest.mark.parametrize("reminder", ["monthly", "every_n_classes"])
def test_the_marker_costs_the_same_for_three_players_as_for_twenty_five(app, client, reminder):
    ids = _world(app)
    _record(app, ids["rui"]["rel_id"], _day(32))
    occ_small = _panel_with_everyone(app, ids)
    _set(app, client, ids, reminder, 2 if reminder == "every_n_classes" else None)

    _panel(app, client, ids, occ_small)   # the first panel read seeds the starting set once; not a per-row cost
    small_roster = _statements(app, lambda: _roster(app, client, ids))
    small_panel = _statements(app, lambda: _panel(app, client, ids, occ_small))

    extra = [_player(app, ids["coach_id"], f"Filler {i}", f"filler-404-{i}") for i in range(22)]
    # Rule 3: an unmarked presence never counts, so under `every_n_classes` (N=2) a filler is
    # due only once present in two occurrences after its record — the fillers get exactly that.
    attended = [_occurrence(app, ids["coach_id"], _day(d), title=f"Passada {d}") for d in (10, 3)]
    for p in extra:
        _record(app, p["rel_id"], _day(40))
        _presence(app, occ_small["instance_id"], p["player_id"], None)
        if reminder == "every_n_classes":
            for occ in attended:
                _presence(app, occ["instance_id"], p["player_id"], "present")

    big = _roster(app, client, ids)
    assert len(big) == 25 and all(big[p["player_id"]] for p in extra), \
        "the fillers are due (40 days since the record / present twice since it)"
    big_roster = _statements(app, lambda: _roster(app, client, ids))
    big_panel = _statements(app, lambda: _panel(app, client, ids, occ_small))

    assert big_roster == small_roster, f"the roster read grew with the roster: {small_roster} → {big_roster}"
    assert big_panel == small_panel, f"the class panel read grew with the roster: {small_panel} → {big_panel}"


# ── rule 5: never leaves the app ────────────────────────────────────────────


def test_the_reminder_never_leaves_the_app(app, client, monkeypatch):
    from padel_app.models import Message

    ids = _world(app)
    _record(app, ids["rui"]["rel_id"], _day(40))
    occ = _panel_with_everyone(app, ids)
    with app.app_context():
        messages_before = Message.query.count()
    pushes = []
    from padel_app.services import notification_service

    monkeypatch.setattr(notification_service, "send_push_notification",
                        lambda *a, **k: pushes.append((a, k)))
    monkeypatch.setattr(notification_service, "publish", lambda *a, **k: pushes.append((a, k)))

    for reminder, n in (("monthly", None), ("every_n_classes", 1), ("never", None)):
        _set(app, client, ids, reminder, n)
        _panel(app, client, ids, occ)
        _roster(app, client, ids)

    with app.app_context():
        assert Message.query.count() == messages_before, "a due player is a marker, never a message"
    assert pushes == []
    from padel_app import scheduler

    assert getattr(scheduler, "_scheduler", None) is None or not [
        j for j in scheduler._scheduler.get_jobs() if "evaluation" in j.id
    ], "no scheduler job may exist for the evaluation reminder"
