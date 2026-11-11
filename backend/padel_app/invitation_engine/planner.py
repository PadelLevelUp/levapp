"""One planning run for one session (plan §6): spots, tiers, coverage, X and M, D17, offers.

Owns: going counts and spot types (§4, D2, D3, D18, D19); tiers per spot type from the coach's
groups and the waiting lists (§5, D12, Q7); candidates and gates (D8, D13, D15); coverage in
distinct people (D5, D9); top-up to X or 1 (D17, §6.1) under M (D16); offers and named sides
(D20, D11); automatic entry from the waiting list when the setting is on; the coach alert when no
tier can take a spot (§6 step 4).

Waves (specflow/impl/notifications/_overview.md, "Engine waves"): W1 the counts
(``spot_counts``, ``spot_types``, ``side_admits``); W2 tiers, gates, ordering and the basic run
(cover, top-up to X per covered spot, naming, one invitation per student, the window). Still to
come: hardest type first, D17's one per spot for a non-ideal tier, offers across types, M and D10
(W5); the coach alert (W7); automatic entry (W8).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from padel_app.invitation_engine import timeline
from padel_app.invitation_engine.constants import method_b_share, side_quota
from padel_app.invitation_engine.effects import Effect, Invited
from padel_app.invitation_engine.settings import EngineSettings, Tier
from padel_app.invitation_engine.snapshot import (
    SIDES,
    Invitation,
    SessionSnapshot,
    Side,
    SpotType,
    Student,
    WaitingListEntry,
)


@dataclass(frozen=True)
class SpotCounts:
    """What a session needs, by side (engine-spots rule 6; plan §4).

    ``flexible_unplaced`` are going students with no side yet (a {L, R} regular the coach has not
    placed); ``over_quota[v]`` is how many going students placed on v exceed its quota, each of them a
    flexible going student too (rule 9). ``Σ open(v) = class_empty + flexible_going``.
    """

    class_empty: int
    open: dict[Side, int]
    must: dict[Side, int]
    either: int
    flexible_unplaced: tuple[str, ...]
    over_quota: dict[Side, int]

    @property
    def flexible_going(self) -> int:
        return len(self.flexible_unplaced) + sum(self.over_quota.values())


def spot_counts(snapshot: SessionSnapshot) -> SpotCounts:
    """The session's counts, from scratch (engine-spots rules 2, 4-6, 9)."""
    quota = side_quota(snapshot.capacity)
    placed = {v: sum(1 for p in snapshot.going if p.side == v) for v in SIDES}
    class_empty = max(0, snapshot.capacity - len(snapshot.going))
    open_ = {v: max(0, quota - placed[v]) for v in SIDES}
    must = {v: max(0, class_empty - sum(open_[w] for w in SIDES if w != v)) for v in SIDES}
    return SpotCounts(
        class_empty=class_empty,
        open=open_,
        must=must,
        either=class_empty - sum(must.values()),
        flexible_unplaced=tuple(p.student for p in snapshot.going if p.side is None),
        over_quota={v: max(0, placed[v] - quota) for v in SIDES},
    )


def spot_types(snapshot: SessionSnapshot, counts: SpotCounts | None = None) -> tuple[tuple[SpotType, int], ...]:
    """The session's spot types with how many spots each: the ``must(v)`` types, then ``either``,
    all at the class's level (engine-spots rules 7, 8; D2, D3). Types with no spot are left out."""
    counts = counts or spot_counts(snapshot)
    types = [(SpotType(v, snapshot.level), counts.must[v]) for v in SIDES]
    types.append((SpotType(None, snapshot.level), counts.either))
    return tuple((t, n) for t, n in types if n > 0)


def type_sides(spot_type: SpotType, counts: SpotCounts) -> frozenset[Side]:
    """The category values a spot type stands for: v for ``must(v)``; for ``either``, every v with
    ``open(v) > 0`` (engine-spots rule 7)."""
    if spot_type.side is not None:
        return frozenset({spot_type.side})
    return frozenset(v for v in SIDES if counts.open[v] > 0)


def side_admits(rule: Literal["same", "other", "any"], spot_type: SpotType, sides: frozenset[str],
                counts: SpotCounts) -> bool:
    """Whether a tier's side rule admits a student holding ``sides`` for ``spot_type``
    (engine-spots rule 7, engine-settings rule 6). ``same``: the student fits a value the type stands
    for; ``other``: the type has one value and the student does not fit it (an ``either`` spot admits
    nobody); ``any``: no side rule."""
    if rule == "any":
        return True
    values = type_sides(spot_type, counts)
    if rule == "same":
        return bool(sides & values)
    return spot_type.side is not None and spot_type.side not in sides


@dataclass(frozen=True)
class Plan:
    """What one run decided: ``Invited``, ``Placed`` (automatic entry) and ``CoachAlert`` effects."""

    effects: tuple[Effect, ...] = ()


# --- tiers, gates and ordering (engine-tiers) ----------------------------------------------------

def counting(invitation: Invitation, now: datetime) -> bool:
    """Open and before its counting-until instant (engine-planning rule 3). Only these hold spots."""
    return invitation.open and (invitation.counts_until is None or now < invitation.counts_until)


def _entry(snapshot: SessionSnapshot, student: str, which: str) -> WaitingListEntry | None:
    return next((w for w in snapshot.waiting_list if w.student == student and w.list == which), None)


def _inside(snapshot: SessionSnapshot, student: str) -> bool:
    return snapshot.placement(student) is not None or any(r.id == student for r in snapshot.regulars)


def _level(student: Student, snapshot: SessionSnapshot) -> int | None:
    """A student with no level reads as the class's level (engine-tiers, open question 2)."""
    return student.level if student.level is not None else snapshot.level


def _eligible(student: Student, snapshot: SessionSnapshot, settings: EngineSettings) -> bool:
    """The level bar, a gate (D13). A class with no level applies no level rule (D3)."""
    if snapshot.level is None:
        return True
    level = _level(student, snapshot)
    return snapshot.level - settings.eligibility.levels_above <= level <= snapshot.level + settings.eligibility.levels_below


def _entry_admits(entry: WaitingListEntry, student: Student, values: frozenset[str],
                  settings: EngineSettings) -> bool:
    """The waiting lists have no level rules (D12); sides per engine-tiers rule 6 and
    engine-settings rule 4."""
    if entry.list == "coach":
        return entry.side is None or entry.side in values
    if not settings.waiting_list_side_choice or entry.sides in (None, "both"):
        return True
    if entry.sides == "own":
        return bool(student.sides & values)
    return bool(values - student.sides)


def passes(tier: Tier, student: Student, spot_type: SpotType, counts: SpotCounts, snapshot: SessionSnapshot,
           settings: EngineSettings) -> bool:
    """Whether ``student`` passes the gates and ``tier``'s rules for ``spot_type`` (engine-tiers
    rules 3-6). The coach's list is the coach's decision: only "in the session" and "said No" hold."""
    sid = student.id
    if _inside(snapshot, sid) or sid in snapshot.said_no:
        return False
    values = type_sides(spot_type, counts)
    if tier.source == "coach_list":
        entry = _entry(snapshot, sid, "coach")
        return entry is not None and _entry_admits(entry, student, values, settings)
    in_pool = any(st.id == sid for st in snapshot.pool)
    if (not in_pool or sid in snapshot.busy_same_time or sid in snapshot.postponed
            or not _eligible(student, snapshot, settings)):
        return False
    if tier.source == "students_list":
        entry = _entry(snapshot, sid, "students")
        return entry is not None and _entry_admits(entry, student, values, settings)
    if snapshot.level is not None and _level(student, snapshot) != snapshot.level - tier.level_offset:
        return False
    return side_admits(tier.side, spot_type, student.sides, counts)


def tier_for(student: Student, spot_type: SpotType, counts: SpotCounts, snapshot: SessionSnapshot,
             settings: EngineSettings) -> int | None:
    """The student's tier for a type: the first tier they pass (engine-tiers rule 7), or ``None``."""
    return next((i for i, tier in enumerate(settings.tiers)
                 if passes(tier, student, spot_type, counts, snapshot, settings)), None)


def _natural(sid: str) -> tuple:
    return tuple(int(p) if p.isdigit() else p for p in re.split(r"(\d+)", sid))


def _order(tier: Tier, student: Student, snapshot: SessionSnapshot) -> tuple:
    """Ordering inside a tier (engine-tiers rule 8): the coach's criteria, then join time on the
    waiting lists, then a stable order."""
    joined = None
    if tier.source != "pool":
        entry = _entry(snapshot, student.id, "coach" if tier.source == "coach_list" else "students")
        joined = entry.joined_at if entry else None
    return (-student.participations, joined or datetime.min, _natural(student.id))


def _offer_sides(tier: Tier, student: Student, values: frozenset[str], snapshot: SessionSnapshot,
                 settings: EngineSettings) -> frozenset[str]:
    """The sides a new invitee is sent for, within the type (D20)."""
    if tier.source == "coach_list":
        entry = _entry(snapshot, student.id, "coach")
        if entry is not None and entry.side is not None:
            return frozenset({entry.side}) & values
    if tier.source == "students_list" and settings.waiting_list_side_choice:
        entry = _entry(snapshot, student.id, "students")
        if entry is not None and entry.sides == "other":
            return values - student.sides
    if tier.source == "pool" and tier.side == "other":
        return values - student.sides
    return (values & student.sides) or values


def side_named(offer: frozenset[str], student: Student) -> Side | None:
    """The message names a side only when it is outside the student's subset (D11, rule 9)."""
    if len(offer) == 1:
        (side,) = offer
        return None if side in student.sides else side
    return None


# --- the run (engine-planning rule 5) ---------------------------------------------------------

@dataclass
class _TierPool:
    holders: list[str] = field(default_factory=list)      # counting invitations that count for the type
    fresh: list[str] = field(default_factory=list)        # students with no invitation for the session


def plan(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> Plan:
    """Decide the session's new invitations at ``now`` (naive UTC). Never revokes (D4)."""
    if not timeline.may_plan(snapshot, settings, now):
        return Plan()
    counts = spot_counts(snapshot)
    latest = {i.student: i for i in snapshot.invitations}               # one per student (D1)
    people = sorted({st.id for st in snapshot.pool} | {w.student for w in snapshot.waiting_list}, key=_natural)
    used: set[str] = set()
    effects: list[Effect] = []
    for spot_type, spots in spot_types(snapshot, counts):
        values = type_sides(spot_type, counts)
        tiers: dict[int, _TierPool] = {}
        for sid in people:
            student = snapshot.students.get(sid)
            if student is None or sid in used:
                continue
            invitation = latest.get(sid)
            if invitation is not None and not (counting(invitation, now)
                                               and {t.side for t in invitation.offer} & values):
                continue
            t = tier_for(student, spot_type, counts, snapshot, settings)
            if t is None:
                continue
            bucket = tiers.setdefault(t, _TierPool())
            (bucket.fresh if invitation is None else bucket.holders).append(sid)
        with_candidates = sorted(tiers)
        uncovered = spots
        for t in with_candidates:                                          # an empty tier costs no time
            if uncovered == 0:
                break
            tier, bucket = settings.tiers[t], tiers[t]
            covered = min(uncovered, len(bucket.holders) + len(bucket.fresh))
            budget = settings.invites_per_spot * covered
            fresh = sorted(bucket.fresh, key=lambda sid: _order(tier, snapshot.students[sid], snapshot))
            chosen = fresh[:max(0, min(budget - len(bucket.holders), len(fresh)))]
            share = None
            if settings.timing.method == "progressive":
                share = method_b_share(timeline.useful_time(snapshot, settings), len(with_candidates),
                                       with_candidates.index(t))
            t_send = timeline.t_at_send(settings, t, len(fresh) > len(chosen), share)
            for sid in chosen:
                student = snapshot.students[sid]
                offer = _offer_sides(tier, student, values, snapshot, settings)
                effects.append(Invited(
                    snapshot.id, now, sid, frozenset(SpotType(v, snapshot.level) for v in sorted(offer)),
                    side_named(offer, student), t, timeline.counts_until(settings, now, t_send)))
            used.update(bucket.holders)
            used.update(chosen)
            uncovered -= covered
    return Plan(tuple(effects))
