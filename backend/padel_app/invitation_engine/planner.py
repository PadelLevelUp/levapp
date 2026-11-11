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
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Literal

from padel_app.invitation_engine import timeline
from padel_app.invitation_engine.constants import LOWER_TIER_PER_SPOT, side_quota
from padel_app.invitation_engine.effects import (
    Absence,
    CoachAlert,
    Effect,
    InvitationClosed,
    Invited,
    Message,
    Placed,
    Reoffered,
    WaitingListLeft,
)
from padel_app.invitation_engine.settings import EngineSettings, Tier
from padel_app.invitation_engine.snapshot import (
    SIDES,
    Elsewhere,
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


def with_postponed(snapshot: SessionSnapshot, now: datetime) -> SessionSnapshot:
    """The snapshot with ``postponed`` set for ``now`` (engine-tiers rule 10, D15; PAD-911): a student
    holding a counting ("ativo") invitation for another session that club day. For this gate an
    invitation counts by rule 3 (``timeline.counting``) **and** its offer counts toward a current spot
    type of its own session by rule 4, so an invitation to a full session counts for nothing; such an
    invitation stays valid (D4) but postpones nobody. Going elsewhere at the same time is the gate,
    not a postpone."""
    postponed = {e.invitation.student for e in snapshot.elsewhere if _counts_there(e, now)}
    return replace(snapshot, postponed=frozenset(postponed - snapshot.busy_same_time))


def _counts_there(e: Elsewhere, now: datetime) -> bool:
    """Planning rules 3 and 4 for an invitation to another session: counting, and its offer counts
    toward one of that session's current spot types."""
    if not timeline.counting(e.invitation, now):
        return False
    there = SessionSnapshot(id=e.session, level=None, capacity=e.capacity, start=e.start, regulars=(),
                            going=e.going)
    counts = spot_counts(there)
    offer = {o.side for o in e.invitation.offer}
    return any(type_sides(st, counts) & offer for st, _ in spot_types(there, counts))


def close_same_hour(snapshot: SessionSnapshot, student: str, now: datetime) -> tuple[Effect, ...]:
    """engine-answers rule 10 (D4's one exception): a student placed in this session has their open
    invitations for other sessions at the same hour closed. Called with every placement."""
    return tuple(InvitationClosed(e.session, now, student) for e in snapshot.elsewhere
                 if e.invitation.student == student and e.start == snapshot.start)


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


def _side_rank(student: Student, spot_type: SpotType | None) -> int:
    """The playing-side criterion: a student whose only side is the spot's first, then one who plays
    both, then the rest. A spot with no side (an either spot, or none given) favours nobody."""
    if spot_type is None or spot_type.side is None or student.sides == frozenset({spot_type.side}):
        return 0
    return 1 if spot_type.side in student.sides else 2


def _criterion(name: str, student: Student, spot_type: SpotType | None) -> float:
    """One ordering criterion's rank, lower first (``settings.ORDERING_CRITERIA``)."""
    if name == "level":                                   # 1 is the best; an unknown level last
        return student.level if student.level is not None else float("inf")
    if name == "justified_misses":
        return -student.makeups_owed
    if name in ("attendance", "attendance_rate"):
        return -student.attendance_rate
    if name in ("playing_side", "playing_side_match"):
        return _side_rank(student, spot_type)
    if name == "subscription_status":
        return 0 if student.active else 1
    if name == "unjustified_absences":
        return student.unjustified_absences
    if name == "justified_absences":
        return -student.justified_absences
    return -student.participations                       # "participations"


def _order(tier: Tier, student: Student, snapshot: SessionSnapshot, settings: EngineSettings,
           spot_type: SpotType | None = None) -> tuple:
    """Ordering inside a tier (engine-tiers rule 8): the coach's criteria (``settings.ordering``) in
    the coach's order, then join time on the waiting lists, then a stable order."""
    joined = None
    if tier.source != "pool":
        entry = _entry(snapshot, student.id, "coach" if tier.source == "coach_list" else "students")
        joined = entry.joined_at if entry else None
    criteria = tuple(_criterion(name, student, spot_type) for name in settings.ordering)
    return (criteria, joined or datetime.min, _natural(student.id))


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

    @property
    def size(self) -> int:
        return len(self.holders) + len(self.fresh)


@dataclass
class _Run:
    """One planning run's working state: who is used on a harder type, what this run has sent."""

    snapshot: SessionSnapshot
    settings: EngineSettings
    now: datetime
    counts: SpotCounts
    latest: dict[str, Invitation]
    people: list[str]
    used: set[str] = field(default_factory=set)
    sent: dict[str, frozenset[str]] = field(default_factory=dict)       # this run's invitees -> offer sides
    covers: dict[str, SpotType] = field(default_factory=dict)          # covering pass: who covers which type
    sent_tier: dict[str, int] = field(default_factory=dict)            # this run's invitees -> their tier
    effects: list[Effect] = field(default_factory=list)

    def buckets(self, spot_type: SpotType) -> dict[int, _TierPool]:
        """The type's candidates by tier (engine-planning rule 5.1): holders of a counting invitation
        whose offer counts for it, and students never invited. Students used on a harder type, and
        postponed or gated ones, are none."""
        values = type_sides(spot_type, self.counts)
        out: dict[int, _TierPool] = {}
        for sid in self.people:
            student = self.snapshot.students.get(sid)
            if student is None or sid in self.used or sid in self.sent:
                continue
            invitation = self.latest.get(sid)
            sorry = invitation is not None and invitation.open and invitation.sorry_at is not None
            if invitation is not None and not sorry and not (timeline.counting(invitation, self.now)
                                                             and {t.side for t in invitation.offer} & values):
                continue
            t = tier_for(student, spot_type, self.counts, self.snapshot, self.settings)
            if t is not None:                    # a "sorry" holder is chosen like an uninvited one (rule 5.1)
                bucket = out.setdefault(t, _TierPool())
                (bucket.fresh if invitation is None or sorry else bucket.holders).append(sid)
        return out

    def counting_for(self, spot_type: SpotType, *, distinct: bool = False) -> int:
        """Counting invitations from any tier whose offer counts for the type, this run's included
        (engine-planning rules 4, 5.3). ``distinct`` (the covering pass): a person this run uses to
        cover another type does not count for this one (D5, coverage in distinct people)."""
        values = type_sides(spot_type, self.counts)

        def mine(sid: str) -> bool:
            return not distinct or self.covers.get(sid, spot_type) == spot_type

        old = sum(1 for sid, inv in self.latest.items() if sid not in self.sent and mine(sid)
                  and timeline.counting(inv, self.now) and {t.side for t in inv.offer} & values)
        return old + sum(1 for sid, offer in self.sent.items() if offer & values and mine(sid))

    def session_counting(self) -> int:
        return sum(1 for inv in self.latest.values() if timeline.counting(inv, self.now)) + len(self.sent)


def _hardness(run: _Run, spot_type: SpotType, spots: int) -> tuple[float, int]:
    """Fewest candidates per uncovered spot first (rule 5), the candidates counted at the type's
    ideal tier, where the type is decided (S10: the right type has only the flexible student, the
    left-siders being a lower tier for it). On a tie, the type whose ideal tier is better first, so
    a better tier is served before a lower one reaches the same people (S20). No candidate at all:
    last."""
    buckets = run.buckets(spot_type)
    if not buckets:
        return float("inf"), len(run.settings.tiers)
    ideal = min(buckets)
    return buckets[ideal].size / spots, ideal


def split_tied(room: int, want: dict[Side, int], uncovered: dict[Side, int], going: dict[Side, int],
               candidates: dict[Side, int], x: int) -> dict[Side, int]:
    """Rule 13 (coordinator ruling, U7): two side types tied on hardness and M too small for both.
    The side with more uncovered spots is served first until the sides are equal, the rest of M is
    split in halves, and an odd leftover goes to the side with fewer going students, then to the side
    with fewer candidates in the tier."""
    give = {v: 0 for v in want}
    more, less = sorted(want, key=lambda v: (-uncovered[v], v))
    first = min(room, want[more], x * (uncovered[more] - uncovered[less]))
    give[more] += first
    room -= first
    half = room // 2
    for v in (more, less):
        take = min(half, want[v] - give[v])
        give[v] += take
        room -= take
    for v in sorted(want, key=lambda v: (going[v], candidates[v], v)):          # the leftover
        take = min(room, want[v] - give[v])
        give[v] += take
        room -= take
    return give


def _walk(run: _Run, order: list[tuple[SpotType, int]], caps: dict[SpotType, int] | None) -> dict[SpotType, int]:
    """One run of plan §6 step 2 in two passes (coordinator ruling D-E21, 2026-11-11; engine-planning
    rule 5): first COVER every type with uncovered spots, then TOP UP the covered ones. Each pass walks
    the tiers in order, and inside a tier the types hardest first (``order``). An uncovered spot beats a
    third invitation for a covered one (D9; the owner's S10). Budgets are D17's: X per covered spot at
    the type's ideal tier, else 1; never above ``caps`` (M's share). Returns invitations per type."""
    first = {st: run.buckets(st) for st, _ in order}                   # before anyone is used
    ideal = {st: min(b) if b else None for st, b in first.items()}
    sent = {st: 0 for st, _ in order}
    _cover(run, order, caps, first, ideal, sent)
    _pass(run, order, caps, first, ideal, sent, cover=False)
    return sent


def _cover(run: _Run, order: list[tuple[SpotType, int]], caps: dict[SpotType, int] | None,
           first: dict[SpotType, dict[int, _TierPool]], ideal: dict[SpotType, int | None],
           sent: dict[SpotType, int]) -> None:
    """The covering pass. A spot held by a counting invitation of any tier is covered (D9), each
    holder covering one type only, hardest type first (D5). The spots left are covered with new
    invitees, tiers in order and hardest type first inside a tier: at least one distinct person per
    spot, and up to D17's budget for those spots (X at the type's ideal tier, else 1), counting the
    invitations whose offer already counts for the type (D20)."""
    settings, snapshot, x = run.settings, run.snapshot, run.settings.invites_per_spot
    uncovered: dict[SpotType, int] = {}
    holding: set[str] = set()
    for spot_type, spots in order:
        values = type_sides(spot_type, run.counts)
        mine = [sid for sid, inv in run.latest.items() if sid not in holding and timeline.counting(inv, run.now)
                and {s.side for s in inv.offer} & values][:spots]
        holding.update(mine)
        run.covers.update({sid: spot_type for sid in mine})
        uncovered[spot_type] = spots - len(mine)
    for t in range(len(settings.tiers)):
        tier = settings.tiers[t]
        for spot_type, _spots in order:
            if uncovered[spot_type] == 0:
                continue
            bucket = run.buckets(spot_type).get(t)
            if bucket is None or not bucket.fresh:                          # an empty tier costs no time
                continue
            k = min(uncovered[spot_type], len(bucket.fresh))
            uncovered[spot_type] -= k
            budget = k * (x if t == ideal[spot_type] else LOWER_TIER_PER_SPOT)   # D17
            room = max(k, budget - _counting_new(run, spot_type, t))
            room = min(room, settings.max_at_a_time - run.session_counting())     # M (D16)
            if caps is not None:
                room = min(room, caps.get(spot_type, 0) - sent[spot_type])
            _send(run, order, spot_type, t, tier, bucket, room, sent, first, covering=True)


def _counting_new(run: _Run, spot_type: SpotType, t: int) -> int:
    """This run's invitees from tier ``t`` whose offer counts for the type (a flexible invitee sent
    for a harder type counts for this one too, D20)."""
    values = type_sides(spot_type, run.counts)
    return sum(1 for sid, tt in run.sent_tier.items() if tt == t and run.sent[sid] & values)


def _send(run: _Run, order: list[tuple[SpotType, int]], spot_type: SpotType, t: int, tier: Tier,
          bucket: _TierPool, room: int, sent: dict[SpotType, int], first: dict[SpotType, dict[int, _TierPool]],
          *, covering: bool) -> None:
    settings, snapshot = run.settings, run.snapshot
    fresh = sorted(bucket.fresh, key=lambda sid: _order(tier, snapshot.students[sid], snapshot, settings, spot_type))
    chosen = fresh[:max(0, min(room, len(fresh)))]
    share = None
    if settings.timing.method == "progressive":
        taking_part = _method_b_tiers(run, spot_type, sorted(set(first[spot_type]) | {t}))
        # The tier's share is fixed at its first round; its rounds split it (engine-settings rule 2,
        # PAD-911): the rounds already sent for the type, plus those its uninvited candidates still need.
        values = type_sides(spot_type, run.counts)
        rounds_sent = sorted({i.sent_at for i in snapshot.invitations
                              if i.tier == t and {o.side for o in i.offer} & values})
        since = rounds_sent[0] if rounds_sent else run.now
        tier_share = timeline.method_b_t(snapshot, settings, since, len(taking_part), taking_part.index(t))
        rounds = len(rounds_sent) + (-(-len(fresh) // len(chosen)) if chosen else 1)
        share = timeline.method_b_round_t(tier_share, rounds, len(rounds_sent))
    t_send = timeline.t_at_send(settings, t, len(fresh) > len(chosen), share)
    for sid in chosen:
        student = snapshot.students[sid]
        offer = _offer_across(run, t, student, order, spot_type)
        run.sent[sid] = offer
        run.sent_tier[sid] = t
        if covering:
            run.covers[sid] = spot_type
        fields = (frozenset(SpotType(v, snapshot.level) for v in sorted(offer)), side_named(offer, student),
                  t, timeline.counts_until(settings, run.now, t_send))
        if sid in run.latest:            # a "sorry" invitation: re-offered, never a second one (D1)
            run.effects += [Reoffered(snapshot.id, run.now, sid, *fields),
                            Message(snapshot.id, run.now, sid, "reoffer")]
        else:
            run.effects.append(Invited(snapshot.id, run.now, sid, *fields))
    sent[spot_type] += len(chosen)


def _pass(run: _Run, order: list[tuple[SpotType, int]], caps: dict[SpotType, int] | None,
          first: dict[SpotType, dict[int, _TierPool]], ideal: dict[SpotType, int | None],
          sent: dict[SpotType, int], *, cover: bool) -> None:
    """The top-up pass: tiers in order, hardest type first inside a tier; per type and tier, cover by
    distinct people (this run's invitees from the tier included) and top up to the type's budget
    (D17, D10), never above M or ``caps``."""
    settings, x = run.settings, run.settings.invites_per_spot
    uncovered = {st: spots for st, spots in order}
    budget_so_far = {st: 0 for st, _ in order}
    for t in range(len(settings.tiers)):
        tier = settings.tiers[t]
        for spot_type, _spots in order:
            if uncovered[spot_type] == 0:
                continue
            bucket = run.buckets(spot_type).get(t) or _TierPool()
            holders = len(bucket.holders) + _counting_new(run, spot_type, t)
            if holders + len(bucket.fresh) == 0:                            # an empty tier costs no time
                continue
            covered = min(uncovered[spot_type], holders + len(bucket.fresh))
            uncovered[spot_type] -= covered
            budget = covered * (x if t == ideal[spot_type] else LOWER_TIER_PER_SPOT)   # D17
            budget_so_far[spot_type] += budget
            room = min(budget - holders,                                    # the tier's own budget
                       budget_so_far[spot_type] - run.counting_for(spot_type))   # the type's, filled first (D10)
            room = min(room, settings.max_at_a_time - run.session_counting())     # M (D16)
            if caps is not None:
                room = min(room, caps.get(spot_type, 0) - sent[spot_type])
            _send(run, order, spot_type, t, tier, bucket, room, sent, first, covering=False)
            run.used.update(bucket.holders)


def _method_b_tiers(run: _Run, spot_type: SpotType, with_candidates: list[int]) -> list[int]:
    """The tiers in Method B's split for a type (engine-settings rule 2, as agreed with the timeline):
    those with candidates for it now, and those that sent an invitation whose offer includes it and
    that was not answered No, this run's sends included. A tier whose invitees all said No leaves."""
    values = type_sides(spot_type, run.counts)
    sent = {i.tier for i in run.snapshot.invitations
            if i.tier is not None and i.answer != "no" and {t.side for t in i.offer} & values}
    sent |= {e.tier for e in run.effects
             if isinstance(e, Invited) and e.tier is not None and {t.side for t in e.offer} & values}
    return sorted(set(with_candidates) | sent)


def _offer_across(run: _Run, t: int, student: Student, order: list[tuple[SpotType, int]],
                  current: SpotType) -> frozenset[str]:
    """A new invitee's offer: every type still to serve in this run that this tier holds them for,
    so a flexible invitation sent for the hard type counts for the easy one too (rule 5.3, D20)."""
    tier = run.settings.tiers[t]
    offer = set(_offer_sides(tier, student, type_sides(current, run.counts), run.snapshot, run.settings))
    position = [st for st, _ in order].index(current)
    for other, _spots in order[position + 1:]:
        if tier_for(student, other, run.counts, run.snapshot, run.settings) == t:
            offer |= _offer_sides(tier, student, type_sides(other, run.counts), run.snapshot, run.settings)
    return frozenset(offer)


def _alerts(run: _Run, types: list[tuple[SpotType, int]], now: datetime) -> tuple[Effect, ...]:
    """Nobody left (engine-planning rule 11, §6 step 4): a type with uncovered spots and no candidate
    in any tier, neither a counting invitation that counts for it nor an uninvited student who fits.
    One alert per session and type, raised again only when the type's count changes."""
    out = []
    for spot_type, spots in types:
        if not run.buckets(spot_type) and run.snapshot.alerted.get(spot_type) != spots:
            side = spot_type.side or "either"
            out.append(CoachAlert(run.snapshot.id, now, f"no candidate for {spots} {side} spot(s)", spot_type, spots))
    return tuple(out)


def auto_entries(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """engine-settings rule 3: with ``auto-entry`` on and before ``attendance_request_at`` (the
    invitation window not required), waiting-list members are placed in the spots that are open and
    that they can take, without an invitation, and told so (``added``). The coach's list goes first,
    then the students' list, each in its tier order (engine-tiers rule 8). A coach's-list entry takes
    the coach's side (any side when none); a students'-list entry takes a side in the student's
    subset, or as their side choice allows when ``wl-sides`` is on."""
    asked_at = timeline.attendance_request_at(snapshot, settings)
    if not settings.auto_entry_before_attendance_request or (asked_at is not None and now >= asked_at):
        return ()
    if now >= timeline.wall_to_utc_naive(snapshot.start):
        return ()
    going = {p.student: p.side for p in snapshot.going}
    quota, capacity = side_quota(snapshot.capacity), snapshot.capacity
    placed_side = {v: sum(1 for s in going.values() if s == v) for v in SIDES}
    total = len(going)
    out: list[Effect] = []
    for which, source in (("coach", "coach_list"), ("students", "students_list")):
        tier = Tier(source, "any")
        entries = [w for w in snapshot.waiting_list if w.list == which and w.student not in going]
        entries.sort(key=lambda w: _order(tier, snapshot.students[w.student], snapshot, settings)
                     if w.student in snapshot.students else ((), w.joined_at, ()))
        for w in entries:
            student = snapshot.students.get(w.student)
            if (student is None or total >= capacity or w.student in snapshot.said_no
                    or w.student in snapshot.busy_same_time):     # never two sessions at one hour (answers rule 10)
                continue
            if which == "students" and not _eligible(student, snapshot, settings):
                continue
            if which == "coach":
                sides = frozenset({w.side}) if w.side else frozenset(SIDES)
            elif settings.waiting_list_side_choice and w.sides == "other":
                sides = frozenset(SIDES) - student.sides
            elif w.sides == "both":                         # the student accepts either side
                sides = frozenset(SIDES)
            else:
                sides = student.sides
            room = [v for v in SIDES if v in sides and placed_side[v] < quota]
            if not room:
                continue
            side = max(room, key=lambda v: quota - placed_side[v])
            placed_side[side] += 1
            total += 1
            going[w.student] = side
            out += [Placed(snapshot.id, now, w.student, side, "auto_from_waiting_list"),
                    Message(snapshot.id, now, w.student, "added"), *close_same_hour(snapshot, w.student, now)]
            if w.student in snapshot.absent:                 # a regular back in: their absence goes
                out.append(Absence(snapshot.id, now, w.student, "none"))
            out += [WaitingListLeft(snapshot.id, now, w.student, e.list)
                    for e in snapshot.waiting_list if e.student == w.student]
    return tuple(out)


def plan(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> Plan:
    """Decide the session's new invitations at ``now`` (naive UTC). Never revokes (D4).

    Automatic entry (engine-settings rule 3) comes first; the engine plans again on the next run
    with those students going."""
    snapshot = with_postponed(snapshot, now)
    entries = auto_entries(snapshot, settings, now)
    if entries:
        return Plan(entries)
    if not timeline.may_plan(snapshot, settings, now):
        return Plan()
    counts = spot_counts(snapshot)
    latest = {i.student: i for i in snapshot.invitations}               # one per student (D1)
    people = sorted({st.id for st in snapshot.pool} | {w.student for w in snapshot.waiting_list}, key=_natural)

    def fresh_run() -> _Run:
        return _Run(snapshot, settings, now, counts, latest, people)

    probe = fresh_run()
    types = list(spot_types(snapshot, counts))
    hardness = {st: _hardness(probe, st, n) for st, n in types}
    order = sorted(types, key=lambda tn: hardness[tn[0]])
    alerts = _alerts(probe, types, now)

    # First pass without M's share: what each type wants. If M covers it all, that is the plan.
    dry = fresh_run()
    dry_settings = settings.with_changes(max_at_a_time=10 ** 6)
    dry.settings = dry_settings
    want = _walk(dry, order, None)
    room = max(0, settings.max_at_a_time - probe.session_counting())
    if sum(want.values()) <= room:
        run = fresh_run()
        _walk(run, order, None)
        return Plan(tuple(run.effects) + alerts)

    caps: dict[SpotType, int] = {}
    i = 0
    while i < len(order):
        a = order[i][0]
        b = order[i + 1][0] if i + 1 < len(order) else None
        if (b is not None and a.side is not None and b.side is not None
                and hardness[a][0] == hardness[b][0]):                      # two side types tied (rule 13)
            spots = dict(order[i:i + 2])
            going = {v: sum(1 for p in snapshot.going if p.side == v) for v in (a.side, b.side)}
            cands = {st.side: min(probe.buckets(st).items())[1].size if probe.buckets(st) else 0
                     for st in (a, b)}                                     # candidates in the tier
            split = split_tied(room, {a.side: want[a], b.side: want[b]}, {a.side: spots[a], b.side: spots[b]},
                               going, cands, settings.invites_per_spot)
            caps[a], caps[b] = split[a.side], split[b.side]
            room -= caps[a] + caps[b]
            i += 2
            continue
        caps[a] = min(want[a], room)
        room -= caps[a]
        i += 1
    run = fresh_run()
    _walk(run, order, caps)
    return Plan(tuple(run.effects) + alerts)
