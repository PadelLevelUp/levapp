"""The `new` adapter on the app's tables (PAD-916, swap plan §8 step 4): the same engine as
``adapters/new.py``, with ``services/engine_store.TableStore`` in place of ``MemoryStore``.

The scenario is seeded in the test database the way the `today` adapter seeds it (its helpers: the
coach and its ladder, the club, one user, player and coach link per person, one lesson and
occurrence per class with the regulars' roster rows and presences, the participations history).
Then every class is handed to the engine (``engine_sessions``), and every tick and event runs the
engine against the tables, with the app clock pinned to the simulated instant AND ``now=`` passed,
as the `today` adapter does: the store's own writes go through model defaults too.

Ids. The engine sees occurrence and player ids (as strings); records and snapshots are mapped
back to the scenario's class and person ids, so the runner compares them unchanged.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from padel_app.invitation_engine import Engine
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import requests as rq
from padel_app.invitation_engine import timeline
from padel_app.invitation_engine.snapshot import Student
from padel_app.sql_db import db
from padel_app.tests.invitation_scenarios.adapters.new import REFUSABLE, NewAdapter, _student, coach_rules, engine_settings
from padel_app.tests.invitation_scenarios.adapters.today import TodayAdapter
from padel_app.tests.invitation_scenarios.runner import Applied, Scenario, Snapshot, to_local, to_utc


class NewDbAdapter(NewAdapter):
    name = "new-db"

    def __init__(self, app):
        self.seed = TodayAdapter(app)

    # --- setup ---------------------------------------------------------------------------

    def setup(self, sc: Scenario) -> list[str]:
        from padel_app.services.engine_store import TableStore

        self.sc = sc
        self.harness_settings = sc.settings
        self.rules = coach_rules(sc.data)
        settings, gaps = engine_settings(sc.settings, self.rules)
        self.setup_gaps = set(gaps)
        appears = self._appearing(sc)
        first = to_utc(min(sc.first_invite_at(), datetime.strptime(sc.data["timeline"][0]["at"], "%Y-%m-%d %H:%M")))
        self.now = first

        t = self.seed
        t.sc = sc
        t.ctx = t.app.test_request_context()
        t.ctx.push()
        t._pin(sc.first_invite_at())
        self._seed_coach()
        t._apply_settings(sc.settings)               # the coach's config row; its gaps are today's, not ours
        t.pid, t.uid, t.instances, t.jobs = {}, {}, {}, {}
        for p in sc.people.values():
            if p.id not in appears:
                self._create_person(p.id)
        if any(p.participations for p in sc.people.values()):
            t._seed_participations()
        db.session.commit()

        self.store = TableStore(clock=lambda: self.now)
        self.engine = Engine(self.store, settings)
        self.session_of: dict[str, str] = {}         # scenario class -> occurrence id
        self.class_of: dict[str, str] = {}
        for cid, spec in sc.classes.items():
            if spec.created_at is None:
                self._create_class(cid, first)
                with self.store.unit((self.session_of[cid],)):
                    self.store.add_session(self.session_of[cid], spec.level, spec.capacity, spec.start,
                                           self._regulars(cid), first)
        self.pending = []
        return gaps

    def _seed_coach(self) -> None:
        """The `today` adapter's setup up to its people: coach, ladder, club, config."""
        from padel_app.models import User
        from padel_app.models.clubs import Club
        from padel_app.models.coach_levels import CoachLevel
        from padel_app.models.coaches import Coach
        from padel_app.models.notification_config import NotificationConfig

        t = self.seed
        user = User(name="Coach", username="scenario_coach", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        t.coach_id, t.coach_user_id = coach.id, user.id
        t.level_ids = {}
        for n in range(1, 7):
            lv = CoachLevel(coach_id=coach.id, label=f"N{n}", code=f"N{n}", display_order=n)
            db.session.add(lv)
            db.session.flush()
            t.level_ids[n] = lv.id
        t.level_ids[None] = None
        club = Club(name="Scenario Club", description="", location="Lisboa")
        db.session.add(club)
        db.session.flush()
        t.club_id = club.id
        t.config = NotificationConfig(coach_id=coach.id, auto_notify_enabled=True)
        db.session.add(t.config)

    def _create_person(self, pid: str) -> None:
        """The `today` adapter's person, with the engine's level (unknown stays unknown) and sides."""
        from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

        t = self.seed
        p = self.sc.people[pid]
        t._create_person(pid)
        link = Association_CoachPlayer.query.filter_by(coach_id=t.coach_id, player_id=t.pid[pid]).one()
        link.level_id = t.level_ids[p.level] if p.level is not None else None
        student = _student(p)
        link.side = "both" if student.sides == {"L", "R"} else {"L": "left", "R": "right"}[next(iter(student.sides))]
        db.session.flush()

    def _create_class(self, cid: str, joined_before: datetime) -> None:
        """The `today` adapter's class, with its roster joined in member order (``_joined_at``)."""
        from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
        from padel_app.models.lesson_instances import LessonInstance

        t = self.seed
        t._create_class(cid)
        iid = t.instances[cid]
        inst = db.session.get(LessonInstance, iid)
        joined = self._joined_at(cid, joined_before)
        by_player = {t.pid[p]: p for p in joined if p in t.pid}
        for row in Association_PlayerLesson.query.filter_by(lesson_id=inst.lesson_id).all():
            row.created_at = joined[by_player[row.player_id]]
        db.session.commit()
        self.session_of[cid], self.class_of[str(iid)] = str(iid), cid

    def _regulars(self, cid: str):
        return tuple((self._engine_student(p.id), None if p.side == "both" else p.side)
                     for p in self.sc.regulars(cid) if p.id in self.seed.pid)

    def _engine_student(self, pid: str) -> Student:
        s = _student(self.sc.people[pid])
        return Student(str(self.seed.pid[pid]), s.level, s.sides, s.participations)

    def _person(self, student: str) -> str:
        return next(k for k, v in self.seed.pid.items() if str(v) == student)

    # --- time and events -----------------------------------------------------------------

    def _at(self, now_local: datetime) -> datetime:
        self.seed._pin(now_local)
        self.now = to_utc(now_local)
        return self.now

    def tick(self, now_local: datetime) -> None:
        self.pending += self._records(self.engine.tick(self._at(now_local)))

    def apply(self, event: str, who, params: dict, cls: str, now_local: datetime) -> Applied:
        now = self._at(now_local)
        if event == "appears":
            self._create_person(who)
            db.session.commit()
        if event == "coach_sets":
            return super().apply(event, who, params, cls, now_local)
        if event == "class_created":
            spec = self.sc.classes[cls]
            self._create_class(cls, now)
            request: rq.Request = rq.CreateSession(spec.level, spec.capacity, spec.start, self._regulars(cls),
                                                   self._joined_at(cls, now))
        else:
            request = self._request(event, self._ids(who), params)
            if not isinstance(request, rq.Appear) and cls not in self.session_of:
                return Applied(True, "the session does not exist yet") if event in REFUSABLE else Applied()
        session = self.session_of.get(cls) or next(iter(self.session_of.values()), None)
        if session is None:
            return Applied()
        effects = self.engine.handle(session, request, now)
        player = self._ids(who)
        refused = [e for e in effects if isinstance(e, fx.Refused) and e.student == player]
        self.pending += self._records([e for e in effects if e not in refused])
        if refused and event in REFUSABLE:
            return Applied(True, refused[0].reason)
        return Applied()

    def _ids(self, who):
        if isinstance(who, str) and who in self.seed.pid:
            return str(self.seed.pid[who])
        return who

    # --- observation ---------------------------------------------------------------------

    def _records(self, effects):
        out = []
        for r in super()._records(effects):
            r.cls = self.class_of.get(r.cls, r.cls)
            if r.student:
                r.student = self._person(r.student)
            out.append(r)
        return out

    def snapshot(self, cls: str) -> Snapshot:
        if cls not in self.session_of:
            return Snapshot({})
        s = self.store.snapshot(self.session_of[cls])
        name = self._person
        wl = {"coach": [name(w.student) for w in s.waiting_list if w.list == "coach"],
              "students": [name(w.student) for w in s.waiting_list if w.list == "students"]}
        return Snapshot(
            roster={name(p.student): p.side for p in s.going},
            placed_at={name(p.student): to_local(p.at) for p in s.going},
            waiting_list=wl,
            open_invitations=[(name(i.student), i.side_named, to_local(i.sent_at)) for i in s.open_invitations],
            open_in_round=sum(1 for i in s.open_invitations if timeline.counting(i, self.now)),
        )

    def teardown(self) -> None:
        self.seed.teardown()
