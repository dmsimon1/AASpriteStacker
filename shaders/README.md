# Standalone Engine Reference Shaders

Copy-paste reference implementations of **AASpriteStacker's** single-quad **RGSS 3D Voxel DDA** anti-aliased sprite-stacking shader for engines outside WebGL2:

| Engine | Path | Pipeline |
| --- | --- | --- |
| **Godot 4** | [`godot4/aa_sprite_stack.gdshader`](godot4/aa_sprite_stack.gdshader) | `CanvasItem` (`Sprite2D` / `ColorRect`), single draw call on standard horizontal `slices.png` |
| **Unity URP 2D** | [`unity-urp/AASpriteStack.shader`](unity-urp/AASpriteStack.shader) | URP Unlit HLSL quad shader on standard horizontal `slices.png` |

> **Note:** `@aastack/core` (WebGL2) and `skills/aa-sprite-stacking/scripts/aa_views_to_slices.py` are tested continuously in CI. The Godot 4 and Unity URP shaders here are standalone reference ports of the exact same Amanatides-Woo 3D DDA + 4× RGSS linear-light algorithm — please report any engine-version quirks via GitHub Issues.
