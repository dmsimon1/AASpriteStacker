/**
 * Core types & Patchable SceneIR schema for @aastack/core.
 * Designed to be flat, JSON-serializable, strict, and concise for both humans and frontier AI agents.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]
export type RGB = [number, number, number]; // 0..255

export type AAMode = "legacy" | "voxel-dda" | "smooth-sdf" | "bandlimited";
export type AAQuality = "eco" | "balanced" | "ultra";
export type BackgroundMode = "terrain" | "studio" | "solid" | "transparent";
export type RenderStyle = "arcade-8bit" | "hd-2d" | "smooth-toy" | "retro-raw";
export type ArtStyle =
  | "crisp-maquette"
  | "moebius-cel"
  | "painterly"
  | "hd-2d-voxel"
  | "classic-sprite"
  | "clay-maquette";
export type ShadeStyle = "toon-aa" | "pbr-lite" | "unlit";
export type CameraMode = "overhead" | "chase" | "cockpit" | "ortho" | "oblique" | "free";
export type IsometricPreset = "dimetric-2to1" | "isometric" | "oblique-stack" | "topdown-3quarter";
export type QualityTier = "auto" | "mobile" | "desktop" | "eco" | "balanced" | "ultra";
export type DebugOverlay = "none" | "normals" | "depth" | "object-id" | "overdraw";

/**
 * Per-voxel material class encoded in uEmisTex.g (0..255) for continuous SDF & voxel shading.
 */
export const MATERIAL_ID = {
  matte: 0,
  stone: 32,
  wood: 64,
  foliage: 96,
  terracotta: 128,
  metal: 160,
  glass: 208,
  bioFluid: 240,
} as const;

export type MaterialKind = keyof typeof MATERIAL_ID;

export interface PointLightState {
  /** World-space position [X right, Y up, Z south]. */
  pos: Vec3;
  /** Light attenuation radius in world units. */
  radius: number;
  /** RGB light color (0..255). */
  color: RGB;
  /** Intensity multiplier (default 1.0). */
  intensity?: number;
  /** Optional normalized spotlight direction in world space (omit for omnidirectional point light). */
  dir?: Vec3;
  /** Optional spotlight cone cosine cutoff (e.g. 0.82 = ~35 deg half-angle). */
  spotCos?: number;
  /** Optional spotlight soft edge feather (default 0.12). */
  spotSoft?: number;
}

export interface OverdrawReport {
  writtenAvg: number;
  writtenMax: number;
  coveredAvg: number;
  coveredMax: number;
  drawCalls: number;
  visibleEntities: number;
  pixels: number;
  exact: boolean;
}

export interface SocketDef {
  /** Position in asset voxel coordinates [0..W, 0..L, 0..H]. */
  pos: Vec3;
  /** Optional local forward direction in asset voxel space. */
  dir?: Vec3;
}

export interface AssetProvenance {
  kind: "blueprint" | "geofield" | "vox" | "slices" | "4view";
  source?: string;
}

export interface VolumeAsset {
  id: string;
  name: string;
  hash: string;
  /** Voxel grid dimensions: width (X), length (Y, nose=+Y), height (Z, up=+Z). */
  w: number;
  l: number;
  h: number;
  /** World-space scale per voxel (default 1.0). */
  voxelScale: number;
  /** Pivot in voxel coordinates (defaults to [w/2, l/2, h/2]). */
  pivot: Vec3;
  /** Packed SDF range in voxel units. */
  sdfRange: number;
  /** Edge-dilated RGBA8 volume data (length = w * l * h * 4, z-major: z*l*w + y*w + x). */
  rgba: Uint8Array;
  /** Continuous float32 3D Signed Distance Field (negative inside, positive outside). */
  sdfF32: Float32Array;
  /** Packed 8-bit SDF (128 = 0.0). */
  sdfU8: Uint8Array;
  /** Packed smooth SDF normals (RGB) + ambient occlusion (A). */
  normAo: Uint8Array;
  /** Graded continuous emissive mask (0..255). */
  emisU8: Uint8Array;
  /** Optional per-voxel material class (0..255, see MATERIAL_ID) uploaded in uEmisTex.g (RG8). */
  materialU8?: Uint8Array;
  /** Optional seam-free periodic wrapped surface UV volume (RGBA8: cos(2pi*u), sin(2pi*u), cos(2pi*v), sin(2pi*v)). */
  uvPhaseU8?: Uint8Array;
  /** True when sdfF32 holds an exact analytic/procedural continuous SDF (not a binary voxel EDT). */
  hasExactSdf?: boolean;
  /** Named semantic attachment sockets (e.g. thrusterL, wingtipR, cockpitCam). */
  sockets: Record<string, SocketDef>;
  provenance: AssetProvenance;
}

export interface EntityState {
  id: string;
  assetId: string;
  /** World-space position [X right, Y up, Z south]. */
  pos: Vec3;
  /** 6-DOF orientation quaternion [x, y, z, w]. */
  rot: Quat;
  /** Uniform or per-axis scale multiplier. */
  scale: number;
  /** Optional parent entity ID (inherits parent transform + optional parentSocket). */
  parentId?: string;
  parentSocket?: string;
  /** Optional per-entity AA mode override. */
  aaMode?: AAMode;
  /** Optional outline toggle (defaults to true). */
  outline?: boolean;
  /** Optional blend between crisp cube-face normals (0) and smooth SDF normals (1). Defaults to style preset (~0.24). */
  normalSmoothness?: number;
  /** Optional AA LOD priority ("hero" keeps full RGSS sample count; "auto" uses distance-based LOD). */
  aaPriority?: "hero" | "auto";
  /** Casts shadow onto ground/terrain plane. */
  castShadow?: boolean;
  /** Emissive intensity override (0..2). */
  emissiveBoost?: number;
  /** Optional normalized Z-slice clip range [zMin, zMax] in [0..1] for slice-by-slice build, dismantle, or interior wall cutaways. */
  sliceClip?: [number, number];
  /** Custom user metadata tag (e.g. "player", "npc", "prop"). */
  tag?: string;
  visible?: boolean;
}

export interface CameraState {
  mode: CameraMode;
  pos: Vec3;
  target: Vec3;
  /** Camera up vector (enables full horizon roll in chase/cockpit!). */
  up: Vec3;
  /** Vertical field of view in degrees (perspective modes). */
  fovDeg: number;
  /** Half-height in world units (orthographic / oblique modes). */
  orthoSize: number;
  /** Vertical slice extrusion ratio for mode === "oblique" (1.0 = 1:1 sprite-stack height, 0.5 = cabinet). */
  obliqueSkew?: number;
  /** Horizontal yaw azimuth in degrees for mode === "oblique" (default 0). */
  obliqueYawDeg?: number;
  near: number;
  far: number;
}

export interface LightingState {
  /** Sun azimuth in degrees. */
  sunAzimuthDeg: number;
  /** Sun elevation in degrees (5..85). */
  sunElevationDeg: number;
  /** Time of day 0 = bright day, 0.5 = golden sunset, 1.0 = night. */
  timeOfDay: number;
  /** Atmospheric horizon fog density (0..1). */
  fogDensity: number;
  /** Global shading style. */
  shadeStyle: ShadeStyle;
  /** Outline thickness in art-scale pixels (0 disables). */
  outlineWidth: number;
  /** Enable 3D self-shadowing on hero objects. */
  selfShadow: boolean;
  /** Optional real-time 3D point and spot lights (up to 16) illuminating voxel & SDF surfaces. */
  pointLights?: PointLightState[];
  /** Optional procedural triplanar micro-relief strength (0..1, default 0 for legacy demos). */
  microRelief?: number;
  /** Optional continuous stylization dial (0 = smooth painterly SDF sculpt, 0.5 = stylized, 1 = stacked sprite). */
  styleDial?: number;
  /** Optional discrete art-direction style preset (crisp-maquette | moebius-cel | painterly | hd-2d-voxel | classic-sprite | clay-maquette). */
  artStyle?: ArtStyle;
}

export interface TerrainState {
  enabled: boolean;
  seed: number;
  /** Water level at Y = 0; max island elevation in world units. */
  maxHeight: number;
  /** Horizontal world scale of island noise. */
  scale: number;
  /** Animated water time in seconds. */
  waveTime: number;
  /** Quantized terrace steps for stylized pixel-art relief (0 = smooth). */
  terraceSteps: number;
}

export interface RibbonPoint {
  pos: Vec3;
  age: number; // 0 (newest) .. 1 (expired)
  width: number;
}

export interface RibbonState {
  id: string;
  points: RibbonPoint[];
  color: RGB;
  alpha: number;
  emissive?: boolean;
}

export interface SplitCompareState {
  enabled: boolean;
  /** Normalized split position 0..1 across screen X. */
  splitX: number;
  leftMode: AAMode;
  rightMode: AAMode;
}

/**
 * Full serializable Scene Intermediate Representation (SceneIR).
 * Both Studio UI and Frontier AI agents read, diff, and patch this document.
 */
export interface SceneDocument {
  version: 1;
  seed: number;
  time: number;
  tick: number;
  /** High-level look-dev softswitch ("arcade-8bit" | "hd-2d" | "smooth-toy" | "retro-raw"). */
  style: RenderStyle;
  aaMode: AAMode;
  samples: 1 | 2 | 4 | 8;
  camera: CameraState;
  lighting: LightingState;
  terrain: TerrainState;
  splitCompare: SplitCompareState;
  debugOverlay: DebugOverlay;
  entities: EntityState[];
  ribbons: RibbonState[];
}

export type ScenePatchOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "spawn"; entity: EntityState }
  | { op: "remove"; entityId: string }
  | { op: "updateEntity"; entityId: string; patch: Partial<Omit<EntityState, "id">> };

export interface EngineTelemetry {
  fps: number;
  frameMs: number;
  /** Asynchronous GPU execution time in ms (when EXT_disjoint_timer_query_webgl2 is supported). */
  gpuMs?: number;
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  drsScale: number;
  drawCalls: number;
  visibleEntities: number;
  totalEntities: number;
  isMobile: boolean;
  backend: "webgl2" | "none";
  /** Active runtime AA quality softswitch ("eco" | "balanced" | "ultra"). */
  quality: AAQuality;
  activeSamples: number;
  tick: number;
  time: number;
}

export interface SpatialHit {
  entityId: string;
  distance: number;
  point: Vec3;
  normal: Vec3;
  voxel: Vec3;
}
