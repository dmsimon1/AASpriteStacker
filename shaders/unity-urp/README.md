# Unity URP UPM Package (`com.aastack.spritestack`)

Single-quad **1× / 2× / 4× / 8× RGSS Orthographic 3D Voxel DDA** shader + zero-allocation `MaterialPropertyBlock` controller for Unity URP (2022.3 LTS / Unity 6).

## Install via Unity Package Manager (1-Click Git URL)

1. Open **Window → Package Manager** → **`+`** → **Add package from git URL…**
2. Paste:
   ```
   https://github.com/dmsimon1/AASpriteStacker.git?path=/shaders/unity-urp
   ```
3. In the Package Manager panel, click **Samples → Import** to pull in `car_slices.png` (20 slices), `cottage_slices.png` (28 slices), and `AASpriteStackDemo.cs`.

## Scene Setup (30 Seconds)

1. Create a Material using shader **`AASpriteStacker/URP/SpriteStackAA`** and assign it to a `Quad` mesh.
2. Add **`AASpriteStackController`** to the Quad and assign a slice strip (`car_slices.png`, `slices = 20`).
3. Configure texture import settings on your `slices.png`:
   - **Filter Mode:** `Point (no filter)`
   - **Non-Power of Two:** `None`
   - **Compression:** `None`
   - **sRGB (Color Texture):** `On` (with Project Color Space = **Linear**)
4. Press **Play** — add `AASpriteStackDemo` to toggle Car/Cottage (`Space`) and `1× / 2× / 4× / 8×` RGSS (`1/2/4/8`).

## Standalone Copy-Paste

You can also download [`AASpriteStack.shader`](AASpriteStack.shader) directly without UPM and drive `_AngleRad`, `_Slices`, and `_Samples` from your own script.
