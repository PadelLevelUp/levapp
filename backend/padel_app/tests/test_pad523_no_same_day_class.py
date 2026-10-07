"""
PAD-523 — "do not invite a student who already has a class that day" (notifications.config
rule 6e; invite-simulation stage `has_class_same_day`).

A coach restriction, off by default. When on, a roster student who holds a spot in ANOTHER class
on the same club-local day (any coach; not absent, not declined; that class not cancelled) is
dropped by `evaluate_candidates` with stage `has_class_same_day`, so the engine, the waiting-list
wave, the simulation and the approval queue all agree. Dates are in 2027 so the real clock never
overtakes them; class times are the club's wall clock (R-023).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)

TARGET = datetime(2027, 7, 12, 18, 0)   # the class being filled, Monday 18:00 Lisbon
H = timedelta(hours=1)


def _seed(*, restriction_on: bool, other_start=None, other_status="scheduled",
          presence_status=None, presence_response="none", tag="a"):
    """Coach, two roster students (`busy` and `free`), the target class with one open vacancy, and
    (when `other_start` is given) another class, of another coach, that `busy` is enrolled on."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User
    from padel_app.models.vacancy import Vacancy

    def user(name):
        u = User(name=name.title(), username=f"p523{tag}{name}", email=f"p523{tag}{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach_user = user("coach")
    coach = Coach(user_id=coach_user.id)
    other_coach = Coach(user_id=user("othercoach").id)
    db.session.add_all([coach, other_coach])
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name=f"P523 {tag}", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()
    ids = {}
    for key in ("busy", "free"):
        p = Player(user_id=user(key).id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))
        ids[key] = p.id

    def make_class(start, coach_id, title, status="scheduled"):
        lesson = Lesson(title=title, start_datetime=start, end_datetime=start + H, is_recurring=False,
                        type="academy", max_players=4, color="#000", status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + H,
                              max_players=4, status=status, level_id=level.id, notifications_enabled=True,
                              original_lesson_occurence_date=start.date())
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=inst.id))
        return inst

    target = make_class(TARGET, coach.id, "Target")
    if other_start is not None:
        other = make_class(other_start, other_coach.id, "Other", status=other_status)
        db.session.add(Presence(player_id=ids["busy"], lesson_instance_id=other.id, invited=True,
                                enrolment_source="roster", status=presence_status,
                                response=presence_response))
    db.session.add(NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_groups=[{"id": "1", "rules": []}],
        no_same_day_class_enabled=restriction_on,
        restrictions={"maxSimultaneous": {"enabled": True, "value": 5},
                      "maxTotal": {"enabled": False, "value": 10}},
    ))
    vacancy = Vacancy(lesson_instance_id=target.id, coach_id=coach.id, status="open",
                      current_round_number=1, current_batch_number=0)
    db.session.add(vacancy)
    db.session.commit()
    return {**ids, "coach": coach.id, "coach_user": coach_user.id, "instance": target.id,
            "vacancy": vacancy.id}


def _verdicts(ids, *, wave=("group", 1), explain=False):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import evaluate_candidates, get_or_create_config

    return {v.cp.player_id: v.stage for v in evaluate_candidates(
        db.session.get(Vacancy, ids["vacancy"]), db.session.get(LessonInstance, ids["instance"]),
        ids["coach"], get_or_create_config(ids["coach"]), wave=wave, explain=explain)}


def test_on_a_student_with_another_class_that_day_is_not_invited(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _send_invitation_batch, get_or_create_config

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        ids = _seed(restriction_on=True, other_start=TARGET.replace(hour=10))
        assert _verdicts(ids) == {ids["busy"]: "has_class_same_day", ids["free"]: "invited"}
        sent = _send_invitation_batch(db.session.get(Vacancy, ids["vacancy"]),
                                      db.session.get(LessonInstance, ids["instance"]),
                                      get_or_create_config(ids["coach"]), ids["coach"])
        assert [int(s["id"]) for s in sent] == [ids["free"]]


def test_off_by_default_nothing_changes(app):
    with app.app_context():
        ids = _seed(restriction_on=False, other_start=TARGET.replace(hour=10))
        assert _verdicts(ids) == {ids["busy"]: "invited", ids["free"]: "invited"}


@pytest.mark.parametrize("case, kwargs", [
    ("next day 00:30 is another day", {"other_start": datetime(2027, 7, 13, 0, 30)}),
    ("previous day 23:30 is another day", {"other_start": datetime(2027, 7, 11, 23, 30)}),
    ("a spot marked absent is not held", {"other_start": TARGET.replace(hour=10), "presence_status": "absent"}),
    ("a declined spot is not held", {"other_start": TARGET.replace(hour=10), "presence_response": "declined"}),
    ("a cancelled class holds nothing", {"other_start": TARGET.replace(hour=10), "other_status": "canceled"}),
])
def test_on_what_does_not_count_as_a_class_that_day(app, case, kwargs):
    with app.app_context():
        ids = _seed(restriction_on=True, tag=case[:6].replace(" ", ""), **kwargs)
        assert _verdicts(ids)[ids["busy"]] == "invited", case


def test_the_day_is_the_club_day_at_both_ends(app):
    """00:00 and 23:59 of the target's wall date both count."""
    with app.app_context():
        early = _seed(restriction_on=True, other_start=datetime(2027, 7, 12, 0, 0), tag="early")
        assert _verdicts(early)[early["busy"]] == "has_class_same_day"
        late = _seed(restriction_on=True, other_start=datetime(2027, 7, 12, 23, 59), tag="late")
        assert _verdicts(late)[late["busy"]] == "has_class_same_day"


def test_the_simulation_and_the_waiting_list_wave_read_the_same_stage(app):
    """One pipeline: the coach-facing explain path and group 0 drop the student the same way."""
    with app.app_context():
        ids = _seed(restriction_on=True, other_start=TARGET.replace(hour=10))
        assert _verdicts(ids, explain=True)[ids["busy"]] == "has_class_same_day"
        assert _verdicts(ids, wave=("waiting_list", 0))[ids["busy"]] == "has_class_same_day"


def test_the_setting_round_trips_and_an_older_client_cannot_switch_it_off(app, client):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        ids = _seed(restriction_on=False)
        token = create_access_token(identity=str(ids["coach_user"]))
    auth = {"Authorization": f"Bearer {token}"}

    cfg = client.get("/api/app/notify/config", headers=auth).get_json()
    assert cfg["restrictions"]["noSameDayClass"] == {"enabled": False}

    restrictions = {**cfg["restrictions"], "noSameDayClass": {"enabled": True}}
    assert client.post("/api/app/notify/config", json={"restrictions": restrictions}, headers=auth).status_code == 200
    assert client.get("/api/app/notify/config", headers=auth).get_json()["restrictions"]["noSameDayClass"] == {"enabled": True}

    # An app from before PAD-523 saves its restrictions without the key: the stored value stays.
    legacy = {k: v for k, v in restrictions.items() if k != "noSameDayClass"}
    assert client.post("/api/app/notify/config", json={"restrictions": legacy}, headers=auth).status_code == 200
    assert client.get("/api/app/notify/config", headers=auth).get_json()["restrictions"]["noSameDayClass"] == {"enabled": True}

    restrictions["noSameDayClass"] = {"enabled": False}
    client.post("/api/app/notify/config", json={"restrictions": restrictions}, headers=auth)
    assert client.get("/api/app/notify/config", headers=auth).get_json()["restrictions"]["noSameDayClass"] == {"enabled": False}


def test_the_class_being_filled_does_not_count_against_itself(app):
    """Only the day's OTHER classes count. A place in the class being filled is not "another class
    that day" (the engine drops such a student earlier, as `already_enrolled`), so the lookup must
    exclude it; without that exclusion it would report the student busy because of this class."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import _players_with_a_class_that_day

    with app.app_context():
        ids = _seed(restriction_on=True)
        db.session.add(Presence(player_id=ids["free"], lesson_instance_id=ids["instance"], invited=True,
                                enrolment_source="roster"))
        db.session.commit()
        inst = db.session.get(LessonInstance, ids["instance"])
        assert _players_with_a_class_that_day([ids["free"], ids["busy"]], inst) == set()
