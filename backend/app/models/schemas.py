from pydantic import BaseModel, Field
from typing import Literal

EmotionType = Literal["neutral", "happy", "sad", "surprised", "angry", "relaxed", "wink"]
# Gestures the director can choose; "none" leaves the body as it is.
GestureType = Literal["none", "wave", "nod", "shake", "shrug"]


class ConversationResponse(BaseModel):
    """The character's chat reply; audio_url streams it as speech when a voice is configured."""

    text: str
    audio_url: str
    duration: float


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class TextConversationRequest(BaseModel):
    """Request body for typed text conversation."""

    message: str = Field(default="", max_length=2000)
    # The earlier turns of this conversation. The browser keeps them; the server stores nothing.
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)


class DirectRequest(BaseModel):
    """One line of the conversation to direct."""

    character_id: str = Field(default="mio", max_length=64)
    speaker: Literal["character", "user"]
    line: str = Field(min_length=1, max_length=2000)
    previous: str = Field(default="", max_length=2000)


class DirectResponse(BaseModel):
    """The character's gesture and expression for that line."""

    gesture: GestureType
    emotion: EmotionType
