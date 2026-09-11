"""The deletion audit (PAD-274, audit M15b; B-057).

`record_deletion` adds the row to the current session and does NOT commit:
the caller's delete commits it, so the record and the delete land together or
not at all. Counts in `details` are measured just before the delete runs.
"""
from padel_app.sql_db import db


def record_deletion(*, actor_user_id, entity, entity_id, action, label=None, details=None):
    from padel_app.models import DeletionAudit

    row = DeletionAudit(
        actor_user_id=actor_user_id,
        entity=entity,
        entity_id=int(entity_id),
        action=action,
        label=(label or None) and str(label)[:255],
        details=details or {},
    )
    db.session.add(row)
    return row
