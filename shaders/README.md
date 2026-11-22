# Standalone Engine Shaders & Samples (`shaders/`)

Want our single-quad **1× / 2× / 4× / 8× RGSS 3D Voxel DDA** anti-aliasing inside a native game engine without changing your runtime? Drop in these zero-dependency ports over standard horizontal `slices.png` strips:

| Engine | Entry Point | What's Included |
| :--- | :--- | :--- |
| **Godot 4** | [`godot4/project.godot`](godot4/project.godot) · [`aa_sprite_stack.gdshader`](godot4/aa_sprite_stack.gdshader) | Ready-to-open Godot 4.2–4.4 project (`main.tscn`, `aa_sprite_stack.gd`, `car_slices.png`, `cottage_slices.png`) — open & hit **F5** |
| **Unity URP** | [`unity-urp/package.json`](unity-urp/package.json) · [`AASpriteStack.shader`](unity-urp/AASpriteStack.shader) | UPM Git package (`?path=/shaders/unity-urp`), `AASpriteStackController.cs` (`MaterialPropertyBlock`), and importable Car & Cottage sample textures |

Both ports implement exact Amanatides–Woo 3D Voxel DDA across a 2D horizontal slice atlas with configurable 1×/2×/4×/8× Rotated Grid Supersampling in **1 draw call** — eliminating rotation shimmer, dark bilinear halos, and Z-slice gaps.
