from pathlib import Path
import sys
from typing import get_args

import pytest
from pydantic import ValidationError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models.schemas import DirectRequest, DirectResponse, GestureType


def test_gestures_the_director_can_choose():
    assert get_args(GestureType) == ("none", "wave", "nod", "shake", "shrug", "explain")


def test_direct_schemas_reject_unknown_values():
    with pytest.raises(ValidationError):
        DirectResponse(directions=[{"gesture": "backflip", "emotion": "neutral"}])
    with pytest.raises(ValidationError):
        DirectRequest(speaker="narrator", lines=["hi"])
