"""Engine-agnostic runner for invitation scenarios (design §1-§5, §8).

The runner owns the clock, the base profile, `who` resolution and the comparison; an adapter
(adapters/today.py now, adapters/new.py later) owns everything engine-specific: seeding,
periodic work, applying events, and turning the engine's state into normalized records.

A scenario file runs unchanged against any adapter. The result is a normalized log plus a list
of mismatches; the baseline classes (structural / behavioural / decision / encoding) are
assigned from that output by the reading rule, not by the runner, except that a mismatch the
adapter declares unsupported is tagged `unsupported` (it reads as structural).
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Protocol
from zoneinfo import ZoneInfo

import yaml

LISBON = ZoneInfo("Europe/Lisbon")
SCENARIOS_DIR = Path(__file__).parent / "scenarios"

# --- base profile (design §2.1) ----------------------------------------------------------------

BASE_SETTINGS: dict[str, Any] = {
    "invites_per_spot": 3,
    "max_open": 12,
    "timing": {"method": "A", "between_rounds": "20m", "between_groups": "60m"},
    "first_invite": {"days_before": 2, "at": "19:00"},
    "last_invite_before": "2h",
    "quiet_hours": ["00:00", "07:00"],
    "reminders": {"days_before": 1, "at": "17:00", "every": "2h", "max": 3},
    "absence_cutoff_before": "12h",
    "eligible_levels_above": 2,
    "tiebreak": "participations",
    "groups": [
        {"list": "coach", "side": "same"},
        {"list": "students", "side": "same"},
        {"level": 1, "side": "same"},
        {"level": 0, "side": "same"},
        {"level": 1, "side": "other"},
        {"level": 0, "side": "other"},
    ],
}
BASE_CLASS = {"level": 3, "capacity": 16, "start": "2026-11-03 10:30", "created_at": None}
MAIN = "A"  # id of the scenario's own class in records and adapter calls


def parse_local(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M")


def to_utc(local: datetime) -> datetime:
    """Lisbon wall-clock (naive) -> naive UTC, the backend's convention."""
    return local.replace(tzinfo=LISBON).astimezone(timezone.utc).replace(tzinfo=None)


def to_local(utc: datetime) -> datetime:
    return utc.replace(tzinfo=timezone.utc).astimezone(LISBON).replace(tzinfo=None)


def fmt(local: datetime) -> str:
    return local.strftime("%Y-%m-%d %H:%M")


_DUR = re.compile(r"^(?:(\d+)h)?(?:(\d+)m)?$")


def duration(value: str) -> timedelta:
    m = _DUR.match(value or "")
    if not m or not value:
        raise ValueError(f"bad duration {value!r}")
    return timedelta(hours=int(m.group(1) or 0), minutes=int(m.group(2) or 0))


def merge_settings(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        out[k] = copy.deepcopy(v)
    return out


# --- the scenario, resolved -------------------------------------------------------------------

@dataclass
class Person:
    id: str
    kind: str                  # "regular" | "student"
    side: str | None           # L | R | both
    level: int | None
    cohort: str | None = None  # student cohort id, or "L"/"R"/"B" for cohort-form regulars
    index: int = 0             # roster order inside the cohort (1-based) / file order
    plays_both: bool = False
    participations: int = 0
    classes: tuple[str, ...] = (MAIN,)  # classes this person is a regular of


@dataclass
class ClassSpec:
    id: str
    level: int
    capacity: int
    start: datetime            # local
    created_at: datetime | None = None


@dataclass
class Scenario:
    path: Path
    data: dict
    settings: dict
    classes: dict[str, ClassSpec]
    people: dict[str, Person]
    cohorts: dict[str, list[str]]          # cohort id -> member ids in order
    tick_every: timedelta

    @property
    def key(self) -> str:
        return self.path.stem

    @property
    def main(self) -> ClassSpec:
        return self.classes[MAIN]

    def regulars(self, cls: str = MAIN) -> list[Person]:
        return [p for p in self.people.values() if p.kind == "regular" and cls in p.classes]

    def first_invite_at(self) -> datetime:
        fi = self.settings["first_invite"]
        h, m = map(int, fi["at"].split(":"))
        day = (self.main.start - timedelta(days=fi["days_before"])).date()
        return datetime(day.year, day.month, day.day, h, m)


def load_scenario(path: Path) -> Scenario:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    settings = merge_settings(BASE_SETTINGS, data.get("settings") or {})
    cls_data = {**BASE_CLASS, **(data.get("class") or {})}
    classes = {
        MAIN: ClassSpec(
            MAIN, cls_data["level"], cls_data["capacity"], parse_local(cls_data["start"]),
            parse_local(cls_data["created_at"]) if cls_data.get("created_at") else None,
        )
    }
    people: dict[str, Person] = {}
    cohorts: dict[str, list[str]] = {}

    def add_regulars(spec, cls_id: str, level: int) -> None:
        if isinstance(spec, dict):
            for key, letter in (("L", "L"), ("R", "R"), ("both", "B")):
                for n in range(1, (spec.get(key) or 0) + 1):
                    pid = f"{letter}-{n}" if cls_id == MAIN else f"{cls_id}:{letter}-{n}"
                    people[pid] = Person(pid, "regular", "both" if letter == "B" else letter, level,
                                         cohort=letter, index=n, classes=(cls_id,))
        else:
            for i, r in enumerate(spec or [], 1):
                if r["id"] in people:  # regular of two classes
                    p = people[r["id"]]
                    p.classes = tuple(dict.fromkeys(p.classes + (cls_id,)))
                    continue
                people[r["id"]] = Person(r["id"], "regular", r["side"], r.get("level", level), index=i,
                                         plays_both=r.get("plays") == "both", classes=(cls_id,))

    add_regulars((data.get("roster") or {}).get("regulars"), MAIN, classes[MAIN].level)
    for oc in data.get("other_classes") or []:
        classes[oc["id"]] = ClassSpec(oc["id"], oc.get("level", BASE_CLASS["level"]),
                                      oc.get("capacity", BASE_CLASS["capacity"]), parse_local(oc["start"]))
        add_regulars(oc.get("regulars"), oc["id"], classes[oc["id"]].level)

    for i, s in enumerate(data.get("students") or [], 1):
        level = s.get("level")
        if level is None:
            level = classes[MAIN].level  # design §2.2: no level -> the class level
        if "cohort" in s:
            parts = s.get("participations") or [0] * s["count"]
            members = []
            for n in range(1, s["count"] + 1):
                pid = f"{s['cohort']}-{n}"
                people[pid] = Person(pid, "student", s["side"], level, cohort=s["cohort"], index=n,
                                     participations=parts[n - 1], classes=())
                members.append(pid)
            cohorts[s["cohort"]] = members
        else:
            people[s["id"]] = Person(s["id"], "student", s["side"], level, index=i,
                                     participations=s.get("participations", 0), classes=())

    tick = duration(data.get("tick_every", "5m"))
    return Scenario(Path(path), data, settings, classes, people, cohorts, tick)


# --- normalized log (design §5) ---------------------------------------------------------------

@dataclass
class Record:
    kind: str        # invited | answered | placed | message | reminder | absence | left | refused
    student: str
    cls: str
    at: datetime     # local
    data: dict = field(default_factory=dict)
    # invited: side_named (L|R|None|UNKNOWN), group (int|None)
    # answered: answer (yes|no), on (invitation|reminder)
    # placed: side, how;  message: kind;  absence: kind;  left: reason;  refused: action

    def as_dict(self) -> dict:
        return {"kind": self.kind, "student": self.student, "class": self.cls, "at": fmt(self.at), **self.data}


UNKNOWN = "?"  # a field the adapter cannot observe; matches anything, counted as unsupported


@dataclass
class Snapshot:
    roster: dict[str, str | None]                      # student -> side going now
    placed_at: dict[str, datetime] = field(default_factory=dict)
    waiting_list: dict[str, list[str]] = field(default_factory=lambda: {"coach": [], "students": []})
    open_invitations: list[tuple[str, Any, datetime]] = field(default_factory=list)  # (student, side_named, at)
    open_in_round: int | None = None                   # None: the engine has no such concept


@dataclass
class Applied:
    refused: bool = False
    reason: str = ""


class Unsupported(Exception):
    """The adapter cannot express this event or setting on its engine (reads as structural)."""


class Adapter(Protocol):
    name: str

    def setup(self, sc: Scenario) -> list[str]: ...
    """Seed the scenario; return reasons for settings the engine cannot express."""

    def tick(self, now_local: datetime) -> None: ...
    def apply(self, event: str, who: str | None, params: dict, cls: str, now_local: datetime) -> Applied: ...
    def drain(self) -> list[Record]: ...
    def snapshot(self, cls: str) -> Snapshot: ...
    def unsupported(self, key: str, item: Any = None) -> str | None: ...
    def teardown(self) -> None: ...


# --- results ----------------------------------------------------------------------------------

@dataclass
class Mismatch:
    step: int | str              # timeline index or "final"
    at: str
    key: str
    expected: Any
    actual: Any
    unsupported: str | None = None  # reason, when the adapter declared the concept unsupported

    def as_dict(self) -> dict:
        d = {"step": self.step, "at": self.at, "key": self.key, "expected": self.expected, "actual": self.actual}
        if self.unsupported:
            d["unsupported"] = self.unsupported
        return d


@dataclass
class Result:
    key: str
    id: Any
    outcome: str = "pass"        # pass | fail | error
    mismatches: list[Mismatch] = field(default_factory=list)
    evaluated: int = 0           # expectation checks the adapter actually evaluated
    skipped: int = 0             # checks skipped as unsupported
    setup_gaps: list[str] = field(default_factory=list)
    error: str | None = None
    log: list[Record] = field(default_factory=list)

    @property
    def first(self) -> Mismatch | None:
        return self.mismatches[0] if self.mismatches else None

    def summary(self) -> dict:
        out = {"outcome": self.outcome, "evaluated": self.evaluated, "skipped": self.skipped}
        if self.setup_gaps:
            out["setup_gaps"] = self.setup_gaps
        if self.error:
            out["error"] = self.error
        if self.mismatches:
            out["first_failure"] = self.first.as_dict()
            out["mismatches"] = [m.as_dict() for m in self.mismatches]
        return out


# --- the run ----------------------------------------------------------------------------------

class Run:
    def __init__(self, sc: Scenario, adapter: Adapter):
        self.sc = sc
        self.ad = adapter
        self.aliases: dict[str, str] = {}
        self.bound: set[str] = set()      # members already chosen by a cohort-form who
        self.log: list[Record] = []
        self.result = Result(sc.key, sc.data.get("id"))

    # who ---------------------------------------------------------------------------------

    def resolve(self, who, cls: str = MAIN) -> str:
        if isinstance(who, str):
            if who in self.aliases:
                return self.aliases[who]
            if who in self.sc.people:
                return who
            raise LookupError(f"alias {who!r} was never bound (its binding step found no member)")
        cohort, state = who["cohort"], who["state"]
        members = [m for m in self.sc.cohorts.get(cohort, []) if m not in self.bound]
        snap = self.ad.snapshot(cls)
        candidates: list[tuple[Any, int, str]] = []
        invited_at = parse_local(who["invited_at"]) if "invited_at" in who else None
        for m in members:
            idx = self.sc.people[m].index
            if state == "uninvited":
                if not any(r.kind == "invited" and r.student == m and r.cls == cls for r in self.log):
                    candidates.append((idx, idx, m))
            elif state == "invited":
                for st, side_named, at in snap.open_invitations:
                    if st != m:
                        continue
                    if invited_at is not None and at != invited_at:
                        continue
                    if "side_named" in who and side_named not in (who["side_named"], UNKNOWN):
                        continue
                    candidates.append((at, idx, m))
                    break
            elif state in ("accepted", "declined"):
                answer = "yes" if state == "accepted" else "no"
                ats = [r.at for r in self.log if r.kind == "answered" and r.student == m and r.cls == cls
                       and r.data.get("answer") == answer]
                if ats:
                    candidates.append((ats[-1], idx, m))
            elif state == "placed":
                if m in snap.roster:
                    candidates.append((snap.placed_at.get(m, datetime.min), idx, m))
            elif state == "on_waiting_list":
                order = snap.waiting_list.get("coach", []) + snap.waiting_list.get("students", [])
                if m in order:
                    candidates.append((order.index(m), idx, m))
        if not candidates:
            raise LookupError(f"no member of {cohort} in state {state}"
                              + (f" invited at {who['invited_at']}" if invited_at else ""))
        candidates.sort(key=lambda c: (c[0], c[1]))
        chosen = candidates[0][2]
        self.bound.add(chosen)
        if "as" in who:
            self.aliases[who["as"]] = chosen
        return chosen

    # clock -------------------------------------------------------------------------------

    def _drain(self) -> list[Record]:
        new = self.ad.drain()
        self.log.extend(new)
        return new

    def execute(self) -> Result:
        sc, res = self.sc, self.result
        timeline = sc.data["timeline"]
        try:
            res.setup_gaps = self.ad.setup(sc) or []
            first_at = parse_local(timeline[0]["at"])
            clock = first_at
            if sc.main.created_at is None:
                clock = min(first_at, sc.first_invite_at())
            self._drain()
            step_records: list[Record] = []
            for i, step in enumerate(timeline):
                at = parse_local(step["at"])
                while clock + sc.tick_every < at:
                    clock += sc.tick_every
                    self.ad.tick(clock)
                clock = at
                step_records = []
                self.ad.tick(at)                     # the engine's own work due at this instant
                step_records += self._drain()
                for ev in step.get("events") or []:
                    step_records += self._apply(ev, at, i)
                self.ad.tick(at)
                step_records += self._drain()
                self._check(step.get("expect") or {}, step_records, i, step["at"], MAIN)
            self._check(sc.data.get("final") or {}, step_records, "final", timeline[-1]["at"], MAIN, final=True)
        except Exception as exc:  # noqa: BLE001 - a harness/engine crash is reported, never a class
            res.outcome = "error"
            res.error = f"{type(exc).__name__}: {exc}"
        finally:
            try:
                self.ad.teardown()
            except Exception:  # noqa: BLE001
                pass
        res.log = self.log
        if res.outcome != "error":
            if res.mismatches:
                res.outcome = "fail"
            elif res.evaluated == 0:
                res.outcome = "fail"  # reading rule: nothing evaluated is structural, never a pass
                res.mismatches.append(Mismatch("final", "", "*", "at least one evaluated check", "none",
                                               unsupported="every checked key is unsupported"))
        return res

    def _apply(self, ev: dict, at: datetime, step: int, cls: str = MAIN) -> list[Record]:
        name = next(k for k in ev if k not in ("side", "sides", "event"))
        if name == "other_class":
            return self._apply(ev["event"], at, step, ev["other_class"])
        params = {k: v for k, v in ev.items() if k != name}
        value = ev[name]
        who = None
        if name == "coach_sets":
            params = {"settings": value}
        elif name == "class_created":
            pass
        elif name == "confirms" and value == "regulars":
            who = "regulars"
        else:
            try:
                who = self.resolve(value, cls)
            except LookupError as exc:
                self.result.mismatches.append(Mismatch(step, fmt(at), f"events.{name}", value, str(exc)))
                return []
        try:
            applied = self.ad.apply(name, who, params, cls, at)
        except Unsupported as exc:
            self.result.mismatches.append(
                Mismatch(step, fmt(at), f"events.{name}", ev, "not applied", unsupported=str(exc)))
            self.result.skipped += 1
            return []
        new = self._drain()
        if applied.refused:
            action = {"joins_directly": "direct_join", "joins_waiting_list": "waiting_list"}.get(name, name)
            rec = Record("refused", who or "", cls, at, {"action": action, "reason": applied.reason})
            self.log.append(rec)
            new.append(rec)
        return new

    # comparison --------------------------------------------------------------------------

    def _note(self, step, at, key, expected, actual, ok: bool, unsupported: str | None = None) -> None:
        if unsupported:
            self.result.skipped += 1
            if not ok:
                self.result.mismatches.append(Mismatch(step, at, key, expected, actual, unsupported))
            return
        self.result.evaluated += 1
        if not ok:
            self.result.mismatches.append(Mismatch(step, at, key, expected, actual))

    def _check(self, expect: dict, recs: list[Record], step, at: str, cls: str, final: bool = False) -> None:
        mine = [r for r in recs if r.cls == cls]
        snap = self.ad.snapshot(cls)
        spec = self.sc.classes[cls]
        for key, exp in expect.items():
            if key in ("other_class", "other_classes"):
                for other, sub in (exp or {}).items():
                    self._check(sub, recs, step, at, other)
                continue
            gap = self.ad.unsupported(key)
            try:
                handler = getattr(self, f"_x_{key}")
            except AttributeError:
                self._note(step, at, key, exp, "runner has no check for this key", False)
                continue
            handler(exp, mine, snap, spec, step, at, gap)

    def _who_list(self, items, cls: str) -> list[str]:
        out = []
        for w in items or []:
            try:
                out.append(self.resolve(w, cls))
            except LookupError as exc:
                out.append(f"<{exc}>")
        return out

    def _x_invitations(self, exp, recs, snap, spec, step, at, gap):
        sent = [r for r in recs if r.kind == "invited"]
        actual = [(r.student, r.data.get("side_named", UNKNOWN), r.data.get("group")) for r in sent]
        shown = [{"who": s, "side_named": sn} for s, sn, _ in actual]
        if exp == "none":
            self._note(step, at, "invitations", "none", shown, not actual, gap)
            return
        pool = list(actual)
        problems: list[str] = []
        side_unknown = False

        def take(pred, n: int, label: str) -> None:
            nonlocal side_unknown
            got = [p for p in pool if pred(p)][:n]
            for p in got:
                pool.remove(p)
                side_unknown |= p[1] == UNKNOWN
            if len(got) != n:
                problems.append(f"{label}: expected {n}, got {len(got)}")

        def side_ok(item):
            return lambda p: "side_named" not in item or p[1] in (item["side_named"], UNKNOWN)

        named = [it for it in exp if "who" in it]
        cohort_sided = [it for it in exp if "cohort" in it and "side_named" in it]
        cohort_any = [it for it in exp if "cohort" in it and "side_named" not in it]
        for it in named:
            try:
                sid = self.resolve(it["who"], spec.id)
            except LookupError as exc:
                problems.append(str(exc))
                continue
            take(lambda p, sid=sid, it=it: p[0] == sid and side_ok(it)(p), 1, f"{it['who']}")
        for it in cohort_sided + cohort_any:
            members = set(self.sc.cohorts.get(it["cohort"], []))
            take(lambda p, members=members, it=it: p[0] in members and side_ok(it)(p), it["count"],
                 f"{it['cohort']} side_named={it.get('side_named', '*')}")
        if pool:
            problems.append(f"unexpected: {[{'who': s, 'side_named': sn} for s, sn, _ in pool]}")
        if side_unknown and not problems:
            gap = gap or self.ad.unsupported("invitations.side_named")
        self._note(step, at, "invitations", exp, problems or shown, not problems, gap)

    def _x_invitations_total_sent(self, exp, recs, snap, spec, step, at, gap):
        n = sum(1 for r in self.log if r.kind == "invited" and r.cls == spec.id)
        self._note(step, at, "invitations_total_sent", exp, n, n == exp, gap)

    def _x_open_unanswered(self, exp, recs, snap, spec, step, at, gap):
        n = len(snap.open_invitations)
        self._note(step, at, "open_unanswered", exp, n, n == exp, gap)

    def _x_open_in_round(self, exp, recs, snap, spec, step, at, gap):
        n = snap.open_in_round
        self._note(step, at, "open_in_round", exp, n, n == exp, gap or (None if n is not None else "no rounds"))

    def _x_placed(self, exp, recs, snap, spec, step, at, gap):
        placed = [(r.student, r.data.get("side"), r.data.get("how")) for r in recs if r.kind == "placed"]
        for it in exp:
            sid = self._who_list([it["who"]], spec.id)[0]
            want = (sid, it["side"], it["how"])
            g = gap or self.ad.unsupported("placed.how", it["how"])
            self._note(step, at, f"placed[{it['who']}]", want, [p for p in placed if p[0] == sid] or "not placed",
                       want in placed, g)

    def _x_messages(self, exp, recs, snap, spec, step, at, gap):
        msgs = [(r.student, r.data.get("kind")) for r in recs if r.kind == "message"]
        for it in exp:
            sid = self._who_list([it["who"]], spec.id)[0]
            g = gap or self.ad.unsupported("messages.kind", it["kind"])
            self._note(step, at, f"messages[{it['who']}]", (sid, it["kind"]),
                       [m for m in msgs if m[0] == sid] or "no message", (sid, it["kind"]) in msgs, g)

    def _x_reminders(self, exp, recs, snap, spec, step, at, gap):
        got = {r.student for r in recs if r.kind == "reminder"}
        going_regulars = [p.id for p in self.sc.regulars(spec.id) if p.id in snap.roster]
        to: list[str] = []
        for w in exp.get("to") or []:
            to += going_regulars if w == "regulars" else self._who_list([w], spec.id)
        not_to = self._who_list(exp.get("not_to"), spec.id)
        missing = sorted(set(to) - got)
        extra = sorted(set(not_to) & got)
        self._note(step, at, "reminders", exp, {"missing": missing, "unexpected": extra, "sent": sorted(got)},
                   not missing and not extra, gap)

    def _x_absences(self, exp, recs, snap, spec, step, at, gap):
        got = [(r.student, r.data.get("kind")) for r in recs if r.kind == "absence"]
        for it in exp:
            sid = self._who_list([it["who"]], spec.id)[0]
            want = (sid, it["kind"])
            ok = want in got or (it["kind"] == "none" and not any(g[0] == sid for g in got))
            self._note(step, at, f"absences[{it['who']}]", want, [g for g in got if g[0] == sid], ok,
                       gap or self.ad.unsupported("absences.kind", it["kind"]))

    def _x_refused(self, exp, recs, snap, spec, step, at, gap):
        got = [(r.student, r.data.get("action")) for r in recs if r.kind == "refused"]
        for it in exp:
            sid = self._who_list([it["who"]], spec.id)[0]
            self._note(step, at, f"refused[{it['who']}]", (sid, it["action"]), got, (sid, it["action"]) in got, gap)

    def _counts(self, snap: Snapshot) -> dict[str, int]:
        c = {"L": 0, "R": 0, "total": len(snap.roster)}
        for side in snap.roster.values():
            if side in ("L", "R"):
                c[side] += 1
        return c

    def _x_roster(self, exp, recs, snap, spec, step, at, gap):
        c = self._counts(snap)
        actual = {k: c[k] for k in exp}
        self._note(step, at, "roster", exp, actual, actual == exp, gap)

    def _x_missing(self, exp, recs, snap, spec, step, at, gap):
        c = self._counts(snap)
        half = spec.capacity // 2
        full = {"L": max(half - c["L"], 0), "R": max(spec.capacity - half - c["R"], 0),
                "total": max(spec.capacity - c["total"], 0)}
        actual = {k: full[k] for k in exp}
        self._note(step, at, "missing", exp, actual, actual == exp, gap)

    def _x_nothing_sent(self, exp, recs, snap, spec, step, at, gap):
        sent = [r.as_dict() for r in recs if r.kind in ("invited", "reminder", "message")]
        self._note(step, at, "nothing_sent", True, sent, not sent, gap)

    def _x_waiting_list(self, exp, recs, snap, spec, step, at, gap):
        for which in ("coach", "students"):
            if which in exp:
                want = self._who_list(exp[which], spec.id)
                got = snap.waiting_list.get(which, [])
                self._note(step, at, f"waiting_list.{which}", want, got, want == got,
                           gap or self.ad.unsupported(f"waiting_list.{which}"))


def run_scenario(path: Path, adapter: Adapter) -> Result:
    return Run(load_scenario(path), adapter).execute()


def scenario_paths() -> list[Path]:
    """The suite's files; ``INVITATION_SCENARIOS_DIR`` points the opt-in run at another folder."""
    import os

    folder = Path(os.getenv("INVITATION_SCENARIOS_DIR") or SCENARIOS_DIR)
    return sorted(folder.glob("*.yaml"))


class _NoAliases(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True


def dump_yaml(data) -> str:
    return yaml.dump(data, Dumper=_NoAliases, sort_keys=False, allow_unicode=True, width=120)


def dump_log(result: Result, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{result.key}.log.yaml"
    path.write_text(dump_yaml({"scenario": result.key, **result.summary(),
                               "log": [r.as_dict() for r in result.log]}), encoding="utf-8")
    return path
