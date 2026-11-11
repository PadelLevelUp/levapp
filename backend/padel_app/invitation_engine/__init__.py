"""The invitation engine of the redesign plan (docs/plans/invitation-engine-redesign.md, D1-D20).

A pure engine: rules read a ``SessionSnapshot``, the ``EngineSettings`` and ``now``, and return
effects; a ``SessionStore`` keeps the state between runs. Nothing here touches the database,
reads the wall clock or imports today's engine (``services/notification_service.py``), so it
can be built and tested beside it and swapped in later (out of scope for PAD-899).

Modules, one owner each in phase 2 of PAD-899:
- ``planner``: one planning run (plan §4-§6).
- ``timeline``: the session's instants and clocks (plan §8, D14, D16).
- ``answers``: Yes/No, waiting lists, direct join, absences of regulars (plan §7).
- ``messages``, ``absences``: attendance requests, coach alerts, absence kinds.
Shared, changed only by agreement: ``settings``, ``snapshot``, ``effects``, ``requests``,
``store``, ``engine``.
"""
from padel_app.invitation_engine.engine import Engine
from padel_app.invitation_engine.settings import EngineSettings, SettingsError
from padel_app.invitation_engine.store import MemoryStore, SessionStore

__all__ = ["Engine", "EngineSettings", "MemoryStore", "SessionStore", "SettingsError"]
