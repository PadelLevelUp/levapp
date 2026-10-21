import os
from datetime import datetime, timezone, timedelta
from tempfile import mkdtemp

from flask import Flask
from flask_cors import CORS
from flask_assets import Bundle, Environment
from flask_session import Session
from flask_jwt_extended import JWTManager, get_jwt, get_jwt_identity, create_access_token
from .auth import register_jwt_handlers

from . import cli, mail, modules, sql_db


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    from .config import cors_allowed_origins

    CORS(
        app,
        # PAD-614 (delivery.api-host rule 3): the web apps may call the API on its own host
        # (api.levapp.app). The allowed origins are the defaults plus CORS_ALLOWED_ORIGINS.
        resources={r"/api/*": {"origins": cors_allowed_origins()}},
        supports_credentials=False,
        max_age=600,
        # PAD-352: the shells declare what they understand; a cross-origin
        # client (local dev) must be allowed to send it.
        allow_headers=["Content-Type", "Authorization", "X-LevApp-Capabilities"],
        expose_headers=["X-New-Token"],
    )

    # Load config
    env = os.getenv("FLASK_ENV", "development")
    if test_config:
        app.config.from_mapping(test_config)
    else:
        from .config import (
            assert_safe_migration_target,
            get_config_class,
            is_migration_invocation,
        )

        config_cls = get_config_class(env)
        # Resolve the database settings from the *selected* config class, and
        # from the environment as it stands at startup, before copying them in
        # — the URI must follow the class's host override (PAD-95).
        config_cls.refresh_database_settings()
        app.config.from_object(config_cls)
        # Never log the URI itself — it carries the password.
        app.logger.info(
            "Config %s (FLASK_ENV=%s) using database %s@%s:%s/%s",
            config_cls.__name__,
            env,
            config_cls.POSTGRES_USER,
            config_cls.POSTGRES_HOST,
            config_cls.POSTGRES_PORT,
            config_cls.POSTGRES_DB,
        )

        # Fail closed before anything opens a connection: never migrate a
        # production database from a non-production process (PAD-95).
        if is_migration_invocation():
            assert_safe_migration_target(
                config_cls.POSTGRES_HOST, config_cls.POSTGRES_PORT, env
            )

    # Ensure responses aren't cached + refresh nearly-expired JWT tokens
    @app.after_request
    def after_request(response):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Expires"] = 0
        response.headers["Pragma"] = "no-cache"

        try:
            from flask import g as _g, request as _request

            from padel_app.models import TokenBlocklist
            from padel_app.utils.tokens import issue_access_token, session_over, session_started_at

            # auth.token-refresh rule 5 (PAD-269): never hand a fresh token back
            # on the way out.
            if _request.endpoint in ("auth_api.logout", "auth_api.delete_me"):
                return response
            jwt_data = get_jwt()

            def _token_not_blocklisted(jti):
                # auth.logout rule 5 (PAD-591): reuse the answer the auth loader stored on `g`
                # for this request; query only when it left none for this jti.
                answer = _g.__dict__.get("_token_revoked", {}).get(jti)
                if answer is not None:
                    return not answer
                return TokenBlocklist.query.filter_by(jti=jti).first() is None

            # admin.approvals-and-users rule 9: a view-as token is never refreshed.
            if jwt_data.get("view_as"):
                return response
            exp_timestamp = jwt_data.get("exp")
            if exp_timestamp:
                remaining = (
                    datetime.fromtimestamp(exp_timestamp, timezone.utc)
                    - datetime.now(timezone.utc)
                )
                if (
                    remaining < timedelta(days=15)
                    # Rule 6: a session past its cap is not extended.
                    and not session_over(jwt_data)
                    and _token_not_blocklisted(jwt_data.get("jti"))
                ):
                    # Rule 6: the refreshed token keeps the session's login moment.
                    new_token = issue_access_token(
                        get_jwt_identity(), auth_time=session_started_at(jwt_data)
                    )
                    response.headers["X-New-Token"] = new_token
        except Exception:
            pass

        return response

    with app.app_context():
        modules.startup.add_to_session()

    app.config["SESSION_FILE_DIR"] = mkdtemp()
    Session(app)

    jwt = JWTManager(app)
    register_jwt_handlers(jwt)
    app.jwt = jwt

    mail.mail.init_app(app)

    from flask_babel import Babel
    babel = Babel(app)
    app.babel = babel

    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    modules.register_blueprints(app)

    # Assets
    assets = Environment(app)
    scss_bundle = Bundle(
        "styles/scss/main.scss",
        filters="pyscss",
        depends="styles/scss/*.scss",
        output="styles/styles.css",
    )
    assets.register("scss", scss_bundle)

    scss_bundle_backend = Bundle(
        "styles/scss/main_backend.scss",
        filters="pyscss",
        depends="styles/scss/*.scss",
        output="styles/styles_backend.css",
    )
    assets.register("scss_backend", scss_bundle_backend)

    sql_db.init_db(app)
    cli.register_cli(app)

    from .scheduler import init_scheduler
    init_scheduler(app, test_config=test_config)

    # admin.approvals-and-users rule 9 (PAD-532): the product under a view-as token.
    from padel_app.utils import view_as as _view_as

    app.before_request(_view_as.gate)

    @app.teardown_request
    def _end_view_as(exception=None):
        _view_as.end(exception)

    @app.teardown_appcontext
    def shutdown_session(exception=None):
        sql_db.db.session.remove()

    return app
