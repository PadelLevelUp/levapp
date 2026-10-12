"""What the calling client says it understands (PAD-352).

eligibility.open-spot-visibility rule 12: a request lists its capabilities in
the `X-LevApp-Capabilities` header, a comma-separated list of tokens
(case-insensitive, surrounding whitespace ignored). The server withholds a
feature from a client that doesn't list it, because the App Store builds that
predate the feature can't change and would draw it wrongly. So everything here
fails closed: no request, no header or an empty header all mean "declares
nothing".
"""
from flask import has_request_context, request

HEADER = "X-LevApp-Capabilities"

# Rule 12. Retire with the rule once no App Store build older than the first
# declaring one is in use.
OPEN_SPOTS = "open-spots"

# PAD-364 (evaluations.sharing, Q24): declared by the web and iOS shells from
# slice 2 on; NOTHING consumes it yet. Its one job is to gate server-driven
# surfaces an App Store 1.0/1.1.0 build would mis-render — the student dashboard
# block of a shared evaluation. It does NOT guard the legacy evaluation
# endpoints: those are frozen by endpoint (R-047), whatever a client declares.
# Retire once no App Store build older than the first declaring one is in use.
EVALUATIONS = "evaluations"

# PAD-429 (eligibility.open-spot-visibility rule 12): the class payload's `openSpotsSource` may be
# `type` (a private class hidden by default, rule 3a). A build that predates it looks the source
# label up by key and would show a missing key, so it is sent `coach` instead; the resolved value
# is the same. Retire once no App Store build older than the first declaring one is in use.
CLASS_TYPE_DEFAULTS = "class-type-defaults"

# PAD-477 (clubs.coach-invitation rule 9): the coach-invite accept form sends an `email`. A client
# that declares this and sends none is refused (400 EMAIL_REQUIRED); one that does not (iOS 1.2.0
# (27) and 1.2.1 (28)) keeps the pre-PAD-477 accept without an email. Retire, with that legacy path,
# once no App Store build older than the first declaring one is in use.
COACH_INVITE_EMAIL = "coach-invite-email"

# PAD-485 (auth.register rule 19): the sign-up form has a required "I accept the Terms" checkbox and
# sends `termsAccepted`. A client that declares this and does not send `true` is refused (400
# TERMS_REQUIRED); one that does not (iOS 1.2.0 (27) and 1.2.1 (28)) registers as before, with no
# acceptance recorded. Retire once no App Store build older than the first declaring one is in use.
TERMS_ACCEPTANCE = "terms-acceptance"
# PAD-611 (calendar.view rule 22): a student's calendar also carries the classes they are invited
# to and the ones they wait for, each flagged by `studentRelation`. App Store 1.3.0 and older would
# draw them as the student's own bookings, so they reach only a client that declares this.
# Retire once no App Store build older than the first declaring one is in use.
STUDENT_RELATIONS = "student-relations"

# PAD-604 (auth.activate 13a, players.invite-completion 10a, clubs.coach-invitation 8a): the three
# account-completion forms send a `country`. A client that declares this and sends none is refused
# (400 COUNTRY_REQUIRED); one that does not (iOS up to 1.3.0 (32)) completes without one and the
# country stays null (PAD-630 asks later). Retire once no App Store build older than the first
# declaring one is in use.
COUNTRY_ON_COMPLETION = "country-on-completion"
# PAD-637 (auth.register rule 19b; clubs.coach-invitation 8b, players.invite-completion 10b,
# auth.activate 13b): the three account-completion forms carry the Terms checkbox and send
# `termsAccepted`. A client that declares this and does not send `true` is refused (400
# TERMS_REQUIRED); one that does not (App Store builds up to 1.3.x) completes as before with no
# record (auth.legal-catch-up asks later). Not `terms-acceptance`: every current build declares that
# on every request. Retire once no App Store build older than the first declaring one is in use.
TERMS_ON_COMPLETION = "terms-on-completion"
# PAD-642 (players.create rule 10, import.confirm rule 9): creating or importing players carries the
# coach's `confirmsAdults: true`. A client that declares this and does not send it is refused (400
# ADULTS_CONFIRMATION_REQUIRED); one that does not creates as before. Retire like the others.
ADULT_ROSTER_CONFIRMATION = "adult-roster-confirmation"


# PAD-533 (admin.clubs-and-switches rule 6): every capability the server knows, with its kind.
# "feature": switching it off hides a feature from every client. "compat": switching it off sends
# every client down the old-client path (the legacy shape, or the legacy, looser request check).
# A capability constant above that is missing here fails test_every_capability_is_registered.
CAPABILITIES = {
    OPEN_SPOTS: "feature",
    STUDENT_RELATIONS: "feature",
    EVALUATIONS: "feature",
    CLASS_TYPE_DEFAULTS: "compat",
    COACH_INVITE_EMAIL: "compat",
    TERMS_ACCEPTANCE: "compat",
    COUNTRY_ON_COMPLETION: "compat",
    TERMS_ON_COMPLETION: "compat",
    ADULT_ROSTER_CONFIRMATION: "compat",
}

# Rule 5: the kill-switches, read through a per-worker cache of at most 30 seconds.
SWITCH_CACHE_SECONDS = 30
_switch_cache = {"value": None, "read_at": None}


def reset_switch_cache():
    """Forget the cached switches (a write in this worker, or a test)."""
    _switch_cache["value"] = None
    _switch_cache["read_at"] = None


def switched_off() -> dict:
    """``{capability: {"off": True, "reason": ...}}`` for every capability switched off. Read from
    ``app_settings`` at most every 30 s per worker; outside an app context nothing is switched off."""
    from flask import has_app_context

    if not has_app_context():
        return {}
    from padel_app.utils import dates

    now = dates.utcnow_naive()
    read_at = _switch_cache["read_at"]
    if read_at is None or (now - read_at).total_seconds() >= SWITCH_CACHE_SECONDS or now < read_at:
        from padel_app.services.app_settings_service import capability_kill_switches

        _switch_cache["value"] = capability_kill_switches()
        _switch_cache["read_at"] = now
    return _switch_cache["value"] or {}


def declared_capabilities() -> frozenset:
    """The tokens the current request declares, lower-cased; empty outside a request."""
    if not has_request_context():
        return frozenset()
    raw = request.headers.get(HEADER, "")
    return frozenset(token.strip().lower() for token in raw.split(",") if token.strip())


def client_declares(capability: str) -> bool:
    """True only when the current request lists `capability` and no kill-switch has turned it off
    (PAD-533 rule 5): a switched-off capability is withheld exactly as from a client that never
    declared it — the fail-closed path every feature already has."""
    name = capability.lower()
    if name not in declared_capabilities():
        return False
    return not (switched_off().get(name) or {}).get("off")
