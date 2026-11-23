---
name: aa-sprite-stacking
description: Builds anti-aliased fake-3D rotatable sprites from four orthographic views (top, side, front, back). Upgrades classic sprite stacking with soft visual-hull 3D SDF carving, RGB edge dilation, RGSS orthographic 3D voxel DDA, bandlimited fat-pixel & CleanEdge slice shaders, smooth 3D SDF sphere tracing, and exact 2D Euclidean SDF outlines. Use when creating rotatable 2.5D sprites, anti-aliased voxel turntables, or smooth/crisp stacked props for WebGL2, Godot 4, Unity, Phaser, or Canvas.
---

# Anti-Aliased Sprite Stacking (`AASpriteStacker`)

Turns four orthographic views (`TOP`, `SIDE`, `FRONT`, `BACK`) into an **anti-aliased** rotatable 2.5D sprite stack — preserving either **crisp fat-pixel art clarity** (zero shimmer, zero 1px post blinking, zero slice gaps, zero alpha bloat) or **smooth stair-step-free 3D SDF surfaces**.

## What this improves over classic 1× nearest sprite stacking

1. **Zero rotation crawl or 1px post blinking:** Renders at native display resolution via **RGSS Orthographic 3D Voxel DDA** (mathematically equivalent to continuous sprite stacking with finite-thickness slabs).
2. **Exact symmetric rotation center:** Samples continuous voxel bounds `[0, W] × [0, L] × [0, H]` around `(W * 0.5, L * 0.5)` with pixel centers `(px + 0.5)` — eliminating 0.5-art-px wobble across 90° boundaries.
3. **Zero correlated-coverage alpha buildup:** Solves vertical-wall alpha over-accumulation (`1 - (1 - α)^N → 1`) via ray-first occlusion (DDA/SDF) and the **Correlated-Coverage Over Operator** (`newA = max(accA, az)`) in pure 2D slice modes.
4. **Zero dark bilinear halo fringes:** Bleeds surface RGB into adjacent transparent voxels (`alpha == 0`) and performs all resampling and compositing in **premultiplied linear light** (`sRGB → Linear → Blend → sRGB`).
5. **Soft Visual-Hull 3D SDF Fusion:** Fuses exact 2D Euclidean Distance Transforms of all four views into a continuous 3D Signed Distance Field (`max(d_top, d_side, min(d_front, d_back))`), powering smooth normals, smooth SDF raymarching, and circular `--round` lathe carving.
6. **Uniform-thickness anti-aliased outlines:** Replaces jagged 4-neighbor 1-art-px outlines with an exact display-space **2D Euclidean Distance Field** (via banded EDT in Python and 4-pass Jump Flooding Algorithm in WebGL2).

## Workflow

### 1. Prepare or generate a 4-view orthographic sheet

One 1×4 horizontal row (or 2×2 grid) in order `TOP`, `SIDE`, `FRONT`, `BACK` on transparent or solid flat background.
- Supports **both** hard pixel-art views AND anti-aliased / smooth-silhouette art!
- `TOP` looks straight down (front pointing down); `SIDE` faces left (or pass `--side-nose right`).
- Unlike legacy 1× nearest stackers, **1px masts, antennas, railings, and ropes survive rotation cleanly** without blinking out!

### 2. Carve slices, 3D SDF, normals, and AA preview

```bash
python3 skills/aa-sprite-stacking/scripts/aa_views_to_slices.py views.png slices.png \
  --slices 36 --sdf sdf.png --normals normals.png \
  --preview check.png --html viewer.html --export-dirs 16
```

| Flag | Default | Purpose |
| --- | --- | --- |
| `--slices N` | auto (`36` if raw height > 64, else native) | Vertical slice count (`0` keeps native) |
| `--round` | off | Smooth analytic elliptical lathe intersected with 3D SDF (towers, barrels, domes) |
| `--hard-alpha` | off | Force strict binary alpha on source views |
| `--resample` | `auto` | `auto` snaps block-upscaled pixel art cleanly; uses linear premultiplied area/Lanczos otherwise |
| `--colours N` | `0` (keep all) | Shared perceptual **Oklab** palette quantization |
| `--smooth-sdf F` | `0.15` | Gentle 3D SDF smoothing (`0` for sharp raw visual hull) |
| `--samples K` | `4` | RGSS supersampling (`1`, `4`, `8`, `16`) for preview & baked exports |
| `--sdf PATH` | *(none)* | Export packed 8-bit 3D SDF strip PNG |
| `--normals PATH` | *(none)* | Export continuous SDF-gradient 3D normal-map strip |
| `--export-dirs N` | `0` | Bake an anti-aliased N-direction sprite sheet PNG (`--export-mode voxel\|sdf`) |
| `--html PATH` | *(none)* | Build standalone WebGL2 AA interactive studio with live A/B comparison curtain |

### 3. Inspect visually & pick your AA aesthetic

Open `check.png` and `viewer.html` to compare modes side-by-side with the draggable **A/B Split-Screen Curtain** and **4× Hover Loupe**:

- **AA Crisp Voxel (RGSS DDA)** — *Best default for pixel art.* Keeps every voxel crisp and readable with silky sub-pixel edges, zero slice gaps, 3D self-shadowing, and smooth SDF outlines.
- **AA Fat-Pixel Slices** — Best pure-2D slice stacking (anisotropic Euclidean-Jacobian bandlimited filter + Correlated-Coverage Over).
- **AA CleanEdge Slices** — Straightens 45° pixel-art staircases into sharp diagonal contours while keeping 90° box corners crisp.
- **AA Smooth SDF Hull** — Turns the 4-view hull into a stair-step-free miniature 3D form with smooth shading and soft penumbra shadows.

### 4. Integrate into your engine

Open [`references/engines.md`](references/engines.md) for single-draw-call GPU shaders for **Godot 4**, **Unity URP 2D**, **WebGL2**, and **Canvas 2D** that read standard horizontal `slices.png` strips directly.

### 5. Advanced Carving & Diorama Rules (credited to `@danielwh2/sprite-stacking`, MIT)

- **Spherical bodies under orthographic pitch:** An equal-radius sphere (`R_z = R_xy`) stretches vertically into an egg under pitch `squash` and vertical `spacing`. Compensate vertical half-height with the Cauchy-Schwarz envelope `R_z = R_xy * sqrt(1 - squash^2) / spacing`, store pure surface albedo in rotating planet/moon strips, evaluate world-space directional lighting at render time, and split planetary rings into back (`y_local < 0`) and front (`y_local >= 0`) passes.
- **Smooth slice-bloom entrances & cutaways:** Grow grounded props bottom-to-top using `@aastack/core`'s `sliceClip: [0, zFrac]` (or per-slice `lifts` whose reveal frontier extends past `count` by the blend width so upper slices finish easing cleanly).
- **Articulated creatures & underwater depth:** Keep multi-frame creature strips (`f0..fN-1`) on identical `(W, H, count)` dimensions with shared symmetric pivots and extra Z-slice headroom so flapping wings or tail flukes never clip. Apply Beer-Lambert red-channel attenuation and softer outlines to submerged stacks.
