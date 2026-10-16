import asyncio
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

import app.services.conversation_service as conv_module
from app.models.schemas import ChatTurn


class DummyLLM:
    def __init__(self, reply):
        self.answer, self.calls = reply, []

    async def reply(self, message, system_prompt, history):
        self.calls.append({"message": message, "system_prompt": system_prompt, "history": history})
        return self.answer


class DummyTTS:
    def __init__(self):
        self.calls = []

    def prepare(self, text, character):
        self.calls.append({"text": text, "character": character.id})
        return "abc"


def service(monkeypatch, llm=None, tts=None):
    for name, value in (("OPENAI_API_KEY", llm), ("ELEVENLABS_API_KEY", tts)):
        if value:
            monkeypatch.setenv(name, "test-key")
        else:
            monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(conv_module, "LLMService", lambda: llm)
    monkeypatch.setattr(conv_module, "TTSService", lambda: tts)
    return conv_module.ConversationService()


def test_a_reply_comes_with_a_speech_url_in_the_character_voice(monkeypatch):
    llm, tts = DummyLLM("Mio answers clearly."), DummyTTS()
    result = asyncio.run(service(monkeypatch, llm, tts).process_text("Can you explain this?", character_id="mio"))

    assert (result.text, result.audio_url, result.duration) == ("Mio answers clearly.", "/api/speech/abc", 1.2)
    assert "You are Mio" in llm.calls[0]["system_prompt"]
    assert tts.calls == [{"text": "Mio answers clearly.", "character": "mio"}]


def test_earlier_turns_go_back_to_the_model(monkeypatch):
    llm = DummyLLM("Your cat, Miso.")
    history = [ChatTurn(role="user", content="My cat is Miso."), ChatTurn(role="assistant", content="Cute name!")]
    asyncio.run(service(monkeypatch, llm).process_text("Who is Miso?", history=history))
    assert llm.calls[0]["history"] == [{"role": "user", "content": "My cat is Miso."}, {"role": "assistant", "content": '{"text": "Cute name!"}'}]


def test_without_a_voice_the_reply_is_text_only(monkeypatch):
    result = asyncio.run(service(monkeypatch, DummyLLM("Hi.")).process_text("hello"))
    assert (result.text, result.audio_url) == ("Hi.", "")


def test_without_an_openai_key_the_reply_is_scripted(monkeypatch):
    result = asyncio.run(service(monkeypatch).process_text("hey there", character_id="kai"))
    assert result.text == "Hi! It's Kai. Nice to see you." and result.audio_url == ""
    # "this" contains "hi" but is not a greeting.
    assert asyncio.run(service(monkeypatch).process_text("I like this")).text == "Yes, I heard you: I like this"


def test_a_failed_reply_is_reported_as_none(monkeypatch):
    assert asyncio.run(service(monkeypatch, DummyLLM(None)).process_text("hello")) is None


def test_speech_length_counts_words_and_cjk_characters():
    assert conv_module.speech_seconds("one two three four five") == 2.0
    assert round(conv_module.speech_seconds("今天挺安静的，睡了个午觉。"), 1) == 2.4
