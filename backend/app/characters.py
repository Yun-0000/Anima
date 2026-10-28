import os
from dataclasses import dataclass

from .prompts.character_prompt import KAI_PERSONA, MIO_PERSONA, RIN_PERSONA, text_prompt, voice_prompt

DEFAULT_CHARACTER_ID = "mio"


@dataclass(frozen=True)
class CharacterProfile:
    id: str
    name: str
    persona: str
    system_prompt: str
    voice_prompt: str
    # The character's ElevenLabs voice in both modes; ELEVENLABS_VOICE_ID_<ID> overrides it.
    eleven_voice: str


def _profile(id: str, name: str, persona: str, eleven_voice: str) -> CharacterProfile:
    return CharacterProfile(id=id, name=name, persona=persona, system_prompt=text_prompt(persona), voice_prompt=voice_prompt(persona), eleven_voice=eleven_voice)


CHARACTER_PROFILES = {
    profile.id: profile
    for profile in (
        _profile("mio", "Mio", MIO_PERSONA, "XlDdozLmuTofIxK4BjPD"),  # Chosen from the ElevenLabs voice library
        _profile("rin", "Rin", RIN_PERSONA, "gE0owC0H9C8SzfDyIUtB"),  # Chosen from the ElevenLabs voice library
        _profile("kai", "Kai", KAI_PERSONA, "TX3LPaxmHKxFdv7VOQHJ"),  # Liam: young, energetic
    )
}


def voice_id(character: CharacterProfile) -> str:
    return os.getenv(f"ELEVENLABS_VOICE_ID_{character.id.upper()}") or character.eleven_voice


def get_character_profile(character_id: str | None) -> CharacterProfile:
    return CHARACTER_PROFILES.get((character_id or "").lower(), CHARACTER_PROFILES[DEFAULT_CHARACTER_ID])
