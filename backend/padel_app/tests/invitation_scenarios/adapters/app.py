"""The `app` adapter (PAD-918, swap plan §8 step 6): the new engine driven the way the app drives it.

Everything goes through the app's real paths, with the coach switched to the new engine:
- **Settings** are stored, not handed to the engine: the `today` adapter's config row, then the
  config save (``update_config``) for what only the new engine reads (ordering, the groups as tiers,
  the rule-20 ``engine`` object, direct join). The engine reads them through the mapping
  (``engine_store.settings_for``). After setup, each mapped field is compared with the scenario's own
  settings (``adapters/new.engine_settings``) and every difference is reported as a setup gap with
  both values: the measure of what the stored configuration can express.
- **The switch** is the real one (``engine_switch.switch_coach``), before any class exists; each
  class is then assigned by its creating path (``on_occurrence_created``). A class left without a
  session row is a setup gap, never a silent run on the old engine.
- **Time** is the ``engine_tick`` job (``engine_runner.run_tick``), with the app clock pinned as the
  `today` adapter pins it. No old-engine job runs.
- **Events** go through the `today` adapter's dispatch, the app's own service functions, which
  branch on the session's engine; only the answers to an invitation differ (keyed by invitation).

Records are the effects the store applies, from whichever entry point applied them (``TableStore.apply``
is wrapped for the scenario's lifetime); snapshots are the store's (``adapters/new_db``).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.invitation_scenarios.adapters.new import coach_rules, engine_settings
from padel_app.tests.invitation_scenarios.adapters.new_db import NewDbAdapter
from padel_app.tests.invitation_scenarios.runner import Applied, Scenario, Unsupported, duration, to_utc

#: A scenario group's level offset as the stored group rule (CONFIG-57's derivation, read back).
LEVEL_OPERATION = {0: "same_as_vacancy", 1: "one_above_vacancy", -1: "one_below_vacancy"}
SIDE_OPERATION = {"same": "same_as_vacancy", "other": "different_from_vacancy"}
TIMING_METHOD = {"A": "fixed", "B": "progressive", "C": "per_tier"}
#: Settings the comparison leaves out: the bar is the app's pool by design (swap decision 6).
NOT_COMPARED = {"eligibility"}


def _minutes(value) -> int | None:
    return None if value is None else int(duration(value).total_seconds() // 60)


class AppAdapter(NewDbAdapter):
    name = "app"

    # --- setup ---------------------------------------------------------------------------

    def setup(self, sc: Scenario) -> list[str]:
        from padel_app.services.engine_store import TableStore
        from padel_app.services.engine_switch import switch_coach

        self.sc = sc
        self.harness_settings = sc.settings
        self.rules = coach_rules(sc.data)
        target, gaps = engine_settings(sc.settings, self.rules)
        appears = self._appearing(sc)
        first = to_utc(min(sc.first_invite_at(), datetime.strptime(sc.data["timeline"][0]["at"], "%Y-%m-%d %H:%M")))
        self.now = first

        t = self.seed
        t.sc = sc
        t.ctx = t.app.test_request_context()
        t.ctx.push()
        t._pin(sc.first_invite_at())
        self._seed_coach()
        t._apply_settings(sc.settings)               # the coach's stored row; today's own gaps are not ours
        db.session.commit()
        switch_coach(t.coach_id, now=first)
        gaps += self._save_engine_settings(sc.settings)

        t.pid, t.uid, t.instances, t.jobs = {}, {}, {}, {}
        for p in sc.people.values():
            if p.id not in appears:
                self._create_person(p.id)
        if any(p.participations for p in sc.people.values()):
            t._seed_participations()
        db.session.commit()

        self.store = TableStore(clock=lambda: self.now)
        self.pending = []
        self._capture()
        self.session_of: dict[str, str] = {}
        self.class_of: dict[str, str] = {}
        for cid, spec in sc.classes.items():
            if spec.created_at is None:
                gaps += self._create_and_assign(cid, first)
        self.pending = []                             # the seeded state is the start, not an observation
        if self.session_of:
            gaps += self._compare_settings(target, next(iter(self.session_of.values())))
        return gaps

    def _save_engine_settings(self, s: dict) -> list[str]:
        """What only the new engine reads, through the config save (``update_config``)."""
        from padel_app.services.notification_service import update_config

        gaps, groups, lists = [], [], []
        for i, g in enumerate(s["groups"], 1):
            if "list" in g:
                lists.append(g["list"])
                if g.get("side", "same") != "same":
                    gaps.append(f"group {i} (list {g['list']}, side {g['side']}): a list tier has no side rule")
                continue
            rules = []
            op = LEVEL_OPERATION.get(int(g["level"]))
            if op is None:
                gaps.append(f"group {i} (level {int(g['level']):+d}): no stored level operation")
            else:
                rules.append({"attribute": "level", "operation": op})
            side = g.get("side", "same")
            if side in SIDE_OPERATION:
                rules.append({"attribute": "side", "operation": SIDE_OPERATION[side]})
            groups.append({"id": str(len(groups) + 1), "rules": rules})
        if lists != ["coach", "students"][:len(lists)] or (lists and s["groups"][0].get("list") != "coach"):
            gaps.append(f"waiting-list groups {lists}: the app always asks the coach's list, then the students'")

        timing = s["timing"]
        method = TIMING_METHOD.get(timing.get("method", "A"))
        engine = {"maxAtATime": s.get("max_open"),
                  "timing": {"method": method,
                             "betweenRoundsMinutes": _minutes(timing.get("between_rounds", "20m")),
                             "betweenGroupsMinutes": _minutes(timing.get("between_groups", "20m")),
                             "perTier": []},
                  "autoEntryBeforeAttendanceRequest": bool(self.rules.get("auto_entry_before_attendance_request")),
                  "waitingListSideChoice": bool(self.rules.get("waiting_list_side_choice"))}
        if method == "per_tier":
            per_group = {int(k): v for k, v in (timing.get("per_group") or {}).items()}
            engine["timing"]["perTier"] = [
                {"betweenRoundsMinutes": _minutes(per_group[n].get("between_rounds", "20m")),
                 "betweenGroupsMinutes": _minutes(per_group[n].get("to_next_group", "20m"))}
                if n in per_group else None
                for n in range(1, len(s["groups"]) + 1)]
        update_config(self.seed.coach_id, {
            "priorityCriteria": [{"id": s["tiebreak"], "label": s["tiebreak"], "enabled": True}],
            "tiebreakers": [],
            "invitationGroups": groups,
            "autoAcceptJoinRequests": bool(self.rules.get("direct_join")),
            "engine": engine,
        })
        db.session.commit()
        return gaps

    def _capture(self) -> None:
        """Every effect the store applies, from any entry point, becomes this scenario's records."""
        from padel_app.services.engine_store import TableStore

        real = TableStore.apply
        adapter = self

        def apply(store, effects):
            effects = list(effects)
            real(store, effects)
            adapter.pending += adapter._records(effects)

        self.seed.mp.setattr(TableStore, "apply", apply)

    def _create_and_assign(self, cid: str, now: datetime) -> list[str]:
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.services.engine_switch import engine_for, on_occurrence_created

        self._create_class(cid, now)
        inst = db.session.get(LessonInstance, int(self.session_of[cid]))
        on_occurrence_created(inst, now=now)          # what the app's creating path does (CONFIG-63)
        db.session.commit()
        if engine_for(inst) != "new":
            return [f"class {cid}: not on the new engine after its creation (no engine_sessions row)"]
        return []

    def _compare_settings(self, target, session: str) -> list[str]:
        """Each mapped field against the scenario's own (``adapters/new.engine_settings``)."""
        import dataclasses

        from padel_app.services.engine_store import settings_for

        try:
            mapped = settings_for(session)
        except Exception as exc:  # noqa: BLE001 — a refused mapping is the finding
            return [f"settings: the stored configuration does not map ({exc})"]
        gaps = []
        for f in dataclasses.fields(target):
            if f.name in NOT_COMPARED:
                continue
            want, got = getattr(target, f.name), getattr(mapped, f.name)
            if f.name == "tiers":
                want = tuple((t.source, t.side, t.level_offset) for t in want)
                got = tuple((t.source, t.side, t.level_offset) for t in got)
            if want != got:
                gaps.append(f"settings.{f.name}: the scenario's {want!r}, the stored configuration's {got!r}")
        return gaps

    # --- time and events -----------------------------------------------------------------

    def tick(self, now_local: datetime) -> None:
        from padel_app.services.engine_runner import run_tick

        run_tick(self._at(now_local))
        db.session.expire_all()

    def apply(self, event: str, who, params: dict, cls: str, now_local: datetime) -> Applied:
        now = self._at(now_local)
        try:
            if event == "appears":
                self._create_person(who)
                db.session.commit()
            elif event == "class_created":
                gaps = self._create_and_assign(cls, now)
                if gaps:
                    raise Unsupported(gaps[0])
            elif event in ("accepts", "declines"):
                self._answer(who, cls, "yes" if event == "accepts" else "no", now)
            elif event == "coach_sets":
                raise Unsupported("coach_sets mid-scenario: the config save's mapping is not wired yet")
            else:
                self.seed.instances = {c: int(s) for c, s in self.session_of.items()}
                self.seed._dispatch(event, who, params, cls, now)
        except HTTPException as exc:
            db.session.rollback()
            body = getattr(exc, "response", None)
            reason = body.get_json(silent=True) if body is not None else None
            return Applied(refused=True, reason=str(reason or exc))
        finally:
            db.session.expire_all()
        return Applied()

    def _answer(self, who, cls, action: str, now: datetime) -> None:
        """The student's Yes or No to their open invitation, by its id (invitations NB5)."""
        from padel_app.models import EngineInvitation
        from padel_app.services import engine_entry

        respond = getattr(engine_entry, "respond_to_invitation", None)
        if respond is None:
            raise Unsupported("answers by invitation id are not wired yet")
        row = (EngineInvitation.query
               .filter_by(lesson_instance_id=int(self.session_of[cls]), player_id=self.seed.pid[who])
               .order_by(EngineInvitation.id.desc()).first())
        if row is None:
            raise HTTPException(description=f"{who} has no invitation")
        respond(row.id, action, self.seed.uid[who], now=now)
