from flask import Blueprint, jsonify


bp = Blueprint("main", __name__)


@bp.route("/", methods=("GET", "POST"))
def index():
    return jsonify({"service": "levapp-api"})
