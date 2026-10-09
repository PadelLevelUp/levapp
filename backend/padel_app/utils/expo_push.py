# Phase 5 — native (Expo) push sender.
# - Mirrors padel_app/utils/push_notifications.py (the existing VAPID/Web-Push
#   sender) in style: best-effort, never raises into the caller, logs and
#   swallows failures.
# - No `exponent_server_sdk` dependency in pyproject.toml, so this posts
#   directly to the raw Expo HTTP push API (https://exp.host/--/api/v2/push/send)
#   using `requests` (already a transitive dependency, importable in this venv).
# - Batches in groups of <=100 tokens per request (Expo's documented limit).
# - Parses receipts for a `DeviceNotRegistered` error and deletes the stale
#   DeviceToken row for that token (cleanup on the caller's behalf).
import logging
import os

import requests

from padel_app.models import DeviceToken
from padel_app.sql_db import db


logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_BATCH_SIZE = 100
#: Android notification channel the client creates (expoPushRegistrar.ts and
#: app.json's expo-notifications `defaultChannel`). iOS ignores the field.
ANDROID_CHANNEL_ID = "default"


def _headers() -> dict:
    """Request headers for the Expo push API (messaging.push-notifications rule 11c).

    EXPO_ACCESS_TOKEN is the flag: unset or blank, the headers are exactly what
    they were before PAD-307; set, the bearer token is added (the Expo project
    can be configured to require one — an owner step, see the wave C runbook).
    Read per call so a rotated token needs no restart.
    """
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = (os.getenv("EXPO_ACCESS_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _token_tail(token) -> str:
    """B-254: enough of a device token to tell two devices apart in a log, never the whole token."""
    core = str(token or "")
    if core.endswith("]"):
        core = core[:-1]
    return f"...{core[-6:]}"


def _chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def send_expo_push(
    tokens: list[str], title, body, data: dict | None = None, badge: int | None = None
) -> bool:
    """Best-effort Expo push send to one or more Expo push tokens.

    Never raises — logs and returns False on any failure so callers can treat
    this exactly like the existing web-push helper (fire-and-forget).
    Deletes DeviceToken rows for tokens Expo reports as no longer registered.

    `badge` sets the iOS home-screen icon badge. It is omitted from the
    payload when None, which leaves whatever the device already shows
    untouched — so callers that do not own a count must not pass 0 to "mean"
    unknown. Pass the recipient's real unread total; 0 clears the badge
    (PAD-153).
    """
    tokens = [t for t in (tokens or []) if t]
    if not tokens:
        return False

    data = data or {}
    any_success = False

    for batch in _chunks(tokens, _BATCH_SIZE):
        messages = [
            {
                "to": token,
                "title": title,
                "body": body,
                "data": data,
                # Only sent when the caller knows the count; see the docstring.
                **({"badge": badge} if badge is not None else {}),
                # PAD-307 (rule 11a): Android delivery — the client's channel and a
                # heads-up priority. iOS ignores both; Expo passes them to FCM.
                "channelId": ANDROID_CHANNEL_ID,
                "priority": "high",
            }
            for token in batch
        ]
        try:
            response = requests.post(
                EXPO_PUSH_URL,
                json=messages,
                headers=_headers(),
                timeout=10,
            )
            response.raise_for_status()
        except Exception as exc:
            logger.warning("Failed to send Expo push notification batch: %s", exc)
            continue

        try:
            payload = response.json()
        except Exception as exc:
            logger.warning("Failed to parse Expo push response: %s", exc)
            continue

        receipts = payload.get("data", [])
        for token, receipt in zip(batch, receipts):
            status = receipt.get("status") if isinstance(receipt, dict) else None
            if status == "ok":
                any_success = True
                continue

            error_type = (receipt.get("details") or {}).get("error") if isinstance(receipt, dict) else None
            # admin.engine-health rule 3 (PAD-534): Expo's error code, never the token.
            _record_expo_failure(token, error_type)
            if error_type == "DeviceNotRegistered":
                # WARNING, not INFO: the app configures no logging, so the
                # root logger sits at the default WARNING and INFO never
                # reaches stderr. Losing a device token silently is exactly
                # what made PAD-118 ("no push arrived") undiagnosable.
                logger.warning(
                    "Deleting stale Expo device token (DeviceNotRegistered): %s", _token_tail(token)
                )
                # Rule 9 (PAD-269): several users may hold the token; retire it for all.
                if DeviceToken.query.filter_by(token=token).delete(synchronize_session=False):
                    db.session.commit()
            else:
                # B-254: the status and Expo's error code, not the receipt's message (it quotes
                # the whole token).
                logger.warning(
                    "Expo push receipt error for token=%s: status=%s error=%s",
                    _token_tail(token),
                    receipt.get("status") if isinstance(receipt, dict) else None,
                    error_type,
                )

    return any_success


def _record_expo_failure(token, error_type) -> None:
    """admin.engine-health rule 3: never into the send path. The device lookup is inside the guard
    too (#589 review: a raising lookup escaped `send_expo_push`)."""
    try:
        from padel_app.services import delivery_incidents

        row = DeviceToken.query.filter_by(token=token).first()
        platform = (getattr(row, "platform", None) or "").lower()
        channel = "apns" if platform == "ios" else "fcm" if platform == "android" else "expo"
        delivery_incidents.record("push_failed", channel, user_id=getattr(row, "user_id", None),
                                  detail=f"error={error_type}")
    except Exception as exc:  # noqa: BLE001 — B-254: the class only
        logger.warning("expo push incident could not be recorded: %s", type(exc).__name__)


def send_expo_push_to_user(
    user_id, title, body, data: dict | None = None, badge: int | None = None
) -> bool:
    """Look up the user's registered device tokens on the caller and hand the
    HTTP call to the bounded sender (PAD-294; messaging.push-notifications
    rule 10). Best-effort — no-ops (and never raises) when the user has no
    registered devices, mirroring send_push_notification's "no subscription
    -> return False". Returns False too when the queue is full and the push
    was dropped (logged). Inline under the test config.
    """
    from padel_app.utils.view_as import suppressed

    # admin.approvals-and-users rule 9 (PAD-532): nothing leaves under a view-as token.
    if suppressed("expo"):
        return False
    if not user_id:
        return False
    tokens = [
        row.token
        for row in DeviceToken.query.filter_by(user_id=user_id).all()
    ]
    if not tokens:
        return False
    from padel_app.utils.push_sender import submit

    return submit(send_expo_push, tokens, title, body, data, badge=badge,
                  label=f"expo push for user {user_id}")
