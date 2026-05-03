import asyncio
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import openai
from app.services.motion_service import MotionService


class DummyResponse:
    def __init__(self, content: str):
        class _Message:
            def __init__(self, content: str):
                self.content = content

        class _Choice:
            def __init__(self, content: str):
                self.message = _Message(content)

        self.choices = [_Choice(content)]


def test_motion_service_uses_dedicated_motion_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MOTION_MODEL", "gpt-5.4-mini")
    captured = {}

    class DummyClient:
        def __init__(self):
            class _Completions:
                @staticmethod
                def create(**kwargs):
                    captured.update(kwargs)
                    return DummyResponse(json.dumps({"emotion": "happy", "action": "wave"}))

            class _Chat:
                completions = _Completions()

            self.chat = _Chat()

    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClient())

    service = MotionService()
    result = asyncio.run(service.plan_motion("hello", "Hi, nice to meet you.", "jane"))

    assert result.emotion == "happy"
    assert result.action == "wave"
    assert captured["model"] == "gpt-5.4-mini"
    assert captured["response_format"] == {"type": "json_object"}
    user_message = captured["messages"][1]["content"]
    assert "hello" in user_message
    assert "Hi, nice to meet you." in user_message


def test_motion_service_default_model_is_independent_from_chat_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_MOTION_MODEL", raising=False)
    monkeypatch.setenv("OPENAI_CHAT_MODEL", "gpt-4o")
    captured = {}

    class DummyClient:
        def __init__(self):
            class _Completions:
                @staticmethod
                def create(**kwargs):
                    captured.update(kwargs)
                    return DummyResponse(json.dumps({"emotion": "neutral", "action": "idle"}))

            class _Chat:
                completions = _Completions()

            self.chat = _Chat()

    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClient())

    service = MotionService()
    asyncio.run(service.plan_motion("hello", "hello", "jane"))

    assert captured["model"] == "gpt-5.4-mini"


def test_motion_service_falls_back_to_idle_without_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    service = MotionService()
    result = asyncio.run(service.plan_motion("hello", "hello", "jane"))

    assert result.emotion == "neutral"
    assert result.action == "idle"
