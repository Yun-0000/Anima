# Animation Assets

This folder is intentionally kept without Mixamo `.fbx` files in the open-source repository. Only this README should be committed here unless you have separate redistribution rights for an animation file.

The app supports a small Mixamo-compatible action set, but the raw animation files are user-supplied assets. Download your own animations from Mixamo, then place or rename them to these exact filenames:

| App action | Required local file |
| --- | --- |
| Idle | `idle.fbx` |
| Sad Idle | `Sad Idle.fbx` |
| Talking | `Talking.fbx` |
| Wave | `wave.fbx` |
| Nod | `nod.fbx` |
| Shake | `shake.fbx` |

These names are case-sensitive in the app because `frontend/src/animations/animationCatalog.ts` loads them by exact URL.

Suggested Mixamo export setting: FBX animation on the standard Mixamo rig. The current loader retargets Mixamo bone names onto the VRM character at runtime.

Mixamo assets are governed by Adobe/Mixamo terms. Do not commit downloaded `.fbx` files unless you have separate redistribution rights.
