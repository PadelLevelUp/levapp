import random

from flask import Blueprint, flash, redirect, render_template, request, session, url_for
from flask_login import login_required, login_user, logout_user
from werkzeug.security import check_password_hash

from padel_app.models import User
from padel_app.tools import auth_tools, email_tools

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
        elif not check_password_hash(user.password, password):
            error = "Wrong password"

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


@bp.route("/forgot_password", methods=("GET", "POST"))
def forgot_password():
    if request.method == "POST":
        username = request.form["username"]
        error = None

        user = User.query.filter_by(username=username).first()

        if user is None:
            error = "Wrong user name"

        if error is None:

            email = user.email
            generated_code = random.randint(10000, 99999)

            user.generated_code = generated_code
            user.save()

            mail_body = render_template(
                "messages/forgot_password_email.html",
                user=user,
                generated_code=generated_code,
            )

            email_tools.send_email("Authentication code", [email], html=mail_body)

            return redirect(url_for("auth.verify_generated_code", user_id=user.id))

        flash(error)

    return render_template("auth/forgot_password.html")


@bp.route("/verify_generated_code/<user_id>", methods=("GET", "POST"))
def verify_generated_code(user_id):
    if request.method == "POST":
        generated_code = (
            int(request.form["generated_code"])
            if request.form["generated_code"]
            else None
        )
        user = User.query.filter_by(id=user_id).first()
        error = None

        if generated_code == user.generated_code:
            session.clear()
            session["user"] = user
            user.generated_code = None
            return redirect(url_for("main.index"))

        error = "Wrong code"
        flash(error)
    return render_template("auth/verify_generated_code.html", user_id=user_id)


@bp.route("/generate_new_code/<user_id>", methods=("GET", "POST"))
def generate_new_code(user_id):
    user = User.query.filter_by(id=user_id).first()
    email = user.email
    generated_code = random.randint(10000, 99999)
    user.generated_code = generated_code
    user.save()
    mail_body = render_template(
        "messages/forgot_password_email.html", user=user, generated_code=generated_code
    )
    email_tools.send_email("Código autenticação", [email], html=mail_body)
    return redirect(url_for("auth.verify_generated_code", user_id=user.id))


@bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("main.index"))
