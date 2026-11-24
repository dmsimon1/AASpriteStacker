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
- **Slice-Clip Exact Intersection:** Clamps SDF cleanly to `vSliceClip` so Exploded-Slice inspection works seamlessly on continuous SDF volumes.
- **Tetrahedral Continuous Normals:** Smooth continuous surface gradients everywhere (never restricted to 6 cube faces).

### 3.2 Escaping Plastic Clay: Triplanar Procedural Micro-Relief
In the fragment shader, surface normals and subtle albedo grain are perturbed procedurally in local object space based on the per-voxel Material ID (`uEmisTex.g`), adding sub-pixel craftsmanship at near-zero cost:
- **Ashlar Stone (`32`):** Staggered hand-laid masonry blocks, carved mortar crevices, and subtle weathered mineral speckles.
- **Carved Timber (`64`):** Directional wood grain and plank seam relief.
- **Organic Foliage / Moss / Coral (`96`):** Painterly *Dreams*-style cellular micro-flecks plus velvety subsurface wrap lighting.
- **Terracotta / Satin Lacquer (`128`):** Barrel-tile / shingle ribbing or clean painted sheen.
- **Brushed Metallic (`160`):** High-contrast metallic Blinn-Phong highlights tinted by base metal color (brass, bronze, copper, steel).
- **Translucent Glass / Crystal (`208`):** Crisp Fresnel rim reflection plus translucent interior depth hint.
- **Bioluminescent Fluid / Crystal (`240`):** Soft subsurface inner glow + continuous emissive bloom.

### 3.3 Real-Time SDF Soft Shadows, Multi-Scale AO, 1-Bounce GI & 16 Live 3D Lights
- **5-Tap Analytical Multi-Scale SDF AO:** Samples distance along the surface normal at `0.45, 1.0, 1.8, 3.0, 4.8` voxels to ground vaults, arches, caves, eaves, and foliage organically.
- **Analytical SDF Soft Penumbra Self-Shadows:** Marches `24` steps toward the sun using Inigo Quilez's `min(res, k * d / t)` penumbra estimator for crisp contact shadows that soften naturally with distance.
- **1-Bounce Warm Indirect Fill:** Hemisphere sky + warm sunlit/ground color bleed prevents dead grey shadows.
- **Up to 16 Live 3D Point & Spot Lights (`uPointLights[]`, `uPointLightCols[]`, `uPointLightDirs[]`):** Evaluated once per surface hit in `VOXEL_FS` (works on BOTH continuous SDF and voxel-DDA assets!). Streetlamps, bioluminescent corals, glowing crystals, fireplaces, and moving vehicle spotlights physically light up nearby stone walls, columns, trees, and actors.

### 3.4 The Continuous Style Dial (`uStyleDial: 0.0 .. 1.0`)
One live uniform renders the exact same lightweight slice stack anywhere along the artistic continuum:
- **`0.00` Painterly / Miniature Sculpture:** Pure continuous SDF + triplanar micro-relief + soft penumbra shadows + warm bounce GI (zero Legoland).
- **`0.35` Stylized Crisp Miniature:** Subtle sculptural faceting with crisp bevel catchlights and painterly grain.
- **`0.70` Micro-Voxel HD-2D:** Quantized high-res micro-slices with rich continuous lighting and 3D point lights.
- **`1.00` Classic Stacked Sprite:** Crunchy retro voxel/slice-stack aesthetic.

---

## 4. `@aastack/geofield` Procedural Node-Graph Package

New zero-dependency TypeScript workspace package (`packages/geofield/`) implementing the Blender Geometry Nodes paradigm for the browser:

### 4.1 Functional Fields (`Field<T>`)
- `posField`, `fbm3`, `voronoi3`, `ridge3`, `turbulence3`, `mapRange`, `smoothstep`, `mixField`, `slopeMask`, `heightMask`, `radialMask`.
- Evaluated lazily at any 3D query point `(x, y, z, t)` during SDF baking, surface coloring, material assignment, weathering/draping, and context-aware scattering.

### 4.2 Exact Continuous SDF Primitives & Operators
- **Primitives:** `sdBox`, `sdRoundBox`, `sdChamferBox`, `sdCylinder`, `sdCone`, `sdEllipsoid`, `sdTorus`, `sdCapsule`, `sdPitchedRoof`, `sdArch` (semicircular & pointed Gothic arches!), `sdLathe` (exact continuous 2D-profile revolution for domes, columns, vases, turrets, bathysphere hulls, saucers), `sdBezierLoft` (exact continuous 3D Catmull-Rom / Bezier spline sweep with variable radius for organic curved bridges, twisted olive/cypress tree limbs, cavern ribs, coral branches, boat hulls, and winding roots!).
- **Operators:** `union` (sharp architectural crease), `subtract` (sharp or smooth carve), `intersect`, `smin` (polynomial smooth union with smooth color + material blending!), `smax` (smooth organic carving), `onion` (thin hollow shells/domes/arches), `mirrorX`, `polarRepeat` (circular colonnades, radial struts, gears, towers), `fieldDisplace` (eroded basalt cliffs, weathered stone, snowdrifts, moss, bark).

### 4.3 Declarative `GeoGraph` Compiler + 2D Slice-Strip Exporter
- `evaluateGeoVolume(spec)` evaluates any procedural node graph into a `@aastack/core` `VolumeAsset` with exact `sdfF32`, `rgba`, `emisU8`, `materialU8`, and semantic `sockets`.
- `exportHorizontalSliceStrip(asset)` packs any `VolumeAsset` into a lightweight RGBA horizontal 2D sprite-stack image (`(W * H) x L`) ready to save as `slices.png`.
- `scatterOnField(spec)` performs context-aware surface placement (e.g., glowing coral along wet seafloor crevices, hanging moss under arch overhangs, warm lanterns along curved bridge parapets, trees avoiding roads/water).
- `SimulationZone` provides clean frame-to-frame procedural animation state for floating particles, rising bubbles, gentle swaying foliage/lanterns, bobbing boats, and orbiting/pilotable hero craft.

---

## 5. How `AA-GeoField` Powers the Rabbit-Hole PromptMaker (Roadmap)

With the non-Legoland `AA-GeoField` rendering and procedural node core proven first, the full SceneMaker workbench layers directly on top:
1. **Phase 1 (Current Spike):** `@aastack/core` continuous `R16F` SDF + `RG8` material + 16 live 3D voxel point/spot lights + triplanar micro-relief + Style Dial + `@aastack/geofield` package + 2 brand-new non-Legoland showcase worlds (*Sunken Bioluminescent Roman Rotunda & Volcanic Sea Cave* + *Sunlit Mediterranean Cliffside Arch & Lantern Bridge*) proving the visual leap side-by-side against Lego voxels!
2. **Phase 2 (Universal Open-Palette Environment & Spline Grammar):** Data-driven open-palette ground/fluid shader (`materials[0..7]` defined by each scene) + non-grid spline intersection grammar (paths carving arches, roads raising bridges).
3. **Phase 3 (Portable Player & "Make Standalone Disk"):** `.aascene.json` + single-file offline `.html` cartridge exporter (`file://` playable, zero deps, round-trip remixable on drag-back) + `slices.png` exporter.
4. **Phase 4 (Rabbit-Hole PromptMaker + Spatial Canvas Workbench):** Concept Diverge (3 interpretations / 3-stroke napkin sketch) -> Dynamic 5-Lens "Why Stop There?" Rabbit-Hole Chips -> Click-to-Magnify Director Lens -> Multimodal Visual Self-Critique Loop (*SceneWeaver* / *BlenderAlchemy* style) -> Visual Branching Filmstrip & `PLAY` mode.
