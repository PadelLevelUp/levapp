"""PAD-531 admin.foundation: the four guards that keep the rules true as code is added.

- rule 6: no file outside the allow-list reads `is_superadmin` (the list is what read it on
  2026-10-07; migrations are excluded: the seed reads it by design, and tests are excluded);
- rule 8: every non-GET view under /admin/api/ carries the `@audited` marker;
- rule 9: no route under /admin/api/audit accepts PUT, PATCH or DELETE;
- rule 14: nothing under apps/web, apps/mobile or packages/* imports from apps/admin, mentions
  `/admin/api`, or is an admin resource client (the product's `resources/admin.ts` talks to
  `/api/app/admin`, a different string, and leaves with PAD-532).
"""
import pathlib
import re

BACKEND = pathlib.Path(__file__).resolve().parents[2]
PKG = BACKEND / "padel_app"
FRONTEND = BACKEND.parent / "frontend"

IS_SUPERADMIN_READERS = {
    "models/users.py",
    "modules/api_auth.py",
    "modules/editor_api.py",
    "modules/api.py",
    "modules/editor.py",
    "modules/frontend_api.py",
    "services/request_alert_service.py",
    "services/user_service.py",
    # PAD-532, admin.approvals-and-users rule 5: the console's user view SHOWS the product flag
    # (read-only display, no decision is taken on it).
    "services/admin/users_service.py",
    # PAD-532 rule 9 (#584 review): view-as refuses staff targets, the product superadmins included.
    "services/admin/view_as_service.py",
}


def test_no_new_reader_of_is_superadmin():
    offenders = []
    for path in PKG.rglob("*.py"):
        rel = path.relative_to(PKG).as_posix()
        if rel.startswith("tests/") or rel in IS_SUPERADMIN_READERS:
            continue
        if "is_superadmin" in path.read_text(errors="ignore"):
            offenders.append(rel)
    assert offenders == [], f"new is_superadmin readers (admin.foundation rule 6): {offenders}"


def test_the_allow_list_is_not_stale():
    stale = [rel for rel in IS_SUPERADMIN_READERS if "is_superadmin" not in (PKG / rel).read_text()]
    assert stale == [], f"remove from the allow-list, they no longer read it: {stale}"


def test_every_write_route_is_audited(app):
    missing = []
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith("/admin/api/"):
            continue
        if not (set(rule.methods) - {"GET", "HEAD", "OPTIONS"}):
            continue
        view = app.view_functions[rule.endpoint]
        if not getattr(view, "__audited_action__", None):
            missing.append(f"{rule.rule} {sorted(rule.methods)} -> {rule.endpoint}")
    assert missing == [], f"routes without @audited (admin.foundation rule 8): {missing}"


def test_audit_routes_are_read_only(app):
    for rule in app.url_map.iter_rules():
        if rule.rule.startswith("/admin/api/audit"):
            assert not ({"PUT", "PATCH", "DELETE", "POST"} & set(rule.methods)), rule


PRODUCT_TREES = (
    FRONTEND / "apps" / "web" / "src",
    FRONTEND / "apps" / "mobile" / "app",
    FRONTEND / "apps" / "mobile" / "src",
    FRONTEND / "packages",
)
ADMIN_IMPORT = re.compile(r"""from\s+['"][^'"]*apps/admin|['"]@levelup/admin['"]""")
ADMIN_API = re.compile(r"/admin/api")
ALLOWED_ADMIN_API_MENTIONS = set()  # empty by design (rule 14)


def test_the_product_apps_carry_no_admin_code():
    offenders = []
    for tree in PRODUCT_TREES:
        assert tree.is_dir(), tree
        for path in tree.rglob("*"):
            if path.suffix not in {".ts", ".tsx", ".js", ".jsx", ".json"} or "node_modules" in path.parts:
                continue
            text = path.read_text(errors="ignore")
            rel = path.relative_to(FRONTEND).as_posix()
            if ADMIN_IMPORT.search(text):
                offenders.append(f"{rel}: imports apps/admin")
            if ADMIN_API.search(text) and rel not in ALLOWED_ADMIN_API_MENTIONS:
                offenders.append(f"{rel}: mentions /admin/api")
    assert offenders == [], f"admin code in the product apps (admin.foundation rule 14): {offenders}"
