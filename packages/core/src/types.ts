/**
 * Core types & Patchable SceneIR schema for @aastack/core.
 * Designed to be flat, JSON-serializable, strict, and concise for both humans and frontier AI agents.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]
export type RGB = [number, number, number]; // 0..255

export type AAMode = "legacy" | "voxel-dda" | "smooth-sdf" | "bandlimited";
export type ShadeStyle = "toon-aa" | "pbr-lite" | "unlit";
export type CameraMode = "overhead" | "chase" | "cockpit" | "ortho" | "free";
export type QualityTier = "auto" | "mobile" | "desktop" | "ultra";
export type DebugOverlay = "none" | "normals" | "depth" | "object-id";

export interface SocketDef {
  /** Position in asset voxel coordinates [0..W, 0..L, 0..H]. */
  pos: Vec3;
  /** Optional local forward direction in asset voxel space. */
  dir?: Vec3;
}

export interface AssetProvenance {
  kind: "blueprint" | "vox" | "slices" | "4view";
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
  /** Emissive mask (0 or 255). */
  emisU8: Uint8Array;
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
  /** Optional outline toggle (e.g. clouds often disable harsh dark outlines). */
  outline?: boolean;
  /** Casts shadow onto terrain/water (for clouds & aircraft). */
  castShadow?: boolean;
  /** Emissive intensity override (0..2). */
  emissiveBoost?: number;
  /** Custom metadata tag (e.g. "player", "cloud", "prop"). */
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
  /** Half-height in world units (orthographic mode). */
  orthoSize: number;
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
  aaMode: AAMode;
  samples: 1 | 4 | 8;
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
  canvasWidth: number;
  canvasHeight: number;
  dpr: number;
  drsScale: number;
  drawCalls: number;
  visibleEntities: number;
  totalEntities: number;
  isMobile: boolean;
  backend: "webgl2" | "none";
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
