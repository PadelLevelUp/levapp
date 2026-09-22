import math

from padel_app.models import (
    Coach,
    CoachLevel,
    EvaluationCategory,
    CoachPlayerNote,
    EvaluationEntry,
    Association_CoachPlayer,
)
from padel_app.services.level_ladder import (
    get_level_ladder,
    is_unordered,
    next_display_order,
    normalize_display_orders,
)
from padel_app.services.evaluation_catalogue import NEW_SCALE
from padel_app.services.legacy_scale import legacy_value_to_stars, normalise_legacy_scale
from padel_app.sql_db import db
from padel_app.tools.request_adapter import JsonRequestAdapter

# Ordering convention (.specflow/specs/levels/coach-levels.spec.md rule 3): lower display_order =
# STRONGER level, so the first entry here is the top of a new coach's ladder.
# These are placeholders the coach renames and reorders in Settings.
DEFAULT_COACH_LEVELS = [
    {"code": "L1", "label": "Level 1", "display_order": 1},
    {"code": "L2", "label": "Level 2", "display_order": 2},
    {"code": "L3", "label": "Level 3", "display_order": 3},
]


def _apply_form(form, payload, element):
    fake_request = JsonRequestAdapter(payload, form)
    values = form.set_values(fake_request)
    element.update_with_dict(values)
    return element


def create_default_levels_for_coach(coach):
    """Create the three default skill levels (L1, L2, L3) for a coach.

    Idempotent: does nothing if the coach already has any levels.
    Returns the coach's levels.
    """
    if coach.levels:
        return coach.levels

    for entry in DEFAULT_COACH_LEVELS:
        db.session.add(
            CoachLevel(
                coach_id=coach.id,
                code=entry["code"],
                label=entry["label"],
                display_order=entry["display_order"],
            )
        )
    db.session.commit()
    return coach.levels


def create_coach_service(data):
    coach = Coach()
    form = coach.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    coach.update_with_dict(values)
    coach.create()
    create_default_levels_for_coach(coach)
    return coach


def _coach_id_from_payload(data):
    raw = data.get("coach") or data.get("coach_id") or data.get("coachId")
    if isinstance(raw, (list, tuple)):
        raw = raw[0] if raw else None
    if isinstance(raw, CoachLevel):  # defensive; never expected
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return getattr(raw, "id", None)


def create_coach_level_service(data):
    data = dict(data or {})

    # PAD-70: a level created without an explicit position must be APPENDED to
    # the bottom of the ladder. The column default is 0, which the notification
    # engine would otherwise read as the coach's strongest level. Resolved
    # before the form runs — building the object first would attach it to the
    # session and make the lookup query autoflush a half-built row.
    order = data.get("display_order", data.get("displayOrder"))
    if is_unordered(order):
        coach_id = _coach_id_from_payload(data)
        if coach_id:
            data["display_order"] = next_display_order(coach_id)

    coach_level = CoachLevel()
    form = coach_level.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = form.set_values(fake_request)

    coach_level.update_with_dict(values)
    coach_level.create()
    return coach_level


def upsert_coach_levels(coach, data):
    """Batch upsert coach levels from a list of entries.

    The submitted list IS the coach's ladder, top (strongest) first. Entries may
    carry an explicit ``displayOrder``; when they don't, their position in the
    list is used. Afterwards the whole ladder is renumbered to a contiguous
    ``1..N`` so gaps, duplicates and unset orders can never reach the
    notification engine (PAD-70).
    """
    for position, entry in enumerate(data, start=1):
        display_order = entry.get("displayOrder")
        if is_unordered(display_order):
            display_order = position
        payload = {
            "code": entry.get("code"),
            "label": entry.get("label"),
            "coach": coach.id,
            "display_order": display_order,
        }
        coach_level = (
            CoachLevel.query
            .filter(CoachLevel.coach_id == coach.id)
            .filter(CoachLevel.code == payload["code"])
            .first()
        )
        if coach_level:
            _apply_form(coach_level.get_edit_form(), payload, coach_level)
            coach_level.save()
        else:
            coach_level = CoachLevel()
            _apply_form(coach_level.get_create_form(), payload, coach_level)
            coach_level.create()

    normalize_display_orders(coach.id)
    db.session.commit()


def upsert_evaluation_categories(coach, data):
    """Batch upsert evaluation categories from a list of entries. Returns the
    entries as stored, for the echo: every scale is 1-5 (PAD-403,
    evaluations.legacy-conversion rule 5)."""
    data = [normalise_legacy_scale(entry) for entry in data]
    for entry in data:
        payload = {
            'name': entry.get("name"),
            'scale_min': entry.get("scaleMin"),
            'scale_max': entry.get("scaleMax"),
            "coach": coach.id,
        }
        evaluation_category = (
            EvaluationCategory.query
            .filter(EvaluationCategory.coach_id == coach.id)
            .filter(EvaluationCategory.name == payload["name"])
            .first()
        )
        # evaluations.legacy-client-contract (R-047, PAD-363): this endpoint is one
        # of the five App Store 1.0/1.1.0 call. It never updates a non-legacy
        # competency, and a name one already holds is skipped — (coach, name) is
        # unique, so it could only collide.
        # A legacy category the coach switched off is skipped the same way: no
        # rescale and NO reactivation (rule 5, Coordinator ruling 2026-09-21).
        if evaluation_category is not None and not (evaluation_category.is_legacy and evaluation_category.is_active):
            continue
        if evaluation_category:
            _apply_form(evaluation_category.get_edit_form(), payload, evaluation_category)
            evaluation_category.save()
        else:
            evaluation_category = EvaluationCategory()
            _apply_form(evaluation_category.get_create_form(), payload, evaluation_category)
            evaluation_category.create()
    return data


def add_coach_note_service(coach, data):
    """Creates a coach note (strength/weakness). Returns (result_dict, status_code)."""
    player_id = data.get("playerId")
    note_type = data.get("type")
    text = data.get("text", "").strip()

    if not text:
        return {"error": "text is required"}, 400

    if note_type not in ("strength", "weakness"):
        return {"error": "type must be 'strength' or 'weakness'"}, 400

    coach_player = (
        Association_CoachPlayer.query
        .filter_by(coach_id=coach.id, player_id=player_id)
        .first_or_404()
    )

    note = CoachPlayerNote()
    _apply_form(note.get_create_form(), {
        "coach_player": coach_player.id,
        "type": note_type,
        "text": text,
    }, note)
    note.create()

    return {"status": "ok", "id": note.id, "type": note_type, "text": note.text}, 200


def _log_ignored_score(coach, category_id):
    """An ignored score is silent to the client by design (rule 8); leave a trace for us."""
    from flask import current_app, has_app_context

    if has_app_context():
        current_app.logger.warning(
            "add_evaluation_entry: coach %s posted a score for category %r, which is not theirs — ignored (B-145)",
            coach.id, category_id,
        )


# D121: a value above this marks the whole body as a stale 1-10 form.
LEGACY_BODY_ABOVE = NEW_SCALE[1]


def add_evaluation_entry_service(coach, data):
    """Records evaluation scores and notes for a player. Returns (body, status)."""
    player_id = data.get("playerId")
    scores = data.get("scores", [])
    strengths = data.get("strengths", [])
    weaknesses = data.get("weaknesses", [])

    coach_player = (
        Association_CoachPlayer.query
        .filter_by(coach_id=coach.id, player_id=player_id)
        .first_or_404()
    )

    # evaluations.entries rules 6-7 (PAD-337): write only the scores a coach
    # gave. A null value is an abstention, and a value equal to the category's
    # latest score adds no history row, so it cannot move `evaluatedAt`. Old
    # App Store builds still post every category, which this keeps harmless for
    # categories that already hold a score.
    from padel_app.services.evaluation_record_service import append_entry

    latest = {e.category_id: e.score for e in coach_player.current_evaluations}
    # evaluations.legacy-client-contract (R-047, PAD-363): this endpoint accepts
    # scores for the coach's own LEGACY categories only. An App Store build posts
    # a midpoint for every category it knows of; a competency it should never
    # have seen is ignored, and the response is the same.
    # A legacy category the coach switched off is ignored too (rule 3): a build
    # holding a list fetched before the switch-off still posts its midpoint for it.
    legacy_ids = {c.id for c in coach.evaluation_categories if c.is_legacy and c.is_active}
    # evaluations.entries rule 8 (PAD-370, B-145, compass R-002): a score is
    # recorded only in one of the coach's OWN categories. Another coach's
    # category, an id that does not exist or is not a number is ignored AND
    # logged; the response is the same — App Store builds post every category in
    # one body and read any non-2xx as a failed save, with the earlier scores
    # already written. An own category this endpoint does not serve (above) is
    # the expected case and is not logged.
    own_ids = {c.id for c in coach.evaluation_categories}
    # 1. Which scores this body would write (the rules above), before writing any.
    candidates = []
    for score in scores:
        value = score.get("value")
        if value is None:
            continue
        try:
            category_id = int(score.get("categoryId"))
            if category_id not in own_ids:
                _log_ignored_score(coach, score.get("categoryId"))
                continue
            if category_id not in legacy_ids:
                continue
        except (TypeError, ValueError, OverflowError):  # OverflowError: int(1e999)
            _log_ignored_score(coach, score.get("categoryId"))
            continue
        candidates.append((category_id, value))

    # 2. PAD-366 (D120, D121; evaluations.legacy-client-contract rule 10): every category is
    # 1-5 after PAD-403, and every score is checked before ANY is written, so a refused body
    # writes nothing (this is what made the non-atomic save, PAD-368, unreachable). A body
    # holding any value above 5 comes from a form still on the old 1-10 scale (a 1-5 form
    # clamps at 5): an App Store 1.0/1.1.0 dialog opened before the migration, which re-fills
    # stale scores on every reopen. That body is converted as a whole, value by value, with
    # the migration's own rule; retired with R-047 point 8.
    numbers = []
    for _category_id, value in candidates:
        if isinstance(value, bool):  # True/False would read as 1/0
            return {"error": "score_invalid"}, 400
        try:
            number = float(value)
        except (TypeError, ValueError, OverflowError):  # "abc" was an unhandled error (B-126)
            return {"error": "score_invalid"}, 400
        if math.isnan(number) or math.isinf(number):
            return {"error": "score_invalid"}, 400
        numbers.append(number)
    if any(n > LEGACY_BODY_ABOVE for n in numbers):
        if not all(0 <= n <= 10 for n in numbers):
            return {"error": "score_out_of_range"}, 400
        numbers = [float(legacy_value_to_stars(n)) for n in numbers]
    elif not all(NEW_SCALE[0] <= n <= NEW_SCALE[1] for n in numbers):
        return {"error": "score_out_of_range"}, 400

    # 3. Write what changed.
    for (category_id, _value), number in zip(candidates, numbers):
        try:
            unchanged = float(latest[category_id]) == number
        except (KeyError, TypeError, ValueError):
            unchanged = False  # a category with no score yet
        if unchanged:
            continue
        ev_payload = {
            "coach_player": coach_player.id,
            "category": category_id,
            "score": number,
        }
        # The form layer stays in front (its coercions are pinned by PAD-362); the row is
        # then written by the one writer, into the day's class-less record (evaluations.records).
        entry = EvaluationEntry()
        _apply_form(entry.get_create_form(), ev_payload, entry)
        append_entry(entry)

    existing_strengths = {n.text for n in coach_player.strengths}
    for item in strengths:
        text = item.get("text") if isinstance(item, dict) else item
        if text in existing_strengths:
            continue
        note = CoachPlayerNote()
        _apply_form(note.get_create_form(), {
            "coach_player": coach_player.id,
            "type": "strength",
            "text": text,
        }, note)
        note.create()

    existing_weaknesses = {n.text for n in coach_player.weaknesses}
    for item in weaknesses:
        text = item.get("text") if isinstance(item, dict) else item
        if text in existing_weaknesses:
            continue
        note = CoachPlayerNote()
        _apply_form(note.get_create_form(), {
            "coach_player": coach_player.id,
            "type": "weakness",
            "text": text,
        }, note)
        note.create()

    return {"status": "ok", "playerId": player_id}, 200


def get_coach_levels(coach_id: int) -> list:
    """Fetch the coach's existing levels, ordered strongest → weakest.

    Each ``CoachLevel`` carries:
        - code (str): unique level identifier, e.g. "COMP", "ADV", "INT"
        - label (str): display name, e.g. "Competicao", "Avancado", "Intermedio"
        - display_order (int): ladder position — **lower = stronger**
          (.specflow/specs/levels/coach-levels.spec.md rule 3), so ``display_order`` 1 is the coach's
          top level, not their beginners.

    Example ladder:
        [
            {"code": "COMP", "label": "Competicao", "display_order": 1},
            {"code": "ADV", "label": "Avancado", "display_order": 2},
            {"code": "INT", "label": "Intermedio", "display_order": 3},
            {"code": "INI", "label": "Iniciacao", "display_order": 4},
        ]
    """

    return get_level_ladder(coach_id)

def delete_coach_level_service(coach, level_id):
    """Remove a rung from the coach's ladder (levels.coach-levels rule 11, PAD-255).

    Deleting a level UNASSIGNS it. Every row that pointed at it — roster rows
    (with their notes and evaluations), lessons, instances, open vacancies —
    keeps existing with no level. The database says the same (`ON DELETE SET
    NULL`, migration 0efff0790eb0); the explicit updates below make it true
    for any caller and any backend, including the FK-less SQLite test suite,
    and keep the ORM from cascading through stale relationship state.
    """
    from padel_app.models import (
        Association_CoachPlayer,
        Lesson,
        LessonInstance,
        PlayerLevelHistory,
        Vacancy,
    )

    level = CoachLevel.query.filter_by(id=level_id, coach_id=coach.id).first_or_404()
    for model, column in (
        (Association_CoachPlayer, Association_CoachPlayer.level_id),
        (Lesson, Lesson.default_level_id),
        (LessonInstance, LessonInstance.level_id),
        (Vacancy, Vacancy.level_id),
    ):
        model.query.filter(column == level.id).update({column.key: None}, synchronize_session=False)
    # History rows of the rung go with it (`level_id` is NOT NULL, ON DELETE
    # CASCADE in the database); done here too so the FK-less test schema and
    # a stale ORM identity map agree with Postgres.
    PlayerLevelHistory.query.filter_by(level_id=level.id).delete(synchronize_session=False)
    db.session.delete(level)
    db.session.commit()
    normalize_display_orders(coach.id)
    db.session.commit()
    return level


def evaluation_category_impact(category):
    """evaluations.categories rule 7 (PAD-274): what deleting a category removes —
    every score recorded in it, and how many of the coach's players have one."""
    from padel_app.models import EvaluationEntry

    scores = EvaluationEntry.query.filter_by(category_id=category.id)
    return {
        "name": category.name,
        "scores": scores.count(),
        "players": scores.with_entities(EvaluationEntry.coach_player_id).distinct().count(),
    }


def delete_evaluation_category_service(category, actor_user_id=None):
    """Delete a category and its scores, recording what went in ``deletion_audit``
    in the same transaction (evaluations.categories rule 7, PAD-274)."""
    from padel_app.services.deletion_audit_service import record_deletion

    from padel_app.models import EvaluationEntry as _Entry
    from padel_app.services.evaluation_record_service import prune_empty_records

    impact = evaluation_category_impact(category)
    # PAD-363: the scores go with the category; a record they leave empty goes too.
    touched = [
        row[0] for row in
        _Entry.query.with_entities(_Entry.coach_player_id).filter_by(category_id=category.id).distinct()
    ]
    record_deletion(
        actor_user_id=actor_user_id, entity="evaluation_category", entity_id=category.id,
        action="deleted", label=category.name,
        details={"coach_id": category.coach_id, "scores": impact["scores"], "players": impact["players"]},
    )
    category.delete()
    prune_empty_records(touched)
    return impact
