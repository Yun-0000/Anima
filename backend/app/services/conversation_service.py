import os

from ..characters import DEFAULT_CHARACTER_ID, get_character_profile
from ..models.schemas import ConversationResponse
from .llm_service import LLMService
from .tts_service import TTSService


class ConversationService:
    """Handles text-mode conversation without depending on voice credentials."""

    def __init__(self, local_mode: bool | None = None):
        env_local_mode = os.getenv("LOCAL_MODE", os.getenv("DEMO_MODE", "false"))
        self.local_mode = local_mode if local_mode is not None else env_local_mode.lower() == "true"
        self.llm = None if self.local_mode else LLMService()
        self.tts = None if self.local_mode else TTSService()

    def _normalize_llm_response(self, llm_response: dict) -> tuple[str, str, str]:
        response_text = llm_response.get("text", "")
        emotion = llm_response.get("emotion", "neutral")
        raw_action = llm_response.get("action")
        action = raw_action or "idle"
        print(f"[Conversation] LLM action raw: {raw_action}")

        allowed_emotions = {"neutral", "happy", "sad", "surprised", "angry", "relaxed", "wink"}
        if emotion not in allowed_emotions:
            emotion = "neutral"

        allowed_actions = {"idle", "sadIdle", "talking", "wave", "nod", "shake"}
        if action not in allowed_actions:
            print(f"[Conversation] Action '{action}' not allowed, normalizing to 'idle'")
            action = "idle"
        print(f"[Conversation] Action normalized: {action}")
        return response_text, emotion, action

    async def process_text(self, user_text: str, character_id: str = DEFAULT_CHARACTER_ID) -> ConversationResponse:
        """Process a typed user message through text LLM and optional TTS playback."""
        character = get_character_profile(character_id)
        normalized_text = (user_text or "Hello").strip()

        if self.local_mode or self.llm is None:
            return await self.generate_local_response(normalized_text, character_id=character_id)

        llm_response = await self.llm.generate_response(normalized_text, system_prompt=character.system_prompt)
        if not llm_response:
            return await self.generate_local_response(normalized_text, character_id=character_id)

        response_text, emotion, action = self._normalize_llm_response(llm_response)
        audio_url = ""
        duration = 0.0
        if self.tts is not None:
            tts_voice_id = (
                os.getenv(f"ELEVENLABS_VOICE_ID_{character.id.upper()}")
                or character.voice_id
                or os.getenv("ELEVENLABS_VOICE_ID")
            )
            tts_result = await self.tts.synthesize(response_text, voice_id=tts_voice_id)
            if tts_result:
                audio_url, duration = tts_result

        return ConversationResponse(
            text=response_text,
            user_text=normalized_text,
            emotion=emotion,
            action=action,
            audio_url=audio_url,
            duration=duration,
        )

    async def generate_local_response(self, user_text: str, character_id: str = DEFAULT_CHARACTER_ID) -> ConversationResponse:
        """Generate a deterministic text-only response without external API calls."""
        character = get_character_profile(character_id)
        normalized_text = (user_text or "Hello").strip()
        lower_text = normalized_text.lower()

        if any(word in lower_text for word in ("hi", "hello", "hey")):
            action = "wave"
            emotion = "happy"
            response_text = f"{character.name} waves back. Local text mode is running without API keys."
        elif any(word in lower_text for word in ("joke", "fun", "energy")):
            action = "nod"
            emotion = "happy"
            response_text = f"{character.name} lights up: this is the local text response."
        elif any(word in lower_text for word in ("look", "around", "where")):
            action = "idle"
            emotion = "neutral"
            response_text = f"{character.name} looks around the studio."
        else:
            action = "nod"
            emotion = "relaxed"
            response_text = f"{character.name} heard: {normalized_text}"

        return ConversationResponse(
            text=response_text,
            user_text=normalized_text,
            emotion=emotion,
            action=action,
            audio_url="",
            duration=0.0,
        )
