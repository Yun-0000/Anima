import json
import os
from typing import Any

import httpx

from ..characters import get_character_profile


class RealtimeService:
    """Builds OpenAI speech-to-speech realtime sessions."""

    def has_openai_key(self) -> bool:
        return bool(os.getenv("OPENAI_API_KEY"))

    def interaction_config(self) -> dict[str, Any]:
        openai_configured = self.has_openai_key()

        return {
            "text_mode": {"enabled": True},
            "voice_mode": {
                "enabled": openai_configured,
                "provider": "openai" if openai_configured else None,
                "providers": {
                    "openai": {"configured": openai_configured},
                },
                "reason": None
                if openai_configured
                else "Set OPENAI_API_KEY to enable voice mode.",
            },
        }

    def build_openai_session_config(self, character_id: str) -> dict[str, Any]:
        character = get_character_profile(character_id)
        realtime_instructions = (
            f"{character.realtime_prompt}\n\n"
            "You are now running inside a realtime speech-to-speech anime character studio. "
            "Respond with short, natural spoken lines. Speak directly first. Avatar motion is "
            "handled by the client from the spoken transcript, so do not describe body motions "
            "or animation metadata in your response."
        )

        return {
            "type": "realtime",
            "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime-1.5"),
            "instructions": realtime_instructions,
            "audio": {
                "input": {
                    "transcription": {
                        "model": os.getenv("OPENAI_REALTIME_TRANSCRIBE_MODEL", "gpt-4o-transcribe"),
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.45,
                        "prefix_padding_ms": 200,
                        "silence_duration_ms": 300,
                        "create_response": True,
                        "interrupt_response": True,
                    },
                },
                "output": {
                    "voice": self._openai_voice_for_character(character.id, character.openai_voice),
                },
            },
        }

    async def create_openai_call(self, sdp: str, character_id: str) -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise PermissionError("OpenAI voice mode requires OPENAI_API_KEY.")

        session_config = self.build_openai_session_config(character_id)
        files = {
            "sdp": (None, sdp, "application/sdp"),
            "session": (None, json.dumps(session_config), "application/json"),
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/calls",
                headers={"Authorization": f"Bearer {api_key}"},
                files=files,
            )

        if response.status_code >= 400:
            raise RuntimeError(f"OpenAI realtime call failed: {response.status_code} {response.text}")

        return response.text

    def _openai_voice_for_character(self, character_id: str, default_voice: str) -> str:
        character_override = os.getenv(f"OPENAI_REALTIME_VOICE_{character_id.upper()}")
        return character_override or os.getenv("OPENAI_REALTIME_VOICE", default_voice)
