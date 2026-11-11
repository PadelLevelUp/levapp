"""The engine's front door: ``tick`` for the passage of time, ``handle`` for anything that happens.

It owns the order of work and nothing else. Every decision is made by a rule module
(``timeline``, ``messages``, ``planner``, ``answers``) from a fresh snapshot; the effects go to
the store at once, so the next module sees them, and are returned to the caller.

``now`` is always passed in, as naive UTC; the engine never reads the wall clock.
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

from padel_app.invitation_engine import answers, messages, planner, timeline
from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.requests import STUDENT_REQUESTS, Appear, CreateSession, Request, UpdateSettings
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.store import SessionStore


class Engine:
    def __init__(self, store: SessionStore, settings: EngineSettings) -> None:
        self.store = store
        self.settings = settings

    def tick(self, now: datetime) -> list[Effect]:
        """The periodic work (plan §6: every minute in the background), for every session."""
        out: list[Effect] = []
        for session in self.store.sessions():
            out += self._commit(timeline.due(self.store.snapshot(session), self.settings, now))
            out += self._commit(messages.due(self.store.snapshot(session), self.settings, now))
            out += self._plan(session, now)
        return out

    def handle(self, session: str, request: Request, now: datetime) -> list[Effect]:
        """Apply one request, then run the planner (plan §6: after every answer or change)."""
        if isinstance(request, UpdateSettings):
            self.settings = request.settings
            return [e for s in self.store.sessions() for e in self._plan(s, now)]
        if isinstance(request, Appear):
            self.store.reveal(request.student)
            return [e for s in self.store.sessions() for e in self._plan(s, now)]
        if isinstance(request, CreateSession):
            self.store.add_session(session, request.level, request.capacity, request.start, request.regulars, now)
            return self._plan(session, now)
        if not isinstance(request, STUDENT_REQUESTS):
            raise TypeError(f"unknown request {request!r}")
        out = self._commit(answers.handle(self.store.snapshot(session), self.settings, request, now).effects)
        return out + self._plan(session, now)

    def _plan(self, session: str, now: datetime) -> list[Effect]:
        return self._commit(planner.plan(self.store.snapshot(session), self.settings, now).effects)

    def _commit(self, effects: Iterable[Effect]) -> list[Effect]:
        effects = list(effects)
        self.store.apply(effects)
        return effects
