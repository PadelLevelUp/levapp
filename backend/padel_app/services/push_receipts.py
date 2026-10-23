"""messaging.push-notifications rule 10b (PAD-745): Expo tickets kept at send, receipts read later.

`keep` runs inside the shared Expo send, on whichever thread sent (the bounded sender's or the outbox
drainer's), on its own short transaction. `read` is the scheduler leader's 10-minute job; `prune` runs
with the daily incident prune. None of them ever raises into its caller.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import timedelta

from padel_app.utils.dates import utcnow_naive

logger = logging.getLogger(__name__)

EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
#: Expo's advice: ask 15 minutes after the send; receipts are cleared after 24 hours.
READ_AFTER = timedelta(minutes=15)
EXPIRE_AFTER = timedelta(hours=24)
#: Expo's limit per `/push/getReceipts` call (PUSH_TOO_MANY_RECEIPTS above it).
IDS_PER_CALL = 1000
RETENTION_DAYS = 30


def keep(tickets, *, user_id=None, outbox_id=None, now=None) -> int:
    """One `push_receipt` row per `(token, ticket_id)`, in one insert. A failure is logged by class."""
    tickets = [(token, ticket_id) for token, ticket_id in tickets if ticket_id]
    if not tickets:
        return 0
    try:
        from padel_app.models.push_receipt import PushReceipt
        from padel_app.sql_db import db

        now = now or utcnow_naive()
        with db.engine.begin() as conn:
            conn.execute(PushReceipt.__table__.insert(), [
                {"created_at": now, "updated_at": now, "ticket_id": str(ticket_id)[:64], "token": token,
                 "user_id": user_id, "outbox_id": outbox_id, "sent_at": now, "status": "pending"}
                for token, ticket_id in tickets
            ])
        logger.info("expo push sent user=%s tickets=%d", user_id, len(tickets))
        return len(tickets)
    except Exception as exc:  # noqa: BLE001 — B-254: the class only; never into the send
        logger.warning("expo push tickets could not be kept: %s", type(exc).__name__)
        return 0


def _chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _fetch(ids) -> dict | None:
    """`{ticket_id: receipt}` for the receipts Expo has; None when the call failed."""
    import requests

    from padel_app.utils.expo_push import _headers

    try:
        response = requests.post(EXPO_RECEIPTS_URL, json={"ids": ids}, headers=_headers(), timeout=10)
        response.raise_for_status()
        data = response.json().get("data")
    except Exception as exc:  # noqa: BLE001 — the next run asks again
        status = getattr(getattr(exc, "response", None), "status_code", None)
        logger.warning("expo getReceipts failed: %s%s", type(exc).__name__,
                       f" status={status}" if status else "")
        return None
    return data if isinstance(data, dict) else {}


def read(now=None) -> dict:
    """Redeem the pending tickets sent 15 minutes to 24 hours ago; expire the older ones."""
    from padel_app.models import DeviceToken
    from padel_app.models.push_receipt import PushReceipt
    from padel_app.services import delivery_incidents
    from padel_app.sql_db import db

    now = now or utcnow_naive()
    counts = {"ok": 0, "error": Counter(), "expired": 0, "failedCalls": 0}
    rows = (
        PushReceipt.query
        .filter(PushReceipt.status == "pending", PushReceipt.sent_at <= now - READ_AFTER,
                PushReceipt.sent_at > now - EXPIRE_AFTER)
        .order_by(PushReceipt.sent_at, PushReceipt.id)
        .all()
    )
    for batch in _chunks(rows, IDS_PER_CALL):
        receipts = _fetch([r.ticket_id for r in batch])
        if receipts is None:
            counts["failedCalls"] += 1
            continue
        for row in batch:
            receipt = receipts.get(row.ticket_id)
            if not isinstance(receipt, dict):
                continue  # not available yet: asked again next run, until it expires
            row.checked_at = now
            if receipt.get("status") == "ok":
                row.status = "ok"
                counts["ok"] += 1
                continue
            code = str((receipt.get("details") or {}).get("error") or "unknown")[:64]
            row.status, row.error_code = "error", code
            counts["error"][code] += 1
            if code == "DeviceNotRegistered":
                # Rule 9: several users may hold the token; retire it for all.
                DeviceToken.query.filter_by(token=row.token).delete(synchronize_session=False)
            else:
                delivery_incidents.record("push_failed", "expo", user_id=row.user_id,
                                          detail=f"receipt error={code}")
        db.session.commit()

    counts["expired"] = (
        PushReceipt.query
        .filter(PushReceipt.status == "pending", PushReceipt.sent_at <= now - EXPIRE_AFTER)
        .update({"status": "expired", "checked_at": now, "updated_at": now}, synchronize_session=False)
    )
    db.session.commit()
    if rows or counts["expired"]:
        logger.info("expo receipts ok=%d error=%d by code %s expired=%d failed_calls=%d",
                    counts["ok"], sum(counts["error"].values()), dict(counts["error"]),
                    counts["expired"], counts["failedCalls"])
    counts["error"] = dict(counts["error"])
    return counts


def prune(now=None) -> int:
    """Delete receipt rows older than RETENTION_DAYS. Returns the number deleted."""
    from padel_app.models.push_receipt import PushReceipt
    from padel_app.sql_db import db

    cutoff = (now or utcnow_naive()) - timedelta(days=RETENTION_DAYS)
    deleted = PushReceipt.query.filter(PushReceipt.sent_at < cutoff).delete(synchronize_session=False)
    db.session.commit()
    return deleted


def summary(now) -> dict:
    """admin.engine-health: the last 24 hours and 7 days of receipts, by status and by error code."""
    from sqlalchemy import func

    from padel_app.models.push_receipt import STATUSES, PushReceipt
    from padel_app.sql_db import db

    def window(since):
        found = dict(db.session.query(PushReceipt.status, func.count())
                     .filter(PushReceipt.sent_at >= since).group_by(PushReceipt.status).all())
        codes = dict(db.session.query(PushReceipt.error_code, func.count())
                     .filter(PushReceipt.sent_at >= since, PushReceipt.status == "error")
                     .group_by(PushReceipt.error_code).all())
        return {**{s: found.get(s, 0) for s in STATUSES}, "errorsByCode": codes}

    return {"last24h": window(now - timedelta(hours=24)), "last7d": window(now - timedelta(days=7))}
