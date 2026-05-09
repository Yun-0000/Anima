# Anima Usage Guide

Anima is a browser-based anime character studio with text chat, optional voice, emotion, motion, and lip-sync. The public release is Studio-only and keeps text mode usable without provider keys.

## Local Mode

Local mode lets you run the project without OpenAI credentials.

Start the backend:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m app.main
```

Start the frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the frontend URL printed by Vite. Text mode works immediately. Voice mode appears as available only after the backend sees an OpenAI key.

For motion, download your own Mixamo animations and place them in `frontend/public/animations/` using the filenames listed in `frontend/public/animations/README.md`. The supported action set is idle, sad idle, talking, wave, nod, and shake. The app can open without those `.fbx` files, but missing animation files will fall back to static/no-motion behavior.

## Voice Mode

Set `LOCAL_MODE=false` in `backend/.env`, then add your own OpenAI API key. The repository does not include provider keys or ElevenLabs voice IDs; copy `backend/.env.example` and fill in values from your own accounts.

OpenAI realtime voice:

```dotenv
OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o
OPENAI_MOTION_MODEL=gpt-5.4-mini
ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_VOICE_ID=
ELEVENLABS_VOICE_ID_JANE=
ELEVENLABS_VOICE_ID_HANS=
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_VOICE_JANE=
OPENAI_REALTIME_VOICE_HANS=
OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-transcribe
```

Text mode uses `OPENAI_CHAT_MODEL` for the typed reply and ElevenLabs TTS for speech when `LOCAL_MODE=false`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, and an ElevenLabs voice ID are set. It returns a text-only local deterministic response when provider credentials are unavailable. Restart the backend after changing environment variables. The browser asks for microphone access only after the user starts Voice mode.

ElevenLabs audio is returned as a one-time browser-playable data URL in the text-conversation response. The backend does not write generated mp3 files to disk.

Voice mode keeps avatar motion separate from realtime speech. OpenAI handles audio and transcription only; the frontend sends the user STT transcript plus the assistant spoken transcript to `/api/motion-plan`, where `OPENAI_MOTION_MODEL` returns the avatar expression and body motion. Lip sync follows the actual audio stream.

## Assets

Read `ASSET_LICENSE.md` before publishing or redistributing character, animation, audio, or video assets.

The code supports a compact Mixamo-compatible action set under `frontend/public/animations/`, but Mixamo `.fbx` files are intentionally not included in the repository. Download your own from Mixamo and rename them to the exact filenames in `frontend/public/animations/README.md`. Mixamo assets are governed by Adobe/Mixamo terms and should not be committed unless you have separate redistribution rights.

## Troubleshooting

- Browser microphone blocked: check browser permissions.
- Backend not reachable: confirm it is running on `http://localhost:8001`.
- Character not loading: check VRM files in `frontend/public/models/`.
- Voice mode disabled: set `OPENAI_API_KEY`, then restart the backend.
- Text response has no audio: confirm `LOCAL_MODE=false`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, and an ElevenLabs voice ID are set, then restart the backend.
