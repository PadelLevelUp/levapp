"""PAD-277 (audit M19) — SSE streams are capped so they can never take every
gunicorn thread.

Production runs one gunicorn worker with 64 threads, and each open
`/api/app/events` stream holds one thread for its whole life. Before PAD-277
nothing limited the number of streams: about 20 tabs or phones (web and iOS
each opened up to three) took every thread and every other API request queued
behind them. `messaging.sse-realtime` rules 11-14.

Over the per-user cap the user's OLDEST stream is evicted, never the new one:
a closed tab is only noticed at its next keep-alive write, so refusing the
newest stream locked a user who reloaded a few times out of live updates
(found by the E2E suite: US-64).

The subscriber registry is module-global, so every test starts and ends empty.
Streams are opened with the Flask test client and are NOT iterated unless a
test says so: the cap must be decided in the request, before a byte is streamed.
"""
import time

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_config(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    # The test app does not load `Config`, whose query-string name is "token"
    # (R-009); flask-jwt-extended's own default would be "jwt".
    app.config["JWT_QUERY_STRING_NAME"] = "token"


@pytest.fixture(autouse=True)
def _clean_realtime_registry():
    from padel_app import realtime

    realtime._subscribers.clear()
    yield
    realtime._subscribers.clear()


def _open_streams(user_id=None):
    from padel_app import realtime

    if user_id is not None:
        return len(realtime._subscribers.get(int(user_id), []))
    return sum(len(queues) for queues in realtime._subscribers.values())


@pytest.fixture
def users(app):
    from padel_app.models import User

    with app.app_context():
        rows = [
            User(name=f"SSE {i}", username=f"pad277_{i}", password="x", status="active")
            for i in range(42)
        ]
        db.session.add_all(rows)
        db.session.commit()
        return [row.id for row in rows]


def _events_url(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return f"/api/app/events?token={token}"


def _drain(response, budget_s=3.0):
    """Read a stream for up to `budget_s`; return (chunks, ended_by_server)."""
    chunks = []
    iterator = iter(response.response)
    started = time.monotonic()
    while time.monotonic() - started < budget_s:
        try:
            chunk = next(iterator)
        except StopIteration:
            return chunks, True
        chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
    return chunks, False


def _close_all(*responses):
    for response in responses:
        response.close()


def test_a_stream_over_the_total_cap_gets_a_fast_503(app, client, users):
    app.config["SSE_MAX_STREAMS"] = 2
    app.config["SSE_MAX_STREAMS_PER_USER"] = 10
    first = client.get(_events_url(app, users[0]))
    second = client.get(_events_url(app, users[1]))
    third = client.get(_events_url(app, users[2]))
    try:
        assert third.status_code == 503
        assert third.headers.get("Retry-After") == "10"
        assert third.get_json() == {"error": "SSE_CAPACITY", "scope": "total"}
        assert first.status_code == 200 and second.status_code == 200
        assert _open_streams() == 2
    finally:
        _close_all(first, second, third)
    assert _open_streams() == 0


def test_over_the_per_user_cap_the_oldest_stream_is_evicted_and_the_newest_survives(app, client, users):
    from padel_app.realtime import publish

    app.config["SSE_MAX_STREAMS"] = 10
    app.config["SSE_MAX_STREAMS_PER_USER"] = 2
    app.config["SSE_KEEPALIVE_SECONDS"] = 1
    oldest = client.get(_events_url(app, users[0]))
    middle = client.get(_events_url(app, users[0]))
    newest = client.get(_events_url(app, users[0]))
    bystander = client.get(_events_url(app, users[1]))
    try:
        assert newest.status_code == 200
        assert [oldest.status_code, middle.status_code, bystander.status_code] == [200, 200, 200]
        assert _open_streams(users[0]) == 2
        assert _open_streams(users[1]) == 1

        # The evicted stream ends at once instead of idling on keep-alives.
        chunks, ended = _drain(oldest)
        assert ended, f"the oldest stream was not ended: {chunks}"

        # The newest stream still delivers this user's events.
        publish({"type": "message_created", "payload": {"id": 7}}, [users[0]])
        chunks, ended = _drain(newest, budget_s=2.0)
        assert not ended
        assert any('"message_created"' in chunk for chunk in chunks), chunks
    finally:
        _close_all(oldest, middle, newest, bystander)


def test_a_user_at_their_cap_can_reconnect_even_when_the_server_is_full(app, client, users):
    app.config["SSE_MAX_STREAMS"] = 2
    app.config["SSE_MAX_STREAMS_PER_USER"] = 1
    mine = client.get(_events_url(app, users[0]))
    theirs = client.get(_events_url(app, users[1]))
    reconnect = client.get(_events_url(app, users[0]))
    stranger = client.get(_events_url(app, users[2]))
    try:
        assert reconnect.status_code == 200, "a reloading user must not be locked out"
        assert stranger.status_code == 503
        assert stranger.get_json() == {"error": "SSE_CAPACITY", "scope": "total"}
        assert _open_streams(users[0]) == 1 and _open_streams() == 2
    finally:
        _close_all(mine, theirs, reconnect, stranger)


def test_the_route_defaults_are_40_total_and_4_per_user(app, client, users):
    for key in ("SSE_MAX_STREAMS", "SSE_MAX_STREAMS_PER_USER"):
        app.config.pop(key, None)
    own = [client.get(_events_url(app, users[0])) for _ in range(5)]
    others = [client.get(_events_url(app, uid)) for uid in users[1:36]]  # 35 users
    last_in = client.get(_events_url(app, users[37]))
    over = client.get(_events_url(app, users[38]))
    try:
        assert [r.status_code for r in own] == [200] * 5
        assert _open_streams(users[0]) == 4, "the fifth stream evicts the first"
        assert last_in.status_code == 200 and _open_streams() == 40
        assert over.status_code == 503
    finally:
        _close_all(*own, *others, last_in, over)


def test_the_stream_opens_with_a_retry_hint_immediately(app, client, users):
    """Headers must flush at once. Before PAD-277 nothing was written until the
    first keep-alive, 15 seconds in, so a client could not tell an accepted
    stream from a stalled one."""
    response = client.get(_events_url(app, users[0]))
    try:
        assert response.status_code == 200
        started = time.monotonic()
        first = next(iter(response.response))
        elapsed = time.monotonic() - started
        text = first.decode() if isinstance(first, bytes) else first
        assert text.startswith("retry: ")
        assert elapsed < 2
    finally:
        response.close()


def test_the_keep_alive_interval_comes_from_config(app, client, users):
    """The keep-alive is how a vanished client is noticed, so its interval
    bounds how long a dead stream holds its slot."""
    app.config["SSE_KEEPALIVE_SECONDS"] = 1
    response = client.get(_events_url(app, users[0]))
    try:
        iterator = iter(response.response)
        next(iterator)  # the retry hint
        started = time.monotonic()
        second = next(iterator)
        elapsed = time.monotonic() - started
        text = second.decode() if isinstance(second, bytes) else second
        assert text.startswith(": keep-alive")
        assert elapsed < 2, f"the keep-alive took {elapsed:.1f}s"
    finally:
        response.close()


def test_closing_a_stream_frees_its_slot_even_if_it_never_started(app, client, users):
    """Guard for the design: the slot is taken in the request, so it must be
    released by the response's close hook even when the generator never ran
    (a client that hangs up before the first byte)."""
    app.config["SSE_MAX_STREAMS"] = 1
    response = client.get(_events_url(app, users[0]))
    assert response.status_code == 200
    response.close()
    assert _open_streams() == 0

    again = client.get(_events_url(app, users[1]))
    try:
        assert again.status_code == 200
    finally:
        again.close()


def test_the_caps_come_from_the_environment_with_defaults():
    from padel_app.config import sse_stream_limits

    assert sse_stream_limits({}) == (40, 4)
    assert sse_stream_limits({"SSE_MAX_STREAMS": "12", "SSE_MAX_STREAMS_PER_USER": "2"}) == (12, 2)
    # Nonsense or non-positive values fall back to the defaults rather than
    # disabling the cap or closing the stream to everyone.
    assert sse_stream_limits({"SSE_MAX_STREAMS": "0", "SSE_MAX_STREAMS_PER_USER": "nope"}) == (40, 4)


def test_the_keep_alive_comes_from_the_environment_with_a_default_of_5():
    from padel_app.config import sse_keepalive_seconds

    assert sse_keepalive_seconds({}) == 5
    assert sse_keepalive_seconds({"SSE_KEEPALIVE_SECONDS": "12"}) == 12
    assert sse_keepalive_seconds({"SSE_KEEPALIVE_SECONDS": "0"}) == 5
    assert sse_keepalive_seconds({"SSE_KEEPALIVE_SECONDS": "soon"}) == 5
