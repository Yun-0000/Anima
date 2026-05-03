from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.prompts.character_prompt import CHARACTER_SYSTEM_PROMPT, HANS_SYSTEM_PROMPT


def test_prompt_lists_supported_actions():
    expected_actions = '"action": "idle|sadIdle|talking|wave|nod|shake"'

    assert expected_actions in CHARACTER_SYSTEM_PROMPT
    assert expected_actions in HANS_SYSTEM_PROMPT


def test_prompt_makes_talking_a_rare_deliberate_gesture():
    guidance = "Do not use talking just because you are replying"

    assert guidance in CHARACTER_SYSTEM_PROMPT
    assert guidance in HANS_SYSTEM_PROMPT


def test_hans_prompt_names_the_character():
    assert "You are Hans" in HANS_SYSTEM_PROMPT
