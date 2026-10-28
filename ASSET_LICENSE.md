# Asset license notes

## Characters (Mio, Rin, Kai)

The three characters are VRoid Project's sample avatars AvatarSample_A (Mio), AvatarSample_B (Rin) and AvatarSample_C (Kai), in `frontend/public/models/sample_a.vrm`, `sample_b.vrm` and `sample_c.vrm` (VRM 0.x). Their VRoid Hub license allows use by everyone, personal and corporate commercial use, modification and redistribution, and does not require credit. The files here were shrunk with `scripts/compress_vrm.py` (textures downscaled, expression data stored sparsely); rig, expressions and spring bones are unchanged. The pictures in `frontend/public/characters/` are renders of these models.

## Motions

`frontend/public/motions/` holds 6 motions from Meshy's animation library (motion capture), bundled so the app moves without extra downloads. They were exported through the Meshy API onto a Meshy-rigged character and are named after their library number: idles #243, #249 and #252, wave #290 ("Wave One Hand"), talk #314 ("Talk with Right Hand Open") and shrug #317 ("Shrug"). Finger poses are set in code. No Mixamo animations are used.

Nodding and head shaking are procedural (code), not animation files.

## Generated audio

Spoken replies come from ElevenLabs and are played directly in the browser. The backend never writes audio to disk, and no generated audio is part of this repository.
