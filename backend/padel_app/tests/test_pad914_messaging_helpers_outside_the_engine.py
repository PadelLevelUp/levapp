"""PAD-914: the message text and the system-message senders live outside `notification_service`.

The engine swap (docs plan 2026-11-11, §3.1) deletes the old engine; these helpers are used by
class requests, join requests, evaluation shares and profile reminders, so they must not depend on
it. No module-level import may reach back into `notification_service`, and the names it still
re-exports (for one release) are the moved objects themselves, not copies.
"""

import ast
from pathlib import Path

import pytest

SERVICES = Path(__file__).resolve().parents[1] / "services"
MOVED = ("message_text.py", "system_messages.py")


@pytest.mark.parametrize("filename", MOVED)
def test_the_moved_module_never_imports_the_engine_at_module_level(filename):
    tree = ast.parse((SERVICES / filename).read_text())
    top_level = [
        node.module if isinstance(node, ast.ImportFrom) else alias.name
        for node in tree.body
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in (node.names if isinstance(node, ast.Import) else [None])
    ]
    assert not [m for m in top_level if m and "notification_service" in m], top_level


def test_notification_service_re_exports_the_moved_objects():
    from padel_app.services import message_text, notification_service, system_messages

    for module in (message_text, system_messages):
        names = [
            n.name if isinstance(n, ast.FunctionDef) else n.targets[0].id
            for n in ast.parse(Path(module.__file__).read_text()).body
            if isinstance(n, ast.FunctionDef)
            or (isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name))
        ]
        assert names, module.__name__
        for name in names:
            assert getattr(notification_service, name) is getattr(module, name), name
