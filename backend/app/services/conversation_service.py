import json
import os
import re
from typing import Optional

from ..characters import DEFAULT_CHARACTER_ID, get_character_profile
from ..models.schemas import ChatTurn, ConversationResponse
from .llm_service import LLMService
from .tts_service import TTSService


def speech_seconds(text: str) -> float:
    """About how long a reply takes to say: 2.5 words a second, or 4.5 characters a second in Chinese, Japanese and Korean."""
    cjk = len(re.findall(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]", text))
    words = len(re.findall(r"\w+", re.sub(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]", " ", text)))
    return words / 2.5 + cjk / 4.5


def scripted_reply(text: str, name: str) -> str:
    """A few canned lines, so the app can be tried without an OpenAI key."""
    if re.search(r"\b(hi|hello|hey|wave)\b", text, re.I):
        return f"Hi! It's {name}. Nice to see you."
    if "?" in text:
        return "Hmm, I'm not sure. Without an OpenAI key I can only say a few things."
    return f"Yes, I heard you: {text}"


class ConversationService:
    """Chat: the character's reply, and a URL that streams it as speech."""

    def __init__(self):
        self.llm = LLMService() if os.getenv("OPENAI_API_KEY") else None
        self.tts = TTSService() if os.getenv("ELEVENLABS_API_KEY") else None

    async def process_text(self, user_text: str, character_id: str = DEFAULT_CHARACTER_ID, history: list[ChatTurn] = ()) -> Optional[ConversationResponse]:
        """None when the model could not answer."""
        character = get_character_profile(character_id)
        text = (user_text or "Hello").strip()
        if self.llm is None:
            return ConversationResponse(text=scripted_reply(text, character.name), audio_url="", duration=0)

        # Earlier replies go back as the JSON the model wrote, so it keeps answering in that format.
        earlier = [
            {"role": turn.role, "content": json.dumps({"text": turn.content}, ensure_ascii=False) if turn.role == "assistant" else turn.content}
            for turn in history
        ]
        reply = await self.llm.reply(text, character.system_prompt, earlier)
        if reply is None:
            return None
        if self.tts is None:
            return ConversationResponse(text=reply, audio_url="", duration=0)
        # The browser streams the speech from this URL, so the text arrives without waiting for audio.
        return ConversationResponse(text=reply, audio_url=f"/api/speech/{self.tts.link(reply, character)}", duration=speech_seconds(reply))
