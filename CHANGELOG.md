# Changelog

All notable changes to **AASpriteStacker** (`@aastack/*`) are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.1.0`.

## [Unreleased] — Road to `0.1.0`

### Added
- **First-Class 2.5D Isometric & Oblique Projection System (`@aastack/core`):**
  - Added `createIsometricCamera({ preset: "dimetric-2to1" | "isometric" | "oblique-stack" | "topdown-3quarter", pixelsPerUnit?, viewportHeightCss?, obliqueSkew? })`, `mat4ObliqueOrtho()`, `CameraMode: "oblique"`, `projectWorldToScreen()`, and `unprojectScreenToGround()` ground picking.
  - Upgraded `examples/minimal-2d/` (and published live at `/iso/`) into an interactive 2.5D Isometric & Oblique Transparent Overlay sandbox synchronized with a real Canvas2D tilemap and click-to-tile picking.
- **Low-Level GPU & Zero-GC Performance Pass (`@aastack/core`):**
  - Exact homogeneous column-step RGSS ray setup (`16 -> 2` `mat4*vec4` per pixel at `8×` RGSS, bit-identical).
  - Same-voxel sample shading cache + mathematically exact back-face self-shadow early-out (`ndotl <= -0.28`).
  - 6-plane Gribb-Hartmann frustum sphere culling (`extractFrustumPlanes` / `sphereInFrustum`), parallel-projection signed depth sorting, lazy `TERRAIN_FS` shader compilation, lazy `uSdfTex` GPU upload, `renderer.evictAsset()`, `renderer.dispose()`, `webglcontextlost` recovery, `computeSdf?: boolean`, and zero-GC scratch matrices/pools.
- **True Drop-In WebGL2 Ergonomics (`@aastack/core`):**
  - Premultiplied transparent overlay mode (`background: "transparent" | "studio" | "solid" | "terrain"` + `backgroundColor` + runtime `renderer.setBackground()`) for layering anti-aliased sprite stacks over existing 2D canvases/tilemaps with zero dark halos.
  - One-line browser asset loaders: `loadSliceStripUrl()`, `loadSliceStripFromImage()`, and `loadVoxUrl()`.
  - Live runtime AA quality softswitch (`renderer.setQuality("eco" | "balanced" | "ultra", world)`) toggling `2×` / `4×` / `8×` RGSS, DPR (`1.25×` / `1.5×` / `2.0×`), and half-res vs. full-res JFA outlines on the fly.
  - Hardware WebGL2 GPU frame timer (`EXT_disjoint_timer_query_webgl2` → `EngineTelemetry.gpuMs`) and 60 fps frame pacing for cool thermal efficiency.
  - Genre-agnostic engine decoupling: explicit `EntityState.normalSmoothness` and `EntityState.aaPriority` (removing implicit outline-to-cloud coupling), nested partial `SceneWorld` constructor merging, and `VirtualStickState` alias.
- **Minimal 2.5D Transparent-Overlay Starter (`examples/minimal-2d/`):** ~45-line TypeScript example showing an orthographic AA sprite stack layered cleanly over an existing 2D tilemap.
- **MagicaVoxel `.vox` Drag-and-Drop & Auto Camera Reset in Studio (`skills/aa-sprite-stacking/scripts/viewer.html`):** Load any `.vox` binary or horizontal `slices.png` strip directly via file picker or drag-and-drop, inspect live with the 4× loupe, export 16-dir AA sheets, and automatically reset camera framing on model or view switches.
- **Standalone Engine Reference Shaders (`shaders/godot4/` & `shaders/unity-urp/`):** Copy-paste `aa_sprite_stack.gdshader` and `AASpriteStack.shader` reference ports of single-quad 4× RGSS 3D Voxel DDA.
- **Publish-Ready Package Manifests & Expanded CI:** Added npm publishing metadata across all 4 workspaces (`@aastack/{core,blueprint,bridge,mcp}`), `createCottageBlueprint()` preset, `aasprite.com` static website (`site/` + `/primer/` visual sprite-stacking primer), and tarball verification (`npm pack --dry-run`) in `.github/workflows/ci.yml`.
- **Isomorphic LLM Bridge Package (`@aastack/bridge`):** Zero-dependency Draft 2020-12 JSON Schemas, vendor-neutral tool adapters (MCP, OpenAI, Anthropic, Gemini), 3D 6-connected-component geometric & socket linter, in-process `executeEngineTool()` dispatcher, and lazy-loaded browser `connectDevBridge()` client with single-frame & 2×2 labeled PNG contact sheet rendering.
- **Live Localhost WebSocket Relay (`@aastack/mcp`):** Embedded zero-dep RFC 6455 loopback relay (`ws://127.0.0.1:8787`) with automatic multi-agent leader/follower port sharing, strict local `Origin` allowlist, native MCP `image/png` capture responses, and workspace-confined `aastack_save_blueprint` / `aastack_export_scene` tools (18 MCP tools total).
- **Live Co-Editing UX (`examples/flight-6dof`):** Opt-in `?bridge=1` / IR toggle lazy-loading the dev bridge chunk (`30.7 KB` gz initial load; `0` bridge bytes when off) plus subtle `"Agent Live"` status pill with 1-click `Undo`.
- **`SceneWorld.getSocketWorldDir()` (`@aastack/core`):** Returns normalized world-space direction for named semantic sockets.
- **Live `RenderStyle` Softswitch (`@aastack/core`):** First-class `SceneDocument.style` (`"arcade-8bit" | "hd-2d" | "smooth-toy" | "retro-raw"`, defaulting to `"arcade-8bit"`), switchable atomically via `world.applyPatch` or live UI (`M` key in demo).
- **8/16-Bit Arcade Shader Profile:** Derivative-width (`fwidth`) crisp contour bands (`aaBand`), vivid cobalt/azure/turquoise ocean with razor-thin shoreline surf foam, jittered clustered 8-bit highland trees, multi-lobe royal-indigo cloud shadows, cohesive billowing cloud normals, and subtle arcade vibrance/contrast punch.
- **Flagship Demo Upgrades (`examples/flight-6dof`):**
  - Live `Style` softswitch button (`8-Bit AA` / `HD-2D` / `Smooth Toy` / `Retro 1×`) integrated with the live A/B split curtain.
  - Multi-layer fiery dual afterburner thruster plumes (orange-red outer ribbon + white-gold core) active at cruise and roaring on boost.
  - Style-aware chunky 16-bit Cockpit HUD with dynamic compass tape, rolling pitch ladder, beveled metallic console with rivets, `27×27` rotating green CRT island radar minimap with sweep & sky-gate blips, 4 live analog dials (`SPD`, `ALT`, `THR`, `BNK`), artificial horizon ball, tilting physical flight yoke, toggle switches, `AB BOOST` lamp, and top-down pixel-art fighter jet MFD with segmented bar gauges.
- **Complete Engine Documentation Suite:** Flagship `README.md`, `docs/architecture.md`, `docs/getting-started.md`, `docs/api-reference.md`, `docs/flight-demo.md`, `docs/ai-integration.md`, package READMEs, `ROADMAP.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and GitHub issue/PR templates.

### Fixed
- **Coastline Ray-Step Parity (`TERRAIN_FS` & `sampleTerrainHeight`):** Prevented low terrace band `0` from collapsing coastal beaches to `0.0` height and added exact water-plane heightfield check + 4-step bisection to eliminate grazing-angle ray skipping across thin shorelines.
- **Cloud Dome Shading:** Smooth SDF normal blending (`0.78`) on soft non-outlined volumetric clouds removes checkerboard staircase artifacts while keeping crisp faceted planes (`0.24`) on hard-surface outlined actors.

### Initial Foundation (`0.1.0-alpha`)
- **`@aastack/core`:** Zero-dependency WebGL2 ES 3.00 6-DOF & 2.5D anti-aliased sprite-stacking renderer (Amanatides–Woo 3D Voxel DDA, 3D SDF sphere tracing, `1×/4×/8×` RGSS, 16-bit packed `RGBA8` 4-pass JFA outlines, emissive bloom, depth-tested 3D ribbons, adaptive DPR/DRS mobile governor), `O(N)` 3-pass 3D EDT + RGB edge dilation, MagicaVoxel `.vox` binary parser, `slices.png` strip loader, patchable `SceneIR` with undo/redo, deterministic clock + `snapshot`/`restore`, semantic sockets, 1:1 CPU/GPU heightfield & 3D voxel raycast, and multi-touch mobile virtual thumbstick controller.
- **`@aastack/blueprint`:** Declarative JSON/TS Voxel + 3D SDF CSG compiler (`box`, `sphere`, `ellipsoid`, `capsule`, `wedge`, `torus`, `paint`, `subtract`, `mirrorX`, `emissive`, `sockets`) plus `FighterJet`, 3 `Cloud` variants, and hollow `SkyGate` presets.
- **`@aastack/mcp`:** Zero-dependency stdio JSON-RPC 2.0 MCP server (`aastack_compile_blueprint`, `aastack_inspect_vox`, `aastack_carve_4view`, `aastack_validate_scene_ir`, `aastack_get_sdk_spec`).
- **4-View Carving Pipeline & Look-Dev Studio (`skills/aa-sprite-stacking/`):** Soft visual-hull + 3D SDF Python carver (`aa_views_to_slices.py`), browser Look-Dev Studio (`viewer.html`), and Godot 4 / Unity URP shaders (`references/engines.md`).
- **Automated Verification:** Node test suite (`tests/core.test.mjs`), Python test suite (`tests/test_aa_stacker.py`), and GitHub Actions CI.
