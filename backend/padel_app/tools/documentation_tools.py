from __future__ import annotations
from typing import Any, Dict

EXCLUDED_FIELDS = {"created_at", "updated_at"}


def _strip_excluded(values: Dict[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(values, dict):
        return {}
    return {k: v for k, v in values.items() if k not in EXCLUDED_FIELDS}


def _column_type_name(col) -> str:
    try:
        return col.type.python_type.__name__
    except Exception:
        return str(col.type)


def _call_example_method(model_cls, method_name: str) -> Dict[str, Any]:
    fn = getattr(model_cls, method_name, None)
    if not callable(fn):
        return {}
    try:
        return fn()
    except TypeError:
        try:
            inst = model_cls()
            bound = getattr(inst, method_name, None)
            if callable(bound):
                return bound()
        except Exception:
            pass
    except Exception:
        pass
    return {}


def _get_field_descriptions(model_cls) -> Dict[str, str]:
    desc = getattr(model_cls, "FIELD_DESCRIPTIONS", None)
    if isinstance(desc, dict):
        return desc
    fn = getattr(model_cls, "get_field_descriptions", None)
    if callable(fn):
        try:
            out = fn()
            if isinstance(out, dict):
                return out
        except Exception:
            pass
    return {}


def _get_examples(model_cls) -> Dict[str, Any]:
    create_ex = _call_example_method(model_cls, "create_example") or {}
    edit_ex = _call_example_method(model_cls, "edit_example") or {}

    if not isinstance(create_ex, dict):
        create_ex = {}
    if not isinstance(edit_ex, dict):
        edit_ex = {}

    create_ex.setdefault("values", {})
    edit_ex.setdefault("values", {})
    edit_ex.setdefault("methods", [])
    edit_ex.setdefault("id", 1)

    create_ex["values"] = _strip_excluded(create_ex["values"])
    edit_ex["values"] = _strip_excluded(edit_ex["values"])

    return {"create": create_ex, "edit": edit_ex}


def collect_model_schema(model_cls) -> Dict[str, Any]:
    schema: Dict[str, Any] = {
        "class_name": getattr(model_cls, "__name__", None),
        "fields": [],
        "examples": {},
    }

    field_descs = _get_field_descriptions(model_cls)

    table = getattr(model_cls, "__table__", None)
    if table is not None and getattr(table, "columns", None):
        for col in table.columns:
            schema["fields"].append(
                {
                    "name": col.name,
                    "type": _column_type_name(col),
                    "description": field_descs.get(col.name),
                }
            )

    if not schema["fields"]:
        annotations = getattr(model_cls, "__annotations__", {}) or {}
        for fname, ftype in annotations.items():
            type_name = getattr(ftype, "__name__", None) or str(ftype)
            schema["fields"].append(
                {
                    "name": fname,
                    "type": type_name,
                    "description": field_descs.get(fname),
                }
            )

    schema["examples"] = _get_examples(model_cls)
    return schema


def build_models_doc(models_dict: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, cls in models_dict.items():
        out[key.lower()] = collect_model_schema(cls)
    return out
