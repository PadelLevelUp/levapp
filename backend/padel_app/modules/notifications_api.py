# Audit findings (Phase 1):
# - Existing authenticated API routes are implemented via Flask blueprints + @jwt_required().
# - JWT identity is read with get_jwt_identity() and cast to int where needed.
# - DB access follows Flask-SQLAlchemy model querying and db.session commits.
# - Environment configuration values are read via os.getenv from process env.
import json
import os

from flask import Blueprint, jsonify, request, abort
from flask_jwt_extended import jwt_required, get_jwt_identity

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

    # messaging.push-notifications rule 9 (PAD-269): a token is owned per
    # (user, token). Registering upserts the caller's own row and never touches
    # another user's (it used to reassign it, so anyone who knew a token could
    # take someone's notifications away).
    record = DeviceToken.query.filter_by(token=token, user_id=user_id).first()
    if record is None:
        record = DeviceToken(user_id=user_id, token=token, platform=platform)
        db.session.add(record)
    else:
        record.platform = platform

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

    record = PushSubscription.query.filter_by(user_id=user_id).first()
    if record is None:
        record = PushSubscription(
            user_id=user_id,
            subscription_json=json.dumps(subscription),
        )
        db.session.add(record)
    else:
        record.subscription_json = json.dumps(subscription)

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
