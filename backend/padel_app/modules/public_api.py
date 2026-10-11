"""Unauthenticated routes for the public site (PAD-617)."""
from flask import Blueprint, jsonify, request

from padel_app.services.demo_request_service import DemoRequestError, submit
from padel_app.utils.rate_limit import client_ip, rate_limited

bp = Blueprint("public_api", __name__, url_prefix="/api/public")


@bp.route("/demo-request", methods=["POST"])
@rate_limited("demo")
def demo_request():
    """auth.landing-page rule 10: the "Pedir demonstração" form, relayed to HubSpot."""
    try:
        submit(request.get_json(silent=True), client_ip())
    except DemoRequestError as err:
        body = {"error": err.code, "code": err.code}
        if err.field:
            body["field"] = err.field
        return jsonify(body), err.status
    return jsonify({"ok": True})
