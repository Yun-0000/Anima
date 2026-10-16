"""Creates or updates the ElevenLabs agent behind Voice mode.

One agent serves every character: each voice session sends the character's prompt and voice
as overrides, so the prompts stay in backend/app/prompts. Run from the repository root:

    python scripts/setup_voice_agent.py

It reads ELEVENLABS_API_KEY (needs the ElevenAgents read and write permissions) and, if set,
ELEVENLABS_AGENT_ID from backend/.env. Without an agent ID it creates one and prints the line
to add to backend/.env.
"""
import os
import sys
from pathlib import Path

import httpx
from dotenv import dotenv_values

env = dotenv_values(Path(__file__).resolve().parents[1] / "backend" / ".env")
key, agent_id = env.get("ELEVENLABS_API_KEY"), env.get("ELEVENLABS_AGENT_ID")
if not key:
    sys.exit("Set ELEVENLABS_API_KEY in backend/.env first.")

CONFIG = {
    "name": "Anima voice",
    "conversation_config": {
        # The model was picked for voice latency (about 0.6 s to first audio) and for answering in the user's language.
        "agent": {"first_message": "", "language": "en", "prompt": {"prompt": "You are a friendly character.", "llm": os.getenv("VOICE_LLM", "deepseek-v41-flash")}},
        "tts": {"model_id": "eleven_v4_turbo"},
        # Answer as soon as the user stops, and start thinking during the pause; never nag a quiet user (-1).
        "turn": {"turn_eagerness": "eager", "speculative_turn": True, "turn_timeout": -1},
        # The browser also ends a quiet session after a minute; this caps any session on the server.
        "conversation": {"text_only": False, "max_duration_seconds": 600},
    },
    # Each session sets the character's prompt and voice.
    "platform_settings": {"overrides": {"conversation_config_override": {
        "agent": {"prompt": {"prompt": True}, "first_message": True, "language": True},
        "tts": {"voice_id": True},
    }}},
}

headers = {"xi-api-key": key}
if agent_id:
    response = httpx.patch(f"https://api.elevenlabs.io/v1/convai/agents/{agent_id}", headers=headers, json=CONFIG, timeout=30)
else:
    response = httpx.post("https://api.elevenlabs.io/v1/convai/agents/create", headers=headers, json=CONFIG, timeout=30)
if response.status_code >= 400:
    sys.exit(f"ElevenLabs refused the agent ({response.status_code}): {response.text[:300]}")
if agent_id:
    print(f"Updated agent {agent_id}.")
else:
    print(f"Created the agent. Add this line to backend/.env:\nELEVENLABS_AGENT_ID={response.json()['agent_id']}")
