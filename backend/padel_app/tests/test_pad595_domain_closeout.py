"""PAD-595 close-out — the three "falta" items of the 2026-10-11 comment, as tests.

The 2026-10-10 inventory found them already on levapp.app; these pin it so it stays that way.

- Transactional emails: every link the backend builds is rooted at `PUBLIC_WEB_ORIGIN`
  (https://levapp.app in prod; test_mail_origin_per_environment pins the env files and two
  mails). Here: the old domain appears nowhere in the backend's own code or env templates.
- Push notifications: a web push carries a RELATIVE path (`/messages/…`, `/calendar…`); the
  client resolves it against the origin it runs on, so no push ever names a host.
- Deep links are pinned on the app side (frontend/apps/mobile/src/lib/app-links.test.ts).
"""
import ast
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parents[2]
PACKAGE = BACKEND / "padel_app"


def _sources():
    for path in PACKAGE.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        yield path


def test_the_old_domain_is_nowhere_in_backend_code_or_env_templates():
    offenders = [str(p.relative_to(BACKEND)) for p in _sources() if "padellevelup.com" in p.read_text()]
    offenders += [
        p.name for p in BACKEND.glob(".env*") if p.is_file() and "padellevelup.com" in p.read_text()
    ]
    assert offenders == [], f"links built from the old domain: {offenders}"


def _push_url_args():
    """(file, line, url node) for every send_push_notification(...) call."""
    for path in _sources():
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if name != "send_push_notification" or path.name == "push_notifications.py":
                continue
            url = next((k.value for k in node.keywords if k.arg == "url"), None)
            if url is None and len(node.args) >= 4:
                url = node.args[3]
            yield path.relative_to(BACKEND), node.lineno, url


def _leading_text(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr) and node.values and isinstance(node.values[0], ast.Constant):
        return node.values[0].value
    return None


def test_every_web_push_names_a_relative_path():
    """A literal or f-string url starts with "/"; a variable one comes from a PATHS table,
    checked below. Any other shape is a new case to look at, so it fails too."""
    calls = list(_push_url_args())
    assert len(calls) >= 10, "the scan found the call sites"
    bad = []
    for where, line, url in calls:
        text = _leading_text(url) if url is not None else "/"  # absent → the transport's "/"
        if text is not None:
            if not text.startswith("/") or "://" in text:
                bad.append(f"{where}:{line} {text!r}")
        elif not (isinstance(url, ast.Name) and url.id == "path"):
            bad.append(f"{where}:{line} {ast.dump(url)[:60]}")
    assert bad == [], bad


def test_the_push_path_table_is_relative():
    """`path` at the two variable call sites is `request_alert_service.PATHS[kind]`."""
    from padel_app.services.request_alert_service import PATHS

    for kind, path in PATHS.items():
        assert path.startswith("/") and "://" not in path, (kind, path)
