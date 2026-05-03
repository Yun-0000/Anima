from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.api.motion as motion_module
from app.main import app
from app.models.schemas import MotionPlanResponse


class DummyMotionService:
    def __init__(self, result):
        self._result = result
        self.calls = []

    async def plan_motion(self, user_text, assistant_text, character_id="jane"):
        self.calls.append(
            {
                "user_text": user_text,
                "assistant_text": assistant_text,
                "character_id": character_id,
            }
        )
        return self._result


def test_motion_plan_endpoint_passes_transcripts_and_character():
    service = DummyMotionService(MotionPlanResponse(emotion="happy", action="wave"))
    motion_module.motion_service = service

    response = TestClient(app).post(
        "/api/motion-plan?character_id=hans",
        json={
            "user_text": "hello",
            "assistant_text": "Hi, nice to meet you.",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"emotion": "happy", "action": "wave"}
    assert service.calls == [
        {
            "user_text": "hello",
            "assistant_text": "Hi, nice to meet you.",
            "character_id": "hans",
        }
    ]


def test_motion_plan_endpoint_returns_idle_when_service_fails():
    motion_module.motion_service = DummyMotionService(None)

    response = TestClient(app).post(
        "/api/motion-plan?character_id=jane",
        json={"user_text": "hello", "assistant_text": "hello"},
    )

    assert response.status_code == 200
    assert response.json() == {"emotion": "neutral", "action": "idle"}
