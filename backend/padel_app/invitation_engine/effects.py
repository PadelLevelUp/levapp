"""What the engine does, as records (plan §4-§8; harness design §5).

Every rule returns effects; the store applies them and the caller reads them. They are the
engine's whole observable output, so a test or an adapter never reads internal state to learn
what happened. ``at`` is naive UTC (R-023).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from padel_app.invitation_engine.snapshot import PlacedHow, Side, SpotQueues, SpotType, WaitingListSides

MessageKind = Literal["sorry", "reoffer", "added", "waiting_list_invite", "side_moved"]
AbsenceNotice = Literal["on_time", "late", "none"]
LeftReason = Literal["regular_no", "cancel", "no_show"]
AlertReason = Literal["no_candidate"]
#: Why a join was refused, a code the route answers as 409 {code} (classes.join-requests NJ1).
RefusalCode = Literal["already_enrolled", "class_closed", "ineligible", "side_full", "busy_same_hour",
                      "already_on_list"]


@dataclass(frozen=True)
class Effect:
    session: str
    at: datetime


@dataclass(frozen=True)
class Invited(Effect):
    """``counts_until`` is the instant it stops counting, fixed at send (engine-timeline rule 4)."""

    student: str
    offer: frozenset[SpotType]
    side_named: Side | None
    tier: int | None
    counts_until: datetime | None = None


@dataclass(frozen=True)
class Sorry(Effect):
    """A Yes with no room (plan §7, D4; engine-answers rule 4): the invitation stays open but stops
    counting until the planner re-offers it. Comes with ``Message(kind="sorry")``; never with
    ``Answered``, which would close it."""

    student: str


@dataclass(frozen=True)
class Reoffered(Effect):
    """The same invitation offered again (Q6, coordinator ruling (1); engine-planning rule 5.3): its
    offer, named side, tier and counting-until replace the old ones and it counts again. Never a
    second invitation (D1). Comes with ``Message(kind="reoffer")``."""

    student: str
    offer: frozenset[SpotType]
    side_named: Side | None
    tier: int | None
    counts_until: datetime | None = None


@dataclass(frozen=True)
class Answered(Effect):
    student: str
    answer: Literal["yes", "no"]
    on: Literal["invitation", "attendance_request"]


@dataclass(frozen=True)
class Placed(Effect):
    student: str
    side: Side | None
    how: PlacedHow


@dataclass(frozen=True)
class SideAssigned(Effect):
    """A going student's side is fixed or moved (plan §8 step 6, flexible students)."""

    student: str
    side: Side


@dataclass(frozen=True)
class Left(Effect):
    student: str
    reason: LeftReason


@dataclass(frozen=True)
class Message(Effect):
    """``sorry``: Yes with no room (D4); ``reoffer``: the same invitation offered again, for another
    spot (Q6) or after a "sorry" when a spot reopens; ``added``: automatic entry;
    ``waiting_list_invite``: the waiting-list invitation (today's template key of that meaning; today's
    ``waiting_list_offer`` is the engine's ``sorry``, ruling D8); ``side_moved``: a going student
    told their side was moved at ``last_invite_at`` (plan §4, §8 step 6)."""

    student: str
    kind: MessageKind


@dataclass(frozen=True)
class AttendanceRequested(Effect):
    """A reminder: the plan's attendance request (§8 step 3) sent to one student."""

    student: str


@dataclass(frozen=True)
class Absence(Effect):
    """A student left the session: the notice they gave by the cutoff (owner ruling D4). The engine
    never judges an absence justified or unjustified; the coach does, outside it."""

    student: str
    notice: AbsenceNotice


@dataclass(frozen=True)
class Refused(Effect):
    """A join turned down, with a code and never text; ``sides`` names the open sides on
    ``side_full``."""

    student: str
    action: Literal["direct_join", "waiting_list"]
    reason: RefusalCode
    sides: frozenset[Side] = frozenset()


@dataclass(frozen=True)
class WaitingListJoined(Effect):
    student: str
    list: Literal["coach", "students"]
    side: Side | None = None
    sides: WaitingListSides | None = None


@dataclass(frozen=True)
class WaitingListLeft(Effect):
    student: str
    list: Literal["coach", "students"]


@dataclass(frozen=True)
class CoachAlert(Effect):
    """No tier can take an open spot of ``spot_type`` (plan §6 step 4, engine-planning rule 11);
    ``spots`` is how many of that type were uncovered, so the store alerts again only when it changes.

    Everything the app needs to tell the coach, with no text to parse (PAD-915): the session and
    instant, ``reason`` a code (``constants.ALERT_NO_CANDIDATE``), the type's side (``None``: either
    side) and level, and the count. The store turns it into the coach's message (``COACH_ALERT``) or
    a dashboard card; the wording is the app's."""

    reason: AlertReason
    spot_type: SpotType
    spots: int


@dataclass(frozen=True)
class AlertCleared(Effect):
    """An alerted type is covered, gone or has a candidate again (engine-planning rule 11): the store
    drops its alert, so the alerts it keeps are only live ones."""

    spot_type: SpotType


@dataclass(frozen=True)
class InvitationClosed(Effect):
    """The student's open invitation for this session closed because they were placed in another
    session at the same hour (engine-answers rule 10, D4's one exception). Nothing is sent."""

    student: str


# --- semi-automatic mode (engine-planning rule 14, owner ruling D2) ----------------------------------

@dataclass(frozen=True)
class ApprovalRequest(Effect):
    """The run would invite students outside the approved queue, so it asks the coach instead:
    ``queues`` is each open spot type's queue from the dry run at ``at``. Replaces a pending one."""

    queues: SpotQueues
    request: str = ""                                    # the request's id; ApproveQueue names it


@dataclass(frozen=True)
class ApprovalWithdrawn(Effect):
    """The pending request went stale: nothing is left to ask for, or the coach turned automatic."""


@dataclass(frozen=True)
class QueueApproved(Effect):
    """The coach approved the pending request: ``approved`` (its queues without ``removed``) becomes
    the approved queue; ``removed`` adds to the students never invited automatically here."""

    approved: frozenset[str]
    removed: frozenset[str]


@dataclass(frozen=True)
class QueueDismissed(Effect):
    """The coach dismissed the pending request ("Ignorar"): nothing is sent automatically and no
    request is raised while the session's open spot types stay ``spots``."""

    spots: tuple[tuple[SpotType, int], ...]


@dataclass(frozen=True)
class QueueReopened(Effect):
    """A dismissal ends: the coach reopened the session from the class, or its spot count changed."""
