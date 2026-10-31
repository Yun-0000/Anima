import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..characters import get_character_profile, voice_id
from ..rate_limit import limit

router = APIRouter(prefix="/api", tags=["voice"])


class LiveRequest(BaseModel):
    character_id: str = Field(default="mio", max_length=64)


def voice_configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_AGENT_ID"))


@router.get("/interaction-config")
def get_interaction_config():
    return {"voice_enabled": voice_configured()}


def session_overrides(character_id: str) -> dict:
    """The character's prompt and voice for one session, in the ElevenLabs client's format."""
    character = get_character_profile(character_id)
    return {"agent": {"prompt": {"prompt": character.voice_prompt}, "firstMessage": ""}, "tts": {"voiceId": voice_id(character)}}


@router.post("/live/sessions", dependencies=[Depends(limit("voice", 10, 3600))])
async def create_live_session(request: LiveRequest):
    """A one-time token for a WebRTC conversation with the voice agent; the API key stays on the server."""
    if not voice_configured():
        raise HTTPException(status_code=403, detail="Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to enable voice mode.")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://api.elevenlabs.io/v1/convai/conversation/token",
                params={"agent_id": os.getenv("ELEVENLABS_AGENT_ID")},
                headers={"xi-api-key": os.getenv("ELEVENLABS_API_KEY")},
            )
    except httpx.HTTPError as exc:
        print(f"[Voice] Token request failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Could not reach ElevenLabs to start voice.") from exc
    if response.status_code >= 400:
        print(f"[Voice] Token request failed: {response.status_code} {response.text[:500]}")
        raise HTTPException(status_code=502, detail="ElevenLabs did not start the voice session.")
    return {"conversation_token": response.json()["token"], "overrides": session_overrides(request.character_id)}
