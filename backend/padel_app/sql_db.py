from flask.globals import app_ctx
from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy


def _app_ctx_id() -> int:
    """Scope ``db.session`` per app context, not per thread (B-068, compass R-007).

    Flask-SQLAlchemy 2.x keys the scoped session on the thread, so an
    ``app.app_context()`` pushed inside an active one tore down the OUTER
    context's session when it popped; a ``Query`` already bound to that session
    then ran on one nobody would ever close, and Postgres kept a backend idle in
    a transaction until the garbage collector released it. Keying on the context
    object — what Flask-SQLAlchemy 3 does — gives each context its own session,
    closed by its own teardown.
    """
    return id(app_ctx._get_current_object())


db = SQLAlchemy(session_options={"scopefunc": _app_ctx_id})
migrate = Migrate()


def init_db(app):
    db.init_app(app)
    migrate.init_app(app, db)
