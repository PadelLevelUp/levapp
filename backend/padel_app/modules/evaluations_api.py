"""The v2 evaluation API (PAD-364): competencies, evaluation records, the player's
history, evolution and the class roster. All `/api/app`, JWT, coach-only.

These routes are what new clients use. The five endpoints App Store 1.0/1.1.0
call stay in `frontend_api.py`, frozen to legacy categories (R-047) — nothing here
changes them, and nothing there can reach a competency created here.

The bodies are read with `request.get_json()` and handed to
`evaluation_api_service` as they are: never through the shared form layer, which
reads a falsy value as "not sent" (B-136).
"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from werkzeug.exceptions import HTTPException

from padel_app.modules.frontend_api import require_coach
from padel_app.services import evaluation_api_service as service
from padel_app.services.evaluation_api_service import ApiError

bp = Blueprint("evaluations_api", __name__, url_prefix="/api/app")


@bp.errorhandler(ApiError)
def _api_error(exc):
    from padel_app.sql_db import db

    db.session.rollback()
    return jsonify({"error": exc.code}), exc.status


@bp.errorhandler(HTTPException)
def _json_http_error(exc):
    return jsonify({"error": exc.description}), exc.code


def _body():
    """The JSON body as sent: `{}` when there is none, 400 when it is not an object."""
    body = request.get_json(silent=True)
    if body is None:
        return {}
    if not isinstance(body, dict):
        raise ApiError(400, "body_invalid")
    return body


# ── competencies ────────────────────────────────────────────────────────────


@bp.get("/evaluation_competencies")
@jwt_required()
def evaluation_competencies():
    return jsonify(service.list_competencies(require_coach()))


@bp.post("/evaluation_competency")
@jwt_required()
def create_evaluation_competency():
    coach = require_coach()
    competency, created = service.create_competency(coach, _body())
    return jsonify(service.serialize_competency(competency)), 201 if created else 200


@bp.patch("/evaluation_competency/<int:category_id>")
@jwt_required()
def update_evaluation_competency(category_id):
    coach = require_coach()
    return jsonify(service.serialize_competency(service.update_competency(coach, category_id, _body())))


@bp.get("/evaluation_competency/<int:category_id>/impact")
@jwt_required()
def evaluation_competency_impact(category_id):
    from padel_app.services.coach_service import evaluation_category_impact

    coach = require_coach()
    return jsonify(evaluation_category_impact(service.own_competency(coach, category_id)))


@bp.delete("/evaluation_competency/<int:category_id>")
@jwt_required()
def delete_evaluation_competency(category_id):
    service.delete_competency(require_coach(), category_id)
    return jsonify({"status": "ok"})


# ── records ─────────────────────────────────────────────────────────────────


@bp.get("/player/<int:player_id>/evaluations")
@jwt_required()
def player_evaluations(player_id):
    return jsonify(service.player_evaluations(require_coach(), player_id))


@bp.get("/player/<int:player_id>/evaluations/evolution")
@jwt_required()
def player_evaluations_evolution(player_id):
    coach = require_coach()
    return jsonify(service.evolution(coach, player_id, request.args.get("categoryId")))


@bp.put("/evaluation_record")
@jwt_required()
def put_evaluation_record():
    coach = require_coach()
    record = service.put_record(coach, _body())
    if record is None:
        return jsonify({"deleted": True})
    return jsonify(service.serialize_record(record))


@bp.delete("/evaluation_record/<int:record_id>")
@jwt_required()
def delete_evaluation_record(record_id):
    service.delete_record(require_coach(), record_id)
    return jsonify({"status": "ok"})


# ── the class ───────────────────────────────────────────────────────────────


@bp.post("/class_instance/evaluations")
@jwt_required()
def class_instance_evaluations():
    """A read, POSTed like `/class_instance` (the occurrence travels in the query)."""
    coach = require_coach()
    ref = {"model": request.args.get("model"), "id": request.args.get("id"), "date": request.args.get("date")}
    return jsonify(service.class_evaluations(coach, ref))
