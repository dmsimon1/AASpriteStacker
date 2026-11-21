# AASpriteStacker Roadmap

This document tracks the concrete milestones from our current foundation to **`v0.1.0`** (first public open-source release) and beyond.

---

## Milestone 1: Core Engine & Look-Dev Foundation *(Completed)*

- [x] Zero-dependency WebGL2 ES 3.00 6-DOF & 2.5D AA renderer (`@aastack/core`)
- [x] Amanatides–Woo 3D Voxel DDA + Continuous 3D SDF Sphere Tracing + `1×/4×/8×` RGSS
- [x] 16-bit packed `RGBA8` 4-pass JFA outlines (zero float-FBO extensions; mobile-safe)
- [x] Live `RenderStyle` softswitch (`arcade-8bit`, `hd-2d`, `smooth-toy`, `retro-raw`)
- [x] Patchable `SceneIR` + undo/redo, deterministic clock + `snapshot`/`restore`, semantic sockets, 1:1 CPU/GPU terrain & voxel raycast
- [x] Declarative Voxel + 3D SDF Blueprint CSG compiler (`@aastack/blueprint`) + MagicaVoxel `.vox` & `slices.png` loaders
- [x] Python 4-view soft visual-hull + 3D SDF carver + zero-install Browser Look-Dev Studio (`viewer.html`)
- [x] Flagship `SkyStack` 6-DOF Flight Demo (Overhead / Chase / Cockpit, desktop + mobile multi-touch, ~29 KB gzip)
- [x] Complete standard open-source docs, package READMEs, tests, and GitHub Actions CI

---

## Milestone 2: Frontier LLM Integration & Interfaces *(Completed)*

Goal: Make AASpriteStacker the cleanest, highest-leverage **iterative AI-native game engine** — without bloating `@aastack/core` or locking into any single model vendor.

- [x] **Zero-Dep Isomorphic `@aastack/bridge` Package:** Draft 2020-12 JSON Schemas (`BLUEPRINT_SPEC_SCHEMA`, `SCENE_PATCH_OPS_SCHEMA`, `SCENE_DOCUMENT_SCHEMA`), vendor-neutral tool adapters (`toOpenAITools`, `toAnthropicTools`, `toGeminiFunctionDeclarations`), in-process `executeEngineTool()` dispatcher, and lazy-loaded browser `connectDevBridge()` client (`0` bytes in production when unused).
- [x] **3D Geometric & Mobile-Budget Linter (`@aastack/bridge/linter`):** Exact 3D 6-connected-component BFS floating voxel island detection, socket bounds & primary-hull detachment checks, empty volume errors, and mobile VRAM/entity budget diagnostics.
- [x] **Embedded Localhost RFC 6455 WebSocket Relay (`@aastack/mcp`):** Zero-dependency loopback relay (`ws://127.0.0.1:8787`) with automatic multi-agent leader/follower port sharing, strict `Origin` allowlist, and workspace-confined `aastack_save_blueprint` / `aastack_export_scene` persistence tools.
- [x] **Native MCP Visual Self-Critique Loop:** Single-frame PNG capture (`aastack_live_capture`) and 2×2 labeled multi-angle contact sheets (`aastack_live_capture_views`: `turntable` and `scene`) returned as native MCP `image/png` blocks + telemetry JSON.
- [x] **Live Co-Editing UX (`examples/flight-6dof`):** Opt-in `?bridge=1` / IR toggle + subtle `"Agent Live"` pill with status dot, edit toast, and 1-click `Undo`, verified end-to-end across Leader+Follower MCP servers and live Chromium.

---

## Milestone 3: `v0.1.0` Public OSS Launch Checklist

- [ ] Browser compatibility sweep (Chrome, Safari/iOS WebKit, Firefox, Android Chrome WebGL2)
- [ ] Clean npm package manifests (`exports`, `files`, `.d.ts` maps, `sideEffects: false`) ready for `@aastack/core`, `@aastack/blueprint`, `@aastack/mcp` publication
- [ ] Hosted GitHub Pages live demo (`SkyStack` 6-DOF + 4-View Look-Dev Studio)
- [ ] Additional compact examples: 2.5D orthographic RPG/racer starter (`examples/ortho-25d/`) and `.vox` asset drop-in starter
- [ ] Flip repository visibility from private to public and cut `v0.1.0` release tag

---

## Milestone 4: `v0.2.0+` Engine Expansion

- [ ] **WebGPU Backend:** Drop-in `WebGPURenderer` behind the same `AASpriteRenderer` interface (compute-accelerated JFA & instanced indirect OBB culling)
- [ ] **GPU-Instanced Batches:** Single instanced draw call for 100+ identical props (trees, buildings, asteroids, particles)
- [ ] **Multi-Part Articulated Rigs & Keyframe/Spring Animation:** Hierarchical bone/socket animation for characters, mechs, and animated vehicles
- [ ] **First-Class Godot 4 Addon & Unity UPM Package:** Package the single-draw-call shaders + `.vox`/`slices.png` importers as installable addons
- [ ] **Audio & Procedural SFX Hooks:** Lightweight deterministic event hooks so agents and devs can wire WebAudio/chiptune SFX cleanly to thruster, roll, and collision events
