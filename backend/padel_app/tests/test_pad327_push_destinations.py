"""
PAD-327 — the two channels of a push must name the same destination.

`messaging.push-notifications` rule 7 defines the shapes a native payload may
take; every writer that sends both a web push and an Expo push is asserting the
same thing twice, in two vocabularies, with nothing checking that the two agree.
Four of the six writers disagreed:

- `request_alert_service` and `coach_approval_service` sent `{"type": "request",
  "kind": …}`, which the contract does not define — a dead tap;
- `class_request_service` sent `{"type": "class_request", …}`, same;
- `class_join_request_service` sent `{"type": "class"}` for a push with a
  Message behind it, which routed to a screen that could not open. That one and
  the class request were fixed by Session H in PAD-324; this branch fixes the
  two request alerts and adds the guard.

Three of those were found by reading. The fourth was found by this guard before
it was finished, which is the argument for having it.

Two halves, deliberately:

1. **Structural, and total.** No writer may invent a payload type. This reads
   every `send_expo_push_to_user` call site in the services and checks the
   `type` it passes is one the contract defines. It cannot miss a writer,
   including one added tomorrow.
2. **Behavioural, where a writer is cheap to drive.** The web `url` and the Expo
   destination are compared *against each other* — never each against a
   constant, which is the mistake that lets both drift together.
"""
import ast
import pathlib
import re
from unittest.mock import patch

import pytest

SERVICES = pathlib.Path(__file__).resolve().parents[1] / "services"

#: The shapes `messaging.push-notifications` rule 7 defines. `class` is retired
#: by PAD-326: it has no producer and `routeForPushData` ignores it.
ROUTABLE_TYPES = {"message", "path"}


def _expo_payload_types(source: str) -> list[str]:
    """Every literal `type` passed in a `data=` to `send_expo_push_to_user`."""
    tree = ast.parse(source)
    found: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if name != "send_expo_push_to_user":
            continue
        for kw in node.keywords:
            if kw.arg != "data":
                continue
            if isinstance(kw.value, ast.Dict):
                for key, value in zip(kw.value.keys, kw.value.values):
                    if isinstance(key, ast.Constant) and key.value == "type":
                        if isinstance(value, ast.Constant):
                            found.append(value.value)
            elif isinstance(kw.value, ast.Name):
                # A payload built above the call (`push_data = {...}`): find the
                # literal type assigned to that name in the same file.
                for assign in ast.walk(tree):
                    if not isinstance(assign, ast.Assign) or not isinstance(assign.value, ast.Dict):
                        continue
                    targets = [getattr(t, "id", None) for t in assign.targets]
                    if kw.value.id not in targets:
                        continue
                    for key, value in zip(assign.value.keys, assign.value.values):
                        if isinstance(key, ast.Constant) and key.value == "type":
                            if isinstance(value, ast.Constant):
                                found.append(value.value)
    return found


def test_no_push_writer_invents_a_payload_type():
    """Structural half: total over the services, cannot miss a new writer."""
    # R-032: prove the walk found its subject. A parser that matches nothing —
    # because the helper was renamed, or the services moved — would report every
    # writer compliant while checking none of them.
    seen = sum(len(_expo_payload_types(p.read_text())) for p in SERVICES.glob("*.py"))
    assert seen >= 5, (
        f"found only {seen} literal push payload types under {SERVICES}; this guard is not "
        "reading the writers it exists to check"
    )
    offenders: list[str] = []
    # No carve-outs. There was one — `class_join_request_service.py`, deferred to
    # Session H's #249 while that fix was in flight — and it came out the moment
    # #249 reached staging. A guard with a standing exception for the case that
    # would have caught the bug is decoration.
    for path in sorted(SERVICES.glob("*.py")):
        for kind in _expo_payload_types(path.read_text()):
            if kind not in ROUTABLE_TYPES:
                offenders.append(f"{path.name}: {{'type': '{kind}'}}")
    assert offenders == [], (
        "these payload types are not in `messaging.push-notifications` rule 7, so the tap "
        "routes nowhere — a dead tap, which is harder to notice than a wrong screen:\n  "
        + "\n  ".join(offenders)
    )


def _destination_of(expo_data: dict) -> str:
    """The web path an Expo payload names, in the web's own vocabulary."""
    if expo_data.get("type") == "message":
        return f"/messages/{expo_data['conversationId']}"
    if expo_data.get("type") == "path":
        return expo_data["path"]
    raise AssertionError(f"payload names no destination the web could express: {expo_data}")


@pytest.mark.parametrize(
    "kind",
    [
        "club_join.received",
        "club_join.decided",
        "claim.received",
        "claim.decided",
        "coach_approval.received",
    ],
)
def test_a_request_alert_names_one_destination_in_both_channels(app, kind):
    """Behavioural half: the two channels are compared against each other."""
    from padel_app.models import User
    from padel_app.services import request_alert_service
    from padel_app.sql_db import db

    with app.app_context():
        user = User(name="Alerted", username=f"p327_{kind.replace('.', '_')}",
                    email=f"{kind.replace('.', '_')}@t.test", password="x", status="active")
        db.session.add(user)
        db.session.commit()

        # The writer imports its channels inside the function, so patch them at
        # their source rather than on this module.
        with patch("padel_app.utils.push_notifications.send_push_notification") as web, \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as expo, \
             patch("padel_app.tools.email_tools.send_email"), \
             patch.object(request_alert_service, "wants_request_alerts", return_value=True):
            request_alert_service.notify_request_event(
                kind, [user], actor="A", player="P", club="C", decision="accepted"
            )

        assert web.call_count == 1 and expo.call_count == 1
        web_url = web.call_args.kwargs.get("url") or web.call_args.args[3]
        expo_data = expo.call_args.kwargs["data"]
        assert _destination_of(expo_data) == web_url, (
            f"{kind}: the web push says {web_url!r} and the native push says "
            f"{_destination_of(expo_data)!r}. A student or coach tapping the same alert on two "
            "devices must not land in two places."
        )


def test_the_contract_and_the_client_agree_on_the_routable_types():
    """The types this test enforces are the ones the client actually routes.

    Reading the client's own source rather than restating its list here: a
    constant copied into a test is exactly the second copy that drifts. That
    makes this the strongest check in the file AND the one most able to pass for
    the wrong reason, so it proves it found its subject before it asserts
    anything about it.
    """
    routing = (
        pathlib.Path(__file__).resolve().parents[3]
        / "frontend/apps/mobile/src/lib/push-routing.ts"
    )
    # Fail LOUDLY when the client source is not where this test looks. A check
    # that cannot find its subject asserts over nothing and goes green, which is
    # worse than no check: it reports safety it never verified. If the file
    # moved, this test must be pointed at it, not quietly satisfied.
    assert routing.is_file(), (
        "cannot find the client's push-routing source, so this test would pass "
        f"without checking anything. Looked for: {routing}. If it moved, point this "
        "test at it; do not delete the assertion."
    )
    source = routing.read_text()
    assert "routeForPushData" in source, (
        f"{routing} exists but does not define `routeForPushData` — this test is "
        "reading the wrong file and would pass vacuously"
    )
    for kind in ROUTABLE_TYPES:
        assert f'payload.type === "{kind}"' in source, (
            f"the backend guard allows '{kind}' but the client does not route it"
        )
    assert 'payload.type === "class"' not in source, (
        "`class` is retired (PAD-326); the client must not route it"
    )
