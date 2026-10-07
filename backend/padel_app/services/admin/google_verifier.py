"""admin.foundation rule 1 (PAD-531): verify a Google ID token.

One function, so tests stub `padel_app.services.admin.google_verifier.verify` and the rest of
the sign-in path (the five checks in auth_service) runs for real. `google-auth` checks the
signature against Google's published keys, the expiry, and that `aud` matches `client_id`; the
service re-checks `aud` and `iss` itself (coordinator decision 2026-10-07: the checks live in our
code, not only in the library or in the console's "Internal" setting).
"""


class GoogleTokenInvalid(Exception):
    """The credential did not verify (signature, expiry, audience, issuer or shape)."""


def verify(credential, client_id):
    """Return the token's claims, or raise GoogleTokenInvalid."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        return id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except Exception as exc:  # ValueError for every verification failure; be strict anyway
        raise GoogleTokenInvalid(str(exc)) from exc
