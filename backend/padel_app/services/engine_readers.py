"""What the app's screens read for a new-engine session (swap plan §3.2; PAD-918's second PR).

Each reader here answers in the shape its old-engine twin answers, from the new engine's rows
(``models/engine_store.py``), for a session ``engine_switch.engine_for`` puts on the new engine.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


def invitee_outcome(row, presence, started: bool, now: datetime) -> str:
    """calendar.event-detail ND1: the first match of the table, from the invitation and the student's
    presence on the session."""
    placed = presence is not None and presence.placed_how == "invitation"
    if row.answer == "yes" and placed and presence.status == "absent":
        return "cancelled"
    if row.answer == "yes" and placed:
        return "accepted"
    if row.answer == "no":
        return "declined"
    if row.closed_reason == "withdrawn":
        return "withdrawn"
    if row.closed_reason == "same_hour" or (row.closed_at is not None and row.closed_reason is None):
        return "closed_same_hour"
    if row.sorry_at is not None and row.reopened_at is None:
        return "sorry"
    if started:
        return "expired"
    if row.counts_until is not None and row.counts_until > now:
        return "pending"
    return "not_counting"


def _tier_labels(session: str):
    """``tier index -> (tierSource, groupNumber)`` from the coach's settings now (ND1: the group number is
    1-based in the coach's group order; only a pool tier has one)."""
    from padel_app.services.engine_store import settings_for

    try:
        tiers = settings_for(session).tiers
    except Exception:  # noqa: BLE001 — a coach whose settings no longer map still shows the list
        return {}
    labels, group = {}, 0
    for i, tier in enumerate(tiers):
        if tier.source == "pool":
            group += 1
        labels[i] = (tier.source, group if tier.source == "pool" else None)
    return labels


def engine_invitees(instance, now: datetime | None = None) -> list[dict]:
    """The class detail's ``invitations`` for a new-engine session (calendar.event-detail ND1–ND3): one
    row per student invited, in the order invited, with today's keys plus ``tierSource``,
    ``groupNumber`` and ``reopenedAt``. Students placed by automatic entry or direct join hold no
    invitation, so they are participants only."""
    from padel_app.models import EngineInvitation
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence

    now = now or utcnow_naive()
    started = instance.start_datetime is not None and utc_to_wall_naive(now) >= instance.start_datetime
    presences = {p.player_id: p for p in Presence.query.filter_by(lesson_instance_id=instance.id).all()}
    labels = _tier_labels(str(instance.id))
    out = []
    for row in (EngineInvitation.query.filter_by(lesson_instance_id=instance.id)
                .order_by(EngineInvitation.sent_at, EngineInvitation.id).all()):
        player = db.session.get(Player, row.player_id)
        source, group = labels.get(row.tier, (None, None)) if row.tier is not None else (None, None)
        outcome = invitee_outcome(row, presences.get(row.player_id), started, now)
        out.append({
            "id": row.id,
            "playerId": str(row.player_id),
            "playerName": player.user.name if player is not None and player.user is not None else "Unknown",
            "status": "open" if outcome in ("pending", "not_counting") else outcome,
            "outcome": outcome,
            "answer": row.answer,
            "answeredBy": None,
            "movedAt": None,
            "reopenedAt": row.reopened_at.isoformat() if row.reopened_at else None,
            "tierSource": source,
            "groupNumber": group,
        })
    return out


def open_invitations_query(player_id: int):
    """A student's open new-engine invitations: not answered, not closed, and not a sorry (unless the
    waiting list's turn reopened it). The new engine's twin of a live, unanswered NotificationEvent."""
    from padel_app.models import EngineInvitation

    return EngineInvitation.query.filter(
        EngineInvitation.player_id == player_id,
        EngineInvitation.answer.is_(None),
        EngineInvitation.closed_at.is_(None),
        (EngineInvitation.sorry_at.is_(None)) | (EngineInvitation.reopened_at.isnot(None)),
    )


_ANY_SESSION_KEY = "engine_readers.any_new_engine_session"
_NEW_IDS_KEY = "engine_readers.new_engine_ids"


def prime_engine_ids(instance_ids) -> None:
    """Read the engines of a batch of occurrences in one query (CONFIG-82, ``engine_switch.new_engine_ids``)
    and keep the answers on the database session, so ``class_engine_fields`` asks nothing more for them."""
    from padel_app.services.engine_switch import new_engine_ids

    known = db.session.info.setdefault(_NEW_IDS_KEY, {})
    missing = {int(i) for i in instance_ids if i is not None and int(i) not in known}
    if not missing:
        return
    new = new_engine_ids(missing)
    known.update({i: i in new for i in missing})


def _any_new_engine_session() -> bool:
    """Whether any session is on the new engine (an ``engine_sessions`` row), read once per database
    session: a calendar or a class detail keeps its fixed statement count (PAD-583, PAD-591) and reads
    no ``notification_configs`` row for it. The memo lives on the session (it ends with the request or
    the job, R-007) and is dropped when this session writes an ``engine_sessions`` row, commits or rolls
    back."""
    from padel_app.models import EngineSession

    info = db.session.info
    if _ANY_SESSION_KEY not in info:
        info[_ANY_SESSION_KEY] = db.session.query(EngineSession.lesson_instance_id).first() is not None
    return info[_ANY_SESSION_KEY]


def _forget_on_new_session(session, flush_context, instances) -> None:
    from padel_app.models import EngineSession

    if any(isinstance(obj, EngineSession) for obj in session.new):
        session.info.pop(_ANY_SESSION_KEY, None)
        session.info.pop(_NEW_IDS_KEY, None)


from sqlalchemy import event as _sa_event  # noqa: E402
from sqlalchemy.orm import Session as _Session  # noqa: E402

def _forget(session, *args) -> None:
    session.info.pop(_ANY_SESSION_KEY, None)
    session.info.pop(_NEW_IDS_KEY, None)


_sa_event.listen(_Session, "before_flush", _forget_on_new_session)
# A commit or a rollback ends what the memo can speak for (a test, a request's write, a job's unit).
_sa_event.listen(_Session, "after_commit", _forget)
_sa_event.listen(_Session, "after_rollback", _forget)


def class_engine_fields(obj) -> dict:
    """notifications.config rule 20 (CONFIG-74): what a student's class payload says about the engine:
    ``engineVersion`` (an occurrence's own engine, rule 18; a series' or an occurrence not yet
    materialised, its primary coach's switch) and ``waitingListSideChoice`` (the coach's rule-20 flag,
    false on the old engine). Both always present."""
    from padel_app.services.engine_entry import _series_coaches, _series_is_new_engine
    from padel_app.services.engine_switch import engine_for
    from padel_app.services.lesson_service import primary_coach

    if getattr(obj, "model_name", None) not in ("LessonInstance", "Lesson"):
        return {}
    primed = db.session.info.get(_NEW_IDS_KEY, {})
    if getattr(obj, "model_name", None) == "LessonInstance" and obj.id in primed and not primed[obj.id]:
        return {"engineVersion": "old", "waitingListSideChoice": False}        # primed: no lookup at all
    if not (getattr(obj, "model_name", None) == "LessonInstance" and primed.get(obj.id)) and \
            not _any_new_engine_session():
        # The fixed-statement budget of a calendar and a class detail (PAD-583, PAD-591): while no
        # session is on the new engine, every class is on the old one and no per-class lookup runs.
        return {"engineVersion": "old", "waitingListSideChoice": False}
    if getattr(obj, "model_name", None) == "LessonInstance":
        known = db.session.info.get(_NEW_IDS_KEY, {})
        new = known[obj.id] if obj.id in known else engine_for(obj) == "new"
        coach = primary_coach(obj)
        coach_id = coach.id if coach is not None else None
    elif getattr(obj, "model_name", None) == "Lesson":
        new = _series_is_new_engine(obj)
        coaches = _series_coaches(obj)
        coach_id = coaches[0] if coaches else None
    else:
        return {}
    choice = False
    if new and coach_id is not None:
        from padel_app.services.notification_service import notification_config_for

        config = notification_config_for(coach_id)          # the request's one config read (PAD-591)
        choice = bool(config and config.waiting_list_side_choice)
    return {"engineVersion": "new" if new else "old", "waitingListSideChoice": choice}
