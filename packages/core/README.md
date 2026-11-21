# `@aastack/core`

Zero-dependency, mobile-first, fully anti-aliased 2.5D & 6-DOF sprite-stacking engine for WebGL2 ES 3.00.

## Features
- **3D Voxel DDA & Continuous 3D SDF Sphere Tracing** inside tight 12-triangle back-face OBB proxies (`1×/2×/4×/8×` RGSS, linear-light compositing, exact `gl_FragDepth`).
- **First-Class 2.5D Isometric & Oblique Cameras:** `createIsometricCamera({ preset: "dimetric-2to1" | "isometric" | "oblique-stack" | "topdown-3quarter" })`, exact `pixelsPerUnit` tile-grid locking, `projectWorldToScreen()`, and `unprojectScreenToGround()` ground picking.
- **Premultiplied Transparent Overlay Mode:** Set `background: "transparent"` (`"transparent" | "studio" | "solid" | "terrain"`) to layer anti-aliased sprite stacks cleanly over any existing 2D canvas, tilemap, PixiJS, or Phaser game with zero dark halos.
- **One-Line Drop-In Loaders:** `loadSliceStripUrl()` / `loadSliceStripFromImage()` / `loadSliceStripPixels()` for standard horizontal `slices.png` strips and `loadVoxUrl()` / `parseVox()` for MagicaVoxel `.vox` binaries (`computeSdf: false` option for 5× faster large-model loads).
- **Live Quality & Style Softswitches:** `renderer.setQuality("eco" | "balanced" | "ultra", world)` dials between battery-cool `2×`/`4×` half-res JFA and full Retina `8×` full-res JFA on the fly; `SceneDocument.style` switches `"arcade-8bit"`, `"hd-2d"`, `"smooth-toy"`, and `"retro-raw"`.
- **Zero-GC Fast Path & GPU Hygiene:** Homogeneous column-step RGSS ray setup, same-voxel sample shading cache, 6-plane Gribb-Hartmann frustum culling, lazy terrain compile & SDF upload, `renderer.evictAsset(id)`, `renderer.dispose()`, `webglcontextlost` recovery, and `EXT_disjoint_timer_query_webgl2` (`gpuMs`).
- **Engine-First & AI-Ready Hooks:** Patchable `SceneIR` (`SceneWorld.applyPatch`), undo/redo, deterministic `stepClock`/`snapshot`/`restore`, semantic sockets, `getStats()`, `captureDataUrl()`, and 1:1 CPU/GPU `raycastEntities()`.

## Drop-In 2.5D Isometric Overlay Example

```ts
import { AASpriteRenderer, SceneWorld, createIsometricCamera, loadSliceStripUrl, quatFromYawPitchRoll } from "@aastack/core";

const renderer = new AASpriteRenderer(canvas, { background: "transparent", quality: "ultra" });
const world = new SceneWorld({
  camera: createIsometricCamera({ preset: "dimetric-2to1", target: [0, 2, 0], orthoSize: 9.5 }),
});

const car = await loadSliceStripUrl("/car_slices.png", { id: "car", slices: 24 });
world.registerAsset(car);
world.applyPatch([
  { op: "set", path: "aaMode", value: "voxel-dda" },
  { op: "spawn", entity: { id: "hero", assetId: "car", pos: [0, 2.8, 0], rot: quatFromYawPitchRoll(0.6, 0, 0), scale: 1, outline: true } },
]);

renderer.setQuality("ultra", world);
renderer.render(world);
```

See [aasprite.com](https://aasprite.com), the [API Reference](../../docs/api-reference.md), and [Architecture Guide](../../docs/architecture.md).
