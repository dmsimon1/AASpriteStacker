/**
 * GeoGraph: Blender Geometry Nodes-inspired Continuous SDF Volume Compiler,
 * Context-Aware Surface Scattering, and Simulation Zone Runner.
 *
 * Compiles pure continuous mathematical SDF + Material + Emissive fields directly into
 * lightweight @aastack/core VolumeAssets (preserving exact Float32/R16F SDF slices,
 * RG8 material/emissive slices, and full 2D horizontal sprite-stack export parity!).
 */

import {
  MATERIAL_ID,
  createVolumeAsset,
  type MaterialKind,
  type RGB,
  type SocketDef,
  type Vec3,
  type VolumeAsset,
} from "@aastack/core";
import { hash31, mix } from "./fields.js";
import { opSmoothMin, opSmoothSubtract } from "./sdf.js";

export interface GeoEvalResult {
  /** Exact signed distance in voxel units (negative inside, 0 on surface, positive outside). */
  d: number;
  r: number;
  g: number;
  b: number;
  emis: number;
  mat: number;
}

/** Mutable accumulator passed to procedural GeoGraph evaluators (zero per-voxel heap allocations!). */
export class GeoFieldState {
  public d = 1e6;
  public r = 200;
  public g = 200;
  public b = 200;
  public emis = 0;
  public mat: number = MATERIAL_ID.matte;

  reset(): void {
    this.d = 1e6;
    this.r = 200;
    this.g = 200;
    this.b = 200;
    this.emis = 0;
    this.mat = MATERIAL_ID.matte;
  }

  /** Sharp architectural union (preserves crisp creases between masonry, trim, roofs, and metal). */
  union(d: number, col: RGB, mat: MaterialKind | number = MATERIAL_ID.matte, emis = 0): void {
    if (d < this.d) {
      this.d = d;
      this.r = col[0];
      this.g = col[1];
      this.b = col[2];
      this.emis = emis;
      this.mat = typeof mat === "number" ? mat : MATERIAL_ID[mat];
    }
  }

  /** Organic smooth union (blends rock, roots, snowdrifts, coral, and smooth colors seamlessly!). */
  smoothUnion(d: number, k: number, col: RGB, mat: MaterialKind | number = MATERIAL_ID.matte, emis = 0): void {
    const res = opSmoothMin(this.d, d, k);
    this.d = res.d;
    const t = res.h;
    this.r = mix(this.r, col[0], t);
    this.g = mix(this.g, col[1], t);
    this.b = mix(this.b, col[2], t);
    this.emis = mix(this.emis, emis, t);
    if (t > 0.5) {
      this.mat = typeof mat === "number" ? mat : MATERIAL_ID[mat];
    }
  }

  /** Carve out arches, caves, recessed windows, or interiors (k=0 sharp crease, k>0 filleted). */
  subtract(dCut: number, k = 0, innerCol?: RGB, innerMat?: MaterialKind | number, innerEmis?: number): void {
    const prevD = this.d;
    const nextD = opSmoothSubtract(prevD, dCut, k);
    if (innerCol && nextD > prevD + 1e-4) {
      const blend = k > 1e-4 ? Math.min(1, (nextD - prevD) / Math.max(0.2, k)) : 1.0;
      this.r = mix(this.r, innerCol[0], blend);
      this.g = mix(this.g, innerCol[1], blend);
      this.b = mix(this.b, innerCol[2], blend);
      if (innerEmis !== undefined) this.emis = mix(this.emis, innerEmis, blend);
      if (innerMat !== undefined && blend > 0.45) {
        this.mat = typeof innerMat === "number" ? innerMat : MATERIAL_ID[innerMat];
      }
    }
    this.d = nextD;
  }

  /** Paint weathering, moss, lichen, veins, or glowing trim onto existing geometry without altering shape. */
  paint(mask: number, col: RGB, mat?: MaterialKind | number, emis?: number): void {
    if (mask <= 0.001) return;
    const t = Math.max(0, Math.min(1, mask));
    this.r = mix(this.r, col[0], t);
    this.g = mix(this.g, col[1], t);
    this.b = mix(this.b, col[2], t);
    if (emis !== undefined) this.emis = mix(this.emis, emis, t);
    if (mat !== undefined && t > 0.45) {
      this.mat = typeof mat === "number" ? mat : MATERIAL_ID[mat];
    }
  }
}

export interface CompileGeoVolumeOptions {
  id: string;
  name?: string;
  w: number;
  l: number;
  h: number;
  voxelScale: number;
  pivot?: Vec3;
  sockets?: Record<string, SocketDef>;
  /** Continuous field evaluator called at voxel centers (x + 0.5, y + 0.5, z + 0.5). */
  evaluate: (x: number, y: number, z: number, out: GeoFieldState) => void;
}

/**
 * Evaluates a continuous procedural GeoGraph directly into a lightweight @aastack/core VolumeAsset.
 * Preserves exact unquantized float32 SDF (uploaded as R16F), RG8 emissive+material slices,
 * AND narrow-band edge-colored RGBA so both continuous SDF raymarching AND 2D slice export are spotless!
 */
export function compileGeoVolume(opts: CompileGeoVolumeOptions): VolumeAsset {
  const { w, l, h, evaluate } = opts;
  const area = w * l;
  const total = h * area;
  const rgba = new Uint8Array(total * 4);
  const sdfF32 = new Float32Array(total);
  const emisU8 = new Uint8Array(total);
  const matU8 = new Uint8Array(total);
  const st = new GeoFieldState();

  for (let z = 0; z < h; z++) {
    const pz = z + 0.5;
    const zBase = z * area;
    for (let y = 0; y < l; y++) {
      const py = y + 0.5;
      const rowBase = zBase + y * w;
      for (let x = 0; x < w; x++) {
        const px = x + 0.5;
        st.reset();
        evaluate(px, py, pz, st);
        const idx = rowBase + x;
        const p = idx * 4;
        sdfF32[idx] = st.d;

        // Populate exact color/material inside the surface AND across a 2-voxel narrow exterior band
        // so GPU trilinear filtering right at d = 0 never leaks black air or wrong material IDs!
        if (st.d <= 2.2) {
          rgba[p] = Math.max(0, Math.min(255, Math.round(st.r)));
          rgba[p + 1] = Math.max(0, Math.min(255, Math.round(st.g)));
          rgba[p + 2] = Math.max(0, Math.min(255, Math.round(st.b)));
          rgba[p + 3] = st.d <= 0.0 ? 255 : 0;
          emisU8[idx] = Math.max(0, Math.min(255, Math.round(st.emis)));
          matU8[idx] = Math.max(0, Math.min(255, Math.round(st.mat)));
        }
      }
    }
  }

  return createVolumeAsset({
    id: opts.id,
    name: opts.name ?? opts.id,
    w,
    l,
    h,
    voxelScale: opts.voxelScale,
    pivot: opts.pivot ?? [w * 0.5, l * 0.5, 0],
    rgba,
    explicitSdf: sdfF32,
    explicitEmissive: emisU8,
    explicitMaterial: matU8,
    sdfRange: 8.0,
    sockets: opts.sockets,
    provenance: { kind: "geofield", source: "aastack-geofield" },
  });
}

export interface ScatterPoint {
  pos: Vec3;
  normal: Vec3;
  scale: number;
  yaw: number;
  seed: number;
}

export interface ScatterOnSdfOptions {
  /** Signed distance field in world/local coordinates (negative inside, 0 on surface). */
  sdf: (x: number, y: number, z: number) => number;
  boundsMin: Vec3;
  boundsMax: Vec3;
  count: number;
  minSpacing: number;
  /** Minimum upward normal Z (or Y depending on coordinate space). */
  minNormalZ?: number;
  maxNormalZ?: number;
  seed?: number;
}

/**
 * Blender Geometry Nodes-style Context-Aware Surface Scattering ("Distribute Points on Faces"):
 * Drops candidate rays onto a continuous SDF, projects onto d=0, filters by surface slope,
 * and enforces Poisson-like minimum spacing.
 */
export function scatterOnSdf(opts: ScatterOnSdfOptions): ScatterPoint[] {
  const { sdf, boundsMin, boundsMax, count, minSpacing } = opts;
  const minNz = opts.minNormalZ ?? -1;
  const maxNz = opts.maxNormalZ ?? 1;
  const seed = opts.seed ?? 17;
  const out: ScatterPoint[] = [];
  const minSp2 = minSpacing * minSpacing;
  const maxTries = count * 24;

  for (let i = 0; i < maxTries && out.length < count; i++) {
    const ux = hash31(i * 1.13 + seed, 3.7, 9.1);
    const uy = hash31(i * 2.41 + seed, 7.3, 1.9);
    const px = mix(boundsMin[0], boundsMax[0], ux);
    const py = mix(boundsMin[1], boundsMax[1], uy);

    // Ray-drop downward from boundsMax.z to boundsMin.z to find exact SDF surface crossing
    let pz = boundsMax[2];
    let hit = false;
    for (let step = 0; step < 32; step++) {
      const d = sdf(px, py, pz);
      if (d <= 0.08) {
        hit = true;
        break;
      }
      pz -= Math.max(0.15, d * 0.8);
      if (pz < boundsMin[2]) break;
    }
    if (!hit || pz <= boundsMin[2] + 0.05) continue;

    // Continuous tetrahedral normal
    const e = 0.15;
    const nx = sdf(px + e, py, pz) - sdf(px - e, py, pz);
    const ny = sdf(px, py + e, pz) - sdf(px, py - e, pz);
    const nz = sdf(px, py, pz + e) - sdf(px, py, pz - e);
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const nnx = nx / nLen, nny = ny / nLen, nnz = nz / nLen;
    if (nnz < minNz || nnz > maxNz) continue;

    let tooClose = false;
    for (const prev of out) {
      const dx = prev.pos[0] - px, dy = prev.pos[1] - py, dz = prev.pos[2] - pz;
      if (dx * dx + dy * dy + dz * dz < minSp2) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    out.push({
      pos: [px, py, pz],
      normal: [nnx, nny, nnz],
      scale: 0.78 + hash31(i + seed, 19.3, 5.1) * 0.44,
      yaw: hash31(i + seed, 13.1, 23.7) * Math.PI * 2,
      seed: hash31(i + seed, 29.7, 31.3),
    });
  }
  return out;
}

/**
 * Blender Geometry Nodes-inspired Simulation Zone:
 * Encapsulates frame-to-frame feedback state (`Frame n -> Frame n+1`) cleanly
 * for procedural drifting spores, rising bubbles, swaying kelp, ripples, and orbiting actors.
 */
export class SimulationZone<TState> {
  public state: TState;
  public time = 0;
  private readonly initFn: () => TState;
  private readonly stepFn: (state: TState, dt: number, time: number) => void;

  constructor(init: () => TState, step: (state: TState, dt: number, time: number) => void) {
    this.initFn = init;
    this.stepFn = step;
    this.state = init();
  }

  reset(): void {
    this.time = 0;
    this.state = this.initFn();
  }

  step(dt: number): TState {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    this.time += safeDt;
    this.stepFn(this.state, safeDt, this.time);
    return this.state;
  }
}
