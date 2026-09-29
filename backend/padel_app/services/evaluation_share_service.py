"""PAD-402 (evaluations.sharing, evaluations.student-view): a coach chooses what
a player may see of one evaluation record and shares it.

Decision 1 (the plan): `build_card` is the ONE card builder both the coach's
preview and the stored share use — `share_preview` returns it fresh,
`share` freezes it into `EvaluationShare.card`. `my_evaluations` (the student
read) then serves that frozen `card` untouched — never recomputed.

Like `evaluation_api_service`, JSON is parsed and validated here by hand
(never through `tools/input_tools`, B-136) and `shared_at` is set from
`padel_app.utils.dates.utcnow_naive()`, referenced at call time — the same
name-rebinding `pin_clock` patches (see `evaluation_api_service.today()`).
"""
from decimal import Decimal

from padel_app.sql_db import db
from padel_app.models import Association_CoachPlayer, EvaluationEntry, EvaluationRecord, EvaluationShare
from padel_app.services.evaluation_api_service import (
    ApiError,
    MISSING,
    _entry_order,
    _months_back,
    _number,
    _one_decimal,
    _own_scale,
    _scale,
    on_scale,
    monthly_means,
)
from padel_app.utils.dates import utcnow_naive

EVOLUTION_CHOICES = ("last", "6m", "1y", "none")


# ── lookups (mirrors evaluation_api_service.delete_record's ownership check) ─


def _own_record(coach, record_id) -> EvaluationRecord:
    record = db.session.get(EvaluationRecord, record_id)
    if record is None:
        raise ApiError(404, "record_not_found")
    if record.coach_player.coach_id != coach.id:
        raise ApiError(403, "not_your_record")
    return record


# ── body validation (decision 2) ─────────────────────────────────────────────


def _validated_body(record, body):
    if not isinstance(body, dict):
        raise ApiError(400, "body_invalid")

    rated_ids = {e.category_id for e in record.entries}
    category_ids = body.get("categoryIds")
    if (
        not isinstance(category_ids, list)
        or not category_ids
        or any(isinstance(c, bool) or not isinstance(c, int) for c in category_ids)
        or not set(category_ids) <= rated_ids
    ):
        raise ApiError(400, "category_ids_invalid")

    evolution_type = body.get("evolution", MISSING)
    if evolution_type is MISSING or evolution_type not in EVOLUTION_CHOICES:
        raise ApiError(400, "evolution_invalid")

    include_note = body.get("includeNote", MISSING)
    if include_note is MISSING or not isinstance(include_note, bool):
        raise ApiError(400, "include_note_required")

    return category_ids, evolution_type, include_note


# ── the card (decision 1, sharing.spec.md rule 3) ────────────────────────────


def _delta(a, b) -> float:
    """One decimal, half always up, via `Decimal` — mirrors `evolution()`'s own
    delta arithmetic (evaluation_api_service.py) so the two cannot disagree."""
    return _one_decimal(Decimal(str(_one_decimal(a))) - Decimal(str(_one_decimal(b))))


def _previous_score(record, category_id):
    """The score of `category_id` in the latest EARLIER record of this
    coach-player (`evaluated_on < record.evaluated_on`, then id) — record-held
    ratings only (Q29, the join requires `record_id`), placed on the competency's
    current scale (evaluations.scale rule 5). `None` when there is none."""
    row = (
        EvaluationEntry.query.join(EvaluationRecord, EvaluationEntry.record_id == EvaluationRecord.id)
        .filter(
            EvaluationRecord.coach_player_id == record.coach_player_id,
            EvaluationEntry.category_id == category_id,
            EvaluationRecord.evaluated_on < record.evaluated_on,
        )
        .order_by(EvaluationRecord.evaluated_on.desc(), EvaluationRecord.id.desc())
        .first()
    )
    return None if row is None else on_scale(row.score, _own_scale(row), _scale(row.category))


def _evolution_delta(record, entry, evolution_type):
    """sharing.spec.md rule 5: `last` compares to the previous record's rating of
    the same competency; `6m`/`1y` compare the window's last monthly mean to its
    first (`monthly_means`, evaluation_api_service.py); `none` has no lines. A
    line is left out when there is nothing to compare, or the window holds fewer
    than two months."""
    if evolution_type == "last":
        previous = _previous_score(record, entry.category_id)
        return None if previous is None else _delta(on_scale(entry.score, _own_scale(entry), _scale(entry.category)), previous)
    if evolution_type in ("6m", "1y"):
        months_back = 6 if evolution_type == "6m" else 12
        since = _months_back(record.evaluated_on, months_back)
        means = monthly_means(record.coach_player_id, entry.category_id, since=since, until=record.evaluated_on)
        window_months = sorted(means)
        if len(window_months) < 2:
            return None
        return _delta(means[window_months[-1]], means[window_months[0]])
    return None  # "none"


def build_card(record, category_ids, evolution_type, include_note, *, on=None) -> dict:
    """The one `Card` both the preview and the stored share use (decision 1).
    `on` is the instant to stamp as `sharedAt` — `None` for a preview (never
    shared), the share's own instant when this is being stored/re-stored.

    Names and numbers only (sharing.spec.md rule 3): a player is never sent a
    competency id. Ratings and evolution lines are in the coach's competency
    order (`_entry_order`, rule 4), never the order `categoryIds` arrived in."""
    entries_by_category = {e.category_id: e for e in record.entries}
    chosen = sorted(
        (entries_by_category[cid] for cid in category_ids if cid in entries_by_category),
        key=_entry_order,
    )

    ratings = []
    evolution_lines = []
    for entry in chosen:
        category = entry.category
        low, high = _own_scale(entry)  # evaluations.scale rule 6: the score on its own scale
        ratings.append({
            "name": category.name, "key": category.catalogue_key,
            "score": _number(entry.score), "scaleMin": low, "scaleMax": high,
        })
        delta = _evolution_delta(record, entry, evolution_type)
        if delta is not None:
            evolution_lines.append({"name": category.name, "key": category.catalogue_key, "delta": delta})

    coach_player = record.coach_player
    coach_user = coach_player.coach.user if coach_player.coach is not None else None
    instance = record.lesson_instance

    return {
        "recordId": record.id,
        "coachName": coach_user.name if coach_user is not None else None,
        "evaluatedOn": record.evaluated_on.isoformat(),
        "className": instance.title if instance is not None else None,
        "sharedAt": on.isoformat() if on is not None else None,
        "ratings": ratings,
        "evolution": evolution_lines,
        "evolutionPeriod": evolution_type,
        "note": record.note if include_note else None,
    }


# ── the four endpoints' service functions ────────────────────────────────────


def preview(coach, record_id, body) -> dict:
    """`POST .../share_preview` (sharing.spec.md rule 3): writes nothing."""
    record = _own_record(coach, record_id)
    category_ids, evolution_type, include_note = _validated_body(record, body)
    return build_card(record, category_ids, evolution_type, include_note, on=None)


def _locale_is_pt(user) -> bool:
    """The same rule `class_request_service._locale_of` uses: no language on
    file, or a language starting with "pt", is Portuguese."""
    lang = getattr(user, "language", None)
    return not lang or str(lang).startswith("pt")


def _send_share_message(record) -> None:
    """sharing.spec.md rule 8: one system message, no push — the one exception
    to `messaging.messages` rule 7. Sent only for the FIRST share of a record."""
    from padel_app.services.notification_service import _send_system_message

    coach_player = record.coach_player
    coach_user = coach_player.coach.user if coach_player.coach is not None else None
    player_user = coach_player.player.user if coach_player.player is not None else None
    if coach_user is None or player_user is None:
        return

    coach_name = coach_user.name or ""
    text = (
        f"{coach_name} partilhou uma avaliação contigo" if _locale_is_pt(player_user)
        else f"{coach_name} shared an evaluation with you"
    )
    _send_system_message(
        coach_user.id, player_user.id, text,
        message_type="system",
        msg_metadata={"kind": "evaluation_share", "recordId": record.id},
        push=False,
    )


def share(coach, record_id, body) -> EvaluationRecord:
    """`POST .../share` (sharing.spec.md rule 7): create-or-update. Only the
    FIRST share of a record sends the message (rule 8); re-sharing moves
    `sharedAt`, replaces the frozen `card` and sends nothing."""
    record = _own_record(coach, record_id)
    category_ids, evolution_type, include_note = _validated_body(record, body)
    now = utcnow_naive()
    card = build_card(record, category_ids, evolution_type, include_note, on=now)

    is_first = record.share is None
    if is_first:
        record.share = EvaluationShare(
            shared_at=now, category_ids=list(category_ids), evolution=evolution_type,
            include_note=include_note, card=card,
        )
    else:
        record.share.shared_at = now
        record.share.category_ids = list(category_ids)
        record.share.evolution = evolution_type
        record.share.include_note = include_note
        record.share.card = card
    db.session.commit()

    if is_first:
        _send_share_message(record)

    return record


def unshare(coach, record_id) -> None:
    """`DELETE .../share` (sharing.spec.md rule 9): silent — no message, no push."""
    record = _own_record(coach, record_id)
    if record.share is not None:
        db.session.delete(record.share)
        db.session.commit()


def my_evaluations(player) -> dict:
    """`GET /my_evaluations` (student-view.spec.md rule 2): every share across
    every coach of this player, newest `sharedAt` first, served from the row —
    never recomputed (rule 1)."""
    rows = (
        EvaluationShare.query
        .join(EvaluationRecord, EvaluationShare.record_id == EvaluationRecord.id)
        .join(Association_CoachPlayer, EvaluationRecord.coach_player_id == Association_CoachPlayer.id)
        .filter(Association_CoachPlayer.player_id == player.id)
        .order_by(EvaluationShare.shared_at.desc())
        .all()
    )
    return {"cards": [row.card for row in rows]}
