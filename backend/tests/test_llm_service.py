import asyncio
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.llm_service import LLMService


def service_answering(monkeypatch, content=None, error=None):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_CHAT_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_CHAT_REASONING", raising=False)
    service, seen = LLMService(), {}

    class Message:
        pass

    async def create(**kwargs):
        seen.update(kwargs)
        if error:
            raise error
        message = Message(); message.content = content
        choice = Message(); choice.message = message
        response = Message(); response.choices = [choice]
        return response

    monkeypatch.setattr(service.client.chat.completions, "create", create)
    return service, seen


def test_reply_sends_prompt_history_and_message_on_the_fast_settings(monkeypatch):
    service, seen = service_answering(monkeypatch, '{"text": "  Hello there.  "}')
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": '{"text": "hey"}'}]

    assert asyncio.run(service.reply("how are you?", "You are Kai.", history)) == "Hello there."
    assert seen["model"] == "gpt-6-luna"
    assert seen["messages"] == [{"role": "system", "content": "You are Kai."}, *history, {"role": "user", "content": "how are you?"}]
    assert seen["reasoning_effort"] == "none" and seen["service_tier"] == "priority" and seen["max_completion_tokens"] == 300


def test_reply_is_none_when_the_model_fails_or_says_nothing(monkeypatch):
    service, _ = service_answering(monkeypatch, error=RuntimeError("boom"))
    assert asyncio.run(service.reply("hi", "p", [])) is None
    service, _ = service_answering(monkeypatch, '{"text": ""}')
    assert asyncio.run(service.reply("hi", "p", [])) is None
    service, _ = service_answering(monkeypatch, "not json")
    assert asyncio.run(service.reply("hi", "p", [])) is None
