from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.api.direct as direct_module
import app.services.director_service as director_module
from app.main import app


def post(line, speaker="character"):
    return TestClient(app).post("/api/direct", json={"character_id": "kai", "speaker": speaker, "line": line}).json()


def test_without_a_key_word_rules_give_body_language(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(direct_module, "director", None)
    assert post("Hi there!") == {"gesture": "wave", "emotion": "happy"}
    assert post("Hmm, I don't know.") == {"gesture": "shrug", "emotion": "relaxed"}
    assert post("The weather is mild today.") == {"gesture": "none", "emotion": "neutral"}


def test_the_model_directs_each_line_and_bad_output_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    seen = []
    replies = iter(['{"gesture": "nod", "emotion": "happy"}', '{"gesture": "backflip", "emotion": "smug"}'])

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

        async def create(self, **kwargs):
            seen.append(kwargs)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=next(replies)))])

    monkeypatch.setattr(director_module.openai, "AsyncOpenAI", FakeClient)
    monkeypatch.setattr(direct_module, "director", None)
    assert post("I love that idea.", speaker="user") == {"gesture": "nod", "emotion": "happy"}
    assert seen[0]["model"] == "gpt-6-luna"
    assert seen[0]["reasoning_effort"] == "low" and seen[0]["service_tier"] == "priority"
    assert '"speaker": "user"' in seen[0]["messages"][1]["content"]
    # Unknown values from the model become "none" and "neutral".
    assert post("Something.") == {"gesture": "none", "emotion": "neutral"}
