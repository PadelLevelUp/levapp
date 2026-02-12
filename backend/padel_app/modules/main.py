from flask import Blueprint, url_for, redirect
from flask_jwt_extended import jwt_required


bp = Blueprint("main", __name__)


@bp.route("/", methods=("GET", "POST"))
def index():
    return redirect(url_for("editor.index"))
