"""
Notification engine service.

Handles reminders, vacancy-based invitations, waiting list, and manual notifications:

  Config helpers
  - get_or_create_config / get_config_dict / update_config

  Reminder flow
  - send_class_reminders(instance_id)           called by APScheduler at reminder time
  - respond_to_reminder(...)                     player presses Yes/No on reminder

  Invitation flow
  - trigger_invitations(instance, coach_id)      main trigger (called by scheduler or manually)
  - process_invitation_batches()                 recurring APScheduler job (every 2 min)
  - respond_to_notification(...)                 player presses Yes/No on invite
  - coach_respond_to_notification(...)           coach manually records a response
  - expire_stale_invitations()                   retire pending invites for classes that are over

  Manual notifications
  - send_manual_notifications(...)               coach hand-picks players

  Waiting list
  - respond_to_waiting_list(...)                 player responds to waiting list offer
  - get_waiting_list(instance_id, coach_id)      list active waiting list entries

  Notification groups (manual modal)
  - get_notification_groups(...)

  Activity feed
  - get_notification_activity(coach_id)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone

from padel_app.sql_db import db
from padel_app.services.presence_response import record_response, presence_late_cancellation  # noqa: F401  (PAD-271 M5)
from padel_app.utils.dates import CLUB_TZ, club_day_start_utc, to_utc_iso, utc_to_wall_naive, utcnow_naive, wall_to_utc_naive
from padel_app.models import (
    Association_CoachLessonInstance,
    Association_CoachPlayer,
    LessonInstance,
    NotificationConfig,
    NotificationEvent,
    Presence,
    Vacancy,
    WaitingListEntry,
)
from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
from padel_app.models.notification_config import (
    DEFAULT_NOTIFICATION_GROUPS,
    DEFAULT_PRIORITY_CRITERIA,
    DEFAULT_RESTRICTIONS,
    default_templates_for_locale,
    resolve_message_template,
)
from padel_app.realtime import publish
from padel_app.services.conversation_access import message_recipient_ids
from padel_app.services.level_ladder import (
    get_level_ladder,
    ladder_index,
    ladder_index_map,
)
from padel_app.utils.push_notifications import send_push_notification


# PAD-107 + PAD-112: message types that ASK a student to play in a specific
# class slot. These are the only sends a suppression rule may drop — both an
# availability blocker (PAD-107) and a student's own block preference (PAD-112)
# are enforced against exactly this vocabulary, via two additive guards in
# ``_send_system_message``. Both tickets introduced this constant independently,
# with the same name and the same three values; the batch merge kept one
# definition and both guards.
#
# Plain chat, class-cancellation notices and "you got the spot" confirmations
# are deliberately NOT in here: silencing invitations must never cut a student
# off from their coach.
_BLOCKABLE_MESSAGE_TYPES = frozenset({
    "notification_invite",
    "notification_reminder",
    "waiting_list_offer",
})


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def get_or_create_config(coach_id: int) -> NotificationConfig:
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        config = NotificationConfig(
            coach_id=coach_id,
            auto_notify_enabled=False,
        )
        config.create()
    return config


def get_config_dict(coach_id: int) -> dict:
    from padel_app.models import Coach

    config = get_or_create_config(coach_id)
    locale = _resolve_locale(Coach.query.get(coach_id))
    return {
        "autoNotifyEnabled": config.auto_notify_enabled,
        "invitationMode": config.get_invitation_mode(),
        "priorityCriteria": config.get_priority_criteria(),
        "restrictions": config.get_restrictions(),
        "notificationGroups": config.get_notification_groups(),
        "messageTemplates": config.get_message_templates(locale),
        "reminderTiming": config.reminder_timing,
        "invitationGroups": config.get_invitation_groups(),
        "tiebreakers": config.get_tiebreakers(),
        # PAD-128 — null when unset, and deliberately NOT defaulted to a rule
        # set. The client must be able to tell "no bar" from "a bar that
        # happens to be empty"; see NotificationConfig.eligibility_rules.
        "eligibilityRules": config.get_eligibility_rules(),
        # PAD-130: the coach standard of the open-spot toggle (rule 3).
        "openSpotsVisible": bool(config.open_spots_visible),
    }


def update_config(coach_id: int, data: dict) -> NotificationConfig:
    config = get_or_create_config(coach_id)

    timing_changed = False

    if "autoNotifyEnabled" in data:
        config.auto_notify_enabled = bool(data["autoNotifyEnabled"])
    if "invitationMode" in data:
        mode = data["invitationMode"]
        if mode not in ("automatic", "semi_automatic"):
            from flask import abort
            abort(400, "invitationMode must be 'automatic' or 'semi_automatic'")
        config.invitation_mode = mode
    if "priorityCriteria" in data:
        config.priority_criteria = data["priorityCriteria"]
    if "restrictions" in data:
        config.restrictions = data["restrictions"]
    if "notificationGroups" in data:
        config.notification_groups = data["notificationGroups"]
    if "messageTemplates" in data:
        config.message_templates = data["messageTemplates"]
    if "reminderTiming" in data:
        config.reminder_timing = data["reminderTiming"]
        timing_changed = True
    if "invitationStartTiming" in data:
        config.invitation_start_timing = data["invitationStartTiming"]
        timing_changed = True
    if "invitationGroups" in data:
        config.invitation_groups = data["invitationGroups"]
    if "tiebreakers" in data:
        config.tiebreakers = data["tiebreakers"]
    if "eligibilityRules" in data:
        # PAD-128: `null` clears the bar back to unset, a list sets it. Both
        # must round-trip — see NotificationConfig.eligibility_rules for why
        # this column must never acquire a non-empty default.
        rules = data["eligibilityRules"]
        if rules is not None and not isinstance(rules, list):
            from flask import abort
            abort(400, "eligibilityRules must be a list or null")
        config.eligibility_rules = rules
    if "openSpotsVisible" in data:
        config.open_spots_visible = bool(data["openSpotsVisible"])

    config.save()

    if timing_changed:
        try:
            from padel_app.scheduler import reschedule_all_future_jobs
            reschedule_all_future_jobs(coach_id)
        except Exception:
            pass  # scheduler may not be running (tests, etc.)

    return config


def _is_semi_auto(config: NotificationConfig) -> bool:
    """True when the coach requires approval before invitations are sent."""
    return bool(config.auto_notify_enabled) and config.get_invitation_mode() == "semi_automatic"


# ---------------------------------------------------------------------------
# Level resolution (PAD-86)
# ---------------------------------------------------------------------------

# PAD-270: moved to level_service, the one home of level resolution; re-exported
# here because the engine and its tests import it from this module.
from padel_app.services.level_service import effective_level_id  # noqa: E402,F401


def effective_level(obj):
    """The ``CoachLevel`` behind :func:`effective_level_id`, or ``None``."""
    level_id = effective_level_id(obj)
    if level_id is None:
        return None
    direct = getattr(obj, "level", None)
    if direct is not None and getattr(direct, "id", None) == level_id:
        return direct
    from padel_app.models.coach_levels import CoachLevel
    return CoachLevel.query.get(level_id)


def _vacancy_level(vacancy, instance=None):
    """The ``(level_id, level)`` a vacancy is matched on — PAD-86.

    Prefers the vacancy's own snapshot and falls back to the class's effective
    level. The fallback matters for vacancy rows created BEFORE this fix (their
    ``level_id`` is NULL even though the class has a level): without it they
    would now fail closed and invite nobody.
    """
    level_id = getattr(vacancy, "level_id", None)
    if level_id:
        level = getattr(vacancy, "level", None)
        if level is None:
            from padel_app.models.coach_levels import CoachLevel
            level = CoachLevel.query.get(level_id)
        return level_id, level
    return effective_level_id(instance), effective_level(instance)


def effective_eligibility(class_obj, coach_id: int, config: NotificationConfig | None = None):
    """The eligibility bar in force for ``class_obj`` — PAD-128.

    THE single resolver every consumer calls (eligibility.cascade rule 3),
    deliberately shaped like :func:`effective_level_id`. Re-implementing the
    fallback at a call site is how PAD-86 happened, so invitations, the waiting
    list, manual add and (later) the student calendar all come through here.

    Phase 1 reads only the coach tier. Phase 2 (PAD-129) adds the instance and
    lesson tiers *inside this function*, so no caller has to change.

    Returns ``None`` when no bar is defined, and a (possibly empty) list of rule
    dicts otherwise. ``None`` and ``[]`` both mean "everyone is eligible" — see
    :meth:`NotificationConfig.get_eligibility_rules`. Callers must not read a
    missing bar as "exclude everybody"; that state is reserved for a bar that is
    *defined* but unsatisfiable (eligibility.rules rule 2).
    """
    return effective_eligibility_with_source(class_obj, coach_id, config)[0]


def _tier_rules(obj):
    """A tier's stored bar: ``None`` for no override, else the list (``[]`` included)."""
    rules = getattr(obj, "eligibility_rules", None)
    return rules if isinstance(rules, list) else None


def effective_eligibility_with_source(class_obj, coach_id: int, config: NotificationConfig | None = None):
    """``(rules, source)`` — PAD-129, eligibility.cascade rules 1–4.

    Most specific first, and the first tier whose bar is not ``NULL`` wins
    outright (tiers never merge): ``instance`` (a LessonInstance's own
    ``eligibility_rules``) → ``lesson`` (its parent's, or the lesson itself for
    a projected occurrence) → ``coach`` (the standard bar). ``[]`` at a tier is
    the deliberate "everyone" override and beats the tier below, which is why
    ``None`` and ``[]`` are kept distinct here.

    A ``Lesson`` passed directly is a non-materialised occurrence (rule 4): it
    resolves at the lesson tier and creates nothing.
    """
    model_name = getattr(class_obj, "model_name", None)
    if model_name == "LessonInstance" or hasattr(class_obj, "lesson_id"):
        own = _tier_rules(class_obj)
        if own is not None:
            return own, "instance"
        lesson = getattr(class_obj, "lesson", None)
    else:
        lesson = class_obj
    if lesson is not None:
        series = _tier_rules(lesson)
        if series is not None:
            return series, "lesson"
    if config is None:
        config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        return None, "coach"
    return config.get_eligibility_rules(), "coach"


def _tier_flag(obj):
    """A tier's stored visibility: ``None`` = inherit, else the boolean."""
    value = getattr(obj, "open_spots_visible", None)
    return value if isinstance(value, bool) else None


def effective_open_spots_visible_with_source(class_obj, coach_id: int, config: NotificationConfig | None = None):
    """``(visible, source)`` — PAD-130, eligibility.open-spot-visibility rules 3, 10.

    The same instance → lesson → coach walk as :func:`effective_eligibility_with_source`;
    the first tier that is not ``NULL`` wins, and the coach tier defaults to off.
    """
    model_name = getattr(class_obj, "model_name", None)
    if model_name == "LessonInstance" or hasattr(class_obj, "lesson_id"):
        own = _tier_flag(class_obj)
        if own is not None:
            return own, "instance"
        lesson = getattr(class_obj, "lesson", None)
    else:
        lesson = class_obj
    if lesson is not None:
        series = _tier_flag(lesson)
        if series is not None:
            return series, "lesson"
    if config is None:
        config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if config is None:
        return False, "coach"
    return bool(config.open_spots_visible), "coach"


def effective_open_spots_visible(class_obj, coach_id: int, config: NotificationConfig | None = None) -> bool:
    return effective_open_spots_visible_with_source(class_obj, coach_id, config)[0]


def passes_eligibility(
    cp: Association_CoachPlayer,
    instance,
    coach_id: int,
    rules,
) -> bool:
    """Does ``cp`` clear the eligibility bar for this class? — PAD-128.

    ``rules`` is whatever :func:`effective_eligibility` returned. An unset or
    empty bar admits everyone (eligibility.rules rule 1); a defined bar is
    evaluated by the SAME code path as invitation-group rules
    (eligibility.rules rule 7), with no vacancy, because eligibility must be
    answerable for a class that has no spot open.
    """
    if not rules:
        return True
    return _passes_group_rules(rules, cp, None, coach_id, instance)


def eligibility_failures(
    cp: Association_CoachPlayer,
    instance,
    coach_id: int,
    rules,
) -> list:
    """EVERY eligibility rule ``cp`` fails, structured — PAD-133.

    The sibling of :func:`passes_eligibility`, and the reason-reporting call
    that eligibility.enforcement rule 7 needs: a warning must name what failed
    ("2 levels below this class"), one line per failed rule, so a bare "this
    student is not eligible" is explicitly not sufficient. That means
    evaluating every rule rather than stopping at the first, which is why this
    passes ``short_circuit=False``.

    Both functions run the SAME evaluator, so the answer and the explanation
    cannot disagree: an empty list here always means
    :func:`passes_eligibility` is True.

    Returns ``[]`` for an unset or empty bar, which admits everyone
    (eligibility.rules rule 1). Each record is
    ``{attribute, operation, actual, threshold, ladder_distance, reason}`` —
    structured data, never prose: the client renders it in the coach's locale.
    """
    if not rules:
        return []
    return _group_rule_failures(
        rules, cp, None, coach_id, instance, short_circuit=False
    )


def eligibility_failures_for_players(
    instance,
    coach_id: int,
    player_ids: list,
    config: NotificationConfig | None = None,
) -> list:
    """Which of ``player_ids`` fail the bar for ``instance``, and why — PAD-133.

    Powers the manual-add warning, eligibility.enforcement rules 6 and 7: adding
    an ineligible student by hand WARNS and names each failed rule, then
    proceeds once the coach confirms. Enrolment is the coach's decision (the
    calendar.student-blockers rule 4 precedent), so this only ever reports —
    it never blocks, and callers must not treat a non-empty result as an error.

    Students who clear the bar are omitted entirely, so an empty list means
    "nothing to warn about" and the client can skip the confirmation.

    Resolves the bar through :func:`effective_eligibility`, the single resolver
    (eligibility.cascade rule 3) — so when PAD-129 adds the per-class tiers,
    this surface inherits them without changing.
    """
    rules = effective_eligibility(instance, coach_id, config)
    if not rules:
        return []

    out = []
    for player_id in player_ids or []:
        try:
            pid = int(player_id)
        except (TypeError, ValueError):
            continue
        cp = Association_CoachPlayer.query.filter_by(
            coach_id=coach_id, player_id=pid
        ).first()
        if cp is None:
            # Not on this coach's roster — eligibility has nothing to say, and
            # inventing a failure here would warn about the wrong thing.
            continue
        failures = eligibility_failures(cp, instance, coach_id, rules)
        if failures:
            out.append({
                "playerId": pid,
                "name": (cp.player.user.name if cp.player and cp.player.user else ""),
                "failures": failures,
            })
    return out


def students_failing_eligibility_bar(
    coach_id: int,
    rules,
    *,
    now: datetime | None = None,
) -> list:
    """Already-enrolled students who would not meet ``rules`` — PAD-133.

    eligibility.enforcement rule 9: saving a stricter bar reports who it *would*
    have excluded, names them, offers no bulk action and does not block the
    save. Rule 8 still holds — tightening never removes anyone, and nobody is
    notified. Eligibility governs joining, never staying, so this is purely
    informational.

    Scoped to FUTURE classes: a bar cannot retroactively un-enrol someone from a
    class that already happened, so reporting past ones would be noise. The
    answer is per-class because eligibility is relative to the class's level —
    the same student can clear the bar for one class and fail another — so a
    student appears once per class they would fail, with that class named.
    """
    if not rules:
        return []

    _now = now or utcnow_naive()
    coach_instance_ids = {
        rel.lesson_instance_id
        for rel in Association_CoachLessonInstance.query.filter_by(
            coach_id=coach_id
        ).all()
    }
    if not coach_instance_ids:
        return []

    instances = (
        LessonInstance.query
        .filter(
            LessonInstance.id.in_(coach_instance_ids),
            LessonInstance.start_datetime >= utc_to_wall_naive(_now),  # PAD-256
        )
        .order_by(LessonInstance.start_datetime)
        .all()
    )

    out = []
    for instance in instances:
        # PAD-259: the presence row is the enrolment.
        for rel in list(getattr(instance, "presences", []) or []):
            cp = Association_CoachPlayer.query.filter_by(
                coach_id=coach_id, player_id=rel.player_id
            ).first()
            if cp is None:
                continue
            failures = eligibility_failures(cp, instance, coach_id, rules)
            if failures:
                out.append({
                    "playerId": int(rel.player_id),
                    "name": (cp.player.user.name if cp.player and cp.player.user else ""),
                    "instanceId": int(instance.id),
                    "classTitle": (
                        getattr(instance, "overwrite_title", None)
                        or getattr(instance.lesson, "title", "")
                        or ""
                    ),
                    # PAD-256: the true instant; the client formats it in Europe/Lisbon.
                    "startDatetime": to_utc_iso(wall_to_utc_naive(instance.start_datetime)),
                    "failures": failures,
                })
    return out


def effective_level_code(obj) -> str:
    """The ``{level}`` message placeholder — empty string when there is no level.

    Same fallback as :func:`effective_level_id`, so an invitation/reminder for a
    class whose level lives on the parent lesson no longer renders a blank
    ``{level}`` slot (notifications.templates rule 7 keeps the empty string for
    a class with genuinely no level).
    """
    level = effective_level(obj)
    return getattr(level, "code", "") or ""


# ---------------------------------------------------------------------------
# Student ranking helpers
# ---------------------------------------------------------------------------

def _level_sort_key(coach_player: Association_CoachPlayer, ladder: dict | None = None) -> int:
    """Rank a candidate by their position in the coach's ladder (0 = strongest).

    ``ladder`` is a ``{level_id: position}`` map (see level_ladder.py). Without
    one — the only caller that has no vacancy to derive the coach from — this
    falls back to the raw ``display_order``. Players with no level always sort
    last.
    """
    if not coach_player.level:
        return 9999
    if ladder is not None:
        return ladder.get(coach_player.level_id, 9999)
    return coach_player.level.display_order or 9999


# ---------------------------------------------------------------------------
# Side (court side) matching helpers — PAD-15
# ---------------------------------------------------------------------------
# A player's side may be "left", "right", "both", or None.
# "both" players are eligible for open spots of ANY side, and a "both"-side
# vacancy (its departing player was "both") accepts players of any side.
# Eligibility is therefore inclusive/symmetric; exact-side is only PREFERRED,
# not required, via the playing-side tiebreaker below.

def _side_eligible(player_side, vacancy_side) -> bool:
    """True when a player is eligible for a vacancy under a 'same side' criterion.

    Inclusive rule: eligible when the vacancy has no side, the sides match, the
    player plays "both", or the vacancy side is "both". Only a strict
    left-vs-right mismatch (with neither being "both") is ineligible.
    """
    if vacancy_side is None:
        return True
    if player_side is None:
        # Player has no recorded side preference — treat as ineligible for a
        # side-specific vacancy (unchanged from prior left/right behaviour where
        # None != "left"/"right").
        return False
    if player_side == vacancy_side:
        return True
    if player_side == "both" or vacancy_side == "both":
        return True
    return False


def _side_preference_rank(player_side, vacancy_side) -> int:
    """Rank for the playing-side tiebreaker: lower is preferred.

    0 = exact side match (or vacancy has no side constraint),
    1 = "both" fallback (player or vacancy is "both"),
    2 = anything else (wrong side; only reachable in looser rounds).
    """
    if vacancy_side is None or player_side == vacancy_side:
        return 0
    if player_side == "both" or vacancy_side == "both":
        return 1
    return 2


def _attendance_stats(player_id: int) -> tuple[float, float]:
    return _attendance_stats_for([player_id])[player_id]


def _attendance_stats_for(player_ids) -> dict[int, tuple[float, float]]:
    """``{player_id: (attendance_rate, justified_miss_rate)}`` for every id, in
    ONE query. PAD-276 (audit M17): the ranking used to run one ``presences``
    query per surviving candidate. Same arithmetic as before — every presence
    row counts in the total, whatever its status — and a player with no rows
    is ``(0.0, 0.0)``."""
    ids = [int(pid) for pid in player_ids]
    stats: dict[int, tuple[float, float]] = {pid: (0.0, 0.0) for pid in ids}
    if not ids:
        return stats
    totals: dict[int, list[int]] = {}
    rows = (
        db.session.query(Presence.player_id, Presence.status, Presence.justification)
        .filter(Presence.player_id.in_(ids))
        .all()
    )
    for pid, status, justification in rows:
        t = totals.setdefault(pid, [0, 0, 0])
        t[0] += 1
        if status == "present":
            t[1] += 1
        elif status == "absent" and justification == "justified":
            t[2] += 1
    for pid, (total, present, justified) in totals.items():
        stats[pid] = (present / total, justified / total)
    return stats


def _build_sort_key(criteria: list[dict], player_stats: dict, vacancy: Vacancy = None):
    enabled = [c["id"] for c in criteria if c.get("enabled")]
    vacancy_side = getattr(vacancy, "side", None)
    # PAD-70: rank by ladder position, not by the raw display_order integer.
    vacancy_coach_id = getattr(vacancy, "coach_id", None)
    ladder = ladder_index_map(vacancy_coach_id) if vacancy_coach_id else None

    def key(cp: Association_CoachPlayer):
        parts = []
        stats = player_stats.get(cp.player_id, {})
        for criterion in enabled:
            if criterion == "level":
                parts.append(_level_sort_key(cp, ladder))
            elif criterion == "justified_misses":
                parts.append(-stats.get("justified_miss_rate", 0.0))
            elif criterion == "attendance":
                parts.append(-stats.get("attendance_rate", 0.0))
            elif criterion == "playing_side":
                # Prefer an exact-side match first, then "both" players, then any
                # remaining. When the vacancy has no side, fall back to the legacy
                # "left first" ordering so behaviour is unchanged for that case.
                if vacancy_side is not None:
                    parts.append(_side_preference_rank(cp.side, vacancy_side))
                else:
                    parts.append(0 if cp.side == "left" else 1)
            elif criterion == "subscription_status":
                parts.append(0 if getattr(cp, "player", None) and cp.player.user.status == "active" else 1)
        return tuple(parts)

    return key


def _unjustified_absence_count(player_id: int, coach_id: int) -> int:
    """Count unjustified absences for a player across all of this coach's class instances."""
    coach_instance_ids = {
        rel.lesson_instance_id
        for rel in Association_CoachLessonInstance.query.filter_by(coach_id=coach_id).all()
    }
    if not coach_instance_ids:
        return 0
    return Presence.query.filter(
        Presence.player_id == player_id,
        Presence.lesson_instance_id.in_(coach_instance_ids),
        Presence.justification == "unjustified",
    ).count()


# ---------------------------------------------------------------------------
# Invitation group helpers
# ---------------------------------------------------------------------------

def _has_makeups(player_id: int, coach_id: int) -> bool:
    """True when a player has more justified absences than accepted invitations for this coach."""
    coach_instance_ids = {
        rel.lesson_instance_id
        for rel in Association_CoachLessonInstance.query.filter_by(coach_id=coach_id).all()
    }
    if not coach_instance_ids:
        return False
    justified = Presence.query.filter(
        Presence.player_id == player_id,
        Presence.lesson_instance_id.in_(coach_instance_ids),
        Presence.justification == "justified",
    ).count()
    accepted = NotificationEvent.query.filter_by(
        player_id=player_id, coach_id=coach_id, status="confirmed"
    ).count()
    return justified > accepted


def _level_ids_one_above(vacancy_level, coach_id: int) -> set:
    """Level IDs sitting exactly one step ABOVE (stronger than) ``vacancy_level``.

    PAD-70: adjacency is a question about the coach's ladder POSITION, not about
    the ``display_order`` integers. Comparing the raw values treats a level with
    an unset order (``NULL`` / the column default ``0``) as the coach's
    strongest level and collapses duplicated orders into a single step, which is
    how a "5-" student got invited as if they were one level above a "4"
    vacancy. See ``padel_app/services/level_ladder.py``.

    Returns an empty set when the vacancy sits at the top of the ladder, or when
    its level does not belong to this coach.
    """
    ladder = get_level_ladder(coach_id)
    index = ladder_index(ladder, getattr(vacancy_level, "id", None))
    if index is None or index == 0:
        return set()
    return {ladder[index - 1].id}


def _level_ids_one_below(vacancy_level, coach_id: int) -> set:
    """Level IDs sitting exactly one step BELOW (weaker than) ``vacancy_level``.

    Positional, for the same reasons as :func:`_level_ids_one_above`. Empty when
    the vacancy sits at the bottom of the ladder.
    """
    ladder = get_level_ladder(coach_id)
    index = ladder_index(ladder, getattr(vacancy_level, "id", None))
    if index is None or index >= len(ladder) - 1:
        return set()
    return {ladder[index + 1].id}


def _compare(value, op: str, threshold) -> bool:
    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        return True
    if op == "less_than":               return value < threshold
    if op == "less_than_or_equal":      return value <= threshold
    if op == "equals":                  return value == threshold
    if op == "greater_than":            return value > threshold
    if op == "greater_than_or_equal":   return value >= threshold
    return True


def _ladder_distance(coach_id: int, level_id_a, level_id_b) -> int | None:
    """Steps between two levels in the coach's ladder, or ``None`` — PAD-128.

    Positional, never the raw ``display_order`` values, for all the reasons in
    ``level_ladder.py`` (PAD-70). ``None`` when either level is absent from this
    coach's ladder, which callers must read as "does not pass a level rule"
    (eligibility.rules rule 6).
    """
    ladder = get_level_ladder(coach_id)
    index_a = ladder_index(ladder, level_id_a)
    index_b = ladder_index(ladder, level_id_b)
    if index_a is None or index_b is None:
        return None
    return abs(index_a - index_b)


def _group_rule_failures(
    rules: list,
    cp: Association_CoachPlayer,
    vacancy: Vacancy | None,
    coach_id: int,
    instance: LessonInstance | None = None,
    *,
    short_circuit: bool = True,
) -> list:
    """Every rule in ``rules`` that ``cp`` fails, as structured records.

    PAD-133. This is the ONE evaluator behind both :func:`_passes_group_rules`
    (a bare bool, used by the invitation engine) and
    :func:`eligibility_failures` (the coach-facing reasons). Forking it would
    let "may this student join?" drift from "why not?" — the same hazard this
    module already avoids for invitation groups vs eligibility.

    Shared by two callers with two different rule vocabularies
    (eligibility.rules rule 7 — two evaluators would drift):

    * **invitation groups** anchor on a vacancy (``*_vacancy`` operations);
    * **eligibility** anchors on a class and passes ``vacancy=None``
      (``*_class`` operations), because the bar must be answerable for a class
      with no spot open.

    ``instance`` (PAD-86) lets the level rules fall back to the class's
    effective level when the vacancy carries no snapshot of its own — which is
    also what makes the ``vacancy=None`` path resolve a level at all.

    ``short_circuit`` preserves the invitation engine's behaviour AND its cost:
    it stops at the first failure, so the hot matching loop never runs the extra
    absence/attendance queries that a full explanation needs. Only the
    coach-facing path pays for evaluating every rule.

    Records carry STRUCTURED data only — never pre-formatted prose, because the
    locale belongs to the client (eligibility.enforcement rule 7):
    ``{attribute, operation, actual, threshold, ladder_distance, reason}``.
    ``ladder_distance`` is signed: negative = the student is STRONGER than the
    class (a lower ladder index), positive = weaker. ``reason`` names the
    fail-closed cases, where ``actual``/``threshold`` cannot be meaningful.
    """
    failures: list = []

    def fail(
        attr, op, *, actual=None, threshold=None, ladder_distance=None, reason=None
    ) -> bool:
        """Record a failed rule. Returns True when the caller should stop."""
        failures.append({
            "attribute": attr,
            "operation": op,
            "actual": actual,
            "threshold": threshold,
            "ladder_distance": ladder_distance,
            "reason": reason,
        })
        return short_circuit

    # PAD-128: `_vacancy_level(None, instance)` degrades cleanly to the class's
    # effective level, so this one call serves both anchors.
    vacancy_level_id, vacancy_level = _vacancy_level(vacancy, instance)

    for rule in rules:
        attr = rule.get("attribute")
        op = rule.get("operation")
        val = rule.get("value")

        if attr == "level":
            class_code = getattr(vacancy_level, "code", None)
            student_code = getattr(cp.level, "code", None)

            if vacancy_level_id is None or vacancy_level is None:
                # PAD-86: fail CLOSED. A vacancy with no level anywhere (not on
                # the vacancy, not on the class, not on the parent lesson)
                # cannot satisfy a level rule, so nobody passes. Skipping the
                # filter here (the old behaviour) turned a level-only group
                # into "invite the coach's whole roster".
                if fail(attr, op, actual=student_code, reason="class_has_no_level"):
                    return failures
                continue
            if cp.level is None:
                if fail(attr, op, threshold=class_code, reason="student_has_no_level"):
                    return failures
                continue

            if op == "same_as_vacancy":
                if cp.level_id != vacancy_level_id:
                    if fail(attr, op, actual=student_code, threshold=class_code):
                        return failures
            elif op == "one_above_vacancy":
                if cp.level_id not in _level_ids_one_above(vacancy_level, coach_id):
                    if fail(attr, op, actual=student_code, threshold=class_code):
                        return failures
            elif op == "one_below_vacancy":
                if cp.level_id not in _level_ids_one_below(vacancy_level, coach_id):
                    if fail(attr, op, actual=student_code, threshold=class_code):
                        return failures
            elif op in ("all_above_vacancy", "all_below_vacancy"):
                # PAD-70: compare ladder POSITIONS (0 = strongest), never the raw
                # display_order values — see level_ladder.py.
                ladder = get_level_ladder(coach_id)
                vd = ladder_index(ladder, vacancy_level_id)
                cd = ladder_index(ladder, cp.level_id)
                if vd is None or cd is None:
                    if fail(
                        attr, op, actual=student_code, threshold=class_code,
                        reason="level_not_in_ladder",
                    ):
                        return failures
                    continue
                if (op == "all_above_vacancy" and cd >= vd) or (
                    op == "all_below_vacancy" and cd <= vd
                ):
                    if fail(
                        attr, op, actual=student_code, threshold=class_code,
                        ladder_distance=cd - vd,
                    ):
                        return failures

            # PAD-128 — eligibility's class-anchored vocabulary. Same ladder
            # positions as above; "above" means STRONGER, i.e. a LOWER index.
            elif op == "same_as_class":
                if cp.level_id != vacancy_level_id:
                    ladder = get_level_ladder(coach_id)
                    vd = ladder_index(ladder, vacancy_level_id)
                    cd = ladder_index(ladder, cp.level_id)
                    if fail(
                        attr, op, actual=student_code, threshold=class_code,
                        ladder_distance=(cd - vd) if (vd is not None and cd is not None) else None,
                    ):
                        return failures
            elif op in (
                "equal_or_above_class",
                "equal_or_below_class",
                "one_below_or_above_class",
                "within_n_of_class",
            ):
                ladder = get_level_ladder(coach_id)
                vd = ladder_index(ladder, vacancy_level_id)
                cd = ladder_index(ladder, cp.level_id)
                if vd is None or cd is None:
                    # A student whose level is not in the coach's ladder never
                    # passes a level rule (eligibility.rules rule 6).
                    if fail(
                        attr, op, actual=student_code, threshold=class_code,
                        reason="level_not_in_ladder",
                    ):
                        return failures
                    continue

                distance = cd - vd
                breached = False
                limit = None
                if op == "equal_or_above_class":
                    breached = cd > vd
                elif op == "equal_or_below_class":
                    breached = cd < vd
                elif op == "one_below_or_above_class":
                    limit = 1
                    breached = abs(distance) > 1
                elif op == "within_n_of_class":
                    try:
                        allowed = int(val)
                    except (TypeError, ValueError):
                        # A malformed `value` must not silently widen the bar
                        # into "any level"; treat it as the strictest reading.
                        allowed = 0
                    limit = max(0, allowed)
                    breached = abs(distance) > limit
                if breached:
                    if fail(
                        attr, op, actual=student_code,
                        threshold=class_code if limit is None else limit,
                        ladder_distance=distance,
                    ):
                        return failures

        elif attr == "side":
            # PAD-128: side is a WAVE criterion only, never an eligibility one
            # (eligibility.rules rule 4), so this branch is unreachable on the
            # eligibility path. Guarded anyway because `vacancy` is now
            # optional and a bare `vacancy.side` would raise on that path.
            if vacancy is None or vacancy.side is None:
                continue
            # Inclusive of "both": a "both" player (or a "both" vacancy) is eligible
            # for any side. Exact-side is preferred via the sort key, not required.
            if op == "same_as_vacancy" and not _side_eligible(cp.side, vacancy.side):
                if fail(attr, op, actual=cp.side, threshold=vacancy.side):
                    return failures

        elif attr == "has_makeups":
            if op == "is_true" and not _has_makeups(cp.player_id, coach_id):
                if fail(attr, op, actual=False, threshold=True):
                    return failures

        elif attr == "unjustified_absences":
            count = _unjustified_absence_count(cp.player_id, coach_id)
            if not _compare(count, op, val):
                # `actual` is the student's real count, not a bool — rule 7's
                # "over the unjustified-absence limit (4, limit is 2)" cannot be
                # rendered without it.
                if fail(attr, op, actual=count, threshold=val):
                    return failures

        elif attr == "justified_absences":
            _, just_rate = _attendance_stats(cp.player_id)
            total_presences = Presence.query.filter_by(player_id=cp.player_id).count()
            just_count = round(just_rate * total_presences)
            if not _compare(just_count, op, val):
                if fail(attr, op, actual=just_count, threshold=val):
                    return failures

        elif attr == "attendance_rate":
            att_rate, _ = _attendance_stats(cp.player_id)
            if not _compare(att_rate * 100, op, val):
                if fail(attr, op, actual=round(att_rate * 100, 1), threshold=val):
                    return failures

        elif attr == "subscription_status":
            status = cp.player.user.status if cp.player and cp.player.user else None
            if op == "equals" and status != val:
                if fail(attr, op, actual=status, threshold=val):
                    return failures

    return failures


def _passes_group_rules(
    rules: list,
    cp: Association_CoachPlayer,
    vacancy: Vacancy | None,
    coach_id: int,
    instance: LessonInstance | None = None,
) -> bool:
    """Apply all rules in a rule set with AND logic.

    Thin bool wrapper over :func:`_group_rule_failures`. Keeps short-circuiting,
    so the invitation engine's behaviour and query cost are exactly as before
    PAD-133.
    """
    return not _group_rule_failures(
        rules, cp, vacancy, coach_id, instance, short_circuit=True
    )


# ---------------------------------------------------------------------------
# Candidate pipeline — ONE stage-tagged evaluation shared by the engine and the
# "Understand invites" simulation (PAD-196, notifications.invite-simulation
# rule 4)
# ---------------------------------------------------------------------------
#
# Before PAD-196 the two candidate functions below each ran the same filter
# chain inline. The tutorial needs to say WHY a student is not invited, and the
# only answer that can never drift from the engine is the engine's own
# evaluation — the same principle PAD-133 applied to the eligibility bar
# (`passes_eligibility` / `eligibility_failures` share `_group_rule_failures`).
# So the chain lives once, in `evaluate_candidates`, which tags EVERY roster
# player with the first stage that dropped them; the engine keeps the
# survivors, the simulation keeps everything.

CANDIDATE_STAGES = (
    "departing_player",
    "already_enrolled",
    "already_invited",
    "eligibility",
    "excluded_by_coach",
    "inactive_account",
    "unavailable",
    "auto_invites_off",
    "no_round_matched",
    "invited",
)

LEGACY_ROUND_CRITERIA = ("same_level", "same_side", "max_unjustified_absences")


@dataclass
class CandidateVerdict:
    """One roster player's fate for one wave of one vacancy."""

    cp: Association_CoachPlayer
    stage: str
    details: dict = field(default_factory=dict)

    @property
    def invited(self) -> bool:
        return self.stage == "invited"


def _wave_rules(config: NotificationConfig, wave: tuple) -> list | None:
    """The rules of an invitation-group wave, or None when the wave does not
    exist in this coach's config. PAD-279 removed the legacy ``rounds``
    vocabulary; ``("group", n)`` is the only wave kind."""
    _kind, number = wave
    groups = config.get_invitation_groups()
    idx = int(number) - 1
    if idx < 0 or idx >= len(groups):
        return None
    return groups[idx].get("rules", []) or []


def evaluate_candidates(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
    *,
    wave: tuple,
    explain: bool = False,
    only_player_ids=None,
) -> list[CandidateVerdict]:
    """Tag every roster player with the FIRST stage that drops them for ``wave``.

    ``wave`` is ``("group", group_index)`` (1-based, invitation groups; the
    legacy ``("round", n)`` kind went with PAD-279). Stages are tried in
    ``CANDIDATE_STAGES`` order and a player who passes them all is ``invited``.

    ``explain=False`` is the engine's hot path: it stops at the first failure
    exactly as the inline chain did, so cost is unchanged. ``explain=True`` is
    the coach-facing path and evaluates every rule of a failing stage so the
    reasons are complete (eligibility: PAD-133 records; round: per-rule records
    in the same shape). ``only_player_ids`` restricts the roster scan.

    Verdicts come back in roster order (the `Association_CoachPlayer` query
    order), which is what the ranking sort has always been stable over.

    A vacancy with no ``id`` (the simulation's unsaved hypothetical) has no
    invitations in flight — the ``already_invited`` lookup is skipped rather
    than let SQLAlchemy match the NULL-vacancy rows manual notifications leave.
    """
    enrolled_ids = set(instance.enrolled_player_ids)  # PAD-259
    departing_id = getattr(vacancy, "original_player_id", None)

    active_invite_ids: set = set()
    if getattr(vacancy, "id", None) is not None:
        from sqlalchemy import or_

        # B-056 (notifications.invitations rule 8): a player already asked for
        # this vacancy in THIS round is done for the round, whatever they
        # answered. A decline or a timeout leaves the invitation `expired`, and
        # without the round clause the decliner was eligible again at once:
        # the ranking does not change on a decline, so `_send_next_on_decline`
        # invited the same player straight back and the round never ran out.
        # Invitations still live from any round keep excluding, as before.
        active_invite_ids = {
            e.player_id
            for e in NotificationEvent.query.filter(
                NotificationEvent.vacancy_id == vacancy.id,
                or_(
                    NotificationEvent.status.in_(["sent", "confirmed"]),
                    NotificationEvent.round_number == wave[1],
                ),
            ).all()
        }

    eligibility_rules = effective_eligibility(instance, coach_id, config)

    restrictions = config.get_restrictions()
    excluded_player_ids: set = set()
    if restrictions["excludedPlayers"]["enabled"]:
        excluded_player_ids = set(restrictions["excludedPlayers"]["playerIds"])
    exclude_inactive = bool(restrictions["excludeUnpaidSubscription"]["enabled"])

    group_rules = _wave_rules(config, wave)
    wave_exists = group_rules is not None

    # PAD-28 (availability blockers) and PAD-112 (auto-invite opt-out) are two
    # independent questions — "are they free at THIS hour?" and "do they want
    # to be asked at all?" — evaluated per player through the same functions
    # the batch filters call, so the answer is the engine's answer.
    from sqlalchemy.orm import selectinload

    from padel_app.models import Player
    from padel_app.services.student_availability_service import blocked_user_ids_for_window
    from padel_app.services.student_notification_preferences import (
        player_blocks_auto_invitations,
    )

    # PAD-276 (audit M17): the roster is read once, with the player and user
    # rows it needs, and the availability blockers of the whole roster come
    # back in one query. Before this the loop below lazy-loaded ``players`` and
    # ``users`` and ran one ``calendar_blocks`` query per candidate — three
    # statements per student, ~900 per wave on a 300-student roster, on every
    # batch and every decline. The verdicts are unchanged: the same predicate
    # is evaluated per user, just over rows fetched together.
    roster_query = Association_CoachPlayer.query.filter_by(coach_id=coach_id).options(
        selectinload(Association_CoachPlayer.player).selectinload(Player.user)
    )
    if only_player_ids is not None:
        roster_query = roster_query.filter(
            Association_CoachPlayer.player_id.in_(list(only_player_ids))
        )
    roster = roster_query.all()
    blocked_user_ids = blocked_user_ids_for_window(
        [cp.player.user_id for cp in roster if cp.player is not None],
        instance.start_datetime,
        instance.end_datetime,
    )

    verdicts: list[CandidateVerdict] = []
    for cp in roster:
        pid = cp.player_id
        if departing_id is not None and pid == departing_id:
            verdicts.append(CandidateVerdict(cp, "departing_player"))
            continue
        if pid in enrolled_ids:
            verdicts.append(CandidateVerdict(cp, "already_enrolled"))
            continue
        if pid in active_invite_ids:
            verdicts.append(CandidateVerdict(cp, "already_invited"))
            continue
        if explain:
            failures = eligibility_failures(cp, instance, coach_id, eligibility_rules)
            if failures:
                verdicts.append(CandidateVerdict(cp, "eligibility", {"failures": failures}))
                continue
        elif not passes_eligibility(cp, instance, coach_id, eligibility_rules):
            verdicts.append(CandidateVerdict(cp, "eligibility"))
            continue
        if str(pid) in excluded_player_ids:
            verdicts.append(CandidateVerdict(cp, "excluded_by_coach"))
            continue
        user = cp.player.user if cp.player else None
        # PAD-268 (auth.account-deletion rule 7): a deleted account is never a
        # candidate, whatever "Exclude inactive accounts" says: it can never
        # attend, and inviting it would spend a slot of the round.
        if user is not None and user.status == "disabled":
            verdicts.append(CandidateVerdict(cp, "inactive_account"))
            continue
        if exclude_inactive:
            if not user or user.status != "active":
                verdicts.append(CandidateVerdict(cp, "inactive_account"))
                continue
        user_id = cp.player.user_id if cp.player else None
        if user_id in blocked_user_ids:
            verdicts.append(CandidateVerdict(cp, "unavailable"))
            continue
        if player_blocks_auto_invitations(pid):
            verdicts.append(CandidateVerdict(cp, "auto_invites_off"))
            continue
        if not wave_exists:
            verdicts.append(CandidateVerdict(cp, "no_round_matched", {"failures": []}))
            continue
        failures = _group_rule_failures(
            group_rules, cp, vacancy, coach_id, instance, short_circuit=not explain
        )
        if failures:
            verdicts.append(CandidateVerdict(cp, "no_round_matched", {"failures": failures}))
            continue
        verdicts.append(CandidateVerdict(cp, "invited"))

    return verdicts


def _rank_invited(
    verdicts: list[CandidateVerdict],
    config: NotificationConfig,
    vacancy: Vacancy,
) -> list[Association_CoachPlayer]:
    """The survivors of a wave, ranked by the coach's priority criteria — the
    exact stats + sort the engine has always applied."""
    coach_players = [v.cp for v in verdicts if v.invited]
    stats = _attendance_stats_for([cp.player_id for cp in coach_players])
    player_stats = {
        cp.player_id: {
            "attendance_rate": stats[cp.player_id][0],
            "justified_miss_rate": stats[cp.player_id][1],
        }
        for cp in coach_players
    }
    sort_key = _build_sort_key(config.get_priority_criteria(), player_stats, vacancy)
    return sorted(coach_players, key=sort_key)


def _get_eligible_students_for_group(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
    group_index: int,
) -> list[Association_CoachPlayer]:
    """Like get_eligible_students but uses invitation group rules instead of round criteria."""
    return _rank_invited(
        evaluate_candidates(vacancy, instance, coach_id, config, wave=("group", group_index)),
        config,
        vacancy,
    )


def get_eligible_students(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
    round_number: int,
) -> list[Association_CoachPlayer]:
    """The roster students eligible for wave ``round_number`` (1-based), ranked
    by the coach's priority criteria. Since PAD-279 a round IS an invitation
    group — the legacy ``rounds`` vocabulary is gone — so this public name and
    ``_get_eligible_students_for_group`` are the same function."""
    return _get_eligible_students_for_group(vacancy, instance, coach_id, config, round_number)


def invitation_waves(config: NotificationConfig) -> list[tuple]:
    """Every wave of this coach's engine, in the order it widens:
    ``(number, "group", rules)``. One definition, used by the engine's round
    counter, the approval prompt and the simulation. An empty group list is
    the built-in three (``get_invitation_groups``; PAD-279 removed rounds)."""
    return [
        (idx, "group", list(g.get("rules", []) or []))
        for idx, g in enumerate(config.get_invitation_groups(), start=1)
    ]


def ordered_invite_rounds(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
) -> list[tuple[int, str, list, list[Association_CoachPlayer]]]:
    """``(number, kind, rules, ranked_cps)`` per wave, in engine order, with a
    player appearing only in the FIRST wave that admits them — the full ordered
    invite queue behind the semi-auto approval prompt and the tutorial."""
    seen: set = set()
    rounds = []
    for number, kind, rules in invitation_waves(config):
        wave = ("group", number)
        ranked = _rank_invited(
            evaluate_candidates(vacancy, instance, coach_id, config, wave=wave),
            config,
            vacancy,
        )
        fresh = []
        for cp in ranked:
            if cp.player_id in seen:
                continue
            seen.add(cp.player_id)
            fresh.append(cp)
        rounds.append((number, kind, rules, fresh))
    return rounds



# ---------------------------------------------------------------------------
# Restriction checks
# ---------------------------------------------------------------------------

def _check_restrictions(
    instance: LessonInstance,
    coach_id: int,
    restrictions: dict,
    *,
    now: datetime | None = None,
) -> bool:
    now = now or utcnow_naive()

    if restrictions.get("quietHours", {}).get("enabled"):
        # PAD-136: `now` is a naive UTC instant, but 22/7 are a CLUB-LOCAL wall
        # clock ("don't message students late at night") — notifications.config
        # rule 6a. Comparing the UTC hour directly drifted the window to
        # 23:00–08:00 local through Portuguese summer time (WEST = UTC+1) while
        # reading correctly in winter (WET = UTC+0), so it looked intermittent:
        # a 22:30-local invite was sent, a 07:30-local one suppressed.
        #
        # PAD-144: CLUB_TZ now comes from `utils.dates`, which imports nothing
        # from the app. The lazy `from padel_app.scheduler import CLUB_TZ` this
        # replaces existed only to avoid closing the scheduler <-> service
        # import cycle; sourcing the constant from a leaf module removes the
        # cycle rather than working around it.
        local_hour = now.replace(tzinfo=timezone.utc).astimezone(CLUB_TZ).hour
        if local_hour >= 22 or local_hour < 7:
            return False

    min_time = restrictions.get("minTimeBeforeClass", {})
    if min_time.get("enabled"):
        # PAD-256 (notifications.invitations rule 11): real minutes to the real start.
        minutes_until = (wall_to_utc_naive(instance.start_datetime) - now).total_seconds() / 60
        if minutes_until < min_time["value"]:
            return False

    max_total = restrictions.get("maxTotal", {})
    if max_total.get("enabled"):
        already_sent = NotificationEvent.query.filter_by(
            lesson_instance_id=instance.id,
        ).filter(NotificationEvent.status.in_(["sent", "confirmed"])).count()
        if already_sent >= max_total["value"]:
            return False

    return True


def _check_per_student_daily_limit(
    player_id: int,
    coach_id: int,
    restrictions: dict,
    *,
    now: datetime | None = None,
) -> bool:
    limit = restrictions.get("maxInvitesPerStudentPerDay", {})
    if not limit.get("enabled"):
        return True
    _now = now or utcnow_naive()
    # PAD-144: "per day" is the coach's CLUB-LOCAL calendar day
    # (notifications.config rule 6b), not the UTC one. `created_at` is stored
    # naive UTC, so the boundary is derived in club-local time and converted
    # back. The previous `.replace(hour=0, ...)` pinned it to UTC midnight,
    # running the window 01:00 local -> 01:00 local all summer: invitations
    # sent in the first local hour of a day counted against the PREVIOUS day's
    # quota, so a student could exceed the configured limit within one day.
    today_start = club_day_start_utc(_now)
    count = NotificationEvent.query.filter(
        NotificationEvent.player_id == player_id,
        NotificationEvent.coach_id == coach_id,
        NotificationEvent.created_at >= today_start,
    ).count()
    return count < limit["value"]


# ---------------------------------------------------------------------------
# Conversation / message helpers
# ---------------------------------------------------------------------------

def _format_template(template: str, **variables) -> str:
    for key, val in variables.items():
        template = template.replace("{" + key + "}", str(val))
    # An empty placeholder (e.g. a level-less class -> empty {level}) can leave a
    # double space or a space before punctuation; collapse those so the rendered
    # message stays grammatical.
    template = re.sub(r"\s{2,}", " ", template)
    template = re.sub(r"\s+([,.!?;:])", r"\1", template)
    return template.strip()


# Portuguese weekday names, indexed by ``datetime.weekday()`` (Monday == 0).
# Tactical localization only — full locale-driven i18n is tracked in PAD-39.
_PT_WEEKDAYS = (
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
)


def _weekday_pt(start_datetime) -> str:
    """Portuguese weekday name for a datetime, or "" when missing.

    Avoids ``strftime("%A")`` which returns the English weekday under the
    server's default (en) locale — the source of the "esta Wednesday" leak.
    """
    if not start_datetime:
        return ""
    return _PT_WEEKDAYS[start_datetime.weekday()]


def _level_label(instance) -> str:
    """Class-name / modality for the ``{level}`` placeholder.

    Returns the level code when the instance has a level, otherwise an empty
    string. The previous ``"this"`` fallback was an English filler word that
    leaked into pt templates as "aula de this".
    """
    level = getattr(instance, "level", None)
    return level.code if level else ""


def _resolve_locale(coach):
    """Resolve the coach's preferred locale, falling back to Portuguese."""
    try:
        lang = getattr(coach.user, "language", None) if coach and coach.user else None
    except Exception:
        lang = None
    return "pt" if not lang else ("pt" if lang.startswith("pt") else "en")


def _format_weekday(dt, locale):
    """Locale-aware full weekday name via Babel (e.g. pt -> 'quarta-feira')."""
    if not dt:
        return ""
    try:
        from babel.dates import format_date
        return format_date(dt, format="EEEE", locale=locale)
    except Exception:
        return dt.strftime("%A")


def _get_or_create_direct_conversation(coach_user_id: int, player_user_id: int):
    from padel_app.models import Conversation, ConversationParticipant
    key = Conversation.build_participant_key([coach_user_id, player_user_id])
    conv = Conversation.query.filter_by(participant_key=key).first()
    if conv is None:
        conv = Conversation(participant_key=key, is_group=False)
        conv.create()
        for uid in sorted(set([coach_user_id, player_user_id])):
            ConversationParticipant(conversation_id=conv.id, user_id=uid).create()
    return conv


def _send_system_message(
    coach_user_id: int,
    player_user_id: int,
    text: str,
    message_type: str = "text",
    msg_metadata: dict | None = None,
    class_instance_id: int | None = None,
):
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message
    from padel_app.utils.expo_push import send_expo_push_to_user

    # PAD-67 backstop: never deliver an empty message. Template resolution
    # (``resolve_message_template``) already substitutes a built-in default for a
    # missing/blank template, so reaching here with blank text means the rendered
    # body genuinely has nothing to say — sending it would only produce the empty
    # chat bubbles + empty push notifications reported in the ticket.
    if not (text or "").strip():
        from flask import current_app, has_app_context
        if has_app_context():
            current_app.logger.warning(
                "_send_system_message: refusing to send an empty %s message to user %s",
                message_type, player_user_id,
            )
        return None

    # PAD-107 hard backstop — "em nenhuma circunstância". A student who marked
    # themselves unavailable must never be solicited about a class that falls in
    # that window, whatever fired the send: the coach's "Lembrar"/notify buttons,
    # the APScheduler reminder job, an auto-invitation round, or the waiting-list
    # cascade. Enforcing it at the single delivery choke point means no future
    # caller can bypass it by accident.
    #
    # Scope is deliberately narrow: only the three CLASS-SLOT SOLICITATION types.
    # Plain chat, cancellation notices and "you got the spot" confirmations still
    # go through — being unavailable means "don't ask me to play at that hour",
    # not "cut me off from my coach".
    resolved_instance_id = class_instance_id
    if resolved_instance_id is None and msg_metadata:
        resolved_instance_id = msg_metadata.get("lessonInstanceId") or msg_metadata.get("instanceId")

    if message_type in _BLOCKABLE_MESSAGE_TYPES and resolved_instance_id is not None:
        from padel_app.services.student_availability_service import (
            instance_window_is_blocked_for_user,
        )

        _blocked_instance = LessonInstance.query.get(resolved_instance_id)
        if instance_window_is_blocked_for_user(player_user_id, _blocked_instance):
            from flask import current_app, has_app_context
            if has_app_context():
                current_app.logger.info(
                    "_send_system_message: suppressing %s for user %s — availability "
                    "blocker overlaps lesson instance %s (PAD-107)",
                    message_type, player_user_id, resolved_instance_id,
                )
            return None

    # PAD-112 backstop — a student who blocked ALL notifications is never
    # solicited about a class slot, whatever fired the send: the coach's
    # notify/remind buttons, the APScheduler reminder job, an auto-invitation
    # round, or the waiting-list cascade. Enforcing it at the single delivery
    # choke point means no future caller can bypass it by accident.
    #
    # This is a SAFETY NET, not the primary enforcement. The auto path filters
    # in `get_eligible_students`, the manual path filters before it creates the
    # NotificationEvent, and `send_class_reminders` filters before it sends —
    # because blocking only here would leave events marked "sent" with no
    # message behind them.
    #
    # Purely a per-recipient lookup: unlike the PAD-107 availability backstop it
    # needs no lesson instance, so the two guards simply sit in sequence — a
    # send is suppressed if EITHER says so.
    if message_type in _BLOCKABLE_MESSAGE_TYPES:
        from padel_app.services.student_notification_preferences import (
            user_blocks_all_notifications,
        )

        if user_blocks_all_notifications(player_user_id):
            from flask import current_app, has_app_context
            if has_app_context():
                current_app.logger.info(
                    "_send_system_message: suppressing %s for user %s — they "
                    "blocked all notifications (PAD-112)",
                    message_type, player_user_id,
                )
            return None

    conv = _get_or_create_direct_conversation(coach_user_id, player_user_id)
    msg = Message(
        text=text,
        sender_id=coach_user_id,
        conversation_id=conv.id,
        message_type=message_type,
        msg_metadata=msg_metadata or {},
    )
    msg.create()

    # The coach and the player of the direct conversation, nobody else (B-004).
    publish(
        {"type": "message_created", "payload": serialize_message(msg, None)},
        message_recipient_ids(msg),
    )

    send_push_notification(
        user_id=player_user_id,
        title="New message",
        body=text[:100],
        url=f"/messages/{conv.id}",
    )

    # Native (Expo) push — additive, best-effort. PAD-240: this is a MESSAGE
    # notification (messaging.push-notifications rule 7). Every system message
    # is a Message row in the coach–student thread, and what the student acts
    # on (the Yes/No answer, the reply) lives there, so the tap opens the
    # conversation. It used to route to class/[id] with the lesson instance id,
    # which the mobile class screen cannot open from a push — it rebuilds its
    # event from route params (model/originalId/date) a push never carries —
    # so every tap dead-ended on "this class could not be found". The instance
    # id (``resolved_instance_id``, computed above for the PAD-107 backstop)
    # still rides along as context; the client never routes on it alone.
    push_data = {"type": "message", "conversationId": conv.id}
    if resolved_instance_id is not None:
        push_data["classInstanceId"] = resolved_instance_id
    # PAD-147: this is an unread Message row like any direct message, so the
    # push carries the recipient's real unread total as the icon badge (rule
    # 5). msg.create() has already committed, so the count includes it.
    from padel_app.services.messaging_service import get_unread_count
    send_expo_push_to_user(
        player_user_id,
        title="New message",
        body=text[:100],
        data=push_data,
        badge=get_unread_count(player_user_id),
    )

    return msg


def _notify_coach_of_cancellation(
    coach_user_id: int,
    player_user_id: int,
    instance: LessonInstance,
    player,
    *,
    is_late: bool,
    is_proactive: bool = False,
    locale: str = "en",
) -> "object | None":
    """Create a single COACH-facing notification when a student cancels.

    Unlike ``_send_system_message`` (which pushes to the *player*), this reuses the
    same coach↔player direct conversation but sends the message *from the student*
    (``sender_id=player_user_id``) and directs the push notification at the
    ``coach_user_id`` — so the coach is the one who actually gets notified.

    Emitted from ``cancel_attendance`` only (the single path that computes
    lateness), so it fires exactly once per cancellation. The human-readable text
    reflects lateness, and ``msg_metadata`` carries a machine-readable
    ``lateCancellation`` marker plus the ``lessonInstanceId``.
    """
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message

    if not coach_user_id or not player_user_id:
        return None

    is_pt = (locale or "").startswith("pt")
    player_name = player.user.name if player and player.user else (
        "Um jogador" if is_pt else "A player"
    )
    class_title = instance.title or ("a aula" if is_pt else "the class")
    when = _format_class_when(instance, locale)

    # PAD-100: the whole notification string must be localized to the coach's
    # language. Previously only the interpolated fields (name, class, weekday)
    # were localized while the template words stayed English, producing a mixed
    # "cancelled (LATE) for ... on <weekday-in-pt>" message for PT coaches.
    # PAD-73: a proactive decline gets its own wording. The coach should be able
    # to tell at a glance that this student spoke up EARLY — before they were
    # even asked to confirm — because that is exactly the behaviour the feature
    # is meant to encourage, and it reads very differently from a late drop-out.
    if is_proactive:
        if is_pt:
            text = (
                f"{player_name} avisou com antecedência que não vai comparecer "
                f"a {class_title}{when}. A vaga foi libertada."
            )
        else:
            text = (
                f"{player_name} let you know in advance that they will not attend "
                f"{class_title}{when}. The spot has been freed."
            )
    elif is_pt:
        marker = " (ATRASADO)" if is_late else ""
        text = f"{player_name} cancelou{marker} para {class_title}{when}."
    elif is_late:
        text = f"{player_name} cancelled (LATE) for {class_title}{when}."
    else:
        text = f"{player_name} cancelled for {class_title}{when}."

    conv = _get_or_create_direct_conversation(coach_user_id, player_user_id)
    msg = Message(
        text=text,
        sender_id=player_user_id,
        conversation_id=conv.id,
        message_type="text",
        msg_metadata={
            "cancellation": True,
            "lateCancellation": bool(is_late),
            # PAD-73: machine-readable marker so clients can style an early
            # heads-up differently from a plain or late cancellation.
            "proactiveDecline": bool(is_proactive),
            "lessonInstanceId": instance.id,
        },
    )
    msg.create()

    publish(
        {"type": "message_created", "payload": serialize_message(msg, None)},
        message_recipient_ids(msg),
    )

    if is_proactive:
        push_title = "Aviso antecipado" if is_pt else "Advance notice"
    elif is_pt:
        push_title = "Cancelamento tardio" if is_late else "Cancelamento"
    else:
        push_title = "Late cancellation" if is_late else "Cancellation"

    send_push_notification(
        user_id=coach_user_id,
        title=push_title,
        body=text[:100],
        url=f"/messages/{conv.id}",
    )

    # PAD-240: the cancellation is a message in the coach–student thread, so
    # the push opens that thread (messaging.push-notifications rule 7); the
    # instance id is context only.
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.services.messaging_service import get_unread_count
    send_expo_push_to_user(
        coach_user_id,
        title=push_title,
        body=text[:100],
        data={
            "type": "message",
            "conversationId": conv.id,
            "classInstanceId": instance.id,
        },
        # PAD-147: unread total as the icon badge, like every message push.
        badge=get_unread_count(coach_user_id),
    )

    return msg


def _format_class_when(instance: LessonInstance, locale: str = "en") -> str:
    """Human-readable ' on <weekday> at <time>' suffix for a class instance.

    PAD-100: fully localized. For Portuguese coaches this renders
    ' na <weekday> às <time>' (or ' no <weekday> …' for sábado/domingo, which
    are masculine), so the suffix no longer leaks English prepositions into an
    otherwise-Portuguese notification.
    """
    if instance.start_datetime is None:
        return ""
    dt = instance.start_datetime
    weekday = _format_weekday(dt, locale)
    time_str = dt.strftime("%H:%M")
    if (locale or "").startswith("pt"):
        if weekday:
            # Weekdays segunda–sexta are feminine ("na"); sábado/domingo (5, 6)
            # are masculine ("no").
            prep = "no" if dt.weekday() >= 5 else "na"
            return f" {prep} {weekday} às {time_str}"
        return f" às {time_str}"
    if weekday:
        return f" on {weekday} at {time_str}"
    return f" at {time_str}"


def collect_cancellation_recipients(source) -> list[dict]:
    """Snapshot what's needed to tell each enrolled student a class was cancelled.

    PAD-75: when a coach cancels/removes a scheduled class, every enrolled student
    should be told. This resolves the coach, the coach's locale + message
    templates, and each enrolled student's user id and personalised message text
    into plain dicts, so the caller can send the notifications AFTER the class (and
    its relations) has been removed.

    Works uniformly for a ``Lesson`` or a ``LessonInstance`` — both expose
    ``coaches_relations``, ``players_relations``, ``title``, ``start_datetime`` and
    ``level``. MUST be called BEFORE removal, because removal cascade-deletes those
    relations. Returns ``[]`` when there is no coach or no enrolled student, so the
    caller sends nothing.
    """
    from padel_app.models import Coach, LessonInstance, Player

    coach_rels = list(getattr(source, "coaches_relations", []) or [])
    coach = None
    if coach_rels:
        coach = getattr(coach_rels[0], "coach", None) or Coach.query.get(
            coach_rels[0].coach_id
        )
    coach_user_id = coach.user_id if coach else None
    if not coach_user_id:
        return []

    locale = _resolve_locale(coach)
    config = get_or_create_config(coach.id)
    templates = config.get_message_templates(locale)

    level = getattr(source, "level", None)
    level_code = level.code if level else ""
    start_dt = getattr(source, "start_datetime", None)
    weekday = _format_weekday(start_dt, locale)
    time_str = start_dt.strftime("%H:%M") if start_dt else ""

    # Only a materialized LessonInstance carries an id the mobile app can route to.
    instance_id = source.id if isinstance(source, LessonInstance) else None

    recipients: list[dict] = []
    # PAD-259: an instance's roster is its presences; a Lesson's is the series roster.
    roster_rows = source.presences if isinstance(source, LessonInstance) else getattr(source, "players_relations", [])
    for rel in list(roster_rows or []):
        player = getattr(rel, "player", None) or Player.query.get(rel.player_id)
        player_user_id = player.user_id if player else None
        if not player_user_id:
            continue
        first_name = (
            (player.user.name or "").split()[0]
            if player and player.user and player.user.name
            else ""
        )
        text = _format_template(
            resolve_message_template(templates, "class_cancelled", locale),
            name=first_name,
            level=level_code,
            weekday=weekday,
            time=time_str,
        )
        recipients.append(
            {
                "coach_user_id": coach_user_id,
                "player_user_id": player_user_id,
                "text": text,
                "instance_id": instance_id,
            }
        )
    return recipients


def notify_students_of_cancellation(recipients: list[dict]) -> int:
    """Send each pre-computed cancellation notification (PAD-75).

    Reuses ``_send_system_message`` — the same coach→student conversation channel
    (in-app message + push) used by every other class notification. Returns the
    number of messages actually sent.
    """
    sent = 0
    for r in recipients or []:
        metadata = {"classCancellation": True}
        if r.get("instance_id") is not None:
            metadata["lessonInstanceId"] = r["instance_id"]
        msg = _send_system_message(
            coach_user_id=r["coach_user_id"],
            player_user_id=r["player_user_id"],
            text=r["text"],
            message_type="text",
            msg_metadata=metadata,
            class_instance_id=r.get("instance_id"),
        )
        if msg is not None:
            sent += 1
    return sent


def _user_id_for_player(player_id: int) -> int | None:
    from padel_app.models import Player
    player = Player.query.get(player_id)
    return player.user_id if player else None


def _user_id_for_coach(coach_id: int) -> int | None:
    from padel_app.models import Coach
    coach = Coach.query.get(coach_id)
    return coach.user_id if coach else None


def _coach_only(coach_user_id: int | None) -> list[int]:
    """Recipients for a `notify_sent` / `notification_responded` event.

    These two carry no message body — they tell a coach's class view that
    invitations went out, or that a player answered one. Both clients already
    gate their handlers on `isCoach` / `canManage`, so the coach is the whole
    audience; addressing them to anyone else would only have leaked which
    classes have unfilled spots (messaging.sse-realtime rule 8).
    """
    return [coach_user_id] if coach_user_id else []


def _instance_is_over(instance: LessonInstance, now: datetime | None = None) -> bool:
    """True when a class can no longer accept attendance changes or invitations.

    PAD-68: a class that has already started (or was canceled/completed) is
    "closed" — nothing about its roster can usefully change any more. Every
    notification path that could send a message or move a player must consult
    this before acting, so a late response to a stale reminder/invite can never
    resurrect the invitation engine for a class that already happened.
    """
    if instance is None:
        return True
    if instance.status in ("canceled", "completed"):
        return True
    _now = now or utcnow_naive()
    # PAD-256 (R-023): `now` is the UTC instant; the class time is on the club's clock.
    return instance.start_datetime is not None and instance.start_datetime <= utc_to_wall_naive(_now)


def _effective_filled_spots(instance: LessonInstance) -> int:
    # Delegates to the single source of truth on the model (PAD-71) so the
    # invitation engine, the calendar payload and the class-detail capacity
    # field can never drift apart.
    return instance.effective_filled_spots


def _add_player_to_instance(player_id: int, instance: LessonInstance) -> None:
    # PAD-259 (classes.instance-enrollment rule 4): the one writer. A fill is a
    # presence row that is already answered "yes".
    from padel_app.services.lesson_service import enrol

    enrol(player_id, instance, "fill", confirmed=True)

    # PAD-131 (classes.join-requests rule 10): first fill wins. Every fill path
    # — invitation "yes", waiting-list placement, accepted request — converges
    # here, so this is where the other pending requests learn the spot is gone.
    from padel_app.services.class_join_request_service import supersede_pending_requests
    db.session.expire(instance, ["players_relations", "presences"])
    supersede_pending_requests(instance, filled_by_player_id=player_id)


def _broadcast_spot_filled(
    instance: LessonInstance,
    confirmed_event_id: int,
    coach_user_id: int,
    templates: dict,
    vacancy_id: int | None = None,
    locale: str | None = None,
) -> None:
    """
    Mark all other 'sent' events as expired, update their invite messages,
    and send the spot-filled message. Scoped to vacancy_id when provided.
    """
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message

    spot_filled_text = resolve_message_template(templates, "spot_filled", locale)

    query = NotificationEvent.query.filter(
        NotificationEvent.status == "sent",
        NotificationEvent.id != confirmed_event_id,
    )
    if vacancy_id is not None:
        query = query.filter(NotificationEvent.vacancy_id == vacancy_id)
    else:
        query = query.filter(NotificationEvent.lesson_instance_id == instance.id)

    pending_events = query.all()

    for other_event in pending_events:
        other_player_user_id = _user_id_for_player(other_event.player_id)
        if not other_player_user_id:
            continue

        if other_event.message_id:
            invite_msg = Message.query.get(other_event.message_id)
            if invite_msg and invite_msg.msg_metadata is not None:
                invite_msg.msg_metadata = {
                    **invite_msg.msg_metadata,
                    "responded": True,
                    "response": "spot_filled",
                }
                invite_msg.save()
                publish(
                    {"type": "message_edited", "payload": serialize_message(invite_msg, None)},
                    message_recipient_ids(invite_msg),
                )

        _send_system_message(
            coach_user_id, other_player_user_id, spot_filled_text,
            class_instance_id=instance.id,
        )
        other_event.status = "expired"
        other_event.save()
        publish(
            {
                "type": "notification_responded",
                "payload": {
                    "lessonInstanceId": instance.id,
                    "notificationEventId": other_event.id,
                    "response": "spot_filled",
                },
            },
            _coach_only(coach_user_id),
        )


# ---------------------------------------------------------------------------
# Vacancy helpers
# ---------------------------------------------------------------------------

def vacancy_snapshot_for_player(
    instance: LessonInstance, coach_id: int, player_id: int
) -> tuple:
    """``(side, level_id, level_source)`` a vacancy snapshots from a departing
    player — notifications.invitations rules 2/2a, in ONE place.

    PAD-86: the departing player's level, falling back to the class's
    effective level when the player has none — never leave the vacancy
    level-less, which would disable every level rule downstream.
    ``level_source`` says which tier answered: ``"player"``, ``"class"`` or
    ``"none"`` (PAD-196 shows it to the coach).
    """
    cp = Association_CoachPlayer.query.filter_by(
        coach_id=coach_id, player_id=player_id
    ).first()
    side = cp.side if cp else None
    if cp and cp.level_id:
        return side, cp.level_id, "player"
    class_level_id = effective_level_id(instance)
    if class_level_id:
        return side, class_level_id, "class"
    return side, None, "none"


def _lock_instance(instance: LessonInstance) -> LessonInstance:
    """PAD-261 (notifications.invitations rule 10): take the class row lock and re-read it.

    ``SELECT ... FOR UPDATE`` waits for any other transaction deciding on this
    class, then refreshes the row and drops the cached roster and presences, so
    capacity is counted from what is committed now, never from a copy loaded
    earlier in the request. The lock lasts until the next commit; every caller
    ends its locked section with one.
    """
    locked = (
        LessonInstance.query.filter_by(id=instance.id)
        .with_for_update()
        .populate_existing()
        .one()
    )
    db.session.expire(locked, ["players_relations", "presences"])
    return locked


def _lock_vacancy_and_instance(vacancy, instance):
    """PAD-261: lock the vacancy, then the class, and re-read both.

    Always in that order, so two deciders can never deadlock on each other.
    """
    if vacancy is not None:
        vacancy = (
            Vacancy.query.filter_by(id=vacancy.id)
            .with_for_update()
            .populate_existing()
            .one()
        )
    return vacancy, _lock_instance(instance)


def _open_vacancy_for(instance_id: int, player_id: int):
    return (
        Vacancy.query.filter_by(
            lesson_instance_id=instance_id,
            original_player_id=player_id,
            status="open",
        )
        .order_by(Vacancy.id.asc())
        .first()
    )


def _create_vacancy_for_absent_player(
    instance: LessonInstance,
    coach_id: int,
    absent_player_id: int,
) -> Vacancy:
    # PAD-261 (invitations rule 10): a departing player has at most one open
    # vacancy. A found one takes no lock; a new one is created only after
    # looking again under the class lock, so two concurrent absences for the
    # same player cannot both insert.
    existing = _open_vacancy_for(instance.id, absent_player_id)
    if existing is not None:
        return existing
    instance = _lock_instance(instance)
    existing = _open_vacancy_for(instance.id, absent_player_id)
    if existing is not None:
        db.session.commit()  # release the lock
        return existing

    side, level_id, _source = vacancy_snapshot_for_player(
        instance, coach_id, absent_player_id
    )

    config = get_or_create_config(coach_id)

    vacancy = Vacancy(
        lesson_instance_id=instance.id,
        coach_id=coach_id,
        original_player_id=absent_player_id,
        side=side,
        level_id=level_id,
        status="open",
        approval_status="pending" if _is_semi_auto(config) else "not_required",
    )
    vacancy.create()
    return vacancy


def _create_structural_vacancies(instance: LessonInstance, coach_id: int) -> list[Vacancy]:
    """
    Create Vacancy records for spots that are open because the class was never
    fully enrolled (no 'departing' player to snapshot from).
    """
    def _spots_to_create() -> int:
        existing_count = Vacancy.query.filter_by(
            lesson_instance_id=instance.id,
        ).filter(Vacancy.status.in_(["open", "filled"])).count()
        open_spots = instance.max_players - _effective_filled_spots(instance)
        return max(0, open_spots - existing_count)

    if _spots_to_create() == 0:
        return []
    # PAD-261 (invitations rule 10): count again under the class lock, and add
    # every new row in one commit, so a concurrent caller waits and then
    # counts them instead of adding its own.
    instance = _lock_instance(instance)
    spots_to_create = _spots_to_create()

    config = get_or_create_config(coach_id)
    approval_status = "pending" if _is_semi_auto(config) else "not_required"

    vacancies = []
    for _ in range(spots_to_create):
        v = Vacancy(
            lesson_instance_id=instance.id,
            coach_id=coach_id,
            original_player_id=None,
            side=None,
            # PAD-86: the level often lives only on the parent lesson.
            level_id=effective_level_id(instance),
            status="open",
            approval_status=approval_status,
        )
        db.session.add(v)
        vacancies.append(v)
    db.session.commit()  # the new rows, and the end of the lock
    return vacancies


# ---------------------------------------------------------------------------
# Reminder flow
# ---------------------------------------------------------------------------

def send_class_reminders(instance_id: int, *, now: datetime | None = None) -> dict:
    """
    Send 'Are you coming?' messages to all enrolled players.
    Called by APScheduler at the configured reminder time.

    Sends up to ``reminderCount`` reminders per student (spaced
    ``hoursBetweenReminders`` apart — the spacing is enforced by the scheduler
    re-arming this function). A student is skipped once they have responded
    (confirmed or declined) or once they have already received the configured
    number of reminders.

    Returns ``{"sent": <int>, "more_due": <bool>}`` where ``more_due`` is True
    iff at least one student still has NOT responded AND has received fewer than
    ``reminderCount`` reminders after this round (i.e. the scheduler should
    re-arm another reminder pass).

    Pass ``now`` in tests to control the current time without waiting for real time to pass.
    """
    from padel_app.models import Coach

    from flask import current_app, has_app_context
    _log = current_app.logger if has_app_context() else None

    _now = now or utcnow_naive()
    _no_send = {"sent": 0, "more_due": False, "blocked": []}

    instance = LessonInstance.query.get(instance_id)
    if not instance:
        if _log:
            _log.warning("send_class_reminders: instance %s not found — skipping", instance_id)
        return _no_send
    if instance.status in ("canceled", "completed"):
        if _log:
            _log.info("send_class_reminders: instance %s status=%s — skipping", instance_id, instance.status)
        return _no_send
    # PAD-256 (notifications.reminders rule 15): the class time is wall-clock.
    if instance.start_datetime <= utc_to_wall_naive(_now):
        if _log:
            _log.info("send_class_reminders: instance %s start_datetime in the past — skipping", instance_id)
        return _no_send

    player_count = len(list(instance.presences))  # PAD-259
    if _log:
        _log.info(
            "send_class_reminders: instance=%s start=%s players=%d — sending",
            instance_id, instance.start_datetime, player_count,
        )

    if player_count == 0:
        if _log:
            _log.info("send_class_reminders: instance %s has no enrolled players — nothing to send", instance_id)
        return _no_send

    # Find the coach for this instance
    coach_rel = Association_CoachLessonInstance.query.filter_by(
        lesson_instance_id=instance_id
    ).first()
    if not coach_rel:
        if _log:
            _log.warning("send_class_reminders: instance %s has no coach association — skipping", instance_id)
        return _no_send

    coach = Coach.query.get(coach_rel.coach_id)
    if not coach:
        return _no_send

    coach_user_id = coach.user_id
    config = get_or_create_config(coach.id)
    locale = _resolve_locale(coach)
    templates = config.get_message_templates(locale)
    reminder_count = config.get_reminder_count()

    level_code = effective_level_code(instance)
    weekday = _format_weekday(instance.start_datetime, locale)
    time_str = instance.start_datetime.strftime("%H:%M") if instance.start_datetime else ""

    from padel_app.models import Message, Player

    sent_this_round = 0
    more_due = False

    # PAD-107 + PAD-112: two independent reasons a student is skipped for this
    # class's reminders — they marked themselves unavailable for the slot
    # (PAD-107), or they blocked ALL notifications (PAD-112). Both apply. A
    # student hit by both appears once, carrying the PAD-112 entry, because that
    # reason is the student's own coach-visible words; an availability blocker's
    # details stay private.
    #
    # Only the "all" preference level reaches this far — blocking just the
    # automatic or manual INVITATIONS leaves reminders alone, because a reminder
    # is about a class they are already enrolled in, not an invitation to a new
    # one.
    #
    # Everyone else in the class is still reminded: one silenced student must
    # not silence the whole class. Skipped students are reported so the coach
    # knows the count is deliberately short.
    from padel_app.services.student_availability_service import (
        blocked_players_for_instance,
    )
    from padel_app.services.student_notification_preferences import (
        preference_blocked_players,
    )
    _blocked_by_id = {
        entry["playerId"]: entry
        for entry in blocked_players_for_instance(instance)
    }
    for entry in preference_blocked_players(
        [p.player_id for p in instance.presences], kind="all",
    ):
        _blocked_by_id[entry["playerId"]] = entry
    blocked = list(_blocked_by_id.values())
    blocked_ids = set(_blocked_by_id)
    if blocked and _log:
        _log.info(
            "send_class_reminders: instance %s — skipping %d student(s) who are "
            "unavailable for this slot or blocked notifications (PAD-107/PAD-112)",
            instance_id, len(blocked),
        )

    # PAD-259: the presence rows ARE the roster; nothing is created here.
    for existing_presence in list(instance.presences):
        player_id = existing_presence.player_id
        if int(player_id) in blocked_ids:
            continue
        player_user_id = _user_id_for_player(player_id)
        if not player_user_id or not coach_user_id:
            continue

        # Stop reminding a student as soon as they have responded.
        # Both "yes" and "no" responses set ``confirmed`` (see respond_to_reminder).
        if existing_presence.confirmed:
            continue

        # Count reminders already sent to THIS player for THIS instance —
        # notifications.reminders rule 14 (PAD-207): the reminder_attempts
        # table is the source of truth, not a scan of the conversation.
        from padel_app.services import reminder_attempt_service as attempts

        sent_count = attempts.count_attempts(instance_id, player_id)

        if sent_count >= reminder_count:
            continue

        player = Player.query.get(player_id)
        player_name = (player.user.name if player and player.user else "there").split()[0]

        template_key = "reminder_followup" if sent_count > 0 else "reminder"
        text = _format_template(
            resolve_message_template(templates, template_key, locale),
            name=player_name,
            level=level_code,
            weekday=weekday,
            time=time_str,
        )

        # PAD-49: Supersede older un-actioned reminders for THIS (player, instance)
        # before sending the new one. Only the latest reminder should stay
        # actionable; older reminders the student never responded to are marked
        # superseded so the frontend renders them disabled/"expired". Reminders the
        # player already responded to are left untouched (they keep their badge).
        from padel_app.serializers.message import serialize_message
        for attempt in attempts.pending_attempts(instance_id, player_id):
            changed = attempts.mark_superseded(attempt)
            if changed is not None:
                publish(
                    {"type": "message_edited", "payload": serialize_message(changed, None)},
                    message_recipient_ids(changed),
                )

        sent_msg = _send_system_message(
            coach_user_id=coach_user_id,
            player_user_id=player_user_id,
            text=text,
            message_type="notification_reminder",
            msg_metadata={
                "lessonInstanceId": instance_id,
                "instanceId": instance_id,
                "reminderNumber": sent_count + 1,
                "responded": False,
                # ISO start time so the student UI can offer "Cancel attendance"
                # only before the class starts (PAD-35).
                "startsAt": (
                    instance.start_datetime.isoformat()
                    if instance.start_datetime is not None
                    else None
                ),
            },
        )
        # Rule 14: the row is the record; the message stays the delivery.
        attempts.record_attempt(
            message=sent_msg,
            instance_id=instance_id,
            player_id=player_id,
            presence_id=existing_presence.id,
            number=sent_count + 1,
            sent_at=now,
        )
        sent_this_round += 1

        # If this student still has reminders remaining, the scheduler must re-arm.
        if (sent_count + 1) < reminder_count:
            more_due = True

    return {"sent": sent_this_round, "more_due": more_due, "blocked": blocked}


def _expire_stale_reminders(instance: LessonInstance, player_user_id: int) -> None:
    """Flag every un-actioned reminder for (player, instance) as expired.

    PAD-68: PAD-49 only supersedes older reminders when a *newer* one is sent, so
    the last reminder of a series stays actionable forever. Once the class is
    over there will never be a newer reminder, so nothing ever retires it. This
    retires them explicitly — reusing the existing ``superseded`` flag the UI
    already renders as "reminder expired", so no client change is required for
    the flag to take effect.
    """
    from padel_app.models import Coach, Message
    from padel_app.serializers.message import serialize_message

    coach_rel = Association_CoachLessonInstance.query.filter_by(
        lesson_instance_id=instance.id
    ).first()
    coach = Coach.query.get(coach_rel.coach_id) if coach_rel else None
    if not coach or not coach.user_id:
        return

    # Rule 14 (PAD-207): the pending reminders come from reminder_attempts;
    # the message metadata is mirrored so the clients see the same flags.
    from padel_app.models import Player
    from padel_app.services import reminder_attempt_service as attempts

    player = Player.query.filter_by(user_id=player_user_id).first()
    if player is None:
        return
    for attempt in attempts.pending_attempts(instance.id, player.id):
        changed = attempts.mark_superseded(attempt, expired=True)
        if changed is not None:
            publish(
                {"type": "message_edited", "payload": serialize_message(changed, None)},
                message_recipient_ids(changed),
            )


def _retire_invite_message(event: NotificationEvent) -> None:
    """Flag the conversation message that delivered ``event`` as no longer live.

    PAD-68: reuses the ``responded`` flag the invite bubble already keys off, so
    the Yes/No buttons stop rendering on both web and mobile with no client
    change. ``response`` is set to ``"expired"`` — neither "yes" nor "no" — which
    both clients already fall through to a neutral non-actionable badge.
    """
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message

    if not event.message_id:
        return
    msg = Message.query.get(event.message_id)
    if msg is None or msg.msg_metadata is None:
        return
    if msg.msg_metadata.get("responded"):
        return
    msg.msg_metadata = {**msg.msg_metadata, "responded": True, "response": "expired"}
    msg.save()
    publish(
        {"type": "message_edited", "payload": serialize_message(msg, None)},
        message_recipient_ids(msg),
    )


def _expire_stale_invitations(instance: LessonInstance) -> int:
    """Retire every un-actioned invitation for a class that is already over.

    PAD-68 follow-up: the first pass retired stale *reminders* but pending
    *invitations* stayed live — a student could still tap "yes" on an invite for
    a class that already happened. This moves every NotificationEvent still in
    ``sent``/``queued`` to the existing terminal ``expired`` status, flags the
    invite message so the client stops offering buttons, and closes any vacancy
    that is still open (nothing can fill a class that already happened).

    Idempotent: a second call finds nothing in ``sent``/``queued`` and nothing
    un-``responded``, so repeated taps are no-ops.

    Callers must have already established that the class is over via
    ``_instance_is_over`` — there is deliberately only one staleness rule.
    """
    pending = NotificationEvent.query.filter(
        NotificationEvent.lesson_instance_id == instance.id,
        NotificationEvent.status.in_(("sent",)),
    ).all()

    for event in pending:
        event.status = "expired"
        event.save()
        _retire_invite_message(event)

    open_vacancies = Vacancy.query.filter_by(
        lesson_instance_id=instance.id, status="open"
    ).all()
    for vacancy in open_vacancies:
        vacancy.status = "expired"
        vacancy.save()

    return len(pending)


def expire_stale_invitations(*, now: datetime | None = None) -> int:
    """Sweep every class that is over and retire its still-pending invitations.

    PAD-68 follow-up: the lazy guards only fire when *someone responds*. An
    invitation nobody ever answers — the common case for a class that quietly
    passed — would stay live forever. This sweep runs from the existing
    two-minute ``process_batches`` APScheduler job so stale invites are retired
    without requiring any user action.

    Returns the number of NotificationEvent rows retired.
    """
    _now = now or utcnow_naive()

    instance_ids = [
        row[0]
        for row in NotificationEvent.query
        .with_entities(NotificationEvent.lesson_instance_id)
        .filter(NotificationEvent.status.in_(("sent",)))
        .distinct()
        .all()
    ]

    retired = 0
    for instance_id in instance_ids:
        instance = LessonInstance.query.get(instance_id)
        if instance is None:
            continue
        if not _instance_is_over(instance, _now):
            continue
        retired += _expire_stale_invitations(instance)
    return retired


# ---------------------------------------------------------------------------
# Reminder response idempotency (PAD-94)
# ---------------------------------------------------------------------------

# The state name each raw button action is reported as.
_RESPONSE_STATE = {"yes": "confirmed", "no": "declined"}


def _pending_reminder_message(
    coach_user_id: int | None,
    player_user_id: int,
    lesson_instance_id: int,
):
    """The newest reminder message for this (player, instance) still awaiting an
    answer, or ``None``.

    ``None`` means there is no live question on screen: either the player never
    got a reminder, or every reminder they got is already actioned/superseded.
    Combined with :func:`_recorded_reminder_action` that is what distinguishes a
    repeat tap on an already-answered reminder (PAD-94) from a fresh answer to a
    newer reminder (PAD-49 rule 9), which must always be processed.
    """
    if not coach_user_id:
        return None
    # Rule 14 (PAD-207): reminder_attempts decides what is pending.
    from padel_app.models import Player
    from padel_app.services import reminder_attempt_service as attempts

    player = Player.query.filter_by(user_id=player_user_id).first()
    if player is None:
        return None
    return attempts.latest_pending_message(lesson_instance_id, player.id)


def _mark_answered_message_read(message, user_id: int) -> None:
    """Answering is reading (notifications.reminders rule 13, PAD-202).

    A reminder or invite can be answered from the student dashboard without the
    chat ever being opened. A fresh answer advances the player's read marker in
    that conversation to *now* — never backwards — so the question, everything
    before it, and the system message acknowledging the answer (born a moment
    earlier, the echo of the player's own action) all stop counting as unread.
    Anything sent after the answer still does. Call it after the
    acknowledgement has been sent.
    """
    if message is None:
        return
    from padel_app.models import ConversationParticipant

    participation = ConversationParticipant.query.filter_by(
        conversation_id=message.conversation_id, user_id=user_id
    ).first()
    if participation is None:
        return
    stamp = utcnow_naive()
    if participation.last_read_at is None or participation.last_read_at < stamp:
        participation.last_read_at = stamp
        participation.save()


def _recorded_reminder_action(presence: "Presence | None") -> str | None:
    """The reminder answer currently durably recorded on ``presence``.

    Returns ``"no"``, ``"yes"`` or ``None`` (nothing recorded / the coach has
    since overwritten the row with an attendance decision of their own, in which
    case we deliberately do NOT claim an answer is on record).

    Mirrors exactly what the two response paths write:
    ``_free_spot_for_declining_player`` sets ``status="absent"`` +
    ``justification="justified"``, and the confirm branch sets ``confirmed``
    while leaving ``status`` alone for the coach to fill in.
    """
    if presence is None:
        return None
    if presence.status == "absent" and presence.justification == "justified":
        return "no"
    if presence.confirmed and presence.status is None:
        return "yes"
    return None


def _vacancy_has_live_invitations(vacancy: "Vacancy | None") -> bool:
    """True when this vacancy already has invitations out that are still in play.

    PAD-94 belt-and-braces: even if some other caller re-enters the decline path
    for a spot that is already being filled, re-driving the invitation engine
    would only duplicate messages already sitting in candidates' inboxes.
    """
    if vacancy is None:
        return False
    return NotificationEvent.query.filter(
        NotificationEvent.vacancy_id == vacancy.id,
        NotificationEvent.status.in_(["sent", "confirmed"]),
    ).count() > 0


def _player_enrolled_in_instance(player_id: int, instance: LessonInstance) -> bool:
    """A Presence on the occurrence (the enrolment, PAD-259) or lesson-level
    enrolment (a recurring series the student belongs to)."""
    from padel_app.models import Association_PlayerLesson

    if Presence.query.filter_by(
        player_id=player_id, lesson_instance_id=instance.id
    ).first() is not None:
        return True
    return Association_PlayerLesson.query.filter_by(
        player_id=player_id, lesson_id=instance.lesson_id
    ).first() is not None


def respond_to_reminder(
    lesson_instance_id: int,
    action: str,
    acting_user_id: int,
    *,
    now: datetime | None = None,
) -> dict:
    """
    Called when a player presses Yes or No on a reminder message.
    action: "yes" | "no"

    PAD-68: a reminder for a class that has already started (or was
    canceled/completed) is *expired*. Responding to it is a no-op: the answer is
    not recorded against attendance and it never creates a vacancy or fans out
    replacement invitations for a class that already happened. The stale
    reminder message is flagged so the UI stops offering Yes/No.
    """
    from padel_app.models import Coach, Player

    instance = LessonInstance.query.get_or_404(lesson_instance_id)

    player = Player.query.filter_by(user_id=acting_user_id).first()
    if not player:
        from flask import abort
        abort(403)

    # PAD-258 / audit H4 — notifications.reminders rule 17: only a student who
    # is IN this class may answer. Before this, any student could "decline"
    # any class: a stray absent Presence was created below, which lowered
    # effective_filled_spots, opened a phantom Vacancy and fanned out
    # replacement invitations for a spot that was never theirs.
    if not _player_enrolled_in_instance(player.id, instance):
        from flask import abort
        abort(403, "Not enrolled in this class")

    _now = now or utcnow_naive()
    if _instance_is_over(instance, _now):
        _expire_stale_reminders(instance, acting_user_id)
        # The class is over for everyone, not just this student: retire any
        # invitation still offering a spot in it.
        _expire_stale_invitations(instance)
        return {"action": "expired"}

    presence = Presence.query.filter_by(
        player_id=player.id,
        lesson_instance_id=lesson_instance_id,
    ).first()
    if presence is None:
        # PAD-259 (classes.instance-enrollment rule 7, owner decision 2026-09-11):
        # the student was taken off this date after the reminder went out and
        # is still on the series roster (that is how they passed the guard).
        # PAD-69's intent stands — the answer is never silently lost — but
        # "recorded" now means: on the reminder attempt, so the bubble settles
        # and no follow-up fires. It never puts them back in the class and never
        # opens a spot that was not theirs.
        from padel_app.serializers.message import serialize_message
        from padel_app.services import reminder_attempt_service as attempts

        attempt = attempts.latest_attempt(lesson_instance_id, player.id)
        if attempt is not None:
            edited = attempts.mark_responded(attempt, "not_enrolled", when=now)
            if edited is not None:
                publish(
                    {"type": "message_edited", "payload": serialize_message(edited, None)},
                    message_recipient_ids(edited),
                )
        else:
            # Only a reminder message older than PAD-207's attempt table lands
            # here; say so, because "never silently lost" is the PAD-69 promise.
            from flask import current_app, has_app_context

            if has_app_context():
                current_app.logger.info(
                    "respond_to_reminder: no presence and no reminder attempt for player %s "
                    "on instance %s — answer not recorded (pre-PAD-207 message)",
                    player.id, lesson_instance_id,
                )
        return {"action": "not_enrolled"}

    coach_rel = Association_CoachLessonInstance.query.filter_by(
        lesson_instance_id=lesson_instance_id
    ).first()
    coach = Coach.query.get(coach_rel.coach_id) if coach_rel else None
    coach_user_id = coach.user_id if coach else None

    config = get_or_create_config(coach.id) if coach else None
    locale = _resolve_locale(coach)
    templates = (
        config.get_message_templates(locale)
        if config
        else dict(default_templates_for_locale(locale))
    )

    # The newest reminder for this (player, instance) that is still awaiting an
    # answer, if any. ``None`` means every reminder they were sent has already
    # been actioned (or superseded) — the signal that a repeat tap is a repeat.
    reminder_msg = _pending_reminder_message(
        coach_user_id, acting_user_id, lesson_instance_id
    )

    # PAD-94: responding is idempotent. A student whose reminder bubble does not
    # visibly settle taps Yes/No again — in production one student tapped "No"
    # eight times in 62 seconds, which sent eight `reminder_declined` messages
    # and re-drove the invitation engine eight times, spamming the same two
    # replacement candidates. Re-submitting the answer ALREADY on record is a
    # no-op that reports what is recorded; changing the answer still goes
    # through, and a genuinely new reminder (PAD-49) is always answerable.
    if reminder_msg is None and _recorded_reminder_action(presence) == action:
        return {"action": _RESPONSE_STATE.get(action, "unknown"), "duplicate": True}

    # Mark the reminder as responded — on its reminder_attempts row (rule 14),
    # mirrored onto the message so the frontend shows the badge on reload.
    if reminder_msg is not None:
        from padel_app.models import ReminderAttempt
        from padel_app.serializers.message import serialize_message
        from padel_app.services import reminder_attempt_service as attempts

        attempt = ReminderAttempt.query.filter_by(message_id=reminder_msg.id).first()
        if attempt is not None:
            attempts.mark_responded(attempt, action, when=now)
        else:
            reminder_msg.msg_metadata = {**reminder_msg.msg_metadata, "responded": True, "response": action}
            reminder_msg.save()
        publish(
            {"type": "message_edited", "payload": serialize_message(reminder_msg, None)},
            message_recipient_ids(reminder_msg),
        )

    if action == "yes":
        if presence:
            presence.confirmed = True
            # status intentionally not set — only the coach marks someone as present
            # PAD-271 M5: the answer as one field (attendance.presence rule 7).
            record_response(presence, "confirmed", when=now)
            presence.save()
        if coach_user_id:
            _send_system_message(
                coach_user_id,
                acting_user_id,
                resolve_message_template(templates, "reminder_confirmed", locale),
                class_instance_id=instance.id,
            )
        # Rule 13: the answer may have come from the dashboard — count it as read.
        _mark_answered_message_read(reminder_msg, acting_user_id)
        return {"action": "confirmed"}

    elif action == "no":
        if presence:
            record_response(presence, "declined", when=now)  # PAD-271 M5
        _free_spot_for_declining_player(
            instance,
            presence,
            player,
            coach,
            coach_user_id,
            acting_user_id,
            config,
            templates,
            locale=locale,
            now=now,
        )
        _mark_answered_message_read(reminder_msg, acting_user_id)
        return {"action": "declined"}

    return {"action": "unknown"}


def _free_spot_for_declining_player(
    instance: LessonInstance,
    presence: "Presence | None",
    player,
    coach,
    coach_user_id: int | None,
    acting_user_id: int,
    config,
    templates: dict,
    *,
    locale: str | None = None,
    now: datetime | None = None,
) -> None:
    """Revert a player to "not attending" and free their spot.

    This is the single shared path used both when a player declines a reminder
    (``respond_to_reminder`` with action ``no``) and when a player cancels a
    previously-confirmed attendance (``cancel_attendance``). It reuses the exact
    same vacancy-creation and invitation-engine logic — cancellation is NOT a
    separate fork.
    """
    if presence:
        presence.confirmed = True
        presence.status = "absent"
        presence.justification = "justified"
        presence.save()
    if coach_user_id:
        _send_system_message(
            coach_user_id,
            acting_user_id,
            resolve_message_template(templates, "reminder_declined", locale),
            class_instance_id=instance.id,
        )

    # Always pre-create vacancy so the invite_start job finds it when window opens.
    # If the invitation window is already open, trigger invitations immediately.
    if coach and config:
        from padel_app.scheduler import _compute_invite_start_dt
        vacancy = _ensure_vacancy_for_player(instance, coach.id, player.id)
        if _is_semi_auto(config):
            # Semi-automatic: ask the coach for approval instead of sending.
            # No invitations are sent until the coach approves the prompt.
            if vacancy is not None and vacancy.approval_status == "pending":
                from padel_app.services.replacement_approval_service import (
                    create_approval_prompts,
                )
                create_approval_prompts(
                    [vacancy], instance, coach.id, config, now=now
                )
        else:
            # PAD-94: if this exact spot already has invitations in flight, the
            # engine has nothing new to do — re-driving it would just re-send
            # them. Normal first declines create a brand-new vacancy with zero
            # events, so this never suppresses a real fan-out.
            if _vacancy_has_live_invitations(vacancy):
                return
            invite_start_dt = _compute_invite_start_dt(instance, config.get_invitation_start_timing())
            _now = now or utcnow_naive()
            if invite_start_dt is None or _now >= invite_start_dt:
                trigger_invitations(instance, coach.id)
            elif vacancy is not None:
                # PAD-73: the vacancy opens IMMEDIATELY, but inviting other
                # students must still wait for the coach's configured
                # "iniciar convites" instant — even when the decline lands days
                # earlier than that.
                #
                # Skipping `trigger_invitations` above is not enough on its own:
                # `process_invitation_batches` runs every two minutes over every
                # open vacancy and fires a batch as soon as it sees one with
                # `last_activity_at is None`. It only holds off for a vacancy
                # that carries `invite_not_before`. Without stamping it here, a
                # decline 10 days out would have the engine inviting replacements
                # within two minutes — exactly the behaviour this ticket rules
                # out. `invite_not_before` is the field the batch processor and
                # `_send_invitation_batch` already honour (the semi-automatic
                # approval path stamps it for the same reason), so this makes the
                # timing guarantee hold on every path rather than just this one.
                vacancy.invite_not_before = invite_start_dt
                vacancy.save()


def proactive_decline_deadline(
    instance: LessonInstance,
    config=None,
) -> "datetime | None":
    """PAD-73 — the instant the proactive-decline window closes.

    A decline is "proactive" when the student volunteers it *before they would
    normally have been asked to confirm*. That moment is precisely when the
    attendance reminder for this instance would fire, so the cutoff is DERIVED
    from the very same input the scheduler uses to arm the reminder job —
    ``config.get_reminder_timing()`` fed through ``_fire_time_utc`` (PAD-256) — and
    is never a hardcoded interval. Change the coach's reminder timing and this
    cutoff moves with it, automatically and in lockstep with the real reminder.

    Returns ``None`` when no instant is computable (no start time, or a timing
    shape ``_fire_time_utc`` doesn't understand). Callers treat ``None`` as
    "there is no proactive window", which keeps the pre-PAD-73 behaviour intact.
    """
    if instance is None or instance.start_datetime is None:
        return None

    from padel_app.models.notification_config import (
        DEFAULT_REMINDER_TIMING,
        NotificationConfig,
    )
    from padel_app.scheduler import _fire_time_utc

    _config = config
    if _config is None:
        # Deliberately a plain query, NOT ``get_or_create_config``: this helper
        # is called from the class-instance serializer on a read path, and a GET
        # must not write a NotificationConfig row as a side effect.
        coach_rel = Association_CoachLessonInstance.query.filter_by(
            lesson_instance_id=instance.id
        ).first()
        if coach_rel is not None:
            _config = NotificationConfig.query.filter_by(
                coach_id=coach_rel.coach_id
            ).first()

    timing = (
        _config.get_reminder_timing() if _config is not None
        else DEFAULT_REMINDER_TIMING
    )
    return _fire_time_utc(instance.start_datetime, timing)


def proactive_decline_window_is_open(
    instance: LessonInstance,
    config=None,
    *,
    now: datetime | None = None,
) -> bool:
    """True while a decline for ``instance`` would still count as proactive.

    Single source of truth for BOTH the ``cancel_attendance`` classification and
    the ``canDeclineProactively`` flag in the class-instance payload, so the UI
    can never offer the proactive action at a moment the server would classify
    differently.
    """
    deadline = proactive_decline_deadline(instance, config)
    if deadline is None:
        return False
    return (now or utcnow_naive()) < deadline


def _resolve_occurrence_for_student(player, model, original_id, date):
    """attendance.confirm rule 18: the occurrence a student's cancel targets,
    from the calendar event's (model, originalId, date). A Lesson occurrence
    with no row is authorised on the series roster FIRST, then materialised.
    Returns the instance, or aborts (400/403/404/409) having written nothing."""
    from flask import abort
    from padel_app.models import Association_PlayerLesson
    from padel_app.services.lesson_service import get_or_materialize_instance, parse_event_target
    from padel_app.tools.calendar_tools import expand_occurrences

    kind, target, occ_date = parse_event_target(model, original_id, date)
    if kind == "lessoninstance":
        return target
    lesson = target

    on_roster = Association_PlayerLesson.query.filter_by(
        player_id=player.id, lesson_id=lesson.id
    ).first() is not None
    if not on_roster:
        abort(403, description="You are not enrolled in this class.")

    day_start = datetime.combine(occ_date, time.min)
    day_end = day_start + timedelta(days=1)
    produced = [
        occ for occ in expand_occurrences(
            lesson.start_datetime, lesson.recurrence_rule, lesson.recurrence_end, day_start, day_end
        )
        if occ.date() == occ_date
    ]
    if not produced:
        abort(404, description="No class on that date.")
    occ_start = produced[0].replace(tzinfo=None)
    if utc_to_wall_naive(utcnow_naive()) >= occ_start:
        abort(409, description="Class has already started; attendance can no longer be cancelled.")
    return get_or_materialize_instance(lesson, occ_date)


def cancel_attendance(
    acting_user_id: int,
    *,
    lesson_instance_id: int | None = None,
    model: str | None = None,
    original_id=None,
    date=None,
    now: datetime | None = None,
) -> dict:
    """Cancel a previously-confirmed attendance for the acting player.

    Allowed only BEFORE the class start time. Reverts the player to
    "not attending" and frees the spot, reusing the exact same engine path as a
    reminder decline. After the class has started, raises 409.

    Cancellations at or after the coach's configured cancellation deadline
    (``cancellationDeadlineHours`` before start, default 24) are still allowed
    and still free the spot, but flag the Presence with ``late_cancellation``.

    PAD-73 — this is ALSO the proactive-decline path. There is deliberately no
    second endpoint: the server classifies the decline itself from its own clock
    (``proactive_decline_window_is_open``) and reports which kind it was in the
    ``proactive`` key of the response. A stale client therefore cannot mislabel
    a decline, and there is exactly one place where enrolment is authorized.
    """
    from flask import abort
    from padel_app.models import Coach, Player

    player = Player.query.filter_by(user_id=acting_user_id).first()
    if not player:
        abort(403)

    if lesson_instance_id is None:
        # PAD-288 / PAD-282 (attendance.confirm rule 18): the calendar event's
        # (model, originalId, date). Authorised on the series roster before
        # anything is materialised.
        instance = _resolve_occurrence_for_student(player, model, original_id, date)
        lesson_instance_id = instance.id
    else:
        instance = LessonInstance.query.get_or_404(lesson_instance_id)

    _now = now or utcnow_naive()
    # PAD-256 (attendance.confirm rule 9): "started" is judged on the club's clock.
    if instance.start_datetime is not None and utc_to_wall_naive(_now) >= instance.start_datetime:
        abort(409, description="Class has already started; attendance can no longer be cancelled.")

    # PAD-73 / PAD-88 / PAD-115 / PAD-259: authorize on ENROLMENT — since PAD-259
    # that is the presence row itself (attendance.confirm rule 14). A student may
    # only decline their OWN place in a class they are actually in.
    presence = Presence.query.filter_by(
        player_id=player.id,
        lesson_instance_id=lesson_instance_id,
    ).first()
    if presence is None:
        abort(403, description="You are not enrolled in this class.")

    coach_rel = Association_CoachLessonInstance.query.filter_by(
        lesson_instance_id=lesson_instance_id
    ).first()
    coach = Coach.query.get(coach_rel.coach_id) if coach_rel else None
    coach_user_id = coach.user_id if coach else None

    config = get_or_create_config(coach.id) if coach else None
    locale = _resolve_locale(coach)
    templates = (
        config.get_message_templates(locale)
        if config
        else dict(default_templates_for_locale(locale))
    )

    # PAD-73: is this a PROACTIVE decline? The window closes at the instant the
    # attendance reminder would fire, derived from the coach's reminder timing.
    is_proactive = proactive_decline_window_is_open(instance, config, now=_now)

    # Flag late cancellations: at/after the deadline (start - cancellationDeadlineHours)
    # but still before start. The spot is freed either way.
    is_late = False
    if presence is not None:
        from padel_app.models.notification_config import (
            DEFAULT_CANCELLATION_DEADLINE_HOURS,
        )
        deadline_hours = (
            config.get_cancellation_deadline_hours()
            if config
            else DEFAULT_CANCELLATION_DEADLINE_HOURS
        )
        if instance.start_datetime is not None:
            # PAD-256 (attendance.confirm rule 6): N real hours before the real start.
            deadline = wall_to_utc_naive(instance.start_datetime) - timedelta(hours=deadline_hours)
            is_late = _now >= deadline
        # PAD-73: a proactive decline is never late. This only bites when a coach
        # configures a first reminder that fires AFTER their own cancellation
        # deadline (e.g. remind 12h before, deadline 24h before) — telling the
        # coach at the earliest moment the system ever expected an answer cannot
        # sensibly be penalised as a late cancellation.
        if is_proactive:
            is_late = False
        # PAD-271 M5: stored as the answer; lateness is derived on read from
        # responded_at against the same deadline (presence_late_cancellation).
        record_response(presence, "proactive_decline" if is_proactive else "cancelled", when=_now)

    # PAD-44: notify the COACH of the cancellation exactly once, flagging late
    # cancellations. This is emitted HERE (not in the shared
    # _free_spot_for_declining_player) because cancel_attendance is the only path
    # that computes lateness — keeping a single emission point avoids duplicates and
    # a false "late" flag on plain reminder declines.
    if coach_user_id:
        _notify_coach_of_cancellation(
            coach_user_id,
            acting_user_id,
            instance,
            player,
            is_late=is_late,
            is_proactive=is_proactive,
            locale=locale,
        )

    # Mark the most recent reminder message as responded ("no") so the UI reflects
    # the cancellation on reload, mirroring respond_to_reminder.
    if coach_user_id:
        from padel_app.serializers.message import serialize_message
        from padel_app.services import reminder_attempt_service as attempts

        # Rule 14 (PAD-207): the latest reminder row for this player/instance.
        attempt = attempts.latest_attempt(lesson_instance_id, player.id)
        reminder_msg = attempts.mark_responded(attempt, "no", when=now) if attempt is not None else None
        if reminder_msg is not None:
            publish(
                {"type": "message_edited", "payload": serialize_message(reminder_msg, None)},
                message_recipient_ids(reminder_msg),
            )

    _free_spot_for_declining_player(
        instance,
        presence,
        player,
        coach,
        coach_user_id,
        acting_user_id,
        config,
        templates,
        locale=locale,
        now=now,
    )
    # PAD-73: the caller is told which kind of decline this was so the UI can
    # confirm it accurately without re-deriving the cutoff client-side.
    return {"action": "declined", "proactive": is_proactive}


def _trigger_vacancy_for_player(
    instance: LessonInstance,
    coach_id: int,
    player_id: int,
) -> None:
    """Create a vacancy for a player who declined and immediately trigger invitations."""
    # Avoid duplicate vacancies for the same departing player
    existing = Vacancy.query.filter_by(
        lesson_instance_id=instance.id,
        original_player_id=player_id,
        status="open",
    ).first()
    if not existing:
        _create_vacancy_for_absent_player(instance, coach_id, player_id)
    trigger_invitations(instance, coach_id)


def _ensure_vacancy_for_player(
    instance: LessonInstance,
    coach_id: int,
    player_id: int,
) -> Vacancy:
    """Create a vacancy for an absent player without triggering invitations.
    Used when the invitation window hasn't opened yet — the invite_start scheduler
    job will call trigger_invitations when the window opens.
    Returns the existing or newly created vacancy."""
    existing = Vacancy.query.filter_by(
        lesson_instance_id=instance.id,
        original_player_id=player_id,
        status="open",
    ).first()
    if existing:
        return existing
    return _create_vacancy_for_absent_player(instance, coach_id, player_id)


# ---------------------------------------------------------------------------
# Invitation batch helpers
# ---------------------------------------------------------------------------

def _send_invitation_batch(
    vacancy: Vacancy,
    instance: LessonInstance,
    config: NotificationConfig,
    coach_id: int,
    max_sim_override: int | None = None,
    *,
    now: datetime | None = None,
) -> list[dict]:
    """
    Send the next batch of invitations for this vacancy.
    Returns list of {id, name} for players notified.

    PAD-68: this is the single chokepoint every automatic invitation message
    flows through. A class that has already started can never be filled, so the
    vacancy is expired here instead of inviting anyone — this backstops every
    caller (trigger_invitations, process_invitation_batches, _advance_round,
    _send_next_on_decline) including late responses to stale messages.
    """
    from padel_app.models import Coach, Player

    if _instance_is_over(instance, now):
        if vacancy.status == "open":
            vacancy.status = "expired"
            vacancy.save()
        return []

    # Check waiting list before doing a fresh invite round
    wl_entry = _check_waiting_list(vacancy, instance, coach_id, config, vacancy.current_round_number)
    if wl_entry:
        if _fill_from_waiting_list(wl_entry, vacancy, instance, coach_id, config, now=now):
            return [{"id": str(wl_entry.player_id), "name": "waiting_list"}]
        # PAD-261: another path won the spot, or the class is full. Invite nobody.
        return []

    eligible = _get_eligible_students_for_group(vacancy, instance, coach_id, config, vacancy.current_round_number)

    if not eligible:
        # PAD-87 / notifications.invitations rule 3c: an empty round advances
        # the counter and STOPS. It used to call _advance_round, which sends
        # the next round synchronously, so eight groups of which seven were
        # empty notified the eighth in the same call as the trigger — the
        # "everyone was notified immediately" of PAD-70. The next round goes
        # out on the next process_invitation_batches tick, one round per tick.
        _defer_next_round(vacancy, config, now=now)
        return []

    restrictions = config.get_restrictions()

    # Determine batch size
    if max_sim_override is not None:
        batch_size = max_sim_override
    else:
        max_sim = restrictions.get("maxSimultaneous", {})
        batch_size = max_sim["value"] if max_sim.get("enabled") else len(eligible)

    # Respect maxTotal across ALL vacancies for this instance
    max_total = restrictions.get("maxTotal", {})
    if max_total.get("enabled"):
        already_sent = NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == instance.id,
            NotificationEvent.status.in_(["sent", "confirmed"]),
        ).count()
        remaining_budget = max_total["value"] - already_sent
        if remaining_budget <= 0:
            return []
        batch_size = min(batch_size, remaining_budget)

    coach_obj = Coach.query.get(coach_id)
    coach_user_id = coach_obj.user_id if coach_obj else None
    locale = _resolve_locale(coach_obj)
    templates = config.get_message_templates(locale)
    level_code = effective_level_code(instance)
    weekday = _format_weekday(instance.start_datetime, locale)
    time_str = instance.start_datetime.strftime("%H:%M") if instance.start_datetime else ""

    notified = []
    for cp in eligible[:batch_size]:
        if not _check_per_student_daily_limit(cp.player_id, coach_id, restrictions):
            continue
        player_user_id = _user_id_for_player(cp.player_id)
        if not coach_user_id or not player_user_id:
            continue

        player = Player.query.get(cp.player_id)
        player_name = (player.user.name if player and player.user else "Player").split()[0]

        event = NotificationEvent(
            coach_id=coach_id,
            lesson_instance_id=instance.id,
            player_id=cp.player_id,
            vacancy_id=vacancy.id,
            type="auto",
            round_number=vacancy.current_round_number,
            status="sent",
        )
        event.create()

        text = _format_template(
            resolve_message_template(templates, "invite", locale),
            name=player_name,
            level=level_code,
            weekday=weekday,
            time=time_str,
        )
        msg = _send_system_message(
            coach_user_id=coach_user_id,
            player_user_id=player_user_id,
            text=text,
            message_type="notification_invite",
            msg_metadata={
                "notificationEventId": event.id,
                "lessonInstanceId": instance.id,
                "vacancyId": vacancy.id,
                "responded": False,
            },
        )
        # _send_system_message returns None only if the body came out empty
        # (PAD-67 backstop); the event still exists, just without a chat message.
        if msg is not None:
            event.message_id = msg.id
            event.save()

        notified.append({"id": str(cp.player_id), "name": player_name})

    vacancy.last_activity_at = utcnow_naive()
    vacancy.current_batch_number += 1
    vacancy.save()

    return notified


def _round_max_count(config: NotificationConfig) -> int:
    return len(config.get_invitation_groups())


def _defer_next_round(
    vacancy: Vacancy, config: NotificationConfig, *, now: datetime | None = None
) -> None:
    """PAD-87: the current round had nobody to invite. Advance the counter (or
    expire past the last round) and leave the sending to the next engine tick.
    `last_activity_at` is stamped so the tick's "fresh vacancy" branch does not
    re-send round 1; `_round_pending` is what makes the tick pick it up."""
    vacancy.current_round_number += 1
    vacancy.last_activity_at = now or utcnow_naive()
    if vacancy.current_round_number > _round_max_count(config):
        vacancy.status = "expired"
    vacancy.save()


def _round_pending(vacancy: Vacancy) -> bool:
    """True when the vacancy's current round was reached by `_defer_next_round`
    and has sent nothing yet (no NotificationEvent for that round)."""
    round_no = vacancy.current_round_number
    # A real row only: the schedule tests drive this tick with MagicMock
    # vacancies, and a mocked counter must fall through to the timer branch.
    if not isinstance(round_no, int) or round_no <= 1:
        return False
    return (
        NotificationEvent.query.filter_by(
            vacancy_id=vacancy.id, round_number=round_no
        ).count()
        == 0
    )


def _advance_round(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
) -> None:
    """Move vacancy to next round or expire it."""
    vacancy.current_round_number += 1
    vacancy.save()

    if vacancy.current_round_number > _round_max_count(config):
        vacancy.status = "expired"
        vacancy.save()
        return

    # Check waiting list for new round, then send fresh batch
    wl_entry = _check_waiting_list(vacancy, instance, coach_id, config, vacancy.current_round_number)
    if wl_entry:
        _fill_from_waiting_list(wl_entry, vacancy, instance, coach_id, config)
    else:
        _send_invitation_batch(vacancy, instance, config, coach_id)


def _send_next_on_decline(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
) -> None:
    """After a decline, immediately invite the next single eligible player."""
    _send_invitation_batch(vacancy, instance, config, coach_id, max_sim_override=1)


# ---------------------------------------------------------------------------
# Main invitation trigger
# ---------------------------------------------------------------------------

def _find_or_create_open_vacancies(instance: LessonInstance, coach_id: int) -> list[Vacancy]:
    """Find existing open vacancies for an instance or create new ones
    (from absent presences + structural open spots)."""
    open_vacancies = Vacancy.query.filter_by(
        lesson_instance_id=instance.id,
        status="open",
    ).all()

    if not open_vacancies:
        # Create vacancies from absent presences
        absent_ids = {
            p.player_id for p in instance.presences if p.status == "absent"
        }
        # Avoid duplicates — check which absent players already have vacancies
        existing_vacancy_player_ids = {
            v.original_player_id
            for v in Vacancy.query.filter_by(lesson_instance_id=instance.id).all()
            if v.original_player_id is not None
        }
        for player_id in absent_ids - existing_vacancy_player_ids:
            open_vacancies.append(_create_vacancy_for_absent_player(instance, coach_id, player_id))

        # Also create structural vacancies (spots never filled)
        open_vacancies.extend(_create_structural_vacancies(instance, coach_id))

    return open_vacancies


def trigger_invitations(
    instance: LessonInstance,
    coach_id: int,
    *,
    now: datetime | None = None,
) -> list[dict]:
    """
    Main entry point to start filling open spots.
    Finds or creates vacancies and sends the first invitation batch for each.
    Returns list of {id, name} for players notified in round 1.

    In semi-automatic mode, vacancies pending coach approval produce a
    replacement approval prompt instead of invitations; only "not_required"
    and "approved" vacancies are sent.

    Pass ``now`` in tests to control the current time without waiting for real time to pass.
    """
    config = get_or_create_config(coach_id)

    if not config.auto_notify_enabled:
        return []
    if not instance.notifications_enabled:
        return []
    # PAD-68: never open/refresh vacancies for a class that already happened.
    if _instance_is_over(instance, now):
        return []

    semi_auto = _is_semi_auto(config)
    open_vacancies: list[Vacancy] | None = None

    if semi_auto:
        # Restrictions gate SENDING, not asking — create the approval prompts
        # before the restrictions check so the coach is always asked exactly
        # once (the invite_start DateTrigger fires only once).
        open_vacancies = _find_or_create_open_vacancies(instance, coach_id)
        pending = [v for v in open_vacancies if v.approval_status == "pending"]
        if pending:
            from padel_app.services.replacement_approval_service import (
                create_approval_prompts,
            )
            create_approval_prompts(pending, instance, coach_id, config, now=now)

    restrictions = config.get_restrictions()
    if not _check_restrictions(instance, coach_id, restrictions, now=now):
        return []

    if open_vacancies is None:
        open_vacancies = _find_or_create_open_vacancies(instance, coach_id)

    if not open_vacancies:
        return []

    _now = now or utcnow_naive()
    sendable = [
        v for v in open_vacancies
        if v.approval_status in ("not_required", "approved")
        and (v.invite_not_before is None or _now >= v.invite_not_before)
    ]

    all_notified: list[dict] = []
    for vacancy in sendable:
        notified = _send_invitation_batch(vacancy, instance, config, coach_id, now=_now)
        all_notified.extend(notified)

    if all_notified:
        publish(
            {
                "type": "notify_sent",
                "payload": {
                    "lessonInstanceId": instance.id,
                    "count": len(all_notified),
                    "type": "auto",
                },
            },
            _coach_only(_user_id_for_coach(coach_id)),
        )

    return all_notified


# ---------------------------------------------------------------------------
# Recurring batch processor (called by APScheduler every 2 minutes)
# ---------------------------------------------------------------------------

def reconcile_vacancies(instance: LessonInstance, *, filled_by_player_id: int | None = None) -> list:
    """Close the open vacancies capacity no longer supports (PAD-271, invitations rule 13).

    A Vacancy is a promise that a spot is open; ``effective_filled_spots`` is the
    truth it follows. While the instance has more open vacancies than open spots,
    one is marked ``filled``: the enrolled player's own (``original_player_id``)
    first, else one with no live invitation, else the oldest. Its ``sent`` /
    ``queued`` invitations expire and their messages are retired. Never opens
    anything; a class that is over is left to the expiry path. Flushes inside a
    unit of work and commits outside one (PAD-272), so it composes with
    ``lesson_service.enrol``. Returns the vacancies it closed.
    """
    from padel_app.tools.unit_of_work import commit_or_flush

    if instance is None or _instance_is_over(instance):
        return []
    db.session.expire(instance, ["presences"])
    open_spots = max(0, (instance.max_players or 0) - _effective_filled_spots(instance))
    open_vacancies = (
        Vacancy.query.filter_by(lesson_instance_id=instance.id, status="open")
        .order_by(Vacancy.id.asc())
        .all()
    )
    closed = []
    while len(open_vacancies) > open_spots:
        pick = next(
            (v for v in open_vacancies
             if filled_by_player_id is not None and v.original_player_id == filled_by_player_id),
            None,
        ) or next((v for v in open_vacancies if not _vacancy_has_live_invitations(v)), None) \
          or open_vacancies[0]
        open_vacancies.remove(pick)
        pick.status = "filled"
        pick.filled_by_player_id = filled_by_player_id
        pick.filled_at = utcnow_naive()
        for event in NotificationEvent.query.filter(
            NotificationEvent.vacancy_id == pick.id,
            NotificationEvent.status.in_(("sent",)),
        ).all():
            event.status = "expired"
            _retire_invite_message(event)
        closed.append(pick)
    if closed:
        commit_or_flush()
    return closed


def process_invitation_batches(*, now: datetime | None = None) -> int:
    """
    For each open vacancy, check if enough time has passed since last activity.
    If so, send the next invitation batch.
    Returns count of vacancies where a batch was sent.

    Pass ``now`` in tests to control the current time without waiting for real time to pass.

    PAD-68 follow-up: this pass also retires invitations that are still pending
    for classes that already happened. It is hooked here rather than on a new
    APScheduler job because this is already the periodic notification-engine
    tick (every 2 minutes, ``process_batches``), so no new job registration or
    jobstore entry is needed, and the sweep must run whether or not the class
    still has an open vacancy.
    """
    _now = now or utcnow_naive()
    expire_stale_invitations(now=_now)
    open_vacancies = Vacancy.query.filter_by(status="open").all()
    processed = 0

    # PAD-271 (rule 13): capacity is the truth a vacancy follows. Close what a
    # coach edit, an import or any other write left open for a full class,
    # once per instance, before deciding anything below.
    closed_ids = set()
    seen_instances = set()
    for vacancy in open_vacancies:
        if vacancy.lesson_instance_id in seen_instances:
            continue
        seen_instances.add(vacancy.lesson_instance_id)
        closed_ids.update(v.id for v in reconcile_vacancies(vacancy.lesson_instance))

    for vacancy in open_vacancies:
        if vacancy.id in closed_ids:
            continue
        instance = vacancy.lesson_instance

        # Skip past or canceled classes (PAD-256: "started" on the club's clock)
        if instance.start_datetime <= utc_to_wall_naive(_now):
            vacancy.status = "expired"
            vacancy.save()
            continue
        if instance.status in ("canceled", "completed"):
            vacancy.status = "expired"
            vacancy.save()
            continue

        # Semi-automatic gating: never send (or waiting-list fill) vacancies
        # awaiting coach approval or dismissed by the coach.
        if vacancy.approval_status in ("pending", "dismissed"):
            continue
        # Approved "at the invitation window": hold until the window opens.
        if vacancy.invite_not_before is not None and _now < vacancy.invite_not_before:
            continue

        config = get_or_create_config(vacancy.coach_id)
        restrictions = config.get_restrictions()

        last = vacancy.last_activity_at

        # Fresh vacancy (no batch sent yet) — trigger immediately
        if last is None:
            _send_invitation_batch(vacancy, instance, config, vacancy.coach_id, now=_now)
            processed += 1
            continue

        # PAD-87: a round reached because the previous one was empty. Send it
        # now — one round per tick — regardless of maxInactiveTime, which waits
        # for invited students to answer and an empty round invited nobody.
        if _round_pending(vacancy):
            _send_invitation_batch(vacancy, instance, config, vacancy.coach_id, now=_now)
            processed += 1
            continue

        # Check inactivity timer
        max_inactive = restrictions.get("maxInactiveTime", {})
        if max_inactive.get("enabled"):
            threshold = timedelta(minutes=max_inactive["value"])
            if _now - last >= threshold:
                _send_invitation_batch(vacancy, instance, config, vacancy.coach_id, now=_now)
                processed += 1

    return processed


# ---------------------------------------------------------------------------
# Respond to notification (player presses Yes / No on invite)
# ---------------------------------------------------------------------------

def respond_to_notification(
    notification_event_id: int,
    action: str,
    acting_user_id: int,
    *,
    now: datetime | None = None,
) -> dict:
    from flask import abort
    from padel_app.models import Coach, Message, Player
    from padel_app.serializers.message import serialize_message

    event = NotificationEvent.query.get_or_404(notification_event_id)

    player = Player.query.get(event.player_id)
    if not player or player.user_id != acting_user_id:
        abort(403, "Not authorized to respond to this notification")

    # PAD-68: a late response to an invitation for a class that already happened
    # must not enrol anyone, free anyone, or trigger the next invitation round.
    # Every pending invite for the class is retired here, not just this one — the
    # class is over for everyone who was offered the spot.
    if _instance_is_over(event.lesson_instance, now):
        _expire_stale_invitations(event.lesson_instance)
        # The event may already have been out of sent/queued (so the sweep above
        # skipped it) while its message was still showing live buttons.
        _retire_invite_message(event)
        return {"action": "expired"}

    config = get_or_create_config(event.coach_id)

    coach = Coach.query.get(event.coach_id)
    locale = _resolve_locale(coach)
    templates = config.get_message_templates(locale)
    coach_user_id = coach.user_id if coach else None
    player_user_id = acting_user_id

    invite_msg = None
    # Mark original invite message as responded
    if event.message_id:
        invite_msg = Message.query.get(event.message_id)
        if invite_msg and invite_msg.msg_metadata is not None:
            invite_msg.msg_metadata = {
                **invite_msg.msg_metadata,
                "responded": True,
                "response": action,
            }
            invite_msg.save()
            publish(
                {"type": "message_edited", "payload": serialize_message(invite_msg, None)},
                message_recipient_ids(invite_msg),
            )

    instance = event.lesson_instance
    vacancy = event.vacancy

    if action == "no":
        event.status = "expired"
        event.save()

        if vacancy:
            vacancy.last_activity_at = utcnow_naive()
            vacancy.save()
            # Immediately invite the next player without waiting for inactivity timer
            _send_next_on_decline(vacancy, instance, event.coach_id, config)

        if coach_user_id:
            _send_system_message(
                coach_user_id,
                player_user_id,
                resolve_message_template(templates, "decline", locale),
                class_instance_id=instance.id,
            )

        publish(
            {
                "type": "notification_responded",
                "payload": {
                    "lessonInstanceId": instance.id,
                    "notificationEventId": event.id,
                    "response": "no",
                },
            },
            _coach_only(coach_user_id),
        )
        _mark_answered_message_read(invite_msg, acting_user_id)
        return {"action": "declined"}

    elif action == "yes":
        # PAD-261 (invitations rule 10): one winner per vacancy. Lock the
        # vacancy, then the class, and decide on what is committed now; a second
        # "yes" for the same last spot waits here, then gets the spot-filled answer.
        vacancy, instance = _lock_vacancy_and_instance(vacancy, instance)

        # PAD-68 under the lock: the class may have reached its start while this
        # answer waited. Decide on the re-read row and expire exactly as the
        # early check above does.
        if _instance_is_over(instance, now):
            _expire_stale_invitations(instance)
            _retire_invite_message(event)
            db.session.commit()  # release the lock
            return {"action": "expired"}

        # Check vacancy status first
        if vacancy and vacancy.status != "open":
            event.status = "expired"
            event.save()
            if coach_user_id:
                _send_system_message(
                    coach_user_id,
                    player_user_id,
                    resolve_message_template(templates, "spot_filled", locale),
                    class_instance_id=instance.id,
                )
            _offer_waiting_list(event.player_id, instance, event.coach_id, templates, locale)
            publish(
                {
                    "type": "notification_responded",
                    "payload": {
                        "lessonInstanceId": instance.id,
                        "notificationEventId": event.id,
                        "response": "spot_filled",
                    },
                },
                _coach_only(coach_user_id),
            )
            return {"action": "spot_filled_waiting_list_offered"}

        # Re-check capacity
        if _effective_filled_spots(instance) >= instance.max_players:
            event.status = "expired"
            event.save()
            if coach_user_id:
                _send_system_message(
                    coach_user_id,
                    player_user_id,
                    resolve_message_template(templates, "spot_filled", locale),
                    class_instance_id=instance.id,
                )
            _offer_waiting_list(event.player_id, instance, event.coach_id, templates, locale)
            publish(
                {
                    "type": "notification_responded",
                    "payload": {
                        "lessonInstanceId": instance.id,
                        "notificationEventId": event.id,
                        "response": "spot_filled",
                    },
                },
                _coach_only(coach_user_id),
            )
            return {"action": "spot_filled_waiting_list_offered"}

        # Fill the spot. The vacancy is marked before the enrolment so both land
        # in the enrolment's commit, which is also where the lock ends (PAD-261).
        if vacancy:
            vacancy.status = "filled"
            vacancy.filled_by_player_id = event.player_id
            vacancy.filled_at = utcnow_naive()
        _add_player_to_instance(event.player_id, instance)
        event.status = "confirmed"
        event.save()

        if coach_user_id:
            _send_system_message(
                coach_user_id,
                player_user_id,
                resolve_message_template(templates, "confirm", locale),
                class_instance_id=instance.id,
            )
            _broadcast_spot_filled(
                instance,
                event.id,
                coach_user_id,
                templates,
                vacancy_id=vacancy.id if vacancy else None,
                locale=locale,
            )

        publish(
            {
                "type": "notification_responded",
                "payload": {
                    "lessonInstanceId": instance.id,
                    "notificationEventId": event.id,
                    "response": "yes",
                },
            },
            _coach_only(coach_user_id),
        )
        _mark_answered_message_read(invite_msg, acting_user_id)
        return {"action": "confirmed"}

    return {"action": "unknown"}


def coach_respond_to_notification(
    notification_event_id: int,
    action: str,
    coach_id: int,
    *,
    now: datetime | None = None,
) -> dict:
    from flask import abort

    event = NotificationEvent.query.get_or_404(notification_event_id)
    if event.coach_id != coach_id:
        abort(403, "Not authorized")

    # PAD-68: the coach recording a late answer must not enrol anyone into a
    # class that already happened either — same staleness rule as the player path.
    if _instance_is_over(event.lesson_instance, now):
        _expire_stale_invitations(event.lesson_instance)
        _retire_invite_message(event)
        return {"action": "expired"}

    instance = event.lesson_instance
    vacancy = event.vacancy

    if action == "no":
        event.status = "expired"
        event.save()
        if vacancy:
            vacancy.last_activity_at = utcnow_naive()
            vacancy.save()
        return {"action": "declined"}

    elif action == "yes":
        if vacancy and vacancy.status != "open":
            event.status = "expired"
            event.save()
            return {"action": "spot_filled"}

        if _effective_filled_spots(instance) >= instance.max_players:
            event.status = "expired"
            event.save()
            return {"action": "spot_filled"}

        # PAD-271: the vacancy is marked BEFORE the enrolment so enrol()'s
        # reconciliation finds it already closed and closes nothing else.
        if vacancy:
            vacancy.status = "filled"
            vacancy.filled_by_player_id = event.player_id
            vacancy.filled_at = utcnow_naive()
        _add_player_to_instance(event.player_id, instance)
        event.status = "confirmed"
        event.save()
        if vacancy:
            vacancy.save()

        # Expire other pending invitations for this vacancy
        other_events = NotificationEvent.query.filter(
            NotificationEvent.vacancy_id == vacancy.id if vacancy else
            NotificationEvent.lesson_instance_id == instance.id,
            NotificationEvent.status == "sent",
            NotificationEvent.id != event.id,
        ).all()
        for other in other_events:
            other.status = "expired"
            other.save()

        return {"action": "confirmed"}

    return {"action": "unknown"}


# ---------------------------------------------------------------------------
# Manual notifications
# ---------------------------------------------------------------------------

def send_manual_notifications(
    instance_id: int, player_ids: list[int], coach_id: int
) -> list[NotificationEvent]:
    from padel_app.models import Coach, Player

    instance = LessonInstance.query.get_or_404(instance_id)
    if not instance.notifications_enabled:
        return []
    config = get_or_create_config(coach_id)

    coach = Coach.query.get(coach_id)
    coach_user_id = coach.user_id if coach else None
    locale = _resolve_locale(coach)
    templates = config.get_message_templates(locale)

    # PAD-107 + PAD-112: a manually picked student is skipped when they marked
    # themselves unavailable for this class slot (PAD-107) or switched off
    # MANUAL invitations / blocked everything (PAD-112) — no NotificationEvent,
    # no message, no push.
    #
    # Both are applied BEFORE `event.create()` below, not at delivery. Creating
    # the NotificationEvent first and then failing to send would leave an orphan
    # row marked "sent" with no message behind it: the coach's UI would show a
    # pending invite that never existed.
    #
    # The rest of the coach's selection is still notified; the caller surfaces
    # who was skipped.
    from padel_app.services.student_availability_service import (
        blocked_player_ids_for_window,
    )
    from padel_app.services.student_notification_preferences import (
        player_blocks_manual_invitations,
    )
    blocked_ids = blocked_player_ids_for_window(
        player_ids, instance.start_datetime, instance.end_datetime
    )

    events = []
    for player_id in player_ids:
        if int(player_id) in blocked_ids:
            continue
        if player_blocks_manual_invitations(player_id):
            continue

        player_user_id = _user_id_for_player(player_id)

        event = NotificationEvent(
            coach_id=coach_id,
            lesson_instance_id=instance_id,
            player_id=player_id,
            type="manual",
            round_number=1,
            status="sent",
        )
        event.create()

        if coach_user_id and player_user_id:
            player = Player.query.get(player_id)
            player_name = (player.user.name if player and player.user else "there").split()[0]
            level_code = effective_level_code(instance)
            weekday = _format_weekday(instance.start_datetime, locale)
            time_str = instance.start_datetime.strftime("%H:%M") if instance.start_datetime else ""

            text = _format_template(
                resolve_message_template(templates, "invite", locale),
                name=player_name,
                level=level_code,
                weekday=weekday,
                time=time_str,
            )

            msg = _send_system_message(
                coach_user_id=coach_user_id,
                player_user_id=player_user_id,
                text=text,
                message_type="notification_invite",
                msg_metadata={
                    "notificationEventId": event.id,
                    "lessonInstanceId": instance_id,
                    "responded": False,
                },
            )
            if msg is not None:
                event.message_id = msg.id
                event.save()

        events.append(event)

    publish(
        {
            "type": "notify_sent",
            "payload": {
                "lessonInstanceId": instance_id,
                "count": len(events),
                "type": "manual",
            },
        },
        _coach_only(coach_user_id),
    )

    return events


# ---------------------------------------------------------------------------
# Waiting list
# ---------------------------------------------------------------------------

def _offer_waiting_list(
    player_id: int,
    instance: LessonInstance,
    coach_id: int,
    templates: dict,
    locale: str | None = None,
) -> None:
    """Send a waiting-list offer message to the player."""
    from padel_app.models import Coach
    coach = Coach.query.get(coach_id)
    if not coach:
        return
    player_user_id = _user_id_for_player(player_id)
    if not player_user_id:
        return

    text = resolve_message_template(templates, "waiting_list_offer", locale)
    _send_system_message(
        coach_user_id=coach.user_id,
        player_user_id=player_user_id,
        text=text,
        message_type="waiting_list_offer",
        msg_metadata={
            "lessonInstanceId": instance.id,
            "responded": False,
        },
    )


def _find_waiting_list_offer(
    coach_user_id: int | None,
    player_user_id: int,
    lesson_instance_id: int,
):
    """The newest ``waiting_list_offer`` (answered or not) for this pair and
    instance, or None. Read-only: unlike :func:`_get_or_create_direct_conversation`
    it never creates the conversation (PAD-222, notifications.waiting-list rule 12).
    Answered offers count: a double tap on the same offer must stay the idempotent
    upsert of PAD-124, not a 403."""
    if not coach_user_id:
        return None
    from padel_app.models import Conversation, Message

    key = Conversation.build_participant_key([coach_user_id, player_user_id])
    conv = Conversation.query.filter_by(participant_key=key).first()
    if conv is None:
        return None
    return next(
        (m for m in Message.query.filter_by(
            conversation_id=conv.id,
            message_type="waiting_list_offer",
        ).order_by(Message.id.desc()).all()
         if m.msg_metadata
         and m.msg_metadata.get("lessonInstanceId") == lesson_instance_id),
        None,
    )


def _mark_waiting_list_offer_responded(
    coach_user_id: int | None,
    player_user_id: int,
    lesson_instance_id: int,
    action: str,
) -> None:
    """Settle the newest un-answered ``waiting_list_offer`` for this pair.

    PAD-124: the offer bubble keys its answered state off the same
    ``responded`` / ``response`` metadata the invite and reminder bubbles use, so
    the answer has to be written back onto the message — otherwise the settled
    state lives only in client memory and the Yes/No reappear on reload.
    Re-answering an already-settled offer is a no-op here; the waiting-list
    upsert itself is idempotent.
    """
    if not coach_user_id:
        return
    from padel_app.models import Message
    from padel_app.serializers.message import serialize_message

    conv = _get_or_create_direct_conversation(coach_user_id, player_user_id)
    offer = next(
        (m for m in Message.query.filter_by(
            conversation_id=conv.id,
            message_type="waiting_list_offer",
        ).order_by(Message.id.desc()).all()
         if m.msg_metadata
         and m.msg_metadata.get("lessonInstanceId") == lesson_instance_id
         and not m.msg_metadata.get("responded")),
        None,
    )
    if offer is None:
        return
    offer.msg_metadata = {**offer.msg_metadata, "responded": True, "response": action}
    offer.save()
    publish(
        {"type": "message_edited", "payload": serialize_message(offer, None)},
        message_recipient_ids(offer),
    )


def respond_to_waiting_list(
    lesson_instance_id: int,
    action: str,
    acting_user_id: int,
    *,
    now: datetime | None = None,
) -> dict:
    """
    Called when a player presses Yes or No on a waiting-list offer.

    PAD-68: joining the waiting list for a class that already happened is
    meaningless — the entry could never be filled — so a late answer is a no-op
    and any invitation still pending for that class is retired.

    PAD-124: the offer message is marked ``responded`` here, the same way
    :func:`respond_to_reminder` marks its reminder, so the answered bubble
    survives a reload instead of only living in client state.
    """
    from padel_app.models import Coach, Player

    instance = LessonInstance.query.get_or_404(lesson_instance_id)

    player = Player.query.filter_by(user_id=acting_user_id).first()
    if not player:
        from flask import abort
        abort(403)

    coach_rel = Association_CoachLessonInstance.query.filter_by(
        lesson_instance_id=lesson_instance_id
    ).first()
    coach = Coach.query.get(coach_rel.coach_id) if coach_rel else None

    # PAD-222 (rule 12): only a player holding an offer for THIS instance may
    # answer. Checked before the late-instance branch so nothing is written or
    # revealed for an instance the caller was never offered.
    if _find_waiting_list_offer(
        coach.user_id if coach else None, acting_user_id, lesson_instance_id
    ) is None:
        from flask import abort
        abort(403)

    if _instance_is_over(instance, now):
        _expire_stale_invitations(instance)
        # PAD-124: settle the offer as expired too, so the student is not left
        # tapping a question the server will refuse every time.
        if coach:
            _mark_waiting_list_offer_responded(
                coach.user_id, acting_user_id, lesson_instance_id, "expired"
            )
        return {"action": "expired"}

    if not coach:
        return {"action": "unknown"}

    config = get_or_create_config(coach.id)
    locale = _resolve_locale(coach)
    templates = config.get_message_templates(locale)

    if action not in ("yes", "no"):
        return {"action": "unknown"}

    # PAD-124: mark the offer message answered so the bubble renders its settled
    # state on reload, exactly as the reminder bubble does. Done for both answers
    # — "no" also closes the question.
    _mark_waiting_list_offer_responded(
        coach.user_id, acting_user_id, lesson_instance_id, action
    )

    if action == "yes":
        # Upsert waiting list entry
        existing = WaitingListEntry.query.filter_by(
            lesson_instance_id=lesson_instance_id,
            player_id=player.id,
        ).first()
        if existing:
            existing.is_active = True
            existing.save()
        else:
            WaitingListEntry(
                lesson_instance_id=lesson_instance_id,
                player_id=player.id,
                coach_id=coach.id,
            ).create()

        if coach.user_id:
            _send_system_message(
                coach_user_id=coach.user_id,
                player_user_id=acting_user_id,
                text=resolve_message_template(templates, "waiting_list_confirm", locale),
                class_instance_id=instance.id,
            )
        return {"action": "added_to_waiting_list"}

    elif action == "no":
        return {"action": "declined"}

    return {"action": "unknown"}


def get_waiting_list(instance_id: int, coach_id: int) -> list[dict]:
    entries = WaitingListEntry.query.filter_by(
        lesson_instance_id=instance_id,
        coach_id=coach_id,
        is_active=True,
    ).all()
    result = []
    for e in entries:
        player = e.player
        user = player.user if player else None
        result.append({
            "id": e.id,
            "playerId": e.player_id,
            "playerName": user.name if user else None,
            "joinedAt": e.joined_at.isoformat() if e.joined_at else None,
        })
    return result


def _check_waiting_list(
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
    round_number: int,
    *,
    dry_run: bool = False,
) -> WaitingListEntry | None:
    """
    Return the highest-priority waiting list entry that meets the current round's criteria,
    or None if the waiting list is empty / no match.

    ``dry_run`` (PAD-196): answer the question without the side effect — an
    expired standing entry is skipped but NOT deactivated, so the simulation
    writes nothing (notifications.invite-simulation rule 3).
    """
    entries = WaitingListEntry.query.filter_by(
        lesson_instance_id=instance.id,
        coach_id=coach_id,
        is_active=True,
    ).all()
    if not entries:
        return None

    invitation_groups = config.get_invitation_groups()

    # PAD-128 / PAD-122: placement is hard-gated on the bar
    # (eligibility.enforcement rule 2). Waiting-list candidates are NOT subject
    # to wave criteria — they are being placed, not invited in rounds — so they
    # are filtered by eligibility and ranked by the priority criteria below.
    eligibility_rules = effective_eligibility(instance, coach_id, config)

    # PAD-123: a student is never placed into a class they are already in
    # (eligibility.enforcement rule 4). `absent` is the load-bearing half: the
    # student whose cancellation CREATED this vacancy still holds an enrolment
    # association plus an `absent` presence, so without both exclusions they are
    # placed straight back into their own vacancy — a credit is spent, a
    # `waiting_list_placed` message is sent, and the real spot is never offered
    # to anybody. Unconditional: applies whether or not a bar is defined
    # (eligibility.enforcement rule 10).
    # PAD-259: a presence row of any status is in the class; the one who
    # declined keeps their row, so one set covers both cases.
    already_in_class_ids = set(instance.enrolled_player_ids)

    # PAD-122: the restrictions the invitation path has always honoured but the
    # fill path skipped entirely (eligibility.enforcement rule 5). Also
    # unconditional.
    restrictions = config.get_restrictions()
    restricted_player_ids = set()
    if restrictions["excludedPlayers"]["enabled"]:
        restricted_player_ids = set(restrictions["excludedPlayers"]["playerIds"])

    # Filter entries — when invitation groups are configured, skip round-criteria filtering
    eligible_entries = []
    for entry in entries:
        # Check if linked standing entry is still valid
        if entry.standing_entry_id:
            standing = StandingWaitingListEntry.query.get(entry.standing_entry_id)
            if standing and (not standing.is_active or standing.expires_at < utcnow_naive()):
                if not dry_run:
                    _deactivate_standing_entry(standing)
                continue

        cp = Association_CoachPlayer.query.filter_by(
            coach_id=coach_id, player_id=entry.player_id
        ).first()
        if not cp:
            continue

        if entry.player_id in already_in_class_ids:
            continue

        if str(entry.player_id) in restricted_player_ids:
            continue

        user = cp.player.user if cp.player else None
        # PAD-268 (auth.account-deletion rule 7): never place a deleted account.
        if user is not None and user.status == "disabled":
            continue
        if restrictions["excludeUnpaidSubscription"]["enabled"]:
            if not user or user.status != "active":
                continue

        if not passes_eligibility(cp, instance, coach_id, eligibility_rules):
            continue

        # All active waiting-list entries compete; there is no wave-criteria
        # filter on the fill path (PAD-279 removed the legacy rounds filter
        # that only ever ran for a coach with an empty group list).
        eligible_entries.append((entry, cp))

    if not eligible_entries:
        return None

    # PAD-122: the availability-blocker filter, the last guard the fill path
    # skipped (eligibility.enforcement rule 5). Placement is silent enrolment,
    # so dropping a student into a window they marked unavailable is worse here
    # than on the invitation path, where they could at least decline.
    from padel_app.services.student_availability_service import filter_blocked_coach_players
    unblocked_player_ids = {
        cp.player_id
        for cp in filter_blocked_coach_players(
            [cp for _, cp in eligible_entries], instance
        )
    }
    eligible_entries = [
        pair for pair in eligible_entries if pair[1].player_id in unblocked_player_ids
    ]
    if not eligible_entries:
        return None

    # Rank by priority ordering
    player_stats = {}
    for entry, cp in eligible_entries:
        att_rate, just_rate = _attendance_stats(entry.player_id)
        player_stats[entry.player_id] = {
            "attendance_rate": att_rate,
            "justified_miss_rate": just_rate,
        }

    sort_key = _build_sort_key(config.get_priority_criteria(), player_stats, vacancy)
    eligible_entries.sort(key=lambda pair: sort_key(pair[1]))

    return eligible_entries[0][0]


def _fill_from_waiting_list(
    entry: WaitingListEntry,
    vacancy: Vacancy,
    instance: LessonInstance,
    coach_id: int,
    config: NotificationConfig,
    now: datetime | None = None,
) -> bool:
    """Place a waiting-list student into the vacancy. Returns whether it did.

    PAD-261 (waiting-list rule 13): decided under the vacancy-then-class lock.
    The student is placed only while the vacancy is still open and the class
    still has room; otherwise nobody is placed and the entry stays active.
    """
    from padel_app.models import Coach

    vacancy, instance = _lock_vacancy_and_instance(vacancy, instance)
    if _instance_is_over(instance, now):
        # PAD-68 under the lock: the class started while this placement waited.
        # The vacancy expires as _send_invitation_batch's early check expires it.
        if vacancy.status == "open":
            vacancy.status = "expired"
        db.session.commit()  # the expiry, and the end of the lock
        return False
    if vacancy.status != "open" or _effective_filled_spots(instance) >= instance.max_players:
        db.session.commit()  # release the lock; nothing was written
        return False

    vacancy.status = "filled"
    vacancy.filled_by_player_id = entry.player_id
    vacancy.filled_at = utcnow_naive()
    _add_player_to_instance(entry.player_id, instance)
    vacancy.save()

    entry.is_active = False
    entry.save()

    # Credit the standing entry, deactivate when cap reached
    if entry.standing_entry_id:
        standing = StandingWaitingListEntry.query.get(entry.standing_entry_id)
        if standing and standing.is_active:
            standing.credits_used += 1
            standing.save()
            if standing.credits_used >= standing.credits_total:
                _deactivate_standing_entry(standing)

    coach = Coach.query.get(coach_id)
    if not coach:
        return True

    player_user_id = _user_id_for_player(entry.player_id)
    if not player_user_id:
        return True

    from padel_app.models import Player

    locale = _resolve_locale(coach)
    templates = config.get_message_templates(locale)
    player = Player.query.get(entry.player_id)
    player_name = (player.user.name if player and player.user else "there").split()[0]
    level_code = effective_level_code(instance)
    weekday = _format_weekday(instance.start_datetime, locale)
    time_str = instance.start_datetime.strftime("%H:%M") if instance.start_datetime else ""

    text = _format_template(
        resolve_message_template(templates, "waiting_list_placed", locale),
        name=player_name,
        level=level_code,
        weekday=weekday,
        time=time_str,
    )
    _send_system_message(
        coach_user_id=coach.user_id,
        player_user_id=player_user_id,
        text=text,
        message_type="waiting_list_placed",
        class_instance_id=instance.id,
    )

    publish(
        {
            "type": "notification_responded",
            "payload": {
                "lessonInstanceId": instance.id,
                "vacancyId": vacancy.id,
                "response": "waiting_list_filled",
            },
        },
        _coach_only(coach.user_id),
    )
    return True


# ---------------------------------------------------------------------------
# Notification groups (manual notify modal)
# ---------------------------------------------------------------------------

def _students_with_recent_absences(coach_players: list, lookback: int = 8) -> list:
    result = []
    for cp in coach_players:
        recent = (
            Presence.query
            .filter_by(player_id=cp.player_id)
            .order_by(Presence.created_at.desc())
            .limit(lookback)
            .all()
        )
        if any(p.status == "absent" for p in recent):
            result.append(cp)
    return result


def _students_with_justified_absences(coach_players: list) -> list:
    result = []
    for cp in coach_players:
        has_justified = Presence.query.filter_by(
            player_id=cp.player_id, justification="justified"
        ).first()
        if has_justified:
            result.append(cp)
    return result


def _serialize_cp_for_group(cp: Association_CoachPlayer) -> dict:
    player = cp.player
    user = player.user if player else None
    return {
        "id": str(cp.player_id),
        "name": user.name if user else "Unknown",
        "levelCode": cp.level.code if cp.level else None,
        "levelId": str(cp.level_id) if cp.level_id else None,
    }


def get_notification_groups(
    model: str, original_id: int, date_str: str | None, coach_id: int
) -> list[dict]:
    config = get_or_create_config(coach_id)
    groups_config = config.get_notification_groups()
    enabled_groups = [g for g in groups_config if g.get("enabled")]

    already_notified_ids: set[int] = set()
    if model.lower() == "lessoninstance":
        obj = LessonInstance.query.get(original_id)
        if obj is None:
            return []
        level_id = effective_level_id(obj)
        enrolled_ids = set(obj.enrolled_player_ids)  # PAD-259
        already_notified_ids = {
            e.player_id
            for e in NotificationEvent.query.filter(
                NotificationEvent.lesson_instance_id == obj.id,
                NotificationEvent.status.in_(["sent", "confirmed"]),
            ).all()
        }
    else:
        from padel_app.models import Lesson
        obj = Lesson.query.get(original_id)
        if obj is None:
            return []
        level_id = effective_level_id(obj)
        enrolled_ids = {rel.player_id for rel in obj.players_relations}

    all_coach_players = [
        cp for cp in Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()
        if cp.player_id not in enrolled_ids and cp.player_id not in already_notified_ids
    ]

    result = []
    for group_config in enabled_groups:
        gid = group_config["id"]
        label = group_config["label"]

        if gid == "same_level":
            if not level_id:
                continue
            players = [cp for cp in all_coach_players if cp.level_id == level_id]
        elif gid == "recent_absences":
            players = _students_with_recent_absences(all_coach_players)
        elif gid == "justified_absences":
            players = _students_with_justified_absences(all_coach_players)
        elif gid == "all_students":
            players = all_coach_players
        else:
            continue

        if not players:
            continue

        result.append({
            "id": gid,
            "label": label,
            "players": [_serialize_cp_for_group(cp) for cp in players],
        })

    return result


# ---------------------------------------------------------------------------
# Standing waiting list
# ---------------------------------------------------------------------------

def _deactivate_standing_entry(entry: StandingWaitingListEntry) -> None:
    """Deactivate a standing entry and all its linked per-class WaitingListEntry rows."""
    entry.is_active = False
    entry.save()
    linked = WaitingListEntry.query.filter_by(
        standing_entry_id=entry.id, is_active=True
    ).all()
    for wle in linked:
        wle.is_active = False
        wle.save()


def _fan_out_standing_entry(entry: StandingWaitingListEntry) -> None:
    """Create per-class WaitingListEntry rows for all upcoming instances for this coach."""
    now = utcnow_naive()
    coach_instance_ids = {
        rel.lesson_instance_id
        for rel in Association_CoachLessonInstance.query.filter_by(coach_id=entry.coach_id).all()
    }
    for instance_id in coach_instance_ids:
        instance = LessonInstance.query.get(instance_id)
        if not instance:
            continue
        if instance.start_datetime <= utc_to_wall_naive(now):  # PAD-256: on the club's clock
            continue
        if instance.status in ("canceled", "completed"):
            continue
        # PAD-109: match on the (lesson_instance_id, player_id) pair the
        # uq_waiting_session_player constraint covers — NOT on is_active, which
        # is not part of it. Removing a standing entry only flips its per-class
        # rows to is_active=False, so re-adding the same player to the same
        # upcoming class used to fall through to an INSERT and blow up with a
        # UniqueViolation (500). Reactivate the row we already have instead.
        existing = WaitingListEntry.query.filter_by(
            lesson_instance_id=instance_id,
            player_id=entry.player_id,
        ).first()
        if existing:
            if existing.is_active:
                # Already queued for this class — either by this coach's earlier
                # standing entry or because the player joined the list themselves.
                # Leave the existing row (and its origin) untouched.
                continue
            existing.is_active = True
            existing.coach_id = entry.coach_id
            existing.standing_entry_id = entry.id
            existing.save()
            continue
        WaitingListEntry(
            lesson_instance_id=instance_id,
            player_id=entry.player_id,
            coach_id=entry.coach_id,
            standing_entry_id=entry.id,
        ).create()


def add_standing_waiting_list_entry(
    coach_id: int, player_id: int, credits_total: int, duration_days: int
) -> StandingWaitingListEntry:
    """Add (or replace) a standing waiting list entry for a player."""
    # Deactivate any existing active entry for this coach/player pair
    existing = StandingWaitingListEntry.query.filter_by(
        coach_id=coach_id, player_id=player_id, is_active=True
    ).first()
    if existing:
        _deactivate_standing_entry(existing)

    entry = StandingWaitingListEntry(
        coach_id=coach_id,
        player_id=player_id,
        credits_total=credits_total,
        credits_used=0,
        expires_at=utcnow_naive() + timedelta(days=duration_days),
        is_active=True,
    )
    entry.create()
    _fan_out_standing_entry(entry)
    return entry


def remove_standing_waiting_list_entry(entry_id: int, coach_id: int) -> None:
    """Remove a standing waiting list entry and deactivate all linked per-class entries."""
    from flask import abort
    entry = StandingWaitingListEntry.query.get_or_404(entry_id)
    if entry.coach_id != coach_id:
        abort(403, "Not authorized")
    _deactivate_standing_entry(entry)


def get_standing_waiting_list(coach_id: int) -> list[dict]:
    """Return all active standing waiting list entries for this coach."""
    entries = StandingWaitingListEntry.query.filter_by(
        coach_id=coach_id, is_active=True
    ).all()
    result = []
    for e in entries:
        player = e.player
        user = player.user if player else None
        active_class_count = WaitingListEntry.query.filter_by(
            standing_entry_id=e.id, is_active=True
        ).count()
        result.append({
            "id": e.id,
            "playerId": e.player_id,
            "playerName": user.name if user else None,
            "creditsUsed": e.credits_used,
            "creditsTotal": e.credits_total,
            "expiresAt": e.expires_at.isoformat() if e.expires_at else None,
            "createdAt": e.created_at.isoformat() if e.created_at else None,
            "activeClassCount": active_class_count,
        })
    return result


def _sync_standing_entries_for_new_instance(instance: LessonInstance, coach_id: int) -> None:
    """Called when a new instance is created — add it to all active standing entries.

    Callers (e.g. ``get_or_materialize_instance``) invoke this from inside their
    own SAVEPOINT (``db.session.begin_nested()``), so this function must only
    stage/flush changes and must NOT commit — ``Model.create()`` issues a full
    ``db.session.commit()``, which ends the caller's savepoint (or, on a later
    iteration, the outer transaction itself) out from under it and leaves the
    caller's transaction handle closed, raising ``ResourceClosedError`` when it
    later tries to commit/rollback. Use ``add_to_session()`` instead so the
    caller's savepoint/commit continues to control the transaction boundary.
    """
    active_entries = StandingWaitingListEntry.query.filter_by(
        coach_id=coach_id, is_active=True
    ).all()
    for entry in active_entries:
        existing = WaitingListEntry.query.filter_by(
            lesson_instance_id=instance.id,
            player_id=entry.player_id,
            is_active=True,
        ).first()
        if existing:
            continue
        WaitingListEntry(
            lesson_instance_id=instance.id,
            player_id=entry.player_id,
            coach_id=coach_id,
            standing_entry_id=entry.id,
        ).add_to_session()
    db.session.flush()


# ---------------------------------------------------------------------------
# Activity feed
# ---------------------------------------------------------------------------

def get_notification_activity(coach_id: int, limit: int = 20) -> list[dict]:
    events = (
        NotificationEvent.query
        .filter_by(coach_id=coach_id)
        .order_by(NotificationEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    result = []
    for e in events:
        result.append({
            "id": e.id,
            "type": e.type,
            "roundNumber": e.round_number,
            "status": e.status,
            "vacancyId": e.vacancy_id,
            "createdAt": e.created_at.isoformat() if e.created_at else None,
            "lessonInstance": {
                "id": e.lesson_instance_id,
                "title": e.lesson_instance.title if e.lesson_instance else None,
                "startDatetime": e.lesson_instance.start_datetime.isoformat() if e.lesson_instance else None,
            },
            "player": {
                "id": e.player_id,
                "name": e.player.user.name if e.player and e.player.user else None,
            },
        })
    return result
