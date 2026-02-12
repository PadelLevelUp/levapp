import queue

_subscribers: list[queue.Queue] = []


def subscribe() -> queue.Queue:
    q = queue.Queue()
    _subscribers.append(q)
    return q


def unsubscribe(q: queue.Queue):
    if q in _subscribers:
        _subscribers.remove(q)


def publish(event: dict):
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except Exception:
            pass
