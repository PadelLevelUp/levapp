"""In-memory SSE fan-out, scoped to named recipients.

Until PAD-206 this was an anonymous ``list[queue.Queue]`` and ``publish(event)``
pushed every event into every queue: the process had no idea which user a queue
belonged to, so every private message, edit, delete and reaction reached every
connected client. Web and iOS discarded events for conversations they were not
showing, but that is a *rendering* decision taken after the payload is already
on the wire — never a privacy boundary (B-004).

The registry is now keyed by user id. `subscribe(user_id)` registers one queue
for one open SSE connection; a single user may hold several (two tabs, web and
phone), and all of them are served. `publish(event, user_ids)` delivers only to
the queues of the users it names.

``user_ids`` is deliberately a **required** argument. Making it optional — even
defaulting to "everyone" for convenience — would let the broadcast come back by
omission, which is exactly how B-004 lasted five months. A caller that does not
know its recipients has a bug at the call site, and `TypeError` says so loudly.

Still per-process and still in-memory: this is why production runs a single
gunicorn worker. A second worker would keep its own registry and simply not see
the connections held by the first. Horizontal scaling needs a shared broker.
"""

import logging
import queue
import threading
from collections.abc import Iterable

logger = logging.getLogger(__name__)

#: Put into a queue to end its stream at once: the per-user cap evicts a
#: user's oldest stream this way (messaging.sse-realtime rule 12, PAD-277).
STOP = object()

# user id -> the queues that user currently has open
_subscribers: dict[int, list[queue.Queue]] = {}

# The registry is touched from every request thread (a publish) and from the
# long-lived SSE generator threads (subscribe/unsubscribe). Mutating a dict of
# lists from several threads without a lock can drop a registration.
_lock = threading.Lock()


def subscribe(user_id: int) -> queue.Queue:
    """Register a queue for one open SSE connection belonging to ``user_id``."""
    user_id = int(user_id)
    q: queue.Queue = queue.Queue()
    with _lock:
        _subscribers.setdefault(user_id, []).append(q)
    return q


def stream_count() -> int:
    """Number of open SSE connections across every user."""
    with _lock:
        return sum(len(queues) for queues in _subscribers.values())


def try_subscribe(user_id: int, *, max_total: int, max_per_user: int):
    """Register a queue for ``user_id``; return ``(queue, None)`` or
    ``(None, "total")`` (messaging.sse-realtime rules 11-13, PAD-277).

    Over the per-user cap the user's OLDEST queues are evicted to make room
    and sent ``STOP``, which ends their streams at once. The newest connection
    is almost always the live one (a reloaded tab); the oldest is most likely
    one whose client is gone but not yet noticed by a keep-alive. Only the
    server-wide cap refuses, and it is judged on the total AFTER that eviction,
    so a user already at their own cap always gets through and a refusal
    never evicts anyone. Check, eviction and registration share one lock
    acquisition, so two requests can never both take the last slot.
    """
    user_id = int(user_id)
    with _lock:
        queues = _subscribers.get(user_id, [])
        to_evict = max(0, len(queues) - max_per_user + 1)
        total = sum(len(qs) for qs in _subscribers.values())
        if total - to_evict >= max_total:
            return None, "total"
        evicted = queues[:to_evict]
        q: queue.Queue = queue.Queue()
        _subscribers[user_id] = queues[to_evict:] + [q]

    # Outside the lock, like publish(): a put must never block a subscribe.
    for old in evicted:
        try:
            old.put_nowait(STOP)
        except Exception:
            pass
    if evicted:
        logger.info("SSE stream evicted: user=%s evicted=%s", user_id, len(evicted))
    return q, None


def unsubscribe(user_id: int, q: queue.Queue) -> None:
    """Drop one connection's queue, leaving that user's other queues alone."""
    user_id = int(user_id)
    with _lock:
        queues = _subscribers.get(user_id)
        if not queues:
            return
        if q in queues:
            queues.remove(q)
        if not queues:
            # Don't leak an empty list per user who ever connected.
            del _subscribers[user_id]


def publish(event: dict, user_ids: Iterable[int]) -> None:
    """Deliver ``event`` to every open queue of every user in ``user_ids``.

    ``user_ids`` may legitimately be empty (a conversation whose only other
    participant was deleted, say) — that delivers to nobody, which is correct.
    What it may never be is absent.
    """
    recipients = {int(uid) for uid in user_ids if uid is not None}
    if not recipients:
        return

    with _lock:
        # Snapshot under the lock; deliver outside it, so a slow put_nowait
        # never blocks a subscribe.
        targets = [q for uid in recipients for q in _subscribers.get(uid, ())]

    for q in targets:
        try:
            q.put_nowait(event)
        except Exception:
            # One dead subscriber must never stop the others from being served.
            pass
