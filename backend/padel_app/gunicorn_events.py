"""gunicorn settings for the events role under gevent (PAD-697, delivery.events-role).

Loaded with `--config python:padel_app.gunicorn_events` by scripts/serve.sh. gunicorn's gevent worker
monkey-patches the process; psycopg2 is a C extension the patch cannot reach, so without psycogreen
every query (the listener's fetch, the JWT blocklist lookup on each stream handshake) would block
the whole hub. `post_fork` runs in the new worker before it loads the app, so the wait callback is in
place before the first connection.
"""


def post_fork(server, worker):
    from psycogreen.gevent import patch_psycopg

    patch_psycopg()
