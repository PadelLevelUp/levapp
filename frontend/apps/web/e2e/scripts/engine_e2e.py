#!/usr/bin/env python
"""PAD-920: the new engine's E2E setup, shared by Playwright and the Maestro runner.

The app has no route that switches a coach (notifications.config rule 18 is a support action), so the
suites call the real code here, against the database the env names (read as seed.py reads it):

  python engine_e2e.py switch <coach-username>          engine_switch.switch_coach
  python engine_e2e.py invite <class-title> <username>… one invitation each to the one-off class's first
                                                         open spot type, then the outbox is sent (the bubbles)
  python engine_e2e.py tick                             engine_runner.run_tick
  python engine_e2e.py restore <coach-username>         back on the old engine, for the suites after
  python engine_e2e.py unsnooze <coach-username> <item>  drops the coach's "Later" on one needs-you item

``invite`` writes the engine's own ``Invited`` effect, as the backend tests do, so a spec does not depend
on the coach's invitation window; the answers then go through the real routes. ``restore`` is test-only:
the real switch is one way. ``unsnooze`` is test-only too (PAD-935): the app has no route that undoes
"Later", and the seed has one empty-seats card a week, which the specs after B-030 need. Prints one
JSON line.
"""
import json
import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../../../../../backend")

from padel_app import create_app  # noqa: E402
from padel_app.sql_db import db  # noqa: E402


def _coach_id(username: str) -> int:
    from padel_app.models.coaches import Coach
    from padel_app.models.users import User

    user = User.query.filter_by(username=username).one()
    return Coach.query.filter_by(user_id=user.id).one().id


def _player_id(username: str) -> str:
    from padel_app.models.players import Player
    from padel_app.models.users import User

    user = User.query.filter_by(username=username).one()
    return str(Player.query.filter_by(user_id=user.id).one().id)


def switch(username: str) -> dict:
    from padel_app.services.engine_switch import switch_coach

    return {"adopted": switch_coach(_coach_id(username))}


def _instance_of(title: str) -> int:
    """The one occurrence of the one-off class a spec created with this title, materialised through
    the app's own path (which puts a switched coach's new occurrence on the new engine)."""
    from padel_app.models import EngineSession
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    lesson = Lesson.query.filter_by(title=title).order_by(Lesson.id.desc()).first()
    if lesson is None:
        raise SystemExit(f"no class titled {title!r}")
    instance = get_or_materialize_instance(lesson, lesson.start_datetime.date())
    db.session.commit()
    if db.session.get(EngineSession, instance.id) is None:
        raise SystemExit(f"occurrence {instance.id} of {title!r} is not on the new engine")
    return instance.id


def invite(title: str, usernames: list[str]) -> dict:
    from padel_app.invitation_engine import effects as fx
    from padel_app.invitation_engine.planner import side_named, spot_counts, spot_types, type_sides
    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.models import EngineInvitation
    from padel_app.services.engine_outbox import send_effect
    from padel_app.services.engine_store import TableStore, dispatch
    from padel_app.utils.dates import utcnow_naive

    now = utcnow_naive()
    store = TableStore(clock=lambda: now)
    session = str(_instance_of(title))
    snapshot = store.snapshot(session)
    types = spot_types(snapshot)
    if not types:
        raise SystemExit(f"session {session} has no open spot")
    # The offer as the planner writes it: the type's concrete sides the student plays (an either-side
    # spot stands for every open side), and the side named only when it is outside theirs.
    values = type_sides(types[0][0], spot_counts(snapshot))
    students = [_player_id(u) for u in usernames]
    effects = []
    for sid in students:
        student = snapshot.students.get(sid)
        sides = (values & student.sides) or values if student else values
        offer = frozenset(SpotType(v, snapshot.level) for v in sorted(sides))
        named = side_named(sides, student) if student else None
        effects.append(fx.Invited(session, now, sid, offer, named, 2, now + timedelta(minutes=30)))
    with store.unit((session,)):
        store.apply(effects)
    dispatch(send_effect, now=now)
    rows = EngineInvitation.query.filter_by(lesson_instance_id=int(session)).all()
    by_player = {str(r.player_id): r.id for r in rows}
    return {"instanceId": int(session), "invitations": {u: by_player[s] for u, s in zip(usernames, students)}}


def tick() -> dict:
    from padel_app.services.engine_runner import run_tick

    return {"sent": run_tick()}


def restore(username: str) -> dict:
    from padel_app.models import EngineSession
    from padel_app.models.notification_config import NotificationConfig

    coach_id = _coach_id(username)
    gone = EngineSession.query.filter_by(coach_id=coach_id).delete()
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is not None:
        config.engine_version, config.engine_switched_at = "old", None
    db.session.commit()
    return {"sessionsRemoved": gone}


def unsnooze(username: str, item_id: str) -> dict:
    from padel_app.models import NeedsYouSnooze

    gone = NeedsYouSnooze.query.filter_by(coach_id=_coach_id(username), item_id=item_id).delete()
    db.session.commit()
    return {"snoozesRemoved": gone}


def main(argv: list[str]) -> None:
    if not argv:
        raise SystemExit(__doc__)
    command, args = argv[0], argv[1:]
    app = create_app()
    with app.app_context():
        if command == "switch":
            out = switch(args[0])
        elif command == "invite":
            out = invite(args[0], args[1:])
        elif command == "tick":
            out = tick()
        elif command == "restore":
            out = restore(args[0])
        elif command == "unsnooze":
            out = unsnooze(args[0], args[1])
        else:
            raise SystemExit(f"unknown command {command!r}")
    print(json.dumps(out))


if __name__ == "__main__":
    main(sys.argv[1:])
