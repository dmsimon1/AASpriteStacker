# AA-GeoField: Next-Gen Procedural SDF + Anti-Aliased Sprite-Stacking Architecture

> **Branch:** `feat/scene-maker`
> **Goal:** Break permanently out of the blocky "Legoland" voxel look (without falling into melted plastic clay), enable prompting and sculpting **literally anything** through Blender Geometry Nodes-inspired proceduralism, and preserve the core superpower of **lightweight 2D sprite stacks** (single-OBB WebGL2 instancing, Exploded-Slice inspection, standard 2D `slices.png` export, and self-contained offline `.html` cartridges).

---

## 1. Research Foundation (OSS & Academic State of the Art)

This architecture synthesizes breakthroughs from four converging lines of open-source graphics engineering and SIGGRAPH / CVPR / NeurIPS 2024-2026 research:

1. **Blender Geometry Nodes (OSS Functional Proceduralism):**
   - **Fields (`Field<T>`):** Lazy, composable functions (`f(pos, normal, curveT, id, time) -> T`) evaluated across domains (curves, points, instances, volume grids) instead of imperative array loops.
   - **Native SDF Volume Grids (OpenVDB):** Continuous signed distance representation enabling artifact-free sharp and smooth booleans (`min`, `smin`, subtraction, filleting, hollow shells) with zero broken mesh topology.
   - **Simulation Zones:** Frame-to-frame feedback state (`Frame n -> Frame n+1`) directly inside the procedural graph for living motion (swaying wind, drifting bubbles/embers, growing vines, flowing water caustics, orbiting craft).
2. **Non-Grid, Non-Polygonal Indie Breakthroughs:**
   - **Media Molecule's *Dreams* (Alex Evans, SIGGRAPH):** Pure CSG + SDF authoring rendered via painterly micro-detail rather than hard cubic voxels, yielding vast expressive worlds in tiny file sizes.
   - ***Tiny Glade* (Pounce Light) & *Townscaper* (Oskar Stalberg):** Non-grid spline/curve input paired with context-aware architectural grammars (paths carving arches through walls, roofs merging cleanly) and fast raymarched soft lighting / bounce GI.
   - **Inigo Quilez Analytic SDFs & Brickmaps:** Exact continuous distance primitives (`sdRoundBox`, `sdCapsule`, `sdBezier`, `sdLathe`, polynomial `smin`), 5-tap multi-scale analytical SDF ambient occlusion, and soft penumbra SDF shadows.
3. **LLM + Procedural 3D Program Synthesis (2024-2026):**
   - **The Scene Language (Stanford / Berkeley, CVPR 2025 Highlight):** Executable symbolic scene programs combining hierarchy, loops, semantic words, and continuous parameters.
   - **GeoCode (SIGGRAPH) & MeshCoder / MegaParts (2025):** Parameterized procedural DAGs / code so high-level edits propagate structurally across complex assemblies.
   - **LL3M (UChicago, 2025):** Multi-agent procedural code generation backed by an API Cookbook RAG to prevent math/syntax hallucinations.
   - **BlenderAlchemy (2024-2026), BlenderGym (CVPR), & SceneWeaver (NeurIPS 2025):** Closed-loop **Reason -> Build -> Render -> Visual Self-Critique -> Refine** pipelines that inspect actual rendered frames to elevate silhouette, lighting, and craft automatically.

---

## 2. Why Standard Voxels Look Like "Legoland" (And Why We Still Keep Sprite Stacks)

### Root Cause Diagnosis
- Standard sprite stacks and voxel grids store binary `0/1` occupancy per integer cell and trace axis-aligned cube faces (`+-X, +-Y, +-Z`). Every sloped roof, Gothic arch, boat hull, tree branch, or curved fuselage collapses into 90-degree staircases.
- Conversely, smooth untextured SDF blobs collapse into **"melted plastic clay."**

### The Breakthrough: The Extended Continuous-SDF Sprite Stack
Is the output still a lightweight 2D sprite stack? **Yes.**

Every `AA-GeoField` object compiles into the exact same lightweight `W x L x H` horizontal slice-stack `VolumeAsset` rendered with **1 oriented bounding box (12 triangles, hardware-instanced)**, with three key upgrades:
1. **Unquantized `R16F` Continuous SDF Slice Stack:** Instead of rasterizing binary Lego cubes first and approximating distance afterward, `GeoGraph` evaluates exact continuous mathematical signed distance (`Float32 -> IEEE-754 R16F` half-float `TEXTURE_3D` with hardware trilinear filtering) directly into every slice. Zero quantization ripples, zero stair-stepping at any zoom.
2. **`RG8` Emissive + Material Slice Stack:**
   - `R` (`0..255`): Graded continuous emissive (`100..138` soft glowing interiors, `215..255` bright beacons/runes/bioluminescence).
   - `G` (`0..255`): Per-voxel material class (`Matte`, `Ashlar Stone`, `Carved Timber`, `Organic Foliage / Moss`, `Terracotta / Satin Lacquer`, `Brushed Metallic Brass/Steel`, `Translucent Glass / Crystal`, `Glowing Fluid`).
3. **Full Lightweight 2D Sprite-Stack Parity:**
   - Any procedural `GeoGraph` asset exports directly to a standard **2D horizontal `slices.png` sprite strip** (compatible with Godot, Unity, GameMaker, or classic 2D stackers) OR an optional dual-strip (`slices.png` + `sdf_slices.png`) for full non-Legoland rendering.
   - Pressing **`X` (Exploded Slice Mode)** slices even a 100% smooth curved Roman dome or brass bathysphere cleanly into floating horizontal 2D slices via `sliceClip` in **1 instanced WebGL2 draw call**.
   - **Tiny File Footprint:** A full procedural `GeoGraph` JSON recipe is `5-30 KB`, expanding on load into millions of sub-voxel details inside a standalone offline `.html` cartridge.

---

## 3. `@aastack/core` Rendering Upgrades

### 3.1 SIGGRAPH-Grade Continuous SDF Sphere Tracer (`traceSmoothSdfRay`)
- **96-step adaptive sphere tracing + 4-iteration binary bisection refinement** on surface hit for razor-sharp silhouettes and exact sub-voxel intersection on thin arches, ironwork, and curved hulls.
- **Anti-Oversmoothing Matte Architecture Pass:** Tight tetrahedral normal gradient (`e = 0.085`), exact mean SDF curvature (`sampleSdf(hp + n*0.38) + sampleSdf(hp - n*0.38)`) driving crisp edge catchlights and concave seam darkening, sharp-edged albedo sampling (`mix(texelFetch, texture, 0.14)`), and physically grounded specular gating so dry stone, terracotta, timber, and foliage stay matte while metals and glass gleam cleanly.
- **Slice-Clip Exact Intersection:** Clamps SDF cleanly to `vSliceClip` so Exploded-Slice inspection works seamlessly on continuous SDF volumes.

### 3.2 Seam-Free Periodic Wrapped Surface UVs (`uUvTex`) & Procedural Relief
World-axis triplanar projection stretches diagonally around cylindrical towers and cuts horizontally across curved bridge arches. `AA-GeoField` solves this with a dedicated `RGBA8` 3D texture (`uUvTex` bound on `TEXTURE4`, `gl.LINEAR`) storing periodic phase coordinates:

```
uUvTex(x, y, z) = [cos(2*pi*u), sin(2*pi*u), cos(2*pi*v), sin(2*pi*v)] mapped to [0..255]
```

- **Zero Wrap Seams:** Unlike raw `fract(u)` (which averages `1.0` and `0.0` to `0.5` across the wrap boundary), `(cos, sin)` is $C^\infty$-continuous everywhere on the unit circle. Hardware trilinear filtering interpolates exact sub-voxel `(uTile, vTile)` via `fract(atan(sin, cos) / (2*pi))`.
- **Neutral Un-UV'd Fallback (`128`):** Air and natural organic rock store `[128, 128, 128, 128]` (center `(0,0)` of the phase circle), so blending between UV-wrapped architecture and non-UV natural rock decays vector length cleanly without pulling angles toward a corner.
- **Exact Architectural Wrapping (`1.0` unit = 2 bricks/tiles x 2 staggered courses):**
  - Cylindrical towers & Roman rotunda drums use integer-period `u = (atan2(ly, lx) / 2*pi) * N` so running-bond ashlar bricks wrap 360 degrees with zero stretch and zero seam.
  - Conical terracotta roofs radiate barrel tiles cleanly from finial apex to eaves (`u = (theta / 2*pi) * 14`).
  - Semicircular stone bridge arches use radial polar UVs (`u = (atan2(z - h, dx) / pi) * N`) so wedge-shaped voussoirs fan radially around every arch crown and soffit.
- **Per-Material Surface Relief (`uEmisTex.g`):**
  - **Ashlar Stone (`32`):** Brick-coherent warm/cool mineral variation, carved mortar grooves, and tangent-space `(tangU, tangV)` beveled edge normals.
  - **Carved Timber (`64`):** Directional wood grain and plank seam relief.
  - **Organic Foliage / Moss / Coral (`96`):** Sculpted leaf micro-clusters plus velvety subsurface wrap lighting.
  - **Terracotta / Satin Ceramic (`128`):** Curved barrel-tile cylindrical normal ribbing and stepped course lips.
  - **Brushed Metallic (`160`):** Anisotropic brush streaks, optional wrapped hull rivets, and colored metallic specular highlights.
  - **Translucent Glass / Crystal (`208`):** Crisp Fresnel sky rim reflection plus emissive interior glow.
  - **Bioluminescent Fluid / Crystal (`240`):** Subsurface inner glow plus continuous bloom.

### 3.3 Real-Time SDF Soft Shadows, Multi-Scale AO, 1-Bounce GI & 16 Live 3D Lights
- **5-Tap Analytical Multi-Scale SDF AO:** Samples distance along the surface normal at `0.45, 1.0, 1.8, 3.0, 4.8` voxels, combined with concave SDF curvature darkening.
- **Analytical SDF Soft Penumbra Self-Shadows:** Marches `24` steps toward the sun using Inigo Quilez's `min(res, k * d / t)` penumbra estimator.
- **Up to 16 Live 3D Point & Spot Lights (`uPointLights[]`, `uPointLightCols[]`, `uPointLightDirs[]`):** Evaluated once per surface hit on both continuous SDF and voxel-DDA assets.

### 3.4 Geometry-First Style Philosophy
Artistic and architectural style belongs in the **generated 3D geometry and material grammar** (e.g., Roman fluted colonnades vs alpine timber-stone vs Gothic ribs vs Japanese joinery), not in post-pass shader filters or smoothing overlays. `@aastack/core` keeps shading clean, crisp, and physically grounded while `@aastack/geofield` varies structure directly in procedural geometry.

---

## 4. `@aastack/geofield` Procedural Node-Graph & Multifractal Terrain Package

New zero-dependency TypeScript workspace package (`packages/geofield/`) implementing Blender Geometry Nodes-inspired proceduralism and contemporary multifractal terrain synthesis:

### 4.1 Functional Fields (`Field<T>`)
- `fbm3`, `voronoi3`, `ridge3`, `vnoise3`, `hash31`, `smoothstep`, `mix`, `fract`.
- Evaluated lazily at any 3D query point `(x, y, z, t)` during SDF baking, surface coloring, weathering/draping, and context-aware scattering.

### 4.2 Exact Continuous SDF Primitives, Operators & Wrapped UVs
- **Primitives:** `sdBox`, `sdRoundBox`, `sdCylinderX/Y/Z`, `sdCappedConeZ`, `sdEllipsoid`, `sdTorus`, `sdCapsule`, `sdPitchedRoofY`, `sdArchY`, `sdLatheZ` (2D-profile revolution for domes, fluted columns, round towers, urns), `sdSplineLoft` (3D Catmull-Rom spline sweep with variable radius for arches, tree limbs, coral, and skids).
- **Operators:** `GeoFieldState.union`, `smoothUnion`, `subtract`, `paint`, `setUv` (emitting seam-free `uvPhaseU8` automatically when any surface assigns intrinsic `(u, v)` coordinates), `opSmoothMin`, `opSmoothSubtract`, `opOnion`, `opPolarFold`.

### 4.3 Contemporary Multifractal Terrain Engine (`packages/geofield/src/terrain.ts`)
Combines classic and contemporary analytical multifractal techniques with exact **1:1 CPU/GPU parity** (identical sin-free Dave Hoskins 2D hash and quintic Hermite derivatives in TypeScript and WebGL2 GLSL ES 3.00):
- **Domain-Warped Ken Musgrave Ridged Multifractal (`musgraveRidged2D`):** 6 octaves of folded squared ridges weighted by preceding octave signal (`weight = clamp(signal * gain, 0, 1)`) with rotated octaves (`mat2(0.8, 0.6, -0.6, 0.8)`) for jagged tectonic arêtes and mountain skylines.
- **Giliam de Carpentier Swiss-Turbulence / Analytical Derivative Erosion (`swissTurbulence2D`):** 6 octaves accumulating exact analytical noise gradients (`vnoise2Grad`), warping higher octaves down-slope and damping amplitude by `1 / (1 + erosion * dot(dSum, dSum))` to form incised gullies alongside rocky valley benches.
- **Dual-LOD 10-Octave Faceted Rock Detail & Matte Geological Shading:** Pass 0 raymarches the 6-octave macro terrain (`124` steps + `5` bisection refinements) and evaluates 4 extra high-frequency ridged octaves plus angular Worley/Voronoi granite cleavage (`F2 - F1`) strictly at the shading hit. Combined with analytical terrain concavity AO, 18-step soft mountain shadows, crisp wind-drifted snowpack pockets, zero plastic specular gloss on rock/snow, and Rayleigh/Mie aerial perspective.
- **Seamless 3D Asset-to-Terrain Fusion (`sampleMultifractalTerrain`):** CPU scene composition queries `sampleMultifractalTerrain(x, z, cfg)` to snap bridge abutments, alpine watchtowers, and snow-dusted conifers onto exact terrain elevation, re-snapping live as `Ridge` and `Erosion` parameters change.

### 4.4 Declarative `GeoGraph` Compiler + 2D Slice-Strip Exporter
- `compileGeoVolume(opts)` compiles continuous SDF, RGBA, emissive, material, and wrapped periodic `uvPhaseU8` directly into a `@aastack/core` `VolumeAsset`.
- `packHorizontalSliceStrip(asset)` exports any `VolumeAsset` into a lightweight RGBA horizontal 2D sprite-stack image (`(W * H) x L`) ready to save as `slices.png`.
- `scatterOnSdf(opts)` performs slope-filtered Poisson-spaced surface scattering, and `SimulationZone` encapsulates frame-to-frame procedural animation feedback.

---

## 5. How `AA-GeoField` Powers the Rabbit-Hole PromptMaker (Roadmap)

With the non-Legoland `AA-GeoField` rendering and procedural node core proven first, the full SceneMaker workbench layers directly on top:
1. **Phase 1 (Current Spike):** `@aastack/core` continuous `R16F` SDF + `RG8` material + 16 live 3D voxel point/spot lights + triplanar micro-relief + Style Dial + `@aastack/geofield` package + 2 brand-new non-Legoland showcase worlds (*Sunken Bioluminescent Roman Rotunda & Volcanic Sea Cave* + *Sunlit Mediterranean Cliffside Arch & Lantern Bridge*) proving the visual leap side-by-side against Lego voxels!
2. **Phase 2 (Universal Open-Palette Environment & Spline Grammar):** Data-driven open-palette ground/fluid shader (`materials[0..7]` defined by each scene) + non-grid spline intersection grammar (paths carving arches, roads raising bridges).
3. **Phase 3 (Portable Player & "Make Standalone Disk"):** `.aascene.json` + single-file offline `.html` cartridge exporter (`file://` playable, zero deps, round-trip remixable on drag-back) + `slices.png` exporter.
4. **Phase 4 (Rabbit-Hole PromptMaker + Spatial Canvas Workbench):** Concept Diverge (3 interpretations / 3-stroke napkin sketch) -> Dynamic 5-Lens "Why Stop There?" Rabbit-Hole Chips -> Click-to-Magnify Director Lens -> Multimodal Visual Self-Critique Loop (*SceneWeaver* / *BlenderAlchemy* style) -> Visual Branching Filmstrip & `PLAY` mode.
