import asyncio
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import app.services.conversation_service as conv_module


class DummyLLM:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def generate_response(self, user_message: str, system_prompt: str | None = None):
        self.calls.append({"user_message": user_message, "system_prompt": system_prompt})
        return self.response


class DummyTTS:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def synthesize(self, text: str, voice_id: str | None = None):
        self.calls.append({"text": text, "voice_id": voice_id})
        return self.result


def test_process_text_uses_llm_and_tts_pipeline(monkeypatch):
    llm = DummyLLM({"text": "Jane answers clearly.", "emotion": "happy", "action": "nod"})
    tts = DummyTTS(("data:audio/mpeg;base64,jane-audio", 1.4))
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)
    monkeypatch.setenv("ELEVENLABS_VOICE_ID_JANE", "jane-voice")
    monkeypatch.setattr(conv_module, "LLMService", lambda: llm)
    monkeypatch.setattr(conv_module, "TTSService", lambda: tts, raising=False)

    service = conv_module.ConversationService()
    result = asyncio.run(service.process_text("Can you explain this?", character_id="jane"))

    assert result is not None
    assert result.text == "Jane answers clearly."
    assert result.user_text == "Can you explain this?"
    assert result.emotion == "happy"
    assert result.action == "nod"
    assert result.audio_url == "data:audio/mpeg;base64,jane-audio"
    assert result.duration == 1.4
    assert "You are Jane" in llm.calls[0]["system_prompt"]
    assert tts.calls == [{"text": "Jane answers clearly.", "voice_id": "jane-voice"}]


def test_process_text_uses_global_voice_when_character_voice_is_not_set(monkeypatch):
    llm = DummyLLM({"text": "Hans answers clearly.", "emotion": "relaxed", "action": "nod"})
    tts = DummyTTS(("data:audio/mpeg;base64,hans-audio", 1.2))
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "global-voice")
    monkeypatch.delenv("ELEVENLABS_VOICE_ID_HANS", raising=False)
    monkeypatch.setattr(conv_module, "LLMService", lambda: llm)
    monkeypatch.setattr(conv_module, "TTSService", lambda: tts, raising=False)

    service = conv_module.ConversationService()
    result = asyncio.run(service.process_text("Can you explain this?", character_id="hans"))

    assert result is not None
    assert result.audio_url == "data:audio/mpeg;base64,hans-audio"
    assert tts.calls == [{"text": "Hans answers clearly.", "voice_id": "global-voice"}]


def test_process_text_normalizes_unknown_action_to_idle(monkeypatch):
    monkeypatch.setattr(
        conv_module,
        "LLMService",
        lambda: DummyLLM({"text": "hi", "emotion": "neutral", "action": "invalid"}),
    )

    service = conv_module.ConversationService()
    result = asyncio.run(service.process_text("hello"))

    assert result is not None
    assert result.action == "idle"


def test_process_text_allows_wink_emotion(monkeypatch):
    monkeypatch.setattr(
        conv_module,
        "LLMService",
        lambda: DummyLLM({"text": "hi", "emotion": "wink", "action": "idle"}),
    )

    service = conv_module.ConversationService()
    result = asyncio.run(service.process_text("hello"))

    assert result is not None
    assert result.emotion == "wink"


def test_local_response_does_not_call_external_services():
    service = conv_module.ConversationService(local_mode=True)
    result = asyncio.run(service.generate_local_response("Show me your energy", character_id="jane"))

    assert result is not None
    assert result.user_text == "Show me your energy"
    assert result.audio_url == ""
    assert result.duration == 0
    assert result.action in {"idle", "sadIdle", "talking", "wave", "nod", "shake"}
    assert result.action != "talking"


def test_process_text_falls_back_to_local_response_when_llm_unavailable(monkeypatch):
    monkeypatch.setattr(conv_module, "LLMService", lambda: DummyLLM(None))

    service = conv_module.ConversationService()
    result = asyncio.run(service.process_text("hello", character_id="jane"))

    assert result is not None
    assert result.user_text == "hello"
    assert result.audio_url == ""
    assert "Local text mode" in result.text
