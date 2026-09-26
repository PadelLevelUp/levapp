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


def declared_capabilities() -> frozenset:
    """The tokens the current request declares, lower-cased; empty outside a request."""
    if not has_request_context():
        return frozenset()
    raw = request.headers.get(HEADER, "")
    return frozenset(token.strip().lower() for token in raw.split(",") if token.strip())


def client_declares(capability: str) -> bool:
    """True only when the current request lists `capability`."""
    return capability.lower() in declared_capabilities()
