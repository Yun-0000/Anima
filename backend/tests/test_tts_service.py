import sys
import asyncio
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import app.services.tts_service as tts_module


class DummyElevenLabsResponse:
    content = b"mp3-bytes"

    def raise_for_status(self):
        return None


class DummyAsyncClient:
    def __init__(self, timeout):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    async def post(self, url, *, headers, params, json):
        DummyAsyncClient.request = {
            "url": url,
            "headers": headers,
            "params": params,
            "json": json,
        }
        return DummyElevenLabsResponse()


def test_synthesize_calls_elevenlabs_and_returns_transient_audio_data(monkeypatch, tmp_path):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")
    monkeypatch.setattr(tts_module.httpx, "AsyncClient", DummyAsyncClient)

    service = tts_module.TTSService()

    result = asyncio.run(service.synthesize("Jane answers clearly.", voice_id="voice-123"))

    assert result == ("data:audio/mpeg;base64,bXAzLWJ5dGVz", 1.2)
    assert list(tmp_path.iterdir()) == []
    assert DummyAsyncClient.request == {
        "url": "https://api.elevenlabs.io/v1/text-to-speech/voice-123",
        "headers": {
            "xi-api-key": "test-key",
            "Content-Type": "application/json",
        },
        "params": {"output_format": "mp3_44100_128"},
        "json": {
            "text": "Jane answers clearly.",
            "model_id": "eleven_flash_v2_5",
        },
    }


def test_synthesize_returns_none_without_elevenlabs_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    service = tts_module.TTSService()

    assert asyncio.run(service.synthesize("hello", voice_id="voice-123")) is None


def test_synthesize_returns_none_without_voice_id(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.delenv("ELEVENLABS_VOICE_ID", raising=False)

    service = tts_module.TTSService()

    assert asyncio.run(service.synthesize("hello")) is None
