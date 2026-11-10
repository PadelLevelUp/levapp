"""The `today` adapter: drives the engine on origin/staging (notification_service.py) through a
scenario's timeline and reads its effects back as the runner's normalized records (design §5, §7).

Clock. Every tick and every event pins the app clock (``tests.helpers.pin_clock``) to the simulated
instant AND passes ``now=`` explicitly. ``now=`` alone is not enough on today's engine: several
paths read the wall clock (``vacancy.last_activity_at`` in ``_send_invitation_batch``, the
next-on-decline send, the fan-out after a regular's No, ``WaitingListEntry.joined_at`` and every
model ``created_at``/``sent_at`` default). Scenario times are Lisbon wall-clock; class starts are
stored as wall-clock (as the app does) and ``now`` is naive UTC.

Scheduler. No APScheduler runs in tests, so the adapter does what its jobs would do:
``trigger_invitations`` at the invitation-start fire time, ``send_class_reminders(scheduled=True)``
at the reminder fire time and again every ``hoursBetweenReminders`` while it reports more due,
and ``process_invitation_batches`` on every tick. A fire time already past when a class is
created arms nothing, as ``schedule_instance_jobs`` does.

Settings (design §7.2). X -> ``maxSimultaneous``; M -> none (``maxTotal`` 999); between rounds ->
``maxInactiveTime``; first invitation -> invitation start ``days_before_at_time``; last invitation
-> ``minTimeBeforeClass``; quiet hours, reminders, absence cutoff -> their columns; eligibility ->
``within_n_above_class``; groups 3/4 -> ``invitation_groups`` (level one_above/same_as vacancy, side
same_as_vacancy); groups 1/2 -> today's waiting-list group 0; participations -> the ``attendance``
priority criterion (see below).

Participations ("mais participações", the base tiebreak). Today ranks by ``attendance_rate`` =
present / total presences over the coach's classes (``_attendance_stats_for``), a rate, not a count.
Recipe: with K = max(participations) + 1, seed K past, completed classes of the coach; a student
with n participations gets n presences ``present`` and K - n ``absent``/``unjustified`` (not
justified, so ``makeups_owed`` stays 0). The rate n/K then orders students exactly as n does. The
priority criteria are set to ``[level, attendance]`` so nothing else outranks it.
What cannot be expressed is returned by ``setup`` as a gap (structural).

Records, from the database after each step:
- invited: a new ``NotificationEvent`` of the class; ``side_named`` is the vacancy's side for a
  round-0 (waiting-list) invitation, the only one whose text names a side, else null.
- answered: an event that gained an ``answer``; a reminder attempt that gained a ``response``.
- placed: a new holding presence; ``how`` = invitation (a confirmed event), direct (an accepted
  join request), regular_returns (a regular's presence back from absent), else ``unknown``.
- left: a holding presence that turned absent. absence: the same, with its justification.
- reminder: a new ``ReminderAttempt``. message: ``waiting_list_offer`` messages, and the
  ``spot_filled`` text of a superseded join request as ``sorry``. Today sends no Aviso and no
  "added" notice; those expectations fail as behavioural / structural respectively.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.invitation_scenarios.runner import (
    MAIN,
    Applied,
    Record,
    Scenario,
    Snapshot,
    Unsupported,
    duration,
    to_utc,
)

SIDE_TO_APP = {"L": "left", "R": "right", "both": "both", None: None}
SIDE_FROM_APP = {"left": "L", "right": "R", "both": "both", None: None}

UNSUPPORTED = {
    "open_in_round": "today has no class-wide round: batches are per spot (maxSimultaneous)",
    ("placed.how", "auto_from_waiting_list"): "today has no automatic entry from the waiting list",
    ("messages.kind", "added"): "today has no automatic entry, so no 'added' notice",
}


class TodayAdapter:
    name = "today"

    def __init__(self, app):
        self.app = app
        self.mp = pytest.MonkeyPatch()
        self.ctx = None

    # --- setup ---------------------------------------------------------------------------

    def setup(self, sc: Scenario) -> list[str]:
        from padel_app.models import User
        from padel_app.models.clubs import Club
        from padel_app.models.coach_levels import CoachLevel
        from padel_app.models.coaches import Coach
        from padel_app.models.notification_config import NotificationConfig

        self.sc = sc
        self.ctx = self.app.test_request_context()
        self.ctx.push()
        self.now_local = sc.first_invite_at()
        self._pin(self.now_local)
        gaps: list[str] = []

        user = User(name="Coach", username="scenario_coach", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        self.coach_id, self.coach_user_id = coach.id, user.id
        self.level_ids = {}
        for n in range(1, 7):  # design §4.3: rung n is the PDF's level n, 1 the strongest
            lv = CoachLevel(coach_id=coach.id, label=f"N{n}", code=f"N{n}", display_order=n)
            db.session.add(lv)
            db.session.flush()
            self.level_ids[n] = lv.id
        club = Club(name="Scenario Club", description="", location="Lisboa")
        db.session.add(club)
        db.session.flush()
        self.club_id = club.id

        self.config = NotificationConfig(coach_id=coach.id, auto_notify_enabled=True)
        db.session.add(self.config)
        gaps += self._apply_settings(sc.settings)

        appears = self._appearing(sc)
        self.pid: dict[str, int] = {}
        self.uid: dict[str, int] = {}
        for p in sc.people.values():
            if p.id not in appears:
                self._create_person(p.id)

        self.instances: dict[str, int] = {}
        self.jobs: dict[str, dict] = {}
        for cid, spec in sc.classes.items():
            if spec.created_at is None:
                self._create_class(cid)
        if any(p.participations for p in sc.people.values()):
            self._seed_participations()
        db.session.commit()

        self.seen_events: dict[int, str | None] = {}
        self.seen_attempts: dict[int, str | None] = {}
        self.seen_messages: int = 0
        self.holding: dict[str, set[str]] = {cid: self._holding_ids(cid) for cid in self.instances}
        self.absent: dict[str, set[str]] = {cid: set() for cid in sc.classes}
        self.regular_ids = {p.id for p in sc.people.values() if p.kind == "regular"}
        self.placed_at: dict[tuple[str, str], datetime] = {}
        self.invited_at: dict[int, datetime] = {}
        self.pending: list[Record] = []
        self._scan()
        self.pending = []  # the seeded state is the starting point, not an observation
        return gaps

    def _appearing(self, sc: Scenario) -> set[str]:
        out = set()
        for step in sc.data["timeline"]:
            for ev in step.get("events") or []:
                inner = ev.get("event", ev) if "other_class" in ev else ev
                if isinstance(inner.get("appears"), str):
                    out.add(inner["appears"])
        return out

    def _apply_settings(self, s: dict) -> list[str]:
        c, gaps = self.config, []
        c.max_simultaneous_enabled, c.max_simultaneous_value = True, s["invites_per_spot"]
        c.max_total_enabled, c.max_total_value = True, 999
        if s.get("max_open") is not None:
            gaps.append("M (max_open): today has no class-wide limit of open invitations")
        timing = s["timing"]
        if timing["method"] == "A":
            minutes = int(duration(timing.get("between_rounds", "20m")).total_seconds() // 60)
            c.max_inactive_time_enabled, c.max_inactive_time_value = True, max(minutes, 15)
            if minutes < 15:
                gaps.append(f"between_rounds {minutes}m is below today's 15-minute floor")
            gaps.append("between_groups: today has no timer between priority groups")
        else:
            c.max_inactive_time_enabled, c.max_inactive_time_value = True, 20
            gaps.append(f"timing method {timing['method']}: today has only one inactivity timer")
        fi = s["first_invite"]
        c.invitation_start_type, c.invitation_start_value, c.invitation_start_time = (
            "days_before_at_time", fi["days_before"], fi["at"])
        last = s.get("last_invite_before")
        c.min_time_before_class_enabled = bool(last)
        if last:
            c.min_time_before_class_value = int(duration(last).total_seconds() // 60)
        qh = s.get("quiet_hours")
        c.quiet_hours_enabled = bool(qh)
        if qh:
            c.quiet_hours_start, c.quiet_hours_end = qh
        r = s["reminders"]
        c.reminder_type, c.reminder_value, c.reminder_time = "days_before_at_time", r["days_before"], r["at"]
        c.reminder_count = r["max"]
        c.hours_between_reminders = duration(r["every"]).total_seconds() / 3600
        c.cancellation_deadline_hours = duration(s["absence_cutoff_before"]).total_seconds() / 3600
        c.eligibility_rules = [{"attribute": "level", "operation": "within_n_above_class",
                                "value": s["eligible_levels_above"]}]
        c.no_same_day_class_enabled = False
        # The PDF's students see a class with room ("vê a aula", Entrada direta); PAD-130's switch.
        c.open_spots_visible = True
        c.max_invites_per_student_per_day_enabled = False
        c.priority_criteria = [
            {"id": "level", "label": "Level", "enabled": True},
            {"id": "attendance", "label": "Attendance", "enabled": True},
        ]
        groups, lists = [], []
        for i, g in enumerate(s["groups"], 1):
            if "list" in g:
                lists.append(g["list"])
                continue
            if g["side"] == "other":
                gaps.append(f"group {i} (other side): today's groups cannot name the opposite side")
                continue
            op = {1: "one_above_vacancy", 0: "same_as_vacancy"}.get(g["level"])
            if op is None:
                gaps.append(f"group {i} (level {g['level']:+d}): no matching group operation today")
                continue
            rules = [{"attribute": "level", "operation": op}]
            if g["side"] == "same":
                rules.append({"attribute": "side", "operation": "same_as_vacancy"})
            groups.append({"id": str(len(groups) + 1), "rules": rules})
        c.invitation_groups = groups
        if lists == ["coach", "students"]:
            gaps.append("groups 1-2: today has one waiting list ranked by join time, not coach-first")
        elif lists:
            gaps.append(f"waiting-list groups {lists}: today always asks the one waiting list first")
        else:
            gaps.append("no waiting-list group: today always asks the waiting list first")
        return gaps

    def _create_person(self, pid: str) -> None:
        from padel_app.models import User
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
        from padel_app.models.players import Player

        p = self.sc.people[pid]
        user = User(name=pid, username=f"s_{pid}".replace(":", "_"), password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        level = p.level or self.sc.main.level
        db.session.add(Association_CoachPlayer(coach_id=self.coach_id, player_id=player.id,
                                               level_id=self.level_ids[level], side=SIDE_TO_APP[p.side]))
        db.session.flush()
        self.pid[pid], self.uid[pid] = player.id, user.id

    def _create_class(self, cid: str) -> None:
        from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
        from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.lessons import Lesson
        from padel_app.models.presences import Presence
        from padel_app.scheduler import _fire_time_utc

        spec = self.sc.classes[cid]
        lesson = Lesson(title=f"Class {cid}", start_datetime=spec.start, end_datetime=spec.start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=spec.capacity, color="#000",
                        status="active", club_id=self.club_id, default_level_id=self.level_ids[spec.level])
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=spec.start,
                              end_datetime=spec.start + timedelta(hours=1), max_players=spec.capacity,
                              status="scheduled", notifications_enabled=True, level_id=self.level_ids[spec.level])
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=self.coach_id, lesson_instance_id=inst.id))
        for p in self.sc.regulars(cid):
            if p.id not in self.pid:
                continue
            db.session.add(Association_PlayerLesson(player_id=self.pid[p.id], lesson_id=lesson.id))
            db.session.add(Presence(player_id=self.pid[p.id], lesson_instance_id=inst.id, invited=True,
                                    confirmed=False, enrolment_source="roster"))
        db.session.flush()
        self.instances[cid] = inst.id
        now_utc = to_utc(self.now_local)
        invite = _fire_time_utc(spec.start, self.config.get_invitation_start_timing())
        reminder = _fire_time_utc(spec.start, self.config.get_reminder_timing())
        self.jobs[cid] = {
            "invite": invite if invite and invite >= now_utc else None,
            "reminder": reminder if reminder and reminder >= now_utc else None,
        }

    def _seed_participations(self) -> None:
        """'Mais participações' onto today's attendance-rate criterion: K past classes; a student
        with n participations attended n and missed K-n (unjustified, so no make-up is owed)."""
        from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.lessons import Lesson
        from padel_app.models.presences import Presence

        people = [p for p in self.sc.people.values() if p.id in self.pid]
        k = max(p.participations for p in people) + 1
        start = self.sc.main.start - timedelta(days=60)
        lesson = Lesson(title="History", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=64, color="#000", status="active",
                        club_id=self.club_id, default_level_id=self.level_ids[self.sc.main.level])
        db.session.add(lesson)
        db.session.flush()
        for i in range(k):
            t = start + timedelta(days=i)
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=t, end_datetime=t + timedelta(hours=1),
                                  max_players=64, status="completed", notifications_enabled=False,
                                  level_id=self.level_ids[self.sc.main.level])
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=self.coach_id, lesson_instance_id=inst.id))
            for p in people:
                attended = i < p.participations
                db.session.add(Presence(player_id=self.pid[p.id], lesson_instance_id=inst.id,
                                        status="present" if attended else "absent",
                                        justification=None if attended else "unjustified",
                                        enrolment_source="roster", validated=True))
        db.session.flush()

    # --- clock ---------------------------------------------------------------------------

    def _pin(self, local: datetime) -> datetime:
        self.now_local = local
        return pin_clock(self.mp, to_utc(local))

    def tick(self, now_local: datetime) -> None:
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.services.notification_service import (
            process_invitation_batches,
            send_class_reminders,
            trigger_invitations,
        )

        now = self._pin(now_local)
        for cid, inst_id in self.instances.items():
            jobs = self.jobs[cid]
            if jobs["invite"] is not None and jobs["invite"] <= now:
                jobs["invite"] = None
                trigger_invitations(db.session.get(LessonInstance, inst_id), self.coach_id, now=now)
            if jobs["reminder"] is not None and jobs["reminder"] <= now:
                result = send_class_reminders(inst_id, now=now, scheduled=True) or {}
                hours = self.config.get_hours_between_reminders()
                jobs["reminder"] = now + timedelta(hours=hours) if result.get("more_due") else None
        process_invitation_batches(now=now)
        db.session.expire_all()
        self._scan()

    # --- events --------------------------------------------------------------------------

    def apply(self, event: str, who, params: dict, cls: str, now_local: datetime) -> Applied:
        now = self._pin(now_local)
        try:
            self._dispatch(event, who, params, cls, now)
        except HTTPException as exc:
            db.session.rollback()
            body = getattr(exc, "response", None)
            reason = body.get_json(silent=True) if body is not None else None
            return Applied(refused=True, reason=str(reason or exc))
        finally:
            db.session.expire_all()
            self._scan()
        return Applied()

    def _player(self, who):
        from padel_app.models.players import Player

        return db.session.get(Player, self.pid[who])

    def _instance(self, cls):
        from padel_app.models.lesson_instances import LessonInstance

        return db.session.get(LessonInstance, self.instances[cls])

    def _live_event(self, who, cls):
        from padel_app.models.notification_event import NotificationEvent

        return (NotificationEvent.query
                .filter_by(lesson_instance_id=self.instances[cls], player_id=self.pid[who])
                .filter(NotificationEvent.status.in_(("sent", "queued")))
                .order_by(NotificationEvent.id.desc()).first())

    def _dispatch(self, event, who, params, cls, now):
        from padel_app.services import notification_service as ns
        from padel_app.services.academy_class_service import join_class_waiting_list_service
        from padel_app.services.class_join_request_service import create_join_request_service

        if event == "appears":
            if who not in self.pid:
                self._create_person(who)
                db.session.commit()
            return
        if event == "class_created":
            self._create_class(cls)
            db.session.commit()
            self.holding[cls] = self._holding_ids(cls)
            return
        if event == "coach_sets":
            raise Unsupported("coach_sets mid-scenario is not mapped onto today's config yet")
        inst_id = self.instances[cls]
        if event in ("accepts", "declines"):
            ev = self._live_event(who, cls)
            if ev is None:
                raise HTTPException(description=f"{who} has no open invitation")
            ns.respond_to_notification(ev.id, "yes" if event == "accepts" else "no", self.uid[who], now=now)
        elif event == "confirms":
            targets = ([p.id for p in self.sc.regulars(cls) if p.id in self.holding.get(cls, set())]
                       if who == "regulars" else [who])
            for t in targets:
                ns.respond_to_reminder(inst_id, "yes", self.uid[t], now=now)
        elif event in ("regular_no", "cancels"):
            ns.cancel_attendance(self.uid[who], lesson_instance_id=inst_id, now=now)
        elif event == "regular_returns":
            ns.respond_to_reminder(inst_id, "yes", self.uid[who], now=now)
        elif event == "joins_directly":
            self.config.auto_accept_join_requests = True
            db.session.commit()
            create_join_request_service(self._player(who), "LessonInstance", inst_id, None,
                                        side=SIDE_TO_APP.get(params.get("side")), now=now)
        elif event == "joins_waiting_list":
            own = self.sc.people[who].side
            side = {"own": own, "both": "both",
                    "other": {"L": "R", "R": "L"}.get(own, own)}[params["sides"]]
            join_class_waiting_list_service(self._player(who), "LessonInstance", inst_id, None,
                                            side=SIDE_TO_APP[side], now=now)
        elif event == "leaves_waiting_list":
            self._deactivate_waiting(who, cls)
        elif event == "coach_adds_to_waiting_list":
            ns.add_to_class_waiting_list(self.coach_id, self._instance(cls), self.pid[who], scope="occurrence",
                                         side=SIDE_TO_APP[params["side"]])
        elif event == "coach_removes_from_waiting_list":
            entry = self._waiting_entry(who, cls)
            if entry is None:
                raise HTTPException(description=f"{who} is not on the waiting list")
            ns.remove_from_class_waiting_list(entry.id, self.coach_id)
        elif event == "no_show":
            return  # today the coach records attendance; nothing happens on its own (behavioural)
        else:
            raise Unsupported(f"event {event} has no mapping on today's engine")
        db.session.commit()

    def _waiting_entry(self, who, cls):
        from padel_app.models.waiting_list_entry import WaitingListEntry

        return WaitingListEntry.query.filter_by(lesson_instance_id=self.instances[cls], player_id=self.pid[who],
                                                is_active=True).first()

    def _deactivate_waiting(self, who, cls):
        # The student's own "leave" is a route with no service function; it deactivates the entry.
        entry = self._waiting_entry(who, cls)
        if entry is None:
            raise HTTPException(description=f"{who} is not on the waiting list")
        entry.is_active = False

    # --- observation ---------------------------------------------------------------------

    def _holding_ids(self, cls) -> set[str]:
        inst = self._instance(cls)
        rev = {v: k for k, v in self.pid.items()}
        return {rev[p.player_id] for p in inst.holding_presences if p.player_id in rev}

    def _scan(self) -> None:
        from padel_app.models.messages import Message
        from padel_app.models.notification_event import NotificationEvent
        from padel_app.models.presences import Presence
        from padel_app.models.reminder_attempts import ReminderAttempt
        from padel_app.models.vacancy import Vacancy

        rev = {v: k for k, v in self.pid.items()}
        at = self.now_local
        for cid, inst_id in self.instances.items():
            for ev in NotificationEvent.query.filter_by(lesson_instance_id=inst_id).order_by(NotificationEvent.id):
                sid = rev.get(ev.player_id)
                if sid is None:
                    continue
                if ev.id not in self.seen_events:
                    side_named = None
                    if ev.round_number == 0 and ev.vacancy_id:
                        vac = db.session.get(Vacancy, ev.vacancy_id)
                        side_named = {"left": "L", "right": "R"}.get(getattr(vac, "side", None))
                    self.pending.append(Record("invited", sid, cid, at, {"side_named": side_named, "group": None}))
                    self.seen_events[ev.id] = None
                    self.invited_at[ev.id] = at
                if ev.answer and self.seen_events[ev.id] != ev.answer:
                    self.seen_events[ev.id] = ev.answer
                    self.pending.append(Record("answered", sid, cid, at, {"answer": ev.answer, "on": "invitation"}))
            for ra in ReminderAttempt.query.filter_by(lesson_instance_id=inst_id).order_by(ReminderAttempt.id):
                sid = rev.get(ra.player_id)
                if sid is None:
                    continue
                if ra.id not in self.seen_attempts:
                    self.seen_attempts[ra.id] = None
                    self.pending.append(Record("reminder", sid, cid, at))
                if ra.response and self.seen_attempts[ra.id] != ra.response:
                    self.seen_attempts[ra.id] = ra.response
                    answer = "yes" if ra.response in ("confirmed", "yes") else "no"
                    self.pending.append(Record("answered", sid, cid, at, {"answer": answer, "on": "reminder"}))

            now_holding = self._holding_ids(cid)
            before = self.holding.get(cid, set())
            sides = self._sides(cid, now_holding)
            for sid in sorted(now_holding - before):
                self.placed_at[(cid, sid)] = at
                self.pending.append(Record("placed", sid, cid, at, {"side": sides.get(sid), "how": self._how(sid, cid)}))
            for sid in sorted(before - now_holding):
                pres = Presence.query.filter_by(lesson_instance_id=inst_id, player_id=self.pid[sid]).first()
                reason = "regular_no" if sid in self.regular_ids else "cancel"
                self.pending.append(Record("left", sid, cid, at, {"reason": reason}))
                if pres is not None and pres.status == "absent":
                    self.pending.append(Record("absence", sid, cid, at,
                                               {"kind": pres.justification or "none"}))
            self.holding[cid] = now_holding

        msgs = Message.query.filter(Message.id > self.seen_messages).order_by(Message.id).all()
        uid_rev = {v: k for k, v in self.uid.items()}
        for m in msgs:
            self.seen_messages = max(self.seen_messages, m.id)
            meta = m.msg_metadata or {}
            target = self._recipient(m, uid_rev)
            if target is None:
                continue
            cid = self._class_of(meta.get("lessonInstanceId"))
            if m.message_type == "waiting_list_offer":
                self.pending.append(Record("message", target, cid, at, {"kind": "waiting_list_offer"}))
            elif (meta.get("joinRequest") or {}).get("status") == "superseded":
                self.pending.append(Record("message", target, cid, at, {"kind": "sorry"}))

    def _recipient(self, m, uid_rev):
        from padel_app.models import Conversation

        if m.sender_id != self.coach_user_id:
            return None
        conv = db.session.get(Conversation, m.conversation_id)
        ids = [int(x) for x in (getattr(conv, "participant_key", "") or "").split(",") if x.isdigit()]
        for uid in ids:
            if uid in uid_rev:
                return uid_rev[uid]
        return None

    def _class_of(self, inst_id):
        for cid, i in self.instances.items():
            if i == inst_id:
                return cid
        return MAIN

    def _sides(self, cid, ids) -> dict[str, str | None]:
        from padel_app.services.notification_service import assigned_sides, sides_in_occurrence

        if not ids:
            return {}
        inst = self._instance(cid)
        pids = [self.pid[s] for s in ids]
        raw = sides_in_occurrence(inst, self.coach_id, pids)
        assigned = assigned_sides(inst, self.coach_id) or {}
        rev = {v: k for k, v in self.pid.items()}
        out = {}
        for pid in pids:
            side = assigned.get(pid) or raw.get(pid)
            out[rev[pid]] = SIDE_FROM_APP.get(side, side) if side != "both" else None
        return out

    def _how(self, sid, cid) -> str:
        from padel_app.models.class_join_request import ClassJoinRequest
        from padel_app.models.notification_event import NotificationEvent

        inst_id, pid = self.instances[cid], self.pid[sid]
        if NotificationEvent.query.filter_by(lesson_instance_id=inst_id, player_id=pid, status="confirmed").first():
            return "invitation"
        if ClassJoinRequest.query.filter_by(lesson_instance_id=inst_id, player_id=pid, status="accepted").first():
            return "direct"
        if sid in self.regular_ids:
            return "regular_returns"
        return "unknown"

    def drain(self) -> list[Record]:
        out, self.pending = self.pending, []
        return out

    def snapshot(self, cls: str) -> Snapshot:
        from padel_app.models.notification_event import NotificationEvent
        from padel_app.services.notification_service import get_waiting_list

        if cls not in self.instances:
            return Snapshot({})
        rev = {v: k for k, v in self.pid.items()}
        holding = self._holding_ids(cls)
        roster = self._sides(cls, holding)
        wl = {"coach": [], "students": []}
        for row in get_waiting_list(self.instances[cls], self.coach_id):
            sid = rev.get(row["playerId"])
            if sid is not None:
                wl["coach" if row.get("origin") == "coach" else "students"].append(sid)
        open_inv = []
        for ev in (NotificationEvent.query.filter_by(lesson_instance_id=self.instances[cls])
                   .filter(NotificationEvent.status.in_(("sent", "queued"))).order_by(NotificationEvent.id)):
            sid = rev.get(ev.player_id)
            if sid is None:
                continue
            side_named = None
            if ev.round_number == 0:
                side_named = "?"
            open_inv.append((sid, side_named, self.invited_at.get(ev.id, self.now_local)))
        placed_at = {sid: t for (c, sid), t in self.placed_at.items() if c == cls}
        return Snapshot(roster, placed_at, wl, open_inv, None)

    def unsupported(self, key: str, item=None):
        return UNSUPPORTED.get((key, item)) or (UNSUPPORTED.get(key) if item is None else None)

    def teardown(self) -> None:
        try:
            db.session.rollback()
        finally:
            self.mp.undo()
            if self.ctx is not None:
                self.ctx.pop()
                self.ctx = None
