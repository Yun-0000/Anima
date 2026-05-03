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

    async def process_text(self, message, character_id="jane"):
        self.calls.append({"message": message, "character_id": character_id})
        return self._result


def test_text_conversation_endpoint_passes_message_and_character(monkeypatch):
    service = DummyTextService(
        ConversationResponse(
            text="Jane answers.",
            user_text="hello",
            emotion="happy",
            action="wave",
            audio_url="",
            duration=0,
        )
    )
    conversation_module.conversation_service = service

    response = TestClient(app).post(
        "/api/text-conversation?character_id=jane",
        json={"message": "hello"},
    )

    assert response.status_code == 200
    assert response.json()["text"] == "Jane answers."
    assert service.calls == [{"message": "hello", "character_id": "jane"}]


def test_text_conversation_endpoint_returns_500_when_service_fails(monkeypatch):
    conversation_module.conversation_service = DummyTextService(None)

    response = TestClient(app).post(
        "/api/text-conversation?character_id=jane",
        json={"message": "hello"},
    )

    assert response.status_code == 500


def test_legacy_audio_endpoint_is_removed():
    response = TestClient(app).post("/api/conversation")

    assert response.status_code == 404
