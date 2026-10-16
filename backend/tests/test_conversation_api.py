from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.api.conversation as conversation_module
from app.main import app
from app.models.schemas import ConversationResponse


class DummyTextService:
    def __init__(self, result):  # result can be ConversationResponse or None
        self._result = result
        self.calls = []

    async def process_text(self, message, character_id="mio", history=()):
        self.calls.append({"message": message, "character_id": character_id})
        return self._result


def test_text_conversation_endpoint_passes_message_and_character(monkeypatch):
    service = DummyTextService(
        ConversationResponse(
            text="Mio answers.",
            audio_url="",
            duration=0,
        )
    )
    conversation_module.conversation_service = service

    response = TestClient(app).post(
        "/api/text-conversation?character_id=mio",
        json={"message": "hello"},
    )

    assert response.status_code == 200
    assert response.json()["text"] == "Mio answers."
    assert service.calls == [{"message": "hello", "character_id": "mio"}]


def test_text_conversation_endpoint_reports_a_failed_reply(monkeypatch):
    conversation_module.conversation_service = DummyTextService(None)

    response = TestClient(app).post(
        "/api/text-conversation?character_id=mio",
        json={"message": "hello"},
    )

    assert response.status_code == 502


def test_speech_streams_only_signed_replies(monkeypatch):
    from app.services.conversation_service import ConversationService
    from app.characters import get_character_profile
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    service = ConversationService()

    async def stream(text, character):
        yield f"{character.id}:{text}".encode()
    monkeypatch.setattr(service.tts, "stream", stream)
    conversation_module.conversation_service = service
    token = service.tts.link("Hi there.", get_character_profile("kai"))

    client = TestClient(app)
    response = client.get(f"/api/speech/{token}")
    assert response.status_code == 200 and response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"kai:Hi there."
    assert client.get("/api/speech/unknown.0000").status_code == 404


def test_a_message_longer_than_a_history_turn_is_refused():
    response = TestClient(app).post("/api/text-conversation", json={"message": "x" * 2001})
    assert response.status_code == 422
