from flask import Blueprint, url_for, redirect


bp = Blueprint("main", __name__)


@bp.route("/", methods=("GET", "POST"))
def index():
    return redirect(url_for("editor.index"))
