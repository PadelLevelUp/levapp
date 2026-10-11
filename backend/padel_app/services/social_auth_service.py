"""auth.social-sign-in (PAD-618): sign up and sign in with Google or Apple.

`resolve(provider, id_token, nonce)` verifies the token (rule 1) and finds the account (rule 2):
a known identity, else an account with the same verified email (linked here), else none — then
the caller answers `needsProfile` with a signed ticket (`signup_ticket`) that
`complete_signup` (registration_service) turns into an account with sign-up's own checks.

The two verifiers are separate functions so tests replace them; everything else runs for real.
"""
import hashlib
import hmac

from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from padel_app.models import User, UserIdentity
from padel_app.sql_db import db

PROVIDERS = ("google", "apple")
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
TICKET_SALT = "auth.social-sign-in/signup-ticket"
TICKET_MAX_AGE_S = 15 * 60


class SocialAuthError(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status = status
        self.code = code


class ProviderTokenInvalid(Exception):
    """The ID token did not verify (signature, expiry, audience, issuer, nonce or shape)."""


class ProviderUnavailable(Exception):
    """The provider's keys could not be fetched (an outage, not a bad token)."""


# ── verifiers ──────────────────────────────────────────────────────────────────

def _real_verify_google(token, audiences):
    """Google: the cached-certificate verifier of admin.foundation rule 1, then iss and aud."""
    from padel_app.services.admin import google_verifier

    try:
        claims = google_verifier.verify(token, list(audiences))
    except google_verifier.GoogleTokenInvalid as exc:
        raise ProviderTokenInvalid(str(exc)) from exc
    if not isinstance(claims, dict) or claims.get("iss") not in GOOGLE_ISSUERS:
        raise ProviderTokenInvalid("issuer is not Google")
    if claims.get("aud") not in audiences:
        raise ProviderTokenInvalid("audience mismatch")
    return claims


_apple_jwks = None


def _real_verify_apple(token, audiences):
    """Apple: RS256 against Apple's published keys (PyJWT's cached JWKS client), iss and aud."""
    import jwt

    global _apple_jwks
    try:
        if _apple_jwks is None:
            _apple_jwks = jwt.PyJWKClient(APPLE_KEYS_URL, cache_keys=True, lifespan=3600, timeout=5)
        key = _apple_jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token, key.key, algorithms=["RS256"], audience=list(audiences), issuer=APPLE_ISSUER,
            leeway=10, options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise ProviderUnavailable(type(exc).__name__) from exc
    except Exception as exc:  # noqa: BLE001 — every other failure is an invalid token
        raise ProviderTokenInvalid(type(exc).__name__) from exc


_verify_google = _real_verify_google
_verify_apple = _real_verify_apple


def _client_ids(provider):
    ids = current_app.config.get("GOOGLE_CLIENT_IDS" if provider == "google" else "APPLE_CLIENT_IDS")
    return [i for i in (ids or []) if i]


def _verified_claims(provider, id_token, nonce):
    """Rule 1. Returns (subject, email or None, name). Raises SocialAuthError."""
    if provider not in PROVIDERS:
        raise SocialAuthError(400, "UNKNOWN_PROVIDER")
    audiences = _client_ids(provider)
    if not audiences:
        raise SocialAuthError(503, "PROVIDER_NOT_CONFIGURED")
    if not isinstance(id_token, str) or not id_token:
        raise SocialAuthError(401, "INVALID_PROVIDER_TOKEN")
    verify = _verify_google if provider == "google" else _verify_apple
    try:
        claims = verify(id_token, audiences)
    except ProviderTokenInvalid:
        raise SocialAuthError(401, "INVALID_PROVIDER_TOKEN") from None
    except ProviderUnavailable:
        raise SocialAuthError(503, "PROVIDER_UNAVAILABLE") from None
    if provider == "apple":
        # Replay guard: the token carries the SHA-256 of the nonce the app generated.
        expected = hashlib.sha256(str(nonce or "").encode()).hexdigest()
        if not nonce or not hmac.compare_digest(str(claims.get("nonce") or ""), expected):
            raise SocialAuthError(401, "INVALID_PROVIDER_TOKEN")
    subject = str(claims.get("sub") or "").strip()
    if not subject:
        raise SocialAuthError(401, "INVALID_PROVIDER_TOKEN")
    # The email counts only when the provider verified it (Apple sends "true", Google True);
    # an unverified address can neither link nor create an account (rule 2). Apple sends the email
    # only on the first authorization, so a returning Apple user has none: the identity finds them.
    verified = claims.get("email_verified") in (True, "true")
    email = (str(claims.get("email") or "").strip().lower() or None) if verified else None
    name = str(claims.get("name") or "").strip()
    return subject, email, name


# ── who it is ─────────────────────────────────────────────────────────────────

def resolve(provider, id_token, nonce=None):
    """Rules 1–2. Returns ("user", User) or ("new", {name, email, ticket})."""
    subject, email, name = _verified_claims(provider, id_token, nonce)
    identity = UserIdentity.query.filter_by(provider=provider, subject=subject).first()
    if identity is not None:
        return "user", identity.user
    if not email:
        # No identity and no verified email: nobody can be found, linked or created.
        raise SocialAuthError(401, "INVALID_PROVIDER_TOKEN")
    # Deterministic when legacy rows share an address up to case: the oldest account.
    user = User.query.filter(db.func.lower(User.email) == email).order_by(User.id).first()
    if user is None:
        return "new", {"name": name, "email": email, "ticket": signup_ticket(provider, subject, email, name)}
    if user.status != "active":
        # Answered as login answers it (rule 3); never linked.
        return "user", user
    if user.email_verified_at is None:
        # B-567 (rule 2b): the LevApp account never proved it owns this address — it may be
        # someone who pre-registered the victim's email by password. Linking would hand the
        # provider's owner an account whose password a stranger knows. Never link it.
        raise SocialAuthError(409, "ACCOUNT_EMAIL_UNVERIFIED")
    db.session.add(UserIdentity(user_id=user.id, provider=provider, subject=subject, email=email))
    db.session.commit()
    return "user", user


# ── the signup ticket (rule 4) ─────────────────────────────────────────────────

def _serializer():
    return URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"], salt=TICKET_SALT)


# The ticket reuses JWT_SECRET_KEY with its own salt: itsdangerous derives a distinct key from the
# salt and the format differs, so an access token can never pass as a ticket (nor the reverse).
# Rotating JWT_SECRET_KEY only invalidates tickets still in flight.
def signup_ticket(provider, subject, email, name):
    return _serializer().dumps({"p": provider, "s": subject, "e": email, "n": name})


def read_signup_ticket(ticket):
    """The verified identity a ticket carries, or SocialAuthError(401)."""
    if not isinstance(ticket, str) or not ticket:
        raise SocialAuthError(401, "INVALID_SIGNUP_TICKET")
    try:
        data = _serializer().loads(ticket, max_age=TICKET_MAX_AGE_S)
    except (BadSignature, SignatureExpired):
        raise SocialAuthError(401, "INVALID_SIGNUP_TICKET") from None
    if not isinstance(data, dict) or data.get("p") not in PROVIDERS or not data.get("s") or not data.get("e"):
        raise SocialAuthError(401, "INVALID_SIGNUP_TICKET")
    return {"provider": data["p"], "subject": data["s"], "email": data["e"], "name": data.get("n") or ""}
