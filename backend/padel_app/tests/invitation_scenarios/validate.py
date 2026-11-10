"""Validate invitation scenario files without a database.

Usage (from the repo root of any worktree):

    backend/.venv/bin/python -I backend/padel_app/tests/invitation_scenarios/validate.py \
        backend/padel_app/tests/invitation_scenarios/scenarios/

Arguments are files or directories (every ``*.yaml`` inside, sorted). Exit status is 1
when any file has an error, 0 otherwise; warnings never fail the run.

The format is specified in docs/plans/2026-11-10-scenario-harness-design.md §2-§6 (main
checkout; ``docs/`` is gitignored). ``scenario.schema.json`` beside this file is the same
contract as JSON Schema; the referential checks (who resolves, counts fit cohorts, aliases,
time order) exist only here.

Self-contained on purpose: stdlib + PyYAML, no ``padel_app`` import, so ``python -I`` works.
"""

from __future__ import annotations

import re
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "validate.py needs PyYAML. Run it with the backend venv:\n"
        "  backend/.venv/bin/python -I backend/padel_app/tests/invitation_scenarios/validate.py "
        "backend/padel_app/tests/invitation_scenarios/scenarios/\n"
        "(in a worktree without backend/.venv, use "
        "/Users/pedropacheco/Documents/Projetos/padel_app/levapp/backend/.venv/bin/python)\n"
    )
    sys.exit(2)


# --- vocabulary (mirrors scenario.schema.json; test_scenarios.py checks they agree) ---------

TOP_KEYS_REQUIRED = {"id", "title", "source", "what_it_tests", "timeline", "final"}
TOP_KEYS_OPTIONAL = {
    "tags", "depends_on", "corrections", "notes", "settings", "class", "other_classes",
    "roster", "students", "tick_every", "variant",
}

TAGS = {
    "groups", "rounds", "max-open", "timers", "method-b", "method-c", "quiet-hours",
    "reminders", "waiting-list", "coach-list", "direct-join", "aviso", "sides", "both-sides",
    "other-side", "unbalanced", "regulars", "absences", "cancellation", "late-class",
    "multi-class", "last-invite", "eligibility", "tiebreak",
}

SETTINGS_KEYS = {
    "invites_per_spot", "max_open", "timing", "first_invite", "last_invite_before",
    "quiet_hours", "reminders", "absence_cutoff_before", "eligible_levels_above", "tiebreak",
    "groups",
}

STATES = {"uninvited", "invited", "accepted", "declined", "placed", "on_waiting_list"}
HOW = {"invitation", "direct", "auto_from_waiting_list", "regular_returns"}
MESSAGE_KINDS = {"aviso", "sorry", "added", "waiting_list_offer"}
ABSENCE_KINDS = {"justified", "unjustified", "none"}
SIDES = {"L", "R"}
STUDENT_SIDES = {"L", "R", "both"}
WL_SIDES = {"own", "other", "both"}

# event key -> {param: required?}
EVENTS: dict[str, dict[str, bool]] = {
    "accepts": {},
    "declines": {},
    "confirms": {},
    "appears": {},
    "joins_directly": {"side": False},
    "joins_waiting_list": {"sides": True},
    "leaves_waiting_list": {},
    "coach_adds_to_waiting_list": {"side": True},
    "coach_removes_from_waiting_list": {},
    "regular_no": {},
    "regular_returns": {},
    "cancels": {},
    "no_show": {},
    "class_created": {},
    "coach_sets": {},
    "other_class": {"event": True},
}
WHO_EVENTS = set(EVENTS) - {"class_created", "coach_sets", "other_class"}

EXPECT_KEYS = {
    "invitations", "invitations_total_sent", "open_unanswered", "placed", "messages",
    "reminders", "absences", "missing", "roster", "nothing_sent", "waiting_list", "other_class",
    "refused",
}
REFUSED_ACTIONS = {"direct_join", "waiting_list"}

AT_RE = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")
HHMM_RE = re.compile(r"^\d{2}:\d{2}$")
DURATION_RE = re.compile(r"^(?=\d)(\d+h)?(\d+m)?$")
U_RE = re.compile(r"^U([1-9]|[12]\d|3[01])$")
E_RE = re.compile(r"^E[1-6]$")
COHORT_RE = re.compile(r"^L[1-6][LRB](-[a-z0-9]+(-[a-z0-9]+)*)?$")
FILE_RE = re.compile(r"^(P?\d{2})([a-z]?)-[a-z0-9]+(-[a-z0-9]+)*\.yaml$")
REGULAR_MEMBER_RE = re.compile(r"^([LRB])-(\d+)$")

BOOL_VALUE_KEYS = {"derived", "nothing_sent", "class_created"}


def parse_at(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M")


class Report:
    def __init__(self, name: str):
        self.name = name
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, path: str, msg: str) -> None:
        self.errors.append(f"{self.name}: {path}: {msg}")

    def warn(self, path: str, msg: str) -> None:
        self.warnings.append(f"{self.name}: {path}: warning: {msg}")


# --- YAML trap sweep -------------------------------------------------------------------------

def sweep_yaml_traps(node, path: str, rep: Report) -> None:
    """Booleans as keys or stray values, and dates/times the YAML loader parsed itself."""
    if isinstance(node, dict):
        for k, v in node.items():
            sub = f"{path}.{k}" if path else str(k)
            if isinstance(k, bool):
                rep.err(sub, f"key parsed as boolean {k!r}: yes/no/on/off/true/false are not "
                             "valid keys (YAML 1.1); events are `accepts` / `declines`")
            elif not isinstance(k, (str, int)):
                rep.err(sub, f"key {k!r} is a {type(k).__name__}, expected a string")
            if isinstance(v, bool) and k not in BOOL_VALUE_KEYS:
                rep.err(sub, f"value parsed as boolean {v!r}: write sides as L/R/both and never "
                             "use yes/no/on/off as bare values")
            sweep_yaml_traps(v, sub, rep)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            sweep_yaml_traps(v, f"{path}[{i}]", rep)
    elif isinstance(node, (datetime, date)):
        rep.err(path, f"YAML parsed {node!r} as a date: write date-times as "
                      "`YYYY-MM-DD HH:MM` (no seconds, no `T`) so they stay strings")


# --- small field checkers --------------------------------------------------------------------

def check_at(value, path: str, rep: Report, *, nullable: bool = False) -> datetime | None:
    if value is None and nullable:
        return None
    if isinstance(value, (datetime, date)):
        return None  # already reported by the sweep
    if not isinstance(value, str) or not AT_RE.match(value):
        rep.err(path, f"expected a full local date-time `YYYY-MM-DD HH:MM`, got {value!r}")
        return None
    try:
        return parse_at(value)
    except ValueError:
        rep.err(path, f"not a real date-time: {value!r}")
        return None


def check_duration(value, path: str, rep: Report) -> None:
    if not isinstance(value, str) or not DURATION_RE.match(value):
        rep.err(path, f"expected a duration like 20m, 2h, 1h30m, got {value!r}")


def check_hhmm(value, path: str, rep: Report) -> None:
    if isinstance(value, int) and not isinstance(value, bool):
        rep.err(path, f"got the integer {value}: an unquoted 19:00 is read by YAML 1.1 as a "
                      "base-60 number; quote it: \"19:00\"")
    elif not isinstance(value, str) or not HHMM_RE.match(value):
        rep.err(path, f"expected a quoted local time \"HH:MM\", got {value!r}")


def check_int(value, path: str, rep: Report, *, minimum: int = 0, maximum: int | None = None) -> bool:
    if not isinstance(value, int) or isinstance(value, bool):
        rep.err(path, f"expected an integer, got {value!r}")
        return False
    if value < minimum or (maximum is not None and value > maximum):
        rng = f">= {minimum}" if maximum is None else f"{minimum}..{maximum}"
        rep.err(path, f"expected an integer {rng}, got {value}")
        return False
    return True


def check_keys(node: dict, path: str, rep: Report, allowed: set[str], required: set[str] = frozenset()) -> None:
    for k in node:
        if k not in allowed:
            rep.err(f"{path}.{k}" if path else str(k), f"unknown key; allowed: {', '.join(sorted(allowed))}")
    for k in sorted(required - set(node)):
        rep.err(path or "<top>", f"missing required key `{k}`")


def check_sides_count(value, path: str, rep: Report) -> None:
    """`{L: n, R: n}` or `{total: n}`."""
    if not isinstance(value, dict):
        rep.err(path, f"expected {{L: n, R: n}} or {{total: n}}, got {value!r}")
        return
    if set(value) == {"total"}:
        check_int(value["total"], f"{path}.total", rep)
    elif set(value) == {"L", "R"}:
        check_int(value["L"], f"{path}.L", rep)
        check_int(value["R"], f"{path}.R", rep)
    else:
        rep.err(path, f"expected exactly {{L, R}} or {{total}}, got keys {sorted(map(str, value))}")


# --- settings --------------------------------------------------------------------------------

def check_settings(node, path: str, rep: Report) -> None:
    if not isinstance(node, dict):
        rep.err(path, "expected a mapping of setting overrides ({} for the base profile)")
        return
    check_keys(node, path, rep, SETTINGS_KEYS)
    for k, v in node.items():
        p = f"{path}.{k}"
        if k in ("invites_per_spot", "max_open"):
            check_int(v, p, rep, minimum=1)
        elif k == "eligible_levels_above":
            check_int(v, p, rep, minimum=0, maximum=5)
        elif k in ("last_invite_before", "absence_cutoff_before"):
            check_duration(v, p, rep)
        elif k == "tiebreak":
            if not isinstance(v, str):
                rep.err(p, "expected a string")
        elif k == "first_invite":
            if not isinstance(v, dict):
                rep.err(p, "expected {days_before: n, at: \"HH:MM\"}")
                continue
            check_keys(v, p, rep, {"days_before", "at"}, {"days_before", "at"})
            if "days_before" in v:
                check_int(v["days_before"], f"{p}.days_before", rep)
            if "at" in v:
                check_hhmm(v["at"], f"{p}.at", rep)
        elif k == "quiet_hours":
            if v is None:
                continue  # quiet hours off
            if not isinstance(v, list) or len(v) != 2:
                rep.err(p, "expected [\"HH:MM\", \"HH:MM\"] or null")
                continue
            for i, t in enumerate(v):
                check_hhmm(t, f"{p}[{i}]", rep)
        elif k == "reminders":
            if not isinstance(v, dict):
                rep.err(p, "expected {days_before, at, every, max}")
                continue
            check_keys(v, p, rep, {"days_before", "at", "every", "max"})
            if "days_before" in v:
                check_int(v["days_before"], f"{p}.days_before", rep)
            if "at" in v:
                check_hhmm(v["at"], f"{p}.at", rep)
            if "every" in v:
                check_duration(v["every"], f"{p}.every", rep)
            if "max" in v:
                check_int(v["max"], f"{p}.max", rep)
        elif k == "timing":
            check_timing(v, p, rep)
        elif k == "groups":
            check_groups(v, p, rep)


def check_timing(v, p: str, rep: Report) -> None:
    if not isinstance(v, dict) or v.get("method") not in ("A", "B", "C"):
        rep.err(p, "expected {method: A|B|C, ...}")
        return
    method = v["method"]
    if method in ("A", "B"):
        check_keys(v, p, rep, {"method", "between_rounds", "between_groups"})
        for key in ("between_rounds", "between_groups"):
            if key in v:
                check_duration(v[key], f"{p}.{key}", rep)
        return
    check_keys(v, p, rep, {"method", "per_group"}, {"per_group"})
    per_group = v.get("per_group")
    if per_group is None:
        return
    if not isinstance(per_group, dict):
        rep.err(f"{p}.per_group", "expected {1: {between_rounds, to_next_group}, ...}")
        return
    for g, spec in per_group.items():
        gp = f"{p}.per_group.{g}"
        if not isinstance(g, int) or isinstance(g, bool) or not 1 <= g <= 6:
            rep.err(gp, "group keys are the PDF's group numbers 1..6")
        if not isinstance(spec, dict):
            rep.err(gp, "expected {between_rounds, to_next_group}")
            continue
        check_keys(spec, gp, rep, {"between_rounds", "to_next_group"})
        for key, d in spec.items():
            if key in ("between_rounds", "to_next_group"):
                check_duration(d, f"{gp}.{key}", rep)


def check_groups(v, p: str, rep: Report) -> None:
    if not isinstance(v, list) or not v:
        rep.err(p, "expected a non-empty list of groups")
        return
    for i, g in enumerate(v):
        gp = f"{p}[{i}]"
        if not isinstance(g, dict):
            rep.err(gp, "expected {list: coach|students, side} or {level: n, side}")
            continue
        if "list" in g:
            check_keys(g, gp, rep, {"list", "side"}, {"list", "side"})
            if g.get("list") not in ("coach", "students"):
                rep.err(f"{gp}.list", "expected coach or students")
        else:
            check_keys(g, gp, rep, {"level", "side"}, {"level", "side"})
            if "level" in g:
                check_int(g["level"], f"{gp}.level", rep, minimum=-5, maximum=5)
        if "side" in g and g["side"] not in ("same", "other", "any"):
            rep.err(f"{gp}.side", "expected same, other or any")


# --- people ----------------------------------------------------------------------------------

class People:
    """Everyone a `who` can name, plus cohorts and aliases bound so far."""

    def __init__(self) -> None:
        self.named: dict[str, str] = {}        # id -> "regular" | "student"
        self.regular_cohort: dict[str, int] = {}  # "L"/"R"/"B" -> count (cohort-form regulars)
        self.cohorts: dict[str, int] = {}       # student cohort id -> count
        self.aliases: dict[str, str] = {}       # alias -> cohort it was bound from

    def is_name(self, who: str) -> bool:
        if who in self.named or who in self.aliases:
            return True
        m = REGULAR_MEMBER_RE.match(who)
        return bool(m and 1 <= int(m.group(2)) <= self.regular_cohort.get(m.group(1), 0))


def check_level(v, path: str, rep: Report, *, nullable: bool) -> None:
    if v is None and nullable:
        return
    check_int(v, path, rep, minimum=1, maximum=6)


def check_regulars(v, path: str, rep: Report, people: People | None) -> None:
    if isinstance(v, dict):
        check_keys(v, path, rep, {"L", "R", "both"}, {"L", "R"})
        for side in ("L", "R", "both"):
            if side in v and check_int(v[side], f"{path}.{side}", rep) and people is not None:
                people.regular_cohort["B" if side == "both" else side] = v[side]
        return
    if not isinstance(v, list):
        rep.err(path, "expected {L: n, R: n} or a list of {id, side[, plays: both][, level]}")
        return
    for i, r in enumerate(v):
        rp = f"{path}[{i}]"
        if not isinstance(r, dict):
            rep.err(rp, "expected {id, side}")
            continue
        check_keys(r, rp, rep, {"id", "side", "plays", "level"}, {"id", "side"})
        if r.get("side") not in STUDENT_SIDES:
            rep.err(f"{rp}.side", f"expected L, R or both, got {r.get('side')!r}")
        if "plays" in r and r["plays"] != "both":
            rep.err(f"{rp}.plays", "only `plays: both` is meaningful")
        if "level" in r:
            check_level(r["level"], f"{rp}.level", rep, nullable=True)
        if people is not None and isinstance(r.get("id"), str):
            if r["id"] in people.named:
                rep.err(f"{rp}.id", f"duplicate id {r['id']!r}")
            people.named[r["id"]] = "regular"


def check_students(v, path: str, rep: Report, people: People) -> None:
    if not isinstance(v, list):
        rep.err(path, "expected a list")
        return
    for i, s in enumerate(v):
        sp = f"{path}[{i}]"
        if not isinstance(s, dict):
            rep.err(sp, "expected {id, level, side} or {cohort, count, level, side}")
            continue
        if "cohort" in s:
            check_keys(s, sp, rep, {"cohort", "count", "level", "side", "participations"},
                       {"cohort", "count", "level", "side"})
            cid = s.get("cohort")
            if not isinstance(cid, str):
                rep.err(f"{sp}.cohort", "expected a cohort id like L2R")
                continue
            if not COHORT_RE.match(cid):
                rep.warn(f"{sp}.cohort", f"{cid!r} does not follow L<level><L|R|B>[-suffix] (design §2.2)")
            if cid in people.cohorts or cid in people.named:
                rep.err(f"{sp}.cohort", f"duplicate id {cid!r}")
            if check_int(s.get("count"), f"{sp}.count", rep, minimum=1):
                people.cohorts[cid] = s["count"]
                parts = s.get("participations")
                if parts is not None and not (
                    isinstance(parts, list) and len(parts) == s["count"]
                    and all(isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in parts)
                ):
                    rep.err(f"{sp}.participations",
                            f"expected a list of {s['count']} non-negative integers, one per member in order")
        else:
            check_keys(s, sp, rep, {"id", "level", "side", "participations"},
                       {"id", "level", "side"})
            if "participations" in s:
                check_int(s["participations"], f"{sp}.participations", rep)
            sid = s.get("id")
            if not isinstance(sid, str):
                rep.err(f"{sp}.id", "expected a string id like W1")
                continue
            if sid in people.named or sid in people.cohorts:
                rep.err(f"{sp}.id", f"duplicate id {sid!r}")
            if REGULAR_MEMBER_RE.match(sid):
                rep.err(f"{sp}.id", f"{sid!r} collides with the cohort-form regular ids L-n / R-n")
            people.named[sid] = "student"
        if "level" in s:
            check_level(s["level"], f"{sp}.level", rep, nullable=True)
        if "side" in s and s["side"] not in STUDENT_SIDES:
            rep.err(f"{sp}.side", f"expected L, R or both, got {s['side']!r}")


# --- who -------------------------------------------------------------------------------------

def check_who(who, path: str, rep: Report, people: People, *, binds: bool = True) -> None:
    if isinstance(who, str):
        if who in people.cohorts:
            rep.err(path, f"{who!r} is a cohort: write {{cohort: {who}, state: ..., as: alias}} "
                          "(design §3), the engine chooses the member")
        elif not people.is_name(who):
            m = re.match(r"^(.+)-\d+$", who)
            if m and m.group(1) in people.cohorts:
                rep.err(path, f"{who!r} names a cohort member directly; the engine chooses members, "
                              f"use {{cohort: {m.group(1)}, state: ..., as: alias}}")
            else:
                rep.err(path, f"unknown student or alias {who!r}")
        return
    if not isinstance(who, dict):
        rep.err(path, f"expected a student id, an alias or {{cohort, state[, invited_at][, as]}}, got {who!r}")
        return
    check_keys(who, path, rep, {"cohort", "state", "invited_at", "side_named", "as"}, {"cohort", "state"})
    if "side_named" in who and who["side_named"] not in ("L", "R", None):
        rep.err(f"{path}.side_named", f"expected L, R or null, got {who['side_named']!r}")
    cohort = who.get("cohort")
    if cohort not in people.cohorts:
        rep.err(f"{path}.cohort", f"unknown cohort {cohort!r}")
    if who.get("state") not in STATES:
        rep.err(f"{path}.state", f"expected one of {', '.join(sorted(STATES))}, got {who.get('state')!r}")
    if "invited_at" in who:
        check_at(who["invited_at"], f"{path}.invited_at", rep)
    if "as" in who:
        alias = who["as"]
        if not isinstance(alias, str) or not alias:
            rep.err(f"{path}.as", "expected an alias name")
        elif people.is_name(alias) or alias in people.cohorts:
            rep.err(f"{path}.as", f"alias {alias!r} is already a student, cohort or bound alias")
        elif binds:
            people.aliases[alias] = cohort


def check_who_list(v, path: str, rep: Report, people: People, *, allow_regulars: bool = False) -> None:
    if not isinstance(v, list):
        rep.err(path, "expected a list")
        return
    for i, w in enumerate(v):
        if allow_regulars and w == "regulars":
            continue
        check_who(w, f"{path}[{i}]", rep, people)


# --- events ----------------------------------------------------------------------------------

def check_event(ev, path: str, rep: Report, people: People, class_ids: set[str], *, nested: bool = False) -> None:
    if not isinstance(ev, dict):
        rep.err(path, f"expected a mapping like {{accepts: W1}}, got {ev!r}")
        return
    keys = [k for k in ev if k in EVENTS]
    if len(keys) != 1:
        unknown = [str(k) for k in ev if k not in EVENTS]
        if not keys:
            rep.err(path, f"no event key (unknown keys: {', '.join(unknown)}); events: {', '.join(EVENTS)}")
        else:
            rep.err(path, f"more than one event key in one item: {keys}; split them into separate items")
        return
    name = keys[0]
    params = EVENTS[name]
    p = f"{path}.{name}"
    for k in ev:
        if k != name and k not in params:
            rep.err(f"{path}.{k}", f"`{name}` takes no parameter `{k}`"
                                   + (f"; allowed: {', '.join(params)}" if params else ""))
    for k, required in params.items():
        if required and k not in ev:
            rep.err(path, f"`{name}` requires `{k}`")
    value = ev[name]
    if name in WHO_EVENTS:
        check_who(value, p, rep, people)
    elif name == "class_created":
        if value is not True:
            rep.err(p, "expected `class_created: true`")
    elif name == "coach_sets":
        check_settings(value, p, rep)
    elif name == "other_class":
        if nested:
            rep.err(p, "other_class events cannot nest")
        elif value not in class_ids:
            rep.err(p, f"unknown other class {value!r}; declare it in other_classes")
        if "event" in ev:
            check_event(ev["event"], f"{path}.event", rep, people, class_ids, nested=True)
    if "side" in ev and ev["side"] not in SIDES:
        rep.err(f"{path}.side", f"expected L or R, got {ev['side']!r}")
    if "sides" in ev and ev["sides"] not in WL_SIDES:
        rep.err(f"{path}.sides", f"expected own, other or both, got {ev['sides']!r}")


# --- expectations ----------------------------------------------------------------------------

def check_expect(node, path: str, rep: Report, people: People, class_ids: set[str],
                 invited_so_far: dict[str, int], *, nested: bool = False) -> None:
    if not isinstance(node, dict):
        rep.err(path, "expected a mapping of expectations")
        return
    check_keys(node, path, rep, EXPECT_KEYS)
    for k, v in node.items():
        p = f"{path}.{k}"
        if k == "invitations":
            check_invitations(v, p, rep, people, invited_so_far)
        elif k in ("invitations_total_sent", "open_unanswered"):
            check_int(v, p, rep)
        elif k == "placed":
            check_records(v, p, rep, people, {"who", "side", "how"}, {"side": SIDES, "how": HOW})
        elif k == "messages":
            check_records(v, p, rep, people, {"who", "kind"}, {"kind": MESSAGE_KINDS})
        elif k == "absences":
            check_records(v, p, rep, people, {"who", "kind"}, {"kind": ABSENCE_KINDS})
        elif k == "refused":
            check_records(v, p, rep, people, {"who", "action"}, {"action": REFUSED_ACTIONS})
        elif k == "reminders":
            if not isinstance(v, dict):
                rep.err(p, "expected {to: [...], not_to: [...]}")
                continue
            check_keys(v, p, rep, {"to", "not_to"})
            for key in ("to", "not_to"):
                if key in v:
                    check_who_list(v[key], f"{p}.{key}", rep, people, allow_regulars=True)
        elif k in ("missing", "roster"):
            check_sides_count(v, p, rep)
        elif k == "nothing_sent":
            if v is not True:
                rep.err(p, "expected `nothing_sent: true` (omit it otherwise)")
        elif k == "waiting_list":
            if not isinstance(v, dict):
                rep.err(p, "expected {coach: [...], students: [...]}")
                continue
            check_keys(v, p, rep, {"coach", "students"})
            for key in ("coach", "students"):
                if key in v:
                    check_who_list(v[key], f"{p}.{key}", rep, people)
        elif k == "other_class":
            if nested:
                rep.err(p, "other_class expectations cannot nest")
                continue
            if not isinstance(v, dict):
                rep.err(p, "expected {B: {expectations}}")
                continue
            for cid, sub in v.items():
                if cid not in class_ids:
                    rep.err(f"{p}.{cid}", f"unknown other class {cid!r}")
                check_expect(sub, f"{p}.{cid}", rep, people, class_ids, {}, nested=True)


def check_records(v, p: str, rep: Report, people: People, keys: set[str], enums: dict[str, set[str]]) -> None:
    if not isinstance(v, list):
        rep.err(p, "expected a list")
        return
    for i, item in enumerate(v):
        ip = f"{p}[{i}]"
        if not isinstance(item, dict):
            rep.err(ip, f"expected {{{', '.join(sorted(keys))}}}")
            continue
        check_keys(item, ip, rep, keys, keys)
        if "who" in item:
            check_who(item["who"], f"{ip}.who", rep, people)
        for key, allowed in enums.items():
            if key in item and item[key] not in allowed:
                rep.err(f"{ip}.{key}", f"expected one of {', '.join(sorted(allowed))}, got {item[key]!r}")


def check_invitations(v, p: str, rep: Report, people: People, invited_so_far: dict[str, int]) -> None:
    if v == "none":
        return
    if not isinstance(v, list):
        rep.err(p, "expected a list or `none`")
        return
    per_cohort: dict[str, int] = {}
    for i, item in enumerate(v):
        ip = f"{p}[{i}]"
        if not isinstance(item, dict):
            rep.err(ip, "expected {who: ...} or {cohort, count}")
            continue
        if "cohort" in item:
            check_keys(item, ip, rep, {"cohort", "count", "side_named", "group"}, {"cohort", "count"})
            cid = item.get("cohort")
            if cid not in people.cohorts:
                rep.err(f"{ip}.cohort", f"unknown cohort {cid!r}")
            elif check_int(item.get("count"), f"{ip}.count", rep, minimum=1):
                per_cohort[cid] = per_cohort.get(cid, 0) + item["count"]
        else:
            check_keys(item, ip, rep, {"who", "side_named", "group"}, {"who"})
            if "who" in item:
                check_who(item["who"], f"{ip}.who", rep, people)
        if "side_named" in item and item["side_named"] not in ("L", "R", None):
            rep.err(f"{ip}.side_named", f"expected L, R or null, got {item['side_named']!r}")
        if "group" in item:
            check_int(item["group"], f"{ip}.group", rep, minimum=1, maximum=6)
    for cid, n in per_cohort.items():
        size = people.cohorts[cid]
        if n > size:
            rep.err(p, f"{n} invitations to cohort {cid} in one step, but it has {size} members")
        invited_so_far[cid] = invited_so_far.get(cid, 0) + n
        if invited_so_far[cid] > size:
            rep.warn(p, f"cohort {cid} invited {invited_so_far[cid]} times so far but has {size} "
                        "members; fine only if someone is invited again")


# --- the file --------------------------------------------------------------------------------

def validate_data(data, name: str, filename: str | None = None) -> Report:
    rep = Report(name)
    if not isinstance(data, dict):
        rep.err("<top>", "the file must be a YAML mapping")
        return rep
    sweep_yaml_traps(data, "", rep)
    check_keys(data, "", rep, TOP_KEYS_REQUIRED | TOP_KEYS_OPTIONAL, TOP_KEYS_REQUIRED)

    sid = data.get("id")
    if isinstance(sid, bool) or not (
        (isinstance(sid, int) and 1 <= sid <= 95) or (isinstance(sid, str) and re.match(r"^P\d{2}$", sid))
    ):
        rep.err("id", f"expected the PDF scenario number 1..95 (or P01..P33), got {sid!r}")
    elif filename is not None:
        m = FILE_RE.match(filename)
        expected = f"{sid:02d}" if isinstance(sid, int) else sid
        if not m:
            rep.err("<file>", f"file name must be NN-slug.yaml or NNa-slug.yaml for a variant "
                              f"(ASCII, lower-case, hyphens), got {filename!r}")
        elif m.group(1) != expected:
            rep.err("<file>", f"file name starts with {m.group(1)} but id is {sid}")
        elif bool(m.group(2)) != ("variant" in data):
            rep.err("<file>", "a file with `variant` is named NNa-/NNb-…, and only such a file carries `variant`")

    if "variant" in data and (not isinstance(data["variant"], str) or not data["variant"].strip()):
        rep.err("variant", "expected a short name for this outcome, e.g. sim / nao")
    for k in ("title", "what_it_tests"):
        if k in data and (not isinstance(data[k], str) or not data[k].strip()):
            rep.err(k, "expected non-empty text")
    if "notes" in data and data["notes"] is not None and not isinstance(data["notes"], str):
        rep.err("notes", "expected text")

    src = data.get("source")
    if src is not None:
        if not isinstance(src, dict):
            rep.err("source", "expected {section, lines: [from, to]}")
        else:
            check_keys(src, "source", rep, {"section", "lines"}, {"section", "lines"})
            lines = src.get("lines")
            if not (isinstance(lines, list) and len(lines) == 2
                    and all(isinstance(x, int) and not isinstance(x, bool) and x > 0 for x in lines)
                    and lines[0] <= lines[1]):
                rep.err("source.lines", f"expected [from, to] line numbers in cenarios.txt, got {lines!r}")

    tags = data.get("tags", [])
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        rep.err("tags", "expected a list of strings")
    else:
        for t in tags:
            if t not in TAGS:
                rep.warn("tags", f"{t!r} is not in the §2.6 vocabulary; explain it in notes")
    for key, rx, what in (("depends_on", U_RE, "U1..U31"), ("corrections", E_RE, "E1..E6")):
        vals = data.get(key, [])
        if not isinstance(vals, list):
            rep.err(key, f"expected a list of {what}")
            continue
        for i, x in enumerate(vals):
            if not isinstance(x, str) or not rx.match(x):
                rep.err(f"{key}[{i}]", f"expected {what}, got {x!r}")

    if "settings" in data:
        check_settings(data["settings"], "settings", rep)
    if "tick_every" in data:
        check_duration(data["tick_every"], "tick_every", rep)

    cls = data.get("class")
    if cls is not None:
        if not isinstance(cls, dict):
            rep.err("class", "expected {level, capacity, start, created_at}")
        else:
            check_keys(cls, "class", rep, {"level", "capacity", "start", "created_at"})
            if "level" in cls:
                check_level(cls["level"], "class.level", rep, nullable=False)
            if "capacity" in cls:
                check_int(cls["capacity"], "class.capacity", rep, minimum=1)
            if "start" in cls:
                check_at(cls["start"], "class.start", rep)
            if "created_at" in cls:
                check_at(cls["created_at"], "class.created_at", rep, nullable=True)

    people = People()
    class_ids: set[str] = set()
    oc = data.get("other_classes", [])
    if not isinstance(oc, list):
        rep.err("other_classes", "expected a list")
    else:
        for i, c in enumerate(oc):
            cp = f"other_classes[{i}]"
            if not isinstance(c, dict):
                rep.err(cp, "expected {id, level, capacity, start, regulars}")
                continue
            check_keys(c, cp, rep, {"id", "level", "capacity", "start", "regulars"}, {"id", "start"})
            if not isinstance(c.get("id"), str):
                rep.err(f"{cp}.id", "expected a class id like B")
            elif c["id"] in class_ids:
                rep.err(f"{cp}.id", f"duplicate class id {c['id']!r}")
            else:
                class_ids.add(c["id"])
            if "level" in c:
                check_level(c["level"], f"{cp}.level", rep, nullable=False)
            if "capacity" in c:
                check_int(c["capacity"], f"{cp}.capacity", rep, minimum=1)
            if "start" in c:
                check_at(c["start"], f"{cp}.start", rep)
            if "regulars" in c:
                # named regulars of another class are people too; cohort-form ones are not addressable
                check_regulars(c["regulars"], f"{cp}.regulars", rep,
                               people if isinstance(c["regulars"], list) else None)

    roster = data.get("roster")
    if roster is not None:
        if not isinstance(roster, dict):
            rep.err("roster", "expected {regulars: ...}")
        else:
            check_keys(roster, "roster", rep, {"regulars"})
            if "regulars" in roster:
                check_regulars(roster["regulars"], "roster.regulars", rep, people)
    if "students" in data:
        check_students(data["students"], "students", rep, people)

    timeline = data.get("timeline")
    invited_so_far: dict[str, int] = {}
    if timeline is not None:
        if not isinstance(timeline, list) or not timeline:
            rep.err("timeline", "expected a non-empty list of steps")
        else:
            prev: datetime | None = None
            for i, step in enumerate(timeline):
                sp = f"timeline[{i}]"
                if not isinstance(step, dict):
                    rep.err(sp, "expected {at, events, expect}")
                    continue
                check_keys(step, sp, rep, {"at", "derived", "events", "expect"}, {"at"})
                at = check_at(step.get("at"), f"{sp}.at", rep)
                if at is not None:
                    if prev is not None and at < prev:
                        rep.err(f"{sp}.at", f"{step['at']} is earlier than the previous step; "
                                            "steps run in time order (equal times are fine)")
                    prev = at
                if "derived" in step and not isinstance(step["derived"], bool):
                    rep.err(f"{sp}.derived", "expected true or false")
                events = step.get("events", [])
                if not isinstance(events, list):
                    rep.err(f"{sp}.events", "expected a list of events")
                else:
                    for j, ev in enumerate(events):
                        check_event(ev, f"{sp}.events[{j}]", rep, people, class_ids)
                if "expect" in step:
                    check_expect(step["expect"], f"{sp}.expect", rep, people, class_ids, invited_so_far)
                if not events and "expect" not in step:
                    rep.warn(sp, "step has neither events nor expect")

    created_at = cls.get("created_at") if isinstance(cls, dict) else None
    created_steps = [
        step.get("at") for step in (timeline if isinstance(timeline, list) else [])
        if isinstance(step, dict) and isinstance(step.get("events"), list)
        and any(isinstance(ev, dict) and "class_created" in ev for ev in step["events"])
    ]
    if created_at is not None or created_steps:
        if created_steps != [created_at]:
            rep.err("class.created_at", f"a late-created class needs `class.created_at` and exactly one "
                                        f"`{{class_created: true}}` event at that instant; got created_at="
                                        f"{created_at!r}, events at {created_steps}")

    final = data.get("final")
    if final is not None:
        if not isinstance(final, dict) or "roster" not in final:
            rep.err("final", "expected {roster: {L: n, R: n}} (or {total: n}), plus any other expectation")
        else:
            fin = dict(final)
            if "other_class" in fin:
                rep.err("final.other_class", "in `final` the key is `other_classes` (plural): "
                                             "{other_classes: {B: {roster: {L: n, R: n}}}}")
                fin.pop("other_class")
            ocs = fin.pop("other_classes", None)
            check_expect(fin, "final", rep, people, class_ids, {})
            if ocs is not None:
                if not isinstance(ocs, dict):
                    rep.err("final.other_classes", "expected {B: {roster: {L: n, R: n}}}")
                else:
                    for cid, sub in ocs.items():
                        if cid not in class_ids:
                            rep.err(f"final.other_classes.{cid}", f"unknown other class {cid!r}")
                        check_expect(sub, f"final.other_classes.{cid}", rep, people, class_ids, {}, nested=True)
    return rep


def validate_file(path: Path) -> Report:
    name = str(path)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        rep = Report(name)
        rep.err("<file>", f"cannot read: {exc}")
        return rep
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        rep = Report(name)
        rep.err("<yaml>", f"does not parse: {exc}")
        return rep
    return validate_data(data, name, path.name)


def collect(args: list[str]) -> list[Path]:
    paths: list[Path] = []
    for a in args:
        p = Path(a)
        if p.is_dir():
            paths.extend(sorted(p.glob("*.yaml")))
        else:
            paths.append(p)
    return paths


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0 if argv else 2
    paths = collect(argv)
    if not paths:
        print("no scenario files found", file=sys.stderr)
        return 2
    errors = warnings = 0
    seen_ids: dict[object, list[tuple[Path, object]]] = {}
    reports = []
    for path in paths:
        rep = validate_file(path)
        if path.exists():
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                sid = data.get("id") if isinstance(data, dict) else None
            except yaml.YAMLError:
                sid = None
            if sid is not None and not isinstance(sid, bool):
                seen_ids.setdefault(sid, []).append((path, data.get("variant")))
        reports.append((path, rep))
    by_path = dict(reports)
    for sid, files in seen_ids.items():
        if len(files) < 2:
            if len(paths) > 1 and files[0][1] is not None:
                by_path[files[0][0]].err("variant", f"only one file has id {sid}: a lone scenario "
                                                    "carries no `variant` (or its sibling is missing)")
            continue
        variants = [v for _, v in files]
        if None in variants or len(set(variants)) != len(variants):
            for path, _ in files:
                others = ", ".join(str(p) for p, _ in files if p != path)
                by_path[path].err("id", f"id {sid} is also used by {others}; files sharing an id must "
                                        "each carry a distinct `variant`")
    for path, rep in reports:
        for line in rep.errors + rep.warnings:
            print(line)
        errors += len(rep.errors)
        warnings += len(rep.warnings)
        if not rep.errors:
            print(f"{path}: ok" + (f" ({len(rep.warnings)} warning(s))" if rep.warnings else ""))
    print(f"\n{len(paths)} file(s), {errors} error(s), {warnings} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
