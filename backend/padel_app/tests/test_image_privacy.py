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
    from padel_app import model

    with app.app_context():
        img = Image(object_key="images/user/x.jpg", is_public=False)

        # A configured bucket is the precondition for signing (B-018); the
        # test env has none, so state it here rather than depend on the shell.
        with patch.object(model, "GCS_BUCKET", "bucket"), \
             patch.object(Image, "signed_url", return_value="https://signed") as signed:
            assert img.url() == "https://signed"
        signed.assert_called_once()


def test_url_still_honours_an_explicit_public_flag(app):
    """`is_public` remains meaningful — the default changed, not the branch."""
    with app.app_context():
        img = Image(object_key="images/club/logo.png", is_public=True)

        assert img.url() == img.public_url()
        assert img.url().endswith("/images/club/logo.png")


def test_url_degrades_to_none_when_signing_fails(app):
    """B-018: an environment that cannot sign (no bucket configured, or a
    service account without `iam.serviceAccountTokenCreator`) must not turn
    every avatar, logo and attachment into a 500. `url()` returns None and the
    client renders its fallback."""
    with app.app_context():
        img = Image(object_key="images/user/x.jpg", is_public=False)

        with patch.object(Image, "signed_url", side_effect=RuntimeError("no signer")):
            assert img.url() is None


def test_url_is_none_without_a_bucket(app):
    """No `GCS_UPLOADS_BUCKET` (staging) means there is nothing to sign
    against: answer None without ever building a storage client."""
    from padel_app import model

    with app.app_context():
        img = Image(object_key="images/user/x.jpg", is_public=False)
        with patch.object(model, "GCS_BUCKET", None), \
             patch.object(model.storage, "Client") as client:
            assert img.url() is None
        client.assert_not_called()


def test_storage_client_is_built_once(app):
    """Signing a page of avatars must not build a storage client per image —
    that is what made staging crawl once prod data (with avatars) landed."""
    from padel_app import model

    with app.app_context():
        a = Image(object_key="images/user/a.jpg", is_public=False)
        b = Image(object_key="images/user/b.jpg", is_public=False)
        model._reset_storage_client()
        with patch.object(model, "GCS_BUCKET", "bucket"), \
             patch.object(model.storage, "Client") as client:
            client.return_value.bucket.return_value.blob.return_value \
                .generate_signed_url.return_value = "https://signed"
            assert a.url() == "https://signed"
            assert b.url() == "https://signed"
        assert client.call_count == 1
        model._reset_storage_client()


def test_signed_urls_outlive_a_render():
    """Five minutes expired while a page was still open (B-015)."""
    from padel_app import model

    assert model.SIGNED_URL_MINUTES >= 30
