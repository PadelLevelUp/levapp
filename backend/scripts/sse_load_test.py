#!/usr/bin/env python3
"""Load test for the SSE endpoint `/api/app/events` (PAD-277, audit M19).

Each open SSE stream pins one gunicorn thread for its whole life (1 worker,
64 threads in production). This script opens N streams at once, keeps them
open, and then times ordinary requests against a cheap endpoint. It answers
one question: while N clients hold streams, does the API still answer?

    python sse_load_test.py --base-url http://127.0.0.1:5025 \
        --tokens-file tokens.txt --streams 70 --probes 10 --max-probe-ms 2000

Standard library only, so it runs from any Python 3.10+.

Reproducing the numbers in the 2026-08-25 single-VM decision (PAD-277):

1. A throwaway Postgres database with the migrations applied (for example the
   E2E reset: `E2E_DB_NAME=<db> frontend/apps/web/e2e/scripts/reset-test-db.sh`).
2. One token per line for DISTINCT users, so the per-user cap is not what you
   measure: create users and call `flask_jwt_extended.create_access_token`
   inside an app context, with the same JWT_SECRET_KEY the server uses. Pass an
   explicit `expires_delta` (a day, say): an app built from a test config does
   not load `Config`, so tokens get flask-jwt-extended's default 15-minute
   lifetime and a later run reports every stream as 401 — `streams_other` in
   the summary shows it.
3. gunicorn with the production flags from backend/Dockerfile:
   `gunicorn --bind 127.0.0.1:<port> --workers 1 --threads 64 --timeout 3600 app:run_app`
4. Run this script at 20 and 70 streams. A second run with a single token
   shows the per-user cap.

Output: one JSON line with the counts, then exit status
    0  every probe answered within --max-probe-ms (the API stayed responsive)
    1  at least one probe timed out or was slower than --max-probe-ms
"""
import argparse
import http.client
import json
import socket
import sys
import threading
import time
import urllib.parse


def open_stream(host, port, path, timeout):
    """Open one SSE request; return (socket, http_status or 0, bytes read so far)."""
    sock = socket.create_connection((host, port), timeout=timeout)
    request = (
        f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n"
        "Accept: text/event-stream\r\nCache-Control: no-cache\r\n\r\n"
    )
    sock.sendall(request.encode())
    buf = b""
    try:
        while b"\r\n" not in buf:
            chunk = sock.recv(1024)
            if not chunk:
                break
            buf += chunk
    except socket.timeout:
        return sock, 0, buf
    if not buf.startswith(b"HTTP/"):
        return sock, 0, buf
    try:
        return sock, int(buf.split(b" ", 2)[1]), buf
    except (IndexError, ValueError):
        return sock, 0, buf


def probe(host, port, path, timeout):
    """One ordinary request; return (latency_ms, status or 0 on timeout/error)."""
    started = time.monotonic()
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request("GET", path)
        status = conn.getresponse().status
    except (socket.timeout, OSError, http.client.HTTPException):
        status = 0
    finally:
        conn.close()
    return (time.monotonic() - started) * 1000.0, status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--tokens-file", required=True, help="one JWT per line; streams use them round-robin")
    parser.add_argument("--streams", type=int, required=True)
    parser.add_argument("--probes", type=int, default=10)
    parser.add_argument("--probe-path", default="/api/app/healthz")
    parser.add_argument("--stream-timeout", type=float, default=5.0, help="seconds to wait for a stream's status line")
    parser.add_argument("--probe-timeout", type=float, default=10.0)
    parser.add_argument("--max-probe-ms", type=float, default=2000.0)
    args = parser.parse_args(argv)

    url = urllib.parse.urlsplit(args.base_url)
    host, port = url.hostname, url.port or 80
    tokens = [line.strip() for line in open(args.tokens_file) if line.strip()]
    if not tokens:
        parser.error("tokens file is empty")

    results = [None] * args.streams
    sockets = []
    lock = threading.Lock()

    def worker(i):
        token = tokens[i % len(tokens)]
        path = f"/api/app/events?token={urllib.parse.quote(token)}"
        try:
            sock, status, first_bytes = open_stream(host, port, path, args.stream_timeout)
        except OSError:
            sock, status, first_bytes = None, -1, b""
        results[i] = status
        if sock is not None:
            with lock:
                sockets.append((sock, first_bytes))

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(args.streams)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    time.sleep(1.0)  # let the server settle before probing

    latencies, probe_statuses = [], []
    for _ in range(args.probes):
        ms, status = probe(host, port, args.probe_path, args.probe_timeout)
        latencies.append(ms)
        probe_statuses.append(status)

    # Streams the server ended (evicted by the per-user cap). An evicted
    # stream writes ": evicted" and finishes its response, but gunicorn keeps
    # the HTTP/1.1 connection open for reuse, so the marker is the signal;
    # EOF counts too, for a server that closes instead.
    ended = 0
    for sock, first_bytes in sockets:
        received = first_bytes
        closed = False
        try:
            sock.setblocking(False)
            while True:
                data = sock.recv(65536)
                if not data:
                    closed = True
                    break
                received += data
        except (BlockingIOError, InterruptedError):
            pass
        except OSError:
            closed = True
        if closed or b": evicted" in received:
            ended += 1

    for sock, _ in sockets:
        try:
            sock.close()
        except OSError:
            pass

    slow = [ms for ms, st in zip(latencies, probe_statuses) if st == 0 or ms > args.max_probe_ms]
    summary = {
        "streams_requested": args.streams,
        "streams_200": sum(1 for s in results if s == 200),
        "streams_503": sum(1 for s in results if s == 503),
        "streams_other": sorted({s for s in results if s not in (200, 503)}),
        "streams_no_answer": sum(1 for s in results if s == 0),
        "streams_ended_by_server": ended,
        "probes": args.probes,
        "probe_statuses": sorted(set(probe_statuses)),
        "probe_timeouts": sum(1 for s in probe_statuses if s == 0),
        "probe_max_ms": round(max(latencies), 1) if latencies else None,
        "probe_median_ms": round(sorted(latencies)[len(latencies) // 2], 1) if latencies else None,
        "responsive": not slow,
    }
    print(json.dumps(summary))
    return 0 if not slow else 1


if __name__ == "__main__":
    sys.exit(main())
