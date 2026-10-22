"""The worker role: APScheduler's jobs run here, not in the API (PAD-695).

Spec: ``delivery.worker-role``. Started by the deploy as a second container of the API image::

    docker run ... -e ROLE=worker <image> python -m padel_app.worker

(through ``entrypoint.sh``, so the schema boot gate applies). With ``WORKER_SPLIT`` on:

1. ``create_app()`` with ``ROLE=worker``: ``init_scheduler`` competes for the scheduler-leader lock
   (``scheduler_leadership.py``); the holder runs the startup reschedule and the jobs. The API
   processes only write the job store (rule 1).
2. While it is not the leader it waits, with a WARNING every ``LOCK_WARN_SECONDS``, and never
   exits: an exit under ``--restart unless-stopped`` would re-run the boot every few seconds.
3. While it leads it wakes its scheduler every ``WORKER_WAKE_SECONDS`` (default 5): APScheduler
   only sleeps until the next run time it knows, and jobs the API adds are not ones it knows.
4. ``/livez`` on ``WORKER_LIVEZ_PORT`` (default 8081), no database call:
   ``{"status": "alive", "leader": bool, "split": "on"|"off"}``. The deploy reads ``leader``.
5. SIGTERM/SIGINT: shut the scheduler down waiting for running jobs, drain the push queue (5 s),
   then give up the lock (closing its session), and exit 0.

With ``WORKER_SPLIT`` off the API runs the jobs: the worker starts no scheduler and idles with
``/livez`` answering, rather than exiting into a restart loop (the deploy removes it).
"""
import json
import logging
import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

logger = logging.getLogger("padel_app.worker")

LOCK_WARN_SECONDS = 60.0
STATUS_EVERY_SECONDS = 60.0
DEFAULT_WAKE_SECONDS = 5.0
DEFAULT_LIVEZ_PORT = 8081


def log(message, level=logging.INFO):
    # The app's logging may not be configured for this logger; print keeps it in `docker logs`.
    print(f"[worker] {message}", flush=True)
    logger.log(level, message)


class Worker:
    """The loop of a worker process, with its collaborators passed in so tests can fake them."""

    def __init__(self, *, scheduler, leadership, split, wake_seconds=DEFAULT_WAKE_SECONDS,
                 drain=None, clock=time.monotonic, status_line=None):
        self.scheduler = scheduler
        self.leadership = leadership
        self.split = split
        self.wake_seconds = wake_seconds
        self._drain = drain or (lambda: None)
        self._clock = clock
        self._status_line = status_line
        self._stop = threading.Event()
        started = clock()
        self._waiting_since = started
        self._last_warn = started
        self._last_status = started

    @property
    def is_leader(self) -> bool:
        if self.leadership is not None:
            return self.leadership.is_leader
        # No leadership thread (SCHEDULER_LEADERSHIP=off): a running scheduler is the only one.
        return self.scheduler is not None and self.scheduler.running

    def livez(self) -> dict:
        return {"status": "alive", "leader": bool(self.split and self.is_leader),
                "split": "on" if self.split else "off"}

    def tick(self) -> None:
        """One pass of the loop: wake the scheduler while leading, warn while waiting."""
        now = self._clock()
        if self.split and self.scheduler is not None:
            if self.is_leader:
                self._waiting_since = None
                try:
                    self.scheduler.wakeup()
                except Exception as exc:  # noqa: BLE001 — a stopped scheduler during shutdown
                    log(f"wakeup failed: {exc}", logging.WARNING)
            else:
                if self._waiting_since is None:
                    self._waiting_since = now
                    self._last_warn = now
                elif now - self._last_warn >= LOCK_WARN_SECONDS:
                    self._last_warn = now
                    log(f"WARNING not the scheduler leader after {now - self._waiting_since:.0f}s: "
                        "another worker (or an API with WORKER_SPLIT off) holds the lock; waiting",
                        logging.WARNING)
        if now - self._last_status >= STATUS_EVERY_SECONDS:
            self._last_status = now
            if self._status_line is not None:
                log(self._status_line(self))

    def run(self) -> None:
        while not self._stop.is_set():
            self.tick()
            self._stop.wait(self.wake_seconds)

    def request_stop(self, *_args) -> None:
        self._stop.set()

    def shutdown(self) -> None:
        """Running jobs finish, queued pushes go out, and only then is the lock given up: another
        worker never starts a job this one is still running."""
        if self.scheduler is not None and self.scheduler.running:
            log("shutting the scheduler down (waiting for running jobs)")
            try:
                self.scheduler.shutdown(wait=True)
            except Exception as exc:  # noqa: BLE001
                log(f"scheduler shutdown: {exc}", logging.WARNING)
        self._drain()
        if self.leadership is not None:
            self.leadership.stop()
        log("stopped")


def serve_livez(worker, port):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 — http.server's name
            if self.path.rstrip("/") != "/livez":
                self.send_error(404)
                return
            body = json.dumps(worker.livez()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):  # probes every few seconds: keep them out of the log
            pass

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name="worker-livez", daemon=True).start()
    return server


def status_line(worker) -> str:
    from padel_app.utils import push_sender

    jobs = "?"
    try:
        if worker.scheduler is not None:
            jobs = len(worker.scheduler.get_jobs())
    except Exception:  # noqa: BLE001 — the job store may be unreachable for a moment
        pass
    return (f"worker: leader={worker.is_leader} split={'on' if worker.split else 'off'} jobs={jobs} "
            f"push_queue={push_sender.pending()} push={push_sender.stats()}")


def drain_pushes() -> None:
    from padel_app.utils import push_sender

    if push_sender.pending() and not push_sender.flush(timeout=push_sender.DRAIN_SECONDS):
        log(f"WARNING {push_sender.pending()} pushes still queued at exit", logging.WARNING)


def main(environ=None) -> int:
    environ = os.environ if environ is None else environ
    if environ.get("FLASK_ENV") != "production":  # as app.py
        from dotenv import load_dotenv

        load_dotenv(".env.local.dev")
        if os.path.exists(".secrets.env"):
            load_dotenv(".secrets.env")
    environ.setdefault("ROLE", "worker")

    import padel_app
    from padel_app import scheduler as sched_mod

    split = sched_mod.worker_split_enabled(environ)
    if sched_mod.process_role(environ) != "worker":
        log(f"ROLE={environ.get('ROLE')} is not worker: refusing to run the worker loop", logging.ERROR)
        return 2

    app = padel_app.create_app()
    from padel_app.config import sse_broker

    if split and sse_broker(app.config.get("SSE_BROKER")) != "postgres":
        log("WARNING SSE_BROKER is not postgres: events published by jobs here reach no stream "
            "(delivery.worker-role rule 3)", logging.WARNING)
    if not split:
        log("WORKER_SPLIT is off: the API runs the jobs; idling (the deploy removes this container)")

    worker = Worker(
        scheduler=app.extensions.get("scheduler") if split else None,
        leadership=app.extensions.get("scheduler_leadership") if split else None,
        split=split,
        wake_seconds=float(environ.get("WORKER_WAKE_SECONDS", DEFAULT_WAKE_SECONDS)),
        drain=drain_pushes,
        status_line=status_line,
    )
    port = int(environ.get("WORKER_LIVEZ_PORT", DEFAULT_LIVEZ_PORT))
    server = serve_livez(worker, port)
    signal.signal(signal.SIGTERM, worker.request_stop)
    signal.signal(signal.SIGINT, worker.request_stop)
    log(f"started: split={'on' if split else 'off'}, livez on :{port}, wake every {worker.wake_seconds:.0f}s")

    worker.run()
    worker.shutdown()
    server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
