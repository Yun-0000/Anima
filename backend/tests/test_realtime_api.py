from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.api.realtime as realtime_module
from app.main import app


def test_interaction_config_disables_voice_without_provider_keys(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("VOICE_PROVIDER", raising=False)

    response = TestClient(app).get("/api/interaction-config")

    assert response.status_code == 200
    assert response.json() == {
        "text_mode": {"enabled": True},
        "voice_mode": {
            "enabled": False,
            "provider": None,
            "providers": {
                "openai": {"configured": False},
            },
            "reason": "Set OPENAI_API_KEY to enable voice mode.",
        },
    }


def test_interaction_config_ignores_google_keys(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test-key")

    response = TestClient(app).get("/api/interaction-config")

    assert response.status_code == 200
    assert response.json()["voice_mode"] == {
        "enabled": False,
        "provider": None,
        "providers": {
            "openai": {"configured": False},
        },
        "reason": "Set OPENAI_API_KEY to enable voice mode.",
    }


def test_interaction_config_prefers_openai_when_configured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-key")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("VOICE_PROVIDER", "google")

    response = TestClient(app).get("/api/interaction-config")

    assert response.status_code == 200
    assert response.json()["voice_mode"] == {
        "enabled": True,
        "provider": "openai",
        "providers": {
            "openai": {"configured": True},
        },
        "reason": None,
    }


def test_openai_realtime_call_requires_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = TestClient(app).post(
        "/api/realtime/openai/call?character_id=jane",
        content="v=0\r\n",
        headers={"Content-Type": "application/sdp"},
    )

    assert response.status_code == 403


def test_openai_realtime_call_returns_sdp_answer(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-key")
    captured = {}

    async def fake_create_openai_call(sdp: str, character_id: str):
        captured["sdp"] = sdp
        captured["character_id"] = character_id
        return "answer-sdp"

    monkeypatch.setattr(realtime_module.realtime_service, "create_openai_call", fake_create_openai_call)

    response = TestClient(app).post(
        "/api/realtime/openai/call?character_id=hans",
        content="offer-sdp",
        headers={"Content-Type": "application/sdp"},
    )

    assert response.status_code == 200
    assert response.text == "answer-sdp"
    assert response.headers["content-type"].startswith("application/sdp")
    assert captured == {"sdp": "offer-sdp", "character_id": "hans"}


def test_openai_session_config_uses_sts_without_avatar_tool(monkeypatch):
    monkeypatch.setenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
    monkeypatch.setenv("OPENAI_REALTIME_VOICE", "coral")

    session = realtime_module.realtime_service.build_openai_session_config("jane")

    assert session["type"] == "realtime"
    assert session["model"] == "gpt-realtime"
    assert session["audio"]["output"]["voice"] == "coral"
    assert session["audio"]["input"]["transcription"]["model"] == "gpt-4o-transcribe"
    turn_detection = session["audio"]["input"]["turn_detection"]
    assert turn_detection == {
        "type": "server_vad",
        "threshold": 0.45,
        "prefix_padding_ms": 200,
        "silence_duration_ms": 300,
        "create_response": True,
        "interrupt_response": True,
    }
    assert "tools" not in session
    assert "You are Jane" in session["instructions"]
    assert "set_avatar_state" not in session["instructions"]
    assert "Avatar motion is handled by the client" in session["instructions"]
    assert "You MUST respond in this JSON format" not in session["instructions"]
    assert '"emotion"' not in session["instructions"]
    assert '"action"' not in session["instructions"]
    assert "Action Guidelines" not in session["instructions"]


def test_openai_session_config_defaults_to_realtime_2(monkeypatch):
    monkeypatch.delenv("OPENAI_REALTIME_MODEL", raising=False)

    session = realtime_module.realtime_service.build_openai_session_config("jane")

    assert session["model"] == "gpt-realtime-2"


def test_openai_session_config_uses_character_specific_default_voices(monkeypatch):
    monkeypatch.delenv("OPENAI_REALTIME_VOICE", raising=False)
    monkeypatch.delenv("OPENAI_REALTIME_VOICE_JANE", raising=False)
    monkeypatch.delenv("OPENAI_REALTIME_VOICE_HANS", raising=False)

    jane_session = realtime_module.realtime_service.build_openai_session_config("jane")
    hans_session = realtime_module.realtime_service.build_openai_session_config("hans")

    assert jane_session["audio"]["output"]["voice"] == "marin"
    assert hans_session["audio"]["output"]["voice"] == "cedar"


def test_openai_session_config_allows_character_voice_override(monkeypatch):
    monkeypatch.delenv("OPENAI_REALTIME_VOICE", raising=False)
    monkeypatch.setenv("OPENAI_REALTIME_VOICE_HANS", "ash")

    session = realtime_module.realtime_service.build_openai_session_config("hans")

    assert session["audio"]["output"]["voice"] == "ash"


def test_google_live_token_endpoint_is_removed():
    response = TestClient(app).post("/api/realtime/google/token?character_id=jane")

    assert response.status_code == 404
