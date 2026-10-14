"""Unauthenticated routes for the public site (PAD-617)."""
from flask import Blueprint, jsonify, request

from padel_app.services.demo_request_service import DemoRequestError, submit
from padel_app.utils.rate_limit import client_ip, rate_limited

bp = Blueprint("public_api", __name__, url_prefix="/api/public")

#: The demo form is a few hundred bytes; anything far larger is refused before it is parsed.
MAX_DEMO_BODY_BYTES = 16 * 1024


@bp.route("/demo-request", methods=["POST"])
@rate_limited("demo")
def demo_request():
    """auth.landing-page rule 10: the site's contact form ("Pedir demonstração", "Falar
    connosco"), relayed to HubSpot."""
    if (request.content_length or 0) > MAX_DEMO_BODY_BYTES:
        return jsonify({"error": "BODY_TOO_LARGE", "code": "BODY_TOO_LARGE"}), 413
    try:
        submit(request.get_json(silent=True), client_ip())
    except DemoRequestError as err:
        body = {"error": err.code, "code": err.code}
        if err.field:
            body["field"] = err.field
        return jsonify(body), err.status
    return jsonify({"ok": True})
