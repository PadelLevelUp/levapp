"""PAD-624 (PAD-612 D6): staging shares production's Expo project, so it must send no Expo push.
`EXPO_PUSH_DISABLED` stops every send before any request; production does not set it."""
from pathlib import Path


def _posts(monkeypatch):
    from padel_app.utils import expo_push

    calls = []

    class _Resp:
        status_code = 200

        def json(self):
            return {"data": [{"status": "ok"}]}

    monkeypatch.setattr(expo_push.requests, "post", lambda *a, **kw: calls.append(kw) or _Resp())
    return calls


def test_with_the_flag_set_no_request_reaches_expo(app, monkeypatch):
    """OLD-RED: send_expo_push posted whatever environment it ran in."""
    from padel_app.utils.expo_push import send_expo_push

    calls = _posts(monkeypatch)
    monkeypatch.setenv("EXPO_PUSH_DISABLED", "1")
    with app.app_context():
        assert send_expo_push(["ExponentPushToken[abc]"], "t", "b") is False
    assert calls == []


def test_without_the_flag_the_send_goes_out(app, monkeypatch):
    """PIN: production (flag unset) is unchanged."""
    from padel_app.utils.expo_push import send_expo_push

    calls = _posts(monkeypatch)
    monkeypatch.delenv("EXPO_PUSH_DISABLED", raising=False)
    with app.app_context():
        send_expo_push(["ExponentPushToken[abc]"], "t", "b")
    assert len(calls) == 1


def test_staging_sets_the_flag_and_production_does_not():
    """The tracked env files deploy as written (memory: env templates are scp'd each deploy)."""
    root = Path(__file__).resolve().parents[2]
    staging = (root / ".env.staging").read_text()
    prod = (root / ".env.prod").read_text()
    assert "\nEXPO_PUSH_DISABLED=1\n" in staging
    assert "EXPO_PUSH_DISABLED" not in prod
