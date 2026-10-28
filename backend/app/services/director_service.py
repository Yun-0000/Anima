import json
import os
import re
from typing import get_args

import openai

from ..characters import get_character_profile
from ..models.schemas import DirectResponse, Direction, GestureType, EmotionType, Line

DIRECTOR_PROMPT = """You direct the body language of an anime character in a live conversation; you never write dialogue.
For each line, decide what the character's body and face do at that moment, as a real person with their personality would.

Input JSON: character (name), persona (the character's personality, as written to the character), speaker
("character" if the character says the lines, "user" if the user says them and the character is listening, before it
answers), lines (a line of the user, or the sentences of one reply), context (the conversation just before, oldest first).

Most of the time the body needs no gesture: it stands and idles while listening and while speaking, which already looks
alive. Add a gesture only when the moment calls for it, the way a person would: a wave to greet or say goodbye, a nod to
agree or acknowledge, a head shake for "no", a shrug for not knowing, or "explain" to talk with the hands from a
sentence that explains something to the end of the reply. The same gesture line after line looks robotic. The face
shows the feeling of the moment.
Return one direction per line, in order:
{"directions": [{"gesture": "none|wave|nod|shake|shrug|explain", "emotion": "neutral|relaxed|happy|sad|surprised|angry|wink"}]}"""

# Without a key, simple word rules still give the character some body language.
RULES = [
    (r"\b(hi|hello|hey|bye|goodbye|good night|see you)\b", "wave", "happy"),
    (r"\b(i don'?t know|not sure|no idea|maybe|who knows|perhaps)\b", "shrug", "relaxed"),
    (r"\b(no|nope|not really|i don'?t think so)\b", "shake", "neutral"),
    (r"\b(yes|yeah|sure|of course|right|exactly|agreed|okay|ok)\b", "nod", "happy"),
    (r"\b(sorry|sad|miss|tired|lonely)\b", "none", "sad"),
    (r"\b(wow|really\?|no way|what\?)", "none", "surprised"),
]


def by_rules(lines: list[str]) -> DirectResponse:
    return DirectResponse(directions=[rule(line.lower()) for line in lines])


def rule(line: str) -> Direction:
    for pattern, gesture, emotion in RULES:
        if re.search(pattern, line):
            return Direction(gesture=gesture, emotion=emotion)
    return Direction(gesture="none", emotion="neutral")


def checked(direction: dict) -> Direction:
    """Unknown values from the model become "none" and "neutral"."""
    gesture, emotion = direction.get("gesture"), direction.get("emotion")
    return Direction(
        gesture=gesture if gesture in get_args(GestureType) else "none",
        emotion=emotion if emotion in get_args(EmotionType) else "neutral",
    )


class DirectorService:
    """Chooses a gesture and an expression for each spoken line, separately from what is said."""

    def __init__(self):
        key = os.getenv("OPENAI_API_KEY")
        self.client = openai.AsyncOpenAI(api_key=key, timeout=8, max_retries=0) if key else None
        self.model = os.getenv("OPENAI_DIRECTOR_MODEL", "gpt-6-luna")
        # A little thought picks gestures that fit the moment; "none" is fastest.
        self.reasoning = os.getenv("OPENAI_DIRECTOR_REASONING", "low")

    async def direct(self, character_id: str, speaker: str, lines: list[str], context: list[Line]) -> DirectResponse:
        if not self.client:
            return by_rules(lines)
        character = get_character_profile(character_id)
        message = json.dumps({
            "character": character.name, "persona": character.persona, "speaker": speaker, "lines": lines,
            "context": [line.model_dump() for line in context],
        }, ensure_ascii=False)
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": DIRECTOR_PROMPT}, {"role": "user", "content": message}],
                response_format={"type": "json_object"},
                # Reasoning tokens count toward this limit; the answer is about 20 tokens a line.
                max_completion_tokens=20 * len(lines) + (40 if self.reasoning == "none" else 800),
                reasoning_effort=self.reasoning,
                service_tier="priority",
            )
            directions = json.loads(response.choices[0].message.content or "{}")["directions"]
            # A line the model skipped gets no gesture.
            return DirectResponse(directions=[checked(directions[i] if i < len(directions) else {}) for i in range(len(lines))])
        except Exception as exc:
            print(f"[Director] Falling back to rules: {type(exc).__name__}: {exc}")
            return by_rules(lines)
