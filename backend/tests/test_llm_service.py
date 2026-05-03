import asyncio
import json
import os
from pathlib import Path
import sys
import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

import openai
from app.services.llm_service import LLMService


@pytest.fixture(autouse=True)
def reset_llm_env(monkeypatch):
    for key in (
        "OPENAI_API_KEY",
        "OPENAI_CHAT_MODEL",
        "OPENAI_FALLBACK_MODEL",
    ):
        monkeypatch.delenv(key, raising=False)


class DummyResponse:
    def __init__(self, content: str, finish_reason: str = "stop"):
        class _Message:
            def __init__(self, content: str):
                self.content = content

        class _Choice:
            def __init__(self, content: str, finish_reason: str):
                self.message = _Message(content)
                self.finish_reason = finish_reason

        self.choices = [_Choice(content, finish_reason)]


class DummyClientSuccess:
    def __init__(self):
        class _Completions:
            @staticmethod
            def create(**kwargs):
                payload = json.dumps({"text": "hello", "emotion": "neutral"})
                return DummyResponse(payload)

        class _Chat:
            completions = _Completions()

        self.chat = _Chat()


class DummyClientFailure:
    def __init__(self):
        class _Completions:
            @staticmethod
            def create(*args, **kwargs):
                raise RuntimeError("boom")

        class _Chat:
            completions = _Completions()

        self.chat = _Chat()


def test_generate_response_uses_default_model(monkeypatch):
    os.environ.pop("OPENAI_CHAT_MODEL", None)
    expected_model = "gpt-4o"

    class DummyClient:
        def __init__(self):
            class _Completions:
                @staticmethod
                def create(**kwargs):
                    assert kwargs["model"] == expected_model
                    payload = json.dumps({"text": "hello", "emotion": "neutral"})
                    return DummyResponse(payload)

            class _Chat:
                completions = _Completions()

            self.chat = _Chat()

    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClient())
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result == {"text": "hello", "emotion": "neutral"}


def test_generate_response_uses_env_model(monkeypatch):
    os.environ["OPENAI_CHAT_MODEL"] = "gpt-4o-mini"

    class DummyClient:
        def __init__(self):
            class _Completions:
                @staticmethod
                def create(**kwargs):
                    assert kwargs["model"] == "gpt-4o-mini"
                    payload = json.dumps({"text": "hello", "emotion": "neutral"})
                    return DummyResponse(payload)

            class _Chat:
                completions = _Completions()

            self.chat = _Chat()

    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClient())
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result == {"text": "hello", "emotion": "neutral"}


def test_generate_response_success(monkeypatch):
    os.environ.pop("OPENAI_CHAT_MODEL", None)
    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClientSuccess())
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result == {"text": "hello", "emotion": "neutral"}


def test_generate_response_failure(monkeypatch):
    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClientFailure())
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result is None


def test_generate_response_omits_temperature_for_gpt5_models(monkeypatch):
    os.environ["OPENAI_CHAT_MODEL"] = "gpt-5.3-chat-latest"
    captured_kwargs = {}

    class DummyClient:
        def __init__(self):
            class _Completions:
                @staticmethod
                def create(**kwargs):
                    captured_kwargs.update(kwargs)
                    payload = json.dumps({"text": "hello", "emotion": "neutral"})
                    return DummyResponse(payload)

            class _Chat:
                completions = _Completions()

            self.chat = _Chat()

    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: DummyClient())
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result == {"text": "hello", "emotion": "neutral"}
    assert "temperature" not in captured_kwargs


def test_generate_response_retries_on_empty_content(monkeypatch):
    os.environ.pop("OPENAI_CHAT_MODEL", None)
    os.environ.pop("OPENAI_FALLBACK_MODEL", None)

    class DummyClient:
        def __init__(self):
            self.calls = 0
            self.tokens = []

            class _Completions:
                def __init__(self, outer):
                    self.outer = outer

                def create(self, *args, **kwargs):
                    self.outer.calls += 1
                    token_value = kwargs.get("max_completion_tokens")
                    if token_value is None:
                        token_value = kwargs.get("max_tokens")
                    self.outer.tokens.append(token_value)
                    if self.outer.calls == 1:
                        return DummyResponse("")
                    payload = json.dumps({"text": "hello", "emotion": "neutral"})
                    return DummyResponse(payload)

            class _Chat:
                def __init__(self, outer):
                    self.completions = _Completions(outer)

            self.chat = _Chat(self)

    dummy = DummyClient()
    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: dummy)
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result == {"text": "hello", "emotion": "neutral"}
    assert dummy.calls == 2
    assert dummy.tokens == [300, 600]


def test_generate_response_falls_back_to_secondary_model(monkeypatch):
    os.environ["OPENAI_CHAT_MODEL"] = "gpt-5.3-chat-latest"
    os.environ["OPENAI_FALLBACK_MODEL"] = "gpt-4o-mini"

    class DummyClient:
        def __init__(self):
            self.calls = []

            class _Completions:
                def __init__(self, outer):
                    self.outer = outer

                def create(self, model, *args, **kwargs):
                    self.outer.calls.append(model)
                    if model == "gpt-5.3-chat-latest":
                        return DummyResponse("")
                    payload = json.dumps({"text": "hello", "emotion": "neutral"})
                    return DummyResponse(payload)

            class _Chat:
                def __init__(self, outer):
                    self.completions = _Completions(outer)

            self.chat = _Chat(self)

    dummy = DummyClient()
    monkeypatch.setattr(openai, "OpenAI", lambda api_key=None: dummy)
    service = LLMService()

    result = asyncio.run(service.generate_response("hi"))

    assert result == {"text": "hello", "emotion": "neutral"}
    assert dummy.calls == ["gpt-5.3-chat-latest", "gpt-5.3-chat-latest", "gpt-4o-mini"]
