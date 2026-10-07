"""PAD-547 — notifications.waiting-list rules 18–21, calendar.event-detail rule 19 (numbering
unconfirmed): the coach adds students to one class's waiting list, or to a whole series as a
standing entry scoped to it; the class's list says where each row came from; the coach removes
a row for that class only. Nothing is sent to the student.
"""
from datetime import timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student
from padel_app.tests.test_pad358_academy_classes import _add_class, _join, _setup


def _quiet(monkeypatch):
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda **kw: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: None)
    events = []
    monkeypatch.setattr("padel_app.services.notification_service.publish",
                        lambda event, recipients: events.append(event["type"]))
    monkeypatch.setattr("padel_app.realtime.publish",
                        lambda event, recipients: events.append(event["type"]))
    return events


def _student(app, ids, name):
    with app.app_context():
        pid = _add_student(ids["coach_id"], name, level_id=ids["level_ids"]["5"])
        db.session.commit()
    return pid


def _instance(instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, instance_id)


def _rows(instance_id):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    return {r.player_id: r for r in WaitingListEntry.query.filter_by(lesson_instance_id=instance_id).all()}


def _messages_to(player_id):
    from padel_app.models import ConversationParticipant, Message
    from padel_app.models.players import Player

    uid = db.session.get(Player, player_id).user_id
    convs = {c.conversation_id for c in ConversationParticipant.query.filter_by(user_id=uid).all()}
    return [m for m in Message.query.all() if m.conversation_id in convs]


def _add(coach_id, instance_id, player_id, **kw):
    from padel_app.services.notification_service import add_to_class_waiting_list

    return add_to_class_waiting_list(coach_id, _instance(instance_id), player_id, **kw)


# ── rule 18: one occurrence ───────────────────────────────────────────────────

def test_the_coach_puts_a_student_on_one_class_list_and_nothing_is_sent(app, monkeypatch):
    events = _quiet(monkeypatch)
    ids = _setup(app)
    open_class = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1)
    carla = _student(app, ids, "carla")
    with app.app_context():
        result = _add(ids["coach_id"], open_class["instance_id"], carla, scope="occurrence")
        db.session.expire_all()
        row = _rows(open_class["instance_id"])[carla]
        assert result["action"] == "added"
        assert (row.is_active, row.added_by, row.standing_entry_id) == (True, "coach", None)
        assert _messages_to(carla) == [], "the student hears nothing until a spot opens"
        assert "waiting_list_changed" in events
        again = _add(ids["coach_id"], open_class["instance_id"], carla, scope="occurrence")
        assert again["action"] == "already_on_list"


def test_a_removed_row_is_reactivated_as_the_coachs(app, monkeypatch):
    from padel_app.services.notification_service import remove_from_class_waiting_list

    _quiet(monkeypatch)
    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="Full", max_players=2, filled=2)
    _join(app, ids, model="LessonInstance", original_id=full["instance_id"])  # the student's own row
    with app.app_context():
        row = _rows(full["instance_id"])[ids["student_id"]]
        assert row.added_by == "student"
        remove_from_class_waiting_list(row.id, ids["coach_id"])
        result = _add(ids["coach_id"], full["instance_id"], ids["student_id"], scope="occurrence")
        db.session.expire_all()
        row = _rows(full["instance_id"])[ids["student_id"]]
        assert result["action"] == "added"
        assert (row.is_active, row.added_by, row.standing_entry_id) == (True, "coach", None)


def test_the_add_refuses_a_student_off_the_roster_or_already_in_the_class(app, monkeypatch):
    from padel_app.models.users import User
    from padel_app.models.players import Player

    _quiet(monkeypatch)
    ids = _setup(app)
    c = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1)
    with app.app_context():
        enrolled = next(iter(_instance(c["instance_id"]).enrolled_player_ids))
        with pytest.raises(HTTPException) as e:
            _add(ids["coach_id"], c["instance_id"], enrolled, scope="occurrence")
        assert e.value.response.status_code == 409
        assert e.value.response.get_json()["code"] == "already_enrolled"

        u = User(name="Stranger", username="stranger547", email="s547@test.com", password="x", status="active")
        db.session.add(u); db.session.flush()
        stranger = Player(user_id=u.id); db.session.add(stranger); db.session.commit()
        with pytest.raises(HTTPException) as e:
            _add(ids["coach_id"], c["instance_id"], stranger.id, scope="occurrence")
        assert e.value.code == 404


# ── rule 19: the whole series ─────────────────────────────────────────────────

def test_a_series_entry_reaches_only_that_series_and_its_later_occurrences(app, monkeypatch):
    from padel_app.models.lessons import Lesson
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import add_standing_waiting_list_entry
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1, recurring=True)
    other = _add_class(app, ids, days=4, title="Quinta 19h", max_players=4, filled=1)
    carla = _student(app, ids, "carla")
    with app.app_context():
        end = utcnow_naive() + timedelta(days=60)
        result = _add(ids["coach_id"], series["instance_id"], carla, scope="series", credits=3, expires_at=end)
        entry = db.session.get(StandingWaitingListEntry, result["standingEntryId"])
        assert entry.lesson_id == series["lesson_id"] and entry.is_active
        assert _rows(series["instance_id"])[carla].standing_entry_id == entry.id
        assert carla not in _rows(other["instance_id"]), "a series entry never reaches the coach's other classes"

        lesson = db.session.get(Lesson, series["lesson_id"])
        next_week = _instance(series["instance_id"]).start_datetime.date() + timedelta(days=7)
        later = get_or_materialize_instance(lesson, next_week)
        db.session.commit()
        assert _rows(later.id)[carla].standing_entry_id == entry.id, "a later occurrence gains her row"

        coach_wide = add_standing_waiting_list_entry(ids["coach_id"], carla, 3, expires_at=end)
        db.session.expire_all()
        assert coach_wide.lesson_id is None
        assert db.session.get(StandingWaitingListEntry, entry.id).is_active, "the two scopes coexist"
        assert _rows(other["instance_id"])[carla].standing_entry_id == coach_wide.id


def test_a_second_series_entry_for_the_same_series_replaces_the_first(app, monkeypatch):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    series = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1, recurring=True)
    carla = _student(app, ids, "carla")
    with app.app_context():
        end = utcnow_naive() + timedelta(days=30)
        first = _add(ids["coach_id"], series["instance_id"], carla, scope="series", credits=2, expires_at=end)
        second = _add(ids["coach_id"], series["instance_id"], carla, scope="series", credits=5, expires_at=end)
        db.session.expire_all()
        assert db.session.get(StandingWaitingListEntry, first["standingEntryId"]).is_active is False
        assert db.session.get(StandingWaitingListEntry, second["standingEntryId"]).credits_total == 5


def test_the_series_scope_needs_a_recurring_class(app, monkeypatch):
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    one_off = _add_class(app, ids, days=3, title="Sábado", max_players=4, filled=1)
    carla = _student(app, ids, "carla")
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _add(ids["coach_id"], one_off["instance_id"], carla, scope="series", credits=1,
                 expires_at=utcnow_naive() + timedelta(days=10))
        assert e.value.code == 400


# ── rules 20–21: origin, order, remove ────────────────────────────────────────

def test_the_class_list_names_each_origin_and_a_remove_touches_that_class_only(app, monkeypatch):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.services.notification_service import (
        add_standing_waiting_list_entry, get_waiting_list, remove_from_class_waiting_list,
    )
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="Full", max_players=2, filled=2)
    elsewhere = _add_class(app, ids, days=5, title="Elsewhere", max_players=4, filled=1)
    bruno, carla = _student(app, ids, "bruno"), _student(app, ids, "carla")
    with app.app_context():
        standing_id = add_standing_waiting_list_entry(
            ids["coach_id"], bruno, 3, expires_at=utcnow_naive() + timedelta(days=30)).id
        _add(ids["coach_id"], full["instance_id"], carla, scope="occurrence")
    _join(app, ids, model="LessonInstance", original_id=full["instance_id"])  # the wizard student
    with app.app_context():
        rows = get_waiting_list(full["instance_id"], ids["coach_id"])
        by = {r["playerId"]: r for r in rows}
        assert by[bruno]["origin"] == "standing" and by[bruno]["standingEntryId"] == standing_id
        assert by[bruno]["seriesScoped"] is False
        assert by[carla]["origin"] == "coach"
        assert by[ids["student_id"]]["origin"] == "student"
        assert [r["playerId"] for r in rows] == [bruno, carla, ids["student_id"]], "join-time order"

        payload = serialize_class_instance(_instance(full["instance_id"]))
        assert {r["playerId"] for r in payload["waitingList"]} == {bruno, carla, ids["student_id"]}
        assert "waitingList" not in serialize_class_instance(_instance(full["instance_id"]), viewer_player_id=carla)

        bruno_row = next(r for r in rows if r["playerId"] == bruno)
        before = len(_messages_to(bruno))
        remove_from_class_waiting_list(bruno_row["id"], ids["coach_id"])
        db.session.expire_all()
        assert _rows(full["instance_id"])[bruno].is_active is False
        assert db.session.get(StandingWaitingListEntry, standing_id).is_active
        assert _rows(elsewhere["instance_id"])[bruno].is_active, "his other classes keep him"
        assert len(_messages_to(bruno)) == before
        again = remove_from_class_waiting_list(bruno_row["id"], ids["coach_id"])  # a repeat writes nothing
        db.session.expire_all()
        assert again["action"] == "removed" and _rows(full["instance_id"])[bruno].is_active is False


def test_only_the_classs_coach_removes_a_row(app, monkeypatch):
    from padel_app.models.coaches import Coach
    from padel_app.models.users import User
    from padel_app.services.notification_service import remove_from_class_waiting_list

    _quiet(monkeypatch)
    ids = _setup(app)
    c = _add_class(app, ids, days=3, title="Terça 18h", max_players=4, filled=1)
    carla = _student(app, ids, "carla")
    with app.app_context():
        row_id = _add(ids["coach_id"], c["instance_id"], carla, scope="occurrence")["entryId"]
        u = User(name="Other", username="other547", email="o547@test.com", password="x", status="active")
        db.session.add(u); db.session.flush()
        other = Coach(user_id=u.id); db.session.add(other); db.session.commit()
        with pytest.raises(HTTPException) as e:
            remove_from_class_waiting_list(row_id, other.id)
        assert e.value.code == 403


# ── rule 19 × join-requests rule 8: which entry an accepted request spends ────

def test_an_accepted_join_request_never_spends_another_series_entry(app, monkeypatch):
    """Review of PAD-547 (load-bearing): with a series entry and a coach-wide entry side by side,
    the accept spent the OLDER one whatever the class — here the entry of another series. It must
    spend the entry that queued the student on this class (here the coach-wide one), as the
    engine's own settle does (waiting-list rule 15), and never an entry of another series."""
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.notification_service import add_standing_waiting_list_entry
    from padel_app.tests.test_pad131_join_requests import LEVEL_SAME, _config, _decide, _request, _student as _s131
    from padel_app.tests.test_pad128_eligibility import _seed
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    pid = _s131(app, ids, "carla")
    other = _add_class(app, ids, days=6, title="Other series", recurring=True)
    with app.app_context():
        end = utcnow_naive() + timedelta(days=30)
        other_series = add_standing_waiting_list_entry(ids["coach_id"], pid, 3, expires_at=end, lesson_id=other["lesson_id"]).id
        coach_wide = add_standing_waiting_list_entry(ids["coach_id"], pid, 3, expires_at=end).id
    rid, _, _ = _request(app, ids, pid)
    assert _decide(app, ids, rid, accept=True) == "accepted"
    with app.app_context():
        used = {e.id: e.credits_used for e in StandingWaitingListEntry.query.all()}
    assert used[other_series] == 0, used
    assert used[coach_wide] == 1, used
