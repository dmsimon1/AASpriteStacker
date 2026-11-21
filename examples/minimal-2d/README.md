# Minimal 2.5D Isometric & Oblique Transparent-Overlay Starter

A compact working example showing how to drop an anti-aliased sprite stack directly over an existing 2D HTML5 Canvas tilemap using:

- `background: "transparent"` (premultiplied alpha with zero dark halos)
- First-class 2.5D camera presets via `createIsometricCamera({ preset })`:
  - `"dimetric-2to1"` — exact 2:1 pixel-art diamond tile grid (`30°` pitch, `45°` yaw)
  - `"isometric"` — true mathematical axonometric isometric (`35.264°` pitch, `45°` yaw)
  - `"oblique-stack"` — classic 2D SpriteStack / Nium oblique shear (un-foreshortened circular XZ footprints + pure vertical slice extrusion)
  - `"topdown-3quarter"` — classic 3/4 RPG orthographic tilt (`55°` pitch)
- Synchronized 2D tile grid via `projectWorldToScreen()` and click-to-tile ground picking via `unprojectScreenToGround()`
- Live `renderer.setQuality("eco" | "balanced" | "ultra", world)` softswitch
- Ready-to-uncomment 1-line `loadSliceStripUrl()` and `loadVoxUrl()` drop-in asset loaders

## Run Locally

```bash
npm run build
npm run dev:serve
# Open http://127.0.0.1:8765/examples/minimal-2d/
```
