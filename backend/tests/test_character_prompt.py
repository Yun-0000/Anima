from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.characters import CHARACTER_PROFILES


def test_every_character_has_text_and_voice_prompts_with_its_name():
    assert set(CHARACTER_PROFILES) == {"mio", "rin", "kai"}
    for profile in CHARACTER_PROFILES.values():
        assert f"You are {profile.name}" in profile.system_prompt
        assert f"You are {profile.name}" in profile.voice_prompt
        # Both are spoken as they are, so neither asks for a format around the words.
        assert "JSON" not in profile.system_prompt and "JSON" not in profile.voice_prompt
        # Both know what the body and face can do, so they neither refuse nor promise other moves.
        for prompt in (profile.system_prompt, profile.voice_prompt):
            assert "waves, nods, shakes its head, shrugs" in prompt and "gestures with its hands" in prompt
            assert "sad, angry, surprised or relaxed" in prompt
