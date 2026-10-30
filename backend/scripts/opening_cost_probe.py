#!/usr/bin/env python3
"""Cost probe for opening a class's never-filled places (PAD-788).

On a throwaway Postgres database built by the real migrations, seeds one coach with a roster
(the PAD-276 probe's seed: levels, sides, device tokens, availability blockers, attendance
history), adds one future class with `--seats` free places and nobody enrolled, and runs the
2-minute engine tick (`process_invitation_batches`) the way the scheduler does: the first tick
opens the places, the next ones send the later batches. For each tick it reports Python CPU
time (`time.process_time`, every thread of this process), wall time, time spent inside SQL
statements, statement and commit counts, invitations sent and pushes made.

    cd backend && python scripts/opening_cost_probe.py --students 300 --seats 16 --ticks 6

Expo is stubbed (no network). Reads POSTGRES_HOST/PORT/USER/PW like the test suite: set
POSTGRES_HOST=localhost. Builds `levelup_pad788_probe` and drops it at the end unless --keep-db.
"""
import argparse
import json
import pathlib
import sys
import time
from datetime import datetime, timedelta
from unittest.mock import patch

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))

from notification_cost_probe import (  # noqa: E402  (shares the PAD-276 probe's seed and counter)
    BASE_TEST_CONFIG,
    MIGRATIONS_DIR,
    Counter_,
    PushStub,
    _drop_database,
    _postgres_settings,
    _run_admin,
    counting,
    seed,
)
from padel_app import create_app  # noqa: E402
from padel_app.sql_db import db, init_db  # noqa: E402

DB_NAME = "levelup_pad788_probe"


class SqlClock:
    """Wall time spent inside cursor executes."""

    def __init__(self):
        self.ms = 0.0
        self._t0 = None

    def before(self, *a, **k):
        self._t0 = time.perf_counter()

    def after(self, *a, **k):
        if self._t0 is not None:
            self.ms += (time.perf_counter() - self._t0) * 1000
            self._t0 = None


def reference_now():
    """Tomorrow 10:30 UTC: a weekday-morning opening, outside any quiet hours."""
    d = datetime.utcnow().date() + timedelta(days=1)
    return datetime(d.year, d.month, d.day, 10, 30)


PROD_SHAPE_GROUPS = [  # PAD-788: the shape of the coach whose openings were measured (rules only, no data)
    [("level", "one_above_vacancy"), ("side", "same_as_vacancy"), ("has_makeups", "is_true")],
    [("level", "same_as_vacancy"), ("side", "same_as_vacancy"), ("has_makeups", "is_true")],
    [("level", "one_above_vacancy"), ("side", "same_as_vacancy")],
    [("level", "same_as_vacancy"), ("side", "same_as_vacancy")],
    [("level", "one_above_vacancy"), ("has_makeups", "is_true")],
    [("level", "same_as_vacancy"), ("has_makeups", "is_true")],
    [("level", "one_above_vacancy")],
    [("level", "same_as_vacancy"), ("subscription_status", "equals", "active")],
]


def apply_prod_shape(ids, args):
    """`--prod-shape`: 8 invitation groups, an unjustified-absence bar, 3 simultaneous / 5 total,
    invitations 24 h before; all but `--active` roster accounts inactive (coach-created, never
    activated); `--past-instances` completed classes on the coach's books."""
    from sqlalchemy import text

    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.users import User

    c0 = ids["coaches"][0]
    cfg = NotificationConfig.query.filter_by(coach_id=c0["coach_id"]).one()
    cfg.invitation_groups = [
        {"id": str(i + 1), "rules": [
            {"attribute": r[0], "operation": r[1], **({"value": r[2]} if len(r) > 2 else {})} for r in g]}
        for i, g in enumerate(PROD_SHAPE_GROUPS)
    ]
    cfg.eligibility_rules = [{"attribute": "unjustified_absences", "operation": "less_than", "value": 3}]
    cfg.max_simultaneous_enabled, cfg.max_simultaneous_value = True, 3
    cfg.max_total_enabled, cfg.max_total_value = True, 5
    cfg.no_same_day_class_enabled = True
    cfg.invitation_start_type, cfg.invitation_start_value = "hours_before", 24
    player_user_ids = [u for (u,) in db.session.execute(text(
        "SELECT p.user_id FROM players p WHERE p.id = ANY(:ids) ORDER BY p.id"), {"ids": c0["player_ids"]})]
    inactive = player_user_ids[args.active:]
    if inactive:
        User.query.filter(User.id.in_(inactive)).update({User.status: "inactive"}, synchronize_session=False)
    if args.past_instances:
        lesson_id = c0["lesson_ids"][0]
        db.session.execute(text("""
            WITH s AS (
              INSERT INTO lesson_instances (lesson_id, start_datetime, end_datetime, max_players, status, level_id)
              SELECT :lid, now() - (g || ' days')::interval - interval '400 days',
                     now() - (g || ' days')::interval - interval '400 days' + interval '1 hour', 4, 'completed', NULL
              FROM generate_series(1, :n) g RETURNING id)
            INSERT INTO coach_in_lesson_instance (coach_id, lesson_instance_id) SELECT :cid, id FROM s
        """), {"lid": lesson_id, "n": args.past_instances, "cid": c0["coach_id"]})
    db.session.commit()


def add_open_class(ids, args):
    """One future class, `seats` places, nobody enrolled; every seeded class is muted so the
    tick sees this one only."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.vacancy import Vacancy

    c0 = ids["coaches"][0]
    LessonInstance.query.update({LessonInstance.notifications_enabled: False})
    Vacancy.query.update({Vacancy.status: "expired"})
    lesson = db.session.get(Lesson, c0["lesson_ids"][0])
    lesson.max_players = args.seats
    st = reference_now() + timedelta(hours=args.hours_ahead)
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=st, end_datetime=st + timedelta(hours=1),
                          max_players=args.seats, status="scheduled", level_id=lesson.default_level_id,
                          notifications_enabled=True)
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=c0["coach_id"], lesson_instance_id=inst.id))
    db.session.commit()
    return inst.id


def run_ticks(app, args, push_stub):
    from sqlalchemy import event

    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns

    engine = db.get_engine(app)
    counter, clock = Counter_(), SqlClock()
    event.listen(engine, "before_cursor_execute", clock.before)
    event.listen(engine, "after_cursor_execute", clock.after)
    ticks = []
    t_now = reference_now()
    try:
        for i in range(args.ticks):
            now = t_now + timedelta(minutes=2 * i)
            with app.app_context():
                db.session.expire_all()
                push_stub.reset()
                clock.ms = 0.0
                cpu0, wall0 = time.process_time(), time.perf_counter()
                with counting(engine, counter):
                    ns.process_invitation_batches(now=now)
                    try:
                        from padel_app.utils.push_sender import flush
                        flush(timeout=60)
                    except ImportError:
                        pass
                cpu, wall = time.process_time() - cpu0, time.perf_counter() - wall0
                snap = counter.snapshot()
                ticks.append({
                    "tick": i, "cpu_s": round(cpu, 2), "wall_s": round(wall, 2),
                    "sql_ms": round(clock.ms), "statements": snap["statements"], "commits": snap["commits"],
                    "pushes": push_stub.calls,
                    "vacancies_open": Vacancy.query.filter_by(status="open").count(),
                    "invitations_total": NotificationEvent.query.count(),
                    "top_functions": dict(list(snap["by_function"].items())[:8]),
                })
                t = ticks[-1]
                print(f"tick {i} (+{2 * i} min): cpu {t['cpu_s']} s, wall {t['wall_s']} s, sql {t['sql_ms']} ms, "
                      f"{t['statements']} stmts, {t['commits']} commits, {t['pushes']} pushes, "
                      f"{t['vacancies_open']} open spots, {t['invitations_total']} invitations so far", flush=True)
                db.session.remove()
        with app.app_context():
            # The outcome, so a cost change can be shown to change nothing else.
            events = NotificationEvent.query.order_by(NotificationEvent.id).all()
            vacancy_ids = sorted({e.vacancy_id for e in events})
            rank = {vid: i for i, vid in enumerate(
                v.id for v in Vacancy.query.order_by(Vacancy.id).all())}
            from padel_app.models.players import Player
            first_player = db.session.query(db.func.min(Player.id)).scalar() or 0
            outcome = {
                "invitations": len(events),
                "rounds": sorted({e.round_number for e in events}),
                # Positions, not ids: the spots in creation order and the students in roster order.
                "spots": [rank[v] for v in vacancy_ids if v in rank],
                "students": sorted(e.player_id - first_player for e in events),
            }
            db.session.remove()
    finally:
        event.remove(engine, "before_cursor_execute", clock.before)
        event.remove(engine, "after_cursor_execute", clock.after)
    return ticks, outcome


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--students", type=int, default=300, help="roster size")
    ap.add_argument("--seats", type=int, default=16, help="free places in the class")
    ap.add_argument("--ticks", type=int, default=6, help="2-minute ticks to run (6 = the first 12 minutes)")
    ap.add_argument("--hours-ahead", type=int, default=24, help="class start, hours from now")
    ap.add_argument("--history", type=int, default=8)
    ap.add_argument("--blocks-pct", type=int, default=10)
    ap.add_argument("--push-latency-ms", type=int, default=150)
    ap.add_argument("--prod-shape", action="store_true", help="the measured coach's config shape (see apply_prod_shape)")
    ap.add_argument("--active", type=int, default=2, help="with --prod-shape: roster accounts left active")
    ap.add_argument("--past-instances", type=int, default=0, help="with --prod-shape: extra completed classes")
    ap.add_argument("--json", help="write the full result here")
    ap.add_argument("--keep-db", action="store_true")
    args = ap.parse_args()
    seed_args = argparse.Namespace(coaches=1, students=args.students, lessons=7, instances=7, enrolled=0,
                                   history=args.history, blocks_pct=args.blocks_pct)

    settings = _postgres_settings()
    _drop_database(settings, DB_NAME)
    _run_admin(settings, [(f'CREATE DATABASE "{DB_NAME}"', None)])
    uri = (f"postgresql://{settings['user']}:{settings['password']}"
           f"@{settings['host']}:{settings['port']}/{DB_NAME}")
    app = create_app({**BASE_TEST_CONFIG, "SQLALCHEMY_DATABASE_URI": uri})
    result = {"args": vars(args), "when": datetime.utcnow().isoformat(timespec="seconds")}
    try:
        with app.app_context():
            init_db(app)
            from flask_migrate import upgrade
            upgrade(directory=str(MIGRATIONS_DIR))
            ids = seed(seed_args)
            if args.prod_shape:
                apply_prod_shape(ids, args)
            result["instance_id"] = add_open_class(ids, args)
            db.session.remove()
        push_stub = PushStub(args.push_latency_ms, db.get_engine(app))
        with patch("padel_app.utils.expo_push.requests.post", push_stub):
            result["ticks"], result["outcome"] = run_ticks(app, args, push_stub)
    finally:
        db.get_engine(app).dispose()
        if not args.keep_db:
            _drop_database(settings, DB_NAME)

    t = result["ticks"]
    result["total"] = {k: round(sum(x[k] for x in t), 2) for k in ("cpu_s", "wall_s", "sql_ms", "statements", "commits", "pushes")}
    print(f"total over {len(t)} ticks: {json.dumps(result['total'])}")
    print(f"outcome: {json.dumps(result['outcome'])}")
    if args.json:
        pathlib.Path(args.json).write_text(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
