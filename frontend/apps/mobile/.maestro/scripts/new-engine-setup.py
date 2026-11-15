"""PAD-920: the hand-run setup of the `hand-run-setup` Maestro flows (319-321). No endpoint switches a
coach to the new engine, and Maestro's scripts can only call HTTP, so the runner calls this first,
with the backend's venv and the same POSTGRES_* env the Flask under test uses:

    cd backend && .venv/bin/python ../frontend/apps/mobile/.maestro/scripts/new-engine-setup.py switch
    cd backend && .venv/bin/python ../frontend/apps/mobile/.maestro/scripts/new-engine-setup.py invite

`switch` (flow 319): e2e-coach goes to the new engine through the real `engine_switch.switch_coach`
(notifications.config rule 18).

`invite` (flows 320, 321): the engine on, the invitation window opened at once (a week before the
class), the switch, then a one-off academy class "E2E New Engine iOS" 3 days out (4 if that is a
Monday, the seeded classes' day) with E2E Student on the coach's list for it (tier 0, which skips the
pool's level and same-day gates). That add runs the engine inline, which invites E2E Student (and the
pool) and sends the bubbles; one `engine_runner.run_tick()` follows for anything left due. Flow 321's
teardown removes the class.
"""
import sys
from datetime import date, timedelta

from padel_app import create_app
from padel_app.models.coaches import Coach
from padel_app.models.users import User

COACH = ("e2e-coach", "E2eCoach123!")
CLASS_NAME = "E2E New Engine iOS"


def _coach_id() -> int:
    user = User.query.filter_by(username=COACH[0]).one()
    return Coach.query.filter_by(user_id=user.id).one().id


def switch() -> int:
    from padel_app.services.engine_switch import switch_coach

    coach_id = _coach_id()
    adopted = switch_coach(coach_id)
    print(f"switched coach {coach_id} ({COACH[0]}) to new; adopted {len(adopted)} sessions")
    return coach_id


def invite(app) -> None:
    from padel_app.models.lessons import Lesson
    from padel_app.services.engine_runner import run_tick
    from padel_app.services.engine_switch import engine_for
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import (
        add_to_class_waiting_list,
        get_or_create_config,
        update_config,
    )
    from padel_app.sql_db import db

    coach_id = _coach_id()
    config = get_or_create_config(coach_id)
    config.auto_notify_enabled = True
    db.session.commit()
    update_config(coach_id, {"invitationStartTiming": {"type": "hours_before", "value": 168}})
    switch()

    client = app.test_client()
    token = client.post("/api/auth/login", json={"username": COACH[0], "password": COACH[1]}).get_json()["accessToken"]
    auth = {"Authorization": f"Bearer {token}"}
    players = client.get("/api/app/coach_players", headers=auth).get_json()
    players = players["items"] if isinstance(players, dict) else players
    student = next(p for p in players if p["name"] == "E2E Student")

    day = date.today() + timedelta(days=3)
    if day.weekday() == 0:
        day += timedelta(days=1)
    made = client.post("/api/app/add_class", headers=auth, json={
        "name": CLASS_NAME, "classType": "academy", "maxPlayers": 4, "levelId": student["levelId"],
        "date": day.isoformat(), "startTime": "17:00", "endTime": "18:00", "playerIds": [],
        "isRecurring": False, "notificationsEnabled": True,
    })
    assert made.status_code in (200, 201), made.get_data(as_text=True)
    lesson = db.session.get(Lesson, made.get_json()["originalId"])
    instance = get_or_materialize_instance(lesson, day)
    db.session.commit()
    assert engine_for(instance) == "new", "the occurrence was not adopted onto the new engine"

    add_to_class_waiting_list(coach_id, instance, int(student["playerId"]), scope="occurrence", side="both")
    db.session.commit()
    print(f"class {CLASS_NAME!r} on {day}: instance {instance.id}; E2E Student on the coach's list")
    print(f"run_tick: {run_tick()}")


def main(argv: list[str]) -> None:
    app = create_app()
    with app.app_context():
        if argv[:1] == ["invite"]:
            invite(app)
        else:
            switch()


if __name__ == "__main__":
    main(sys.argv[1:])
