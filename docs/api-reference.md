# API Reference

Concise, exact TypeScript & MCP API reference for `@aastack/core`, `@aastack/blueprint`, and `@aastack/mcp`.

---

## 1. `@aastack/core`

Zero external runtime dependencies. All exports live in `packages/core/src/index.ts`.

### Core Types (`types.ts`)

| Type | Definition |
| --- | --- |
| `Vec2`, `Vec3`, `Quat`, `RGB` | Tuple types: `[number, number]`, `[number, number, number]`, `[x, y, z, w]`, `[r, g, b]` (`0..255`) |
| `RenderStyle` | `"arcade-8bit" \| "hd-2d" \| "smooth-toy" \| "retro-raw"` |
| `AAMode` | `"legacy" \| "voxel-dda" \| "smooth-sdf" \| "bandlimited"` |
| `ShadeStyle` | `"toon-aa" \| "pbr-lite" \| "unlit"` |
| `CameraMode` | `"overhead" \| "chase" \| "cockpit" \| "ortho" \| "free"` |
| `QualityTier` | `"auto" \| "mobile" \| "desktop" \| "ultra"` |
| `DebugOverlay` | `"none" \| "normals" \| "depth" \| "object-id"` |
| `SocketDef` | `{ pos: Vec3; dir?: Vec3 }` in voxel asset space `[0..W, 0..L, 0..H]` |
| `ScenePatchOp` | `{ op: "set"; path: string; value: unknown }` \| `{ op: "spawn"; entity: EntityState }` \| `{ op: "remove"; entityId: string }` \| `{ op: "updateEntity"; entityId: string; patch: Partial<Omit<EntityState, "id">> }` |

### `SceneWorld` (`scene.ts`)

Holds the serializable `SceneDocument` (SceneIR), asset registry, undo/redo stacks, and spatial queries.

```ts
const world = new SceneWorld(initial?: Partial<SceneDocument>);
```

| Method / Property | Description |
| --- | --- |
| `world.doc` | Current `SceneDocument` (`style`, `aaMode`, `samples`, `camera`, `lighting`, `terrain`, `splitCompare`, `debugOverlay`, `entities`, `ribbons`, `time`, `tick`, `seed`) |
| `world.registerAsset(asset: VolumeAsset)` | Registers or hot-swaps a `VolumeAsset` by `asset.id`; GPU textures update automatically when `asset.hash` changes |
| `world.getAsset(id: string)` | Returns `VolumeAsset \| undefined` |
| `world.listAssets()` | Returns all registered `VolumeAsset[]` |
| `world.applyPatch(ops: ScenePatchOp[], recordUndo = true)` | Applies atomic surgical edits to `world.doc` and pushes an undo entry when `recordUndo` is `true` |
| `world.undo(): boolean` / `world.redo(): boolean` | Steps backward/forward through SceneIR patch history |
| `world.stepClock(dt: number)` | Advances deterministic simulation `time`, `tick`, and `terrain.waveTime` |
| `world.snapshot(): string` / `world.restore(json: string)` | Full deterministic JSON serialization & time-travel restore |
| `world.getEntity(id: string)` | Returns `EntityState \| undefined` |
| `world.getEntityWorldMatrix(ent)` | Computes hierarchical `Float32Array(16)` world matrix (resolving `parentId` + `parentSocket`) |
| `world.getVoxelToWorldMatrix(ent)` | Computes `Float32Array(16)` mapping voxel coords `[0..W, 0..L, 0..H]` directly to world space |
| `world.getSocketWorldPos(entityId, socketName)` | Returns world-space `Vec3 \| null` for a named asset socket |
| `world.getSocketWorldDir(entityId, socketName)` | Returns normalized world-space `Vec3 \| null` for a socket's local direction |
| `world.sampleTerrainHeight(x, z)` | Returns exact elevation `>= 0` (`0` = ocean), matching `TERRAIN_FS` 1:1 |
| `world.raycastEntities(ro, rd, maxDist = 400)` | Exact 3D voxel DDA raycast against all visible entities; returns `SpatialHit \| null` (`entityId`, `distance`, `point`, `normal`, `voxel`) |

Standalone helper: `sampleTerrainHeight(x, z, terrain)` and `createDefaultScene(seed?)`.

### `AASpriteRenderer` (`renderer.ts`)

```ts
const renderer = new AASpriteRenderer(canvas: HTMLCanvasElement, opts?: {
  quality?: QualityTier;          // default "auto"
  adaptiveDpr?: boolean;          // default true (mobile DRS governor)
  maxDpr?: number;                // default 1.5 mobile, 2.0 desktop
  preserveDrawingBuffer?: boolean; // default true (enables captureDataUrl)
});
```

| Method / Property | Description |
| --- | --- |
| `renderer.isReady` | `true` if WebGL2 context and all 6 shader programs linked cleanly |
| `renderer.isMobile` | Resolved mobile profile flag |
| `renderer.resizeToDisplay(cssW?, cssH?)` | Resizes backing buffer respecting DPR cap & adaptive DRS |
| `renderer.render(world: SceneWorld)` | Renders all 4 passes (terrain, OBB entities, 3D ribbons, JFA outlines + bloom + style grade) |
| `renderer.getStats(): EngineTelemetry` | Returns `{ fps, frameMs, canvasWidth, canvasHeight, dpr, drsScale, drawCalls, visibleEntities, totalEntities, isMobile, backend, activeSamples, tick, time }` |
| `renderer.captureDataUrl(world, mimeType?)` | Renders one deterministic frame and returns a PNG/WebP data URL for visual QA & MCP screenshots |

### Volume & Asset Loaders (`volume.ts`, `loaders.ts`)

| Function | Description |
| --- | --- |
| `createVolumeAsset(input)` | Builds a complete `VolumeAsset` (3D EDT SDF, smooth normals + AO, 3D RGB edge dilation, emissive mask, content hash) from raw `rgba` voxels |
| `compute3DSdf(rgba, w, l, h, smoothStrength?)` | Exact `O(N)` 3-pass Felzenszwalb–Huttenlocher 3D Euclidean SDF with boundary air clamping |
| `parseVox(buffer: ArrayBuffer, opts: VoxParseOptions)` | Zero-dependency MagicaVoxel `.vox` binary parser (`SIZE`, `XYZI`, `RGBA`, default palette) |
| `loadSliceStripPixels(pixels, stripW, stripH, opts)` | Loads horizontal `slices.png` RGBA pixel buffers into a `VolumeAsset` |

### 6-DOF Math & Mobile Touch (`math.ts`, `mobile.ts`)

- **Vector & Matrix:** `clamp`, `lerp`, `vec3Add`, `vec3Sub`, `vec3Scale`, `vec3Dot`, `vec3Cross`, `vec3Len`, `vec3Norm`, `vec3Lerp`, `mat4Identity`, `mat4Mul`, `mat4Invert`, `mat4FromTRS`, `mat4AssetToLocal`, `mat4LookAt`, `mat4Perspective`, `mat4Ortho`, `mat4TransformPoint`, `mat4TransformDir`.
- **Quaternions:** `quatIdentity`, `quatNorm`, `quatMul`, `quatFromYawPitchRoll`, `quatRotateVec3`.
- **Touch:** `createTouchController({ steerZone, stickBase?, stickKnob?, maxRadius? })` → `{ state: VirtualControlState, destroy() }`.

---

## 2. `@aastack/blueprint`

Zero external runtime dependencies (depends only on `@aastack/core`).

### `compileBlueprint(spec: BlueprintSpec): VolumeAsset`

```ts
interface BlueprintSpec {
  id: string;
  name?: string;
  size: [number, number, number]; // [W, L, H], max 256*256*128
  voxelScale?: number;            // default 1.0
  pivot?: Vec3;                   // default [W/2, L/2, H/2]
  smoothSdf?: number;             // default 0.14
  ops: BlueprintOp[];
  sockets?: Record<string, SocketDef>;
}
```

| `op` | Parameters | Optional Modifiers |
| --- | --- | --- |
| `"box"` | `min: Vec3, max: Vec3` | `color`, `emissive`, `subtract`, `mirrorX` |
| `"sphere"` | `center: Vec3, radius: number` | `color`, `emissive`, `subtract`, `mirrorX` |
| `"ellipsoid"` | `center: Vec3, radii: Vec3` | `color`, `emissive`, `subtract`, `mirrorX` |
| `"capsule"` | `a: Vec3, b: Vec3, rA: number, rB?: number` | `color`, `emissive`, `subtract`, `mirrorX` |
| `"wedge"` | `min: Vec3, max: Vec3, taperAxis, shrinkAxis, minScale?` | `color`, `emissive`, `mirrorX` |
| `"torus"` | `center: Vec3, majorRadius: number, minorRadius: number, axis: "x"\|"y"\|"z"` | `color`, `emissive` |
| `"paint"` | `min: Vec3, max: Vec3, color: RGB` | `emissive`, `mirrorX` |

### Built-In Presets (`presets.ts`)
- `createFighterJetBlueprint(id = "fighter-jet")` — Swept-wing twin-engine interceptor with `thrusterL`, `thrusterR`, `wingtipL`, `wingtipR`, `cockpitCam` sockets.
- `createCloudBlueprint(variant: 0 | 1 | 2 = 0, id?)` — 3-tone sunlit multi-lobed volumetric cumulus clouds.
- `createSkyGateBlueprint(id = "sky-gate")` — Hollow emissive sky-ring checkpoint with `center` socket.

---

## 3. `@aastack/mcp`

Zero-dependency stdio JSON-RPC 2.0 MCP server (`node packages/mcp/dist/server.js`).

| Tool Name | Arguments | Returns |
| --- | --- | --- |
| `aastack_compile_blueprint` | `{ spec: BlueprintSpec }` | `{ ok, id, hash, dimensions, solidVoxels, fillRatio, emissiveVoxels, gpuTextureKB, sockets }` |
| `aastack_inspect_vox` | `{ path: string, id?: string }` | `{ ok, id, hash, dimensions, solidVoxels, gpuTextureKB }` |
| `aastack_carve_4view` | `{ inputPng, outputSlicesPng, slices?, round?, previewPng?, sdfPng? }` | Runs `aa_views_to_slices.py` via `.venv/bin/python` and returns `{ ok, stdout, stderr }` |
| `aastack_validate_scene_ir` | `{ scene: Partial<SceneDocument>, patches?: ScenePatchOp[] }` | Validates `parentId` references, positive scales, `RenderStyle`, and mobile entity budgets |
| `aastack_get_sdk_spec` | `{}` | Returns the full contents of [`llms-full.txt`](../llms-full.txt) |
