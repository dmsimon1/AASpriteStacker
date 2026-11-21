# Changelog

All notable changes to **AASpriteStacker** (`@aastack/*`) are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) starting at `0.1.0`.

## [Unreleased] — Road to `0.1.0`

### Added
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
