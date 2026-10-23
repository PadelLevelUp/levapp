# Audit findings (Phase 1):
# - Existing authenticated API routes are implemented via Flask blueprints + @jwt_required().
# - JWT identity is read with get_jwt_identity() and cast to int where needed.
# - DB access follows Flask-SQLAlchemy model querying and db.session commits.
# - Environment configuration values are read via os.getenv from process env.
import json
import logging
import os
import re

from flask import Blueprint, jsonify, request, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.exc import IntegrityError

from padel_app.models import PushSubscription, DeviceToken
from padel_app.sql_db import db


bp = Blueprint("notifications_api", __name__, url_prefix="/api/notifications")


# ---------------------------------------------------------------------------
# Native (Expo) push device-token registration — Phase 5, distinct from the
# browser Web-Push subscribe/unsubscribe routes above.
# ---------------------------------------------------------------------------

#: Values `POST /device` accepts for `platform` (what the Expo client sends as Platform.OS).
DEVICE_PLATFORMS = frozenset({"ios", "android"})


@bp.post("/device")
@jwt_required()
def register_device_token():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    token = data.get("token")
    platform = data.get("platform")
    if not token:
        abort(400, "token is required")
    # messaging.push-notifications rule 11b (PAD-307): the platform is recorded
    # as sent and must be one the app ships on. Exact match, no normalisation —
    # the clients send Platform.OS, which is already lowercase. No DB CHECK.
    if platform not in DEVICE_PLATFORMS:
        abort(400, "platform must be one of: " + ", ".join(sorted(DEVICE_PLATFORMS)))

    # messaging.push-notifications rule 9 (D137, superseding PAD-269): the latest
    # login owns the phone. Every OTHER user's row for this token goes, so a phone
    # never keeps receiving a previous account's pushes (B-167: the owner's phone
    # got another account's message previews and every tap hit a 403). The owner
    # accepted the opposite risk: whoever holds someone's push ID can take their
    # notifications by registering it.
    DeviceToken.query.filter(DeviceToken.token == token, DeviceToken.user_id != user_id).delete(
        synchronize_session=False
    )
    # notifications.notification-sound rule 5 (PAD-680): what this build declared, kept on the token.
    from padel_app.utils.client_capabilities import NOTIFICATION_SOUND, client_declares

    sound_capable = client_declares(NOTIFICATION_SOUND)
    record = DeviceToken.query.filter_by(token=token, user_id=user_id).first()
    if record is None:
        # messaging.push-notifications rule 9a (PAD-652, B-581): two registrations at once both
        # found no row and the loser's insert failed on uq_device_tokens_user_token with a 500.
        # Same shape as `save_subscription`: the insert runs in a SAVEPOINT (after the delete
        # above, which the rollback keeps), and a collision updates the winner's row.
        savepoint = db.session.begin_nested()
        try:
            db.session.add(DeviceToken(user_id=user_id, token=token, platform=platform,
                                       sound_capable=sound_capable))
            db.session.flush()
            savepoint.commit()
        except IntegrityError:
            savepoint.rollback()
            record = DeviceToken.query.filter_by(token=token, user_id=user_id).one()
    if record is not None:
        record.platform = platform
        record.sound_capable = sound_capable

    db.session.commit()
    return jsonify({"success": True}), 200


@bp.delete("/device")
@jwt_required()
def unregister_device_token():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    token = data.get("token")

    # Idempotent: deleting a token that doesn't exist (or isn't the caller's)
    # is still a 200, not an error.
    if token:
        record = DeviceToken.query.filter_by(token=token, user_id=user_id).first()
        if record:
            db.session.delete(record)
            db.session.commit()

    return jsonify({"success": True}), 200


@bp.get("/vapid-public-key")
def get_vapid_public_key():
    key = os.getenv("VAPID_PUBLIC_KEY")
    if not key:
        abort(500, "VAPID_PUBLIC_KEY is not configured")
    return jsonify({"publicKey": key})


@bp.post("/save-subscription")
@jwt_required()
def save_subscription():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    subscription = data.get("subscription")
    if not subscription:
        abort(400, "subscription is required")

    payload = json.dumps(subscription)
    record = PushSubscription.query.filter_by(user_id=user_id).first()
    if record is None:
        # auth.push-subscription rule 7 (PAD-652, B-581): two saves at once both found no row,
        # and the loser's insert failed on ix_push_subscriptions_user_id with a 500. The insert
        # runs in a SAVEPOINT; on that collision only the savepoint rolls back and the save
        # updates the winner's row, the `Conversation.get_or_insert` shape (PAD-411).
        savepoint = db.session.begin_nested()
        try:
            db.session.add(PushSubscription(user_id=user_id, subscription_json=payload))
            db.session.flush()
            savepoint.commit()
        except IntegrityError:
            savepoint.rollback()
            record = PushSubscription.query.filter_by(user_id=user_id).one()
    if record is not None:
        record.subscription_json = payload

    db.session.commit()
    return jsonify({"success": True}), 201


@bp.delete("/unsubscribe")
@jwt_required()
def unsubscribe_notifications():
    user_id = int(get_jwt_identity())
    record = PushSubscription.query.filter_by(user_id=user_id).first()
    if record:
        db.session.delete(record)
        db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# admin.engine-health rule 8 (PAD-746, B-678): a client's failed push registration, reported so
# the server sees it. Closed fields only: no token, no subscription, no message text.
# ---------------------------------------------------------------------------

#: The phases each platform reports (the clients' failure hooks, PAD-744).
REGISTRATION_FAILURE_PHASES = {
    "ios": frozenset({"token", "post"}),
    "android": frozenset({"token", "post"}),
    "web": frozenset({"subscribe", "post"}),
}
REGISTRATION_FAILURE_PERMISSIONS = frozenset({"granted", "denied", "undetermined", "unknown"})
#: `delivery_incidents.channel` per platform (the rule 2 mapping: ios → apns, android → fcm).
REGISTRATION_FAILURE_CHANNELS = {"ios": "apns", "android": "fcm", "web": "webpush"}
#: A short identifier: an error class (`TypeError`, `http_503`) or a build (`33`, `1.3.1`).
_IDENT = re.compile(r"^[A-Za-z0-9_.-]{1,60}$")
#: Rows one user may add per 24 hours; past it the report is acknowledged and dropped.
REGISTRATION_FAILURES_PER_DAY = 20

logger = logging.getLogger(__name__)


@bp.post("/registration-failure")
@jwt_required()
def report_registration_failure():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "a JSON object is required")
    platform = data.get("platform")
    phase = data.get("phase")
    permission = data.get("permission")
    build = data.get("build")
    error_class = data.get("errorClass")
    if (platform not in REGISTRATION_FAILURE_PHASES
            or phase not in REGISTRATION_FAILURE_PHASES[platform]
            or permission not in REGISTRATION_FAILURE_PERMISSIONS
            or not isinstance(build, str) or not _IDENT.match(build)
            or not isinstance(error_class, str) or not _IDENT.match(error_class)
            or set(data) - {"platform", "phase", "permission", "build", "errorClass"}):
        abort(400, "platform, phase, permission, build and errorClass are required; nothing else")

    from datetime import timedelta

    from padel_app.models.delivery_incident import DeliveryIncident
    from padel_app.services import delivery_incidents
    from padel_app.utils.dates import utcnow_naive

    recent = DeliveryIncident.query.filter(
        DeliveryIncident.kind == "push_registration_failed",
        DeliveryIncident.user_id == user_id,
        DeliveryIncident.created_at >= utcnow_naive() - timedelta(hours=24),
    ).count()
    if recent >= REGISTRATION_FAILURES_PER_DAY:
        return "", 204
    logger.warning("push registration failed: user=%s platform=%s phase=%s permission=%s build=%s error=%s",
                   user_id, platform, phase, permission, build, error_class)
    delivery_incidents.record("push_registration_failed", REGISTRATION_FAILURE_CHANNELS[platform],
                              user_id=user_id, error_class=error_class,
                              detail=f"phase={phase} permission={permission} build={build}")
    return "", 204
