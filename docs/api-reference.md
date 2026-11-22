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
| `AAQuality` | `"eco" \| "balanced" \| "ultra"` |
| `BackgroundMode` | `"terrain" \| "studio" \| "solid" \| "transparent"` |
| `ShadeStyle` | `"toon-aa" \| "pbr-lite" \| "unlit"` |
| `CameraMode` | `"overhead" \| "chase" \| "cockpit" \| "ortho" \| "oblique" \| "free"` |
| `IsometricPreset` | `"dimetric-2to1" \| "isometric" \| "oblique-stack" \| "topdown-3quarter"` |
| `QualityTier` | `"auto" \| "mobile" \| "desktop" \| "eco" \| "balanced" \| "ultra"` |
| `DebugOverlay` | `"none" \| "normals" \| "depth" \| "object-id"` |
| `EntityState` | `{ id, assetId, pos, rot, scale, outline?, normalSmoothness?, aaPriority?, castShadow?, emissiveBoost?, tag?, visible?, parentId?, parentSocket? }` |
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
| `world.getEntityWorldMatrix(id, depth?, out?)` | Computes hierarchical `Float32Array(16)` world matrix (resolving `parentId` + `parentSocket`); pass `out` to avoid allocation |
| `world.getVoxelToWorldMatrix(ent, out?)` | Computes `Float32Array(16)` mapping voxel coords `[0..W, 0..L, 0..H]` directly to world space; pass `out` for zero-GC rendering |
| `world.getSocketWorldPos(entityId, socketName)` | Returns world-space `Vec3 \| null` for a named asset socket |
| `world.getSocketWorldDir(entityId, socketName)` | Returns normalized world-space `Vec3 \| null` for a socket's local direction |
| `world.sampleTerrainHeight(x, z)` | Returns exact elevation `>= 0` (`0` = ocean), matching `TERRAIN_FS` 1:1 |
| `world.raycastEntities(ro, rd, maxDist = 400)` | Exact 3D voxel DDA raycast against all visible entities; returns `SpatialHit \| null` (`entityId`, `distance`, `point`, `normal`, `voxel`) |

Standalone helper: `sampleTerrainHeight(x, z, terrain)` and `createDefaultScene(seed?)`.

### `AASpriteRenderer` (`renderer.ts`)

```ts
const renderer = new AASpriteRenderer(canvas: HTMLCanvasElement, opts?: {
  quality?: QualityTier;              // default "auto" ("eco" | "balanced" | "ultra" | "mobile" | "desktop")
  background?: BackgroundMode;        // default "terrain" ("transparent" | "studio" | "solid" | "terrain")
  backgroundColor?: RGB;              // RGB [0..255] used when background === "solid"
  terrainShader?: string;             // optional GLSL from `import { TERRAIN_FS } from "@aastack/core/terrain"`
  instanceBatching?: "auto" | "aggressive" | "off"; // default "auto" (WebGL2 drawElementsInstanced batching)
  adaptiveDpr?: boolean;              // default true (GPU/thermal DRS governor)
  maxDpr?: number;                    // default 1.25 eco, 1.5 balanced (1.35 mobile), 2.0 ultra
  powerPreference?: "default" | "low-power" | "high-performance"; // default "default"
  preserveDrawingBuffer?: boolean;    // default true (enables captureDataUrl)
});
```

| Method / Property | Description |
| --- | --- |
| `renderer.isReady` | `true` if WebGL2 context and core shader programs linked cleanly |
| `renderer.isMobile` | Resolved mobile profile flag |
| `renderer.setQuality(preset: AAQuality, world?)` | Live runtime AA quality softswitch (`"eco"` 2× / `"balanced"` 4× / `"ultra"` 8× Retina + full-res JFA) |
| `renderer.getQuality(): AAQuality` | Returns active runtime AA quality preset |
| `renderer.setBackground(mode: BackgroundMode, color?: RGB)` | Switches backdrop mode at runtime (`"transparent"`, `"studio"`, `"solid"`, `"terrain"`) without recreating WebGL2 |
| `renderer.getBackground(): BackgroundMode` | Returns active background mode |
| `renderer.setTerrainShader(glsl: string \| null)` | Registers or swaps the optional procedural terrain shader (`@aastack/core/terrain`) |
| `renderer.setInstanceBatching(mode)` / `getInstanceBatching()` | Switches WebGL2 hardware instancing strategy (`"auto"`, `"aggressive"`, `"off"`) at runtime |
| `renderer.resizeToDisplay(cssW?, cssH?)` | Resizes backing buffer respecting DPR cap & adaptive DRS |
| `renderer.render(world: SceneWorld)` | Renders all active passes (optional backdrop, OBB entities, 3D ribbons, JFA outlines + bloom + premultiplied transparent or opaque composite) |
| `renderer.getStats(): EngineTelemetry` | Returns `{ fps, frameMs, gpuMs?, quality, canvasWidth, canvasHeight, dpr, drsScale, drawCalls, visibleEntities, totalEntities, isMobile, backend, activeSamples, tick, time }` |
| `renderer.captureDataUrl(world, mimeType?)` | Renders one deterministic frame and returns a PNG/WebP data URL for visual QA & MCP screenshots |
| `renderer.evictAsset(assetId: string): boolean` | Frees GPU 3D textures for a single asset without disposing the renderer |
| `renderer.dispose()` | Releases all WebGL2 textures, FBOs, buffers, VAOs, shader programs, timer queries, and context listeners |

### 2.5D Isometric, Oblique & Picking Helpers (`camera.ts`)

| Function | Description |
| --- | --- |
| `createIsometricCamera(opts?)` | Builds a drop-in `CameraState` for `"dimetric-2to1"` (exact 2:1 pixel-art diamond grid), `"isometric"` (`35.264°` equal-axis axonometric), `"oblique-stack"` (un-foreshortened circular XZ footprints + pure vertical slice extrusion), or `"topdown-3quarter"` (`55°` RPG tilt); supports `pixelsPerUnit` + `viewportHeightCss` exact pixel locking |
| `computeCameraViewProj(cam, aspect, viewOut?, projOut?, vpOut?)` | Canonical View-Projection matrix builder shared by WebGL2 rendering and CPU picking |
| `projectWorldToScreen(worldPos, cam, w, h)` | Projects a 3D world point `[X, Y, Z]` to DOM/Canvas2D `{ x, y, depth, visible }` coordinates |
| `unprojectScreenToGround(sx, sy, cam, w, h, groundY = 0)` | Exact screen-to-ground-plane ray intersection across perspective, orthographic, dimetric, isometric, and oblique projections |

### Volume, Asset Loaders & Animation (`volume.ts`, `loaders.ts`, `animation.ts`)

| Function | Description |
| --- | --- |
| `createVolumeAsset(input)` | Builds a complete `VolumeAsset` (optional 3D EDT SDF via `computeSdf?: boolean`, smooth normals + AO, 3D RGB edge dilation, emissive mask, content hash) from raw `rgba` voxels |
| `compute3DSdf(rgba, w, l, h, smoothStrength?)` | Exact `O(N)` 3-pass Felzenszwalb–Huttenlocher 3D Euclidean SDF with boundary air clamping |
| `parseVox(buffer: ArrayBuffer, opts: VoxParseOptions)` | Zero-dependency MagicaVoxel `.vox` binary parser supporting both single-model files and full multi-model scene graphs (`SIZE`, `XYZI`, `RGBA`, `nTRN`, `nGRP`, `nSHP`, `_t`, `_r`, `_hidden`, optional `modelIndex`) |
| `loadVoxUrl(url: string, opts: VoxParseOptions)` | Async one-line drop-in loader fetching and compiling any MagicaVoxel `.vox` URL |
| `loadSliceStripPixels(pixels, stripW, stripH, opts)` | Loads horizontal `slices.png` RGBA pixel buffers into a `VolumeAsset` |
| `loadSliceStripFromImage(img, opts)` | Compiles an already-loaded `HTMLImageElement` or `ImageBitmap` horizontal slice strip into a `VolumeAsset` |
| `loadSliceStripUrl(url: string, opts: SliceStripOptions)` | Async one-line browser drop-in loader fetching and compiling any horizontal `slices.png` strip URL |
| `createSpriteStackClip(opts)` / `loadAnimatedStripGridPixels(...)` / `loadAnimatedStripGridUrl(url, opts)` | Compiles multi-frame animated sprite-stack sheets (rows = frames, columns = slices) into a reusable `SpriteStackClip` |
| `new SpriteStackAnimator()` | Zero-GC frame animation controller (`registerClip`, `bindEntity`, `setClip`, `play`, `pause`, `setFrame`, `getFrameIndex`, `update`) driving `entity.assetId` at `fps` with `loop` & `pingPong` support |
| `TERRAIN_FS` (`@aastack/core/terrain`) | Tree-shakeable procedural ocean, archipelago & cloud-shadow fragment shader passed to `new AASpriteRenderer(canvas, { terrainShader: TERRAIN_FS })` |

### 6-DOF Math, Frustum Culling & Mobile Touch (`math.ts`, `mobile.ts`)

- **Vector & Matrix:** `clamp`, `lerp`, `vec3Add`, `vec3Sub`, `vec3Scale`, `vec3Dot`, `vec3Cross`, `vec3Len`, `vec3Norm`, `vec3Lerp`, `mat4Identity`, `mat4Mul`, `mat4Invert`, `mat4FromTRS`, `mat4AssetToLocal`, `mat4LookAt`, `mat4Perspective`, `mat4Ortho`, `mat4ObliqueOrtho`, `mat4TransformPoint`, `mat4TransformDir`.
- **Frustum Culling:** `extractFrustumPlanes(viewProj, out?)`, `sphereInFrustum(planes, cx, cy, cz, radius)`.
- **Quaternions:** `quatIdentity`, `quatNorm`, `quatMul`, `quatFromYawPitchRoll`, `quatRotateVec3`.
- **Touch:** `createTouchController({ steerZone, stickBase?, stickKnob?, maxRadius? })` → `{ state: VirtualStickState, destroy() }` (`VirtualControlState` exported as alias).

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
- `createSportsCarBlueprint(id = "sports-car")` — Sleek crimson retro sports coupe with chunky tires, silver rims, twin white racing stripes, 1px-strut rear spoiler, and glowing headlights/taillights (`headlightL`, `headlightR`, `tailL`, `tailR`, `roof` sockets).
- `createCottageBlueprint(id = "aa-cottage")` — Classic 2.5D pixel-art cottage with pitched blue-shingled roof, glowing windows, brick chimney, and 1px rooftop weathervane (`chimney`, `vane` sockets).
- `createFighterJetBlueprint(id = "fighter-jet")` — Swept-wing twin-engine interceptor with `thrusterL`, `thrusterR`, `wingtipL`, `wingtipR`, `cockpitCam` sockets.
- `createCloudBlueprint(variant: 0 | 1 | 2 = 0, id?)` — 3-tone sunlit multi-lobed volumetric cumulus clouds.
- `createSkyGateBlueprint(id = "sky-gate")` — Hollow emissive sky-ring checkpoint with `center` socket.

---

## 3. `@aastack/bridge`

Zero-dependency isomorphic package (`sideEffects: false`) providing strict schemas, 3D geometric linting, the vendor-neutral tool dispatcher, and the browser dev bridge client.

### `@aastack/bridge/schemas`
- `BLUEPRINT_SPEC_SCHEMA`, `SCENE_PATCH_OPS_SCHEMA`, `SCENE_DOCUMENT_SCHEMA` (Draft 2020-12 JSON Schemas)
- `ENGINE_TOOL_DEFINITIONS` — vendor-neutral tool array
- `toOpenAITools()`, `toAnthropicTools()`, `toGeminiFunctionDeclarations()`
- `validateBlueprintSpec(raw)`, `validateScenePatchOps(raw)`, `validateSceneDocument(raw)` → `Diagnostic[]`

### `@aastack/bridge/linter`
- `lintVolumeAsset(asset: VolumeAsset): VolumeLintReport` — returns `{ ok, metrics, diagnostics }` including 3D 6-connected-component floating island detection (`FLOATING_VOXEL_ISLAND`), socket bounds/detachment checks, occupancy, and mobile VRAM checks.
- `lintSceneWorld(world: SceneWorld, checkAssetRegistry?): Diagnostic[]`

### `@aastack/bridge/tools`
- `executeEngineTool(ctx: EngineToolContext, tool: string, args?: Record<string, unknown>): Promise<EngineToolResult>` — executes `aastack_live_state`, `aastack_live_patch`, `aastack_live_undo`, `aastack_live_redo`, `aastack_live_hot_swap_blueprint`, `aastack_live_query`, `aastack_live_snapshot`, `aastack_live_restore`, `aastack_live_capture`, and `aastack_live_capture_views` (2×2 labeled PNG contact sheet).

### `@aastack/bridge/client`
- `connectDevBridge(ctx: EngineToolContext, opts?: DevBridgeOptions): DevBridgeHandle` — connects to `ws://127.0.0.1:8787` (or `?bridgePort=` / `opts.url`), auto-reconnects cleanly, and emits `onStatusChange` / `onAgentEvent` updates.

---

## 4. `@aastack/mcp`

Zero-dependency stdio JSON-RPC 2.0 MCP server + embedded localhost RFC 6455 WebSocket relay (`node packages/mcp/dist/server.js`) with automatic leader/follower multi-agent port sharing.

- **Offline & Persistence Tools:** `aastack_compile_blueprint`, `aastack_save_blueprint`, `aastack_export_scene`, `aastack_inspect_vox`, `aastack_carve_4view`, `aastack_validate_scene_ir`, `aastack_get_sdk_spec`.
- **Live Browser Bridge Tools:** `aastack_live_sessions`, `aastack_live_state`, `aastack_live_patch`, `aastack_live_undo`, `aastack_live_redo`, `aastack_live_hot_swap_blueprint`, `aastack_live_query`, `aastack_live_snapshot`, `aastack_live_restore`, `aastack_live_capture` (native MCP `image/png`), `aastack_live_capture_views` (2×2 labeled PNG contact sheet).
- **Helper Export (`@aastack/mcp/relay`):** `startBridgeRelay({ port?, token? })`, `isAllowedLocalOrigin(origin)`.
