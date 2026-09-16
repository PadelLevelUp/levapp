"""
Invite simulation — PAD-196, notifications.invite-simulation.

A read-only dry run of the invitation engine for a HYPOTHETICAL vacancy,
evaluated as if the spot opened right now. It is the data source for the
"Understand invites" tutorial (settings.tutorials).

Two properties are load-bearing and everything here serves them:

* **Agreement.** Who is listed, their order and their round come from
  ``notification_service.ordered_invite_rounds`` — the engine's own
  stage-tagged candidate pipeline, the same function the semi-auto approval
  prompt reads. This module adds explanation (ranking values, send status,
  gates, the "why not" verdict); it never re-decides membership.
* **No writes.** The vacancy is an unsaved in-memory ``Vacancy`` (``id`` is
  None), nothing is ``create()``d, ``save()``d, added to the session or
  committed, and the waiting-list check runs in ``dry_run`` mode so an
  expired standing entry is skipped rather than deactivated.

Public API
----------
- simulate_vacancy(instance, coach_id, departing_player_id, *, now=None) -> dict
- explain_player(instance, coach_id, departing_player_id, player_id, *, now=None) -> dict | None

Every code the payload carries (gate ``code``, ``stage``, ``sendStatus``,
priority ``id``, failure records) is STRUCTURED data — the locale belongs to the
client (eligibility.enforcement rule 7a).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from padel_app.utils.dates import CLUB_TZ, utcnow_naive, wall_to_utc_naive

SEND_FIRST_BATCH = "first_batch"
SEND_QUEUED = "queued"
SEND_DAILY_QUOTA = "daily_quota"

GATE_CODES = (
    "auto_notify_disabled",
    "class_notifications_disabled",
    "class_over",
    "invitation_window",
    "quiet_hours",
    "min_time_before_class",
    "max_total_reached",
)

QUIET_HOURS_START = 22
QUIET_HOURS_END = 7


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

def _config_for(coach_id: int):
    """The coach's NotificationConfig WITHOUT the upsert `get_or_create_config`
    performs — a coach who never opened Settings still gets the defaults, from
    an unsaved instance whose getters fall back exactly as a stored row's do."""
    from padel_app.models.notification_config import NotificationConfig

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=False)
    return config


def _hypothetical_vacancy(instance, coach_id: int, departing_player_id: int):
    """An unsaved Vacancy snapshotted exactly as `_create_vacancy_for_absent_player`
    would snapshot it (notifications.invitations rules 2/2a)."""
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import vacancy_snapshot_for_player

    side, level_id, level_source = vacancy_snapshot_for_player(
        instance, coach_id, departing_player_id
    )
    vacancy = Vacancy(
        lesson_instance_id=instance.id,
        coach_id=coach_id,
        original_player_id=departing_player_id,
        side=side,
        level_id=level_id,
        status="open",
        approval_status="not_required",
        current_round_number=1,
        current_batch_number=0,
    )
    # Relationship attributes the engine reads; set explicitly because the
    # object is never flushed, so SQLAlchemy would not resolve them.
    vacancy.lesson_instance = instance
    vacancy.level = CoachLevel.query.get(level_id) if level_id else None
    return vacancy, level_source


def _to_local(now: datetime) -> datetime:
    return now.replace(tzinfo=timezone.utc).astimezone(CLUB_TZ)


def _to_naive_utc(local: datetime) -> datetime:
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def _quiet_hours_gate(restrictions: dict, now: datetime) -> dict:
    """PAD-136: the window is a CLUB-LOCAL wall clock (notifications.config
    rule 6a), so `now` is converted before the hour is read — the same
    conversion `_check_restrictions` performs."""
    enabled = bool(restrictions.get("quietHours", {}).get("enabled"))
    local = _to_local(now)
    inside = local.hour >= QUIET_HOURS_START or local.hour < QUIET_HOURS_END
    blocked = enabled and inside
    until_local = local.replace(hour=QUIET_HOURS_END, minute=0, second=0, microsecond=0)
    if local.hour >= QUIET_HOURS_START:
        until_local = until_local + timedelta(days=1)
    return {
        "code": "quiet_hours",
        "blocked": blocked,
        "enabled": enabled,
        "until": f"{QUIET_HOURS_END:02d}:00",
        "untilAt": _to_naive_utc(until_local).isoformat() if blocked else None,
    }


def _gates(instance, config, now: datetime) -> list[dict]:
    """The checks the engine runs BEFORE sending, each reported with the data a
    client needs to say when it clears (notifications.invite-simulation rule 6).
    Nothing here is applied — the queue is computed regardless."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.scheduler import _compute_invite_start_dt
    from padel_app.services.notification_service import _instance_is_over

    restrictions = config.get_restrictions()

    opens_at = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
    window_blocked = opens_at is not None and now < opens_at

    min_time = restrictions.get("minTimeBeforeClass", {})
    min_enabled = bool(min_time.get("enabled"))
    minutes_until = None
    if instance.start_datetime is not None:
        # PAD-256: real minutes to the real start (the stored start is wall-clock).
        minutes_until = (wall_to_utc_naive(instance.start_datetime) - now).total_seconds() / 60
    min_blocked = (
        min_enabled and minutes_until is not None and minutes_until < min_time.get("value", 0)
    )

    max_total = restrictions.get("maxTotal", {})
    total_enabled = bool(max_total.get("enabled"))
    sent = NotificationEvent.query.filter_by(
        lesson_instance_id=instance.id,
    ).filter(NotificationEvent.status.in_(["sent", "queued", "confirmed"])).count()
    total_limit = max_total.get("value")
    total_blocked = total_enabled and total_limit is not None and sent >= total_limit

    return [
        {"code": "auto_notify_disabled", "blocked": not bool(config.auto_notify_enabled)},
        {
            "code": "class_notifications_disabled",
            "blocked": not bool(getattr(instance, "notifications_enabled", True)),
        },
        {"code": "class_over", "blocked": bool(_instance_is_over(instance, now))},
        {
            "code": "invitation_window",
            "blocked": window_blocked,
            "opensAt": opens_at.isoformat() if opens_at is not None else None,
        },
        _quiet_hours_gate(restrictions, now),
        {
            "code": "min_time_before_class",
            "blocked": bool(min_blocked),
            "enabled": min_enabled,
            "minutes": min_time.get("value"),
        },
        {
            "code": "max_total_reached",
            "blocked": bool(total_blocked),
            "enabled": total_enabled,
            "sent": sent,
            "limit": total_limit,
        },
    ]


def _waiting_list_placement(vacancy, instance, coach_id: int, config) -> dict | None:
    """Who the engine would place directly from the waiting list before
    inviting anyone (notifications.waiting-list rules 4a–4d), read-only."""
    from padel_app.models import Player
    from padel_app.services.notification_service import _check_waiting_list

    entry = _check_waiting_list(vacancy, instance, coach_id, config, 1, dry_run=True)
    if entry is None:
        return None
    player = Player.query.get(entry.player_id)
    return {
        "playerId": str(entry.player_id),
        "name": player.user.name if player and player.user else None,
        "standing": entry.standing_entry_id is not None,
    }


def _spot(vacancy, level_source: str) -> dict:
    return {
        "side": vacancy.side,
        "levelId": str(vacancy.level_id) if vacancy.level_id else None,
        "levelCode": vacancy.level.code if vacancy.level else None,
        "levelSource": level_source,
    }


def _priority_values(cp, vacancy, config, coach_id: int, ladder: dict) -> list[dict]:
    """One entry per ENABLED priority criterion, in the coach's configured
    order, carrying the value `_build_sort_key` actually sorted on."""
    from padel_app.services.notification_service import (
        _attendance_stats,
        _side_preference_rank,
    )

    att_rate, just_rate = _attendance_stats(cp.player_id)
    values = []
    for criterion in config.get_priority_criteria():
        if not criterion.get("enabled"):
            continue
        cid = criterion["id"]
        if cid == "level":
            student_index = ladder.get(cp.level_id) if cp.level_id else None
            spot_index = ladder.get(vacancy.level_id) if vacancy.level_id else None
            distance = (
                student_index - spot_index
                if student_index is not None and spot_index is not None
                else None
            )
            values.append({"id": "level", "ladderDistance": distance,
                           "levelCode": cp.level.code if cp.level else None})
        elif cid == "justified_misses":
            values.append({"id": "justified_misses", "rate": round(just_rate, 4)})
        elif cid == "attendance":
            values.append({"id": "attendance", "rate": round(att_rate, 4)})
        elif cid == "playing_side":
            rank = _side_preference_rank(cp.side, vacancy.side)
            match = {0: "exact", 1: "both", 2: "other"}.get(rank, "other")
            values.append({"id": "playing_side", "match": match, "side": cp.side})
        elif cid == "subscription_status":
            user = cp.player.user if cp.player else None
            values.append({
                "id": "subscription_status",
                "active": bool(user and user.status == "active"),
            })
    return values


def _batch_size(config, instance, first_round_size: int) -> int:
    """How many of the first non-empty round `_send_invitation_batch` would
    contact right now: maxSimultaneous, capped by the remaining maxTotal budget."""
    from padel_app.models.notification_event import NotificationEvent

    restrictions = config.get_restrictions()
    max_sim = restrictions.get("maxSimultaneous", {})
    size = max_sim["value"] if max_sim.get("enabled") else first_round_size
    max_total = restrictions.get("maxTotal", {})
    if max_total.get("enabled"):
        already_sent = NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == instance.id,
            NotificationEvent.status.in_(["sent", "queued", "confirmed"]),
        ).count()
        size = min(size, max(0, max_total["value"] - already_sent))
    return max(0, int(size))


def _serialize_rounds(rounds, vacancy, instance, coach_id: int, config, now: datetime) -> list[dict]:
    from padel_app.services.level_ladder import ladder_index_map
    from padel_app.services.notification_service import _check_per_student_daily_limit

    ladder = ladder_index_map(coach_id)
    restrictions = config.get_restrictions()
    first_non_empty = next((number for number, _k, _r, cps in rounds if cps), None)
    batch = 0
    if first_non_empty is not None:
        first_size = next(len(cps) for number, _k, _r, cps in rounds if number == first_non_empty)
        batch = _batch_size(config, instance, first_size)

    payload = []
    for number, kind, rules, cps in rounds:
        candidates = []
        for rank, cp in enumerate(cps, start=1):
            over_quota = not _check_per_student_daily_limit(
                cp.player_id, coach_id, restrictions, now=now
            )
            if over_quota:
                send_status = SEND_DAILY_QUOTA
            elif number == first_non_empty and rank <= batch:
                send_status = SEND_FIRST_BATCH
            else:
                send_status = SEND_QUEUED
            user = cp.player.user if cp.player else None
            candidates.append({
                "playerId": str(cp.player_id),
                "name": user.name if user else None,
                "levelCode": cp.level.code if cp.level else None,
                "levelId": str(cp.level_id) if cp.level_id else None,
                "side": cp.side,
                "rank": rank,
                "priority": _priority_values(cp, vacancy, config, coach_id, ladder),
                "sendStatus": send_status,
            })
        payload.append({
            "number": number,
            "kind": kind,
            "label": str(number),
            "rules": [
                {
                    "attribute": r.get("attribute"),
                    "operation": r.get("operation"),
                    "value": r.get("value"),
                }
                for r in rules
            ],
            "candidates": candidates,
        })
    return payload


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def simulate_vacancy(instance, coach_id: int, departing_player_id: int, *, now: datetime | None = None) -> dict:
    """What the engine would do right now if ``departing_player_id`` dropped
    out of ``instance``. Read-only."""
    from padel_app.services.notification_service import _is_semi_auto, ordered_invite_rounds

    _now = now or utcnow_naive()
    config = _config_for(coach_id)
    vacancy, level_source = _hypothetical_vacancy(instance, coach_id, departing_player_id)

    rounds = ordered_invite_rounds(vacancy, instance, coach_id, config)
    placement = _waiting_list_placement(vacancy, instance, coach_id, config)
    if placement is not None:
        # The placed student is placed, not invited: they never appear in a
        # round (rule 8 / AC "A waiting-list member who passes the bar is
        # placed, not invited"). The rest of the queue is still shown — it is
        # what happens if the placement does not go through.
        placed_id = int(placement["playerId"])
        rounds = [
            (number, kind, rules, [cp for cp in cps if cp.player_id != placed_id])
            for number, kind, rules, cps in rounds
        ]

    return {
        "evaluatedAt": _now.isoformat(),
        "approvalRequired": bool(_is_semi_auto(config)),
        "gates": _gates(instance, config, _now),
        "waitingListPlacement": placement,
        "spot": _spot(vacancy, level_source),
        "rounds": _serialize_rounds(rounds, vacancy, instance, coach_id, config, _now),
    }


def explain_player(
    instance,
    coach_id: int,
    departing_player_id: int,
    player_id: int,
    *,
    now: datetime | None = None,
) -> dict | None:
    """The single reason ``player_id`` is, or is not, invited — the first
    stage that dropped them, with that stage's structured details
    (notifications.invite-simulation rules 2, 12, 13). ``None`` when the
    player is not on this coach's roster."""
    from padel_app.models import Player
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.services.notification_service import (
        evaluate_candidates,
        invitation_waves,
    )

    cp = Association_CoachPlayer.query.filter_by(
        coach_id=coach_id, player_id=player_id
    ).first()
    if cp is None:
        return None
    player = Player.query.get(player_id)
    name = player.user.name if player and player.user else None

    simulation = simulate_vacancy(instance, coach_id, departing_player_id, now=now)
    for rnd in simulation["rounds"]:
        for candidate in rnd["candidates"]:
            if candidate["playerId"] == str(player_id):
                return {
                    "playerId": str(player_id),
                    "name": name,
                    "stage": "invited",
                    "details": {
                        "roundNumber": rnd["number"],
                        "rank": candidate["rank"],
                        "sendStatus": candidate["sendStatus"],
                    },
                }

    config = _config_for(coach_id)
    vacancy, _ = _hypothetical_vacancy(instance, coach_id, departing_player_id)
    round_failures = []
    for number, kind, _rules in invitation_waves(config):
        wave = ("group", number)
        verdicts = evaluate_candidates(
            vacancy, instance, coach_id, config,
            wave=wave, explain=True, only_player_ids=[player_id],
        )
        if not verdicts:
            return None
        verdict = verdicts[0]
        if verdict.stage == "no_round_matched":
            round_failures.append({
                "number": number,
                "failures": verdict.details.get("failures", []),
            })
            continue
        details = {}
        if verdict.stage == "eligibility":
            details = {"failures": verdict.details.get("failures", [])}
        return {
            "playerId": str(player_id),
            "name": name,
            "stage": verdict.stage,
            "details": details,
        }

    return {
        "playerId": str(player_id),
        "name": name,
        "stage": "no_round_matched",
        "details": {"rounds": round_failures},
    }
