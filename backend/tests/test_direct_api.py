from pathlib import Path
import sys
import json
from types import SimpleNamespace

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.api.direct as direct_module
import app.services.director_service as director_module
from app.main import app


def post(lines, speaker="character", context=()):
    body = {"character_id": "kai", "speaker": speaker, "lines": lines, "context": list(context)}
    return TestClient(app).post("/api/direct", json=body).json()["directions"]


def test_without_a_key_word_rules_give_body_language(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(direct_module, "director", None)
    assert post(["Hi there!", "Hmm, I don't know.", "The weather is mild today."]) == [
        {"gesture": "wave", "emotion": "happy"},
        {"gesture": "shrug", "emotion": "relaxed"},
        {"gesture": "none", "emotion": "neutral"},
    ]


def test_the_model_directs_a_reply_knowing_the_conversation_and_bad_output_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    seen = []
    replies = iter([
        '{"directions": [{"gesture": "nod", "emotion": "happy"}, {"gesture": "explain", "emotion": "happy"}]}',
        '{"directions": [{"gesture": "backflip", "emotion": "smug"}]}',
        "not json",
    ])

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        async def create(self, **kwargs):
            seen.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=next(replies)))])

    monkeypatch.setattr(director_module.openai, "AsyncOpenAI", FakeClient)
    monkeypatch.setattr(direct_module, "director", None)
    context = [{"speaker": "user", "text": "How do plants eat?"}]
    assert post(["Good question.", "They turn sunlight into sugar."], context=context) == [
        {"gesture": "nod", "emotion": "happy"},
        {"gesture": "explain", "emotion": "happy"},
    ]
    assert seen[0]["model"] == "gpt-6-luna"
    assert seen[0]["reasoning_effort"] == "low" and seen[0]["service_tier"] == "priority"
    sent = json.loads(seen[0]["messages"][1]["content"])
    assert sent["lines"] == ["Good question.", "They turn sunlight into sugar."] and sent["context"] == context
    assert sent["persona"].startswith("You are Kai")
    # Unknown values become "none" and "neutral", and a line the model skipped stays still.
    assert post(["Something.", "Something else."]) == [{"gesture": "none", "emotion": "neutral"}] * 2
    # Output that is not JSON falls back to the word rules.
    assert post(["Hello!"]) == [{"gesture": "wave", "emotion": "happy"}]
