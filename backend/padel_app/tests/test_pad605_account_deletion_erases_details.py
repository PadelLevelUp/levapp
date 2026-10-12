"""PAD-605 — auth.account-deletion rules 2 and 2a: deleting an account erases the
personal details registration and settings collect (birth date, country, the
password-reset code, the block reason) and deletes the profile photo — its
`images` row and its object in the uploads bucket — instead of only unlinking it.

The bucket is never touched: `padel_app.model._storage_client` is patched and
only the calls made on it are asserted.
"""
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app import model
from padel_app.services import account_service
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

KEY = "images/user/20260101000000_tok_rita.jpg"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _world(app, *, shared_with_club=False):
    from padel_app.model import Image
    from padel_app.models import Club, User
    from padel_app.models.players import Player

    with app.app_context():
        photo = Image(object_key=KEY, content_type="image/jpeg")
        db.session.add(photo)
        db.session.flush()
        rita = User(
            name="Rita Leaves", username="rita605", email="rita605@example.com", password="x",
            status="active", birth_date=date(1990, 5, 17), country="PT",
            password_reset_code_hash="hash", password_reset_expires_at=utcnow_naive() + timedelta(hours=1),
            password_reset_sent_at=utcnow_naive(), notif_block_reason="exams until June",
            user_image_id=photo.id,
        )
        db.session.add(rita)
        db.session.flush()
        db.session.add(Player(user_id=rita.id))
        club_id = None
        if shared_with_club:
            club = Club(name="Logo Club", description="d", location="l", logo_id=photo.id)
            db.session.add(club)
            db.session.flush()
            club_id = club.id
        db.session.commit()
        return {"user_id": rita.id, "image_id": photo.id, "club_id": club_id}


def _delete(app, client, user_id):
    with app.app_context():
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}
    res = client.delete("/api/auth/me", headers=headers)
    assert res.status_code == 200, res.get_json()


def _bucket():
    storage = MagicMock()
    return storage, storage.bucket.return_value.blob


def test_personal_details_and_the_photo_are_erased(app, client):
    from padel_app.model import Image
    from padel_app.models import User

    ids = _world(app)
    storage, blob = _bucket()
    with patch.object(model, "GCS_BUCKET", "uploads"), \
         patch.object(model, "_storage_client", return_value=storage):
        _delete(app, client, ids["user_id"])

    with app.app_context():
        user = db.session.get(User, ids["user_id"])
        assert (user.birth_date, user.country, user.user_image_id) == (None, None, None)
        assert (user.password_reset_code_hash, user.password_reset_expires_at,
                user.password_reset_sent_at, user.notif_block_reason) == (None, None, None, None)
        assert db.session.get(Image, ids["image_id"]) is None
    storage.bucket.assert_called_once_with("uploads")
    blob.assert_called_once_with(KEY)
    blob.return_value.delete.assert_called_once_with()


def test_a_bucket_failure_never_undoes_the_deletion(app, client):
    from padel_app.model import Image
    from padel_app.models import User

    ids = _world(app)
    storage, blob = _bucket()
    blob.return_value.delete.side_effect = RuntimeError("bucket down")
    with patch.object(model, "GCS_BUCKET", "uploads"), \
         patch.object(model, "_storage_client", return_value=storage), \
         patch.object(account_service.logger, "warning") as warning:
        _delete(app, client, ids["user_id"])

    with app.app_context():
        user = db.session.get(User, ids["user_id"])
        assert user.status == "disabled" and user.birth_date is None
        assert db.session.get(Image, ids["image_id"]) is None
    warning.assert_called_once()
    logged = " ".join(str(a) for a in warning.call_args.args)
    assert "RuntimeError" in logged and KEY not in logged


def test_without_a_bucket_the_row_goes_and_no_client_is_built(app, client):
    from padel_app.model import Image

    ids = _world(app)
    with patch.object(model, "GCS_BUCKET", None), \
         patch.object(model, "_storage_client") as client_factory:
        _delete(app, client, ids["user_id"])

    with app.app_context():
        assert db.session.get(Image, ids["image_id"]) is None
    client_factory.assert_not_called()


def test_a_photo_that_is_also_a_club_logo_stays(app, client):
    from padel_app.model import Image
    from padel_app.models import Club, User

    ids = _world(app, shared_with_club=True)
    storage, blob = _bucket()
    with patch.object(model, "GCS_BUCKET", "uploads"), \
         patch.object(model, "_storage_client", return_value=storage):
        _delete(app, client, ids["user_id"])

    with app.app_context():
        assert db.session.get(User, ids["user_id"]).user_image_id is None
        assert db.session.get(Image, ids["image_id"]) is not None
        assert db.session.get(Club, ids["club_id"]).logo_id == ids["image_id"]
    blob.return_value.delete.assert_not_called()
