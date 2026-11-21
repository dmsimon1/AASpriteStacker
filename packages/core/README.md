# `@aastack/core`

Zero-dependency, mobile-first, anti-aliased 6-DOF & 2.5D sprite-stacking rendering engine for WebGL2 ES 3.00.

## Features
- **3D Voxel DDA & Continuous 3D SDF Sphere Tracing** inside tight 12-triangle back-face OBB proxies (`1×/4×/8×` RGSS, linear-light compositing, exact `gl_FragDepth`).
- **Live `RenderStyle` Softswitch:** `"arcade-8bit"` (default), `"hd-2d"`, `"smooth-toy"`, `"retro-raw"`.
- **Mobile-Safe Outlines & Bloom:** 16-bit packed `RGBA8` 4-pass Jump Flooding Algorithm (JFA) — zero float-FBO extensions required.
- **Adaptive Mobile Governor:** Automatic mobile detection, DPR caps, Dynamic Resolution Scaling (DRS), distance-adaptive RGSS LOD, and multi-touch `createTouchController`.
- **Asset Loaders & Preprocessing:** `O(N)` 3-pass 3D EDT, 3D RGB edge dilation, smooth SDF normals + AO, MagicaVoxel `.vox` binary parser (`parseVox`), and horizontal `slices.png` loader (`loadSliceStripPixels`).
- **AI-First Iterative Hooks:** Patchable `SceneIR` (`SceneWorld.applyPatch`), undo/redo, deterministic `stepClock`/`snapshot`/`restore`, semantic sockets, `getStats()`, `captureDataUrl()`, and 1:1 CPU/GPU `sampleTerrainHeight()` + `raycastEntities()`.

## Quick Example

```ts
import { AASpriteRenderer, SceneWorld } from "@aastack/core";

const world = new SceneWorld({ seed: 11 });
const renderer = new AASpriteRenderer(canvas, { quality: "auto", adaptiveDpr: true });
world.applyPatch([{ op: "set", path: "style", value: "arcade-8bit" }]);
renderer.render(world);
```

See the full [API Reference](../../docs/api-reference.md) and [Architecture Guide](../../docs/architecture.md).
