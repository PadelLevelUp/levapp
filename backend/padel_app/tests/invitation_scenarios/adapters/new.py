"""The `new` adapter: drives the redesign plan's engine (``padel_app.invitation_engine``) through a
scenario's timeline and reads its effects back as the runner's normalized records (design §5, §9).

The engine is pure, so this adapter needs no app, no database and no clock pinning: it keeps a
``MemoryStore``, passes every instant as ``now=`` (naive UTC, converted from the scenario's Lisbon
wall-clock) and stores class starts as Lisbon wall-clock (R-023).

Settings (design §2.1 -> ``EngineSettings``). X -> ``invites_per_spot``; M -> ``max_at_a_time``;
Method A -> ``timing`` fixed, its ``between_rounds`` and ``between_groups`` the pair every
invitation's T is chosen from at send (engine-timeline rule 4, ruling D-E6); Method B ->
``progressive``; Method C -> ``per_tier`` pairs (``between_rounds``, ``to_next_group``), a group or
half not set taking the fixed default; first invitation, last invitation, quiet hours, absence
cutoff -> their fields; reminders -> ``attendance_request``; eligibility ->
``eligibility.levels_above``; tiebreak -> ``ordering``; groups -> ``tiers`` one for one (the
coach's and the students' lists, then pool tiers by level offset and side).

Coach rules (engine-settings rules 3-5; SETTINGS-14, the defaults mode). The rules the plan is
silent on are off unless the scenario uses them, read from its own content by ``coach_rules``:
direct join when it has a ``joins_directly`` event; the students' side choice when a students'-list
join chooses ``own`` or ``other``; automatic entry when it expects a placement
``auto_from_waiting_list`` or an ``added`` message. A scenario that uses none of them, such as the
plan's P01-P33, runs on ``EngineSettings`` defaults: the plan alone.

Records (engine effect -> record):
- ``Invited`` -> invited; ``group`` is the tier's position in the scenario's groups (1-based),
  ``side_named`` the message's side (D11).
- ``Answered`` -> answered, ``on`` invitation or reminder (the attendance request).
- ``Placed`` -> placed with its ``how``; ``Left`` -> left; ``Absence`` -> absence;
  ``AttendanceRequested`` -> reminder; ``Message`` -> message by ``MESSAGE_KINDS``: the engine's
  ``sorry`` (plan §7, D4) is logged as ``aviso`` (the scenario format's word for it, constants.md
  KIND_SORRY), the others one for one (``reoffer``, ``added``, ``waiting_list_offer``,
  ``side_moved``).
- Open invitations: the snapshot lists every unanswered invitation with its send time, counting
  or not. An invitation past its inactivity time stops counting but stays open (D4), so
  ``open_unanswered`` counts it.
- ``CoachAlert`` -> ``alert`` (plan §6 step 4), with an empty student; the scenario expectation
  ``coach_alert: true`` looks for it.
- ``Refused`` of a join (direct join, waiting list) for the acting student ->
  ``Applied(refused=True)``; the runner writes that record. Any other request the engine turns
  down (an accept with no open invitation, an accept after the class started) is observed as
  nothing placed and nothing sent: no record, never an error (design §12).
- ``SideAssigned`` and waiting-list changes have no record; the snapshot shows them.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore, SettingsError
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import requests as rq
from padel_app.invitation_engine.settings import (
    AttendanceRequest,
    Eligibility,
    FirstInvite,
    Tier,
    Timing,
    TimingPair,
)
from padel_app.invitation_engine.snapshot import Student
from padel_app.tests.invitation_scenarios.runner import (
    Applied,
    Person,
    Record,
    Scenario,
    Snapshot,
    Unsupported,
    duration,
    merge_settings,
    to_local,
    to_utc,
)


#: Engine message kind -> normalized message kind (design §5, §12).
MESSAGE_KINDS = {"sorry": "aviso", "reoffer": "reoffer", "added": "added",
                 "waiting_list_offer": "waiting_list_offer", "side_moved": "side_moved"}
#: Harness events whose refusal is an observation of its own (design §12, ``refused``).
REFUSABLE = {"joins_directly", "joins_waiting_list"}


def _hhmm(value: str) -> time:
    h, m = map(int, value.split(":"))
    return time(h, m)


def _timing(t: dict, n_tiers: int) -> Timing:
    method = t.get("method", "A")
    default = Timing()
    if method == "A":
        return Timing("fixed", duration(t.get("between_rounds", "20m")), duration(t.get("between_groups", "20m")))
    if method == "B":
        return Timing("progressive")
    if method == "C":
        per_group = {int(k): v for k, v in (t.get("per_group") or {}).items()}

        def pair(g: dict) -> TimingPair:
            return TimingPair(duration(g["between_rounds"]) if "between_rounds" in g else default.between_rounds,
                              duration(g["to_next_group"]) if "to_next_group" in g else default.between_groups)

        return Timing("per_tier", per_tier=tuple(pair(per_group[g]) if g in per_group else None
                                                 for g in range(1, n_tiers + 1)))
    raise SettingsError(f"timing.method {method!r}")


def _tier(group: dict) -> Tier:
    side = group.get("side", "same")
    if "list" in group:
        return Tier("coach_list" if group["list"] == "coach" else "students_list", side)
    return Tier("pool", side, int(group["level"]))


COACH_RULES = ("auto_entry_before_attendance_request", "waiting_list_side_choice", "direct_join")


def _events(data: dict):
    for step in data.get("timeline") or []:
        for ev in step.get("events") or []:
            yield ev.get("event", ev) if "other_class" in ev else ev


def _expects(data: dict):
    for step in data.get("timeline") or []:
        exp = step.get("expect") or {}
        yield exp
        yield from (exp.get("other_class") or {}).values()


def coach_rules(data: dict) -> dict[str, bool]:
    """Which of the coach rules the plan is silent on a scenario uses, from its own content."""
    events, expects = list(_events(data)), list(_expects(data))
    return {
        "direct_join": any("joins_directly" in ev for ev in events),
        "waiting_list_side_choice": any(ev.get("sides") in ("own", "other") for ev in events
                                        if "joins_waiting_list" in ev),
        "auto_entry_before_attendance_request": any(
            any(p.get("how") == "auto_from_waiting_list" for p in exp.get("placed") or [])
            or any(m.get("kind") == "added" for m in exp.get("messages") or [])
            for exp in expects),
    }


def engine_settings(harness: dict, rules: dict[str, bool] | None = None) -> tuple[EngineSettings, list[str]]:
    """The scenario's settings (base profile merged with its overrides) as the engine's, with the
    coach rules in ``rules`` turned on (all off when ``None``: the plan's defaults)."""
    known = {"invites_per_spot", "max_open", "timing", "first_invite", "last_invite_before", "quiet_hours",
             "reminders", "absence_cutoff_before", "eligible_levels_above", "tiebreak", "groups"}
    gaps = [f"{k}: no engine setting" for k in sorted(set(harness) - known)]
    tiers = tuple(_tier(g) for g in harness["groups"])
    timing = _timing(harness["timing"], len(tiers))
    r, fi = harness["reminders"], harness["first_invite"]
    qh = harness.get("quiet_hours")
    settings = EngineSettings(
        invites_per_spot=harness["invites_per_spot"],
        max_at_a_time=harness["max_open"],
        timing=timing,
        first_invite=FirstInvite(fi["days_before"], _hhmm(fi["at"])),
        last_invite_before=duration(harness["last_invite_before"]),
        quiet_hours=(_hhmm(qh[0]), _hhmm(qh[1])) if qh else None,
        attendance_request=AttendanceRequest(r["days_before"], _hhmm(r["at"]), duration(r["every"]), r["max"]),
        absence_cutoff_before=duration(harness["absence_cutoff_before"]),
        eligibility=Eligibility(levels_above=harness["eligible_levels_above"]),
        tiers=tiers,
        ordering=(harness["tiebreak"],),
        **{rule: bool((rules or {}).get(rule)) for rule in COACH_RULES},
    )
    return settings, gaps


def _student(p: Person) -> Student:
    both = p.side == "both" or p.plays_both
    return Student(p.id, p.level, frozenset({"L", "R"}) if both else frozenset({p.side}), p.participations)


class NewAdapter:
    name = "new"

    def setup(self, sc: Scenario) -> list[str]:
        self.sc = sc
        self.harness_settings = sc.settings
        self.rules = coach_rules(sc.data)
        settings, gaps = engine_settings(sc.settings, self.rules)
        self.setup_gaps = set(gaps)
        self.store = MemoryStore()
        appears = self._appearing(sc)
        for p in sc.people.values():
            if p.kind == "student":
                self.store.add_student(_student(p), visible=p.id not in appears)
        first = to_utc(min(sc.first_invite_at(), datetime.strptime(sc.data["timeline"][0]["at"], "%Y-%m-%d %H:%M")))
        for cid, spec in sc.classes.items():
            if spec.created_at is None:
                self.store.add_session(cid, spec.level, spec.capacity, spec.start, self._regulars(cid), first,
                                       joined_at=self._joined_at(cid, first))
        self.engine = Engine(self.store, settings)
        self.pending: list[Record] = []
        return gaps

    @staticmethod
    def _appearing(sc: Scenario) -> set[str]:
        out = set()
        for step in sc.data["timeline"]:
            for ev in step.get("events") or []:
                inner = ev.get("event", ev) if "other_class" in ev else ev
                if isinstance(inner.get("appears"), str):
                    out.add(inner["appears"])
        return out

    def _regulars(self, cid: str):
        return tuple((_student(p), None if p.side == "both" else p.side) for p in self.sc.regulars(cid))

    def _joined_at(self, cid: str, before: datetime) -> dict[str, datetime]:
        """Regulars joined the class in member order (L-1 first, then the R and B members), a minute
        apart and well before the scenario, so "joined most recently" is the highest-numbered member."""
        regs = self.sc.regulars(cid)
        start = before - timedelta(days=30)
        return {p.id: start + timedelta(minutes=i) for i, p in enumerate(regs)}

    # --- time and events -----------------------------------------------------------------

    def tick(self, now_local: datetime) -> None:
        self.pending += self._records(self.engine.tick(to_utc(now_local)))

    def apply(self, event: str, who, params: dict, cls: str, now_local: datetime) -> Applied:
        now = to_utc(now_local)
        if event == "coach_sets":
            merged = merge_settings(self.harness_settings, params["settings"])
            try:
                settings, gaps = engine_settings(merged, self.rules)
            except (SettingsError, KeyError, ValueError) as exc:
                raise Unsupported(f"coach_sets: {exc}") from exc
            new_gaps = [g for g in gaps if g not in self.setup_gaps]  # setup already reported the others
            if new_gaps:
                raise Unsupported(f"coach_sets: {'; '.join(new_gaps)}")
            self.harness_settings = merged
            request: rq.Request = rq.UpdateSettings(settings)
        elif event == "class_created":
            spec = self.sc.classes[cls]
            request = rq.CreateSession(spec.level, spec.capacity, spec.start, self._regulars(cls),
                                       self._joined_at(cls, now))
        else:
            request = self._request(event, who, params)
            if not isinstance(request, rq.Appear) and not self.store.has_session(cls):
                return Applied(True, "the session does not exist yet") if event in REFUSABLE else Applied()
        effects = self.engine.handle(cls, request, now)
        refused = [e for e in effects if isinstance(e, fx.Refused) and e.student == who]
        self.pending += self._records([e for e in effects if e not in refused])
        if refused and event in REFUSABLE:
            return Applied(True, refused[0].reason)
        return Applied()

    @staticmethod
    def _request(event: str, who, params: dict) -> rq.Request:
        if event in ("accepts", "declines"):
            return rq.Answer(who, event == "accepts")
        if event == "joins_directly":
            return rq.DirectJoin(who, params.get("side"))
        if event == "joins_waiting_list":
            return rq.JoinWaitingList(who, "students", sides=params["sides"])
        if event == "coach_adds_to_waiting_list":
            return rq.JoinWaitingList(who, "coach", side=params["side"])
        if event == "leaves_waiting_list":
            return rq.LeaveWaitingList(who, "students")
        if event == "coach_removes_from_waiting_list":
            return rq.LeaveWaitingList(who, "coach")
        if event == "confirms":
            return rq.ConfirmAttendance(None if who == "regulars" else who)
        simple = {"regular_no": rq.RegularAbsent, "regular_returns": rq.RegularReturns, "cancels": rq.Cancel,
                  "no_show": rq.NoShow, "appears": rq.Appear, "coach_excludes": rq.CoachExcludes}
        if event in simple:
            return simple[event](who)
        raise Unsupported(f"no engine request for the event {event!r}")

    # --- observation ---------------------------------------------------------------------

    def _records(self, effects) -> list[Record]:
        out = []
        for e in effects:
            at = to_local(e.at)
            if isinstance(e, fx.Invited):
                group = None if e.tier is None else e.tier + 1
                out.append(Record("invited", e.student, e.session, at, {"side_named": e.side_named, "group": group}))
            elif isinstance(e, fx.Answered):
                on = "invitation" if e.on == "invitation" else "reminder"
                out.append(Record("answered", e.student, e.session, at, {"answer": e.answer, "on": on}))
            elif isinstance(e, fx.Placed):
                out.append(Record("placed", e.student, e.session, at, {"side": e.side, "how": e.how}))
            elif isinstance(e, fx.Left):
                out.append(Record("left", e.student, e.session, at, {"reason": e.reason}))
            elif isinstance(e, fx.Absence):
                out.append(Record("absence", e.student, e.session, at, {"kind": e.kind}))
            elif isinstance(e, fx.AttendanceRequested):
                out.append(Record("reminder", e.student, e.session, at))
            elif isinstance(e, fx.Message):
                out.append(Record("message", e.student, e.session, at, {"kind": MESSAGE_KINDS[e.kind]}))
            elif isinstance(e, fx.CoachAlert):
                out.append(Record("alert", "", e.session, at, {"reason": e.reason}))
            elif isinstance(e, fx.Refused):
                out.append(Record("refused", e.student, e.session, at, {"action": e.action, "reason": e.reason}))
        return out

    def drain(self) -> list[Record]:
        out, self.pending = self.pending, []
        return out

    def snapshot(self, cls: str) -> Snapshot:
        if not self.store.has_session(cls):
            return Snapshot({})
        s = self.store.snapshot(cls)
        wl = {"coach": [w.student for w in s.waiting_list if w.list == "coach"],
              "students": [w.student for w in s.waiting_list if w.list == "students"]}
        return Snapshot(
            roster={p.student: p.side for p in s.going},
            placed_at={p.student: to_local(p.at) for p in s.going},
            waiting_list=wl,
            open_invitations=[(i.student, i.side_named, to_local(i.sent_at)) for i in s.open_invitations],
            open_in_round=None,  # the plan has no rounds
        )

    def unsupported(self, key: str, item=None):
        return None

    def teardown(self) -> None:
        pass
