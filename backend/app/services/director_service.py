import json
import os
import re
from typing import get_args

import openai

from ..characters import get_character_profile
from ..models.schemas import DirectResponse, GestureType, EmotionType

DIRECTOR_PROMPT = """You direct the body language of an anime character in a live conversation; you never write dialogue.
For one line, decide what the character's body and face do at that moment, as a real person with their personality would.

Input JSON: character (name), speaker ("character" if the character says the line, "user" if the user says it
and the character is listening), line, previous (the line before it, may be empty).

Most of the time the body needs no gesture: it idles while listening and moves along with its words while speaking,
which already looks alive. Add a gesture only when the moment calls for it, the way a person would: a wave to greet or
say goodbye, a nod to agree or acknowledge, a head shake for "no", a shrug for not knowing. The same gesture line after
line looks robotic. The face shows the feeling of the moment.
Return exactly: {"gesture": "none|wave|nod|shake|shrug", "emotion": "neutral|relaxed|happy|sad|surprised|angry|wink"}"""

# Without a key, simple word rules still give the character some body language.
RULES = [
    (r"\b(hi|hello|hey|bye|goodbye|good night|see you)\b", "wave", "happy"),
    (r"\b(i don'?t know|not sure|no idea|maybe|who knows|perhaps)\b", "shrug", "relaxed"),
    (r"\b(no|nope|not really|i don'?t think so)\b", "shake", "neutral"),
    (r"\b(yes|yeah|sure|of course|right|exactly|agreed|okay|ok)\b", "nod", "happy"),
    (r"\b(sorry|sad|miss|tired|lonely)\b", "none", "sad"),
    (r"\b(wow|really\?|no way|what\?)", "none", "surprised"),
]


def by_rules(line: str) -> DirectResponse:
    lower = line.lower()
    for pattern, gesture, emotion in RULES:
        if re.search(pattern, lower):
            return DirectResponse(gesture=gesture, emotion=emotion)
    return DirectResponse(gesture="none", emotion="neutral")


class DirectorService:
    """Chooses a gesture and an expression for each spoken line, separately from what is said."""

    def __init__(self):
        key = os.getenv("OPENAI_API_KEY")
        self.client = openai.AsyncOpenAI(api_key=key, timeout=8, max_retries=0) if key else None
        self.model = os.getenv("OPENAI_DIRECTOR_MODEL", "gpt-6-luna")
        # A little thought picks gestures that fit the moment; "none" is fastest.
        self.reasoning = os.getenv("OPENAI_DIRECTOR_REASONING", "low")

    async def direct(self, character_id: str, speaker: str, line: str, previous: str = "") -> DirectResponse:
        if not self.client:
            return by_rules(line)
        message = json.dumps({"character": get_character_profile(character_id).name, "speaker": speaker, "line": line, "previous": previous}, ensure_ascii=False)
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": DIRECTOR_PROMPT}, {"role": "user", "content": message}],
                response_format={"type": "json_object"},
                # Reasoning tokens count toward this limit; the answer itself is about 20 tokens.
                max_completion_tokens=60 if self.reasoning == "none" else 800,
                reasoning_effort=self.reasoning,
                service_tier="priority",
            )
            data = json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            print(f"[Director] Falling back to rules: {type(exc).__name__}: {exc}")
            return by_rules(line)
        gesture = data.get("gesture") if data.get("gesture") in get_args(GestureType) else "none"
        emotion = data.get("emotion") if data.get("emotion") in get_args(EmotionType) else "neutral"
        return DirectResponse(gesture=gesture, emotion=emotion)
