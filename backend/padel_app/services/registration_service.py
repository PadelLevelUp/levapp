"""Self-service registration (auth.register).

Anyone creates their own account from the login screen — no invite. A student
is usable immediately. A coach's account exists immediately too, but is held
at `approval_status = pending` until a LevApp superadmin approves them
(auth.coach-approval); the club step happens after that (clubs.join-request).

Everything here is one transaction: a failure after the User insert leaves no
orphan User, Coach or Player.
"""
import re

from flask import current_app
from werkzeug.security import generate_password_hash

from padel_app.models import Coach, Player, User
from padel_app.sql_db import db
from padel_app.tools.username_tools import PLACEHOLDER_USERNAME_PREFIX

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,80}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN_LENGTH = 8
ROLES = ("coach", "student")


class RegistrationError(Exception):
    """A rejected signup. `status` is the HTTP status the route surfaces;
    `field` names the offending input when there is one (409 username/email)."""

    def __init__(self, message, status=400, field=None, code=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field
        self.code = code


def _clean(value):
    return (value or "").strip() if isinstance(value, str) else ""


def validate_registration(data):
    """Return the normalised (role, name, username, email, password) or raise."""
    data = data or {}
    role = _clean(data.get("role")).lower()
    if role not in ROLES:
        raise RegistrationError("role must be 'coach' or 'student'", 400, "role")

    name = _clean(data.get("name"))
    if not name:
        raise RegistrationError("name is required", 400, "name")

    username = _clean(data.get("username"))
    if not USERNAME_RE.match(username):
        raise RegistrationError(
            "username must be 3-80 characters of letters, digits, '.', '_' or '-'",
            400,
            "username",
        )
    if username.startswith(PLACEHOLDER_USERNAME_PREFIX):
        raise RegistrationError("username is reserved", 400, "username")

    email = _clean(data.get("email")).lower()
    if not EMAIL_RE.match(email):
        raise RegistrationError("a valid email is required", 400, "email")

    password = data.get("password") or ""
    if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH:
        raise RegistrationError(
            f"password must be at least {PASSWORD_MIN_LENGTH} characters", 400, "password"
        )

    return role, name, username, email, password


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

#: auth.parental-consent rule 2: an absent field means an app build from
#: before PAD-198, which shows this text verbatim — so it says what to do.
_UPDATE_APP = {
    "birthDate": (
        "Atualiza a app para criares conta: a data de nascimento passou a ser obrigatória. "
        "/ Update the app to create an account: date of birth is now required."
    ),
    "country": (
        "Atualiza a app para criares conta: o país passou a ser obrigatório. "
        "/ Update the app to create an account: country is now required."
    ),
}


def _absent(value):
    return value is None or (isinstance(value, str) and not value.strip())


def validate_consent_fields(data, email, today=None):
    """auth.parental-consent rule 2. Returns (birth_date, country,
    guardian_email_or_None, is_minor) or raises RegistrationError with a code."""
    from datetime import date

    from padel_app.services.parental_consent_service import is_minor
    from padel_app.utils.dates import utcnow_naive

    data = data or {}
    today = today or utcnow_naive().date()

    raw = data.get("birthDate")
    if _absent(raw):
        raise RegistrationError(_UPDATE_APP["birthDate"], 400, "birthDate", code="BIRTH_DATE_REQUIRED")
    birth = None
    if isinstance(raw, str) and _DATE_RE.match(raw.strip()):
        try:
            birth = date.fromisoformat(raw.strip())
        except ValueError:
            birth = None
    if birth is None or birth > today or birth.year < today.year - 120:
        raise RegistrationError(
            "birthDate must be a real date (YYYY-MM-DD), not in the future", 400, "birthDate",
            code="INVALID_BIRTH_DATE",
        )

    raw_country = data.get("country")
    if _absent(raw_country):
        raise RegistrationError(_UPDATE_APP["country"], 400, "country", code="COUNTRY_REQUIRED")
    country = raw_country.strip().upper() if isinstance(raw_country, str) else ""
    if not re.fullmatch(r"[A-Z]{2}", country):
        raise RegistrationError("country must be a two-letter code", 400, "country", code="INVALID_COUNTRY")

    minor = is_minor(birth, country, today)
    guardian = None
    if minor:
        guardian = _clean(data.get("guardianEmail")).lower()
        if not guardian:
            raise RegistrationError(
                "a parent or guardian's email is required", 400, "guardianEmail",
                code="GUARDIAN_EMAIL_REQUIRED",
            )
        if not EMAIL_RE.match(guardian):
            raise RegistrationError(
                "the guardian's email is not valid", 400, "guardianEmail", code="INVALID_GUARDIAN_EMAIL",
            )
        if guardian == (email or "").lower():
            raise RegistrationError(
                "the guardian's email must be different from yours", 400, "guardianEmail",
                code="GUARDIAN_EMAIL_IS_OWN",
            )
    return birth, country, guardian, minor


def _assert_unique(username, email):
    if User.query.filter_by(username=username).first() is not None:
        raise RegistrationError("Username already taken", 409, "username")
    if (
        User.query.filter(db.func.lower(User.email) == email).first()
        is not None
    ):
        raise RegistrationError("Email already registered", 409, "email")


def register_user_service(data):
    """Create the account and return the active `User`.

    Coach accounts start `pending` unless the coach-approval gate is off
    (`app_settings.coach_approval_required`, else `COACH_APPROVAL_REQUIRED`).
    Any `club` key in the body is ignored: the club is chosen after approval.
    """
    role, name, username, email, password = validate_registration(data)
    birth_date, country, guardian_email, minor = validate_consent_fields(data, email)
    _assert_unique(username, email)

    # auth.coach-approval rule 9 (PAD-238/PAD-279): the app_settings row wins,
    # the env flag is the fallback.
    from padel_app.services.app_settings_service import coach_approval_required

    approval_required = coach_approval_required()

    try:
        user = User(
            name=name,
            username=username,
            email=email,
            password=generate_password_hash(password),
            status="active",
            birth_date=birth_date,
            country=country,
        )
        if minor:
            # auth.parental-consent rule 3: the account exists but nobody can
            # use it until a guardian consents; the email code waits too.
            user.guardian_consent_status = "pending"
            user.email_verification_required = True
        db.session.add(user)
        db.session.flush()

        coach = None
        if role == "student":
            db.session.add(Player(user_id=user.id))
        else:
            coach = Coach(
                user_id=user.id,
                approval_status="pending" if approval_required else "approved",
            )
            db.session.add(coach)
            db.session.flush()
            from padel_app.services.coach_service import create_default_levels_for_coach

            create_default_levels_for_coach(coach)

        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    if minor:
        # auth.parental-consent rule 3: mail the guardian instead; the first
        # verification code and a coach's admin notification wait for consent.
        from padel_app.services.parental_consent_service import start_consent

        start_consent(user, guardian_email)
        return user

    # auth.register rule 14 / auth.email-verification rule 6: the first code
    # goes out inside the signup request, best-effort. Runs before the admin
    # mail so the admin's "email verified: no" line is accurate either way.
    from padel_app.services.email_verification_service import begin_verification

    begin_verification(user)

    if coach is not None and coach.approval_status == "pending":
        from padel_app.services.coach_approval_service import notify_admin_of_pending_coach

        notify_admin_of_pending_coach(coach)

    return user
