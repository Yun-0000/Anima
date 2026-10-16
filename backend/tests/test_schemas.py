from pathlib import Path
import sys
from typing import get_args

import pytest
from pydantic import ValidationError

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.models.schemas import DirectRequest, DirectResponse, GestureType


def test_gestures_the_director_can_choose():
    assert get_args(GestureType) == ("none", "wave", "nod", "shake", "shrug")


def test_direct_schemas_reject_unknown_values():
    with pytest.raises(ValidationError):
        DirectResponse(gesture="backflip", emotion="neutral")
    with pytest.raises(ValidationError):
        DirectRequest(speaker="narrator", line="hi")
