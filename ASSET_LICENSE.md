# Asset License Notes

This repository is prepared for an open-source release with code-first assets and user-supplied third-party animation files.

## Included Assets

- VRM character models under `frontend/public/models/`. These models were created and owned by the repository author and are included for public demo use and redistribution with this repository. If you replace them with different models, update this file to match the rights for those assets before publishing.

## Animation Files

Mixamo-compatible animation loading is supported by the code, but Mixamo `.fbx` files are not redistributed in this repository. Download your own animations from Mixamo and place them under `frontend/public/animations/` using these exact filenames:

- `idle.fbx`
- `Sad Idle.fbx`
- `Talking.fbx`
- `wave.fbx`
- `nod.fbx`
- `shake.fbx`

The repository `.gitignore` excludes `frontend/public/animations/*.fbx` so downloaded Mixamo files stay local. If you replace these with your own HyMotion/custom animations and have redistribution rights, document that separately before publishing those files.

## Generated Audio

Runtime TTS audio is returned directly to the browser for immediate playback. The backend does not persist generated mp3 files, and no generated audio assets should be redistributed with the repository.

## Demo Video

The demo video is provided as product documentation and should not imply that all source animation assets used to record it are redistributed in this repository.
