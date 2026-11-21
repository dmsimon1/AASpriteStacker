/**
 * Patchable SceneIR, Deterministic Clock, Snapshot/Restore, Hierarchical Sockets,
 * and Unified Spatial Queries (1:1 parity with GPU terrain & voxel volumes).
 */

import {
  clamp,
  mat4AssetToLocal,
  mat4FromTRS,
  mat4Invert,
  mat4Mul,
  mat4TransformDir,
  mat4TransformPoint,
  quatIdentity,
  vec3Norm,
} from "./math.js";
import type {
  EntityState,
  SceneDocument,
  ScenePatchOp,
  SpatialHit,
  TerrainState,
  Vec3,
  VolumeAsset,
} from "./types.js";

// Sin-free Dave Hoskins 2D hash — bit-consistent across JS & every WebGL2 mobile/desktop GPU!
function hash21(px: number, py: number): number {
  let x = (px * 0.1031) % 1; if (x < 0) x += 1;
  let y = (py * 0.1030) % 1; if (y < 0) y += 1;
  const d = x * (y + 33.33) + y * (x + 33.33);
  x += d; y += d;
  let r = ((x + y) * x) % 1;
  if (r < 0) r += 1;
  return r;
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Exact CPU twin of the GPU island archipelago heightfield shader.
 * Returns elevation >= 0 (0.0 = ocean surface, > 0 = island land/cliffs).
 */
export function sampleTerrainHeight(x: number, z: number, terrain: TerrainState): number {
  if (!terrain.enabled) return 0;
  const sc = terrain.scale;
  const sx = x * sc + terrain.seed * 17.31;
  const sz = z * sc + terrain.seed * 31.17;

  let amp = 0.54;
  let freq = 1.0;
  let sum = 0.0;
  for (let i = 0; i < 4; i++) {
    sum += amp * valueNoise2D(sx * freq, sz * freq);
    freq *= 2.07;
    amp *= 0.48;
  }

  // Sculpt broad oceanic channels between organic islands
  const raw = sum - 0.53;
  if (raw <= 0) return 0;
  let h = Math.pow(raw / 0.47, 1.32) * terrain.maxHeight;
  if (terrain.terraceSteps > 0) {
    const step = terrain.maxHeight / terrain.terraceSteps;
    const band = Math.floor(h / step);
    const frac = (h / step) - band;
    // Slight bevel on each terrace riser so cliffs stay anti-aliased & readable
    const smoothFrac = clamp((frac - 0.72) / 0.28, 0, 1);
    h = (band + smoothFrac * smoothFrac * (3 - 2 * smoothFrac)) * step;
  }
  return h;
}

export function createDefaultScene(seed = 7): SceneDocument {
  return {
    version: 1,
    seed,
    time: 0,
    tick: 0,
    aaMode: "voxel-dda",
    samples: 4,
    camera: {
      mode: "chase",
      pos: [0, 26, 42],
      target: [0, 18, 0],
      up: [0, 1, 0],
      fovDeg: 52,
      orthoSize: 28,
      near: 0.4,
      far: 650,
    },
    lighting: {
      sunAzimuthDeg: 38,
      sunElevationDeg: 54,
      timeOfDay: 0.0,
      fogDensity: 0.35,
      shadeStyle: "toon-aa",
      outlineWidth: 0.85,
      selfShadow: true,
    },
    terrain: {
      enabled: true,
      seed,
      maxHeight: 16,
      scale: 0.0085,
      waveTime: 0,
      terraceSteps: 6,
    },
    splitCompare: {
      enabled: false,
      splitX: 0.5,
      leftMode: "legacy",
      rightMode: "voxel-dda",
    },
    debugOverlay: "none",
    entities: [],
    ribbons: [],
  };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Stateful, patchable, deterministic SceneWorld with Undo/Redo, Snapshot/Restore,
 * Asset Registry (hot-swappable), Socket Queries, and Voxel Raycasting.
 */
export class SceneWorld {
  public doc: SceneDocument;
  private assets = new Map<string, VolumeAsset>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxHistory = 64;
  private onAssetChangeListeners: Array<(assetId: string) => void> = [];

  constructor(initial?: Partial<SceneDocument>) {
    this.doc = { ...createDefaultScene(initial?.seed ?? 7), ...initial };
  }

  /** Register or hot-swap a VolumeAsset in place (emits GPU re-upload notification). */
  registerAsset(asset: VolumeAsset): void {
    this.assets.set(asset.id, asset);
    for (const fn of this.onAssetChangeListeners) fn(asset.id);
  }

  getAsset(id: string): VolumeAsset | undefined {
    return this.assets.get(id);
  }

  listAssets(): VolumeAsset[] {
    return Array.from(this.assets.values());
  }

  onAssetChange(listener: (assetId: string) => void): () => void {
    this.onAssetChangeListeners.push(listener);
    return () => {
      const i = this.onAssetChangeListeners.indexOf(listener);
      if (i >= 0) this.onAssetChangeListeners.splice(i, 1);
    };
  }

  getEntity(id: string): EntityState | undefined {
    return this.doc.entities.find((e) => e.id === id);
  }

  /** Apply surgical JSON patches (used by both Studio UI and Frontier AI agents/MCP). */
  applyPatch(ops: ScenePatchOp[], recordUndo = true): void {
    if (recordUndo) {
      this.undoStack.push(this.snapshot());
      if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
      this.redoStack.length = 0;
    }

    for (const op of ops) {
      if (op.op === "set") {
        setByPath(this.doc as unknown as Record<string, unknown>, op.path, op.value);
      } else if (op.op === "spawn") {
        const idx = this.doc.entities.findIndex((e) => e.id === op.entity.id);
        if (idx >= 0) this.doc.entities[idx] = deepClone(op.entity);
        else this.doc.entities.push(deepClone(op.entity));
      } else if (op.op === "remove") {
        this.doc.entities = this.doc.entities.filter((e) => e.id !== op.entityId);
      } else if (op.op === "updateEntity") {
        const ent = this.doc.entities.find((e) => e.id === op.entityId);
        if (ent) Object.assign(ent, deepClone(op.patch));
      }
    }
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    return true;
  }

  /** Advance deterministic fixed-step simulation clock. */
  stepClock(dt: number): void {
    this.doc.tick += 1;
    this.doc.time += dt;
    this.doc.terrain.waveTime += dt;
  }

  /** Deterministic JSON snapshot of complete SceneIR state for scrubbing/replay. */
  snapshot(): string {
    return JSON.stringify(this.doc);
  }

  restore(snap: string): void {
    this.doc = JSON.parse(snap) as SceneDocument;
  }

  /** Compute full entity world matrix (resolving parent & socket hierarchy). */
  getEntityWorldMatrix(entityId: string, depth = 0): Float32Array {
    const ent = this.getEntity(entityId);
    if (!ent || depth > 8) return mat4FromTRS([0, 0, 0], quatIdentity(), [1, 1, 1]);
    const localM = mat4FromTRS(ent.pos, ent.rot, [ent.scale, ent.scale, ent.scale]);
    if (!ent.parentId) return localM;

    const parent = this.getEntity(ent.parentId);
    if (!parent) return localM;
    const parentM = this.getEntityWorldMatrix(ent.parentId, depth + 1);

    if (ent.parentSocket) {
      const pAsset = this.assets.get(parent.assetId);
      const sock = pAsset?.sockets[ent.parentSocket];
      if (pAsset && sock) {
        const a2l = mat4AssetToLocal(pAsset.pivot, pAsset.voxelScale);
        const sockLocal = mat4TransformPoint(a2l, sock.pos);
        const sockM = mat4FromTRS(sockLocal, quatIdentity(), [1, 1, 1]);
        return mat4Mul(mat4Mul(parentM, sockM), localM);
      }
    }
    return mat4Mul(parentM, localM);
  }

  /** Matrix mapping asset voxel coords [0..W, 0..L, 0..H] directly to World coords. */
  getVoxelToWorldMatrix(entity: EntityState): Float32Array | null {
    const asset = this.assets.get(entity.assetId);
    if (!asset) return null;
    const entM = this.getEntityWorldMatrix(entity.id);
    const a2l = mat4AssetToLocal(asset.pivot, asset.voxelScale);
    return mat4Mul(entM, a2l);
  }

  /** Query exact world position of a named semantic socket on an entity (e.g. "wingtipL", "cockpitCam"). */
  getSocketWorldPos(entityId: string, socketName: string): Vec3 | null {
    const ent = this.getEntity(entityId);
    if (!ent) return null;
    const asset = this.assets.get(ent.assetId);
    const sock = asset?.sockets[socketName];
    if (!asset || !sock) return null;
    const v2w = this.getVoxelToWorldMatrix(ent);
    if (!v2w) return null;
    return mat4TransformPoint(v2w, sock.pos);
  }

  /** Query terrain height matching the GPU archipelago shader 1:1. */
  sampleTerrainHeight(x: number, z: number): number {
    return sampleTerrainHeight(x, z, this.doc.terrain);
  }

  /**
   * Exact 3D voxel-DDA spatial raycast against all visible entities in the scene.
   * Matches the rendered pixels 1:1 with zero out-of-sync collider meshes!
   */
  raycastEntities(roWorld: Vec3, rdWorldRaw: Vec3, maxDist = 500): SpatialHit | null {
    const rdWorld = vec3Norm(rdWorldRaw);
    let best: SpatialHit | null = null;
    const eps = 1e-6;

    for (const ent of this.doc.entities) {
      if (ent.visible === false) continue;
      const asset = this.assets.get(ent.assetId);
      if (!asset) continue;
      const v2w = this.getVoxelToWorldMatrix(ent);
      if (!v2w) continue;
      const w2v = mat4Invert(v2w);

      const ro = mat4TransformPoint(w2v, roWorld);
      const rd = mat4TransformDir(w2v, rdWorld);
      const invX = Math.abs(rd[0]) > eps ? 1 / rd[0] : 1e20;
      const invY = Math.abs(rd[1]) > eps ? 1 / rd[1] : 1e20;
      const invZ = Math.abs(rd[2]) > eps ? 1 / rd[2] : 1e20;

      const tx0 = (0 - ro[0]) * invX, tx1 = (asset.w - ro[0]) * invX;
      const ty0 = (0 - ro[1]) * invY, ty1 = (asset.l - ro[1]) * invY;
      const tz0 = (0 - ro[2]) * invZ, tz1 = (asset.h - ro[2]) * invZ;

      const tminX = Math.min(tx0, tx1), tmaxX = Math.max(tx0, tx1);
      const tminY = Math.min(ty0, ty1), tmaxY = Math.max(ty0, ty1);
      const tminZ = Math.min(tz0, tz1), tmaxZ = Math.max(tz0, tz1);

      const tEnter = Math.max(tminX, tminY, tminZ, 0);
      const tExit = Math.min(tmaxX, tmaxY, tmaxZ, best ? best.distance : maxDist);
      if (tExit <= tEnter + 1e-4) continue;

      const te = tEnter + 1e-4;
      let px = ro[0] + rd[0] * te;
      let py = ro[1] + rd[1] * te;
      let pz = ro[2] + rd[2] * te;

      let ix = clamp(Math.floor(px), 0, asset.w - 1);
      let iy = clamp(Math.floor(py), 0, asset.l - 1);
      let iz = clamp(Math.floor(pz), 0, asset.h - 1);

      const stepX = rd[0] > eps ? 1 : rd[0] < -eps ? -1 : 0;
      const stepY = rd[1] > eps ? 1 : rd[1] < -eps ? -1 : 0;
      const stepZ = rd[2] > eps ? 1 : rd[2] < -eps ? -1 : 0;

      const tdx = stepX !== 0 ? Math.abs(invX) : 1e20;
      const tdy = stepY !== 0 ? Math.abs(invY) : 1e20;
      const tdz = stepZ !== 0 ? Math.abs(invZ) : 1e20;

      let tmx = stepX !== 0 ? (ix + (stepX > 0 ? 1 : 0) - px) * invX : 1e20;
      let tmy = stepY !== 0 ? (iy + (stepY > 0 ? 1 : 0) - py) * invY : 1e20;
      let tmz = stepZ !== 0 ? (iz + (stepZ > 0 ? 1 : 0) - pz) * invZ : 1e20;

      let nLocal: Vec3 = [0, 0, 1];
      if (tminX >= tminY && tminX >= tminZ) nLocal = [-stepX || 1, 0, 0];
      else if (tminY >= tminX && tminY >= tminZ) nLocal = [0, -stepY || 1, 0];
      else nLocal = [0, 0, -stepZ || 1];

      let tCur = 0;
      const area = asset.w * asset.l;
      const maxSteps = asset.w + asset.l + asset.h + 2;

      for (let s = 0; s < maxSteps; s++) {
        const idx = iz * area + iy * asset.w + ix;
        if (asset.rgba[idx * 4 + 3] >= 128) {
          const hitDist = te + tCur;
          if (!best || hitDist < best.distance) {
            const hitWorld: Vec3 = [
              roWorld[0] + rdWorld[0] * hitDist,
              roWorld[1] + rdWorld[1] * hitDist,
              roWorld[2] + rdWorld[2] * hitDist,
            ];
            best = {
              entityId: ent.id,
              distance: hitDist,
              point: hitWorld,
              normal: vec3Norm(mat4TransformDir(v2w, nLocal)),
              voxel: [ix, iy, iz],
            };
          }
          break;
        }
        if (tmx <= tmy && tmx <= tmz) {
          tCur = tmx; ix += stepX; tmx += tdx; nLocal = [-stepX, 0, 0];
        } else if (tmy <= tmz) {
          tCur = tmy; iy += stepY; tmy += tdy; nLocal = [0, -stepY, 0];
        } else {
          tCur = tmz; iz += stepZ; tmz += tdz; nLocal = [0, 0, -stepZ];
        }
        if (ix < 0 || ix >= asset.w || iy < 0 || iy >= asset.l || iz < 0 || iz >= asset.h) break;
        if (te + tCur > tExit) break;
      }
    }

    return best;
  }
}
