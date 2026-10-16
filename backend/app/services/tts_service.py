import os
from collections import OrderedDict
from typing import AsyncIterator
from uuid import uuid4

import httpx

from ..characters import CharacterProfile, voice_id


class TTSService:
    """Streams chat replies as speech in the character's ElevenLabs voice, so playback starts with the first audio."""

    def __init__(self):
        self.key = os.getenv("ELEVENLABS_API_KEY")
        # Eleven v4 Turbo ranks first in blind tests; streamed, its first audio comes in about 0.2 s.
        self.model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_v4_turbo")
        # Kept in memory by one server process; a shared store is needed if the backend runs several workers.
        self.pending: OrderedDict[str, tuple[str, CharacterProfile]] = OrderedDict()

    def prepare(self, text: str, character: CharacterProfile) -> str:
        """Keeps a reply for /api/speech/{id}, so only replies the server wrote can be spoken."""
        speech_id = uuid4().hex
        self.pending[speech_id] = (text, character)
        while len(self.pending) > 50:
            self.pending.popitem(last=False)
        return speech_id

    async def stream(self, text: str, character: CharacterProfile) -> AsyncIterator[bytes]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                async with client.stream(
                    "POST",
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id(character)}/stream",
                    headers={"xi-api-key": self.key},
                    params={"output_format": "mp3_44100_128"},
                    json={"text": text, "model_id": self.model},
                ) as response:
                    if response.status_code != 200:
                        print(f"[TTS] ElevenLabs answered {response.status_code}")
                        return
                    async for chunk in response.aiter_bytes():
                        yield chunk
        except httpx.HTTPError as exc:
            print(f"[TTS] Error: {type(exc).__name__}: {exc}")
