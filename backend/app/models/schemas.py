from pydantic import BaseModel
from typing import Literal

EmotionType = Literal["neutral", "happy", "sad", "surprised", "angry", "relaxed", "wink"]
ActionType = Literal["idle", "sadIdle", "talking", "wave", "nod", "shake"]


class ConversationResponse(BaseModel):
    """Response from conversation API"""

    text: str
    user_text: str = ""
    emotion: EmotionType
    action: ActionType
    audio_url: str
    duration: float


class TextConversationRequest(BaseModel):
    """Request body for typed text conversation."""

    message: str = ""


class MotionPlanRequest(BaseModel):
    """Request body for voice-driven avatar motion planning."""

    user_text: str = ""
    assistant_text: str = ""


class MotionPlanResponse(BaseModel):
    """Avatar expression and body motion chosen by the motion planner."""

    emotion: EmotionType
    action: ActionType
