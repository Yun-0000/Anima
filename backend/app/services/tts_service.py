import base64
import os
from typing import Optional

import httpx


class TTSService:
    """ElevenLabs text-to-speech service for typed Studio responses."""

    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        self.model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_flash_v2_5")
        self.default_voice_id = os.getenv("ELEVENLABS_VOICE_ID")
        self.output_format = os.getenv("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")
        self.base_url = os.getenv("ELEVENLABS_API_BASE_URL", "https://api.elevenlabs.io/v1").rstrip("/")

    async def synthesize(self, text: str, voice_id: str | None = None) -> Optional[tuple[str, float]]:
        if not self.api_key:
            print("[TTS] ELEVENLABS_API_KEY is not configured")
            return None

        selected_voice_id = voice_id or self.default_voice_id
        if not selected_voice_id:
            print("[TTS] ElevenLabs voice ID is not configured")
            return None

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/text-to-speech/{selected_voice_id}",
                    headers={
                        "xi-api-key": self.api_key,
                        "Content-Type": "application/json",
                    },
                    params={"output_format": self.output_format},
                    json={
                        "text": text,
                        "model_id": self.model,
                    },
                )
            response.raise_for_status()

            words = len(text.split())
            duration = (words / 150) * 60
            audio_base64 = base64.b64encode(response.content).decode("ascii")
            audio_url = f"data:audio/mpeg;base64,{audio_base64}"
            print(f"[TTS] Generated transient audio data (~{duration:.2f}s)")
            return audio_url, duration
        except Exception as exc:
            print(f"[TTS] Error: {exc}")
            return None
