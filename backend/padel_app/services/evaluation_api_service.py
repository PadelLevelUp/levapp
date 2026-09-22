"""The v2 evaluation API's rules (PAD-364): competencies, evaluation records, the
player's history, evolution and the class roster. Routes live in
`modules/evaluations_api.py` and stay thin.

Two things hold for everything here:

- **JSON is parsed here, by hand.** Nothing goes through `Field.set_value`,
  `JsonRequestAdapter` or `Model.update_with_dict`: that layer reads a falsy value
  as "not sent" (B-136, PAD-367), and this contract needs `false`, `0`, `""` and
  `null` to mean what they say and an ABSENT key to mean "leave it alone".
- **Figures are computed here and only here** (R-048): means, deltas, "latest",
  "editable". Web and iOS render them.

Writes go through `evaluation_record_service`, the one writer of scores.
"""
from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db
from padel_app.models import (
    Association_CoachPlayer,
    EvaluationCategory,
    EvaluationEntry,
    EvaluationRecord,
    Lesson,
    LessonInstance,
)
from padel_app.services import evaluation_record_service as records
from padel_app.services.evaluation_catalogue import BY_KEY, CATALOGUE, GROUPS, NEW_SCALE, STARTING_KEYS, fold, labels
from padel_app.tools.unit_of_work import unit_of_work
from padel_app.utils.dates import utcnow_naive

MISSING = object()
NAME_MAX = 100   # evaluation_categories.name
NOTE_MAX = 2000


class ApiError(Exception):
    """A refusal the route answers as `{"error": code}` with `status`."""

    def __init__(self, status, code):
        super().__init__(code)
        self.status, self.code = status, code


def today() -> date:
    return records.record_day(utcnow_naive())


# ── lookups, each scoped to the calling coach (R-002) ───────────────────────


def coach_player_for(coach, player_id) -> Association_CoachPlayer:
    try:
        player_id = int(player_id)
    except (TypeError, ValueError):
        raise ApiError(400, "player_id_invalid")
    link = Association_CoachPlayer.query.filter_by(coach_id=coach.id, player_id=player_id).first()
    if link is None:
        raise ApiError(404, "player_not_found")  # not on this coach's roster — as the legacy endpoints answer
    return link


def own_competency(coach, category_id) -> EvaluationCategory:
    try:
        category_id = int(category_id)
    except (TypeError, ValueError):
        raise ApiError(400, "category_id_invalid")
    category = db.session.get(EvaluationCategory, category_id)
    if category is None:
        raise ApiError(404, "competency_not_found")
    if category.coach_id != coach.id:
        raise ApiError(403, "not_your_competency")
    return category


# ── competencies ────────────────────────────────────────────────────────────


def _scale(category):
    return (1 if category.scale_min is None else category.scale_min,
            10 if category.scale_max is None else category.scale_max)


def serialize_competency(category, score_count=None) -> dict:
    if score_count is None:
        score_count = EvaluationEntry.query.filter_by(category_id=category.id).count()
    low, high = _scale(category)
    return {
        "id": category.id,
        "key": category.catalogue_key,
        "name": category.name,
        "group": category.competency_group,  # None = a legacy category
        "scaleMin": low,
        "scaleMax": high,
        "isActive": bool(category.is_active),
        "sortOrder": category.sort_order,
        "scoreCount": score_count,
    }


def _ordered(categories):
    """general, technique, tactics, then custom and legacy together; each by
    `sortOrder` (the unordered last), then name (evaluations.competencies rule 5)."""
    def key(c):
        group = GROUPS.index(c.competency_group) if c.competency_group in GROUPS else len(GROUPS)
        return (group, c.sort_order is None, c.sort_order or 0, fold(c.name), c.id)

    return sorted(categories, key=key)


def ensure_starting_set(coach) -> None:
    """Rule 4 (AV-021, Q17): a coach who holds NO category at all gets the three
    `general` competencies, active, the first time a v2 endpoint reads their set.
    Never from a legacy endpoint or the migration. For such a coach this read is
    the first creator of a non-legacy row — the rollback boundary of PAD-363.
    Idempotent under a race: the unique (coach_id, catalogue_key) index lets one
    request win; the loser rolls its savepoint back and reads the winner's rows."""
    if EvaluationCategory.query.filter_by(coach_id=coach.id).first() is not None:
        return
    try:
        with db.session.begin_nested():
            for order, key in enumerate(STARTING_KEYS):
                entry = BY_KEY[key]
                db.session.add(EvaluationCategory(
                    coach_id=coach.id, name=entry["pt"], scale_min=NEW_SCALE[0], scale_max=NEW_SCALE[1],
                    catalogue_key=key, competency_group=entry["group"], is_active=True, sort_order=order,
                ))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()


def _score_counts(categories) -> dict:
    """category_id → number of entries on it, in one query."""
    return dict(
        db.session.query(EvaluationEntry.category_id, func.count(EvaluationEntry.id))
        .filter(EvaluationEntry.category_id.in_([c.id for c in categories] or [0]))
        .group_by(EvaluationEntry.category_id)
    )


def list_competencies(coach) -> dict:
    ensure_starting_set(coach)
    categories = _ordered(EvaluationCategory.query.filter_by(coach_id=coach.id).all())
    counts = _score_counts(categories)
    switched_on = {c.catalogue_key for c in categories if c.catalogue_key}
    held = {fold(c.name) for c in categories}
    return {
        "competencies": [serialize_competency(c, counts.get(c.id, 0)) for c in categories],
        # Not switched on, and not the twin of a name the coach already holds (Q17).
        "catalogue": [
            {"key": key, "group": group}
            for key, group, _pt, _en in CATALOGUE
            if key not in switched_on and not (labels(key) & held)
        ],
    }


def _clean_name(value) -> str:
    if not isinstance(value, str):
        raise ApiError(400, "name_invalid")
    name = " ".join(value.split())
    if not name or len(name) > NAME_MAX:
        raise ApiError(400, "name_invalid")
    return name


def _name_taken(coach, name, *, except_id=None) -> bool:
    return any(
        fold(c.name) == fold(name) and c.id != except_id
        for c in EvaluationCategory.query.filter_by(coach_id=coach.id)
    )


def create_competency(coach, body):
    """`{catalogueKey}` switches a built-in on; `{name}` adds a custom one. Both
    are 1-5 and active. With `ensure_starting_set` this is what can create a
    NON-LEGACY row — the rollback boundary named in PAD-363. Switching on a
    built-in that is already a row is idempotent. Returns `(competency, created)`.

    Known and accepted: two custom names that differ only in case, submitted at the
    same instant, both insert — the unique (coach_id, name) index is case-sensitive,
    as the shipped legacy upsert is; one after the other the second is a 409."""
    if not isinstance(body, dict):
        raise ApiError(400, "body_invalid")
    key = body.get("catalogueKey", MISSING)
    if key is not MISSING:
        if not isinstance(key, str) or key not in BY_KEY:
            raise ApiError(400, "catalogue_key_unknown")
        entry = BY_KEY[key]
        existing = EvaluationCategory.query.filter_by(coach_id=coach.id, catalogue_key=key).first()
        if existing is not None:  # switching on is idempotent (rule 6)
            existing.is_active = True
            db.session.commit()
            return existing, False
        if any(_name_taken(coach, label) for label in (entry["pt"], entry["en"])):
            # The name may be held by this very competency, switched on by a racing
            # request since we looked (a double tap): then answer that row.
            winner = EvaluationCategory.query.filter_by(coach_id=coach.id, catalogue_key=key).first()
            if winner is not None:
                return winner, False
            raise ApiError(409, "duplicate_name")
        name, group = entry["pt"], entry["group"]
    else:
        name, group, key = _clean_name(body.get("name")), "custom", None
        if _name_taken(coach, name):
            raise ApiError(409, "duplicate_name")

    category = EvaluationCategory(
        coach_id=coach.id, name=name, scale_min=NEW_SCALE[0], scale_max=NEW_SCALE[1],
        catalogue_key=key, competency_group=group, is_active=True, sort_order=None,
    )
    try:
        db.session.add(category)
        db.session.commit()
    except IntegrityError:
        # A double tap: another request inserted it between our check and our insert
        # (the unique (coach_id, catalogue_key) / (coach_id, name) indexes are the guard).
        # Answer what the first request answered.
        db.session.rollback()
        if key is not None:
            winner = EvaluationCategory.query.filter_by(coach_id=coach.id, catalogue_key=key).first()
            if winner is not None:
                return winner, False
        raise ApiError(409, "duplicate_name")
    return category, True


def update_competency(coach, category_id, body) -> EvaluationCategory:
    """`{name?, isActive?, sortOrder?}` — by id, and only the keys that are present."""
    category = own_competency(coach, category_id)
    if not isinstance(body, dict):
        raise ApiError(400, "body_invalid")

    changes = {}
    if "name" in body:
        if category.catalogue_key:
            raise ApiError(409, "catalogue_competency")  # translated by key; switched off, never renamed
        name = _clean_name(body["name"])
        if _name_taken(coach, name, except_id=category.id):
            raise ApiError(409, "duplicate_name")
        changes["name"] = name
    if "isActive" in body:
        if not isinstance(body["isActive"], bool):
            raise ApiError(400, "is_active_invalid")
        changes["is_active"] = body["isActive"]
    if "sortOrder" in body:
        order = body["sortOrder"]
        if order is not None and (isinstance(order, bool) or not isinstance(order, int) or order < 0):
            raise ApiError(400, "sort_order_invalid")
        changes["sort_order"] = order

    for column, value in changes.items():
        setattr(category, column, value)
    db.session.commit()
    return category


def delete_competency(coach, category_id) -> dict:
    from padel_app.services.coach_service import delete_evaluation_category_service

    category = own_competency(coach, category_id)
    if category.catalogue_key:
        raise ApiError(409, "catalogue_competency")  # a built-in is switched off, never deleted
    return delete_evaluation_category_service(category, actor_user_id=coach.user_id)


# ── records ─────────────────────────────────────────────────────────────────


def _number(score):
    return int(score) if float(score).is_integer() else float(score)


def _rating(entry) -> dict:
    low, high = _scale(entry.category)
    return {
        "categoryId": entry.category_id, "name": entry.category.name, "key": entry.category.catalogue_key,
        "score": _number(entry.score), "scaleMin": low, "scaleMax": high,
    }


def _entry_order(entry):
    category = entry.category
    return (category.sort_order is None, category.sort_order or 0, category.id)


def serialize_record(record, *, on=None) -> dict:
    instance = record.lesson_instance
    return {
        "id": record.id,
        "evaluatedOn": record.evaluated_on.isoformat(),
        "classInstanceId": record.lesson_instance_id,
        "className": instance.title if instance is not None else None,
        "note": record.note,
        # Q9: editable on the day it was made; afterwards it can only be deleted.
        "editable": record.evaluated_on == (on or today()),
        "ratings": [_rating(e) for e in sorted(record.entries, key=_entry_order)],
        "share": None,  # evaluations.sharing (slice 7)
    }


def latest_entries(coach_player_id) -> dict:
    """category_id → its latest rating. "Latest" is ONE definition in v2: the
    greatest `(evaluated_at, id)` among the rows that sit in a record."""
    latest = {}
    rated = EvaluationEntry.query.filter_by(coach_player_id=coach_player_id).filter(EvaluationEntry.record_id.isnot(None))
    for entry in rated:
        held = latest.get(entry.category_id)
        if held is None or (entry.evaluated_at, entry.id) > (held.evaluated_at, held.id):
            latest[entry.category_id] = entry
    return latest


def player_evaluations(coach, player_id) -> dict:
    """The player's records, newest first. Record-less entries are served NOWHERE
    in v2 (Q29): an earlier score of a day that the record's slot moved on from —
    or the loser of a slot race — stays in the table, untouched, and is not read.
    What a card shows is what an average counts."""
    link = coach_player_for(coach, player_id)
    on = today()
    found = (
        EvaluationRecord.query.filter_by(coach_player_id=link.id)
        .order_by(EvaluationRecord.evaluated_on.desc(), EvaluationRecord.id.desc()).all()
    )
    with_data = (
        db.session.query(EvaluationEntry.category_id)
        .filter_by(coach_player_id=link.id).filter(EvaluationEntry.record_id.isnot(None)).distinct()
    )
    return {
        "lastEvaluatedOn": found[0].evaluated_on.isoformat() if found else None,
        "records": [serialize_record(r, on=on) for r in found],
        "competenciesWithData": sorted(row[0] for row in with_data),
    }


def _resolve_class(coach, ref):
    """`{model, id, date}` → `(instance, pending)`. NEVER materialises: `instance` is
    the occurrence's row when it has one; otherwise `pending` is `(lesson, date)`
    for `_materialise` to use immediately before a write. Validates the ref, the
    coach's ownership of the class and — for an occurrence with no row — that the
    series really produces that date. Whether a PAST occurrence may be written to is
    the caller's question: the class read serves it (`canRate: false`), `put_record`
    refuses it (409 class_not_materialised)."""
    from padel_app.modules.frontend_api import coach_owns_instance, coach_owns_lesson

    if not isinstance(ref, dict) or str(ref.get("model", "")).lower() not in ("lesson", "lessoninstance"):
        raise ApiError(400, "class_ref_invalid")
    try:
        class_id = int(ref.get("id"))
    except (TypeError, ValueError):
        raise ApiError(400, "class_ref_invalid")

    if str(ref["model"]).lower() == "lessoninstance":
        instance = db.session.get(LessonInstance, class_id)
        if instance is None:
            raise ApiError(404, "class_not_found")
        if not coach_owns_instance(coach, instance):
            raise ApiError(403, "not_your_class")
        return instance, None

    lesson = db.session.get(Lesson, class_id)
    if lesson is None:
        raise ApiError(404, "class_not_found")
    if not coach_owns_lesson(coach, lesson):
        raise ApiError(403, "not_your_class")
    try:
        occurrence = date.fromisoformat(str(ref.get("date"))[:10])
    except ValueError:
        raise ApiError(400, "class_ref_invalid")
    instance = LessonInstance.query.filter_by(lesson_id=lesson.id, original_lesson_occurence_date=occurrence).first()
    if instance is not None:
        return instance, None
    if not lesson.produces(occurrence):
        raise ApiError(400, "class_ref_invalid")
    return None, (lesson, occurrence)


def _materialise(pending) -> LessonInstance:
    """Create the occurrence's row — called only when a write is certain.

    Materialising enrols the whole roster as unmarked presences and fans the
    standing waiting list out (PAD-363's reading of get_or_materialize_instance; it
    sends nothing). Rating a player may do that for today's class or a later one,
    never for a past one, and never on a request that ends up writing nothing."""
    from padel_app.services.lesson_service import get_or_materialize_instance

    lesson, occurrence = pending
    return get_or_materialize_instance(lesson, occurrence)


def _validated_ratings(coach, raw) -> dict:
    """{category: int | None} — every key checked before anything is written."""
    if not isinstance(raw, dict):
        raise ApiError(400, "ratings_invalid")
    ratings = {}
    for key, value in raw.items():
        category = own_competency(coach, key)
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not float(value).is_integer():
                raise ApiError(400, "score_not_an_integer")
            low, high = _scale(category)
            if not low <= int(value) <= high:
                raise ApiError(400, "score_out_of_range")  # B-126: the range rule, enforced at last
            value = int(value)
        ratings[category] = value
    return ratings


def put_record(coach, body):
    """Get-or-create today's record for (coach-player, class-or-none) and apply
    the keys that are present. Returns the record, or None when nothing is left
    of it. All-or-nothing: the body is validated before the first write."""
    if not isinstance(body, dict) or "playerId" not in body:
        raise ApiError(400, "player_id_required")
    link = coach_player_for(coach, body["playerId"])
    ratings = _validated_ratings(coach, body["ratings"]) if "ratings" in body else {}
    note = body.get("note", MISSING)
    if note is not MISSING and note is not None:
        if not isinstance(note, str) or len(note) > NOTE_MAX:
            raise ApiError(400, "note_invalid")

    instance, pending = None, None
    if body.get("classRef") is not None:
        instance, pending = _resolve_class(coach, body["classRef"])
        # Slice 6 owns the product decision on past classes; the API must not make
        # it by accident — and it says so before anything else can be refused.
        if pending is not None and pending[1] < today():
            raise ApiError(409, "class_not_materialised")
    instance_id = instance.id if instance is not None else None

    on = today()
    if body.get("recordId") is not None:
        # Rule 11: a form left open across midnight must not silently start a new day's record.
        open_record = db.session.get(EvaluationRecord, body["recordId"]) if isinstance(body["recordId"], int) else None
        if open_record is None:
            raise ApiError(404, "record_not_found")
        if open_record.coach_player.coach_id != coach.id:
            raise ApiError(403, "not_your_record")
        if open_record.coach_player_id != link.id or open_record.lesson_instance_id != instance_id:
            raise ApiError(400, "record_mismatch")  # the record of another player, or of another class
        if open_record.evaluated_on != on:
            raise ApiError(409, "record_not_editable")
    existing = None
    if pending is None:  # an occurrence with no row yet cannot have a record
        existing = EvaluationRecord.query.filter_by(coach_player_id=link.id, evaluated_on=on)
        existing = (existing.filter(EvaluationRecord.lesson_instance_id.is_(None)) if instance_id is None
                    else existing.filter_by(lesson_instance_id=instance_id)).first()
    held = {e.category_id for e in existing.entries} if existing is not None else set()
    for category, value in ratings.items():
        if value is not None and not category.is_active and category.id not in held:
            raise ApiError(409, "competency_inactive")  # an existing rating may still change (Q26)

    writes_something = any(v is not None for v in ratings.values()) or (note is not MISSING and (note or "").strip())
    if existing is None and not writes_something:
        return None  # nothing to clear, nothing to write: no record is made

    # Every refusal and the no-op are behind us: only now may the class get its row.
    if pending is not None:
        instance_id = _materialise(pending).id

    with unit_of_work():
        record = existing or records.get_or_create_record(link.id, day=on, lesson_instance_id=instance_id)
        for category, value in ratings.items():
            if value is None:
                records.clear_rating(record, category.id)
            else:
                records.upsert_rating(record, category.id, value, evaluated_at=utcnow_naive())
        if note is not MISSING:
            records.set_note(record, note)
        db.session.flush()
        db.session.refresh(record)
        kept = not records.delete_record_if_empty(record)
    return record if kept else None


def delete_record(coach, record_id) -> None:
    record = db.session.get(EvaluationRecord, record_id)
    if record is None:
        raise ApiError(404, "record_not_found")
    if record.coach_player.coach_id != coach.id:
        raise ApiError(403, "not_your_record")
    db.session.delete(record)
    db.session.commit()


# ── evolution (R-048) ───────────────────────────────────────────────────────


def _one_decimal(value) -> float:
    """One decimal everywhere, a half always up — never the banker's rounding of `round`."""
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _months_back(day: date, months: int) -> date:
    year, month = divmod(day.year * 12 + day.month - 1 - months, 12)
    month += 1
    last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
    return date(year, month, min(day.day, last))


def evolution(coach, player_id, category_id) -> dict:
    link = coach_player_for(coach, player_id)
    if category_id in (None, ""):
        raise ApiError(400, "category_id_required")
    category = own_competency(coach, category_id)

    # Only the ratings that sit in a record count (Q29), each on its record's day:
    # what is averaged is exactly what the history cards show.
    rows = [
        (day, score) for day, score in
        db.session.query(EvaluationRecord.evaluated_on, EvaluationEntry.score)
        .join(EvaluationEntry, EvaluationEntry.record_id == EvaluationRecord.id)
        .filter(EvaluationRecord.coach_player_id == link.id, EvaluationEntry.category_id == category.id)
    ]
    by_month = defaultdict(list)
    for day, score in rows:
        by_month[day.strftime("%Y-%m")].append(score)
    months = sorted(by_month)
    raw = {m: sum(by_month[m]) / len(by_month[m]) for m in months}

    on = today()

    def rolling(n):
        scores = [score for day, score in rows if _months_back(on, n) <= day <= on]
        return _one_decimal(sum(scores) / len(scores)) if scores else None

    low, high = _scale(category)
    return {
        "scaleMin": low, "scaleMax": high,
        "series": [{"month": m, "mean": _one_decimal(raw[m])} for m in months],
        "means": {"m1": rolling(1), "m6": rolling(6), "m12": rolling(12)},
        # Rule 9: the difference of the two POINTS the coach is looking at — each monthly
        # mean rounded first — so the number under the chart equals what the chart shows.
        "delta": ({"value": _one_decimal(Decimal(str(_one_decimal(raw[months[-1]]))) - Decimal(str(_one_decimal(raw[months[0]])))),
                   "sinceMonth": months[0]} if len(months) > 1 else None),
    }


# ── the class ───────────────────────────────────────────────────────────────


def _players_with_users(player_ids) -> list:
    """The players (users joined) in one statement. The caller keeps the list: the session's
    identity map holds weak references, so a discarded result would be reloaded row by row."""
    from sqlalchemy.orm import joinedload

    from padel_app.models import Player

    if not player_ids:
        return []
    return Player.query.options(joinedload(Player.user)).filter(Player.id.in_(player_ids)).all()


def class_evaluations(coach, ref) -> dict:
    """A READ: who is in the class, and each one's most recent record in it. Never materialises."""
    ensure_starting_set(coach)
    instance, pending = _resolve_class(coach, ref)
    rows = instance.presences if instance is not None else pending[0].players_relations
    # One statement loads every participant's player and user into the session, so the
    # `.player` / `.user` reads below hit the identity map, not one query per row (rule 3).
    loaded = _players_with_users({row.player_id for row in rows})  # noqa: F841 — held for the identity map
    if instance is not None:
        roster = [(p.player, p.status == "absent") for p in rows]
    else:
        roster = [(rel.player, False) for rel in rows]

    links = {
        link.player_id: link
        for link in Association_CoachPlayer.query.filter_by(coach_id=coach.id)
        .filter(Association_CoachPlayer.player_id.in_([p.id for p, _ in roster] or [0]))
    }
    on = today()
    due = due_for_links(coach, links.values(), on)  # rule 8: once for the roster, never per row
    latest_record = {}
    if instance is not None and links:
        found = (
            EvaluationRecord.query.filter_by(lesson_instance_id=instance.id)
            .filter(EvaluationRecord.coach_player_id.in_([link.id for link in links.values()]))
            .order_by(EvaluationRecord.evaluated_on.desc(), EvaluationRecord.id.desc())
        )
        for record in found:  # one query; the first seen per link is its most recent
            latest_record.setdefault(record.coach_player_id, record)

    participants = []
    for player, absent in roster:
        link = links.get(player.id)
        if link is None:
            continue  # not on this coach's roster: a PUT for them is 404, and a row that cannot be rated is a dead control
        # Which record a class row shows (Q28): the participant's MOST RECENT one for
        # this occurrence, not only today's — `editable` says which. A PUT still files under today.
        record = latest_record.get(link.id)
        participants.append({
            "playerId": player.id,
            "coachPlayerId": link.id,
            "name": player.user.name if player.user is not None else "",
            "absent": absent,
            "due": due.get(link.id, False),  # evaluations.reminders rule 3 (PAD-404)
            "record": serialize_record(record, on=on) if record is not None else None,
        })
    participants.sort(key=lambda p: p["absent"])  # Q14: absent last; the rest keep the class detail's order (stable)

    active = _ordered(EvaluationCategory.query.filter_by(coach_id=coach.id, is_active=True).all())
    counts = _score_counts(active)
    return {
        "classInstanceId": instance.id if instance is not None else None,
        # False exactly when PUT would answer 409 class_not_materialised: the occurrence
        # has no row AND its date is before today on the club's clock. The server says
        # it, so no client compares a date with its own clock (R-048).
        "canRate": not (pending is not None and pending[1] < on),
        "competencies": [serialize_competency(c, counts.get(c.id, 0)) for c in active],
        "participants": participants,
    }


# ── the evaluation reminder (PAD-404, evaluations.reminders) ────────────────
#
# A frequency the coach chooses and a `due` marker the server computes from it.
# In-app only (rule 5): nothing here writes a message, a push or a job. The
# setting lives on `notification_configs` (rule 13 of notifications.config) but
# is NOT the class reminder — `evaluation_reminder_type` / `_value` only.

REMINDER_TYPES = ("never", "monthly", "every_n_classes")
EVERY_N_MIN, EVERY_N_MAX = 1, 99
MONTHLY_WINDOW_DAYS = 30   # rule 3: "in the last 30 days, today inclusive"


def _reminder_setting(coach):
    """(type, value) for the coach: the row's if there is one, else the defaults.
    NEVER creates the row (rule 2) — `get_or_create_config` is for the PUT only."""
    from padel_app.models import NotificationConfig

    row = NotificationConfig.query.filter_by(coach_id=coach.id).first()
    if row is None:
        return "never", None
    kind = row.evaluation_reminder_type if row.evaluation_reminder_type in REMINDER_TYPES else "never"
    return kind, row.evaluation_reminder_value


def _settings_payload(kind, value) -> dict:
    payload = {"reminder": kind}
    if kind == "every_n_classes":
        payload["everyN"] = value
    return payload


def get_evaluation_settings(coach) -> dict:
    return _settings_payload(*_reminder_setting(coach))


def put_evaluation_settings(coach, body) -> dict:
    """Rule 2 / 8: the body is read as sent — absent, null and 0 are three different things."""
    kind = body.get("reminder", MISSING)
    if kind not in REMINDER_TYPES:
        raise ApiError(400, "reminder_invalid")
    _current_kind, current_value = _reminder_setting(coach)
    value = current_value   # never / monthly leave a stored N alone (they ignore it)
    if kind == "every_n_classes":
        sent = body.get("everyN", MISSING)
        if sent is MISSING:
            if current_value is None:
                raise ApiError(400, "every_n_required")   # a fresh every_n_classes needs its N
        elif isinstance(sent, bool) or not isinstance(sent, int) or not EVERY_N_MIN <= sent <= EVERY_N_MAX:
            raise ApiError(400, "every_n_invalid")        # null, "2", true, 0 and 100 are all refused
        else:
            value = sent
    from padel_app.services.notification_service import get_or_create_config

    with unit_of_work():
        config = get_or_create_config(coach.id)
        config.evaluation_reminder_type = kind
        config.evaluation_reminder_value = value
    return _settings_payload(kind, value)


def _as_date(value):
    """`func.max` over a Date comes back as a date on Postgres and as text on sqlite."""
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def due_for_links(coach, links, on=None) -> dict:
    """Rule 3 — `due` per `Association_CoachPlayer.id` for the coach's frequency, on the
    club-zone calendar (`on`), in at most three statements whatever the roster size
    (R-048: the server computes it; a client never compares dates)."""
    links = list(links)
    if not links:
        return {}
    kind, value = _reminder_setting(coach)
    if kind == "never":
        return {link.id: False for link in links}
    on = on or today()
    link_ids = [link.id for link in links]
    newest = {
        link_id: _as_date(day)
        for link_id, day in (
            db.session.query(EvaluationRecord.coach_player_id, func.max(EvaluationRecord.evaluated_on))
            .filter(EvaluationRecord.coach_player_id.in_(link_ids))
            .group_by(EvaluationRecord.coach_player_id)
            .all()
        )
    }
    if kind == "monthly":
        # "The last 30 days, today inclusive" is on-29 … on: a record 29 days ago is inside,
        # one exactly 30 days ago is not — that player is due.
        floor = on - timedelta(days=MONTHLY_WINDOW_DAYS - 1)
        return {link.id: newest.get(link.id) is None or newest[link.id] < floor for link in links}

    # every_n_classes: present in >= N of this coach's occurrences dated after the newest record.
    if not isinstance(value, int) or value < EVERY_N_MIN:
        return {link.id: False for link in links}   # a row the API could not have written: mark nobody
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.presences import Presence

    by_player = {link.player_id: link.id for link in links}
    rows = (
        db.session.query(Presence.player_id, LessonInstance.start_datetime)
        .join(LessonInstance, LessonInstance.id == Presence.lesson_instance_id)
        .join(Association_CoachLessonInstance,
              Association_CoachLessonInstance.lesson_instance_id == LessonInstance.id)
        .filter(Association_CoachLessonInstance.coach_id == coach.id)
        .filter(Presence.status == "present")          # unmarked (NULL) and absent never count
        .filter(Presence.player_id.in_(list(by_player)))
        .all()
    )
    attended = defaultdict(int)
    for player_id, start in rows:
        link_id = by_player[player_id]
        last = newest.get(link_id)
        # start is club wall-clock (R-023); an occurrence not yet reached cannot have been attended.
        if start is not None and start.date() <= on and (last is None or start.date() > last):
            attended[link_id] += 1                                          # every occurrence counts on its own
    return {link.id: attended[link.id] >= value for link in links}
