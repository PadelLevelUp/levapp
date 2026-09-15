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


def declared_capabilities() -> frozenset:
    """The tokens the current request declares, lower-cased; empty outside a request."""
    if not has_request_context():
        return frozenset()
    raw = request.headers.get(HEADER, "")
    return frozenset(token.strip().lower() for token in raw.split(",") if token.strip())


def client_declares(capability: str) -> bool:
    """True only when the current request lists `capability`."""
    return capability.lower() in declared_capabilities()
