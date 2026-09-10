import logging
import os
import sys
from datetime import timedelta

logger = logging.getLogger(__name__)

# Hosts that are known to hold real (remote) data. Used to fail closed: a
# non-production process must never silently migrate one of these unless it
# opted in explicitly.
PRODUCTION_POSTGRES_HOSTS = frozenset(
    {
        "34.77.91.59",  # production Cloud SQL public IP
        "34.78.247.45",  # shared dev/staging VM
        "10.132.0.2",  # production Cloud SQL private IP
    }
)

# An unset POSTGRES_HOST must fail closed to the local machine, never fall
# through to a remote database (PAD-95).
LOCAL_POSTGRES_HOST = "localhost"

# Spellings of "this machine" that a tunnel endpoint can legitimately use.
LOCAL_POSTGRES_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

# Postgres is no longer reachable from the internet (B-048), so the shared
# database is reached by forwarding it to a local port. That makes a remote
# database look like `localhost`, which would silently disarm the host-based
# guard below — the very check that stops a workstation migrating real data.
# Reserving a port that no local Postgres uses keeps the two distinguishable.
# Locally 5432 is the multi-tenant server (levelup_test, levelup_qa) and 5433 is
# the dev database, so the tunnel takes 5434 (see backend/CLAUDE.md).
TUNNELLED_REMOTE_PORTS = frozenset({"5434"})


def build_database_uri(user, password, host, port, database):
    """Build a SQLAlchemy Postgres URI from its parts."""
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def is_production_host(host):
    """True when ``host`` is one of the known production/remote databases."""
    return host in PRODUCTION_POSTGRES_HOSTS


def is_production_target(host, port=None):
    """True when (host, port) reaches real data, tunnels included.

    The host alone is no longer sufficient: a forwarded port makes a remote
    database answer on ``localhost``. A local host on a reserved tunnel port is
    therefore treated as production (see ``TUNNELLED_REMOTE_PORTS``).
    """
    if is_production_host(host):
        return True
    return host in LOCAL_POSTGRES_HOSTS and str(port) in TUNNELLED_REMOTE_PORTS


def is_migration_invocation(argv=None):
    """True when this process was started as a ``flask db …`` command.

    The migration guard has to fire during ``create_app`` — by the time
    Alembic's ``env.py`` runs, the scheduler's job store has already opened a
    connection to whatever host was configured.
    """
    argv = sys.argv if argv is None else argv
    args = [a for a in argv[1:] if not a.startswith("-")]
    return "db" in args


def assert_safe_migration_target(host, port=None, env=None):
    """Refuse to run migrations against a production target outside production.

    Set ``ALLOW_PRODUCTION_MIGRATIONS=1`` to override deliberately (e.g. a
    one-off manual migration run from a workstation). ``port`` is what
    distinguishes a tunnelled remote database from a genuinely local one; when
    it is omitted the check falls back to the host alone.
    """
    env = env if env is not None else os.getenv("FLASK_ENV", "development")

    if not is_production_target(host, port) or env == "production":
        return

    if os.getenv("ALLOW_PRODUCTION_MIGRATIONS") == "1":
        logger.warning(
            "Running migrations against production host %s with FLASK_ENV=%s "
            "(allowed by ALLOW_PRODUCTION_MIGRATIONS=1)",
            host,
            env,
        )
        return

    raise RuntimeError(
        f"Refusing to run migrations against production database host {host} "
        f"with FLASK_ENV={env!r}. Set FLASK_ENV=production for a real "
        "deployment, or ALLOW_PRODUCTION_MIGRATIONS=1 to override deliberately."
    )


#: messaging.sse-realtime rules 11-14 (PAD-277): one gunicorn worker, 64
#: threads, and every open SSE stream holds one thread. 40 streams leaves 24
#: threads for ordinary API requests; 4 per user covers a phone plus a few tabs
#: once each tab/app shares one connection (past it, the user's OLDEST stream
#: is evicted). The keep-alive is how a vanished client is noticed.
DEFAULT_SSE_MAX_STREAMS = 40
DEFAULT_SSE_MAX_STREAMS_PER_USER = 4
DEFAULT_SSE_KEEPALIVE_SECONDS = 5


def sse_stream_limits(environ=None):
    """``(total, per_user)`` SSE stream caps from ``SSE_MAX_STREAMS`` and
    ``SSE_MAX_STREAMS_PER_USER``. A missing, non-numeric or non-positive value
    falls back to its default: a typo must neither disable the cap nor shut
    the stream to everyone."""
    environ = os.environ if environ is None else environ

    def read(name, default):
        try:
            value = int(str(environ.get(name, "")).strip())
        except ValueError:
            return default
        return value if value > 0 else default

    return (
        read("SSE_MAX_STREAMS", DEFAULT_SSE_MAX_STREAMS),
        read("SSE_MAX_STREAMS_PER_USER", DEFAULT_SSE_MAX_STREAMS_PER_USER),
    )


def sse_keepalive_seconds(environ=None):
    """Seconds between SSE keep-alive comments (``SSE_KEEPALIVE_SECONDS``,
    default 5). A missing, non-numeric or non-positive value falls back to the
    default."""
    environ = os.environ if environ is None else environ
    try:
        value = int(str(environ.get("SSE_KEEPALIVE_SECONDS", "")).strip())
    except ValueError:
        return DEFAULT_SSE_KEEPALIVE_SECONDS
    return value if value > 0 else DEFAULT_SSE_KEEPALIVE_SECONDS


class Config:
    """Base config (shared defaults).

    The database URI is resolved *per config class* instead of being
    interpolated in this class body — an f-string here would freeze the base
    class's own host, so a subclass overriding it could never affect the
    connection string it inherits (PAD-95).
    """

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    TEMPLATES_AUTO_RELOAD = True
    # Pre-ping validates each connection before use — ensures stale connections
    # (e.g. after the test DB is dropped and recreated) are replaced automatically.
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # Database.
    # DEFAULT_POSTGRES_HOST is the host used when POSTGRES_HOST is unset.
    # Subclasses override it and the resolved URI follows (__init_subclass__).
    DEFAULT_POSTGRES_HOST = LOCAL_POSTGRES_HOST

    POSTGRES_USER = os.getenv("POSTGRES_USER", "padel_app_user")
    POSTGRES_PW = os.getenv("POSTGRES_PW")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "padel_app")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")

    # Signing secrets. The deploy injects FLASK_SECRET_KEY (accepted as an alias
    # of SECRET_KEY). The dev fallbacks below are for local development only:
    # get_config_class() refuses to hand out ProdConfig while either secret is
    # unset, so production can never sign sessions or JWTs with them (B-003).
    SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("FLASK_SECRET_KEY") or "dev-secret-key"
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or "dev-jwt-secret"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=30)
    # R-009 / PAD-269: the Authorization header everywhere. The `?token=` query
    # string is enabled on the SSE route alone (`@jwt_required(locations=
    # ["query_string"])` on /api/app/events), because EventSource cannot set
    # headers; enabling it globally put tokens in every access log.
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_QUERY_STRING_NAME = "token"

    # settings.admin-editor rule 1 (PAD-267): whether the generic editor exists.
    # Subclasses set the default; EDITOR_ENABLED in the environment overrides it
    # (create_app reads it at startup).
    EDITOR_ENABLED_DEFAULT = False

    # auth.token-refresh rule 6: a session ends this many days after its login,
    # however often its token is silently refreshed.
    JWT_ABSOLUTE_SESSION_DAYS = int(os.getenv("JWT_ABSOLUTE_SESSION_DAYS", "90"))
    JWT_COOKIE_CSRF_PROTECT = False

    # Email
    MAIL_SERVER = "smtp.gmail.com"
    MAIL_PORT = 465
    MAIL_USE_SSL = True
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
    # From address; defaults to the login when unset (see tools/email_tools._sender).
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER", "")
    # Recipient guard (auth.email-verification rule 12). Comma-separated exact
    # addresses and/or `@domain` suffixes; a message to anyone else is dropped
    # and logged. Empty (prod) allows everyone. Staging holds a copy of prod's
    # users, so this is what lets it have a real sender without ever mailing
    # a real coach.
    MAIL_ALLOWED_RECIPIENTS = tuple(
        item.strip().lower()
        for item in os.getenv("MAIL_ALLOWED_RECIPIENTS", "").split(",")
        if item.strip()
    )

    # auth.coach-approval: a self-registered coach waits for a superadmin's
    # approval before anything club-scoped opens up. Set to "0"/"false" to
    # switch the gate off — new coaches are then approved at signup; no data
    # change is needed either way (decision 2026-09-06, item 7).
    COACH_APPROVAL_REQUIRED = os.getenv("COACH_APPROVAL_REQUIRED", "1").strip().lower() not in (
        "0", "false", "no", "off", ""
    )
    # auth.email-verification (PAD-234): a self-registered user must type back
    # a 6-digit code mailed to them before the app opens. Set to "0"/"false"
    # where no mail can be sent (staging) — accounts are then treated as
    # verified at signup and the code screen never shows.
    EMAIL_VERIFICATION_REQUIRED = os.getenv("EMAIL_VERIFICATION_REQUIRED", "1").strip().lower() not in (
        "0", "false", "no", "off", ""
    )
    # Where to email "a coach is waiting for approval". Unset → no email, the
    # Settings → Admin badge is the only signal.
    ADMIN_NOTIFY_EMAIL = os.getenv("ADMIN_NOTIFY_EMAIL") or None

    # PAD-228: per-IP sliding-window throttle on the public auth routes
    # (auth.login rule 7, auth.register rule 15, auth.password-recovery rule
    # 10). "count/seconds"; "0" switches one scope off, AUTH_RATE_LIMIT_ENABLED=0
    # switches them all off (the E2E backends do, so a suite that signs in a
    # hundred times from 127.0.0.1 is not throttled).
    AUTH_RATE_LIMIT_ENABLED = os.getenv("AUTH_RATE_LIMIT_ENABLED", "1").strip().lower() not in (
        "0", "false", "no", "off", ""
    )
    AUTH_RATE_LIMIT_LOGIN = os.getenv("AUTH_RATE_LIMIT_LOGIN", "20/60")
    AUTH_RATE_LIMIT_REGISTER = os.getenv("AUTH_RATE_LIMIT_REGISTER", "5/600")
    AUTH_RATE_LIMIT_RECOVERY = os.getenv("AUTH_RATE_LIMIT_RECOVERY", "5/600")
    # auth.parental-consent (PAD-198): the age of digital consent for a country
    # with no row in `digital_consent_ages` (the GDPR default), and the legal
    # documents' version recorded with every guardian consent.
    DIGITAL_CONSENT_DEFAULT_AGE = int(os.getenv("DIGITAL_CONSENT_DEFAULT_AGE", "16"))
    LEGAL_TERMS_VERSION = os.getenv("LEGAL_TERMS_VERSION", "2026-09-06")
    # players.join-token rule 3 (PAD-212): when set, the coach's join link is
    # returned as an absolute URL (e.g. https://levapp.app); otherwise clients
    # build it from their own origin, as they do for player invite links.
    PUBLIC_WEB_ORIGIN = os.getenv("PUBLIC_WEB_ORIGIN") or None

    # messaging.sse-realtime rules 11-12 (PAD-277): SSE stream caps.
    SSE_MAX_STREAMS, SSE_MAX_STREAMS_PER_USER = sse_stream_limits()
    SSE_KEEPALIVE_SECONDS = sse_keepalive_seconds()

    # Sessions
    SESSION_PERMANENT = False
    SESSION_TYPE = "filesystem"

    # i18n / localization (default + fallback locale is Portuguese)
    BABEL_DEFAULT_LOCALE = "pt"
    BABEL_DEFAULT_TIMEZONE = "UTC"
    LANGUAGES = ["pt", "en"]

    @classmethod
    def resolve_postgres_host(cls):
        """Host for this config: POSTGRES_HOST, else this class's default."""
        return os.getenv("POSTGRES_HOST") or cls.DEFAULT_POSTGRES_HOST

    @classmethod
    def resolve_database_uri(cls):
        """Build the database URI from the environment at call time."""
        return build_database_uri(
            user=os.getenv("POSTGRES_USER", "padel_app_user"),
            password=os.getenv("POSTGRES_PW"),
            host=cls.resolve_postgres_host(),
            port=os.getenv("POSTGRES_PORT", "5432"),
            database=os.getenv("POSTGRES_DB", "padel_app"),
        )

    @classmethod
    def refresh_database_settings(cls):
        """Recompute the class-level database attributes from the environment.

        ``Flask.config.from_object`` only copies plain uppercase *attributes*
        (``dir()`` skips descriptors defined on a metaclass), so the resolved
        values have to exist as real class attributes.
        """
        cls.POSTGRES_USER = os.getenv("POSTGRES_USER", "padel_app_user")
        cls.POSTGRES_PW = os.getenv("POSTGRES_PW")
        cls.POSTGRES_DB = os.getenv("POSTGRES_DB", "padel_app")
        cls.POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
        cls.POSTGRES_HOST = cls.resolve_postgres_host()
        cls.SQLALCHEMY_DATABASE_URI = cls.resolve_database_uri()

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.refresh_database_settings()


class DevConfig(Config):
    DEBUG = True
    EDITOR_ENABLED_DEFAULT = True
    DEFAULT_POSTGRES_HOST = LOCAL_POSTGRES_HOST


class DevConfigProdDB(Config):
    """Explicit — and only — opt-in for pointing local code at production."""

    DEBUG = True
    DEFAULT_POSTGRES_HOST = "34.77.91.59"


class ProdConfig(Config):
    DEBUG = False
    # Off unless the deploy sets EDITOR_ENABLED=1 (staging does; production must not).
    EDITOR_ENABLED_DEFAULT = False
    DEFAULT_POSTGRES_HOST = "10.132.0.2"


# __init_subclass__ covers the subclasses; the base class has to resolve itself.
Config.refresh_database_settings()


DEV_SECRET_FALLBACKS = frozenset({"dev-secret-key", "dev-jwt-secret", ""})

_TRUTHY = frozenset({"1", "true", "yes", "on"})


def editor_enabled_from_env(environ=None, *, default):
    """settings.admin-editor rule 1: EDITOR_ENABLED from the environment, or ``default``.

    Unset or blank keeps the config class's default (on in development, off in
    production); any other value is on only when it reads as true.
    """
    environ = os.environ if environ is None else environ
    raw = (environ.get("EDITOR_ENABLED") or "").strip()
    if not raw:
        return default
    return raw.lower() in _TRUTHY


def assert_production_secrets(environ=None):
    """Refuse to run production with unset or dev-fallback signing secrets.

    Checked at config-selection time so the failure is a clear startup error
    rather than a live deployment silently signing tokens with a value that is
    committed to the repository (B-003).
    """
    environ = os.environ if environ is None else environ
    secret = environ.get("SECRET_KEY") or environ.get("FLASK_SECRET_KEY") or ""
    jwt = environ.get("JWT_SECRET_KEY") or ""
    missing = [name for name, value in (("SECRET_KEY/FLASK_SECRET_KEY", secret), ("JWT_SECRET_KEY", jwt))
               if value in DEV_SECRET_FALLBACKS]
    if missing:
        raise RuntimeError(
            "Refusing to start with FLASK_ENV=production: "
            + ", ".join(missing)
            + " unset or equal to a development fallback. Set real values in the deploy environment."
        )


def get_config_class(env=None, environ=None):
    """Config class for a FLASK_ENV value (anything non-production is dev)."""
    env = env if env is not None else os.getenv("FLASK_ENV", "development")
    if env == "production":
        assert_production_secrets(environ)
        return ProdConfig
    return DevConfig
