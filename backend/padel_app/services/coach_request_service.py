"""classes.coach-requests-table (PAD-795): the coach's one list of private class requests and
academy join requests, a page at a time.

Both kinds are selected, filtered, sorted and cut in SQL as one UNION ALL; only the page's rows are
then loaded, in batches (rule 8). Clock: a class's date and times are the club's wall clock (R-023);
`created_at` / `decided_at` are naive UTC, serialized through `to_utc_iso`.
"""
from datetime import datetime, timedelta

from sqlalchemy import String, and_, case, cast, extract, func, literal, null, select, union_all
from sqlalchemy.orm import joinedload

from padel_app.models import Association_CoachPlayer, ClassJoinRequest, ClassRequest, Player, User
from padel_app.models.lesson_instances import LessonInstance
from padel_app.services import player_service
from padel_app.sql_db import db
from padel_app.utils.dates import to_utc_iso, wall_to_utc_naive

# specflow/impl/classes/constants.md
PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
QUERY_BUDGET = 14
SEARCH_MAX_LENGTH = 100
PRIVATE_REQUEST_OPEN_STATUSES = ("pending", "countered")
JOIN_REQUEST_OPEN_STATUSES = ("pending",)
STATUS_ORDER = ("pending", "countered", "accepted", "declined", "rejected", "withdrawn", "superseded")

SORT_KEYS = ("class_date", "class_time", "requested_at", "student", "kind", "side", "status")
SIDES = ("left", "right", "both")
DEFAULT_SORT = {"open": ("class_date", "asc"), "history": ("requested_at", "desc")}


class InvalidFilter(Exception):
    """A malformed filter value: `400 {code: "invalid_filter", field}`."""

    def __init__(self, field):
        super().__init__(field)
        self.field = field


def is_open(kind, status):
    """Rule 3: the section a (kind, status) pair belongs to."""
    return status in (JOIN_REQUEST_OPEN_STATUSES if kind == "academy" else PRIVATE_REQUEST_OPEN_STATUSES)


# ── parameters ──────────────────────────────────────────────────────────────

def _int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _date(args, field):
    raw = args.get(field)
    if raw in (None, ""):
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        raise InvalidFilter(field)


def _id(raw, field):
    """An integer key; a value past what a Postgres integer holds is a malformed filter, not a 500."""
    try:
        value = int(raw)
    except ValueError:
        raise InvalidFilter(field)
    if not 0 <= value <= 2**31 - 1:
        raise InvalidFilter(field)
    return value


def _minutes(args, field):
    raw = args.get(field)
    if raw in (None, ""):
        return None
    try:
        parsed = datetime.strptime(raw, "%H:%M")
    except ValueError:
        raise InvalidFilter(field)
    return parsed.hour * 60 + parsed.minute


def parse_params(args):
    """The request's query string as one dict; raises `InvalidFilter` on a malformed value."""
    section = args.get("section") or "open"
    if section not in ("open", "history"):
        raise InvalidFilter("section")
    kind = args.get("kind") or None
    if kind not in (None, "private", "academy"):
        raise InvalidFilter("kind")
    side = args.get("side") or None
    if side not in (None, "none", *SIDES):
        raise InvalidFilter("side")
    statuses = [s for s in (args.get("status") or "").split(",") if s]
    if any(s not in STATUS_ORDER for s in statuses):
        raise InvalidFilter("status")
    player_id = args.get("player_id")
    if player_id not in (None, ""):
        player_id = _id(player_id, "player_id")
    else:
        player_id = None
    request_id = args.get("id")
    if request_id not in (None, ""):
        if kind is None:
            raise InvalidFilter("kind")
        request_id = _id(request_id, "id")
    else:
        request_id = None
    sort_by, sort_dir = args.get("sort_by"), args.get("sort_dir")
    if sort_by not in SORT_KEYS or sort_dir not in ("asc", "desc"):
        sort_by, sort_dir = DEFAULT_SORT[section]  # rule 5: a missing or unknown key or direction
    per_page = _int(args.get("per_page"), PAGE_SIZE)
    return {
        "section": section, "kind": kind, "side": side, "statuses": statuses, "player_id": player_id, "id": request_id,
        "class_from": _date(args, "class_from"), "class_to": _date(args, "class_to"),
        "time_from": _minutes(args, "class_time_from"), "time_to": _minutes(args, "class_time_to"),
        "requested_from": _date(args, "requested_from"), "requested_to": _date(args, "requested_to"),
        "sort_by": sort_by, "sort_dir": sort_dir,
        "search": (args.get("search") or "").strip()[:SEARCH_MAX_LENGTH].strip(), "search_ids": None,
        "page": max(1, _int(args.get("page"), 1)), "per_page": max(1, min(MAX_PAGE_SIZE, per_page)),
    }


# ── the one query ───────────────────────────────────────────────────────────

def _status_rank(column):
    return case(*[(column == s, i) for i, s in enumerate(STATUS_ORDER)], else_=len(STATUS_ORDER))


def _side_rank(column):
    return case((column == "left", 0), (column == "right", 1), (column == "both", 2), else_=3)


def _legs(coach_id, p, section, *, with_status):
    """One SELECT per kind, both with the same columns, every filter applied."""
    cp = Association_CoachPlayer
    open_statuses = {"private": PRIVATE_REQUEST_OPEN_STATUSES, "academy": JOIN_REQUEST_OPEN_STATUSES}
    legs = []
    for kind, model, start_col, side_col in (
        ("private", ClassRequest, ClassRequest.start_datetime, null()),
        ("academy", ClassJoinRequest, LessonInstance.start_datetime, ClassJoinRequest.side),
    ):
        if p["kind"] and p["kind"] != kind:
            continue
        # B1: `status` is a native enum on Postgres, and the two legs do not share its values: compare and
        # sort it as text, so an academy status asked of a private leg is false, not an error.
        status_col = cast(model.status, String)
        display = case((and_(cp.nickname_as_name.is_(True), cp.nickname.isnot(None), cp.nickname != ""), cp.nickname), else_=User.name)
        minutes = extract("hour", start_col) * 60 + extract("minute", start_col)
        q = (
            select(
                literal(kind).label("kind"),
                model.id.label("id"),
                model.player_id.label("player_id"),
                start_col.label("class_start"),
                minutes.label("class_minutes"),
                model.created_at.label("req_at"),
                status_col.label("status"),
                cast(side_col, String).label("side"),
                literal(0 if kind == "academy" else 1).label("kind_rank"),
                _side_rank(side_col).label("side_rank"),
                _status_rank(status_col).label("status_rank"),
                func.lower(display).label("student_key"),
            )
            .select_from(model)
            .join(Player, Player.id == model.player_id)
            .join(User, User.id == Player.user_id)
            .outerjoin(cp, and_(cp.coach_id == model.coach_id, cp.player_id == model.player_id))
            .where(model.coach_id == coach_id)
        )
        if kind == "academy":
            q = q.join(LessonInstance, LessonInstance.id == ClassJoinRequest.lesson_instance_id)
        if section is not None:
            q = q.where(status_col.in_(open_statuses[kind]) if section == "open" else status_col.not_in(open_statuses[kind]))
        if p["id"] is not None:
            q = q.where(model.id == p["id"])
        if with_status and p["statuses"]:
            q = q.where(status_col.in_(p["statuses"]))
        side = p["side"]
        if side in SIDES:
            q = q.where(side_col == side) if kind == "academy" else q.where(literal(False))
        elif side == "none" and kind == "academy":
            q = q.where(ClassJoinRequest.side.is_(None))
        if p["player_id"] is not None:
            q = q.where(model.player_id == p["player_id"])
        if p["search_ids"] is not None:
            q = q.where(model.player_id.in_(p["search_ids"]) if p["search_ids"] else literal(False))
        if p["class_from"] is not None:
            q = q.where(start_col >= p["class_from"])
        if p["class_to"] is not None:
            q = q.where(start_col < p["class_to"] + timedelta(days=1))
        if p["time_from"] is not None:
            q = q.where(minutes >= p["time_from"])
        if p["time_to"] is not None:
            q = q.where(minutes <= p["time_to"])
        if p["requested_from"] is not None:
            q = q.where(model.created_at >= wall_to_utc_naive(p["requested_from"]))
        if p["requested_to"] is not None:
            q = q.where(model.created_at < wall_to_utc_naive(p["requested_to"] + timedelta(days=1)))
        legs.append(q)
    return legs


def _search_ids(coach_id, query):
    """Rule 7 `search`: the ids of the coach's requesters `players.search`'s one rule accepts, over the
    student's name and the coach's nickname for them. One statement, the size of the coach's requesters;
    the rows are then filtered by these ids in SQL, so the page is cut after the search."""
    cp = Association_CoachPlayer
    requesters = union_all(
        select(ClassRequest.player_id.label("pid")).where(ClassRequest.coach_id == coach_id),
        select(ClassJoinRequest.player_id.label("pid")).where(ClassJoinRequest.coach_id == coach_id),
    ).subquery("requesters")
    rows = db.session.execute(
        select(Player.id, User.name, cp.nickname)
        .select_from(Player)
        .join(User, User.id == Player.user_id)
        .outerjoin(cp, and_(cp.coach_id == coach_id, cp.player_id == Player.id))
        .where(Player.id.in_(select(requesters.c.pid)))
    ).all()
    return [
        pid for pid, name, nickname in rows
        if player_service.rank_player_match({"name": name, "nickname": nickname}, query) is not None
    ]


def _union(coach_id, p, section, *, with_status):
    legs = _legs(coach_id, p, section, with_status=with_status)
    return union_all(*legs).subquery("coach_requests")


def _count(coach_id, p, section, *, with_status):
    u = _union(coach_id, p, section, with_status=with_status)
    return db.session.execute(select(func.count()).select_from(u)).scalar_one()


def _order_by(u, sort_by, sort_dir):
    desc = sort_dir == "desc"
    flip = (lambda c: c.desc()) if desc else (lambda c: c.asc())
    null_first = case((u.c.req_at.is_(None), 0), else_=1)
    keyed = {
        "class_date": [flip(u.c.class_start)],
        "class_time": [flip(u.c.class_minutes), flip(u.c.class_start)],
        "requested_at": [flip(null_first), flip(u.c.req_at)],
        "student": [flip(u.c.student_key)],
        "kind": [flip(u.c.kind_rank)],
        "side": [flip(u.c.side_rank)],
        "status": [flip(u.c.status_rank)],
    }[sort_by]
    # Tie-break: request instant descending (null last), kind ascending (academy first), id descending.
    return keyed + [null_first.desc(), u.c.req_at.desc(), u.c.kind_rank.asc(), u.c.id.desc()]


# ── serialization, batch-loaded ─────────────────────────────────────────────

def _iso_pair(row):
    return to_utc_iso(row.created_at), to_utc_iso(row.decided_at)


def _serialize(kind, row, players, rels, instances, invitees, coach_id):
    player = players.get(row.player_id)
    real_name = player.user.name if player is not None and player.user is not None else ""
    rel = rels.get(row.player_id)
    created, decided = _iso_pair(row)
    out = {
        "kind": kind,
        "id": row.id,
        "playerId": str(row.player_id),
        "playerName": real_name,
        **player_service.nickname_payload(rel, real_name),
        "coachId": str(row.coach_id),
        "createdAt": created,
        "decidedAt": decided,
        "note": row.note,
        "status": row.status,
    }
    if kind == "private":
        out.update({
            "date": row.start_datetime.date().isoformat(),
            "startTime": row.start_datetime.strftime("%H:%M"),
            "endTime": row.end_datetime.strftime("%H:%M"),
            "classTitle": None,
            "recurrence": row.recurrence,
            "decidedBy": row.decided_by,
            "side": None,
            "participants": [
                {"playerId": str(p.id), "name": p.user.name, "username": p.user.username}
                for p in (invitees.get(int(pid)) for pid in (row.invitee_player_ids or [])) if p is not None and p.user is not None
            ],
            "lessonId": str(row.lesson_id) if row.lesson_id else None,
            "lessonInstanceId": None,
            "suggestedProfileSide": None,
        })
    else:
        inst = instances.get(row.lesson_instance_id)
        start = inst.start_datetime if inst else None
        end = inst.end_datetime if inst else None
        out.update({
            "date": start.date().isoformat() if start else None,
            "startTime": start.strftime("%H:%M") if start else None,
            "endTime": end.strftime("%H:%M") if end else None,
            "classTitle": inst.title if inst else None,
            "recurrence": None,
            "decidedBy": "coach" if row.decided_by_coach_id else None,
            "side": row.side,
            "participants": [],
            "lessonId": None,
            "lessonInstanceId": str(row.lesson_instance_id),
            # Only while the request can still be decided: a decided row offers nothing (rule 13).
            "suggestedProfileSide": (
                row.side if row.side in ("left", "right") and rel is not None and not rel.side
                and row.status in JOIN_REQUEST_OPEN_STATUSES else None
            ),
        })
    return out


def _load_page(coach_id, refs):
    """The page's rows, in `refs` order, with a constant number of statements."""
    private_ids = [r.id for r in refs if r.kind == "private"]
    academy_ids = [r.id for r in refs if r.kind == "academy"]
    private = {r.id: r for r in ClassRequest.query.filter(ClassRequest.id.in_(private_ids)).all()} if private_ids else {}
    academy = {r.id: r for r in ClassJoinRequest.query.filter(ClassJoinRequest.id.in_(academy_ids)).all()} if academy_ids else {}
    player_ids = {r.player_id for r in refs}
    players = {p.id: p for p in Player.query.options(joinedload(Player.user)).filter(Player.id.in_(player_ids)).all()} if player_ids else {}
    rels = player_service.relations_by_player(coach_id, player_ids)
    instances = {}
    if academy:
        ids = {r.lesson_instance_id for r in academy.values()}
        instances = {i.id: i for i in LessonInstance.query.options(joinedload(LessonInstance.lesson)).filter(LessonInstance.id.in_(ids)).all()}
    invitee_ids = {int(pid) for r in private.values() for pid in (r.invitee_player_ids or [])}
    invitees = {p.id: p for p in Player.query.options(joinedload(Player.user)).filter(Player.id.in_(invitee_ids)).all()} if invitee_ids else {}
    items = []
    for ref in refs:
        row = (private if ref.kind == "private" else academy).get(ref.id)
        if row is not None:
            items.append(_serialize(ref.kind, row, players, rels, instances, invitees, coach_id))
    return items


def list_for_coach(coach, args):
    """Rules 1-7: one page of the coach's requests, `{items, pagination, counts}`."""
    p = parse_params(args)
    if p["search"]:
        p["search_ids"] = _search_ids(coach.id, p["search"])
    section = p["section"]
    other = "history" if section == "open" else "open"
    counts = {section: _count(coach.id, p, section, with_status=True), other: _count(coach.id, p, other, with_status=False)}
    # `id` reads one request whatever its section (rule 7): the page ignores the section, the total
    # is the one row found in either.
    one = p["id"] is not None
    total = _count(coach.id, p, None, with_status=True) if one else counts[section]
    pages = max(1, -(-total // p["per_page"]))
    u = _union(coach.id, p, None if one else section, with_status=True)
    refs = db.session.execute(
        select(u.c.kind, u.c.id, u.c.player_id)
        .order_by(*_order_by(u, p["sort_by"], p["sort_dir"]))
        .limit(p["per_page"]).offset((p["page"] - 1) * p["per_page"])
    ).all()
    return {
        "items": _load_page(coach.id, refs),
        "pagination": {
            "page": p["page"], "perPage": p["per_page"], "total": total, "pages": pages,
            "hasNext": p["page"] < pages, "hasPrev": p["page"] > 1,
        },
        "counts": {"open": counts["open"], "history": counts["history"]},
    }
