import base64
import hashlib
import hmac
import json
import os
from typing import AsyncIterator, Optional

import httpx

from ..characters import CharacterProfile, get_character_profile, voice_id


class TTSService:
    """Streams chat replies as speech in the character's ElevenLabs voice, so playback starts with the first audio."""

    def __init__(self):
        self.key = os.getenv("ELEVENLABS_API_KEY")
        # Eleven v4 Turbo ranks first in blind tests; streamed, its first audio comes in about 0.2 s.
        self.model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_v4_turbo")
        self.secret = hashlib.sha256(f"anima-speech:{self.key}".encode()).digest()

    def link(self, text: str, character: CharacterProfile) -> str:
        """A signed speech link: only replies the server wrote can be spoken, and any server instance can check it."""
        payload = base64.urlsafe_b64encode(json.dumps([character.id, text], ensure_ascii=False).encode()).decode().rstrip("=")
        return f"{payload}.{self._sign(payload)}"

    def open(self, token: str) -> Optional[tuple[str, CharacterProfile]]:
        payload, _, signature = token.partition(".")
        if not hmac.compare_digest(signature, self._sign(payload)):
            return None
        character_id, text = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return text, get_character_profile(character_id)

    def _sign(self, payload: str) -> str:
        return hmac.new(self.secret, payload.encode(), "sha256").hexdigest()[:32]

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
