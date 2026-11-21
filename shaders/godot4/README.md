# Godot 4 Reference Shader (`aa_sprite_stack.gdshader`)

Attach [`aa_sprite_stack.gdshader`](aa_sprite_stack.gdshader) to a single `ColorRect` or `Sprite2D` (`ShaderMaterial`).

1. Assign your standard horizontal `slices.png` strip (`width = W * slices`, `height = L`) to the `sheet` uniform.
2. Set `slices` to the layer count, and update `angle_rad` every frame to rotate smoothly in 1 draw call.
3. Render your Godot viewport at native display resolution (avoid downsampling to an integer low-res viewport) so the `4×` RGSS sub-pixel edges stay razor-smooth while voxel interiors remain chunky.
