"""PAD-636 (import.analyze rule 6a): every model request asks OpenRouter for a provider that
neither trains on nor retains prompts, `provider: {"data_collection": "deny"}`. Without it the
coach's students' names and contacts could reach a provider that keeps them."""
from types import SimpleNamespace

from padel_app.helpers import llm


class _Recorder:
    def __init__(self):
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content=' {"ok": true} ')
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def test_every_request_asks_for_a_provider_that_keeps_nothing(monkeypatch):
    recorder = _Recorder()
    monkeypatch.setattr(llm, "get_client", lambda: recorder)

    assert llm.call_llm(messages=[{"role": "user", "content": "Ana Costa"}], json_mode=True) == '{"ok": true}'

    (sent,) = recorder.calls
    assert sent["extra_body"]["provider"] == {"data_collection": "deny"}
    assert "reasoning" in sent["extra_body"], "the reasoning setting is still sent"
