#!/usr/bin/env python3
"""API performance baseline (PAD-571).

Measures, per API endpoint, the number of SQL statements, wall time (median
and max over N runs) and response bytes, on a throwaway Postgres database
built by the real Alembic migrations and seeded with prod-shaped data (a few
coaches with large rosters, weekly recurring lessons, materialised future
instances with enrolments, completed history with presences, and a busy
messaging inbox for coach 0). Requests go through Flask's test client (no HTTP
server); JWTs are minted directly for coach 0 and one of their students.

    cd backend && set -a && source ../.claude/secrets.env && set +a && \
        poetry run python scripts/perf_baseline.py --json out.json

    --write-budgets   write scripts/perf_budgets.json ({endpoint_key: statements, bytes})
    --check-budgets   compare against that file; exit 1 if any endpoint's statements
                      exceed its budget by more than 10 %

Reads POSTGRES_HOST/PORT/USER/PW like the test suite. Builds
`levelup_pad571_baseline` and drops it at the end unless --keep-db. Nothing
here touches staging or prod; there is no network call.

Pattern: backend/scripts/notification_cost_probe.py (PAD-276).
"""
import argparse
import json
import pathlib
import re
import statistics
import sys
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

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
import padel_app  # noqa: E402
from padel_app import create_app  # noqa: E402
from padel_app.sql_db import db, init_db  # noqa: E402

DB_NAME = "levelup_pad571_baseline"
BUDGETS_PATH = pathlib.Path(__file__).resolve().parent / "perf_budgets.json"
TOLERANCE = 0.10


class StatementCounter:
    """Counts statements: total, by first SQL keyword, by table."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.total = 0
        self.by_kind = Counter()
        self.by_table = Counter()

    def before_cursor_execute(self, conn, cursor, statement, parameters, context, executemany):
        self.total += 1
        self.by_kind[statement.lstrip().split(None, 1)[0].upper()] += 1
        m = re.search(r"\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)", statement)
        self.by_table[m.group(1) if m else "?"] += 1


@contextmanager
def counting(engine, counter):
    from sqlalchemy import event

    counter.reset()
    event.listen(engine, "before_cursor_execute", counter.before_cursor_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", counter.before_cursor_execute)


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def seed(args):
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.messages import Message
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User

    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    out = {"coaches": []}
    club = Club(name="Perf Club", description="", location="Lisboa")
    db.session.add(club)
    db.session.flush()

    for c in range(args.coaches):
        cu = User(name=f"Coach {c}", username=f"perf_coach{c}", email=f"coach{c}@perf.test",
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
            su = User(name=f"Student {c}-{s}", username=f"perf_s{c}_{s}",
                      email=f"s{c}_{s}@perf.test", password="x", status="active")
            db.session.add(su)
            db.session.flush()
            p = Player(user_id=su.id)
            db.session.add(p)
            db.session.flush()
            players.append(p)
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id,
                                                   level_id=levels[s % 3].id,
                                                   side=("left", "right", "both")[s % 3]))
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
                         invited=True, confirmed=True, validated=(h % 2 == 0))
                for i, p in enumerate(players)
            ])
        db.session.flush()

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
            if i < 20:
                for p in players[:3]:
                    db.session.add(Presence(lesson_instance_id=inst.id, player_id=p.id, invited=True))
        db.session.flush()

        conv_ids = []
        if c == 0:
            for k, p in enumerate(players[:min(20, len(players))]):
                key = Conversation.build_participant_key([cu.id, p.user_id])
                conv = Conversation(participant_key=key, is_group=False)
                db.session.add(conv)
                db.session.flush()
                db.session.add_all([
                    ConversationParticipant(conversation_id=conv.id, user_id=cu.id),
                    ConversationParticipant(conversation_id=conv.id, user_id=p.user_id),
                ])
                for m in range(args.messages):
                    sender = cu.id if m % 2 == 0 else p.user_id
                    db.session.add(Message(
                        conversation_id=conv.id, sender_id=sender, text=f"message {m} of thread {k}",
                        sent_at=now - timedelta(hours=args.messages - m, minutes=k)))
                db.session.flush()
                conv_ids.append(conv.id)
        out["coaches"].append({
            "coach_id": coach.id, "coach_user_id": cu.id,
            "instance_ids": instance_ids, "player_ids": [p.id for p in players],
            "player_user_ids": [p.user_id for p in players], "conversation_ids": conv_ids,
        })
    db.session.commit()
    return out


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

def build_cases(ids, now):
    c0 = ids["coaches"][0]
    inst = c0["instance_ids"][0]
    conv = c0["conversation_ids"][0]
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    d = lambda x: x.isoformat()
    week = {"from": f"{d(week_start)}T00:00:00Z", "to": f"{d(week_start + timedelta(days=6))}T23:59:59Z"}
    month_start = today.replace(day=1) - timedelta(days=today.replace(day=1).weekday())
    month = {"from": f"{d(month_start)}T00:00:00Z", "to": f"{d(month_start + timedelta(weeks=6))}T00:00:00Z"}
    ahead = {"from": f"{d(today)}T00:00:00Z", "to": f"{d(today + timedelta(days=30))}T23:59:59Z"}
    trailing = {"from": d(today - timedelta(days=90)), "to": d(today)}
    prev_week = {"from": d(week_start - timedelta(days=7)), "to": d(week_start - timedelta(days=1))}
    # (key, role, method, path, query)
    return [
        ("GET /api/auth/me", "coach", "GET", "/api/auth/me", {}),
        ("GET /api/auth/me", "student", "GET", "/api/auth/me", {}),
        ("GET /api/app/dashboard", "coach", "GET", "/api/app/dashboard", ahead),
        ("GET /api/app/dashboard", "student", "GET", "/api/app/dashboard", ahead),
        ("GET /api/app/calendar (week)", "coach", "GET", "/api/app/calendar", week),
        ("GET /api/app/calendar (week)", "student", "GET", "/api/app/calendar", week),
        ("GET /api/app/calendar (6 weeks)", "coach", "GET", "/api/app/calendar", month),
        ("POST /api/app/class_instance", "coach", "POST", "/api/app/class_instance",
         {"model": "LessonInstance", "id": inst}),
        ("POST /api/app/class_instance", "student", "POST", "/api/app/class_instance",
         {"model": "LessonInstance", "id": inst}),
        ("GET /api/app/lesson_instance/<id>/presences", "coach", "GET",
         f"/api/app/lesson_instance/{inst}/presences", {}),
        ("GET /api/app/coach_players_paginated", "coach", "GET", "/api/app/coach_players_paginated",
         {"page": 1, "per_page": 25}),
        ("GET /api/app/coach_players", "coach", "GET", "/api/app/coach_players", {}),
        ("GET /api/app/coach_levels", "coach", "GET", "/api/app/coach_levels", {}),
        ("GET /api/app/conversations", "coach", "GET", "/api/app/conversations", {"page": 1}),
        ("GET /api/app/conversations", "student", "GET", "/api/app/conversations", {"page": 1}),
        ("GET /api/app/conversation/<id>", "coach", "GET", f"/api/app/conversation/{conv}", {"limit": 30}),
        ("POST /api/app/conversation/<id>/read", "coach", "POST", f"/api/app/conversation/{conv}/read", {}),
        ("GET /api/app/messages/unread_count", "coach", "GET", "/api/app/messages/unread_count", {}),
        ("GET /api/app/class_instances/pending_validation", "coach", "GET",
         "/api/app/class_instances/pending_validation", prev_week),
        ("GET /api/app/class_instances/pending_validation/count", "coach", "GET",
         "/api/app/class_instances/pending_validation/count", prev_week),
        ("GET /api/app/class_instances/pending_validation/badge", "coach", "GET",
         "/api/app/class_instances/pending_validation/badge", {}),
        ("GET /api/app/presence_stats", "coach", "GET", "/api/app/presence_stats", trailing),
        ("GET /api/app/presence_trend", "coach", "GET", "/api/app/presence_trend", trailing),
        ("GET /api/app/attendance_history", "coach", "GET", "/api/app/attendance_history",
         {"playerId": c0["player_ids"][0], **trailing}),
    ]


def measure(app, client, engine, cases, tokens, runs):
    counter = StatementCounter()
    results = []

    def one_call(method, path, query, token):
        with app.app_context():
            db.session.remove()  # every measured call starts with an empty identity map
        headers = {"Authorization": f"Bearer {token}"}
        with counting(engine, counter):
            t0 = time.perf_counter()
            resp = client.open(path, method=method, query_string=query, headers=headers)
            ms = (time.perf_counter() - t0) * 1000
        body = resp.get_data()
        return resp.status_code, ms, counter.total, len(body), dict(counter.by_kind), dict(counter.by_table)

    for key, role, method, path, query in cases:
        token = tokens[role]
        one_call(method, path, query, token)  # warm-up
        samples = [one_call(method, path, query, token) for _ in range(runs)]
        statuses = {s[0] for s in samples}
        ms = [s[1] for s in samples]
        results.append({
            "endpoint": key, "role": role, "method": method, "path": path, "query": query,
            "status": samples[-1][0] if len(statuses) == 1 else sorted(statuses),
            "statements": int(statistics.median(s[2] for s in samples)),
            "p50_ms": round(statistics.median(ms), 1),
            "max_ms": round(max(ms), 1),
            "bytes": samples[-1][3],
            "by_kind": samples[-1][4],
            "by_table": dict(Counter(samples[-1][5]).most_common(8)),
        })
    return results


def budget_key(r):
    return f"{r['endpoint']} [{r['role']}]"


def check_budgets(results):
    if not BUDGETS_PATH.exists():
        print(f"no budgets at {BUDGETS_PATH}; run with --write-budgets first")
        return 1
    budgets = json.loads(BUDGETS_PATH.read_text())
    bad = []
    for r in results:
        b = budgets.get(budget_key(r))
        if b is None:
            bad.append(f"{budget_key(r)}: no budget recorded")
        elif r["statements"] > b["statements"] * (1 + TOLERANCE):
            bad.append(f"{budget_key(r)}: {r['statements']} statements > budget {b['statements']} (+10 %)")
    if bad:
        print("BUDGET EXCEEDED:\n  " + "\n  ".join(bad))
        return 1
    print(f"budgets ok ({len(results)} endpoints within +10 %)")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--coaches", type=int, default=3)
    ap.add_argument("--students", type=int, default=60, help="roster size per coach")
    ap.add_argument("--lessons", type=int, default=20, help="weekly recurring lessons per coach")
    ap.add_argument("--instances", type=int, default=60, help="materialised future instances per coach")
    ap.add_argument("--history", type=int, default=8, help="past completed instances per coach")
    ap.add_argument("--messages", type=int, default=30, help="messages per conversation (coach 0 has 20 conversations)")
    ap.add_argument("--runs", type=int, default=5, help="measured calls per endpoint (after 1 warm-up)")
    ap.add_argument("--json", help="write the full result here")
    ap.add_argument("--write-budgets", action="store_true", help="write scripts/perf_budgets.json")
    ap.add_argument("--check-budgets", action="store_true", help="exit 1 if statements exceed a budget by >10 %%")
    ap.add_argument("--keep-db", action="store_true")
    args = ap.parse_args()

    print(f"padel_app: {padel_app.__file__}")
    settings = _postgres_settings()
    _drop_database(settings, DB_NAME)
    _run_admin(settings, [(f'CREATE DATABASE "{DB_NAME}"', None)])
    uri = (f"postgresql://{settings['user']}:{settings['password']}"
           f"@{settings['host']}:{settings['port']}/{DB_NAME}")
    app = create_app({**BASE_TEST_CONFIG, "SQLALCHEMY_DATABASE_URI": uri,
                      "JWT_SECRET_KEY": "perf-baseline-throwaway-secret-0123456789abcdef"})
    result = {"seed": vars(args), "db": DB_NAME, "when": datetime.utcnow().isoformat(timespec="seconds")}
    exit_code = 0
    try:
        with app.app_context():
            init_db(app)
            from flask_migrate import upgrade
            upgrade(directory=str(MIGRATIONS_DIR))
            t0 = time.perf_counter()
            ids = seed(args)
            result["seed_ms"] = round((time.perf_counter() - t0) * 1000)
            from sqlalchemy import text
            result["rows"] = {t: db.session.execute(text(f"SELECT count(*) FROM {t}")).scalar()
                              for t in ("users", "coach_in_player", "lessons", "lesson_instances",
                                        "presences", "conversations", "messages")}
            from datetime import timedelta as td
            from flask_jwt_extended import create_access_token
            c0 = ids["coaches"][0]

            def mint(user_id):
                return create_access_token(identity=str(user_id), expires_delta=td(days=1),
                                           additional_claims={"auth_time": int(time.time())})

            tokens = {"coach": mint(c0["coach_user_id"]), "student": mint(c0["player_user_ids"][0])}
            db.session.remove()

        engine = db.get_engine(app)
        client = app.test_client()
        cases = build_cases(ids, datetime.utcnow())
        results = measure(app, client, engine, cases, tokens, args.runs)
        result["endpoints"] = results
    finally:
        db.get_engine(app).dispose()
        if not args.keep_db:
            _drop_database(settings, DB_NAME)

    if args.json:
        p = pathlib.Path(args.json)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(result, indent=2, default=str))
    print(json.dumps({k: result[k] for k in ("rows", "seed_ms")}))
    print("| endpoint | role | status | stmts | p50 ms | max ms | bytes |")
    print("|---|---|---|---|---|---|---|")
    for r in sorted(results, key=lambda r: -r["statements"]):
        print(f"| {r['endpoint']} | {r['role']} | {r['status']} | {r['statements']} | "
              f"{r['p50_ms']} | {r['max_ms']} | {r['bytes']} |")
    if args.write_budgets:
        BUDGETS_PATH.write_text(json.dumps(
            {budget_key(r): {"statements": r["statements"], "bytes": r["bytes"]} for r in results},
            indent=2, sort_keys=True) + "\n")
        print(f"wrote {BUDGETS_PATH}")
    if args.check_budgets:
        exit_code = check_budgets(results)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
