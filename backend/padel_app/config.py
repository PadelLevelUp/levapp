import logging
import os
import sys
from datetime import timedelta

from padel_app.roles import process_role

logger = logging.getLogger(__name__)

# Hosts that are known to hold real (remote) data. Used to fail closed: a
# non-production process must never silently migrate one of these unless it
# opted in explicitly.
PRODUCTION_POSTGRES_HOSTS = frozenset(
    {
        "34.77.91.59",  # production Cloud SQL public IP
        "34.78.247.45",  # shared dev/staging VM
        "10.132.0.2",  # the VM's internal IP (how the apps reached Postgres before PAD-292)
        "postgres",  # the Postgres container's name on the VM's levelup_net network (PAD-292, B-069)
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
#: PAD-697 (R6): the events role's streams are greenlets, not API threads, so its cap is
#: memory-bound; a role-aware default, never an env override, keeps PAD-702's "default is the
#: deployed value" class intact.
DEFAULT_SSE_MAX_STREAMS_EVENTS = 1000
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

    total_default = DEFAULT_SSE_MAX_STREAMS_EVENTS if process_role(environ) == "events" else DEFAULT_SSE_MAX_STREAMS
    return (
        read("SSE_MAX_STREAMS", total_default),
        read("SSE_MAX_STREAMS_PER_USER", DEFAULT_SSE_MAX_STREAMS_PER_USER),
    )


def sse_broker(value) -> str:
    """``SSE_BROKER`` (messaging.sse-realtime rule 20): ``postgres`` or, for anything else, ``memory``."""
    name = str(value or "").strip().lower()
    return name if name in ("memory", "postgres") else "memory"


def auth_rate_limit_store(value) -> str:
    """``AUTH_RATE_LIMIT_STORE`` (auth.login rule 7, PAD-693): ``database`` or, for anything else, ``memory``."""
    name = str(value or "").strip().lower()
    return name if name in ("memory", "database") else "memory"


def realtime_retention_minutes(value) -> int:
    """``REALTIME_EVENTS_RETENTION_MINUTES`` (rule 24): a positive int, else the default 10."""
    try:
        minutes = int(str(value).strip())
    except (TypeError, ValueError):
        return 10
    return minutes if minutes > 0 else 10


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


# admin.foundation (PAD-531). Test apps load their config from a mapping, so the
# services read these with these defaults rather than trusting the class.
ADMIN_STAFF_DOMAIN_DEFAULT = "levapp.app"
ADMIN_JWT_AUDIENCE_DEFAULT = "levapp-admin"
ADMIN_TOKEN_EXPIRES_DEFAULT = timedelta(hours=12)


def finance_max_bytes(raw):
    """admin.finance rule 7: a positive integer, else 1 GiB."""
    try:
        value = int((raw or "").strip())
    except ValueError:
        return 1024 ** 3
    return value if value > 0 else 1024 ** 3


def parse_admin_hosts(raw):
    """``ADMIN_HOSTS`` as a tuple of lower-cased hostnames (rule 11); blanks dropped."""
    return tuple(item.strip().lower() for item in (raw or "").split(",") if item.strip())


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
    # PAD-734: seconds an SMTP connect, read or write may take before the send fails (and is
    # recorded on engine health). Flask-Mail itself has no timeout.
    MAIL_TIMEOUT = float(os.getenv("MAIL_TIMEOUT", "10") or 10)
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
    # auth.login rule 7 (PAD-693): `memory` (one budget per process) or `database` (one shared budget).
    AUTH_RATE_LIMIT_STORE = auth_rate_limit_store(os.getenv("AUTH_RATE_LIMIT_STORE"))
    AUTH_RATE_LIMIT_LOGIN = os.getenv("AUTH_RATE_LIMIT_LOGIN", "20/60")
    AUTH_RATE_LIMIT_REGISTER = os.getenv("AUTH_RATE_LIMIT_REGISTER", "5/600")
    AUTH_RATE_LIMIT_RECOVERY = os.getenv("AUTH_RATE_LIMIT_RECOVERY", "5/600")
    # auth.email-verification rule 13 (PAD-269): send and confirm share one bucket.
    AUTH_RATE_LIMIT_VERIFICATION = os.getenv("AUTH_RATE_LIMIT_VERIFICATION", "20/600")
    # admin.foundation hardening (PAD-531): the staff console's Google sign-in, per IP.
    AUTH_RATE_LIMIT_ADMIN_SIGN_IN = os.getenv("AUTH_RATE_LIMIT_ADMIN_SIGN_IN", "10/60")
    # auth.social-sign-in rule 1 (PAD-618): the ID-token audiences each provider accepts. Unset →
    # that provider answers 503 and the clients show no button (ships dark).
    GOOGLE_CLIENT_IDS = [
        v.strip() for v in (os.getenv("GOOGLE_WEB_CLIENT_ID", ""), os.getenv("GOOGLE_IOS_CLIENT_ID", "")) if v.strip()
    ]
    APPLE_CLIENT_IDS = [v.strip() for v in os.getenv("APPLE_CLIENT_IDS", "").split(",") if v.strip()]
    # auth.landing-page rule 10 (PAD-617): the site's demo request, per IP.
    AUTH_RATE_LIMIT_DEMO = os.getenv("AUTH_RATE_LIMIT_DEMO", "5/3600")
    # PAD-617: the HubSpot form the demo request is forwarded to (the GitHub repo variable
    # HUBSPOT_DEMO_FORM_ID / _STAGING). Unset → the endpoint answers 503 and the site offers email.
    HUBSPOT_DEMO_FORM_ID = os.getenv("HUBSPOT_DEMO_FORM_ID", "")
    # PAD-650: HubSpot's "Marketing Information" subscription type id (repo variable
    # HUBSPOT_MARKETING_SUBSCRIPTION_ID / _STAGING). Unset → no marketing consent box or entry.
    HUBSPOT_MARKETING_SUBSCRIPTION_ID = os.getenv("HUBSPOT_MARKETING_SUBSCRIPTION_ID", "")
    # players.join-token rule 3 (PAD-212): when set, the coach's join link is
    # returned as an absolute URL (e.g. https://levapp.app); otherwise clients
    # build it from their own origin, as they do for player invite links.
    PUBLIC_WEB_ORIGIN = os.getenv("PUBLIC_WEB_ORIGIN") or None

    # messaging.sse-realtime rules 11-12 (PAD-277): SSE stream caps.
    SSE_MAX_STREAMS, SSE_MAX_STREAMS_PER_USER = sse_stream_limits()
    SSE_KEEPALIVE_SECONDS = sse_keepalive_seconds()
    # messaging.sse-realtime rules 20-24 (PAD-692): `memory` (one process) or `postgres`
    # (LISTEN/NOTIFY). The prod switch is a PR to the tracked env template, after staging.
    SSE_BROKER = sse_broker(os.getenv("SSE_BROKER"))
    REALTIME_EVENTS_RETENTION_MINUTES = realtime_retention_minutes(
        os.getenv("REALTIME_EVENTS_RETENTION_MINUTES")
    )

    # admin.foundation (PAD-531): the staff console. The Google OAuth client id
    # is public (the browser needs it too) and lives in the tracked env
    # templates; empty means "sign-in not configured" (rule 13), never a crash.
    # ADMIN_HOSTS is the only hosts the /admin/api blueprint answers on (rule
    # 11); production refuses to start without it.
    ADMIN_GOOGLE_CLIENT_ID = (os.getenv("ADMIN_GOOGLE_CLIENT_ID") or "").strip()
    ADMIN_HOSTS = parse_admin_hosts(os.getenv("ADMIN_HOSTS", ""))
    # admin.approvals-and-users rules 3 and 10 (PAD-532): where the staff console lives, for the
    # pending-coach mail and push. Empty = the bare path (local development).
    ADMIN_CONSOLE_URL = (os.getenv("ADMIN_CONSOLE_URL") or "").strip()
    # admin.finance rules 7 and 11 (PAD-742): the Google Cloud billing export table
    # (project.dataset.table). Empty = the import is "not configured". Set from a deploy variable,
    # never a tracked value (R-036). The byte cap bounds every query; invalid → the 1 GiB default.
    FINANCE_GCP_BILLING_TABLE = (os.getenv("FINANCE_GCP_BILLING_TABLE") or "").strip()
    FINANCE_GCP_MAX_BYTES = finance_max_bytes(os.getenv("FINANCE_GCP_MAX_BYTES"))
    # admin.work-dashboard rule 5 (PAD-555): server-side only, never sent to a client or logged.
    # Unset LINEAR_API_KEY → tickets "not configured"; unset WORK_GITHUB_REPO (the deploys set it to
    # the repository) → GitHub "not configured", so tests and local runs never call GitHub.
    # WORK_GITHUB_TOKEN is optional (the repository is public); Actions reserves GITHUB_* secrets.
    LINEAR_API_KEY = (os.getenv("LINEAR_API_KEY") or "").strip()
    WORK_GITHUB_REPO = (os.getenv("WORK_GITHUB_REPO") or "").strip()
    WORK_GITHUB_TOKEN = (os.getenv("WORK_GITHUB_TOKEN") or "").strip()
    # admin.work-dashboard rule 9 (PAD-646): the App Store Connect API key for TestFlight builds.
    # All four or nothing ("not configured"); ASC_PRIVATE_KEY is the .p8 PEM (a secret, never logged).
    ASC_KEY_ID = (os.getenv("ASC_KEY_ID") or "").strip()
    ASC_ISSUER_ID = (os.getenv("ASC_ISSUER_ID") or "").strip()
    ASC_PRIVATE_KEY = os.getenv("ASC_PRIVATE_KEY") or ""
    ASC_APP_ID = (os.getenv("ASC_APP_ID") or "").strip()
    # admin.engine-health rule 5 (PAD-534): the other environment's admin API and the token this
    # console presents to it; and the token this environment accepts from the other one. All three
    # unset (the default) means the console shows the other environment as "not configured".
    ADMIN_PEER_URL = os.getenv("ADMIN_PEER_URL", "")
    ADMIN_PEER_TOKEN = os.getenv("ADMIN_PEER_TOKEN", "")
    ADMIN_PEER_INBOUND_TOKEN = os.getenv("ADMIN_PEER_INBOUND_TOKEN", "")
    ADMIN_STAFF_DOMAIN = ADMIN_STAFF_DOMAIN_DEFAULT
    ADMIN_JWT_AUDIENCE = ADMIN_JWT_AUDIENCE_DEFAULT
    # Rule 3 (owner decision 2026-10-07): 12 hours, no silent refresh.
    ADMIN_TOKEN_EXPIRES = ADMIN_TOKEN_EXPIRES_DEFAULT

    # No server-side sessions (auth.login rule 7a, PAD-693): every client authenticates with a bearer
    # JWT and nothing reads Flask's `session`, so Flask-Session and its per-process temp dir are gone.

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
    DEFAULT_POSTGRES_HOST = LOCAL_POSTGRES_HOST


class DevConfigProdDB(Config):
    """Explicit — and only — opt-in for pointing local code at production."""

    DEBUG = True
    DEFAULT_POSTGRES_HOST = "34.77.91.59"


class ProdConfig(Config):
    DEBUG = False
    DEFAULT_POSTGRES_HOST = "10.132.0.2"


# __init_subclass__ covers the subclasses; the base class has to resolve itself.
Config.refresh_database_settings()


DEV_SECRET_FALLBACKS = frozenset({"dev-secret-key", "dev-jwt-secret", ""})

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
    # admin.foundation rule 13 (PAD-531): the admin blueprint must know its
    # hosts. The Google client id is deliberately NOT asserted here — an empty
    # value degrades to "not configured" instead of crash-looping a deploy.
    if missing:
        raise RuntimeError(
            "Refusing to start with FLASK_ENV=production: "
            + ", ".join(missing)
            + " unset or equal to a development fallback. Set real values in the deploy environment."
        )
    if not (environ.get("ADMIN_HOSTS") or "").strip():
        raise RuntimeError(
            "Refusing to start with FLASK_ENV=production: ADMIN_HOSTS is unset. The tracked "
            "backend/.env.<environment> template names the console host (admin.foundation rule 13)."
        )


def get_config_class(env=None, environ=None):
    """Config class for a FLASK_ENV value (anything non-production is dev)."""
    env = env if env is not None else os.getenv("FLASK_ENV", "development")
    if env == "production":
        assert_production_secrets(environ)
        return ProdConfig
    return DevConfig


#: PAD-614 (delivery.api-host rule 3): origins every environment allows (local dev, the VM's
#: legacy address). Each environment adds its public web origins with CORS_ALLOWED_ORIGINS.
DEFAULT_CORS_ORIGINS = ("http://localhost:8080", "http://34.78.247.45")


def cors_allowed_origins(environ=None):
    """The defaults plus the comma-separated CORS_ALLOWED_ORIGINS (blank entries and a trailing
    slash ignored, order kept, no duplicates). No wildcard: only listed origins may call /api."""
    env = os.environ if environ is None else environ
    extra = [o.strip().rstrip("/") for o in str(env.get("CORS_ALLOWED_ORIGINS", "")).split(",")]
    origins = []
    for origin in (*DEFAULT_CORS_ORIGINS, *extra):
        if origin and origin != "*" and origin not in origins:
            origins.append(origin)
    return origins
