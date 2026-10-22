"""PAD-672 slice 1 — classes.join-requests rule 20, classes.academy-class-booking rule 6 and
notifications.waiting-list rule 4e: a join request and a waiting-list entry name the side the student
will play in that class.

Every App Store build up to 33 sends no `side` and no `join-side` capability: those requests keep
today's behaviour (coordinator, binding). Each "refused" cell sits beside a control that is taken
(R-032).
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.models import Presence
from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.tests.test_pad130_open_spots import _config
from padel_app.tests.test_pad611_student_relations import _instance

CAPABLE = {"X-LevApp-Capabilities": "open-spots,student-relations,full-classes,join-side"}
OLD_CLIENT = {"X-LevApp-Capabilities": "open-spots,student-relations,full-classes"}  # build 32/33


@pytest.fixture(autouse=True)
def _jwt_secret(app, monkeypatch):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda **kw: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: None)
    monkeypatch.setattr("padel_app.services.notification_service.publish", lambda event, recipients: None)


def _world(app, *, spot_sides=("right",), going=2, profile_side="left"):
    """A class of 4 with `going` students and one open vacancy per entry of `spot_sides`; a student
    whose profile side is `profile_side` who may see it."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    ids["class"] = _instance(app, ids, days=4, title="Sided")
    with app.app_context():
        for i in range(going):
            pid = _add_student(ids["coach_id"], f"going{i}", level_id=ids["level_ids"]["5"])
            db.session.add(Presence(player_id=pid, lesson_instance_id=ids["class"], invited=True,
                                    confirmed=True, enrolment_source="coach"))
        for side in spot_sides:
            db.session.add(Vacancy(lesson_instance_id=ids["class"], coach_id=ids["coach_id"], status="open",
                                   side=side, current_round_number=1, current_batch_number=0))
        pid = _add_student(ids["coach_id"], "seeker", level_id=ids["level_ids"]["5"])
        Association_CoachPlayer.query.filter_by(coach_id=ids["coach_id"], player_id=pid).one().side = profile_side
        db.session.commit()
        token = create_access_token(identity=str(db.session.get(Player, pid).user_id))
    ids.update(player_id=pid, auth={"Authorization": f"Bearer {token}"})
    return ids


def _ask(client, ids, headers, **body):
    payload = {"model": "LessonInstance", "originalId": ids["class"], "date": None, **body}
    return client.post("/api/app/class-join-requests", json=payload, headers={**ids["auth"], **headers})


def _wait(client, ids, headers, **body):
    payload = {"model": "LessonInstance", "originalId": ids["class"], "date": None, **body}
    return client.post("/api/app/class-waiting-list", json=payload, headers={**ids["auth"], **headers})


def _requests(app, ids):
    from padel_app.models.class_join_request import ClassJoinRequest

    with app.app_context():
        return [(r.status, r.side) for r in ClassJoinRequest.query.filter_by(player_id=ids["player_id"]).all()]


# ── old clients: today's behaviour ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("headers", [OLD_CLIENT, {}], ids=["build-32-33", "no-header"])
def test_an_old_client_without_side_is_taken_as_today_with_the_profile_side(app, client, headers):
    """Only a right spot is open and the student plays left: an old client's request is created as
    before (no side check, no 409), its side recorded as the profile side."""
    ids = _world(app, spot_sides=("right",), profile_side="left")
    resp = _ask(client, ids, headers)
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert _requests(app, ids) == [("pending", "left")]


# ── capable clients: the side round trip ─────────────────────────────────────────────────────────

def test_no_spot_of_the_side_answers_side_full_and_writes_nothing(app, client):
    ids = _world(app, spot_sides=("right",))
    resp = _ask(client, ids, CAPABLE, side="left")
    assert resp.status_code == 409
    assert resp.get_json()["code"] == "side_full" and resp.get_json()["sides"] == ["right"]
    assert _requests(app, ids) == []


@pytest.mark.parametrize("side,spots", [("left", ("left",)), ("left", (None,)), ("both", ("right",))],
                         ids=["own-side", "side-less-spot", "both"])
def test_a_spot_the_side_can_take_is_requested(app, client, side, spots):
    """The control of the cell above: a spot of the side, a side-less spot, or "both" for any spot."""
    ids = _world(app, spot_sides=spots)
    resp = _ask(client, ids, CAPABLE, side=side)
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert resp.get_json()["side"] == side
    assert _requests(app, ids) == [("pending", side)]


def test_a_class_with_room_but_no_vacancy_yet_takes_the_request(app, client):
    """Before its invitation window a class has places but no open vacancy: no side to refuse on."""
    ids = _world(app, spot_sides=())
    assert _ask(client, ids, CAPABLE, side="left").status_code == 201


# ── the waiting list with a side ─────────────────────────────────────────────────────────────────

def test_a_capable_client_joins_its_sides_waiting_list_while_the_other_side_has_a_spot(app, client):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _world(app, spot_sides=("right",))
    resp = _wait(client, ids, CAPABLE, side="left")
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    with app.app_context():
        entry = WaitingListEntry.query.filter_by(player_id=ids["player_id"]).one()
        assert (entry.is_active, entry.side) == (True, "left")


@pytest.mark.parametrize("headers,body", [(OLD_CLIENT, {}), (CAPABLE, {"side": "left"})],
                         ids=["old-client", "capable-own-side-open"])
def test_has_spots_still_refuses_where_it_did(app, client, headers, body):
    """An old client on a class with room, and a capable one whose own side has a spot."""
    ids = _world(app, spot_sides=("left",) if body else ("right",))
    resp = _wait(client, ids, headers, **body)
    assert resp.status_code == 409 and resp.get_json()["code"] == "has_spots"


# ── the accept and the coach's rows ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("side,written", [("left", "left"), ("both", "both")])  # slice 3: both is written
def test_the_accept_writes_the_side_on_the_presence(app, client, side, written):
    from padel_app.models import Coach
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.services.class_join_request_service import decide_join_request_service

    ids = _world(app, spot_sides=("left", "right"))
    assert _ask(client, ids, CAPABLE, side=side).status_code == 201
    with app.app_context():
        row = ClassJoinRequest.query.filter_by(player_id=ids["player_id"]).one()
        decide_join_request_service(row.id, db.session.get(Coach, ids["coach_id"]), accept=True, confirm=True)
        presence = Presence.query.filter_by(player_id=ids["player_id"], lesson_instance_id=ids["class"]).one()
        assert presence.side == written


@pytest.mark.parametrize("profile_side,suggested", [(None, "left"), ("right", None)])
def test_the_coach_is_offered_the_requested_side_for_a_profile_without_one(app, client, profile_side, suggested):
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.services.class_join_request_service import serialize_join_request

    ids = _world(app, spot_sides=("left",), profile_side=profile_side)
    assert _ask(client, ids, CAPABLE, side="left").status_code == 201
    with app.app_context():
        row = serialize_join_request(ClassJoinRequest.query.filter_by(player_id=ids["player_id"]).one())
        assert (row["side"], row["suggestedProfileSide"]) == ("left", suggested)


# ── Q2: a pending request whose side lost its last spot moves to that side's waiting list ────────

def _accept_other(app, ids, side, tag):
    """Another student's request for `side`, accepted by the coach: it fills a spot of that side."""
    from padel_app.models import Coach
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.services.class_join_request_service import decide_join_request_service

    with app.app_context():
        pid = _add_student(ids["coach_id"], tag, level_id=ids["level_ids"]["5"])
        row = ClassJoinRequest(lesson_instance_id=ids["class"], player_id=pid, coach_id=ids["coach_id"],
                               status="pending", side=side)
        db.session.add(row)
        db.session.commit()
        decide_join_request_service(row.id, db.session.get(Coach, ids["coach_id"]), accept=True, confirm=True)


@pytest.mark.parametrize("filled,moves", [("left", True), ("right", False)])
def test_a_pending_request_whose_side_spot_is_taken_moves_to_that_sides_waiting_list(app, client, filled, moves):
    """Two open spots, left and right; the seeker asked for left. Another student takes the LEFT one:
    the seeker's request is superseded and they are on the left waiting list, told so. The control:
    the RIGHT one is taken, and the seeker's request stays pending."""
    from padel_app.models import Message
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _world(app, spot_sides=("left", "right"))
    assert _ask(client, ids, CAPABLE, side="left").status_code == 201
    _accept_other(app, ids, filled, "taker")
    with app.app_context():
        entry = WaitingListEntry.query.filter_by(player_id=ids["player_id"], lesson_instance_id=ids["class"]).first()
        told = [m.text for m in Message.query.all() if "lista de espera da esquerda" in (m.text or "")]
    if moves:
        assert _requests(app, ids) == [("superseded", "left")]
        assert (entry.is_active, entry.side) == (True, "left")
        assert len(told) == 1
    else:
        assert _requests(app, ids) == [("pending", "left")]
        assert entry is None and told == []


# ── waiting-list rule 4e: group 0 by the entry's side ────────────────────────────────────────────

@pytest.mark.parametrize("entry_side,spot_side,asked", [
    ("left", "right", False), ("left", "left", True), ("left", None, True), ("both", "right", True), (None, "right", True),
])
def test_group_0_asks_an_entry_only_for_a_spot_its_side_can_take(app, entry_side, spot_side, asked):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import _waiting_list_candidates

    ids = _world(app, spot_sides=(spot_side,))
    with app.app_context():
        db.session.add(WaitingListEntry(lesson_instance_id=ids["class"], player_id=ids["player_id"],
                                        coach_id=ids["coach_id"], is_active=True, side=entry_side))
        db.session.commit()
        vacancy = Vacancy.query.filter_by(lesson_instance_id=ids["class"]).one()
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one()
        found = [cp.player_id for _, cp in _waiting_list_candidates(
            vacancy, db.session.get(LessonInstance, ids["class"]), ids["coach_id"], config)]
    assert (ids["player_id"] in found) is asked


def test_a_standing_entry_carries_its_side_to_the_classes_it_fans_out_to(app):
    from padel_app.models.lessons import Lesson
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import add_standing_waiting_list_entry
    from datetime import timedelta
    from padel_app.utils.dates import utcnow_naive

    ids = _world(app, spot_sides=())
    with app.app_context():
        lesson_id = db.session.get(LessonInstance, ids["class"]).lesson_id
        entry = add_standing_waiting_list_entry(ids["coach_id"], ids["player_id"], 3,
                                                expires_at=utcnow_naive() + timedelta(days=30),
                                                lesson_id=lesson_id, side="right")
        fanned = WaitingListEntry.query.filter_by(standing_entry_id=entry.id).all()
        assert entry.side == "right"
        assert fanned and {e.side for e in fanned} == {"right"}


def test_the_side_full_answer_names_the_requested_side_and_the_waiting_list_echoes_its_side(app, client):
    """D's additions to the contract: `requestedSide` on the 409 and `side` on the list's answer."""
    ids = _world(app, spot_sides=("right",))
    refused = _ask(client, ids, CAPABLE, side="left").get_json()
    assert (refused["code"], refused["requestedSide"]) == ("side_full", "left")
    joined = _wait(client, ids, CAPABLE, side="left")
    assert joined.status_code == 201 and joined.get_json()["side"] == "left"


@pytest.mark.parametrize("profile_side", ["left", None])
def test_the_student_reads_their_profile_side_for_the_picker(app, client, profile_side):
    """Rule 20 / Q1: the student's own class payload carries `profileSide` with this class's coach."""
    ids = _world(app, spot_sides=("right",), profile_side=profile_side)
    resp = client.post("/api/app/class_instance", query_string={"model": "LessonInstance", "id": ids["class"]},
                       headers={**ids["auth"], **CAPABLE})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    assert resp.get_json()["profileSide"] == profile_side
