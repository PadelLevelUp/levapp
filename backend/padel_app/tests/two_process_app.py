"""One app process for the two-process harness (PAD-692, PAD-693).

Run as ``python -m padel_app.tests.two_process_app <port>`` with ``HARNESS_DATABASE_URI`` set. It
serves the real app (threaded, like gunicorn's threads) plus one harness-only route,
``POST /__harness/publish`` (``{"event": {...}, "user_ids": [...]}``), which calls
``realtime.publish`` in THIS process. The route is registered here, never by the app.

The broker and the limiter store come from ``SSE_BROKER`` / ``AUTH_RATE_LIMIT_STORE`` in the
environment, as in production. Logs go to stderr at INFO, where the harness waits for
``realtime listener: LISTEN ready`` — a line the listener writes only after LISTEN returned.
"""
import logging
import os
import sys

from flask import Blueprint, jsonify, request
from werkzeug.serving import make_server

from padel_app import create_app, realtime
from padel_app.sql_db import init_db

JWT_SECRET = "two-process-harness-secret"
READY_LINE = "HARNESS SERVING"


def build_app():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "SQLALCHEMY_DATABASE_URI": os.environ["HARNESS_DATABASE_URI"],
        "JWT_SECRET_KEY": JWT_SECRET,
        "JWT_QUERY_STRING_NAME": "token",
        "SSE_BROKER": os.environ.get("SSE_BROKER", "memory"),
        "AUTH_RATE_LIMIT_STORE": os.environ.get("AUTH_RATE_LIMIT_STORE", "memory"),
        "AUTH_RATE_LIMIT_LOGIN": os.environ.get("AUTH_RATE_LIMIT_LOGIN", "20/60"),
        "SSE_KEEPALIVE_SECONDS": 1,
        "ADMIN_HOSTS": ("admin.localhost",),
    })
    with app.app_context():
        init_db(app)

    harness = Blueprint("two_process_harness", __name__)

    @harness.post("/__harness/publish")
    def publish():
        data = request.get_json()
        realtime.publish(data["event"], data["user_ids"])
        return jsonify({"ok": True})

    app.register_blueprint(harness)
    return app


def main():
    logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(name)s %(message)s")
    port = int(sys.argv[1])
    server = make_server("127.0.0.1", port, build_app(), threaded=True)
    print(f"{READY_LINE} {port}", file=sys.stderr, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
