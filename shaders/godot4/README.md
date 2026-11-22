# Godot 4 Sample Project & Reference Shader (`aa_sprite_stack.gdshader`)

Single-quad **1× / 2× / 4× / 8× RGSS Orthographic 3D Voxel DDA** over standard horizontal `slices.png` strips — zero rotation shimmer, zero dark halos, zero Z-slice gaps, **1 draw call**.

## Quick Start (Ready-to-Open Project)

1. Open **Godot 4.2 / 4.3 / 4.4** -> **Import** -> select [`project.godot`](project.godot).
2. Press **F5** to launch [`main.tscn`](main.tscn).
3. Interactive controls:
   - `Space` — Swap between **Retro Sports Car** (`assets/car_slices.png`, 20 slices) and **Voxel Cottage** (`assets/cottage_slices.png`, 28 slices)
   - `1` / `2` / `4` / `8` — Live RGSS AA softswitch (compare `1×` Legacy vs `4×` / `8×` RGSS!)
   - `A` / `D` (or Left / Right) — Scrub rotation angle manually; `P` — Pause spin

## Copy-Paste Into an Existing Godot 4 Game

1. Copy [`aa_sprite_stack.gdshader`](aa_sprite_stack.gdshader) into your project and attach it to a `ColorRect` or `Sprite2D` (`ShaderMaterial`).
2. Assign your horizontal `slices.png` strip (`width = W * slices`, `height = L`) to `sheet` (disable texture compression / mipmaps in the Import dock for crispest pixel colors).
3. Set `slices` to your layer count, `samples` to `4` (or `2` on mobile, `8` for hero zoom), and drive `angle_rad` every frame.
4. Keep your Godot viewport at native display resolution so RGSS sub-pixel edges stay razor-smooth while voxel interiors stay chunky.
