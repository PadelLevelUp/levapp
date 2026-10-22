"""gunicorn settings for the events role under gevent (PAD-697, delivery.events-role).

Loaded by scripts/serve.sh as a plain FILE (`--config /app/gunicorn_events.conf.py`), not as
`python:padel_app.…`: importing anything under `padel_app` here would load the app's network stack
(ssl, urllib3, jwt, aiohttp) in the arbiter before the worker monkey-patches, which gevent warns
leads to incorrect behaviour. Nothing is imported at module level. gunicorn's gevent worker
monkey-patches the process; psycopg2 is a C extension the patch cannot reach, so without psycogreen
every query (the listener's fetch, the JWT blocklist lookup on each stream handshake) would block
the whole hub. `post_fork` runs in the new worker before it loads the app, so the wait callback is in
place before the first connection.
"""


def post_fork(server, worker):
    from psycogreen.gevent import patch_psycopg

    patch_psycopg()
