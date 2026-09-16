#!/usr/bin/env python3
"""Cost probe for the invitation engine and the reminder scheduler (PAD-276, audit M17/M18).

Measures, on a throwaway Postgres database built by the real migrations and
seeded at a chosen size, three things the 2026-09-02 audit only estimated:

  A. how many SQL statements the invitation engine issues per candidate and
     per stage (`evaluate_candidates`, ranking, `_send_invitation_batch`,
     one `process_invitation_batches` tick, the standing-list fan-out);
  B. how long the scheduler thread is blocked by the Expo push HTTP call
     (the call is stubbed with a fixed latency; the 10 s timeout is the
     worst case) and whether a DB connection stays checked out meanwhile;
  C. what the SQLAlchemy job store costs: `_startup_reschedule` (every
     deploy), `_run_extend_schedule_window` (daily rewrite of every job),
     `cancel_lesson_reminder_jobs` (unpickles every job) and the size of the
     `apscheduler_jobs` table.

    cd backend && poetry run python scripts/notification_cost_probe.py \
        --coaches 3 --students 300 --lessons 30 --instances 60 --json out.json

Reads POSTGRES_HOST/PORT/USER/PW like the test suite (source .claude/secrets.env
first). Builds `levelup_pad276_probe` and drops it at the end unless --keep-db.
Nothing here touches staging or prod; there is no network call (Expo is stubbed).

Pattern: backend/scripts/sse_load_test.py (PAD-277).
"""
import argparse
import json
import os
import pathlib
import re
import sys
import threading
import time
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta
from unittest.mock import patch

BACKEND = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "padel_app" / "tests"))

from conftest import (  # noqa: E402  (the test suite's Postgres helpers)
    BASE_TEST_CONFIG,
    MIGRATIONS_DIR,
    _drop_database,
    _postgres_settings,
    _run_admin,
)
from padel_app import create_app  # noqa: E402
from padel_app.sql_db import db, init_db  # noqa: E402

DB_NAME = "levelup_pad276_probe"
PKG = str(BACKEND / "padel_app")


# ---------------------------------------------------------------------------
# Statement counter — attributes every statement to the innermost padel_app
# frame on the stack (services/utils/scheduler), so lazy loads land on the
# function that touched the attribute.
# ---------------------------------------------------------------------------

class Counter_:
    def __init__(self):
        self.reset()

    def reset(self):
        self.total = 0
        self.commits = 0
        self.by_func = Counter()
        self.by_kind = Counter()
        self.by_func_table = Counter()
        self.samples = defaultdict(list)

    def _owner(self):
        f = sys._getframe(2)
        while f is not None:
            fn = f.f_code.co_filename
            if fn.startswith(PKG) and not fn.endswith(("/model.py", "/sql_db.py")):
                if "/tests/" not in fn and "/scripts/" not in fn:
                    return f"{pathlib.Path(fn).stem}.{f.f_code.co_name}"
            f = f.f_back
        return "<script>"

    def before_cursor_execute(self, conn, cursor, statement, parameters, context, executemany):
        self.total += 1
        kind = statement.lstrip().split(None, 1)[0].upper()
        self.by_kind[kind] += 1
        owner = self._owner()
        self.by_func[owner] += 1
        m = re.search(r"\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)", statement)
        self.by_func_table[f"{owner} -> {m.group(1) if m else '?'}"] += 1
        if len(self.samples[owner]) < 3:
            self.samples[owner].append(" ".join(statement.split())[:140])

    def on_commit(self, conn):
        self.commits += 1

    def snapshot(self):
        return {
            "statements": self.total,
            "commits": self.commits,
            "by_kind": dict(self.by_kind),
            "by_function": dict(self.by_func.most_common()),
            "by_function_table": dict(self.by_func_table.most_common()),
        }


@contextmanager
def counting(engine, counter):
    from sqlalchemy import event

    counter.reset()
    event.listen(engine, "before_cursor_execute", counter.before_cursor_execute)
    event.listen(engine, "commit", counter.on_commit)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", counter.before_cursor_execute)
        event.remove(engine, "commit", counter.on_commit)


@contextmanager
def timed(result, key):
    t0 = time.perf_counter()
    yield
    result[key] = round((time.perf_counter() - t0) * 1000, 1)


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def seed(args):
    """Prod-shaped data: `coaches` coaches, each with `students` roster players
    (every one with a device token, `blocks_pct` % with a recurring availability
    blocker), `lessons` weekly recurring lessons, `instances` materialised
    future instances (the first one with `enrolled` players and one open
    vacancy), and a presence history of `history` past classes per student."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User
    from padel_app.models.vacancy import Vacancy

    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    out = {"coaches": []}
    club = Club(name="Probe Club", description="", location="Lisboa")
    db.session.add(club)
    db.session.flush()

    for c in range(args.coaches):
        cu = User(name=f"Coach {c}", username=f"probe_coach{c}", email=f"coach{c}@probe.test",
                  password="x", status="active")
        db.session.add(cu)
        db.session.flush()
        coach = Coach(user_id=cu.id)
        db.session.add(coach)
        db.session.flush()
        levels = [CoachLevel(coach_id=coach.id, label=code, code=code, display_order=i)
                  for i, code in enumerate(("A", "B", "C"))]
        db.session.add_all(levels)
        db.session.flush()

        players = []
        for s in range(args.students):
            su = User(name=f"Student {c}-{s}", username=f"probe_s{c}_{s}",
                      email=f"s{c}_{s}@probe.test", password="x", status="active")
            db.session.add(su)
            db.session.flush()
            p = Player(user_id=su.id)
            db.session.add(p)
            db.session.flush()
            players.append(p)
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id,
                                                   level_id=levels[s % 3].id,
                                                   side=("left", "right", "both")[s % 3]))
            db.session.add(DeviceToken(user_id=su.id, token=f"ExponentPushToken[probe{c}_{s}]",
                                       platform="ios"))
            if s % 100 < args.blocks_pct:
                b0 = now + timedelta(days=1, hours=(s % 5) - 2)
                db.session.add(CalendarBlock(
                    user_id=su.id, type="unavailable", title="busy",
                    start_datetime=b0, end_datetime=b0 + timedelta(hours=2),
                    is_recurring=True,
                    recurrence_rule=json.dumps({"frequency": "weekly",
                                                "daysOfWeek": [(b0.weekday() + 1) % 7]}),
                    recurrence_end=(b0 + timedelta(weeks=52)).date(),
                    blocks_auto_invitations=True,
                ))
        db.session.flush()

        lessons = []
        for l in range(args.lessons):
            st = now + timedelta(days=1 + (l % 7), hours=8 + (l // 7) * 2)
            lesson = Lesson(title=f"L{c}-{l}", start_datetime=st, end_datetime=st + timedelta(hours=1),
                            is_recurring=True,
                            recurrence_rule=json.dumps({"frequency": "weekly",
                                                        "daysOfWeek": [(st.weekday() + 1) % 7]}),
                            recurrence_end=(st + timedelta(weeks=52)).date(),
                            type="academy", max_players=4, color="#000", status="active",
                            club_id=club.id, default_level_id=levels[l % 3].id)
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            lessons.append(lesson)

        # Past classes with a presence per student (attendance history).
        for h in range(args.history):
            st = now - timedelta(days=7 * (h + 1))
            inst = LessonInstance(lesson_id=lessons[0].id, start_datetime=st,
                                  end_datetime=st + timedelta(hours=1), max_players=4,
                                  status="completed", level_id=levels[0].id)
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
            db.session.add_all([
                Presence(lesson_instance_id=inst.id, player_id=p.id,
                         status="present" if (i + h) % 4 else "absent",
                         justification=None if (i + h) % 4 else "unjustified",
                         invited=True, confirmed=True, validated=True)
                for i, p in enumerate(players)
            ])
        db.session.flush()

        # Future materialised instances: the first carries the enrolment and vacancy.
        instance_ids = []
        for i in range(args.instances):
            lesson = lessons[i % len(lessons)]
            st = lesson.start_datetime + timedelta(weeks=i // len(lessons))
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=st,
                                  end_datetime=st + timedelta(hours=1), max_players=4,
                                  status="scheduled", level_id=lesson.default_level_id,
                                  notifications_enabled=True)
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
            instance_ids.append(inst.id)
        first = db.session.get(LessonInstance, instance_ids[0])
        enrolled = players[: args.enrolled]
        # PAD-259 (classes.instance-enrollment rule 1): the presence row IS the
        # enrolment, so the seed writes presences only — no shadow junction row,
        # which phase 2 (PAD-301) drops. On a tree older than PAD-259 the engine
        # still reads the junction, so these three read as candidates there.
        for p in enrolled:
            db.session.add(Presence(lesson_instance_id=first.id, player_id=p.id, invited=True))
        db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True))
        vacancy = Vacancy(lesson_instance_id=first.id, coach_id=coach.id, status="open",
                          level_id=first.level_id, side="left",
                          original_player_id=players[-1].id,
                          current_round_number=1, current_batch_number=0)
        db.session.add(vacancy)
        db.session.flush()
        out["coaches"].append({
            "coach_id": coach.id, "coach_user_id": cu.id, "lesson_ids": [l.id for l in lessons],
            "instance_ids": instance_ids, "vacancy_id": vacancy.id,
            "player_ids": [p.id for p in players],
        })
    db.session.commit()
    return out


# ---------------------------------------------------------------------------
# A. engine
# ---------------------------------------------------------------------------

def probe_engine(app, ids, args, push_stub):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services import notification_service as ns

    counter = Counter_()
    engine = db.get_engine(app)
    res = {}
    c0 = ids["coaches"][0]
    roster = len(c0["player_ids"])

    with app.app_context():
        vacancy = Vacancy.query.get(c0["vacancy_id"])
        instance = LessonInstance.query.get(c0["instance_ids"][0])
        config = ns.get_or_create_config(c0["coach_id"])
        db.session.expire_all()

        # A1: evaluate_candidates over the whole roster, one run per wave
        # (group 1 = level+side, group 2 = level, group 3 = no rule: the
        # widest wave is the one where every candidate reaches every stage).
        res["evaluate"] = {}
        for wave in (1, 2, 3):
            db.session.expire_all()
            with counting(engine, counter), timed(res, f"evaluate_ms_w{wave}"):
                verdicts = ns.evaluate_candidates(vacancy, instance, c0["coach_id"], config,
                                                  wave=("group", wave))
            snap = counter.snapshot()
            snap["roster"] = roster
            snap["per_candidate"] = round(counter.total / roster, 2)
            snap["verdicts"] = dict(Counter(v.stage for v in verdicts))
            snap["ms"] = res[f"evaluate_ms_w{wave}"]
            res["evaluate"][f"wave{wave}"] = snap

        # A2: ranking the survivors of the widest wave, straight after the
        # evaluation as the engine does it (no expiry in between).
        with counting(engine, counter), timed(res, "rank_ms"):
            ranked = ns._rank_invited(verdicts, config, vacancy)
        res["rank"] = counter.snapshot()
        res["rank"]["survivors"] = len(ranked)
        res["rank"]["per_survivor"] = round(counter.total / max(len(ranked), 1), 2)

        # A3: the full batch send (default restrictions: 3 per batch, 10 total),
        # at round 1 (level+side) and at round 3 (everyone passes the rules).
        def _flush():
            try:
                from padel_app.utils.push_sender import flush
                flush(timeout=30)
            except ImportError:
                pass

        res["send_batch"] = {}
        for rnd in (1, 3):
            vacancy.current_round_number = rnd
            vacancy.save()
            db.session.expire_all()
            push_stub.reset()
            with counting(engine, counter), timed(res, f"send_batch_ms_r{rnd}"):
                with patch.object(ns, "publish"), patch.object(ns, "send_push_notification"):
                    sent = ns._send_invitation_batch(vacancy, instance, config, c0["coach_id"])
            caller_ms = res[f"send_batch_ms_r{rnd}"]
            _flush()
            snap = counter.snapshot()
            snap["invited"] = len(sent)
            snap["caller_ms"] = caller_ms
            snap["threads"] = sorted(push_stub.threads)
            snap["push_calls"] = push_stub.calls
            snap["push_ms"] = round(push_stub.total_ms, 1)
            snap["pool_checked_out_during_push"] = push_stub.max_checked_out
            snap["ms"] = res[f"send_batch_ms_r{rnd}"]
            res["send_batch"][f"round{rnd}"] = snap
        push_stub.reset()

        # A4: one engine tick with every coach's vacancy fresh (last_activity_at = None).
        for c in ids["coaches"]:
            v = Vacancy.query.get(c["vacancy_id"])
            v.last_activity_at = None
            v.current_round_number = 1
        db.session.commit()
        db.session.expire_all()
        with counting(engine, counter), timed(res, "tick_ms"):
            with patch.object(ns, "publish"), patch.object(ns, "send_push_notification"):
                processed = ns.process_invitation_batches()
        tick_caller_ms = res["tick_ms"]
        _flush()
        res["tick"] = counter.snapshot()
        res["tick"]["caller_ms"] = tick_caller_ms
        res["tick"]["threads"] = sorted(push_stub.threads)
        res["tick"]["vacancies_processed"] = processed
        res["tick"]["push_calls"] = push_stub.calls
        res["tick"]["push_ms"] = round(push_stub.total_ms, 1)
        push_stub.reset()

        # A5: idle tick — no open vacancy (the every-2-minutes baseline).
        Vacancy.query.update({"status": "expired"})
        db.session.commit()
        db.session.expire_all()
        with counting(engine, counter), timed(res, "idle_tick_ms"):
            ns.process_invitation_batches()
        res["idle_tick"] = counter.snapshot()

        # A6: standing waiting-list fan-out across the coach's future instances.
        entry = StandingWaitingListEntry(coach_id=c0["coach_id"], player_id=c0["player_ids"][5],
                                         credits_total=10, credits_used=0,
                                         expires_at=datetime.utcnow() + timedelta(days=90))
        db.session.add(entry)
        db.session.commit()
        db.session.expire_all()
        with counting(engine, counter), timed(res, "fan_out_ms"):
            ns._fan_out_standing_entry(entry)
        res["fan_out"] = counter.snapshot()
        res["fan_out"]["instances"] = len(c0["instance_ids"])
        res["fan_out"]["per_instance"] = round(counter.total / len(c0["instance_ids"]), 2)
        db.session.rollback()
    return res


# ---------------------------------------------------------------------------
# B. push stub — stands in for requests.post in expo_push; records the wall
# time spent "on the wire" and the DB pool state while blocked.
# ---------------------------------------------------------------------------

class PushStub:
    def __init__(self, latency_ms, engine):
        self.latency = latency_ms / 1000.0
        self.engine = engine
        self.reset()

    def reset(self):
        self.calls = 0
        self.total_ms = 0.0
        self.max_checked_out = 0
        self.threads = set()

    def __call__(self, url, json=None, headers=None, timeout=None):
        self.calls += 1
        self.threads.add(threading.current_thread().name)
        self.max_checked_out = max(self.max_checked_out, self.engine.pool.checkedout())
        t0 = time.perf_counter()
        time.sleep(self.latency)
        self.total_ms += (time.perf_counter() - t0) * 1000

        class R:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self_inner):
                return {"data": [{"status": "ok"} for _ in (json or [])]}

        return R()


def probe_push(app, ids, args, push_stub):
    """Reminder send for the enrolled class, and how the engine tick behaves
    when Expo is slow: the whole tick is one scheduler-thread call."""
    from padel_app.services import notification_service as ns

    res = {}
    c0 = ids["coaches"][0]
    with app.app_context():
        push_stub.reset()
        with patch.object(ns, "publish"), patch.object(ns, "send_push_notification"):
            with timed(res, "send_reminders_ms"):
                out = ns.send_class_reminders(c0["instance_ids"][0])
            try:
                from padel_app.utils.push_sender import flush
                flush(timeout=30)
            except ImportError:
                pass
        res["send_reminders"] = {
            "result": {k: v for k, v in out.items() if not isinstance(v, (list, dict))},
            "push_calls": push_stub.calls,
            "push_ms": round(push_stub.total_ms, 1),
            "pool_checked_out_during_push": push_stub.max_checked_out,
            "threads": sorted(push_stub.threads),
        }
        db.session.remove()
    res["latency_ms_per_call"] = args.push_latency_ms
    res["timeout_s_per_call"] = 10
    return res


# ---------------------------------------------------------------------------
# C. job store
# ---------------------------------------------------------------------------

def probe_jobstore(app, ids, args, uri):
    from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
    from apscheduler.schedulers.background import BackgroundScheduler
    from sqlalchemy import text

    from padel_app import scheduler as sch

    store = SQLAlchemyJobStore(url=uri, engine_options={"pool_pre_ping": True, "pool_recycle": 300,
                                                       "pool_size": 2, "max_overflow": 1})
    sched = BackgroundScheduler(jobstores={"default": store}, timezone="UTC")
    sched.start(paused=True)  # a real store, but nothing fires
    sch._app = app
    sch._scheduler = sched
    counter = Counter_()
    res = {"executor": repr(sched._executors["default"]),
           "executor_max_workers": getattr(sched._executors["default"], "_max_workers", None) or
           getattr(getattr(sched._executors["default"], "_pool", None), "_max_workers", None)}
    try:
        with counting(store.engine, counter), timed(res, "startup_reschedule_ms"):
            sch._startup_reschedule(app)
        res["startup_reschedule"] = counter.snapshot()
        jobs = sched.get_jobs()
        res["jobs_after_startup"] = len(jobs)
        res["job_id_families"] = dict(Counter(re.sub(r"\d+", "N", j.id) for j in jobs))
        with app.app_context():
            size = db.session.execute(text("SELECT pg_total_relation_size('apscheduler_jobs')")).scalar()
            res["apscheduler_jobs_bytes"] = int(size)

        with counting(store.engine, counter), timed(res, "extend_window_ms"):
            sch._run_extend_schedule_window()
        res["extend_window"] = counter.snapshot()
        res["jobs_after_extend"] = len(sched.get_jobs())

        with counting(store.engine, counter), timed(res, "get_jobs_ms"):
            sched.get_jobs()
        res["get_jobs"] = counter.snapshot()

        lesson_id = ids["coaches"][0]["lesson_ids"][0]
        with counting(store.engine, counter), timed(res, "cancel_lesson_ms"):
            sch.cancel_lesson_reminder_jobs(lesson_id)
        res["cancel_lesson"] = counter.snapshot()
        res["jobs_after_cancel"] = len(sched.get_jobs())

        with counting(store.engine, counter), timed(res, "schedule_one_lesson_ms"):
            n = sch.schedule_lesson_reminder_jobs(lesson_id, ids["coaches"][0]["coach_id"])
        res["schedule_one_lesson"] = counter.snapshot()
        res["schedule_one_lesson"]["jobs"] = n
    finally:
        sched.shutdown(wait=False)
        sch._scheduler = None
        sch._app = None
    return res


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--coaches", type=int, default=3)
    ap.add_argument("--students", type=int, default=300, help="roster size per coach")
    ap.add_argument("--lessons", type=int, default=30, help="weekly recurring lessons per coach")
    ap.add_argument("--instances", type=int, default=60, help="materialised future instances per coach")
    ap.add_argument("--enrolled", type=int, default=3, help="players enrolled in the vacancy's class")
    ap.add_argument("--history", type=int, default=8, help="past classes per coach with a presence per student")
    ap.add_argument("--blocks-pct", type=int, default=10, help="%% of students with a recurring availability blocker")
    ap.add_argument("--push-latency-ms", type=int, default=150, help="stubbed Expo round-trip")
    ap.add_argument("--push-inline", action="store_true",
                    help="PAD-294: run the push sender inline (the pre-PAD-294 shape) instead of on its worker")
    ap.add_argument("--json", help="write the full result here")
    ap.add_argument("--keep-db", action="store_true")
    args = ap.parse_args()

    settings = _postgres_settings()
    _drop_database(settings, DB_NAME)
    _run_admin(settings, [(f'CREATE DATABASE "{DB_NAME}"', None)])
    uri = (f"postgresql://{settings['user']}:{settings['password']}"
           f"@{settings['host']}:{settings['port']}/{DB_NAME}")
    app = create_app({**BASE_TEST_CONFIG, "SQLALCHEMY_DATABASE_URI": uri,
                      "PUSH_SENDER_INLINE": bool(args.push_inline)})
    result = {"seed": vars(args), "db": DB_NAME, "when": datetime.utcnow().isoformat(timespec="seconds")}
    try:
        with app.app_context():
            init_db(app)
            from flask_migrate import upgrade
            t0 = time.perf_counter()
            upgrade(directory=str(MIGRATIONS_DIR))
            result["migrate_ms"] = round((time.perf_counter() - t0) * 1000)
            t0 = time.perf_counter()
            ids = seed(args)
            result["seed_ms"] = round((time.perf_counter() - t0) * 1000)
            from sqlalchemy import text
            result["rows"] = {t: db.session.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                              for t in ("users", "coach_in_player", "lessons", "lesson_instances",
                                        "presences", "device_tokens", "calendar_blocks", "vacancies")}
            db.session.remove()

        engine = db.get_engine(app)
        push_stub = PushStub(args.push_latency_ms, engine)
        with patch("padel_app.utils.expo_push.requests.post", push_stub):
            result["engine"] = probe_engine(app, ids, args, push_stub)
            result["push"] = probe_push(app, ids, args, push_stub)
        result["jobstore"] = probe_jobstore(app, ids, args, uri)
    finally:
        db.get_engine(app).dispose()
        if not args.keep_db:
            _drop_database(settings, DB_NAME)

    if args.json:
        pathlib.Path(args.json).write_text(json.dumps(result, indent=2, default=str))
    print(json.dumps({k: v for k, v in result.items() if k in ("rows", "migrate_ms", "seed_ms")}))
    e, p, j = result["engine"], result["push"], result["jobstore"]
    for w, ev in e["evaluate"].items():
        print(f"A  evaluate_candidates {w}: {ev['statements']} stmts / {ev['roster']} roster "
              f"= {ev['per_candidate']}/candidate in {ev['ms']} ms; verdicts {ev['verdicts']}")
    print(f"   rank: {e['rank']['statements']} stmts / {e['rank']['survivors']} survivors "
          f"= {e['rank']['per_survivor']}/survivor in {e['rank_ms']} ms")
    for r, sb in e["send_batch"].items():
        print(f"   send_batch {r}: {sb['statements']} stmts, {sb['commits']} commits, "
              f"{sb['invited']} invited, {sb['push_calls']} pushes "
              f"({sb['push_ms']} ms on the wire, on {sb.get('threads')}) — caller returned in {sb['caller_ms']} ms")
    print(f"   tick ({e['tick']['vacancies_processed']} vacancies): {e['tick']['statements']} stmts, "
          f"{e['tick']['commits']} commits, {e['tick']['push_ms']} ms on the wire on {e['tick'].get('threads')} — "
          f"caller returned in {e['tick']['caller_ms']} ms")
    print(f"   idle tick: {e['idle_tick']['statements']} stmts in {e['idle_tick_ms']} ms")
    print(f"   standing fan-out: {e['fan_out']['statements']} stmts / {e['fan_out']['instances']} instances "
          f"= {e['fan_out']['per_instance']}/instance in {e['fan_out_ms']} ms")
    print(f"B  send_class_reminders: {p['send_reminders']['push_calls']} pushes, "
          f"{p['send_reminders']['push_ms']} ms on the wire on {p['send_reminders']['threads']}; "
          f"caller returned in {p['send_reminders_ms']} ms; pool checked out during push: "
          f"{p['send_reminders']['pool_checked_out_during_push']}")
    print(f"C  startup: {j['startup_reschedule']['statements']} stmts {j['startup_reschedule']['by_kind']}, "
          f"{j['startup_reschedule']['commits']} commits, {j['jobs_after_startup']} jobs {j['job_id_families']}, "
          f"{j['startup_reschedule_ms']} ms; table {j['apscheduler_jobs_bytes']} B; "
          f"executor max_workers={j['executor_max_workers']}")
    print(f"   daily extend: {j['extend_window']['statements']} stmts {j['extend_window']['by_kind']}, "
          f"{j['extend_window']['commits']} commits in {j['extend_window_ms']} ms ({j['jobs_after_extend']} jobs)")
    print(f"   get_jobs: {j['get_jobs']['statements']} stmts in {j['get_jobs_ms']} ms; "
          f"cancel one lesson: {j['cancel_lesson']['statements']} stmts in {j['cancel_lesson_ms']} ms; "
          f"schedule one lesson: {j['schedule_one_lesson']['statements']} stmts in {j['schedule_one_lesson_ms']} ms")


if __name__ == "__main__":
    main()
