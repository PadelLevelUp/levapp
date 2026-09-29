"""
PAD-449 — a player the coach excluded is never invited (notifications.config rule 6,
`restrictions.excludedPlayers`), and the coach's chip names them after a reload (rule 14a,
B-168, shipped in #424).

The ticket asked to confirm the exclusion itself works. The waiting-list path had a test
(test_pad128_eligibility::test_waiting_list_placement_honours_excluded_players); the
invitation path, `evaluate_candidates` → `_send_invitation_batch`, had none. Two students on
the roster, the first excluded: the batch invites only the second, and the verdict for the
first is `excluded_by_coach`.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)


def _seed():
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.users import User
    from padel_app.models.vacancy import Vacancy

    def user(username, name):
        u = User(name=name, username=username, email=f"{username}@t.test", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach_user = user("p449coach", "Coach 449")
    coach = Coach(user_id=coach_user.id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name="P449 Club", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()

    players = {}
    for key, name in (("excluded", "Excluded Student"), ("other", "Other Student")):
        p = Player(user_id=user(f"p449{key}", name).id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))
        players[key] = p.id

    start = datetime.utcnow() + timedelta(hours=12)
    lesson = Lesson(title="P449", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=1, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=1,
                              status="scheduled", level_id=level.id, notifications_enabled=True)
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
    db.session.add(NotificationConfig(
        coach_id=coach.id,
        auto_notify_enabled=True,
        invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"maxSimultaneous": {"enabled": True, "value": 5},
                      "maxTotal": {"enabled": False, "value": 10},
                      "excludedPlayers": {"enabled": True, "playerIds": [str(players["excluded"])]}},
    ))
    vacancy = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open",
                      current_round_number=1, current_batch_number=0)
    db.session.add(vacancy)
    db.session.commit()
    return {"coach_id": coach.id, "coach_user_id": coach_user.id, "instance_id": instance.id,
            "vacancy_id": vacancy.id, **players}


def test_an_excluded_player_is_not_invited(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import (
        _send_invitation_batch, evaluate_candidates, get_or_create_config,
    )

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        ids = _seed()
        vacancy = Vacancy.query.get(ids["vacancy_id"])
        instance = LessonInstance.query.get(ids["instance_id"])
        config = get_or_create_config(ids["coach_id"])

        verdicts = {v.cp.player_id: v.stage for v in evaluate_candidates(
            vacancy, instance, ids["coach_id"], config, wave=("group", 1))}
        assert verdicts[ids["excluded"]] == "excluded_by_coach"
        assert verdicts[ids["other"]] == "invited"

        sent = _send_invitation_batch(vacancy, instance, config, ids["coach_id"])
        assert [s["id"] for s in sent] == [str(ids["other"])]


def test_the_coach_sees_the_excluded_players_name_after_a_reload(app, client):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        ids = _seed()
        token = create_access_token(identity=str(ids["coach_user_id"]))
    cfg = client.get("/api/app/notify/config", headers={"Authorization": f"Bearer {token}"}).get_json()
    assert cfg["restrictions"]["excludedPlayers"]["playerIds"] == [str(ids["excluded"])]
    assert cfg["excludedPlayerNames"] == {str(ids["excluded"]): "Excluded Student"}
