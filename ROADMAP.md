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

## Milestone 2: Frontier LLM Integration & Interfaces *(Next — Target for `v0.1.0`)*

Goal: Make AASpriteStacker the cleanest, highest-leverage **iterative AI-native game engine** — without bloating `@aastack/core` or locking into any single model vendor.

- [ ] **Live Runtime Bridge (WebSocket / Dev Relay for `@aastack/mcp`):** Allow an external coding agent (Claude Code, Antigravity, Cursor, Codex, Gemini CLI) to attach to a running browser tab, push live `ScenePatchOp[]` / hot-swapped `BlueprintSpec` JSON with zero reload, query `getStats()` / `raycastEntities()`, and receive real rendered PNG frames (`captureDataUrl`) for closed-loop visual self-critique.
- [ ] **Strict JSON Schema + Structured Diagnostics:** Publish machine-readable JSON Schemas (`scene-ir.schema.json`, `blueprint.schema.json`, `patch.schema.json`) and actionable validation errors (e.g., socket out-of-bounds, floating disconnected voxels, mobile fill-rate budget warnings) so models self-correct in 1 turn.
- [ ] **Multi-Turn Visual Critique & Diff Loop (`aastack_capture_frame`, `aastack_patch_live`, `aastack_verify_orbit`):** Let agents spin an asset across `0°/45°/90°/180°` or switch `Overhead`/`Chase`/`Cockpit`, inspect rendered screenshots, and iteratively refine geometry, colors, and lighting.
- [ ] **Model-Agnostic Prompt & Tooling Adapters:** Keep runtime 100% vendor-neutral while shipping clean adapters/examples for MCP, OpenAI/Anthropic/Gemini tool-calling schemas, and `llms-full.txt` context packs.
- [ ] **Zero-Setup Studio Mode / Live Patch Console:** Optional dev overlay & hot-reload harness so humans and agents can co-edit the same live scene with full undo/redo history and export clean `.json` / `.ts` / `.vox` artifacts.

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
