from flask import Blueprint, abort, jsonify, redirect, render_template, request, url_for
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from flask_login import current_user

from padel_app.model import Image
from padel_app.models import MODELS, User
from padel_app.tools.redaction import redacted_columns, strip_redacted

bp = Blueprint("api", __name__, url_prefix="/api")


# ---------------------------------------------------------------------------
# Authentication / authorization (PAD-88)
# ---------------------------------------------------------------------------
# This blueprint is the generic model-CRUD backend for the legacy Jinja admin
# editor (`/editor`, guarded by `auth_tools.admin_required`). Every route here
# operates on arbitrary entries of `padel_app.models.MODELS` with no service
# layer, no ownership scoping and no business validation, so it must never be
# reachable by anyone who is not already an administrator.
#
# Until PAD-88 the blueprint had no guard at all: an anonymous caller could
# create, edit, delete, dump and CSV-export every model in the app.
#
# Two credentials are accepted, one per real client:
#   * a Flask-Login session  — the legacy Jinja editor pages and their JS;
#   * a JWT bearer token     — parity with `modules/editor_api.py`.
# Unauthenticated callers get 401; authenticated non-superadmins get 403.
#
# PAD-267 (settings.admin-editor): superadmin only (a legacy `is_admin` is now
# refused too), the blueprint exists only where EDITOR_ENABLED is on, secret
# columns are never returned or written, no method runs by name, and the CSV
# export/import routes are gone.


def _resolve_caller():
    """Return the calling ``User`` (session or JWT), or ``None``."""
    try:
        if getattr(current_user, "is_authenticated", False):
            return current_user._get_current_object()
    except Exception:
        pass

    try:
        verify_jwt_in_request(optional=True)
        identity = get_jwt_identity()
    except Exception:
        identity = None

    if identity is None:
        return None
    try:
        return User.query.get(int(identity))
    except (TypeError, ValueError):
        return None


@bp.before_request
def require_admin():
    user = _resolve_caller()
    if user is None:
        return jsonify(success=False, error="Authentication required"), 401
    if not getattr(user, "is_superadmin", False):
        return jsonify(success=False, error="Superadmin access required"), 403
    return None


@bp.route("/create/<model>", methods=["POST"])
def create(model):
    model = model.lower()
    model_cls = MODELS.get(model)
    if not model_cls:
        return jsonify(success=False, error=f"Model {model} not found"), 404

    empty_instance = model_cls()

    if request.is_json:
        data = request.get_json() or {}
        values = data.get("values", {})
    else:
        form = empty_instance.get_create_form()
        values = form.set_values(request)

    values = strip_redacted(model_cls, values)
    if not values:
        return jsonify(success=False, error="No values provided"), 400

    empty_instance.update_with_dict(values)
    empty_instance.create()

    return jsonify(success=True, id=empty_instance.id)


@bp.route("/edit/<model>/<id>", methods=["POST"])
def edit(model, id):
    model = model.lower()
    model_cls = MODELS.get(model)
    if not model_cls:
        return jsonify(success=False, error=f"Model {model} not found"), 404

    obj = model_cls.query.filter_by(id=id).first()
    if not obj:
        return jsonify(success=False, error=f"{model} with id {id} not found"), 404

    if request.is_json:
        data = request.get_json() or {}
        # settings.admin-editor rule 4: no method runs by name. This used to call
        # getattr(obj, name)() for every name in `methods` (delete, logout, ...);
        # the Jinja editor never sent it.
        if data.get("methods"):
            return jsonify(success=False, error="Method invocation is not supported"), 400
        values = data.get("values", {})
    else:
        form = obj.get_edit_form()
        values = form.set_values(request)

    values = strip_redacted(model_cls, values)
    if values:
        obj.update_with_dict(values)
        obj.save()

    return jsonify(success=True, id=obj.id)


@bp.route("/delete/<model>/<id>", methods=("GET", "POST"))
def delete(model, id):
    if request.method == "POST":
        model_name = model.lower()
        model = MODELS[model_name]
        # auth.account-profiles rule 3 (PAD-260): users are never hard-deleted here.
        if model.__tablename__ == "users":
            return jsonify(success=False, error="Users are not deleted through the editor; use account deletion (DELETE /api/auth/me)."), 409
        obj = model.query.filter_by(id=id).first()
        obj.delete()
        return jsonify(url_for("editor.display_all", model=model_name))
    return jsonify(sucess=False)


@bp.route("/query/<model>", methods=("GET", "POST"))
def query(model):
    model_name = model.lower()
    model_cls = MODELS[model_name]

    instances = model_cls.query.all()

    hidden = redacted_columns(model_cls)

    def serialize(instance):
        return {
            column.name: getattr(instance, column.name)
            for column in instance.__table__.columns
            if column.name not in hidden
        }

    return jsonify([serialize(instance) for instance in instances])


@bp.route("/remove_relationship", methods=("GET", "POST"))
def remove_relationship():
    data = request.get_json()

    model_name1 = data.get("model_name1")
    model_name2 = data.get("model_name2")
    field_name = data.get("field_name")
    id1 = int(data.get("id1"))
    id2 = int(data.get("id2"))

    model1 = MODELS[model_name1.lower()]
    model2 = MODELS[model_name2.lower()]

    obj1 = model1.query.filter_by(id=id1).first()
    obj2 = model2.query.filter_by(id=id2).first()

    field = getattr(obj1, field_name)
    field.remove(obj2)
    obj1.save()
    return jsonify(sucess=True)


@bp.route("/modal_create_page/<model>", methods=("GET", "POST"))
def modal_create_page(model):
    model_name = model.lower()
    model = MODELS[model_name]
    empty_instance = model()
    form = empty_instance.get_basic_create_form()
    if request.method == "POST":
        values = strip_redacted(model, form.set_values(request))
        empty_instance.update_with_dict(values)
        empty_instance.create()
        response = {"value": empty_instance.id, "name": empty_instance.name}
        return jsonify(response)
    data = empty_instance.get_basic_create_data(form)
    return render_template("editor/modal_create.html", data=data)


@bp.get("/image/<int:image_id>")
def image_by_id(image_id):
    img = Image.query.get(image_id)
    if not img:
        abort(404)
    resp = redirect(img.url(), code=302)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp
