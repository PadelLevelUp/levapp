from flask import Blueprint, flash, redirect, render_template, request, session, url_for
from flask_login import login_required, login_user, logout_user
from werkzeug.security import check_password_hash

from padel_app.models import User
from padel_app.tools import auth_tools

bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/", methods=("GET", "POST"))
def index():
    return render_template("index.html")


@bp.route("/register", methods=("GET", "POST"))
def register():
    return render_template("auth/register.html")


@bp.route("/login", methods=("GET", "POST"))
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        error = None
        user = User.query.filter_by(username=username).first()

        if user is None:
            error = "Wrong username"
        elif not user.password or not check_password_hash(user.password, password):
            error = "Wrong password"
        elif user.status == "disabled":
            # auth.login rule 12 (B-053): no session for any disabled account,
            # rejected coaches included (this route has no re-application flow).
            flash("This account is disabled")
            return render_template("auth/login.html"), 401

        if error is None:
            login_user(user)

            next_page = request.args.get("next")
            if not next_page or not auth_tools.is_safe_url(next_page):
                next_page = url_for("main.index")

            session["user"] = user

            if username == "admin" or user.is_admin:
                session["admin_logged"] = True

            return redirect(next_page)

        flash(error)

    return render_template("auth/login.html")


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("main.index"))
