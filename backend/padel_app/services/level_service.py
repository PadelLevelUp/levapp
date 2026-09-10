"""A player's level, written in one place (PAD-270, audit M1; B-061).

`player_level_history` is the record of every level a coach assigned.
`coach_in_player.level_id` is its cache: the current level, which every read
uses. `set_roster_level` is the only code that writes that cache, and it adds
the history row in the same transaction. Before PAD-270 four code paths wrote
the level and an edit wrote no history at all.

`effective_level_id` is the one class-level fallback (PAD-86): an occurrence's
own level, else its lesson's default level.
"""
from padel_app.sql_db import db


def effective_level_id(obj):
    """The level a class is matched against, resolved the SAME way everywhere.

    PAD-86: a ``LessonInstance`` often carries no ``level_id`` of its own; the
    level lives on the parent ``Lesson`` as ``default_level_id``. Resolving that
    fallback in some call sites but not others meant a structural vacancy could
    be created with ``level_id = None``, which every level rule then read as
    "the level filter is switched off".

    Accepts a ``LessonInstance`` (instance level, falling back to its lesson's
    default level) or a ``Lesson`` (its default level). Returns ``None`` only
    when there is genuinely no level anywhere, which callers must treat as
    "nobody qualifies", never as "no filter".
    """
    if obj is None:
        return None
    direct = getattr(obj, "level_id", None)
    if direct:
        return direct
    lesson = getattr(obj, "lesson", None)
    if lesson is not None:
        return getattr(lesson, "default_level_id", None)
    return getattr(obj, "default_level_id", None)


def set_roster_level(rel, level_id):
    """Set a coach's level for a player (players.level-history rule 1).

    Writes ``rel.level_id`` and, when the level differs from the latest history
    entry for that coach and player, adds a ``PlayerLevelHistory`` row. Setting
    the same level again writes nothing; clearing the level (``None``) writes
    no row, because history records assignments. Does not commit: the caller's
    save commits the cache and the history together. Returns the new history
    row, or ``None`` when none was needed.
    """
    from padel_app.models import PlayerLevelHistory

    level_id = int(level_id) if level_id not in (None, "") else None
    rel.level_id = level_id
    if level_id is None:
        return None
    latest = (
        PlayerLevelHistory.query
        .filter_by(coach_id=rel.coach_id, player_id=rel.player_id)
        .order_by(PlayerLevelHistory.assigned_at.desc(), PlayerLevelHistory.id.desc())
        .first()
    )
    if latest is not None and latest.level_id == level_id:
        return None
    row = PlayerLevelHistory(coach_id=rel.coach_id, player_id=rel.player_id, level_id=level_id)
    db.session.add(row)
    return row
