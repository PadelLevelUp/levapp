"""PAD-593 — messaging.messages rules 5a/5b: an image is signed at most once per window.

`Image.url()` used to mint a fresh V4 signed URL for every image in every response. On the VM
that is an IAM `signBlob` round trip per image (PAD-197), and because a V4 URL embeds its own
date and signature, the same avatar came back under a different URL every time, so no browser
or React Native image cache ever hit.

Now a per-process cache keyed by `object_key` reuses a signed URL for
`SIGNED_URL_REUSE_MINUTES`, which is shorter than the URL's own life (`SIGNED_URL_MINUTES`). A
reused URL therefore always has at least the difference left. A failure is remembered for
`SIGNING_FAILURE_RETRY_SECONDS`, so a broken signer costs one attempt per image per minute and
not one per image per response. The clock is the module's `_monotonic`, patched here (R-008:
inject time, do not sleep).

Also pinned: the conversation list's `participantAvatar` is the participant's image URL. It
used to read `avatar_url`, which no model defines, so it was always null. Loading it costs
no extra statement per conversation (PAD-204's constant-cost list).
"""
import logging

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from padel_app import model
from padel_app.model import Image
from padel_app.sql_db import db


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    c = _Clock()
    monkeypatch.setattr(model, "_monotonic", c)
    return c


@pytest.fixture
def signer(monkeypatch):
    """Counts signings; each signing returns a distinct URL, like V4 does."""
    calls = []

    def fake_signed_url(self, minutes=model.SIGNED_URL_MINUTES, method="GET"):
        calls.append(self.object_key)
        return f"https://signed/{self.object_key}?n={len(calls)}"

    monkeypatch.setattr(model, "GCS_BUCKET", "bucket")
    monkeypatch.setattr(Image, "signed_url", fake_signed_url)
    return calls


def test_the_same_image_is_signed_once_and_keeps_its_url(clock, signer):
    a1 = Image(object_key="images/user/a.jpg", is_public=False)
    a2 = Image(object_key="images/user/a.jpg", is_public=False)  # another row object, same key
    first = a1.url()
    assert a1.url() == first
    assert a2.url() == first
    assert signer == ["images/user/a.jpg"]


def test_different_images_are_signed_separately(clock, signer):
    Image(object_key="images/user/a.jpg").url()
    Image(object_key="images/user/b.jpg").url()
    assert signer == ["images/user/a.jpg", "images/user/b.jpg"]


def test_a_reused_url_always_has_life_left():
    assert model.SIGNED_URL_REUSE_MINUTES < model.SIGNED_URL_MINUTES
    assert model.SIGNED_URL_MINUTES - model.SIGNED_URL_REUSE_MINUTES >= 10


def test_the_url_is_re_signed_after_the_reuse_window(clock, signer):
    img = Image(object_key="images/user/a.jpg")
    first = img.url()
    clock.now += model.SIGNED_URL_REUSE_MINUTES * 60 - 1
    assert img.url() == first
    clock.now += 2
    second = img.url()
    assert second != first
    assert len(signer) == 2


def test_a_failure_is_not_retried_within_the_retry_window(clock, monkeypatch, caplog):
    attempts = []

    def failing(self, minutes=model.SIGNED_URL_MINUTES, method="GET"):
        attempts.append(1)
        raise RuntimeError("no signer")

    monkeypatch.setattr(model, "GCS_BUCKET", "bucket")
    monkeypatch.setattr(Image, "signed_url", failing)
    img = Image(object_key="images/user/a.jpg")
    with caplog.at_level(logging.WARNING, logger="padel_app.model"):
        assert img.url() is None
        assert img.url() is None  # B-018 still: None, and no second attempt yet
    assert len(attempts) == 1
    assert [r.getMessage() for r in caplog.records].count(
        "could not sign image images/user/a.jpg: no signer"
    ) == 1  # B-018's log, once per retry window
    clock.now += model.SIGNING_FAILURE_RETRY_SECONDS + 1
    assert img.url() is None
    assert len(attempts) == 2


def test_public_images_never_touch_the_cache(clock, signer):
    img = Image(object_key="images/club/logo.png", is_public=True)
    assert img.url() == img.public_url()
    assert signer == []


def test_a_page_of_eight_participants_costs_eight_signings_once(clock, signer):
    """The ticket's measure: a class with 8 participants with photos. Serializing it twice
    (two class opens) used to sign 16 times; it now signs 8, then 0."""
    images = [Image(object_key=f"images/user/p{i}.jpg") for i in range(8)]
    first = [img.url() for img in images]
    assert len(signer) == 8
    second = [img.url() for img in images]
    assert second == first
    assert len(signer) == 8


def test_the_cache_stays_bounded_and_keeps_the_newest(clock, signer, monkeypatch):
    monkeypatch.setattr(model, "_SIGNED_URL_CACHE_MAX", 5)
    for i in range(12):
        Image(object_key=f"images/user/k{i}.jpg").url()
    assert len(model._SIGNED_URL_CACHE) <= 5
    assert "images/user/k11.jpg" in model._SIGNED_URL_CACHE
    assert "images/user/k0.jpg" not in model._SIGNED_URL_CACHE


# ---------------------------------------------------------------------------
# participantAvatar (messaging.conversations rule 5a)
# ---------------------------------------------------------------------------
@pytest.fixture
def jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(username, with_photo):
    from padel_app.models import User

    user = User(name=username, username=username, password="x")
    db.session.add(user)
    db.session.flush()
    if with_photo:
        photo = Image(object_key=f"images/user/{username}.jpg", is_public=False)
        db.session.add(photo)
        db.session.flush()
        user.user_image_id = photo.id
    return user


def _thread(caller_id, other_username, with_photo=True):
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation

    other = _user(other_username, with_photo)
    conv = Conversation(
        is_group=False,
        participant_key=Conversation.build_participant_key([caller_id, other.id]),
    )
    db.session.add(conv)
    db.session.flush()
    for uid in (caller_id, other.id):
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))
    db.session.flush()


def _caller_headers(app, caller_username, others):
    with app.app_context():
        caller = _user(caller_username, with_photo=False)
        for other in others:
            _thread(caller.id, other)
        db.session.commit()
        token = create_access_token(identity=str(caller.id))
    return {"Authorization": f"Bearer {token}"}


def _list(client, headers):
    resp = client.get("/api/app/conversations", headers=headers)
    assert resp.status_code == 200, resp.data
    return resp.get_json()["conversations"]


def test_the_conversation_list_carries_the_participant_photo(app, client, jwt_secret, clock, signer):
    headers = _caller_headers(app, "pad593_caller", ["pad593_other"])
    [conv] = _list(client, headers)
    assert conv["participantAvatar"] == "https://signed/images/user/pad593_other.jpg?n=1"


def test_a_photo_that_cannot_be_signed_leaves_the_list_working(app, client, jwt_secret, clock, monkeypatch):
    def failing(self, minutes=model.SIGNED_URL_MINUTES, method="GET"):
        raise RuntimeError("no signer")

    monkeypatch.setattr(model, "GCS_BUCKET", "bucket")
    monkeypatch.setattr(Image, "signed_url", failing)
    headers = _caller_headers(app, "pad593_caller_f", ["pad593_other_f"])
    [conv] = _list(client, headers)
    assert conv["participantAvatar"] is None


def test_the_photo_costs_no_statement_per_conversation(app, client, jwt_secret, clock, signer):
    """PAD-204's constant-cost list holds with the avatar read: the image rides the
    participant join instead of a lazy load per row."""
    headers = _caller_headers(app, "pad593_c2", ["pad593_o1"])
    with app.app_context():
        engine = db.engine
        from padel_app.models import User

        caller_id = User.query.filter_by(username="pad593_c2").one().id
    _list(client, headers)  # warm-up

    def count():
        seen = []

        def rec(conn, cursor, statement, parameters, context, executemany):
            seen.append(statement)

        event.listen(engine, "before_cursor_execute", rec)
        try:
            _list(client, headers)
        finally:
            event.remove(engine, "before_cursor_execute", rec)
        return len(seen)

    one = count()
    with app.app_context():
        for i in range(4):
            _thread(caller_id, f"pad593_more{i}")
        db.session.commit()
    five = count()

    # R-032: the five-thread run really listed five photographed participants.
    convs = _list(client, headers)
    assert len(convs) == 5
    assert all(c["participantAvatar"] for c in convs)
    assert five == one, f"1 thread cost {one} statements, 5 threads cost {five}"
