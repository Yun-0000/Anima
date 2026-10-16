from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.characters import CHARACTER_PROFILES


def test_every_character_has_text_and_voice_prompts_with_its_name():
    assert set(CHARACTER_PROFILES) == {"mio", "rin", "kai"}
    for profile in CHARACTER_PROFILES.values():
        assert f"You are {profile.name}" in profile.system_prompt
        assert '{"text": "your reply"}' in profile.system_prompt
        assert f"You are {profile.name}" in profile.voice_prompt
        # Voice replies are spoken as they are; only chat replies are JSON.
        assert "JSON" not in profile.voice_prompt
        # Both know what the body can do, so they neither refuse nor promise other moves.
        assert "waves, nods, shakes its head and shrugs" in profile.system_prompt
        assert "waves, nods, shakes its head and shrugs" in profile.voice_prompt
