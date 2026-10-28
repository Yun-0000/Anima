from pydantic import BaseModel, Field
from typing import Annotated, Literal

EmotionType = Literal["neutral", "happy", "sad", "surprised", "angry", "relaxed", "wink"]
# Gestures the director can choose; "none" leaves the body as it is.
GestureType = Literal["none", "wave", "nod", "shake", "shrug", "explain"]


class ConversationResponse(BaseModel):
    """The character's chat reply; audio_url streams it as speech when a voice is configured."""

    text: str
    audio_url: str
    duration: float


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class TextConversationRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    # The earlier turns of this conversation. The browser keeps them; the server stores nothing.
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class Line(BaseModel):
    speaker: Literal["character", "user"]
    text: str = Field(min_length=1, max_length=2000)


class DirectRequest(BaseModel):
    character_id: str = Field(default="mio", max_length=64)
    speaker: Literal["character", "user"]
    lines: list[Annotated[str, Field(min_length=1, max_length=2000)]] = Field(min_length=1, max_length=16)
    context: list[Line] = Field(default_factory=list, max_length=8)


class Direction(BaseModel):
    gesture: GestureType
    emotion: EmotionType


class DirectResponse(BaseModel):
    directions: list[Direction]
