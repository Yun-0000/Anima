import json
import os
from typing import Any

import openai
from pydantic import ValidationError

from ..characters import get_character_profile
from ..models.schemas import MotionPlanResponse


MOTION_SYSTEM_PROMPT = """
You are the motion and expression director for a realtime anime character.
You do not write dialogue. You only choose one JSON object for the avatar.

Inputs:
- user_text: the user's speech-to-text transcript
- assistant_text: the line the character just spoke
- character: the active character

Return exactly:
{
  "emotion": "neutral|happy|sad|surprised|angry|relaxed|wink",
  "action": "idle|sadIdle|talking|wave|nod|shake"
}

Rules:
- Prefer idle for ordinary replies. Lip sync already handles speech.
- Do not choose talking just because the character is speaking.
- Choose wave only for a clear greeting or farewell.
- Choose nod only for clear agreement, encouragement, or acknowledgement.
- Choose shake only for disagreement, correction, or refusal.
- Choose sadIdle only for sadness, sympathy, or a serious emotional moment.
- If the motion would feel repetitive, unrelated, or too theatrical, choose idle.
"""


class MotionService:
    """Plans avatar emotion and body motion from voice transcripts."""

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        self.client = openai.OpenAI(api_key=self.openai_api_key) if self.openai_api_key else None
        self.model = os.getenv("OPENAI_MOTION_MODEL", "gpt-5.4-mini")

    async def plan_motion(
        self,
        user_text: str,
        assistant_text: str,
        character_id: str = "jane",
    ) -> MotionPlanResponse:
        if not self.client:
            return self._idle()

        character = get_character_profile(character_id)
        user_message = json.dumps(
            {
                "character": character.id,
                "user_text": user_text,
                "assistant_text": assistant_text,
            },
            ensure_ascii=False,
        )
        request_kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": MOTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "response_format": {"type": "json_object"},
        }
        if self.model.startswith("gpt-5"):
            request_kwargs["max_completion_tokens"] = 80
        else:
            request_kwargs["temperature"] = 0.2
            request_kwargs["max_tokens"] = 80

        try:
            response = self.client.chat.completions.create(**request_kwargs)
            content = response.choices[0].message.content
            if not content:
                return self._idle()
            return MotionPlanResponse.model_validate(json.loads(content))
        except (IndexError, AttributeError, json.JSONDecodeError, ValidationError, Exception) as exc:
            print(f"[Motion] Falling back to idle: {exc}")
            return self._idle()

    def _idle(self) -> MotionPlanResponse:
        return MotionPlanResponse(emotion="neutral", action="idle")
