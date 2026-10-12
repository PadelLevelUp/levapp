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
from padel_app.utils.dates import utcnow_naive

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,80}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN_LENGTH = 8
ROLES = ("coach", "student")


# PAD-485 (auth.register rule 19): the Terms version a sign-up accepts — the effective date the Terms
# page states (`frontend/apps/web/src/content/legal/index.ts` and the "Effective date:" line of
# `en/terms.md`, tied by test_pad485_terms_acceptance.py). Change them together when the Terms change.
TERMS_VERSION = "2026-10-13"
# The Privacy Policy's version, the same way (`index.ts` and `en/privacy.md`). Not merged with
# config.LEGAL_TERMS_VERSION (the retired guardian-consent record) on purpose; see auth.register rule 19.
PRIVACY_VERSION = "2026-10-10"


def validate_terms(data):
    """auth.register rule 19: a client declaring `terms-acceptance` must send `termsAccepted: true`
    (else 400 on `field: "terms"`); one that does not declare it registers as before. Returns
    whether an acceptance is recorded."""
    from padel_app.utils.client_capabilities import TERMS_ACCEPTANCE, client_declares

    if not client_declares(TERMS_ACCEPTANCE):
        return False
    if (data or {}).get("termsAccepted") is not True:
        raise RegistrationError(
            "É preciso aceitar os Termos e a Política de Privacidade. / You must accept the Terms and the Privacy Policy.",
            400, "terms", code="TERMS_REQUIRED",
        )
    return True


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

    email = normalised_email(data.get("email"))

    password = data.get("password") or ""
    if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH:
        raise RegistrationError(
            f"password must be at least {PASSWORD_MIN_LENGTH} characters", 400, "password"
        )

    return role, name, username, email, password


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

#: auth.register rule 18 (PAD-445, owner decision 2026-09-24): LevApp accepts adults only,
#: whatever the country's age of digital consent.
MINIMUM_SIGNUP_AGE = 18

#: Bilingual because an older app build shows the server's text verbatim; web and iOS map
#: the `UNDERAGE` code to their own localized copy.
_UNDERAGE_MESSAGE = (
    "Data de nascimento inválida. Esta app só aceita maiores de 18 anos. "
    "/ Invalid date of birth. This app only accepts people aged 18 or over."
)

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


#: PAD-604: the account-completion forms' (activation, both invitations) "update the app" text.
UPDATE_APP_COUNTRY_TO_COMPLETE = (
    "Atualiza a app para concluíres a conta: o país passou a ser obrigatório. "
    "/ Update the app to finish your account: country is now required."
)


#: auth.activate rule 13 (PAD-457): the activation form's own "update the app" text.
UPDATE_APP_TO_ACTIVATE = (
    "Atualiza a app para ativares a conta: a data de nascimento passou a ser obrigatória. "
    "/ Update the app to activate your account: date of birth is now required."
)


def age_on(birth, today):
    """Full years on `today` (a 29 February birth turns a year older on 1 March in a non-leap year)."""
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def validate_adult_birth_date(raw, today, *, update_app_message):
    """auth.register rule 18 / auth.activate rule 13: the one birth-date check both paths share.
    Returns the date, or raises RegistrationError with BIRTH_DATE_REQUIRED / INVALID_BIRTH_DATE /
    UNDERAGE on `birthDate`."""
    from datetime import date

    if _absent(raw):
        raise RegistrationError(update_app_message, 400, "birthDate", code="BIRTH_DATE_REQUIRED")
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
    if age_on(birth, today) < MINIMUM_SIGNUP_AGE:
        raise RegistrationError(_UNDERAGE_MESSAGE, 400, "birthDate", code="UNDERAGE")
    return birth


def _absent(value):
    return value is None or (isinstance(value, str) and not value.strip())


def validate_consent_fields(data, email, today=None):
    """auth.register rule 18: birth date and country, both required at sign-up.
    Returns (birth_date, country) or raises RegistrationError with a code."""
    data = data or {}
    today = today or utcnow_naive().date()

    # auth.register rule 18: before the country, so an under-18 is refused whatever else is sent.
    birth = validate_adult_birth_date(data.get("birthDate"), today, update_app_message=_UPDATE_APP["birthDate"])

    raw_country = data.get("country")
    if _absent(raw_country):
        raise RegistrationError(_UPDATE_APP["country"], 400, "country", code="COUNTRY_REQUIRED")
    return birth, _two_letter_country(raw_country)


def _two_letter_country(raw):
    """auth.register rule 18's country check: two letters, upper-cased, or 400 INVALID_COUNTRY."""
    country = raw.strip().upper() if isinstance(raw, str) else ""
    if not re.fullmatch(r"[A-Z]{2}", country):
        raise RegistrationError("country must be a two-letter code", 400, "country", code="INVALID_COUNTRY")
    return country


def validate_completion_country(data):
    """PAD-604 (auth.activate 13a, players.invite-completion 10a, clubs.coach-invitation 8a): the
    country on the three account-completion paths. A sent value is checked as sign-up checks it. An
    absent one is refused only for a client declaring `country-on-completion`; an older build
    completes without it. Returns the country, or None when a legacy build sent none."""
    from padel_app.utils.client_capabilities import COUNTRY_ON_COMPLETION, client_declares

    raw = (data or {}).get("country")
    if not _absent(raw):
        return _two_letter_country(raw)
    if client_declares(COUNTRY_ON_COMPLETION):
        raise RegistrationError(UPDATE_APP_COUNTRY_TO_COMPLETE, 400, "country", code="COUNTRY_REQUIRED")
    return None


def normalised_email(raw):
    """A valid address, lowercased, or a 400 on `email`. Shared by sign-up and the coach-invite
    accept (clubs.coach-invitation rule 9)."""
    email = _clean(raw).lower()
    if not EMAIL_RE.match(email):
        raise RegistrationError("a valid email is required", 400, "email")
    return email


def assert_email_free(email):
    """409 on `email` when an account already has it, ignoring case."""
    if User.query.filter(db.func.lower(User.email) == email).first() is not None:
        raise RegistrationError("Email already registered", 409, "email")


def _assert_unique(username, email):
    if User.query.filter_by(username=username).first() is not None:
        raise RegistrationError("Username already taken", 409, "username")
    assert_email_free(email)


def register_user_service(data, now=None):
    """Create the account and return the active `User`.

    Coach accounts start `pending` unless the coach-approval gate is off
    (`app_settings.coach_approval_required`, else `COACH_APPROVAL_REQUIRED`).
    Any `club` key in the body is ignored: the club is chosen after approval.
    `now` is the request's one instant (B-130): the age check is judged on
    it, so the caller can reuse the same value instead of a second clock read.
    """
    # B-130: one instant for the whole request.
    now = now or utcnow_naive()
    role, name, username, email, password = validate_registration(data)
    birth_date, country = validate_consent_fields(data, email, today=now.date())
    terms_accepted = validate_terms(data)
    _assert_unique(username, email)
    return _create_account(
        role=role, name=name, username=username, email=email,
        password_hash=generate_password_hash(password), birth_date=birth_date, country=country,
        terms_accepted=terms_accepted, now=now,
    )


def _create_account(*, role, name, username, email, password_hash, birth_date, country, terms_accepted,
                    now, identity=None):
    """Sign-up's one account-creation path (auth.register rules 12–19), shared with a social
    sign-up (auth.social-sign-in rule 4). `identity` ({provider, subject}) also writes the
    UserIdentity in the same transaction and counts the email as verified (the provider did it),
    so no code is sent."""
    # auth.coach-approval rule 9 (PAD-238/PAD-279): the app_settings row wins,
    # the env flag is the fallback.
    from padel_app.services.app_settings_service import coach_approval_required

    approval_required = coach_approval_required()

    # auth.register rule 12 (PAD-476, B-246): one transaction. Inside the unit the
    # default-levels helper flushes instead of committing; the unit commits once on
    # the way out and rolls back on any exception. Nothing with an outside effect
    # runs inside it: the code, the admin notice and the CRM sync come after.
    from padel_app.tools.unit_of_work import unit_of_work

    with unit_of_work():
        user = User(
            name=name,
            username=username,
            email=email,
            password=password_hash,
            status="active",
            birth_date=birth_date,
            country=country,
            terms_accepted_at=now if terms_accepted else None,
            terms_version=TERMS_VERSION if terms_accepted else None,
            privacy_version=PRIVACY_VERSION if terms_accepted else None,
        )
        if identity is not None:
            user.email_verification_required = False
            user.email_verified_at = now
        db.session.add(user)
        db.session.flush()

        if identity is not None:
            from padel_app.models import UserIdentity

            db.session.add(UserIdentity(
                user_id=user.id, provider=identity["provider"], subject=identity["subject"], email=email,
            ))

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

    if identity is None:
        # auth.register rule 14 / auth.email-verification rule 6: the first code
        # goes out inside the signup request, best-effort. Runs before the admin
        # mail so the admin's "email verified: no" line is accurate either way.
        from padel_app.services.email_verification_service import begin_verification

        begin_verification(user)

    if coach is not None and coach.approval_status == "pending":
        from padel_app.services.coach_approval_service import notify_admin_of_pending_coach

        notify_admin_of_pending_coach(coach)

    if coach is not None:
        # auth.coach-crm-sync (PAD-471): after the commit, off the request
        # thread; a HubSpot failure never reaches the caller.
        from padel_app.services.hubspot_sync import sync_coach_signup

        sync_coach_signup(user, coach)

    return user


def _username_for(name):
    """A free username from the first name plus four digits (auth.social-sign-in rule 4). Never
    from the email: usernames are searchable in messaging, and the address's local part is not
    something the person chose to publish."""
    import secrets
    import unicodedata

    first = (name or "").split()[0] if (name or "").split() else ""
    ascii_first = unicodedata.normalize("NFKD", first).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]", "", ascii_first.lower())[:20] or "user"
    if base.startswith(PLACEHOLDER_USERNAME_PREFIX):
        base = "u" + base
    for _ in range(50):
        candidate = f"{base}{secrets.randbelow(9000) + 1000}"
        if User.query.filter(db.func.lower(User.username) == candidate).first() is None:
            return candidate
    return f"{base}{secrets.token_hex(4)}"


def complete_social_signup(ticket, data, now=None):
    """auth.social-sign-in rule 4: the account for a verified provider identity, through sign-up's
    own checks (role, adults only, country, the Terms, coach approval). Raises
    SocialAuthError (401 ticket, 409 already completed) or RegistrationError."""
    from padel_app.models import UserIdentity
    from padel_app.services.social_auth_service import SocialAuthError, read_signup_ticket

    identity = read_signup_ticket(ticket)
    now = now or utcnow_naive()
    data = data or {}
    role = _clean(data.get("role")).lower()
    if role not in ROLES:
        raise RegistrationError("role must be 'coach' or 'student'", 400, "role")
    email = identity["email"]
    birth_date, country = validate_consent_fields(data, email, today=now.date())
    # Only new clients sign up with a provider, so the Terms are always required (no legacy path).
    if data.get("termsAccepted") is not True:
        raise RegistrationError(
            "É preciso aceitar os Termos e a Política de Privacidade. / You must accept the Terms and the Privacy Policy.",
            400, "terms", code="TERMS_REQUIRED",
        )
    terms_accepted = True
    if UserIdentity.query.filter_by(provider=identity["provider"], subject=identity["subject"]).first():
        raise SocialAuthError(409, "ALREADY_COMPLETED")
    assert_email_free(email)
    name = identity["name"] or email.split("@", 1)[0]
    from sqlalchemy.exc import IntegrityError

    try:
        return _create_account(
            role=role, name=name, username=_username_for(name), email=email, password_hash=None,
            birth_date=birth_date, country=country, terms_accepted=terms_accepted, now=now,
            identity={"provider": identity["provider"], "subject": identity["subject"]},
        )
    except IntegrityError:
        # A concurrent completion of the same ticket (or the same email) won between our checks
        # and the insert; the unit of work rolled back. The account exists: sign in instead.
        db.session.rollback()
        raise SocialAuthError(409, "ALREADY_COMPLETED") from None
