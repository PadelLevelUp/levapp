"""The engine's front door: ``tick`` for the passage of time, ``handle`` for anything that happens.

It owns the order of work and nothing else. Every decision is made by a rule module
(``timeline``, ``messages``, ``planner``, ``answers``) from a fresh snapshot; the effects go to
the store at once, so the next module sees them, and are returned to the caller.

``now`` is always passed in, as naive UTC; the engine never reads the wall clock.
"""
from __future__ import annotations

from datetime import datetime
from typing import Callable, Iterable

from padel_app.invitation_engine import answers, messages, planner, timeline
from padel_app.invitation_engine.effects import Effect, QueueApproved, QueueDismissed, QueueReopened
from padel_app.invitation_engine.requests import (
    COACH_QUEUE_REQUESTS,
    STUDENT_REQUESTS,
    Appear,
    ApproveQueue,
    DismissQueue,
    CoachExcludes,
    CreateSession,
    Request,
    UpdateSettings,
)
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.store import SessionStore, UnitConflict

SettingsLookup = Callable[[str], EngineSettings]


class Engine:
    """``settings`` is one value for every session (the harness), or a lookup from a session id to
    its coach's settings (the app, ruling D9). A lookup is asked again for every session the engine
    works on, so a coach's change shows at the next call."""

    def __init__(self, store: SessionStore, settings: EngineSettings | SettingsLookup) -> None:
        self.store = store
        self.settings = settings

    def settings_for(self, session: str) -> EngineSettings:
        if isinstance(self.settings, EngineSettings):
            return self.settings
        return self.settings(session)

    def tick(self, now: datetime) -> list[Effect]:
        """The periodic work (plan §6: every minute in the background), for every session."""
        out: list[Effect] = []
        for session in self.store.sessions():
            done: list[Effect] = []
            try:
                with self.store.unit((session,)):
                    settings = self.settings_for(session)
                    done += self._commit(timeline.due(self.store.snapshot(session), settings, now))
                    done += self._commit(messages.due(self.store.snapshot(session), settings, now))
                    done += self._plan(session, now, settings)
            except UnitConflict:            # rolled back: nothing of this session happened; next run
                continue
            out += done
        return out

    def handle(self, session: str, request: Request, now: datetime) -> list[Effect]:
        """Apply one request, then run the planner (plan §6: after every answer or change)."""
        if isinstance(request, UpdateSettings):     # a lookup reads the app's stored config: replan only
            if isinstance(self.settings, EngineSettings):
                self.settings = request.settings
            sessions = self.store.sessions() if request.sessions is None else request.sessions
            return [e for s in sessions for e in self._plan_unit(s, now)]
        if isinstance(request, Appear):
            self.store.reveal(request.student)
            return [e for s in self.store.sessions() for e in self._plan_unit(s, now)]
        if isinstance(request, COACH_QUEUE_REQUESTS):
            return self._queue_answer(session, request, now)
        if not isinstance(request, (CoachExcludes, CreateSession, *STUDENT_REQUESTS)):
            raise TypeError(f"unknown request {request!r}")
        # A student's request locks the student first (two of theirs never run at once, answers rule 10).
        who = getattr(request, "student", None) if isinstance(request, STUDENT_REQUESTS) else None
        student = (who,) if who is not None else ()
        with self.store.unit((session,), student):
            if isinstance(request, CoachExcludes):
                self.store.exclude(session, request.student)
                return self._plan(session, now)
            if isinstance(request, CreateSession):
                self.store.add_session(session, request.level, request.capacity, request.start, request.regulars,
                                       now, joined_at=request.joined_at)
                return self._plan(session, now)
            settings = self.settings_for(session)          # one lookup per unit: answer and plan agree
            out = self._commit(answers.handle(self.store.snapshot(session), settings, request, now).effects)
            out += self._plan(session, now, settings)
        # A same-hour close (answers rule 10) touched other sessions: each replans in its own unit,
        # after this one commits, so no call holds two sessions' locks.
        touched = sorted({e.session for e in out} - {session})
        return out + [e for s in touched for e in self._plan_unit(s, now)]

    def _queue_answer(self, session: str, request: Request, now: datetime) -> list[Effect]:
        """The coach's answer to semi-automatic mode (engine-planning rule 14), then a re-plan, which
        sends at once what the approval lets through: its counting-until starts now."""
        with self.store.unit((session,)):
            approval = self.store.snapshot(session).approval
            if isinstance(request, ApproveQueue):
                if approval.pending is None:            # nothing to approve: stale, or answered already
                    return []
                queued = {sid for _, queue in approval.pending for sid in queue}
                out = self._commit([QueueApproved(session, now, frozenset(queued - request.removed),
                                                  frozenset(request.removed))])
            elif isinstance(request, DismissQueue):
                out = self._commit([QueueDismissed(session, now, planner.spot_types(self.store.snapshot(session)))])
            else:
                out = self._commit([QueueReopened(session, now)])
            return out + self._plan(session, now)

    def _plan_unit(self, session: str, now: datetime) -> list[Effect]:
        """A re-plan in its own unit; one the store refuses (``UnitConflict``) is left to the next run."""
        try:
            with self.store.unit((session,)):
                return self._plan(session, now)
        except UnitConflict:
            return []

    def _plan(self, session: str, now: datetime, settings: EngineSettings | None = None) -> list[Effect]:
        settings = self.settings_for(session) if settings is None else settings
        return self._commit(planner.decide(self.store.snapshot(session), settings, now).effects)

    def _commit(self, effects: Iterable[Effect]) -> list[Effect]:
        effects = list(effects)
        self.store.apply(effects)
        return effects
