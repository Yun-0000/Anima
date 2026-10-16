from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.api.voice as voice
from app.characters import get_character_profile
from app.main import app


def configure(monkeypatch, key="eleven-key", agent="agent_1"):
    for name, value in (("ELEVENLABS_API_KEY", key), ("ELEVENLABS_AGENT_ID", agent)):
        if value:
            monkeypatch.setenv(name, value)
        else:
            monkeypatch.delenv(name, raising=False)


def fake_http(monkeypatch, status=200, body=None, seen=None):
    class Response:
        status_code = status
        text = "upstream says no"

        def json(self):
            return body or {"token": "one-time-token", "conversation_id": "conv_1"}

    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): return None

        async def get(self, url, **kwargs):
            if seen is not None:
                seen.update(url=url, **kwargs)
            return Response()

    monkeypatch.setattr(voice.httpx, "AsyncClient", Client)


def test_voice_is_enabled_only_with_an_elevenlabs_key_and_agent(monkeypatch):
    configure(monkeypatch, agent=None)
    assert TestClient(app).get("/api/interaction-config").json() == {"voice_enabled": False}
    assert TestClient(app).post("/api/live/sessions", json={"character_id": "rin"}).status_code == 403
    configure(monkeypatch)
    assert TestClient(app).get("/api/interaction-config").json() == {"voice_enabled": True}


def test_session_returns_a_token_and_the_character_prompt_and_voice(monkeypatch):
    configure(monkeypatch)
    monkeypatch.delenv("ELEVENLABS_VOICE_ID_RIN", raising=False)
    seen = {}
    fake_http(monkeypatch, seen=seen)

    response = TestClient(app).post("/api/live/sessions", json={"character_id": "rin"})

    rin = get_character_profile("rin")
    assert response.status_code == 200
    assert response.json() == {
        "conversation_token": "one-time-token",
        "overrides": {"agent": {"prompt": {"prompt": rin.voice_prompt}, "firstMessage": ""}, "tts": {"voiceId": rin.eleven_voice}},
    }
    # The key goes to ElevenLabs from the server, never to the browser.
    assert seen["params"] == {"agent_id": "agent_1"} and seen["headers"] == {"xi-api-key": "eleven-key"}


def test_session_reports_an_upstream_failure(monkeypatch):
    configure(monkeypatch)
    fake_http(monkeypatch, status=401)
    response = TestClient(app).post("/api/live/sessions", json={"character_id": "kai"})
    assert response.status_code == 502 and "ElevenLabs" in response.json()["detail"]
