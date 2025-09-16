from flask import Blueprint, redirect, render_template, request, url_for, jsonify

from padel_app.models import Backend_App, MODELS
from padel_app.tools import auth_tools
from padel_app.tools.documentation_tools import build_models_doc

bp = Blueprint("editor", __name__, url_prefix="/editor")


@bp.before_request
@auth_tools.admin_required
def before_request():
    pass


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
        values = form.set_values(request)
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
