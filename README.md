# AASpriteStacker (`@aastack/*`)

> **World-class, mobile-friendly, AI-first anti-aliased 6-DOF & 2.5D sprite-stacking engine SDK.**  
> Zero polygons. Zero runtime dependencies. ~26 KB gzipped full demo. Built for both indie engineers and frontier coding agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why AASpriteStacker?

Traditional sprite stacking breaks under rotation (nearest-neighbor pixel crawl, 1px post blinking, jagged 4-neighbor outlines, Z-slice gaps) and falls apart completely under 6-DOF pitch/roll perspective cameras. Meanwhile, naively enabling bilinear filtering causes vertical-wall alpha buildup (`1 - (1 - α)^N → 1`), muddy blur, and dark transparent halos.

**AASpriteStacker** upgrades sprite stacking from first principles into a complete GPU-native 6-DOF & 2.5D rendering SDK:

- **Exact Orthographic & 6-DOF Perspective Raycasting (`@aastack/core`)**: Tight 12-triangle OBB proxy volumes rendered via back-face culling (camera can fly *inside* clouds!) using **Amanatides–Woo 3D Voxel DDA** and **3D Signed Distance Field Sphere Tracing** with `1×/4×/8×` Rotated Grid Supersampling (RGSS), linear-light compositing, true `gl_FragDepth` occlusion, and distance-adaptive LOD.
- **Mobile-First Performance Governor & Touch UX**: Zero required float-FBO extensions (16-bit packed `RGBA8` 4-pass **Jump Flooding Algorithm** outlines), adaptive DPR + dynamic resolution scaling (DRS) for locked 60 FPS on mobile GPUs, safe-area insets, and multi-touch floating joystick + 44px+ action controls.
- **First-Principles AI-Friendly Engine Hooks (Iterative, Not Just One-Shot)**:
  1. **Patchable SceneIR** (`world.applyPatch(ops)` + `undo()` / `redo()`)
  2. **Deterministic Clock & Time-Travel** (`stepClock(dt)`, `snapshot()`, `restore()`)
  3. **Hot-Swappable Asset Registry** with content hashing & named **Semantic Sockets** (`wingtipL`, `thrusterR`, `cockpitCam`)
  4. **Built-in Introspection** (`renderer.getStats()`, `renderer.captureDataUrl()`, `normals/depth/object-id` debug overlays)
  5. **1:1 CPU/GPU Spatial Queries** (`world.sampleTerrainHeight()`, `world.raycastEntities()`)
- **Universal Asset Ingest**:
  - **Declarative Voxel + 3D SDF Blueprints** (`@aastack/blueprint`) — pure JSON/TS CSG supporting hollow cavities, symmetry, emissives, and sockets
  - **MagicaVoxel `.vox`** binary loader (`parseVox`)
  - **4-View Orthographic Soft Visual-Hull + 3D SDF Carver** (`skills/aa-sprite-stacking/scripts/aa_views_to_slices.py`)
  - **Backward-compatible `slices.png` strips** + **Godot 4 & Unity URP single-draw-call shaders** (`skills/aa-sprite-stacking/references/engines.md`)
- **Native Frontier Agent Integration**: Stdio **MCP Server** (`@aastack/mcp`), **Agent Skill** (`skills/aa-sprite-stacking/SKILL.md`), and concise **`llms-full.txt`** specification.

---

## Monorepo Architecture

```text
packages/
  core/        # @aastack/core — Zero-dep WebGL2 6-DOF & 2.5D AA engine, .vox/strip loaders, SceneIR, mobile touch
  blueprint/   # @aastack/blueprint — Declarative Voxel+SDF CSG DSL & built-in presets (Jet, Clouds, SkyGate)
  mcp/         # @aastack/mcp — Model Context Protocol server for Claude Code, Cursor, Antigravity, Codex
examples/
  flight-6dof/ # Flagship "SkyStack" 6-DOF Overhead/Chase/Cockpit AA flight demo (desktop + mobile, ~26 KB gz)
skills/
  aa-sprite-stacking/
    SKILL.md
    references/engines.md           # Godot 4, Unity URP, WebGL2, Canvas 2D shaders
    scripts/aa_views_to_slices.py   # Soft visual-hull 3D SDF carver + RGSS Python renderer
    scripts/viewer.html             # Zero-install Browser Look-Dev & A/B AA Studio
tests/
  core.test.mjs       # Node test suite (6-DOF math, Blueprint CSG, .vox, SceneIR, voxel raycast)
  test_aa_stacker.py  # Python suite (rotation symmetry, 1px post persistence, shimmer RMS reduction)
```

---

## Quick Start

```bash
# 1. Install dev dependencies & build all packages + flagship demo
npm install
npm run build

# 2. Run TypeScript engine tests
npm test

# 3. Serve the flagship 6-DOF Flight Demo & Look-Dev Studio locally
npm run dev:serve
# Open:
#   http://127.0.0.1:8765/examples/flight-6dof/index.html
#   http://127.0.0.1:8765/skills/aa-sprite-stacking/scripts/viewer.html
```

### Python 4-View Soft Visual-Hull & 3D SDF CLI

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python tests/test_aa_stacker.py

.venv/bin/python skills/aa-sprite-stacking/scripts/aa_views_to_slices.py views.png slices.png \
  --slices 36 --sdf sdf.png --normals normals.png \
  --preview check.png --html viewer.html --export-dirs 16
```

### MCP Server for Coding Agents

```json
{
  "mcpServers": {
    "aastack": {
      "command": "node",
      "args": ["packages/mcp/dist/server.js"]
    }
  }
}
```

---

## Benchmarks & Verified Quality

- **Flagship 6-DOF Flight Demo (`examples/flight-6dof`):** `120 fps` (`0.1–0.2 ms` CPU frame time, `36` draw calls at `2560×1600` WebGL2), **`26.1 KB` gzipped** bundle.
- **Temporal Rotation Shimmer (1° delta RMS):** Reduced by **50.3%** (`4.83 → 2.40` in AA Crisp Voxel DDA) and **58.0%** (`4.83 → 2.03` in AA Smooth SDF).
- **Cardinal Rotation Wobble:** `0.00 px` drift across `0° / 90° / 180° / 270°` on even-sized sprites.

## License

[MIT](LICENSE)
