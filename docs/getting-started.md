# Getting Started with AASpriteStacker

This guide walks you through installing the workspace, building your first anti-aliased 6-DOF or 2.5D scene, creating assets across all four supported pipelines, and deploying cleanly to both desktop and mobile browsers.

---

## 1. Setup & Workspace Commands

Clone the repository and install dev dependencies (`typescript` and `esbuild`; runtime packages have **zero** dependencies):

```bash
git clone https://github.com/dmsimon1/AASpriteStacker.git
cd AASpriteStacker
npm install
npm run build
```

Useful root scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Builds all 4 workspaces (`@aastack/{core,blueprint,bridge,mcp}`) + bundles `examples/flight-6dof` & `examples/minimal-2d` |
| `npm run build:site` | Builds the full static `aasprite.com` website into `site/dist/` |
| `npm run typecheck` | Strict TypeScript project-reference check across all workspaces |
| `npm test` | Rebuilds and runs the Node test suite (`tests/*.test.mjs`) |
| `npm run test:py` | Runs the Python carving & AA quality suite (`.venv/bin/python tests/test_aa_stacker.py`) |
| `npm run test:all` | Runs both TypeScript and Python test suites |
| `npm run dev:serve` | Starts a local static HTTP server at `http://127.0.0.1:8765` |

---

## 2. Drop-In 2.5D Isometric & Oblique Overlay (Shortest Path)

Want to drop anti-aliased sprite stacks straight on top of an existing 2D tilemap, Canvas2D, PixiJS, or Phaser game? Set `background: "transparent"`, pick a first-class 2.5D projection preset via `createIsometricCamera()` (`"dimetric-2to1"`, `"isometric"`, `"oblique-stack"`, or `"topdown-3quarter"`), and use our one-line URL loaders (`loadSliceStripUrl` or `loadVoxUrl`):

```ts
import {
  AASpriteRenderer,
  SceneWorld,
  createIsometricCamera,
  loadSliceStripUrl,
  quatFromYawPitchRoll,
  unprojectScreenToGround,
} from "@aastack/core";

const renderer = new AASpriteRenderer(canvas, { background: "transparent", quality: "ultra" });
const world = new SceneWorld({
  // Presets: "dimetric-2to1" (2:1 diamond grid) | "isometric" (35.264°) | "oblique-stack" (SpriteStack/Nium) | "topdown-3quarter"
  camera: createIsometricCamera({ preset: "dimetric-2to1", target: [0, 2.4, 0], orthoSize: 10.5 }),
});

const car = await loadSliceStripUrl("/car_slices.png", { id: "car", slices: 24 });
// Or MagicaVoxel: const car = await loadVoxUrl("/car.vox", { id: "car" });
world.registerAsset(car);
world.applyPatch([
  { op: "set", path: "aaMode", value: "voxel-dda" },
  { op: "spawn", entity: { id: "hero", assetId: "car", pos: [0, 2.8, 0], rot: quatFromYawPitchRoll(0.6, 0, 0), scale: 1, outline: true } },
]);

// Click-to-tile ground picking works identically across dimetric, true iso, oblique, and perspective:
const hit = unprojectScreenToGround(mouseX, mouseY, world.doc.camera, canvas.clientWidth, canvas.clientHeight, 0);

// Runtime AA quality softswitch ("eco" 2x | "balanced" 4x | "ultra" 8x Retina + full-res JFA):
renderer.setQuality("ultra", world);
renderer.render(world);
```

Try it live at [`/iso/`](/iso/) or inspect the complete starter in [`examples/minimal-2d/`](../examples/minimal-2d/README.md).

---

## 3. Building a Full 6-DOF Scene (`@aastack/core`)

Create an HTML page with a `<canvas id="gl">` and wire up `SceneWorld` + `AASpriteRenderer`:

```ts
import {
  AASpriteRenderer,
  SceneWorld,
  quatFromYawPitchRoll,
} from "@aastack/core";
import {
  compileBlueprint,
  createFighterJetBlueprint,
} from "@aastack/blueprint";

const canvas = document.getElementById("gl") as HTMLCanvasElement;
const world = new SceneWorld({ seed: 42 });
const renderer = new AASpriteRenderer(canvas, {
  quality: "auto",      // "auto" | "mobile" | "desktop" | "ultra"
  adaptiveDpr: true,    // dynamic resolution scaling on mobile GPUs
});

// 1. Register volumetric assets (auto-uploads 3D RGBA, SDF, Normal/AO, Emissive textures)
world.registerAsset(compileBlueprint(createFighterJetBlueprint("jet-asset")));

// 2. Configure render style, camera, and spawn entities via declarative patches
world.applyPatch([
  { op: "set", path: "style", value: "arcade-8bit" }, // or "hd-2d" | "smooth-toy" | "retro-raw"
  { op: "set", path: "terrain.enabled", value: true },
  {
    op: "set",
    path: "camera",
    value: {
      mode: "chase",
      pos: [0, 34, 18],
      target: [0, 28, -12],
      up: [0, 1, 0],
      fovDeg: 52,
      orthoSize: 24,
      near: 0.4,
      far: 500,
    },
  },
  {
    op: "spawn",
    entity: {
      id: "player",
      assetId: "jet-asset",
      pos: [0, 28, 0],
      rot: quatFromYawPitchRoll(0, 0, 0),
      scale: 1.0,
      outline: true,
      castShadow: true,
      tag: "player",
    },
  },
]);

// 3. Render loop
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.stepClock(dt);

  const player = world.getEntity("player")!;
  player.rot = quatFromYawPitchRoll(world.doc.time * 0.8, 0.1, Math.sin(world.doc.time) * 0.4);

  renderer.render(world);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

### Orthographic 2.5D Mode (Classic Top-Down / Isometric)
Want classic isometric/top-down sprite stacking with silky anti-aliasing and zero wobble? Just switch the camera to `"ortho"` and turn off terrain (or keep terrain enabled for top-down islands):

```ts
world.applyPatch([
  { op: "set", path: "terrain.enabled", value: false },
  {
    op: "set",
    path: "camera",
    value: {
      mode: "ortho",
      pos: [0, 42, 42],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovDeg: 45,
      orthoSize: 18,
      near: 0.1,
      far: 300,
    },
  },
]);
```

---

## 3. Asset Pipelines (4 Ways to Create Volumetric Sprites)

AASpriteStacker supports four first-class asset workflows — mix and match freely in the same scene:

### Pipeline A: Declarative Voxel + 3D SDF Blueprints (`@aastack/blueprint`)
Best for procedural craft, rapid iteration, Git-diffable assets, hollow cavities, and AI-assisted creation.

```ts
import { compileBlueprint } from "@aastack/blueprint";
import type { BlueprintSpec } from "@aastack/blueprint";

const turretSpec: BlueprintSpec = {
  id: "plasma-turret",
  name: "Plasma Turret",
  size: [20, 20, 16],
  voxelScale: 0.25,
  pivot: [10, 10, 2],
  ops: [
    // Armored base
    { op: "box", min: [4, 4, 0], max: [15, 15, 4], color: [64, 74, 92] },
    // Rounded dome with hollow visor cutout
    { op: "sphere", center: [10, 10, 8], radius: 5.5, color: [88, 100, 122] },
    { op: "box", min: [7, 13, 7], max: [12, 16, 10], subtract: true },
    // Glowing cyan sensor eye inside hollow cavity
    { op: "sphere", center: [10, 13.5, 8.5], radius: 1.4, color: [52, 232, 255], emissive: true },
    // Mirrored twin cannons (+Y is nose/forward)
    { op: "capsule", a: [5.5, 10, 8], b: [5.5, 18.5, 8], rA: 1.1, rB: 0.85, color: [255, 82, 40], mirrorX: true },
  ],
  sockets: {
    muzzleL: { pos: [5.5, 19.0, 8.0], dir: [0, 1, 0] },
    muzzleR: { pos: [14.5, 19.0, 8.0], dir: [0, 1, 0] },
  },
};

const asset = compileBlueprint(turretSpec);
world.registerAsset(asset);
```

Supported `BlueprintOp` primitives: `box`, `sphere`, `ellipsoid`, `capsule`, `wedge`, `torus`, `paint` — with `subtract: true` (CSG cutout), `mirrorX: true` (X-axis symmetry), and `emissive: true` (bloom mask).

### Pipeline B: MagicaVoxel `.vox` Files (`parseVox`)
Zero-dependency binary parser supporting `SIZE`, `XYZI`, `RGBA`, and default palette fallback:

```ts
import { parseVox } from "@aastack/core";

const res = await fetch("./assets/spaceship.vox");
const buf = await res.arrayBuffer();
const asset = parseVox(buf, {
  id: "spaceship",
  voxelScale: 0.25,
  sockets: { engine: { pos: [12, 0, 6], dir: [0, -1, 0] } },
});
world.registerAsset(asset);
```

### Pipeline C: Classic Horizontal `slices.png` Strips (`loadSliceStripPixels`)
100% compatible with existing sprite-stack strips (including `danielwh2/sprite-stacking` assets):

```ts
import { loadSliceStripPixels } from "@aastack/core";

const img = await createImageBitmap(await (await fetch("./slices.png")).blob());
const c = new OffscreenCanvas(img.width, img.height);
const ctx = c.getContext("2d")!;
ctx.drawImage(img, 0, 0);
const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

const asset = loadSliceStripPixels(pixels, img.width, img.height, {
  id: "cottage",
  slices: 32,
  voxelScale: 0.3,
});
world.registerAsset(asset);
```

### Pipeline D: 4-View Orthographic PNGs (Python Carver CLI + Browser Look-Dev Studio)
Turn a 2×2 or 1×4 orthographic turnaround (`Front / Right / Back / Left` PNG) into an edge-dilated slice strip, 3D SDF atlas, smooth normals atlas, comparison sheet, and standalone interactive HTML viewer:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/python skills/aa-sprite-stacking/scripts/aa_views_to_slices.py \
  views.png out/slices.png \
  --slices 36 \
  --sdf out/sdf.png \
  --normals out/normals.png \
  --preview out/comparison.png \
  --html out/viewer.html \
  --export-dirs 16
```

Add `--round` for cylindrical/turned silhouettes (lighthouses, rockets, barrels, towers) to fuse an analytic circular cross-section into the 3D SDF.

---

## 4. Switching Styles & Running Live A/B Comparisons

Switch art direction at runtime:

```ts
world.applyPatch([
  { op: "set", path: "style", value: "smooth-toy" }, // "arcade-8bit" | "hd-2d" | "smooth-toy" | "retro-raw"
]);
```

Enable the built-in split-screen A/B curtain (`Retro 1×` on the left vs. AA on the right):

```ts
world.applyPatch([
  {
    op: "set",
    path: "splitCompare",
    value: { enabled: true, splitX: 0.5, leftMode: "legacy", rightMode: "voxel-dda" },
  },
]);
```

---

## 5. Mobile Multi-Touch Integration

Use `createTouchController` from `@aastack/core` for rock-solid concurrent steering + action buttons on phones and tablets:

```ts
import { createTouchController } from "@aastack/core";

const touch = createTouchController({
  steerZone: document.getElementById("stage")!,
  stickBase: document.getElementById("stickBase"),
  stickKnob: document.getElementById("stickKnob"),
  maxRadius: 48,
});

// Inside your simulation tick:
const steerX = touch.state.steering ? touch.state.steerX : keyboardX;
const steerY = touch.state.steering ? touch.state.steerY : keyboardY;
```

Be sure your CSS sets `touch-action: none` on the stage container, `viewport-fit=cover` in `<meta name="viewport">`, safe-area padding (`env(safe-area-inset-*)`), and `≥ 44×44 px` touch targets under `@media (pointer: coarse)`.

---

## 6. Connecting a Frontier Coding Agent Live (`?bridge=1`)

To let **Antigravity, Claude Code, Cursor, Codex, or Gemini CLI** patch your live browser scene, hot-swap blueprints, and inspect 2×2 PNG contact sheets with zero production overhead, lazy-load `@aastack/bridge/client` only when `?bridge=1` is present:

```ts
if (new URLSearchParams(window.location.search).get("bridge") === "1") {
  const { connectDevBridge } = await import("@aastack/bridge/client");
  connectDevBridge(
    { world, renderer, onSyncUI: () => syncUI() },
    { title: "My AASpriteStacker Game" },
  );
}
```

Then register `packages/mcp/dist/server.js` in your MCP config and open your page with `?bridge=1`. See [`docs/ai-integration.md`](ai-integration.md) for the full 18-tool reference and security boundaries.

---

## 7. Using the Shaders in Godot 4 or Unity URP

See [`skills/aa-sprite-stacking/references/engines.md`](../skills/aa-sprite-stacking/references/engines.md) for drop-in single-draw-call RGSS Voxel DDA and 3D SDF shaders for **Godot 4**, **Unity URP**, **WebGL2**, and **Canvas 2D**.
