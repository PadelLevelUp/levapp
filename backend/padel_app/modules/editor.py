from flask import Blueprint, abort, redirect, render_template, request, url_for, jsonify
from flask_login import current_user

from padel_app.models import Backend_App, MODELS
from padel_app.tools.redaction import strip_redacted
from padel_app.tools.documentation_tools import build_models_doc

bp = Blueprint("editor", __name__, url_prefix="/editor")


@bp.before_request
def before_request():
    """settings.admin-editor rule 2 (PAD-267): superadmin only.

    A visitor who is not signed in goes to the legacy login; a signed-in
    non-superadmin (a coach, a student or a legacy ``is_admin``) gets 403
    rather than a redirect that hides the refusal.
    """
    if not current_user.is_authenticated:
        return redirect(url_for("auth.login", next=request.url))
    if not getattr(current_user, "is_superadmin", False):
        abort(403)
    return None


@bp.route("/", methods=("GET", "POST"))
def index():
    apps = Backend_App.query.all()
    return render_template("editor/index.html", page="editor_index", apps=apps)


@bp.route("/display/<model>", methods=("GET", "POST"))
def display_all(model):
    page_num = request.args.get("page", 1, type=int)
    per_page = 100

    page = f"editor_{model}_all"
    model = MODELS[model.lower()]
    empty_instance = model()
    data = empty_instance.get_display_all_data(page=page_num, per_page=per_page)

    return render_template("editor/display_all.html", page=page, data=data)


@bp.route("/display/<model>/<id>", methods=("GET", "POST"))
def display(model, id):
    page = f"editor_{model}"
    model = MODELS[model.lower()]
    instance = model.query.filter_by(id=id).first()
    data = instance.get_display_data()
    return render_template("editor/display.html", page=page, data=data)


@bp.route("/create/<model>", methods=("GET", "POST"))
def create(model):
    page = f"editor_{model}_create"
    model_name = model.lower()
    model = MODELS[model_name]
    empty_instance = model()
    form = empty_instance.get_create_form()
    if request.method == "POST":
        values = strip_redacted(model, form.set_values(request))
        empty_instance.update_with_dict(values)
        empty_instance.create()
        return redirect(url_for("editor.display_all", model=model_name))
    data = empty_instance.get_create_data(form)
    return render_template("editor/create.html", page=page, data=data)


@bp.route("/documentation", methods=("GET",))
def documentation():
    models_doc = build_models_doc(MODELS)

    if request.args.get("format") == "json":
        return jsonify({"models": models_doc})

    return render_template(
        "editor/documentation.html",
        page="editor_documentation",
        data={"models": models_doc},
    )
