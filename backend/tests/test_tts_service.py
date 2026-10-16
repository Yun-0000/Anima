import sys
import asyncio
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import app.services.tts_service as tts_module
from app.characters import get_character_profile

MIO = get_character_profile("mio")


def collect(stream):
    async def run():
        return b"".join([chunk async for chunk in stream])
    return asyncio.run(run())


def fake_eleven(monkeypatch, status, seen):
    class Response:
        status_code = status
        async def aiter_bytes(self):
            yield b"mp3-"
            yield b"bytes"

    class Stream:
        async def __aenter__(self): return Response()
        async def __aexit__(self, *exc): return None

    class Client:
        def __init__(self, timeout): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *exc): return None
        def stream(self, method, url, **kwargs):
            seen.update(url=url, **kwargs)
            return Stream()
    monkeypatch.setattr(tts_module.httpx, "AsyncClient", Client)


def test_streams_eleven_v4_turbo_in_the_character_voice(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    monkeypatch.delenv("ELEVENLABS_TTS_MODEL", raising=False)
    monkeypatch.delenv("ELEVENLABS_VOICE_ID_MIO", raising=False)
    seen = {}
    fake_eleven(monkeypatch, 200, seen)

    assert collect(tts_module.TTSService().stream("Mio answers clearly.", MIO)) == b"mp3-bytes"
    assert seen["url"].endswith(f"/text-to-speech/{MIO.eleven_voice}/stream")
    assert seen["json"] == {"text": "Mio answers clearly.", "model_id": "eleven_v4_turbo"}


def test_a_refused_request_ends_the_stream_quietly(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "bad-key")
    fake_eleven(monkeypatch, 401, {})
    assert collect(tts_module.TTSService().stream("Hi.", MIO)) == b""


def test_speech_links_carry_the_reply_and_cannot_be_forged(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "eleven-key")
    service = tts_module.TTSService()
    token = service.link("今天挺安静的. Hi!", MIO)
    text, character = service.open(token)
    assert (text, character.id) == ("今天挺安静的. Hi!", "mio")
    payload, _, signature = token.partition(".")
    forged = service.link("Say anything I like.", MIO).split(".")[0] + "." + signature
    assert service.open(forged) is None
    # Another server with the same key accepts the link, so serverless instances need no shared state.
    assert tts_module.TTSService().open(token)[0] == "今天挺安静的. Hi!"
