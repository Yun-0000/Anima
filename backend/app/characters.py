from dataclasses import dataclass

from .prompts.character_prompt import (
    CHARACTER_SYSTEM_PROMPT,
    HANS_REALTIME_PROMPT,
    HANS_SYSTEM_PROMPT,
    JANE_REALTIME_PROMPT,
)

DEFAULT_CHARACTER_ID = "jane"
CHARACTER_ALIASES = {
    "sora": DEFAULT_CHARACTER_ID,
}


@dataclass(frozen=True)
class CharacterProfile:
    id: str
    name: str
    system_prompt: str
    realtime_prompt: str
    greeting_text: str
    greeting_emotion: str
    greeting_action: str
    openai_voice: str
    voice_id: str | None = None


CHARACTER_PROFILES = {
    "jane": CharacterProfile(
        id="jane",
        name="Jane",
        system_prompt=CHARACTER_SYSTEM_PROMPT,
        realtime_prompt=JANE_REALTIME_PROMPT,
        greeting_text="Hi, What do you want to talk about today?",
        greeting_emotion="neutral",
        greeting_action="wave",
        openai_voice="marin",
    ),
    "hans": CharacterProfile(
        id="hans",
        name="Hans",
        system_prompt=HANS_SYSTEM_PROMPT,
        realtime_prompt=HANS_REALTIME_PROMPT,
        greeting_text="Hey, I'm Hans. What's on your mind?",
        greeting_emotion="relaxed",
        greeting_action="wave",
        openai_voice="cedar",
    ),
}


def get_character_profile(character_id: str | None) -> CharacterProfile:
    if not character_id:
        return CHARACTER_PROFILES[DEFAULT_CHARACTER_ID]

    normalized_character_id = CHARACTER_ALIASES.get(character_id.lower(), character_id.lower())
    return CHARACTER_PROFILES.get(normalized_character_id, CHARACTER_PROFILES[DEFAULT_CHARACTER_ID])
