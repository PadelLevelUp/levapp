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

import queue
import threading
from collections.abc import Iterable

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
