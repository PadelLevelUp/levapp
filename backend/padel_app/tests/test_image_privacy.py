"""Regression tests for B-015.

The uploads bucket used to grant `roles/storage.objectViewer` to `allUsers`, so
`Image.url()` handed out a permanent unauthenticated link — for chat
attachments as much as for avatars. The bucket is private now, which only holds
if nothing re-introduces a public default.

These tests never touch GCS: `signed_url` is patched, and only the branch taken
by `url()` is asserted.
"""

from unittest.mock import patch

from padel_app.model import Image


def test_image_is_private_by_default(app):
    """A stored image must not claim to be public unless asked."""
    from padel_app.sql_db import db

    with app.app_context():
        img = Image(object_key="images/user/20260906_abc_photo.jpg")
        db.session.add(img)
        db.session.commit()

        assert img.is_public is False


def test_url_uses_a_signed_url_when_private(app):
    with app.app_context():
        img = Image(object_key="images/user/x.jpg", is_public=False)

        with patch.object(Image, "signed_url", return_value="https://signed") as signed:
            assert img.url() == "https://signed"
        signed.assert_called_once()


def test_url_still_honours_an_explicit_public_flag(app):
    """`is_public` remains meaningful — the default changed, not the branch."""
    with app.app_context():
        img = Image(object_key="images/club/logo.png", is_public=True)

        assert img.url() == img.public_url()
        assert img.url().endswith("/images/club/logo.png")


def test_signed_urls_outlive_a_render():
    """Five minutes expired while a page was still open (B-015)."""
    from padel_app import model

    assert model.SIGNED_URL_MINUTES >= 30
