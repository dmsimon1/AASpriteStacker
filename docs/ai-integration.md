# AI-First Engine Architecture & MCP Guide

**AASpriteStacker** is designed from inception to be **frontier-AI native** without putting a single AI API key, vendor SDK, or bloated abstraction inside the game runtime.

Instead of assuming a model must "one-shot" a game in a single prompt, the engine exposes **six first-principles iterative hooks** that let both humans and coding agents inspect, patch, verify, rewind, and refine a running 3D world over multiple turns.

---

## 1. The 6 First-Principles Iterative Hooks

| # | Hook | Why It Matters for Iterative AI Development |
| --- | --- | --- |
| 1 | **Patchable `SceneIR` + Undo/Redo** (`world.applyPatch`, `undo`, `redo`) | Agents emit small, surgical JSON diffs (`set`, `spawn`, `remove`, `updateEntity`) instead of rewriting 800-line files — and can safely roll back any bad edit. |
| 2 | **Deterministic Clock & Time-Travel** (`stepClock`, `snapshot`, `restore`) | Reproducible bugs and side-by-side look-dev: freeze an exact frame (`tick`, `time`, transforms, lighting), tweak a shader or blueprint, and compare pixel-for-pixel. |
| 3 | **Hot-Swappable Hashed Assets & Semantic Sockets** (`registerAsset`, `getSocketWorldPos`) | Replacing an asset by `id` updates GPU 3D textures automatically via content hash while contrails, cameras, and weapons stay attached to named sockets (`wingtipL`, `cockpitCam`). |
| 4 | **Built-In Introspection & Visual Capture** (`getStats`, `captureDataUrl`, `debugOverlay`) | Closes the visual feedback loop: an agent can check FPS/draw calls/DRS, inspect `normals` / `depth` / `object-id` buffers, and view rendered PNG frames to self-critique geometry and silhouettes. |
| 5 | **1:1 CPU/GPU Spatial Queries** (`sampleTerrainHeight`, `raycastEntities`) | Gameplay physics, radar minimaps, and automated placement tests see the exact same terrain elevation and voxel hitboxes that the GPU renders. |
| 6 | **Declarative JSON CSG Blueprints** (`@aastack/blueprint`) | LLMs are dramatically stronger at compact semantic CSG (`capsule`, `ellipsoid`, `torus`, `subtract`, `mirrorX`, `sockets`) than raw 3D voxel arrays or binary `.vox` blobs. |

---

## 2. Connecting the MCP Server (`@aastack/mcp`)

Build the server once:

```bash
npm install
npm run build
```

Then register `@aastack/mcp` in your coding agent's MCP configuration (Claude Code, Cursor, Antigravity, Codex, Gemini CLI):

```json
{
  "mcpServers": {
    "aastack": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/AASpriteStacker/packages/mcp/dist/server.js"]
    }
  }
}
```

### Available MCP Tools
1. **`aastack_get_sdk_spec`** — Loads the concise [`llms-full.txt`](../llms-full.txt) contract directly into agent context for zero-hallucination code generation.
2. **`aastack_compile_blueprint`** — Compiles and validates a JSON `BlueprintSpec`, reporting solid voxel count, fill ratio, emissive count, GPU 3D texture memory budget (`KB`), sockets, and content hash.
3. **`aastack_inspect_vox`** — Inspects a MagicaVoxel `.vox` asset on disk for dimensions, occupancy, and GPU texture budget.
4. **`aastack_carve_4view`** — Runs `skills/aa-sprite-stacking/scripts/aa_views_to_slices.py` to carve a 4-view orthographic PNG into edge-dilated `slices.png`, 3D `sdf.png`, and comparison preview.
5. **`aastack_validate_scene_ir`** — Validates a `SceneDocument` + `ScenePatchOp[]` for missing `parentId` links, invalid `RenderStyle`, non-positive scales, and mobile GPU entity budgets.

---

## 3. Agent Skill & `llms-full.txt`

- **`llms-full.txt`:** Ultra-concise (~60 lines) specification at repo root designed to fit cleanly inside any model's context window.
- **`skills/aa-sprite-stacking/SKILL.md`:** Agent Skill packaging the 4-view soft visual-hull carving workflow, look-dev studio, and Godot 4 / Unity URP shader references.

---

## 4. Next Up (`v0.1.0` Milestone): Live LLM Bridge & Visual Critique Loop

Our next milestone (see [`ROADMAP.md`](../ROADMAP.md)) extends `@aastack/mcp` with a live WebSocket dev bridge so any frontier model can push patches and hot-swapped blueprints directly into a running browser canvas, orbit/capture multi-angle screenshots, inspect telemetry, and iterate with a human co-pilot in real time — while keeping `@aastack/core` 100% zero-dependency and vendor-neutral.
