"""admin.foundation rule 1 (PAD-531): verify a Google ID token.

One function, so tests stub `padel_app.services.admin.google_verifier.verify` and the rest of
the sign-in path (the five checks in auth_service) runs for real. The signature is checked with
`google.auth.jwt.decode` against Google's published certificates, which are fetched once and
kept for the max-age Google sends (hardening, 2026-10-07): a sign-in no longer costs a round
trip to Google, and a burst of sign-ins cannot fan out into a burst of fetches. `aud` is checked
by the library and again by the service, `iss` by the service.
"""
import re
import threading
import time

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs"
DEFAULT_MAX_AGE = 3600
_CERTS = {}
_LOCK = threading.Lock()


class GoogleTokenInvalid(Exception):
    """The credential did not verify (signature, expiry, audience, issuer or shape)."""


def _http_get(url, timeout):
    import requests

    return requests.get(url, timeout=timeout)


def _jwt_decode(token, certs, audience, clock_skew_in_seconds=0):
    from google.auth import jwt as google_jwt

    return google_jwt.decode(token, certs=certs, audience=audience, clock_skew_in_seconds=clock_skew_in_seconds)


def _max_age(headers):
    match = re.search(r"max-age=(\d+)", headers.get("Cache-Control", "") or "")
    return int(match.group(1)) if match else DEFAULT_MAX_AGE


def google_certs(now=None):
    """Google's signing certificates, cached until their max-age runs out."""
    now = time.time() if now is None else now
    with _LOCK:
        if _CERTS.get("expires", 0) > now:
            return _CERTS["certs"]
        response = _http_get(GOOGLE_CERTS_URL, timeout=5)
        if response.status_code != 200:
            raise GoogleTokenInvalid(f"could not fetch Google's certificates ({response.status_code})")
        certs = response.json()
        _CERTS.update(certs=certs, expires=now + _max_age(response.headers))
        return certs


def verify(credential, client_id):
    """Return the token's claims, or raise GoogleTokenInvalid."""
    try:
        return _jwt_decode(credential, google_certs(), client_id, clock_skew_in_seconds=10)
    except GoogleTokenInvalid:
        raise
    except Exception as exc:  # ValueError for every verification failure; be strict anyway
        raise GoogleTokenInvalid(str(exc)) from exc
