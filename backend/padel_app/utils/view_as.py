"""admin.approvals-and-users rule 9 (PAD-532): the product backend under a "view as" token.

A staff operator opens a user's web app with a 30-minute product token carrying
`view_as = true` and `actor = <staff email>`. Under it (`gate()`, a global before_request):
- every method other than GET, HEAD, OPTIONS answers 403 VIEW_AS_READ_ONLY;
- every messaging read (conversations, messages, the live stream) answers 403 too: private
  messages are never shown;
- the request's session cannot commit: `commit` becomes `flush`, and the session is rolled back
  when the request ends, so a GET that writes as a side effect (lazy materialisation, stamps)
  leaves nothing behind and no after-commit action (live events) ever fires;
- the senders (mail, web push, Expo push, live events, CRM) return without sending
  (`suppressed()`), counted in SUPPRESSED_LAST_REQUEST for the tests;
- the silent token refresh is skipped (create_app's after_request).
"""
from flask import g, has_request_context, jsonify, request

VIEW_AS_CLAIM = "view_as"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MESSAGING_PREFIXES = ("/api/app/conversation", "/api/app/message", "/api/app/events")
SUPPRESSED_LAST_REQUEST = {}


def active():
    return has_request_context() and bool(g.get("view_as"))


def suppressed(channel):
    """True (and counted) when a sender must not send because this is a view-as request."""
    if not active():
        return False
    SUPPRESSED_LAST_REQUEST[channel] = SUPPRESSED_LAST_REQUEST.get(channel, 0) + 1
    return True


def _bearer():
    scheme, _, token = (request.headers.get("Authorization") or "").partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    if request.path.startswith("/api/app/events"):
        return request.args.get("token")
    return None


def gate():
    if request.path.startswith("/admin/api"):
        return None
    token = _bearer()
    if not token:
        return None
    from flask_jwt_extended import decode_token

    try:
        claims = decode_token(token)
    except Exception:
        return None  # an invalid token is the route's business, not ours
    if not claims.get(VIEW_AS_CLAIM):
        return None
    # #584 review: the view lasts only while its actor is still an operator. A revoked or changed
    # console role ends it on the next request, not 30 minutes later.
    from padel_app.models.admin_role import AdminRole

    actor = AdminRole.active_by_email(claims.get("actor"))
    if actor is None or actor.role != "operator":
        return jsonify({"error": "VIEW_AS_REVOKED"}), 401
    g.view_as = True
    g.view_as_actor = claims.get("actor")
    SUPPRESSED_LAST_REQUEST.clear()
    if request.method not in SAFE_METHODS or request.path.startswith(MESSAGING_PREFIXES):
        return jsonify({"error": "VIEW_AS_READ_ONLY"}), 403
    from padel_app.sql_db import db

    session = db.session()
    session.commit = session.flush  # this request's session only (scoped per app context)
    return None


def end(exc=None):
    if g.get("view_as"):
        from padel_app.sql_db import db

        db.session.rollback()
