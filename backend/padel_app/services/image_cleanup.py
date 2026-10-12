"""Deleting an image that a person's deletion frees (auth.account-deletion rule 2a,
messaging.messages rule 3).

An `images` row can be shared: a user's photo, a club logo, a message attachment and a
back-office app may all point at the same row. An image is deleted — its row, then after the
commit its object in the uploads bucket — only when nothing but the thing being erased still
points at it.
"""
import logging

from padel_app import model

logger = logging.getLogger(__name__)


def image_in_use(image_id, *, except_user_id=None, except_message_id=None):
    """True when anything other than the named user or message still points at the image."""
    from padel_app.models import Club, User
    from padel_app.models.backend_apps import Backend_App
    from padel_app.models.messages import Message

    users = User.query.filter(User.user_image_id == image_id)
    if except_user_id is not None:
        users = users.filter(User.id != except_user_id)
    messages = Message.query.filter(Message.attachment_id == image_id)
    if except_message_id is not None:
        messages = messages.filter(Message.id != except_message_id)
    return bool(
        users.first()
        or Club.query.filter_by(logo_id=image_id).first()
        or messages.first()
        or Backend_App.query.filter_by(image_id=image_id).first()
    )


def delete_stored_object(object_key, *, what="image", log=None):
    """Delete the object from the uploads bucket, best-effort, after the commit. With no bucket
    configured there is nothing to delete; a storage failure is logged by error class — never
    the key, which names the person's file — and never raised, so it cannot undo the committed
    deletion."""
    if not model.GCS_BUCKET:
        return
    try:
        model._storage_client().bucket(model.GCS_BUCKET).blob(object_key).delete()
    except Exception as exc:  # noqa: BLE001 — NotFound included: already gone is fine
        (log or logger).warning("%s object not deleted: %s", what, type(exc).__name__)
