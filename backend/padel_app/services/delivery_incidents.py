"""admin.engine-health rule 3 (PAD-534): record a failed send or a skipped reminder.

`record` writes one `delivery_incidents` row on its OWN connection and transaction, so it neither
commits nor rolls back the caller's work, and it never raises: an insert that fails is logged and
dropped (no retry). It stores no recipient address, body, token or key: `detail` is passed through
`_scrub`, which drops anything that looks like an address or a URL, and is truncated to 500.
"""
from __future__ import annotations

import logging
import re

from padel_app.utils.dates import utcnow_naive

logger = logging.getLogger(__name__)

_EMAIL = re.compile(r"[^\s@<>]+@[^\s@<>]+")
_URL = re.compile(r"https?://\S+")
RETENTION_DAYS = 30


def _scrub(text) -> str | None:
    if text is None:
        return None
    text = _URL.sub("<url>", _EMAIL.sub("<address>", str(text)))
    return text[:500]


def record(kind: str, channel: str, *, user_id=None, subject_type=None, subject_id=None,
           error=None, detail=None) -> None:
    try:
        from padel_app.models.delivery_incident import DeliveryIncident
        from padel_app.sql_db import db

        now = utcnow_naive()
        with db.engine.begin() as conn:
            conn.execute(DeliveryIncident.__table__.insert().values(
                created_at=now, updated_at=now, kind=kind, channel=channel,
                user_id=user_id, subject_type=subject_type, subject_id=subject_id,
                error_class=(type(error).__name__ if error is not None else None),
                detail=_scrub(detail),
            ))
    except Exception as exc:  # noqa: BLE001 — rule 3: never into the send path
        # B-254: the class only, never a traceback. This runs inside the caller's `except`, so a
        # traceback would chain the ORIGINAL send failure, whose text quotes a push endpoint or a
        # mail address (caught by test_b254_no_addresses_in_logs on the first full run).
        logger.warning("delivery incident %s/%s could not be recorded: %s", kind, channel,
                       type(exc).__name__)


def user_id_for_email(address) -> int | None:
    """The product account for an address, so an email incident names the user, not the address."""
    try:
        from padel_app.models import User

        user = User.query.filter(User.email.ilike((address or "").strip())).first()
        return user.id if user else None
    except Exception:  # noqa: BLE001
        return None


def prune(now=None) -> int:
    """Delete incidents older than RETENTION_DAYS. Returns the number deleted."""
    from datetime import timedelta

    from padel_app.models.delivery_incident import DeliveryIncident
    from padel_app.sql_db import db

    cutoff = (now or utcnow_naive()) - timedelta(days=RETENTION_DAYS)
    deleted = DeliveryIncident.query.filter(DeliveryIncident.created_at < cutoff).delete(
        synchronize_session=False)
    db.session.commit()
    return deleted
