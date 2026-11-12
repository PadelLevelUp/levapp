"""What happens when someone acts on a session (plan §7, §8 step 4): Yes and No, the waiting
lists, direct join, regulars' absences and returns, cancellations, attendance confirmations.

Owns: placement on Yes within the offer (D20, D7, D6), the last spot claimed once (S32), "sorry"
and the re-offer (D4, Q6), the said-No gate (§3), joining and leaving the two lists with the
student's side choice, direct join when the setting is on, and the refusals of each.

Waves (specflow/impl/notifications/_overview.md, "Engine waves"): W3 placement within the offer and
the refusals (engine-answers rules 1, 2, 5, 6, 8); W6 "sorry" and the re-offer (rules 3, 4, 7). The
last spot (rule 7) is claimed once because the engine handles one request at a time and every Yes
reads a fresh snapshot; on Postgres a table-backed store does it in one transaction (ANSWERS-10).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from padel_app.invitation_engine import absences, planner
from padel_app.invitation_engine.constants import KIND_SORRY
from padel_app.invitation_engine.effects import (
    Absence,
    Answered,
    AnsweredBy,
    Effect,
    Left,
    LeftReason,
    Message,
    Placed,
    Refused,
    Sorry,
    WaitingListJoined,
    WaitingListLeft,
)
from padel_app.invitation_engine.requests import (
    Answer,
    Cancel,
    ConfirmAttendance,
    DirectJoin,
    JoinWaitingList,
    LeaveWaitingList,
    NoShow,
    RegularAbsent,
    RegularReturns,
    Request,
)
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SIDES, SessionSnapshot, Side, SpotType
from padel_app.utils.dates import wall_to_utc_naive


@dataclass(frozen=True)
class Outcome:
    effects: tuple[Effect, ...] = ()


def handle(snapshot: SessionSnapshot, settings: EngineSettings, request: Request, now: datetime) -> Outcome:
    """Decide the effects of one student-facing request at ``now`` (naive UTC).

    A request the session cannot take is refused, never raised: an ``Answer`` with no open
    invitation (none sent, already answered, or the class has started) has no effects; a refused
    join returns a ``Refused`` effect. The scenario harness relies on this (design §12; 65, 72, 79).
    """
    if isinstance(request, NoShow):                       # after the class (§8 step 7)
        if snapshot.placement(request.student) is None:
            return Outcome()
        # The class has happened: the absence is recorded and the roster stays as it was (P16, 60, 71).
        return Outcome(absences.record(snapshot, settings, request.student, "no_show", now))
    if now >= wall_to_utc_naive(snapshot.start):          # the class has started (invitations rule 20)
        if isinstance(request, (DirectJoin, JoinWaitingList)) and (
                not isinstance(request, DirectJoin) or settings.direct_join):
            action = "direct_join" if isinstance(request, DirectJoin) else "waiting_list"
            return Outcome((Refused(snapshot.id, now, request.student, action, "class_closed"),))
        return Outcome()
    snapshot = planner.with_postponed(snapshot, now)
    if isinstance(request, Answer):
        return Outcome(_answer(snapshot, settings, request, now))
    if isinstance(request, RegularAbsent):
        p = snapshot.placement(request.student)
        if p is None or p.how not in ("regular", "regular_returns"):
            return Outcome()
        return Outcome(_leave(snapshot, settings, request.student, "regular_no", now))
    if isinstance(request, Cancel):
        if snapshot.placement(request.student) is None:
            return Outcome()
        return Outcome(_leave(snapshot, settings, request.student, "cancel", now))
    if isinstance(request, ConfirmAttendance):
        who = ([request.student] if request.student is not None
               else [r.id for r in snapshot.regulars if snapshot.placement(r.id) is not None])
        return Outcome(tuple(Answered(snapshot.id, now, sid, "yes", "attendance_request") for sid in who
                             if snapshot.placement(sid) is not None and sid not in snapshot.confirmed))
    if isinstance(request, RegularReturns):
        return Outcome(_regular_returns(snapshot, request.student, now))
    if isinstance(request, JoinWaitingList):
        return Outcome(_join_waiting_list(snapshot, settings, request, now))
    if isinstance(request, LeaveWaitingList):
        if any(w.student == request.student and w.list == request.list for w in snapshot.waiting_list):
            return Outcome((WaitingListLeft(snapshot.id, now, request.student, request.list),))
        return Outcome()
    if isinstance(request, DirectJoin):
        return Outcome(_direct_join(snapshot, settings, request, now))
    return Outcome()


# --- leaving ----------------------------------------------------------------------------------

def _leave(snapshot: SessionSnapshot, settings: EngineSettings, student: str, reason: LeftReason,
           now: datetime) -> tuple[Effect, ...]:
    """The absence, decided while the snapshot still shows how the student came in (engine-timeline
    rules 5, 7; engine-answers rule 6), then the departure. An automatic entrant who says No also
    leaves the session's waiting list (engine-settings rule 3)."""
    out: list[Effect] = list(absences.record(snapshot, settings, student, reason, now))
    out.append(Left(snapshot.id, now, student, reason))
    p = snapshot.placement(student)
    if p is not None and p.how == "auto_from_waiting_list":
        out += [WaitingListLeft(snapshot.id, now, student, w.list)
                for w in snapshot.waiting_list if w.student == student]
    return tuple(out)


# --- a Yes or a No to an invitation (engine-answers) ---------------------------------------------

def _answer(snapshot: SessionSnapshot, settings: EngineSettings, request: Answer, now: datetime) -> tuple[Effect, ...]:
    sid = request.student
    invitation = snapshot.invitation(sid)
    if invitation is None or not invitation.open or snapshot.placement(sid) is not None:
        return ()                                          # rule 8: refused, nothing placed, nothing sent
    if not request.yes:
        return (Answered(snapshot.id, now, sid, "no", "invitation", request.by),)   # rule 5: final for the session
    if sid in snapshot.busy_same_time:
        return ()                                          # rule 10: already placed at this hour, refused
    if invitation.sorry_at is not None:
        return ()                                          # rule 4: sorry offers nothing more
    side = _place_side(snapshot, settings, sid, invitation.offer, invitation.side_named, now)
    if side is not None:
        return _placed(snapshot, sid, side, "invitation", now, answered_by=request.by)
    # Rules 3 and 4: never another side or type on this answer; sorry, and the waiting list is the way back.
    return (Sorry(snapshot.id, now, sid), Message(snapshot.id, now, sid, KIND_SORRY))


def _placed(snapshot: SessionSnapshot, sid: str, side: Side, how, now: datetime, *,
            answered_by: AnsweredBy | None) -> tuple[Effect, ...]:
    """Going: a placed student no longer waits on the session's lists. ``answered_by``: who said Yes to
    the invitation, ``None`` for a placement no answer made."""
    out: list[Effect] = [Answered(snapshot.id, now, sid, "yes", "invitation", answered_by)] if answered_by else []
    out.append(Placed(snapshot.id, now, sid, side, how))
    out += [WaitingListLeft(snapshot.id, now, sid, w.list) for w in snapshot.waiting_list if w.student == sid]
    out += planner.close_same_hour(snapshot, sid, now)    # rule 10: never two sessions at one hour
    return tuple(out)


def open_sides(snapshot: SessionSnapshot, settings: EngineSettings | None = None) -> frozenset[Side]:
    """The sides a student can be placed on now: room in the class and in the side's quota
    (engine-planning rule 4). Placing on such a side keeps every ``must(w)`` coverable. With
    ``settings`` whose ``fill_never_held`` is off, only a side with a freed spot, or any side while an
    either-side one is freed (engine-settings rule 11)."""
    counts = planner.spot_counts(snapshot)
    if counts.class_empty <= 0:
        return frozenset()
    sides = frozenset(v for v in SIDES if counts.open[v] > 0)
    if settings is None or settings.fill_never_held:
        return sides
    freed, either = planner.freed_spots(snapshot)
    return frozenset(v for v in sides if freed[v] > 0 or either > 0)


def _place_side(snapshot: SessionSnapshot, settings: EngineSettings, sid: str, offer: frozenset[SpotType],
                named: Side | None, now: datetime) -> Side | None:
    """Where a Yes lands (rules 1, 2): within the offer; a named side binds; otherwise the
    student's own side when open; a {left, right} student on the side with the fewest candidates
    per open spot. ``None`` when nothing within the offer is open for them."""
    student = snapshot.students.get(sid)
    allowed = open_sides(snapshot) & {t.side for t in offer if t.side is not None}
    if named is not None:
        allowed &= {named}
    elif student is not None:
        allowed &= student.sides                           # never placed on a side they were not told
    if not allowed:
        return None
    return _hardest(snapshot, settings, sid, allowed, now)


def _hardest(snapshot: SessionSnapshot, settings: EngineSettings, sid: str, sides: frozenset[Side],
             now: datetime) -> Side:
    if len(sides) == 1:
        (side,) = sides
        return side
    return min(sorted(sides), key=lambda v: _per_open_spot(snapshot, settings, sid, v, now))


def _per_open_spot(snapshot: SessionSnapshot, settings: EngineSettings, sid: str, side: Side,
                   now: datetime) -> float:
    """D6's measure for one side: its candidates (engine-planning rule 5.1, at the type's ideal tier,
    the answering student left out) per open spot."""
    run = _run(snapshot, settings, now)
    run.used.add(sid)
    buckets = run.buckets(SpotType(side, snapshot.level))
    candidates = buckets[min(buckets)].size if buckets else 0
    return candidates / max(1, run.counts.open[side])


def _run(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> planner._Run:
    """A planning run's view of the candidates (engine-planning rule 5.1), to measure with."""
    latest = {i.student: i for i in snapshot.invitations}
    people = sorted({st.id for st in snapshot.pool} | {w.student for w in snapshot.waiting_list} | set(latest),
                    key=planner._natural)
    return planner._Run(snapshot, settings, now, planner.spot_counts(snapshot), latest, people)


# --- regulars, waiting lists, direct join ----------------------------------------------------

def _regular_returns(snapshot: SessionSnapshot, sid: str, now: datetime) -> tuple[Effect, ...]:
    """A regular who said No wants back ("afinal vou"): their spot, if their side still has room,
    and the absence disappears. The plan is silent; the PDF's rule stands (sheet line 62, clause 3)."""
    regular = next((r for r in snapshot.regulars if r.id == sid), None)
    if regular is None or sid not in snapshot.absent or snapshot.placement(sid) is not None:
        return ()
    sides = open_sides(snapshot) & regular.sides
    if not sides:                                          # their spot was taken: "sorry" (sheet 63, E6)
        return (Message(snapshot.id, now, sid, KIND_SORRY),)
    side: Side | None = next(iter(sides)) if len(regular.sides) == 1 else None
    return (Placed(snapshot.id, now, sid, side, "regular_returns"), Absence(snapshot.id, now, sid, "none"),
            *planner.close_same_hour(snapshot, sid, now))


def _join_waiting_list(snapshot: SessionSnapshot, settings: EngineSettings, request: JoinWaitingList,
                       now: datetime) -> tuple[Effect, ...]:
    """The coach adds anyone (their decision); a student joins the students' list when eligible,
    visible and not already in the session (D13; engine-settings rule 4 keeps their side choice). A
    student already on either list is refused ``already_on_list`` and nothing changes (rule 12)."""
    sid = request.student
    if any(w.student == sid for w in snapshot.waiting_list):    # one entry per session, either list (rule 12)
        return (Refused(snapshot.id, now, sid, "waiting_list", "already_on_list"),)
    if snapshot.placement(sid) is not None:
        return (Refused(snapshot.id, now, sid, "waiting_list", "already_enrolled"),)
    if request.list == "students":
        student = snapshot.students.get(sid)
        visible = any(st.id == sid for st in snapshot.pool) or sid in snapshot.absent   # a regular who said No
        if student is None or not visible or not planner._eligible(student, snapshot, settings):
            return (Refused(snapshot.id, now, sid, "waiting_list", "ineligible"),)
    return (WaitingListJoined(snapshot.id, now, sid, request.list, request.side, request.sides),)


def _direct_join(snapshot: SessionSnapshot, settings: EngineSettings, request: DirectJoin,
                 now: datetime) -> tuple[Effect, ...]:
    """engine-settings rule 5: when on, an eligible student who sees the session joins a spot of a
    side they fit at once, even after their own No; with their side full, refused (the waiting list
    is offered instead)."""
    sid = request.student
    student = snapshot.students.get(sid)
    if not settings.direct_join:             # not a refusal: the app's request waits for the coach
        return ()
    if snapshot.placement(sid) is not None:
        return (Refused(snapshot.id, now, sid, "direct_join", "already_enrolled"),)
    if sid in snapshot.busy_same_time:
        return (Refused(snapshot.id, now, sid, "direct_join", "busy_same_hour"),)
    visible = any(st.id == sid for st in snapshot.pool)
    if student is None or not visible or not planner._eligible(student, snapshot, settings):
        return (Refused(snapshot.id, now, sid, "direct_join", "ineligible"),)
    sides = open_sides(snapshot, settings) & (frozenset({request.side}) if request.side else student.sides)
    if not sides:
        return (Refused(snapshot.id, now, sid, "direct_join", "side_full", open_sides(snapshot, settings)),)
    return _placed(snapshot, sid, _hardest(snapshot, settings, sid, sides, now), "direct", now, answered_by=None)
