"""PAD-795 wave 1 — classes.coach-requests-table: `GET /app/coach-requests`.

One list of the calling coach's private class requests and academy join requests, split into
Em aberto / Histórico, read a page at a time, sortable and filterable in SQL across both tables.
Rows are inserted directly: the table reads what is stored, whatever route wrote it.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from padel_app.sql_db import db

URL = "/api/app/coach-requests"
OPEN_PRIVATE = ("pending", "countered")
PRIVATE_STATUSES = ("pending", "countered", "accepted", "declined", "withdrawn")
ACADEMY_STATUSES = ("pending", "accepted", "rejected", "withdrawn", "superseded")
BASE = datetime(2026, 12, 1, 18, 0)  # a class's wall clock; nothing here depends on "now"


# ── fixtures ────────────────────────────────────────────────────────────────

class World:
    """Coaches, a club and the rows a test adds; every helper commits."""

    def __init__(self, app):
        self.app = app
        self.n = 0
        with app.app_context():
            from padel_app.models import User
            from padel_app.models.clubs import Club
            from padel_app.models.coaches import Coach

            self.users = {}
            self.coaches = {}
            for name in ("ana", "rui"):
                user = User(name=name.title(), username=f"coach_{name}", password="x", status="active")
                db.session.add(user)
                db.session.flush()
                coach = Coach(user_id=user.id)
                db.session.add(coach)
                db.session.flush()
                self.users[name], self.coaches[name] = user.id, coach.id
            club = Club(name="Club", description="", location="City")
            db.session.add(club)
            db.session.commit()
            self.club_id = club.id

    def headers(self, user_id):
        from flask_jwt_extended import create_access_token

        self.app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
        with self.app.app_context():
            return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}

    def student(self, name, *, coach="ana", nickname=None, as_name=False, side=None):
        from padel_app.models import User
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
        from padel_app.models.players import Player

        self.n += 1
        with self.app.app_context():
            user = User(name=name, username=f"{name.lower().replace(' ', '_')}_{self.n}", password="x", status="active")
            db.session.add(user)
            db.session.flush()
            player = Player(user_id=user.id)
            db.session.add(player)
            db.session.flush()
            db.session.add(Association_CoachPlayer(
                coach_id=self.coaches[coach], player_id=player.id, nickname=nickname,
                nickname_as_name=as_name, side=side))
            db.session.commit()
            return {"player_id": player.id, "user_id": user.id}

    def private(self, who, *, coach="ana", start=BASE, minutes=60, status="pending", created=None,
                decided_by=None, decided_at=None, invitees=None, recurrence=None, note=None):
        from padel_app.models import ClassRequest

        with self.app.app_context():
            row = ClassRequest(
                player_id=who["player_id"], coach_id=self.coaches[coach], start_datetime=start,
                end_datetime=start + timedelta(minutes=minutes), status=status, note=note,
                decided_by=decided_by, decided_at=decided_at, invitee_player_ids=invitees,
                recurrence=recurrence)
            row.created_at = created
            db.session.add(row)
            db.session.commit()
            if created is None:  # the column default fills None on insert; the row under test has none
                db.session.execute(ClassRequest.__table__.update().where(ClassRequest.id == row.id).values(created_at=None))
                db.session.commit()
            return row.id

    def academy(self, who, *, coach="ana", start=BASE, status="pending", side=None, created=None,
                title="Academy", decided_by_coach=False, note=None):
        from padel_app.models import ClassJoinRequest
        from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.lessons import Lesson

        with self.app.app_context():
            lesson = Lesson(
                title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                club_id=self.club_id)
            db.session.add(lesson)
            db.session.flush()
            inst = LessonInstance(
                lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                max_players=4, status="scheduled", notifications_enabled=True)
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=self.coaches[coach], lesson_instance_id=inst.id))
            row = ClassJoinRequest(
                lesson_instance_id=inst.id, player_id=who["player_id"], coach_id=self.coaches[coach],
                status=status, side=side, note=note,
                decided_by_coach_id=self.coaches[coach] if decided_by_coach else None)
            if created is not None:
                row.created_at = created
            db.session.add(row)
            db.session.commit()
            return row.id

    def get(self, who="ana", **params):
        client = self.app.test_client()
        return client.get(URL, query_string=params, headers=self.headers(self.users[who]))


@pytest.fixture
def world(app):
    return World(app)


def keys(res):
    return [(r["kind"], r["id"]) for r in res.get_json()["items"]]


# ── -1, -2, -3 ──────────────────────────────────────────────────────────────

@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-1")
def test_lists_both_kinds_of_the_coachs_requests_only(world):
    bruno = world.student("Bruno Alves", nickname="Bruninho")
    carla = world.student("Carla Dias")
    diana = world.student("Diana Reis")
    other = world.student("Outro Aluno", coach="rui")
    p = world.private(bruno, created=datetime(2026, 11, 20, 9, 30), decided_at=None, note="olá")
    a1 = world.academy(carla, side="left", title="Quarta", created=datetime(2026, 11, 21, 10, 0))
    a2 = world.academy(diana, side="both", start=BASE + timedelta(days=1))
    world.private(other, coach="rui")
    world.academy(other, coach="rui")

    res = world.get(section="open")
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert sorted(keys(res)) == sorted([("private", p), ("academy", a1), ("academy", a2)])
    by = {(r["kind"], r["id"]): r for r in body["items"]}
    bruno_row, carla_row, diana_row = by[("private", p)], by[("academy", a1)], by[("academy", a2)]
    assert bruno_row["side"] is None and bruno_row["playerName"] == "Bruno Alves"
    assert bruno_row["nickname"] == "Bruninho" and bruno_row["nicknameAsName"] is False
    assert bruno_row["displayName"] == "Bruno Alves"
    assert bruno_row["playerId"] == str(bruno["player_id"]) and bruno_row["coachId"] == str(world.coaches["ana"])
    assert (bruno_row["date"], bruno_row["startTime"], bruno_row["endTime"]) == ("2026-12-01", "18:00", "19:00")
    assert bruno_row["classTitle"] is None and bruno_row["note"] == "olá" and bruno_row["participants"] == []
    assert carla_row["side"] == "left" and carla_row["classTitle"] == "Quarta" and carla_row["decidedBy"] is None
    assert carla_row["lessonInstanceId"] and carla_row["suggestedProfileSide"] == "left"
    assert diana_row["side"] == "both" and diana_row["suggestedProfileSide"] is None
    for row in (bruno_row, carla_row):
        assert row["createdAt"].endswith("+00:00")
    assert bruno_row["decidedAt"] is None
    assert carla_row["createdAt"] == "2026-11-21T10:00:00+00:00"

    student = world.app.test_client().get(URL, headers=world.headers(bruno["user_id"]))
    assert student.status_code == 403


# ── -2 ──────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-2")
def test_each_status_is_in_exactly_one_section(world):
    who = world.student("Bruno Alves")
    ids = {("private", s): world.private(who, status=s, start=BASE + timedelta(days=i)) for i, s in enumerate(PRIVATE_STATUSES)}
    ids.update({("academy", s): world.academy(who, status=s, start=BASE + timedelta(days=i)) for i, s in enumerate(ACADEMY_STATUSES)})

    opened = world.get(section="open")
    history = world.get(section="history")
    default = world.get()
    assert {(k, ) for k in keys(opened)}.isdisjoint({(k, ) for k in keys(history)})
    want_open = {("private", ids[("private", "pending")]), ("private", ids[("private", "countered")]), ("academy", ids[("academy", "pending")])}
    assert set(keys(opened)) == want_open
    assert set(keys(history)) == {(kind, rid) for (kind, _), rid in ids.items()} - want_open
    for res in (opened, history, default):
        assert res.get_json()["counts"] == {"open": 3, "history": 7}
    assert keys(default) == keys(opened)
    bad = world.get(section="closed")
    assert bad.status_code == 400
    assert bad.get_json()["code"] == "invalid_filter" and bad.get_json()["field"] == "section"


@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-3")
def test_open_statuses_match_the_constants():
    from padel_app.services import coach_request_service as svc

    assert svc.PAGE_SIZE == 25 and svc.MAX_PAGE_SIZE == 100
    assert svc.PRIVATE_REQUEST_OPEN_STATUSES == ("pending", "countered")
    assert svc.JOIN_REQUEST_OPEN_STATUSES == ("pending",)
    assert svc.STATUS_ORDER == ("pending", "countered", "accepted", "declined", "rejected", "withdrawn", "superseded")
    for status in PRIVATE_STATUSES:
        assert svc.is_open("private", status) == (status in OPEN_PRIVATE)
    for status in ACADEMY_STATUSES:
        assert svc.is_open("academy", status) == (status == "pending")


# ── -4, -5 ──────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-4")
def test_pages_cover_the_section_once_across_both_kinds(world):
    who = world.student("Bruno Alves")
    for i in range(30):
        world.private(who, start=BASE + timedelta(hours=2 * i))
        world.academy(who, start=BASE + timedelta(hours=2 * i + 1))
    seen = []
    for page in (1, 2, 3):
        res = world.get(section="open", page=page)
        body = res.get_json()
        assert len(body["items"]) == (25 if page < 3 else 10)
        assert body["pagination"] == {"page": page, "perPage": 25, "total": 60, "pages": 3, "hasNext": page < 3, "hasPrev": page > 1}
        seen += keys(res)
    assert len(seen) == 60 and len(set(seen)) == 60
    expected = [(r["kind"], r["id"]) for r in world.get(section="open", per_page=100).get_json()["items"]]
    assert seen == expected
    assert world.get(section="open", per_page=500).get_json()["pagination"]["perPage"] == 100
    for odd in ("0", "abc", "-3"):
        assert world.get(section="open", page=odd).get_json()["pagination"]["page"] == 1
    far = world.get(section="open", page=99).get_json()
    assert far["items"] == [] and far["pagination"]["total"] == 60


@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-5")
def test_default_orders_per_section(world):
    who = world.student("Bruno Alves")
    o3 = world.private(who, start=datetime(2026, 12, 3, 10, 0))
    o1 = world.academy(who, start=datetime(2026, 12, 1, 10, 0))
    o2 = world.private(who, start=datetime(2026, 12, 2, 10, 0), status="countered")
    h20 = world.private(who, status="accepted", created=datetime(2026, 11, 20, 8, 0))
    h22 = world.academy(who, status="rejected", created=datetime(2026, 11, 22, 8, 0))
    h21 = world.private(who, status="declined", created=datetime(2026, 11, 21, 8, 0))
    assert keys(world.get()) == [("academy", o1), ("private", o2), ("private", o3)]
    assert keys(world.get(section="history")) == [("academy", h22), ("private", h21), ("private", h20)]


# ── -6 ──────────────────────────────────────────────────────────────────────

def _sort_fixture(world):
    people = {n: world.student(n, nickname=nick, as_name=as_name) for n, nick, as_name in (
        ("Alice Zeta", "Zed", True), ("Bruno Alves", "Bruninho", False), ("Carla Dias", None, False), ("Duarte Ramos", "aaa", True))}
    rows = []
    t = datetime(2026, 12, 1, 9, 0)
    rows.append(("private", world.private(people["Alice Zeta"], start=t + timedelta(days=3, hours=5), status="pending", created=datetime(2026, 11, 20, 8, 0))))
    rows.append(("private", world.private(people["Bruno Alves"], start=t + timedelta(days=1, hours=9), status="accepted", created=None)))
    rows.append(("private", world.private(people["Carla Dias"], start=t + timedelta(days=2, hours=2), status="declined", created=datetime(2026, 11, 20, 8, 0))))
    rows.append(("academy", world.academy(people["Alice Zeta"], start=t + timedelta(days=2, hours=2), side="right", status="pending", created=datetime(2026, 11, 21, 8, 0))))
    rows.append(("academy", world.academy(people["Bruno Alves"], start=t + timedelta(days=3, hours=1), side="left", status="superseded", created=datetime(2026, 11, 22, 8, 0))))
    rows.append(("academy", world.academy(people["Duarte Ramos"], start=t + timedelta(days=1, hours=3), side="both", status="rejected", created=datetime(2026, 11, 20, 8, 0))))
    rows.append(("academy", world.academy(people["Carla Dias"], start=t + timedelta(days=4), side=None, status="withdrawn", created=datetime(2026, 11, 20, 8, 0))))
    return rows


@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-6")
def test_every_sort_key_both_directions(world):
    _sort_fixture(world)
    everyone = {}
    for section in ("open", "history"):
        for r in world.get(section=section, per_page=100).get_json()["items"]:
            everyone[(r["kind"], r["id"])] = r
    SIDE = {"left": 0, "right": 1, "both": 2, None: 3}
    STATUS = ["pending", "countered", "accepted", "declined", "rejected", "withdrawn", "superseded"]
    nulls = lambda r: r["createdAt"] is None  # noqa: E731

    def wall(r):
        return (r["date"], r["startTime"])

    def key_of(sort_by):
        return {
            "class_date": lambda r: wall(r),
            "class_time": lambda r: (r["startTime"], r["date"]),
            "requested_at": lambda r: ("" if nulls(r) else r["createdAt"],),
            "student": lambda r: r["displayName"].lower(),
            "kind": lambda r: 0 if r["kind"] == "academy" else 1,
            "side": lambda r: SIDE[r["side"]],
            "status": lambda r: STATUS.index(r["status"]),
        }[sort_by]

    for section in ("open", "history"):
        rows = [r for r in everyone.values() if (r["status"] in ("pending", "countered")) == (section == "open")]
        for sort_by in ("class_date", "class_time", "requested_at", "student", "kind", "side", "status"):
            for direction in ("asc", "desc"):
                got = [(r["kind"], r["id"]) for r in world.get(section=section, sort_by=sort_by, sort_dir=direction, per_page=100).get_json()["items"]]
                assert len(got) == len(rows)
                k = key_of(sort_by)
                # Group the server's order by the sort key: the groups must run in key order, and the
                # rows inside one group follow the tie-break.
                seq = [k(everyone[x]) for x in got]
                assert seq == sorted(seq, reverse=(direction == "desc")), (section, sort_by, direction, seq)
                for a, b in zip(got, got[1:]):
                    ra, rb = everyone[a], everyone[b]
                    if k(ra) == k(rb):
                        ta = (0 if nulls(ra) else 1, ra["createdAt"] or "")
                        tb = (0 if nulls(rb) else 1, rb["createdAt"] or "")
                        assert ta >= tb, (sort_by, direction, a, b)
                        if ta == tb:
                            assert (0 if ra["kind"] == "academy" else 1, -ra["id"]) <= (0 if rb["kind"] == "academy" else 1, -rb["id"])
    # The null request instant is the earliest: first ascending, last descending.
    hist_asc = world.get(section="history", sort_by="requested_at", sort_dir="asc").get_json()["items"]
    hist_desc = world.get(section="history", sort_by="requested_at", sort_dir="desc").get_json()["items"]
    assert hist_asc[0]["createdAt"] is None and hist_desc[-1]["createdAt"] is None
    student_asc = world.get(sort_by="student", sort_dir="asc", section="history", per_page=100).get_json()["items"]
    assert [r["displayName"] for r in student_asc][0].lower() == "aaa"  # Duarte's nickname shows as his name


# ── -7 ──────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-7")
def test_each_filter_narrows_rows_and_counts(world):
    amy = world.student("Amy Sousa")
    bob = world.student("Bob Reis")
    # 00:30 Lisbon on 2 Jul 2026 is 23:30 UTC on 1 Jul (summer time).
    late = world.private(amy, status="accepted", created=datetime(2026, 7, 1, 23, 30), start=datetime(2026, 7, 10, 10, 0))
    other_day = world.private(bob, status="declined", created=datetime(2026, 7, 5, 12, 0), start=datetime(2026, 7, 11, 11, 0))
    left = world.academy(amy, side="left", start=datetime(2026, 12, 2, 9, 0))
    both = world.academy(bob, side="both", start=datetime(2026, 12, 3, 20, 0), status="accepted")
    nosd = world.academy(bob, side=None, start=datetime(2026, 12, 4, 9, 30), status="rejected")
    priv_open = world.private(amy, start=datetime(2026, 12, 5, 9, 0))

    def ids(**params):
        res = world.get(**params)
        assert res.status_code == 200, res.get_json()
        return set(keys(res)), res.get_json()

    got, body = ids(section="open", kind="private")
    assert got == {("private", priv_open)} and body["pagination"]["total"] == 1 and body["counts"] == {"open": 1, "history": 2}
    assert ids(section="history", kind="academy")[0] == {("academy", both), ("academy", nosd)}
    assert ids(section="open", side="left")[0] == {("academy", left)}
    assert ids(section="history", side="both")[0] == {("academy", both)}
    assert ids(section="open", side="none")[0] == {("private", priv_open)}
    assert ids(section="history", side="none")[0] == {("private", late), ("private", other_day), ("academy", nosd)}
    assert ids(section="history", status="accepted")[0] == {("private", late), ("academy", both)}
    assert ids(section="history", status="accepted,rejected")[0] == {("private", late), ("academy", both), ("academy", nosd)}
    assert ids(section="open", status="accepted")[0] == set()  # a status of the other section matches nothing
    got, body = ids(section="history", status="accepted", kind="private")
    assert body["counts"] == {"open": 1, "history": 1}  # the other section ignores `status`, applies the rest
    assert ids(section="history", class_from="2026-12-03", class_to="2026-12-04")[0] == {("academy", both), ("academy", nosd)}
    assert ids(section="history", class_time_from="10:00", class_time_to="11:00")[0] == {("private", late), ("private", other_day)}
    assert ids(section="history", class_time_from="20:00")[0] == {("academy", both)}
    assert ids(section="history", requested_from="2026-07-01", requested_to="2026-07-01")[0] == set()
    assert ids(section="history", requested_from="2026-07-02", requested_to="2026-07-02")[0] == {("private", late)}
    assert ids(section="history", requested_to="2026-07-04")[0] == {("private", late)}
    assert ids(section="history", player_id=bob["player_id"])[0] == {("private", other_day), ("academy", both), ("academy", nosd)}
    assert ids(section="open", kind="private", id=priv_open)[0] == {("private", priv_open)}
    assert ids(section="open", kind="private", id=late)[0] == {("private", late)}  # whatever its section
    assert ids(kind="academy", id=both)[0] == {("academy", both)}
    # kind + status + class date range together
    assert ids(section="history", kind="academy", status="accepted", class_from="2026-12-01", class_to="2026-12-03")[0] == {("academy", both)}
    for bad in ({"class_to": "not-a-date"}, {"class_time_from": "25:99"}, {"kind": "x"}, {"side": "up"},
                {"player_id": "x"}, {"id": "5"}, {"sort_by": "kind", "requested_from": "2026-13-01"}):
        res = world.get(**bad)
        assert res.status_code == 400 and res.get_json()["code"] == "invalid_filter", bad
        assert res.get_json()["field"]
    assert world.get(sort_by="nonsense", sort_dir="sideways").status_code == 200  # unknown sort falls back


# ── -9 ──────────────────────────────────────────────────────────────────────

@contextmanager
def _statement_counter(app):
    with app.app_context():
        engine = db.engine
    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


def _bulk(world, n):
    people = [world.student(f"Student {i}", nickname=f"nick{i}", as_name=bool(i % 2)) for i in range(5)]
    mates = [p["player_id"] for p in people[:2]]
    for i in range(n):
        who = people[i % 5]
        world.private(who, start=BASE + timedelta(hours=i), status=PRIVATE_STATUSES[i % 5], invitees=mates,
                      created=datetime(2026, 11, 1) + timedelta(hours=i), note="n")
        world.academy(who, start=BASE + timedelta(hours=i), status=ACADEMY_STATUSES[i % 5], side=("left", "right", "both", None, "left")[i % 5],
                      created=datetime(2026, 11, 1) + timedelta(hours=i), title=f"Class {i}")
    return people


@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-9")
def test_statement_count_does_not_grow(world):
    from padel_app.services import coach_request_service as svc

    people = _bulk(world, 5)
    params = dict(section="history", per_page=100, status="accepted,declined,rejected,withdrawn,superseded", kind="academy",
                  player_id=people[1]["player_id"], sort_by="student")
    params2 = dict(section="open", per_page=100, sort_by="student")
    world.get(**params)  # warm-up
    counts = {}
    for label, n_more in (("few", 0), ("many", 295)):
        if n_more:
            _bulk_more(world, people, n_more)
        for name, p in (("filtered", params), ("open", params2)):
            with _statement_counter(world.app) as rec:
                res = world.get(**p)
            assert res.status_code == 200 and res.get_json()["items"]
            counts[(label, name)] = len(rec)
    assert counts[("many", "filtered")] == counts[("few", "filtered")]
    assert counts[("many", "open")] == counts[("few", "open")]
    assert max(counts.values()) <= svc.QUERY_BUDGET


def _bulk_more(world, people, n):
    mates = [p["player_id"] for p in people[:2]]
    for i in range(n):
        who = people[i % 5]
        world.private(who, start=BASE + timedelta(days=2, hours=i), status=PRIVATE_STATUSES[i % 5], invitees=mates, created=datetime(2026, 11, 3) + timedelta(hours=i))
        world.academy(who, start=BASE + timedelta(days=2, hours=i), status=ACADEMY_STATUSES[i % 5], side="left", created=datetime(2026, 11, 3) + timedelta(hours=i))


# ── -10 ─────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("CLASSES-COACH-REQUESTS-TABLE-10")
def test_old_list_endpoints_unchanged(world):
    who = world.student("Bruno Alves")
    p1 = world.private(who, created=datetime(2026, 11, 20, 9, 0))
    p2 = world.private(who, created=datetime(2026, 11, 21, 9, 0))
    a1 = world.academy(who, created=datetime(2026, 11, 20, 9, 0))
    a2 = world.academy(who, created=datetime(2026, 11, 22, 9, 0))
    client = world.app.test_client()
    ana = world.headers(world.users["ana"])
    privates = client.get("/api/app/class-requests", headers=ana).get_json()
    joins = client.get("/api/app/class-join-requests", headers=ana).get_json()
    assert isinstance(privates, list) and isinstance(joins, list)  # no paging fields
    assert [r["id"] for r in privates] == [p2, p1]  # id descending
    assert [r["id"] for r in joins] == [a2, a1]  # created_at descending
    assert "pagination" not in privates[0] and privates[0]["createdAt"] == "2026-11-21T09:00:00"  # bare isoformat, as today
    assert joins[0]["kind"] == "academy" and joins[0]["createdAt"] == "2026-11-22T09:00:00"
    student = client.get("/api/app/class-requests", headers=world.headers(who["user_id"]))
    assert student.status_code == 200 and [r["id"] for r in student.get_json()] == [p2, p1]
