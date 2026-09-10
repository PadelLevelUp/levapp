"""What Alembic autogenerate must never touch (PAD-265, audit H13).

Wired into ``migrations/env.py`` for both offline and online runs.
"""

#: Tables that live in the database but are not ours to migrate.
#: ``apscheduler_jobs`` is APScheduler's SQLAlchemyJobStore table: the scheduler
#: creates it at startup and no model declares it, so without this filter every
#: ``flask db migrate`` proposed dropping it (revision 3ff75d01a5ee already did).
EXTERNAL_TABLES = frozenset({"apscheduler_jobs"})

_TABLE_CHILDREN = ("index", "column", "unique_constraint", "foreign_key_constraint")


def include_object(object, name, type_, reflected, compare_to):
    """Alembic ``include_object`` hook: skip external tables and everything on them."""
    if type_ == "table" and name in EXTERNAL_TABLES:
        return False
    table = getattr(object, "table", None)
    if type_ in _TABLE_CHILDREN and table is not None and table.name in EXTERNAL_TABLES:
        return False
    return True
