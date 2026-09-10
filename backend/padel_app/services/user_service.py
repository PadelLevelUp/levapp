import re

from flask import abort

from padel_app.models import User
from padel_app.sql_db import db
from padel_app.tools.request_adapter import JsonRequestAdapter


#: PAD-93 — privilege flags that must never be settable from an app-facing
#: JSON payload. `User.get_create_form()` declares them as Boolean fields, so
#: before the PAD-69 coercion fix a payload of `{"is_admin": true}` was
#: harmlessly coerced to False. Now that real booleans survive the form layer,
#: the very same payload would actually grant admin — and these services sit
#: behind the unauthenticated `POST /api/app/user`, `POST /api/app/user/<id>`
#: and `POST /api/app/activate/user/<id>` routes. Stripping them here keeps the
#: guard in the service layer, so it holds regardless of which route calls in.
#: Admin flags remain settable through the authenticated generic editor
#: (`modules/editor.py` / `modules/api.py`), which is admin-only by design.
PRIVILEGE_FIELDS = ("is_admin", "is_superadmin")


def _strip_privilege_fields(values):
    """Drop admin flags from form-derived values (see PRIVILEGE_FIELDS)."""
    for field in PRIVILEGE_FIELDS:
        values.pop(field, None)
    return values


def create_user_service(data):
    user = User()
    form = user.get_create_form()

    fake_request = JsonRequestAdapter(data, form)
    values = _strip_privilege_fields(form.set_values(fake_request))

    user.update_with_dict(values)
    user.create()
    return user


def edit_user_service(user_id, data):
    user = User.query.get_or_404(user_id)

    form = user.get_edit_form()
    fake_request = JsonRequestAdapter(data, form)
    values = _strip_privilege_fields(form.set_values(fake_request))

    user.update_with_dict(values)
    user.save()
    return user


#: auth.activate rule 7 (PAD-254): the ONLY columns an activation may write.
#: `status` is forced to `active` below; everything else in the body — status,
#: language, the privilege flags, any other column — is dropped.
ACTIVATION_FIELDS = ("name", "username", "email", "phone", "password")

#: auth.activate rule 4: what the activation form is allowed to see.
REGISTRATION_LOOKUP_FIELDS = ("id", "name", "username", "email", "phone")


def _user_for_activation(user_id, token):
    """The user behind an activation link, or 404.

    auth.activate rules 4-5 (B-034): a missing or wrong token is the same 404
    as an unknown id, so neither route can be used to enumerate accounts. The
    check lives here, in the service layer, so it holds whichever route calls.
    """
    from padel_app.tools.activation_token import activation_token_matches

    user = User.query.get(user_id) if str(user_id).isdigit() else None
    if user is None or not activation_token_matches(user, token):
        abort(404, "Activation link not found")
    return user


def registration_lookup_service(user_id, token):
    """What the activation form may prefill (auth.activate rule 4).

    While the account is inactive: the five form fields (with the generated
    placeholder username blanked, rule 10). Once it is not: only
    `{"isActive": true}`, enough for the "already registered" screen and no
    contact details.
    """
    from padel_app.tools.username_tools import is_placeholder_username

    user = _user_for_activation(user_id, token)
    if user.status != "inactive":
        return {"isActive": True}
    payload = {field: getattr(user, field) for field in REGISTRATION_LOOKUP_FIELDS}
    if is_placeholder_username(payload.get("username")):
        payload["username"] = None
    payload["isActive"] = False
    return payload


def activate_user_service(user_id, data, *, token):
    """Complete an inactive account from its activation link (auth.activate).

    404 without the right token (rule 5), 410 unless the account is still
    `inactive` (rule 6), and only `ACTIVATION_FIELDS` are written (rule 7).
    """
    user = _user_for_activation(user_id, token)
    if user.status != "inactive":
        abort(410, "Account already activated")

    form = user.get_edit_form()
    fake_request = JsonRequestAdapter(dict(data or {}), form)
    values = _strip_privilege_fields(form.set_values(fake_request))
    values = {key: value for key, value in values.items() if key in ACTIVATION_FIELDS}
    values["status"] = "active"

    user.update_with_dict(values)
    user.save()
    return user


# ── PAD-81: self-service profile editing ─────────────────────────────────────

#: Fields a user is allowed to change on their own account via PATCH /api/auth/me.
#: PAD-112 adds the four notification block preferences — they are per-user, so
#: they belong on this surface (open to both roles) and must not be swept up by
#: the coach-only role check (settings.role-scope rule 8).
OWN_PROFILE_FIELDS = (
    "name",
    "abbreviation",
    "email",
    "phone",
    "language",
    "blockAutoInvitations",
    "blockManualInvitations",
    "blockAllNotifications",
    "notificationBlockReason",
)

#: PAD-112: payload key → `users` column, for the three block toggles.
NOTIFICATION_BLOCK_FIELDS = {
    "blockAutoInvitations": "notif_block_auto_invitations",
    "blockManualInvitations": "notif_block_manual_invitations",
    "blockAllNotifications": "notif_block_all",
}

#: Free-text reason the student attaches to a block; deliberately coach-visible.
NOTIFICATION_BLOCK_REASON_MAX_LENGTH = 500

SUPPORTED_LANGUAGES = ("pt", "en")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

#: Matches the `users.abbreviation` column width used by the badge label.
ABBREVIATION_MAX_LENGTH = 4


class ProfileValidationError(Exception):
    """Raised when a self-service profile update is rejected.

    Carries the HTTP status the route should surface (400 for malformed input,
    409 for a conflict with another user's data).
    """

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def update_own_profile_service(user_id, data):
    """
    Apply a partial update to the signed-in user's own profile (PAD-81).

    Only the keys present in `data` are touched, so the frontend can PATCH a
    single field without clobbering the rest. Values are normalised (trimmed,
    email lowercased, abbreviation uppercased) and validated before the commit —
    previously `PATCH /api/auth/me` silently ignored everything except
    `language`, which is what made the UI report a save that never happened.
    """
    user = User.query.get_or_404(user_id)
    email_changed = False

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise ProfileValidationError("Name is required")
        user.name = name

    if "abbreviation" in data:
        abbreviation = (data.get("abbreviation") or "").strip().upper()
        user.abbreviation = abbreviation[:ABBREVIATION_MAX_LENGTH] or None

    if "email" in data:
        email = (data.get("email") or "").strip().lower()
        if not email:
            user.email = None
        else:
            if not _EMAIL_RE.match(email):
                raise ProfileValidationError("Invalid email address")
            taken = (
                User.query.filter(User.email == email, User.id != user.id).first()
            )
            if taken is not None:
                raise ProfileValidationError("Email already in use", status=409)
            # settings.profile rule 9: a NEW address must be verified again;
            # re-saving the one already stored (any case) changes nothing.
            email_changed = (user.email or "").lower() != email
            user.email = email

    if "phone" in data:
        phone = (data.get("phone") or "").strip()
        user.phone = phone or None

    if "language" in data:
        language = data.get("language")
        if language not in SUPPORTED_LANGUAGES:
            raise ProfileValidationError("Unsupported language")
        user.language = language

    # PAD-112: the three block toggles. Membership-checked, never truthiness-
    # checked — an explicit `false` MUST clear the flag. The PAD-93 backfill
    # migration exists because booleans elsewhere were being silently dropped on
    # a partial update; do not reintroduce that here.
    for key, column in NOTIFICATION_BLOCK_FIELDS.items():
        if key in data:
            setattr(user, column, _coerce_bool(data.get(key), key))

    if "notificationBlockReason" in data:
        reason = (data.get("notificationBlockReason") or "").strip()
        user.notif_block_reason = reason[:NOTIFICATION_BLOCK_REASON_MAX_LENGTH] or None

    db.session.commit()

    if email_changed:
        from padel_app.services.email_verification_service import begin_verification

        begin_verification(user)
    return user


def _coerce_bool(value, key):
    """Accept a real boolean, or the JSON-ish strings/ints a client may send.

    Rejects anything else rather than falling back to `bool(value)`, so a typo
    can never be read as "block everything".
    """
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str) and value.strip().lower() in ("true", "false"):
        return value.strip().lower() == "true"
    raise ProfileValidationError(f"'{key}' must be a boolean")
