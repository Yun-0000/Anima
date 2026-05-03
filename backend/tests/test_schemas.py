from pathlib import Path
import sys
from typing import get_args

import pytest
from pydantic import ValidationError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models.schemas import ActionType, ConversationResponse


def test_conversation_response_schema():
    response = ConversationResponse(
        text="hello",
        emotion="neutral",
        action="idle",
        audio_url="data:audio/mpeg;base64,bXAz",
        duration=1.2,
    )

    assert response.text == "hello"
    assert response.audio_url == "data:audio/mpeg;base64,bXAz"


def test_action_type_lists_supported_actions():
    assert get_args(ActionType) == ("idle", "sadIdle", "talking", "wave", "nod", "shake")


def test_conversation_response_schema_rejects_unknown_action():
    with pytest.raises(ValidationError):
        ConversationResponse(
            text="hello",
            emotion="neutral",
            action="invalid",
            audio_url="data:audio/mpeg;base64,bXAz",
            duration=1.2,
        )
