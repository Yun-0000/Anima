# Anima

An interactive anime character studio. Type to a 3D avatar with no setup, or enable real speech-to-speech voice with your own OpenAI API key.

Repository root: this `Anime Studio/` folder is the Git project root. If you opened the parent `Demo/` folder, switch into `Anime Studio/` before running commands or opening the project in an editor.

## Intro Video

[Watch the intro video](https://www.youtube.com/watch?v=8ec8gIVYHrc&t=2s)

## What It Does

- Loads VRM characters in a browser-based 3D studio.
- Provides two Studio modes: Text and Voice.
- Keeps Text mode usable without provider keys.
- Enables Voice mode only when users configure their own OpenAI credentials.
- Uses speech-to-speech realtime APIs for Voice instead of the older STT → LLM → TTS chain.
- Keeps Voice motion separate from realtime speech: STT/TTS stay with the speech provider, while a small backend LLM plans expression and body motion from transcripts.
- Supports a compact Mixamo-compatible action set: idle, sad idle, talking, wave, nod, and shake. Animation files are user-supplied and not redistributed in this repo.

## Quick Start

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

For motion, download your own Mixamo animations and save them under `frontend/public/animations/` using the filenames listed in [frontend/public/animations/README.md](frontend/public/animations/README.md). The app can still open without these files, but characters will fall back to static/no-motion behavior when an animation is missing.

Open the frontend URL printed by Vite.

## Voice Mode

Voice mode is hidden behind provider configuration so open-source users can run the app without accidentally needing paid APIs. Set `LOCAL_MODE=false`, add your own `OPENAI_API_KEY`, and restart the backend.

OpenAI voice uses `gpt-realtime-1.5` through WebRTC. OpenAI does not receive avatar-control tools; lip sync follows the audio stream, and `/api/motion-plan` uses `OPENAI_MOTION_MODEL` to choose expression/body motion from the user STT transcript plus the assistant spoken transcript. Text mode remains available even when no voice provider is configured.

Typed Text mode can optionally use ElevenLabs TTS after you add your own `ELEVENLABS_API_KEY` and voice IDs in `backend/.env`. TTS audio is returned as a one-time browser-playable data URL in the API response; the backend does not write mp3 files or expose a generated-audio static directory.

## Assets

Read [ASSET_LICENSE.md](ASSET_LICENSE.md) before publishing or redistributing character, animation, audio, or video assets.

This project supports Mixamo-compatible animations, but Mixamo `.fbx` files are not included. Download your own from Mixamo and place them under `frontend/public/animations/` with the exact filenames listed in [frontend/public/animations/README.md](frontend/public/animations/README.md). Mixamo assets are governed by Adobe/Mixamo terms and should not be committed unless you have separate redistribution rights.

## Development

```bash
npm --prefix frontend test -- --run
cd backend && pytest
```
