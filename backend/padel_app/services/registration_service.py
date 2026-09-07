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

    def __init__(self, message, status=400, field=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.field = field


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

    Coach accounts start `pending` unless `COACH_APPROVAL_REQUIRED` is off.
    Any `club` key in the body is ignored: the club is chosen after approval.
    """
    role, name, username, email, password = validate_registration(data)
    _assert_unique(username, email)

    approval_required = bool(current_app.config.get("COACH_APPROVAL_REQUIRED", True))

    try:
        user = User(
            name=name,
            username=username,
            email=email,
            password=generate_password_hash(password),
            status="active",
        )
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

    if coach is not None and coach.approval_status == "pending":
        from padel_app.services.coach_approval_service import notify_admin_of_pending_coach

        notify_admin_of_pending_coach(coach)

    return user
