"""PAD-929 — visible private lessons. The "Marcar Aula" academy step lists academy classes only
(classes.academy-class-booking rule 2); `type=private` lists the coach's visible private lessons the
student may join (rule 12); a private join or waiting-list join from a client that declares
`private-confirm` needs `privateConfirmed: true` (classes.join-requests rule 22, NJ1); other students
find a private lesson only on their calendar and in that list (eligibility.open-spot-visibility 3a).

Seed: PAD-358's (coach with open spots visible, student "wizard" at level 5, LEVEL_SAME bar), with
each class turned private after it is added. A private class is hidden by default (PAD-429), so
"visible" sets the occurrence's own `open_spots_visible`.
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student
from padel_app.tests.test_pad358_academy_classes import _add_class, _by_title, _count, _list, _setup

CAPS = "X-LevApp-Capabilities"


def _private(app, ids, *, title, days=2, visible=True, **kw):
    """`_add_class`, then the lesson made private; `visible` is the occurrence's own setting."""
    from padel_app.models.lessons import Lesson

    made = _add_class(app, ids, days=days, title=title, visible=True if visible else None, **kw)
    with app.app_context():
        db.session.get(Lesson, made["lesson_id"]).type = "private"
        db.session.commit()
    return made


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _student(app, ids, player_id=None, caps=None):
    from padel_app.models.players import Player

    with app.app_context():
        user_id = db.session.get(Player, player_id or ids["student_id"]).user_id
    headers = _token(app, user_id)
    if caps:
        headers[CAPS] = caps
    return headers


def _new_student(app, ids, name, level="5"):
    with app.app_context():
        pid = _add_student(ids["coach_id"], name, level_id=ids["level_ids"][level])
        db.session.commit()
        return pid


def _target(made):
    return {"model": "LessonInstance", "originalId": made["instance_id"]}


# ── CLASSES-ACADEMY-CLASS-BOOKING-20: the academy step lists academy classes only ────────────────

@pytest.mark.criterion("CLASSES-ACADEMY-CLASS-BOOKING-20")
def test_the_academy_step_lists_academy_classes_only(app, client):
    ids = _setup(app)
    _add_class(app, ids, days=1, title="Academy", max_players=6)
    _private(app, ids, title="Private Visible", max_players=2)
    _private(app, ids, title="Private Hidden", max_players=2, visible=False)

    # The seed's own "Class" is an academy class too.
    assert set(_by_title(_list(app, ids))) == {"Class", "Academy"}

    student = _student(app, ids)
    url = f"/api/app/academy-classes?coachId={ids['coach_id']}"
    default = client.get(url, headers=student).get_json()
    academy = client.get(url + "&type=academy", headers=student).get_json()
    assert set(_by_title(default)) == set(_by_title(academy)) == {"Class", "Academy"}
    for bad in ("bogus", "", "Private", "ACADEMY"):
        assert client.get(url + f"&type={bad}", headers=student).status_code == 400, bad

    # The 400 for `type` comes before the roster's 403.
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name="stranger", username="stranger", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()
        stranger = _token(app, user.id)
    assert client.get(url + "&type=bogus", headers=stranger).status_code == 400
    assert client.get(url, headers=stranger).status_code == 403


# ── CLASSES-ACADEMY-CLASS-BOOKING-21: the private read ───────────────────────────────────────────

@pytest.mark.criterion("CLASSES-ACADEMY-CLASS-BOOKING-21")
def test_the_private_read_lists_only_visible_private_lessons_the_student_may_join(app, client):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import enrol

    ids = _setup(app)
    _add_class(app, ids, days=1, title="Academy", max_players=6)
    _private(app, ids, title="Open", max_players=2, filled=1)
    _private(app, ids, title="Full", days=3, max_players=1, filled=1)
    _private(app, ids, title="Hidden", max_players=2, visible=False)
    _private(app, ids, title="Above", max_players=2, level="4")
    mine = _private(app, ids, title="Mine", max_players=2)
    _private(app, ids, title="Virtual", days=4, max_players=2, materialize=False, recurring=True)
    with app.app_context():
        enrol(ids["student_id"], db.session.get(LessonInstance, mine["instance_id"]), "coach")
        db.session.commit()

    before = _count(app, "LessonInstance")
    url = f"/api/app/academy-classes?coachId={ids['coach_id']}&type=private"
    res = client.get(url, headers=_student(app, ids))
    assert res.status_code == 200
    rows = _by_title(res.get_json())
    # "Virtual" is a series with no setting of its own: private resolves hidden (rule 3a).
    assert set(rows) == {"Open", "Full"}
    assert rows["Open"]["state"] == "open" and rows["Full"]["state"] == "full"
    assert {r["classType"] for r in rows.values()} == {"private"}
    assert _count(app, "LessonInstance") == before

    stranger = _new_student(app, ids, "other-coach-student")
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    with app.app_context():
        Association_CoachPlayer.query.filter_by(player_id=stranger).delete()
        db.session.commit()
    assert client.get(url, headers=_student(app, ids, stranger)).status_code == 403


# ── CLASSES-JOIN-REQUESTS-42: an unconfirmed private join from a declaring client ────────────────

def _post(client, path, headers, made, **extra):
    return client.post(f"/api/app/{path}", headers=headers, json={**_target(made), **extra})


def _rows(app):
    return _count(app, "ClassJoinRequest"), _count(app, "WaitingListEntry")


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-42")
def test_a_private_join_needs_the_confirmation_from_a_declaring_client(app, client, monkeypatch):
    from padel_app.models import EngineInvitation, Presence
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.utils import client_capabilities as cc
    from padel_app.utils.dates import utcnow_naive

    ids = _setup(app)
    open_ = _private(app, ids, title="Open", max_players=2, filled=1)
    full = _private(app, ids, title="Full", days=3, max_players=2, filled=2)
    hidden = _private(app, ids, title="Hidden", max_players=2, visible=False)
    academy = _add_class(app, ids, days=1, title="Academy", max_players=6)
    declaring = _student(app, ids, caps="open-spots, private-confirm")

    # Unconfirmed, or confirmed with anything but JSON true: refused, nothing written.
    for extra in ({}, {"privateConfirmed": "true"}, {"privateConfirmed": 1}):
        req = _post(client, "class-join-requests", declaring, open_, **extra)
        wl = _post(client, "class-waiting-list", declaring, full, **extra)
        for res in (req, wl):
            assert res.status_code == 409 and res.get_json()["code"] == "private_unconfirmed", extra
    assert _rows(app) == (0, 0)

    # A hidden private lesson never says it exists: `not_visible` comes first.
    for path in ("class-join-requests", "class-waiting-list"):
        res = _post(client, path, declaring, hidden)
        assert res.status_code == 409 and res.get_json()["code"] == "not_visible"

    # An academy class needs no confirmation.
    assert _post(client, "class-join-requests", declaring, academy).status_code == 201

    # Confirmed: the request and the entry are created.
    assert _post(client, "class-join-requests", declaring, open_, privateConfirmed=True).status_code == 201
    assert _post(client, "class-waiting-list", declaring, full, privateConfirmed=True).status_code == 201

    # A client that does not declare the token, or whose token is switched off, is served as before.
    old = _new_student(app, ids, "old-build")
    assert _post(client, "class-join-requests", _student(app, ids, old, caps="open-spots"), open_).status_code == 201
    assert _post(client, "class-waiting-list", _student(app, ids, old), full).status_code == 201
    switched = _new_student(app, ids, "switched")
    monkeypatch.setattr(cc, "switched_off", lambda: {"private-confirm": {"off": True}})
    headers = _student(app, ids, switched, caps="private-confirm")
    assert _post(client, "class-join-requests", headers, open_).status_code == 201
    assert _post(client, "class-waiting-list", headers, full).status_code == 201
    monkeypatch.undo()

    # Exempt on the waiting list: a student invited to that class, and one who gave up their place.
    invited = _new_student(app, ids, "invited")
    gave_up = _new_student(app, ids, "gave-up")
    with app.app_context():
        db.session.add(EngineInvitation(lesson_instance_id=full["instance_id"], player_id=invited,
                                        coach_id=ids["coach_id"], offer={}, sent_at=utcnow_naive()))
        instance = db.session.get(LessonInstance, full["instance_id"])
        enrol(gave_up, instance, "coach")
        presence = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=gave_up).first()
        presence.status = "absent"
        db.session.commit()
    for pid in (invited, gave_up):
        res = _post(client, "class-waiting-list", _student(app, ids, pid, caps="private-confirm"), full)
        assert res.status_code == 201, (pid, res.get_json())


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-42")
def test_the_confirmation_is_checked_before_the_new_engine_is_asked(app, client, monkeypatch):
    from padel_app.services import class_join_request_service, engine_entry, engine_switch

    ids = _setup(app)
    open_ = _private(app, ids, title="Open", max_players=2, filled=1)
    full = _private(app, ids, title="Full", days=3, max_players=2, filled=2)
    monkeypatch.setattr(engine_switch, "engine_for", lambda instance: "new")

    def never(*a, **k):
        raise AssertionError("the engine was asked about an unconfirmed private join")

    monkeypatch.setattr(class_join_request_service, "_join_new_engine", never)
    monkeypatch.setattr(engine_entry, "student_joins_waiting_list", never)
    declaring = _student(app, ids, caps="private-confirm")
    for path, made in (("class-join-requests", open_), ("class-waiting-list", full)):
        res = _post(client, path, declaring, made)
        assert res.status_code == 409 and res.get_json()["code"] == "private_unconfirmed"
    assert _rows(app) == (0, 0)


# ── ELIGIBILITY-OPEN-SPOT-VISIBILITY-18: where other students find a private lesson ─────────────

@pytest.mark.criterion("ELIGIBILITY-OPEN-SPOT-VISIBILITY-18")
def test_a_private_lesson_is_found_only_in_the_calendar_and_the_private_list(app, client):
    from datetime import timedelta

    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.utils.dates import utcnow_naive

    ids = _setup(app)
    made = _private(app, ids, title="Private", max_players=2)
    carla = _new_student(app, ids, "carla")
    with app.app_context():
        enrol(carla, db.session.get(LessonInstance, made["instance_id"]), "coach")
        db.session.commit()
    now = utcnow_naive()
    window = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=14)).isoformat()}

    def calendar(pid):
        return client.get("/api/app/calendar", query_string=window,
                          headers=_student(app, ids, pid, caps="open-spots")).get_json()

    def bruno_sees():
        return [e for e in calendar(ids["student_id"]) if e.get("title") == "Private" and e.get("openSpot")]

    def carla_has_it():
        return any(e.get("title") == "Private" and not e.get("openSpot") for e in calendar(carla))

    assert len(bruno_sees()) == 1 and carla_has_it()

    with app.app_context():
        db.session.get(LessonInstance, made["instance_id"]).open_spots_visible = None   # back to the default
        db.session.commit()
    assert bruno_sees() == [] and carla_has_it()
