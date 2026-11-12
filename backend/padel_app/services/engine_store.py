"""The new invitation engine's store on the app's tables (PAD-916, swap plan §5): ``SessionStore``
over ``lesson_instances``, ``presences``, ``waiting_list_entries``, ``reminder_attempts`` and the
engine's own tables (``models/engine_store.py``).

Ids. A session is a ``LessonInstance`` id and a student a ``Player`` id, both as strings.

What lives where.
- Going: ``Presence`` is the truth. A row is going unless the engine recorded the student leaving (``status
  == "absent"`` with ``left_reason`` ``regular_no`` or ``cancel``): a no-show or the coach's attendance
  mark records attendance, and the student keeps the spot they held; the engine's
  placement (how, when, side moves, why a student left) is in its PAD-916 columns, and its side in
  ``assigned_side``. Rows are created only through ``lesson_service.enrol``.
- Regulars: the series roster (``player_in_lesson``); ``joined_at`` is that row's ``created_at``.
- Invitations: ``invitations``, one row per student per session (D1).
- Waiting lists: ``WaitingListEntry``; ``added_by == "coach"`` is the coach's list, anything else the
  students'. One row per student per session (``uq_waiting_session_player``): the engine refuses a
  student on one list who joins the other (``already_on_list``), and the store raises ``StoreConflict``
  if such a join ever reaches it.
- Attendance requests and their Yes: ``ReminderAttempt``.
- Pool (notifications.config rule 19, CONFIG-53): the coach's roster minus the session, the coach's
  exclusions for it (``engine_exclusions``), students who blocked automatic invitations or every
  solicitation, and the app's gates: the eligibility bar in force for the class
  (``passes_eligibility``, without its level rules for a class with no level, D3; the engine's own
  bar is left wide open by the config mapping), ``excludedPlayers``, ``noSameDayClass`` and, when
  ``excludeUnpaidSubscription`` is on, inactive accounts. ``maxInvitesPerStudentPerDay`` is not a
  pool gate: a student holding that many of the coach's invitations sent this club day is
  ``postponed``. ``reveal`` is a no-op: a student is visible once the app links them to the coach.
- Same hour (D-E26: the same start): every going presence the student has at that start, any coach,
  either engine. ``elsewhere`` sees only the new engine's invitations.

Writes. ``apply`` writes each effect's rows and logs it in ``engine_effects`` under a key that is the
effect's content: an effect applied twice is written once. Messages, pushes and the coach alert are
not sent here: their ``engine_effects`` rows are the outbox, sent after commit by ``dispatch``, which
claims a row before sending it, so a message is never sent twice.

Transactions. ``unit`` takes the session's ``lesson_instances`` row ``FOR UPDATE`` (a no-op on
SQLite) and commits on exit; the engine opens one unit at a time (PAD-915), so a tick and an answer
never plan one session on stale state. That lock is the last-spot claim (engine-answers rule 7).
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import logging
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timedelta
from typing import Callable, Iterable, Iterator, Mapping

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.store import UnitConflict
from padel_app.invitation_engine.snapshot import (
    Approval,
    PendingRequest,
    Elsewhere,
    Invitation,
    Placement,
    SessionSnapshot,
    Side,
    SpotType,
    Student,
    WaitingListEntry as EngineWaitingListEntry,
)
from padel_app.sql_db import db
from padel_app.services.level_ladder import ladder_index_map
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive, wall_to_utc_naive

log = logging.getLogger(__name__)

SIDE_FROM_APP = {"left": "L", "right": "R"}
SIDE_TO_APP = {"L": "left", "R": "right", None: None}
#: The engine's placement -> ``Presence.enrolment_source`` (its six values, classes.instance-enrollment rule 3).
ENROLMENT_SOURCE = {"regular": "roster", "invitation": "fill", "direct": "fill",
                    "auto_from_waiting_list": "fill", "regular_returns": "roster"}
#: Effects that reach a person: their ``engine_effects`` rows are the outbox.
OUTBOX = (fx.Invited, fx.Message, fx.AttendanceRequested, fx.CoachAlert, fx.ApprovalRequest)
#: How far back ``sessions()`` looks: the timeline's duties after a class (absences) end within a day.
AFTER_CLASS = timedelta(days=1)


class StoreConflict(Exception):
    """An effect the tables cannot hold (see the module docstring)."""


class SameHourConflict(StoreConflict, UnitConflict):
    """A placement another unit beat: the student is already going at that start. The unit rolls
    back; the next call plans on the committed state, where the student is busy at that hour."""


def _sides(app_side: str | None) -> frozenset[str]:
    return frozenset({SIDE_FROM_APP[app_side]}) if app_side in SIDE_FROM_APP else frozenset({"L", "R"})


def _encode(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, frozenset):
        return sorted((_encode(v) for v in value), key=json.dumps)
    if isinstance(value, SpotType):
        return [value.side, value.level]
    if isinstance(value, (tuple, list)):
        return [_encode(v) for v in value]
    return value


def effect_key(e: fx.Effect) -> tuple[str, dict]:
    """The effect as JSON, and its idempotency key (sha256 of its class and content)."""
    payload = {f.name: _encode(getattr(e, f.name)) for f in fields(e)}
    body = json.dumps([type(e).__name__, payload], sort_keys=True, default=str)
    return hashlib.sha256(body.encode()).hexdigest(), payload


def settings_for(session: str) -> EngineSettings:
    """The session's coach's settings (ruling D9), mapped from the stored ``NotificationConfig`` at
    every call (notifications.config rule 19, ``engine_settings_mapping``). A coach with no row reads
    today's defaults; none is created."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_settings_mapping import settings_from_config

    coach_id = TableStore().coach_of(session)
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    return settings_from_config(config if config is not None else NotificationConfig(coach_id=coach_id))


def _blocks_auto_invitations(user) -> bool:
    """The student's own block (``user_blocks_auto_invitations``): automatic invitations off, or every
    class-slot solicitation off."""
    return bool(getattr(user, "notif_block_auto_invitations", False) or getattr(user, "notif_block_all", False))


#: The engine's departures: a presence marked absent with one of these left the session; any other absence
#: (a no-show, the coach's attendance mark) records attendance and the student stays placed.
LEFT = ("regular_no", "cancel")


def _going(p) -> bool:
    return p.status != "absent" or p.left_reason not in LEFT


def _end_of(inst) -> datetime:
    """An occurrence's end, Lisbon wall clock: its own (start plus the lesson's duration), or an hour
    after its start when it has none (the engine's default length)."""
    return inst.end_datetime or inst.start_datetime + timedelta(hours=1)


def _overlapping_going(coach_id: int, iid: int, start: datetime, end: datetime, *,
                       student: int | None = None) -> list[tuple[int, int]]:
    """``(player_id, lesson_instance_id)`` of every student going to another occurrence at the same time
    as this one (engine-tiers rule 3, owner decision 11 with the 11-11 ruling kept): one of ``coach_id``'s
    whose ``[start, end)`` overlaps this one's (``a.start < b.end and b.start < a.end``; touching ends do
    not overlap), or any coach's starting at the same instant; not canceled; only ``student``'s when
    given. Read fresh (``populate_existing``) so a guard under the student's lock sees the other unit's
    commit."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.lesson_service import coach_instance_ids

    own = set(coach_instance_ids(coach_id)) - {iid}
    candidates = LessonInstance.query.filter(
        LessonInstance.id != iid, LessonInstance.status != "canceled",
        LessonInstance.start_datetime < end, LessonInstance.start_datetime >= start - timedelta(days=1)).all()
    overlapping = [o.id for o in candidates
                   if (o.id in own and _end_of(o) > start) or o.start_datetime == start]
    if not overlapping:
        return []
    q = db.session.query(Presence.player_id, Presence.lesson_instance_id).filter(
        Presence.lesson_instance_id.in_(overlapping),
        Presence.status.is_(None) | (Presence.status != "absent") | Presence.left_reason.is_(None)
        | Presence.left_reason.notin_(LEFT))
    if student is not None:
        q = q.filter(Presence.player_id == student)
    return [(pid, lid) for pid, lid in q.populate_existing().all()]


def _close_request_message(message_id: int | None, state: str) -> None:
    """An approval request stopped being pending: its Assistant message's metadata says how
    (``replaced``, ``approved``, ``dismissed``) with ``responded`` true, and one ``message_edited`` goes
    out after the commit (semi-auto-approval N4, SEMI-AUTO-APPROVAL-43)."""
    from padel_app.models import Message
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids

    msg = db.session.get(Message, message_id) if message_id else None
    if msg is None:
        return
    msg.msg_metadata = {**(msg.msg_metadata or {}), "state": state, "responded": True}
    db.session.flush()
    publish({"type": "message_edited", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))


def _refresh_bubbles(row, state: str, **extra) -> None:
    """Write the invitation's new ``state`` (invitations NB1: ``answered`` with ``response``, ``sorry``,
    ``reopened``, ``withdrawn``, ``closed_same_hour``) with its ``startsAt`` and ``countsUntil`` on its
    newest bubble (on every one for ``reopened``; engine-store rule 8), and publish one ``message_edited`` per message after the unit commits (``publish``
    waits for it inside a unit of work)."""
    from padel_app.models import Message
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.message_events import publish_message_event

    if not row.message_ids:
        return
    # Engine-store rule 8 (STORE-7 restated): once reopened, the older bubbles keep "reopened"; a later
    # state lands only on the newest, the one with live buttons.
    ids = list(row.message_ids) if state == "reopened" else list(row.message_ids)[-1:]
    start = db.session.get(LessonInstance, row.lesson_instance_id).start_datetime
    for msg in Message.query.filter(Message.id.in_(ids)).all():
        meta = dict(msg.msg_metadata or {})
        meta.update({"engine": "new", "invitationId": row.id, "lessonInstanceId": row.lesson_instance_id,
                     "state": state, "startsAt": wall_to_utc_naive(start).isoformat() if start else None,
                     "countsUntil": row.counts_until.isoformat() if row.counts_until else None, **extra})
        msg.msg_metadata = meta
        db.session.flush()
        # PAD-918 (INVITATIONS-124): once per reader, so the coach's copy keeps countsUntil live.
        publish_message_event("message_edited", msg)


@dataclass(frozen=True)
class _PoolGates:
    excluded_players: frozenset[str] = frozenset()        # the coach's excludedPlayers
    same_day: frozenset[str] = frozenset()                # noSameDayClass: another class that day
    exclude_inactive: bool = False
    eligible: Callable[[object], bool] | None = None   # None: no bar, everyone clears it
    failures: Callable[[object], list] | None = None   # the bar's structured failures (eligibility_failures)
    daily_cap: int | None = None


class TableStore:
    """``SessionStore`` on the app's tables. ``clock`` is naive UTC (the app's ``utcnow_naive``)."""

    def __init__(self, clock: Callable[[], datetime] = utcnow_naive) -> None:
        self.clock = clock

    # --- transactions --------------------------------------------------------------------

    @contextlib.contextmanager
    def unit(self, sessions: tuple[str, ...], students: tuple[str, ...] = ()) -> Iterator[None]:
        """One transaction: the students' ``players`` rows, then the sessions' ``lesson_instances``
        rows, each in id order, ``FOR UPDATE``; committed on exit, rolled back on an exception. The
        engine opens one at a time (PAD-915), so the order students -> session never cycles."""
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.tools.unit_of_work import unit_of_work

        with unit_of_work():                     # lesson_service.enrol flushes inside it instead of committing
            for pid in sorted({int(s) for s in students}):
                self._lock_student(pid)
            for sid in sorted(int(s) for s in sessions):
                db.session.query(LessonInstance.id).filter(LessonInstance.id == sid).with_for_update().one_or_none()
            yield

    # --- reading -------------------------------------------------------------------------

    def sessions(self) -> tuple[str, ...]:
        from padel_app.models import EngineSession
        from padel_app.models.lesson_instances import LessonInstance

        from padel_app.models.notification_config import NotificationConfig
        from padel_app.services.notification_service import effective_auto_invites

        since = utc_to_wall_naive(self.clock() - AFTER_CLASS)
        rows = (db.session.query(EngineSession.coach_id, LessonInstance)
                .join(LessonInstance, LessonInstance.id == EngineSession.lesson_instance_id)
                .filter(LessonInstance.start_datetime >= since, LessonInstance.status != "canceled",
                        LessonInstance.notifications_enabled.is_(True))
                .order_by(LessonInstance.start_datetime, LessonInstance.id).all())
        coaches = {coach_id for coach_id, _ in rows}
        # notifications.config rule 19 (CONFIG-54): the coach's switch and the class's own are the app's.
        on = {c.coach_id for c in NotificationConfig.query.filter(
            NotificationConfig.coach_id.in_(coaches or [-1]), NotificationConfig.auto_notify_enabled.is_(True)).all()}
        return tuple(str(inst.id) for coach_id, inst in rows if coach_id in on and effective_auto_invites(inst))

    def has_session(self, session: str) -> bool:
        from padel_app.models import EngineSession

        return db.session.get(EngineSession, int(session)) is not None

    def coach_of(self, session: str) -> int:
        from padel_app.models import EngineSession

        return db.session.get(EngineSession, int(session)).coach_id

    def snapshot(self, session: str) -> SessionSnapshot:
        from padel_app.models import EngineExclusion, EngineInvitation, EngineSession, ReminderAttempt, User
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
        from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.players import Player
        from padel_app.models.presences import Presence
        from padel_app.models.waiting_list_entry import WaitingListEntry

        iid = int(session)
        es = db.session.get(EngineSession, iid)
        inst = db.session.get(LessonInstance, iid)
        coach_id = es.coach_id
        presences = Presence.query.filter_by(lesson_instance_id=iid).all()
        roster_rows = (Association_PlayerLesson.query.filter_by(lesson_id=inst.lesson_id).all()
                       if inst.lesson_id is not None else [])
        joined = {str(r.player_id): r.created_at for r in roster_rows}
        regular_ids = {str(p.player_id) for p in presences if self._placement(p).how in ("regular", "regular_returns")}
        going = tuple(self._placement(p) for p in presences if _going(p))
        absent = frozenset(str(p.player_id) for p in presences
                           if p.status == "absent" and p.left_reason == "regular_no")
        invitations = tuple(self._invitation(r) for r in EngineInvitation.query.filter_by(lesson_instance_id=iid)
                            .order_by(EngineInvitation.sent_at, EngineInvitation.id).all())
        waiting = tuple(
            EngineWaitingListEntry(str(w.player_id), "coach" if w.added_by == "coach" else "students", w.joined_at,
                                   SIDE_FROM_APP.get(w.side), w.sides)
            for w in WaitingListEntry.query.filter_by(lesson_instance_id=iid, is_active=True)
            .order_by(WaitingListEntry.joined_at, WaitingListEntry.id).all())

        links = Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()
        users = {pid: u for pid, u in db.session.query(Player.id, User)
                 .join(User, User.id == Player.user_id)
                 .filter(Player.id.in_([lk.player_id for lk in links] or [-1])).all()}
        gates = self._pool_gates(coach_id, inst, links)
        own = self._own_blocks(inst, links, users)
        # Engine-tiers rule 4 (TIERS-19): the student's own blocks hold on every list, the coach's too.
        blocked = {pid for pid, codes in own.items() if codes}
        inside = {p.student for p in going} | regular_ids
        students = self._students(coach_id, links, users)
        out = self._pool_reasons(iid, links, users, gates, own)
        pool = tuple(students[str(lk.player_id)] for lk in sorted(links, key=lambda lk: lk.player_id)
                     if str(lk.player_id) not in inside and not out[str(lk.player_id)])

        start = inst.start_datetime
        others = LessonInstance.query.filter(
            LessonInstance.id != iid,
            LessonInstance.start_datetime >= datetime.combine(start.date(), datetime.min.time()),
            LessonInstance.start_datetime < datetime.combine(start.date() + timedelta(days=1), datetime.min.time()),
        ).all()
        # Engine-tiers rule 3, owner decision 11: busy is going to another of this coach's sessions whose
        # [start, end) overlaps this one's (touching ends do not overlap).
        end = _end_of(inst)
        busy = frozenset(str(pid) for pid, _ in _overlapping_going(coach_id, iid, start, end))
        elsewhere = self._elsewhere(others, coach_id)

        attempts: dict[str, list[datetime]] = {}
        confirmed = set()
        for a in ReminderAttempt.query.filter_by(lesson_instance_id=iid).order_by(ReminderAttempt.sent_at).all():
            if a.sent_at is not None:
                attempts.setdefault(str(a.player_id), []).append(a.sent_at)
            if a.response == "yes":
                confirmed.add(str(a.player_id))
        # Engine-store rule 6 (reminders rule 22, PAD-489): a student the system recorded as coming,
        # when the class was created after its reminder time, is confirmed like a Yes.
        confirmed |= {str(p.player_id) for p in presences if p.response == "confirmed"}

        named = ({st.id for st in pool} | inside | {i.student for i in invitations} | {w.student for w in waiting})
        missing = [int(s) for s in named if s not in students]
        if missing:                                        # a regular or a waiting student off the coach's roster
            students.update(self._students(coach_id, [], {}, extra=missing))
        return SessionSnapshot(
            id=session, level=self._level(ladder_index_map(coach_id), inst.level_id), capacity=inst.effective_max_players, start=start,
            end=end,
            regulars=tuple(students[s] for s in sorted(regular_ids, key=int) if s in students),
            going=going, invitations=invitations, waiting_list=waiting, pool=pool, absent=absent,
            said_no=frozenset(i.student for i in invitations if i.answer == "no"),
            confirmed=frozenset(confirmed), busy_same_time=busy, elsewhere=elsewhere,
            alerted={SpotType(side, level): spots for side, level, spots in (es.alerted or [])},
            approval=Approval(
                approved_groups=frozenset(es.approved_groups or ()), removed=frozenset(es.removed or ()),
                pending=tuple(PendingRequest(p["tier"], p["request"],
                                             tuple((SpotType(*spot), tuple(ids)) for spot, ids in p["queues"]))
                              for p in es.pending or ()),
                dismissed_groups=tuple((tier, tuple((SpotType(*spot), n) for spot, n in spots))
                                       for tier, spots in es.dismissed_groups or ())),
            students={s: students[s] for s in named if s in students},
            joined_at={s: joined[s] for s in regular_ids if s in joined},
            last_moved_at={str(p.player_id): p.side_moved_at for p in presences if p.side_moved_at is not None},
            attendance_requested={s: tuple(v) for s, v in attempts.items()},
            blocked=frozenset(blocked),
            postponed=self._capped_today(coach_id, gates.daily_cap, {st.id for st in pool}),
        )

    @staticmethod
    def _own_blocks(inst, links, users) -> dict[str, list[str]]:
        """Each linked student's own refusals of automatic invitations to this session, as codes:
        ``blocks_auto_invitations``, ``blocks_all`` (``user_blocks_auto_invitations``) and
        ``availability_blocker`` (``blocked_user_ids_for_window``, wall clock as stored)."""
        from padel_app.services.student_availability_service import blocked_user_ids_for_window

        out: dict[str, list[str]] = {str(lk.player_id): [] for lk in links}
        for lk in links:
            user = users.get(lk.player_id)
            if getattr(user, "notif_block_auto_invitations", False):
                out[str(lk.player_id)].append("blocks_auto_invitations")
            if getattr(user, "notif_block_all", False):
                out[str(lk.player_id)].append("blocks_all")
        by_user = {u.id: pid for pid, u in users.items() if u is not None}
        for uid in blocked_user_ids_for_window(list(by_user), inst.start_datetime, inst.end_datetime):
            if uid in by_user and str(by_user[uid]) in out:
                out[str(by_user[uid])].append("availability_blocker")
        return out

    # --- the invitation bubble (invitations NB1a): the outbox's sender and the coach's withdrawal ---------

    @staticmethod
    def invitation_id(session: str, student: str) -> int | None:
        """The ``invitations`` row id of ``student``'s one invitation for ``session`` (D1): the bubble's
        ``invitationId``."""
        from padel_app.models import EngineInvitation

        row = EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).first()
        return None if row is None else row.id

    @staticmethod
    def attach_request_message(session: str, request_id: str, message_id: int) -> bool:
        """Keep ``message_id`` (the Assistant message the outbox's sender posted for approval request
        ``request_id``) on that pending request, so the message follows it. False, and nothing kept,
        when that request is no longer pending."""
        from padel_app.models import EngineSession

        es = db.session.get(EngineSession, int(session))
        if es is None or not any(p["request"] == request_id for p in es.pending or ()):
            return False
        es.pending = [{**p, "message_id": int(message_id)} if p["request"] == request_id else p for p in es.pending]
        return True

    @staticmethod
    def attach_message(invitation_id: int, message_id: int) -> None:
        """Keep ``message_id`` (an invitation or re-offer bubble the outbox's sender posted) on the
        invitation, so the store keeps its ``state`` current."""
        from padel_app.models import EngineInvitation

        row = db.session.get(EngineInvitation, int(invitation_id))
        if row is not None and int(message_id) not in (row.message_ids or []):
            row.message_ids = [*(row.message_ids or []), int(message_id)]

    @staticmethod
    def withdraw(invitation_id: int, at: datetime) -> bool:
        """The coach withdraws an open invitation by hand (invitations rule 19; D4 binds the engine, not the
        coach): it closes with ``closed_reason`` "withdrawn" and its bubbles say so. False when it is
        missing, answered or already closed. Call it inside ``unit((session,))``."""
        from padel_app.models import EngineInvitation

        row = db.session.get(EngineInvitation, int(invitation_id))
        if row is None or row.answer is not None or row.closed_at is not None:
            return False
        row.closed_at, row.closed_reason = at, "withdrawn"
        _refresh_bubbles(row, "withdrawn")
        return True

    @staticmethod
    def _pool_reasons(iid: int, links, users, gates: _PoolGates, own: Mapping[str, list[str]],
                      *, explain: bool = False) -> dict[str, list[dict]]:
        """Why each linked student is kept out of the session's pool (notifications.config rule 19,
        CONFIG-53; engine-tiers rule 4): every reason, as ``{"code": …}`` records, empty for a student
        the gates admit. The one source of the pool (``snapshot``) and of its explanation
        (``pool_exclusions``). With ``explain`` an eligibility record carries the bar's structured
        ``failures``; without it the bar short-circuits."""
        from padel_app.models import EngineExclusion

        for_session = {str(r.player_id) for r in EngineExclusion.query.filter_by(lesson_instance_id=iid).all()}
        out: dict[str, list[dict]] = {}
        for lk in links:
            pid = str(lk.player_id)
            reasons = [{"code": c} for c in own.get(pid, ())]
            if pid in for_session:
                reasons.append({"code": "excluded_for_session"})
            if pid in gates.excluded_players:
                reasons.append({"code": "excluded_players"})
            if pid in gates.same_day:
                reasons.append({"code": "same_day_class"})
            if gates.exclude_inactive and getattr(users.get(lk.player_id), "status", "active") != "active":
                reasons.append({"code": "inactive_account"})
            if gates.eligible is not None:
                if explain:
                    failures = gates.failures(lk)
                    if failures:
                        reasons.append({"code": "eligibility", "failures": failures})
                elif not gates.eligible(lk):
                    reasons.append({"code": "eligibility"})
            out[pid] = reasons
        return out

    def pool_exclusions(self, session: str) -> dict[str, list[dict]]:
        """Of the coach's students, those the session's pool keeps out and every reason why
        (notifications.invite-simulation, new-engine readings: the caller explains ``not_in_pool``).
        Read-only; the same gates ``snapshot`` builds ``pool`` with."""
        from padel_app.models import User
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.players import Player

        iid = int(session)
        inst = db.session.get(LessonInstance, iid)
        coach_id = self.coach_of(session)
        links = Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()
        users = {pid: u for pid, u in db.session.query(Player.id, User)
                 .join(User, User.id == Player.user_id)
                 .filter(Player.id.in_([lk.player_id for lk in links] or [-1])).all()}
        gates = self._pool_gates(coach_id, inst, links)
        reasons = self._pool_reasons(iid, links, users, gates, self._own_blocks(inst, links, users), explain=True)
        return {pid: r for pid, r in reasons.items() if r}

    @staticmethod
    def _approval(es, e: fx.Effect) -> None:
        """The coach's approval state per group (engine-store rule 5; owner decisions 5, 10): a request
        replaces its group's pending one; an approval adds the group to the approved ones, adds to the
        removed students and ends that group's request; a dismissal ends it and keeps the spot counts it
        saw; a reopening ends the group's dismissal; a withdrawal ends the request it names; leaving
        semi-automatic clears the approved groups. A request that stops pending has its Assistant message
        say why (semi-auto-approval N4)."""
        pending = list(es.pending or [])

        def end(entry, state):
            pending.remove(entry)
            _close_request_message(entry.get("message_id"), state)

        if isinstance(e, fx.ApprovalRequest):
            old = next((p for p in pending if p["tier"] == e.tier), None)
            keep = old is not None and old["request"] == e.request          # the same request raised again
            if old is not None and not keep:
                end(old, "replaced")
            entry = {"tier": e.tier, "request": e.request, "queues": _encode(e.queues),
                     "message_id": old.get("message_id") if keep else None}
            pending = [entry if p is old else p for p in pending] if keep else [*pending, entry]
        elif isinstance(e, fx.ApprovalWithdrawn):
            for p in [p for p in pending if p["request"] == e.request]:
                end(p, "replaced")
        elif isinstance(e, fx.GroupApproved):
            es.approved_groups = sorted({*(es.approved_groups or ()), e.tier})
            es.removed = sorted(set(es.removed or ()) | e.removed, key=int)
            for p in [p for p in pending if p["tier"] == e.tier]:
                end(p, "approved")
        elif isinstance(e, fx.GroupDismissed):
            for p in [p for p in pending if p["tier"] == e.tier]:
                end(p, "dismissed")
            es.dismissed_groups = [*[d for d in es.dismissed_groups or () if d[0] != e.tier], [e.tier, _encode(e.spots)]]
        elif isinstance(e, fx.GroupReopened):
            es.dismissed_groups = [d for d in es.dismissed_groups or () if d[0] != e.tier]
        elif isinstance(e, fx.GroupsCleared):
            es.approved_groups = []
        es.pending = pending

    @staticmethod
    def _level(ladder: Mapping[int, int], level_id: int | None) -> int | None:
        """``level_id``'s position on the coach's ladder, 1 the best and consecutive, as the app's
        level rules count it (``ladder``: ``ladder_index_map``); a level off that ladder is ``None``,
        which every level rule fails (engine-tiers rule 13)."""
        position = ladder.get(level_id) if level_id is not None else None
        return None if position is None else position + 1

    @staticmethod
    def _placement(p) -> Placement:
        how = p.placed_how or ("regular" if p.enrolment_source == "roster" else "invitation")
        return Placement(str(p.player_id), SIDE_FROM_APP.get(p.assigned_side), how, p.placed_at or p.created_at)

    @staticmethod
    def _invitation(r) -> Invitation:
        return Invitation(str(r.player_id), frozenset(SpotType(s, lv) for s, lv in r.offer), r.side_named, r.tier,
                          r.sent_at, r.answer, r.answered_at, r.counts_until, r.sorry_at, r.closed_at)

    @staticmethod
    def _pool_gates(coach_id: int, inst, links) -> _PoolGates:
        """The coach's stored gates on the pool (notifications.config rule 19, CONFIG-53), read
        through the old engine's own functions so a coach's bar means the same on both engines."""
        from padel_app.models.notification_config import NotificationConfig
        from padel_app.services.notification_service import (
            _players_with_a_class_that_day,
            _RosterFacts,
            _vacancy_level,
            effective_eligibility,
            eligibility_failures,
            passes_eligibility,
        )

        config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
        if config is None:
            return _PoolGates()
        restrictions = config.get_restrictions()
        excluded_players, same_day = set(), set()
        if (restrictions.get("excludedPlayers") or {}).get("enabled"):
            excluded_players = {str(pid) for pid in restrictions["excludedPlayers"].get("playerIds") or []}
        if (restrictions.get("noSameDayClass") or {}).get("enabled"):
            same_day = {str(pid) for pid in _players_with_a_class_that_day([lk.player_id for lk in links], inst)}
        rules = effective_eligibility(inst, coach_id, config)
        if rules and _vacancy_level(None, inst)[0] is None:
            # Owner ruling D3 (engine-tiers rule 13, TIERS-18): a class with no level applies no level
            # rule, where today's bar fails everyone closed (PAD-86); the bar's other rules stand.
            rules = [r for r in rules if r.get("attribute") != "level"]
        facts = _RosterFacts(coach_id, [lk.player_id for lk in links]) if rules else None
        cap = restrictions.get("maxInvitesPerStudentPerDay") or {}
        return _PoolGates(
            excluded_players=frozenset(excluded_players), same_day=frozenset(same_day),
            exclude_inactive=bool((restrictions.get("excludeUnpaidSubscription") or {}).get("enabled")),
            eligible=(lambda lk: passes_eligibility(lk, inst, coach_id, rules, facts=facts)) if rules else None,
            failures=(lambda lk: eligibility_failures(lk, inst, coach_id, rules, facts=facts)) if rules else None,
            daily_cap=int(cap["value"]) if cap.get("enabled") and cap.get("value") is not None else None,
        )

    def _capped_today(self, coach_id: int, cap: int | None, ids: set[str]) -> frozenset[str]:
        """Of ``ids``, those who already hold ``cap`` of this coach's new-engine invitations sent this
        club-local day (``maxInvitesPerStudentPerDay``, notifications.config rule 6b)."""
        from sqlalchemy import func

        from padel_app.models import EngineInvitation
        from padel_app.utils.dates import club_day_start_utc

        if cap is None or not ids:
            return frozenset()
        rows = (db.session.query(EngineInvitation.player_id, func.count(EngineInvitation.id))
                .filter(EngineInvitation.coach_id == coach_id,
                        EngineInvitation.player_id.in_([int(s) for s in ids]),
                        EngineInvitation.sent_at >= club_day_start_utc(self.clock()))
                .group_by(EngineInvitation.player_id).all())
        return frozenset(str(pid) for pid, n in rows if n >= cap)

    def _students(self, coach_id: int, links, users, extra: Iterable[int] = ()) -> dict[str, Student]:
        """Each linked player as the engine's ``Student``, with the coach's ordering facts (PAD-915)."""
        from padel_app.models import User
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
        from padel_app.models.players import Player
        from padel_app.services.notification_service import (
            _attendance_counts_for,
            _unjustified_absence_counts_for,
            makeups_owed_for,
        )

        extra = list(extra)
        if extra:
            links = list(links) + Association_CoachPlayer.query.filter(
                Association_CoachPlayer.coach_id == coach_id, Association_CoachPlayer.player_id.in_(extra)).all()
            users = {**users, **{pid: u for pid, u in db.session.query(Player.id, User)
                                 .join(User, User.id == Player.user_id).filter(Player.id.in_(extra)).all()}}
        by_player = {lk.player_id: lk for lk in links}
        ids = sorted(set(by_player) | set(extra))
        if not ids:
            return {}
        counts = _attendance_counts_for(ids, coach_id)
        ladder = ladder_index_map(coach_id)
        owed = makeups_owed_for(ids, coach_id)
        unjustified = _unjustified_absence_counts_for(ids, coach_id)
        out = {}
        for pid in ids:
            lk = by_player.get(pid)
            total, present, justified = counts.get(pid, (0, 0, 0))
            user = users.get(pid)
            out[str(pid)] = Student(
                str(pid), self._level(ladder, lk.level_id) if lk else None, _sides(lk.side if lk else None), present,
                makeups_owed=owed.get(pid, 0), attendance_rate=(present / total) if total else 0.0,
                unjustified_absences=unjustified.get(pid, 0), justified_absences=justified,
                active=getattr(user, "status", "active") == "active",
                blocks_all=bool(getattr(user, "notif_block_all", False)),
                subscription_status=getattr(user, "status", None))
        return out

    def _elsewhere(self, others, coach_id: int) -> tuple[Elsewhere, ...]:
        from padel_app.models import EngineInvitation
        from padel_app.models.presences import Presence

        ids = [o.id for o in others]
        if not ids:
            return ()
        rows = (EngineInvitation.query.filter(EngineInvitation.lesson_instance_id.in_(ids),
                                              EngineInvitation.answer.is_(None), EngineInvitation.closed_at.is_(None))
                .order_by(EngineInvitation.lesson_instance_id, EngineInvitation.sent_at, EngineInvitation.id).all())
        if not rows:
            return ()
        by_id = {o.id: o for o in others}
        # Engine-tiers rule 3: another of this coach's sessions is at the same time when it overlaps,
        # another coach's only at the same start (the engine reads same_coach, snapshot.same_time).
        from padel_app.services.lesson_service import coach_instance_ids

        own = set(coach_instance_ids(coach_id))
        going: dict[int, tuple[Placement, ...]] = {}
        for iid in {r.lesson_instance_id for r in rows}:
            going[iid] = tuple(self._placement(p) for p in Presence.query.filter_by(lesson_instance_id=iid).all()
                               if _going(p))
        return tuple(Elsewhere(str(r.lesson_instance_id), by_id[r.lesson_instance_id].start_datetime,
                               self._invitation(r), by_id[r.lesson_instance_id].effective_max_players,
                               going[r.lesson_instance_id], end=_end_of(by_id[r.lesson_instance_id]),
                               same_coach=r.lesson_instance_id in own) for r in rows)

    # --- seeding (the app's side of a session) --------------------------------------------

    def add_session(self, session: str, level: int | None, capacity: int, start: datetime,
                    regulars: Iterable[tuple[Student, Side | None]], at: datetime,
                    joined_at: Mapping[str, datetime] | None = None, end: datetime | None = None) -> None:
        """The new engine takes over an existing occurrence (the app created it): its row in
        ``engine_sessions`` and a going presence per regular. ``level``, ``capacity``, ``start`` and
        ``end`` are the occurrence's own and are not written; ``joined_at`` is the roster's."""
        from padel_app.models import EngineSession
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.services import lesson_service as ls

        iid = int(session)
        if db.session.get(EngineSession, iid) is not None:
            raise ValueError(f"session {session} already exists")
        inst = db.session.get(LessonInstance, iid)
        # The occurrence's coach is the app's "the coach": the first of coaches_for, which falls back to
        # the lesson's coach when the occurrence has no row of its own (a co-coached class has several).
        coach = ls.primary_coach(inst)
        if coach is None:
            raise ValueError(f"session {session} has no coach")
        db.session.add(EngineSession(lesson_instance_id=iid, coach_id=coach.id, alerted=[]))
        for student, side in regulars:
            presence = ls.enrol(int(student.id), inst, "roster", new_engine=True)
            presence.placed_how, presence.placed_at = "regular", at
            presence.assigned_side = SIDE_TO_APP[side]
        db.session.flush()

    def reveal(self, student: str) -> None:
        """Visibility is the app's coach–player link; nothing to write."""

    def exclude(self, session: str, student: str) -> None:
        from padel_app.models import EngineExclusion

        if EngineExclusion.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).first() is None:
            db.session.add(EngineExclusion(lesson_instance_id=int(session), player_id=int(student)))
            db.session.flush()

    # --- writing -------------------------------------------------------------------------

    def apply(self, effects: Iterable[fx.Effect]) -> None:
        from padel_app.models import EngineEffect

        for e in effects:
            key, payload = effect_key(e)
            if EngineEffect.query.filter_by(key=key).first() is not None:
                log.info("engine_store: effect already applied, skipped: %s", key)
                continue
            student = getattr(e, "student", None)
            db.session.add(EngineEffect(
                lesson_instance_id=int(e.session), player_id=int(student) if student else None,
                kind=type(e).__name__, at=e.at, payload=payload, key=key,
                dispatched_at=None if isinstance(e, OUTBOX) else e.at))
            self._write(e)
        db.session.flush()

    @staticmethod
    def _lock_student(pid: int) -> None:
        from padel_app.models.players import Player

        db.session.query(Player.id).filter(Player.id == pid).with_for_update().one_or_none()

    def _guard_same_hour(self, e: fx.Placed) -> None:
        """Never two sessions at the same hour (engine-answers rule 10; engine-tiers rule 3, owner decision
        11: another of the coach's sessions whose interval overlaps), whatever path placed the student:
        with the student's row locked (waiting for any other unit placing them to commit), a going
        presence in an overlapping session refuses the placement and rolls the unit back."""
        from padel_app.models.lesson_instances import LessonInstance

        self._lock_student(int(e.student))
        inst = db.session.get(LessonInstance, int(e.session))
        coach_id = self.coach_of(e.session)
        clash = _overlapping_going(coach_id, inst.id, inst.start_datetime, _end_of(inst), student=int(e.student))
        if clash:
            raise SameHourConflict(f"{e.student} is already going to {clash[0][1]}, which overlaps {e.session}")

    @staticmethod
    def _invitation_row(e):
        from padel_app.models import EngineInvitation

        return EngineInvitation.query.filter_by(lesson_instance_id=int(e.session), player_id=int(e.student)).first()

    @staticmethod
    def _presence(e):
        from padel_app.models.presences import Presence

        return Presence.query.filter_by(lesson_instance_id=int(e.session), player_id=int(e.student)).first()

    def _write(self, e: fx.Effect) -> None:
        from padel_app.models import EngineInvitation, EngineSession, ReminderAttempt
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.waiting_list_entry import WaitingListEntry
        from padel_app.services import lesson_service as ls
        from padel_app.services.presence_response import record_response

        iid = int(e.session)
        if isinstance(e, (fx.ApprovalRequest, fx.ApprovalWithdrawn, fx.GroupApproved, fx.GroupDismissed,
                          fx.GroupReopened, fx.GroupsCleared)):
            self._approval(db.session.get(EngineSession, iid), e)
        elif isinstance(e, fx.AlertCleared):                       # engine-planning rule 11 (PLANNING-40)
            es = db.session.get(EngineSession, iid)
            es.alerted = [a for a in (es.alerted or []) if (a[0], a[1]) != (e.spot_type.side, e.spot_type.level)]
        elif isinstance(e, fx.CoachAlert):
            if e.spot_type is not None:                           # one alert per session and type (rule 11)
                es = db.session.get(EngineSession, iid)
                kept = [a for a in (es.alerted or []) if (a[0], a[1]) != (e.spot_type.side, e.spot_type.level)]
                es.alerted = kept + [[e.spot_type.side, e.spot_type.level, e.spots]]
        elif isinstance(e, fx.Invited):
            if self._invitation_row(e) is not None:
                raise StoreConflict(f"a second invitation for {e.student} in {e.session} (D1)")
            db.session.add(EngineInvitation(
                lesson_instance_id=iid, player_id=int(e.student), coach_id=db.session.get(EngineSession, iid).coach_id,
                offer=[[t.side, t.level] for t in sorted(e.offer, key=lambda t: (t.side or "", t.level or 0))],
                side_named=e.side_named, tier=e.tier, sent_at=e.at, counts_until=e.counts_until))
        elif isinstance(e, (fx.Sorry, fx.Reopened, fx.InvitationClosed)):
            row = self._invitation_row(e)
            if row is None or row.answer is not None or row.closed_at is not None:
                log.info("engine_store: %s for a closed or missing invitation, skipped", type(e).__name__)
            elif isinstance(e, fx.Sorry):
                row.sorry_at = e.at
                _refresh_bubbles(row, "sorry")
            elif isinstance(e, fx.Reopened):
                row.offer = [[t.side, t.level] for t in sorted(e.offer, key=lambda t: (t.side or "", t.level or 0))]
                row.side_named, row.tier, row.counts_until, row.sorry_at = e.side_named, e.tier, e.counts_until, None
                row.reopened_at = e.at
                _refresh_bubbles(row, "reopened")             # its waiting-list invitation's bubble is attached after
            else:
                row.closed_at, row.closed_reason = e.at, "same_hour"
                _refresh_bubbles(row, "closed_same_hour")
        elif isinstance(e, fx.Answered) and e.on == "invitation":
            row = self._invitation_row(e)
            if row is not None and row.answer is None and row.closed_at is None:
                row.answer, row.answered_at, row.answered_by = e.answer, e.at, e.by
                _refresh_bubbles(row, "answered", response=e.answer, answeredBy=e.by)
        elif isinstance(e, fx.Answered):
            if e.answer == "yes":
                attempt = (ReminderAttempt.query.filter_by(lesson_instance_id=iid, player_id=int(e.student))
                           .order_by(ReminderAttempt.sent_at.desc(), ReminderAttempt.id.desc()).first())
                if attempt is not None:
                    attempt.response, attempt.responded_at = "yes", e.at
                else:
                    db.session.add(ReminderAttempt(lesson_instance_id=iid, player_id=int(e.student), number=0,
                                                   response="yes", responded_at=e.at))
        elif isinstance(e, fx.Placed):
            self._guard_same_hour(e)
            inst = db.session.get(LessonInstance, iid)
            presence = ls.enrol(int(e.student), inst, ENROLMENT_SOURCE[e.how], confirmed=e.how != "regular",
                                new_engine=True)
            presence.status, presence.justification, presence.left_reason = None, None, None
            presence.placed_how, presence.placed_at = e.how, e.at
            presence.assigned_side = SIDE_TO_APP[e.side]
        elif isinstance(e, fx.SideAssigned):
            presence = self._presence(e)
            before = SIDE_FROM_APP.get(presence.assigned_side)
            if before is not None and before != e.side:            # a first side is not a move
                presence.side_moved_at = e.at
            presence.assigned_side = SIDE_TO_APP[e.side]
        elif isinstance(e, fx.Left):
            presence = self._presence(e)
            if presence is not None:
                presence.status, presence.left_reason = "absent", e.reason
        elif isinstance(e, fx.Absence):
            # Owner ruling D4 (engine-timeline rule 5, TIMELINE-20): the engine records the notice, never
            # the coach's justification. A late No is the student's "cancelled", so the app derives it
            # late; an on-time No is "declined", or "proactive_decline" before they were asked (no
            # attendance request sent yet), neither ever late (attendance.confirm rule 12). Each at the
            # effect's time. A no-show (at or after the start) and an automatic entrant's No ("none")
            # record no response.
            presence = self._presence(e)
            start = wall_to_utc_naive(db.session.get(LessonInstance, iid).start_datetime)
            if presence is not None and e.notice != "none" and e.at < start:
                if e.notice == "late":
                    response = "cancelled"
                else:
                    asked = ReminderAttempt.query.filter(
                        ReminderAttempt.lesson_instance_id == iid, ReminderAttempt.player_id == int(e.student),
                        ReminderAttempt.sent_at.isnot(None), ReminderAttempt.sent_at <= e.at).first()
                    response = "declined" if asked is not None else "proactive_decline"
                record_response(presence, response, when=e.at)
        elif isinstance(e, fx.WaitingListJoined):
            added_by = "coach" if e.list == "coach" else "student"
            row = WaitingListEntry.query.filter_by(lesson_instance_id=iid, player_id=int(e.student)).first()
            if row is not None and row.is_active and (row.added_by == "coach") != (e.list == "coach"):
                raise StoreConflict(f"{e.student} already waits on the other list of {e.session}")
            if row is None:
                row = WaitingListEntry(lesson_instance_id=iid, player_id=int(e.student),
                                       coach_id=db.session.get(EngineSession, iid).coach_id)
                db.session.add(row)
            row.is_active, row.added_by, row.joined_at = True, added_by, e.at
            row.side, row.sides = SIDE_TO_APP[e.side], e.sides
        elif isinstance(e, fx.WaitingListLeft):
            row = WaitingListEntry.query.filter_by(lesson_instance_id=iid, player_id=int(e.student),
                                                   is_active=True).first()
            if row is not None and (row.added_by == "coach") == (e.list == "coach"):
                row.is_active = False
        elif isinstance(e, fx.AttendanceRequested):
            exists = ReminderAttempt.query.filter_by(lesson_instance_id=iid, player_id=int(e.student),
                                                     sent_at=e.at).first()
            if exists is None:
                presence = self._presence(e)
                n = ReminderAttempt.query.filter_by(lesson_instance_id=iid, player_id=int(e.student)).count()
                db.session.add(ReminderAttempt(lesson_instance_id=iid, player_id=int(e.student),
                                               presence_id=presence.id if presence else None, number=n + 1,
                                               sent_at=e.at))
        # Message, Refused: the engine_effects row is the record (and the outbox for a Message).


#: The engine's invitation kinds: what a student who blocked everything never receives (the backstop).
INVITATION_KINDS = ("waiting_list_invite",)


def _refused_by_block(row) -> bool:
    """The send-time backstop (student-block-preferences rule 8, new-engine section): an invitation, a
    re-offer or a waiting-list invitation to a student with ``notif_block_all`` is claimed and not
    delivered; a "sorry" and every other kind still are."""
    from padel_app.models import User
    from padel_app.models.players import Player

    is_invitation = row.kind == "Invited" or (row.kind == "Message" and (row.payload or {}).get("kind") in INVITATION_KINDS)
    if not is_invitation or row.player_id is None:
        return False
    user = db.session.query(User).join(Player, Player.user_id == User.id).filter(Player.id == row.player_id).first()
    return bool(getattr(user, "notif_block_all", False))


def dispatch(send: Callable[["object"], None], *, now: datetime | None = None, limit: int = 200) -> int:
    """Send the outbox after commit: each undispatched ``engine_effects`` row is claimed (its
    ``dispatched_at`` set and committed) before ``send`` sees it, so no message goes out twice; a
    ``send`` that raises leaves the row claimed and logged, never resent. Returns how many were sent."""
    from padel_app.models import EngineEffect

    sent = 0
    for row_id, in (db.session.query(EngineEffect.id).filter(EngineEffect.dispatched_at.is_(None))
                    .order_by(EngineEffect.id).limit(limit).all()):
        claimed = (db.session.query(EngineEffect).filter(EngineEffect.id == row_id, EngineEffect.dispatched_at.is_(None))
                   .update({EngineEffect.dispatched_at: now or utcnow_naive()}, synchronize_session=False))
        db.session.commit()
        if not claimed:
            continue
        row = db.session.get(EngineEffect, row_id)
        if _refused_by_block(row):
            continue
        try:
            send(row)
            sent += 1
        except Exception:  # noqa: BLE001
            log.exception("engine_store: sending effect %s failed; not retried", row_id)
    return sent
