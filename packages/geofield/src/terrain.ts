/**
 * Contemporary Multifractal Terrain Engine (CPU / GPU 1:1 Parity).
 *
 * Implements:
 *  1. Ken Musgrave's Ridged Multifractal (1993) for sharp knife-edge alpine peaks & arêtes
 *  2. Giliam de Carpentier's Swiss-Turbulence / Inigo Quilez analytical derivative erosion
 *     for flat alluvial valley benches + carved mountain drainage gullies
 *  3. Parametric Alpine Glacier Gorge carving so 3D AA-GeoField architectural landmarks
 *     (stone viaducts, mountain watchtowers, conifers) snap cleanly onto exact terrain height & slope!
 */

import type { Vec3 } from "@aastack/core";
import { fract, mix, smoothstep } from "./fields.js";

export interface MultifractalTerrainConfig {
  /** World seed offset (shifts noise domain deterministically). */
  seed?: number;
  /** Peak vertical amplitude in world units (default 48). */
  maxHeight?: number;
  /** Musgrave ridged multifractal weight (0 = gentle rolling hills, 1 = alpine peaks, 1.5 = craggy spires). */
  ridgeWeight?: number;
  /** Swiss-Turbulence analytical derivative erosion strength (0..1.5, default 1.0). */
  erosion?: number;
  /** Altitude above which snow settles on moderate slopes (default 21). */
  snowline?: number;
  /** Carve the central winding Alpine glacier river gorge (default true). */
  gorgeEnabled?: boolean;
}

export interface TerrainSample {
  /** World Y elevation at (x, z) (negative under water level y = 0). */
  height: number;
  /** Analytical unit surface normal [nx, ny, nz] in world space (+Y up). */
  normal: Vec3;
  /** Surface steepness in [0, 1] (0 = flat plateau, 1 = vertical cliff). */
  slope: number;
  /** [0, 1] glacier river channel mask (1 = deep river bed). */
  riverMask: number;
  /** [0, 1] snow accumulation mask (altitude + gentle-slope weighted). */
  snowMask: number;
}

const ROT_A = 0.8;
const ROT_B = 0.6;

/** Sin-free 2D Dave Hoskins hash matching GLSL `hash21(vec2)` bit-for-bit. */
export function hash21(px: number, pz: number): number {
  let x = fract(px * 0.1031);
  let y = fract(pz * 0.1031);
  let z = x;
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d;
  y += d;
  z += d;
  return fract((x + y) * z);
}

/** C2-continuous quintic 2D value noise returning exact value in [0, 1] AND analytical gradient (dx, dz). */
export function vnoise2Grad(x: number, z: number): { v: number; dx: number; dz: number } {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);

  const a = hash21(ix, iz);
  const b = hash21(ix + 1, iz);
  const c = hash21(ix, iz + 1);
  const d = hash21(ix + 1, iz + 1);

  const k0 = a;
  const k1 = b - a;
  const k2 = c - a;
  const k3 = a - b - c + d;

  const v = k0 + k1 * ux + k2 * uz + k3 * ux * uz;
  const dx = dux * (k1 + k3 * uz);
  const dz = duz * (k2 + k3 * ux);
  return { v, dx, dz };
}

/**
 * Ken Musgrave's Ridged Multifractal (1993) with rotated octaves to eliminate axial artifacts.
 * Returns sharp mountain ridges in ~[0, 1.35].
 */
export function musgraveRidged2D(
  x: number,
  z: number,
  octaves = 5,
  offset = 1.0,
  gain = 2.05,
): number {
  let sum = 0;
  let amp = 0.54;
  let weight = 1.0;
  let px = x;
  let pz = z;

  for (let i = 0; i < octaves; i++) {
    const n = vnoise2Grad(px, pz).v * 2.0 - 1.0;
    let sig = offset - Math.abs(n);
    sig = sig * sig * weight;
    weight = Math.max(0, Math.min(1, sig * gain));
    sum += sig * amp;
    // Domain rotation + lacunarity 2.07
    const nx = (ROT_A * px - ROT_B * pz) * 2.07 + 17.3;
    const nz = (ROT_B * px + ROT_A * pz) * 2.07 + 11.7;
    px = nx;
    pz = nz;
    amp *= 0.5;
  }
  return sum;
}

/**
 * Giliam de Carpentier's Swiss-Turbulence (analytical derivative-damped pseudo-erosion).
 * High accumulated slope damps finer octaves and warps ridges down-slope, creating
 * realistic flat valley benches alongside deeply incised alpine drainage gullies!
 */
export function swissTurbulence2D(
  x: number,
  z: number,
  octaves = 5,
  erosion = 1.0,
  warp = 0.22,
): number {
  let sum = 0;
  let amp = 0.52;
  let freq = 1.0;
  let dxSum = 0;
  let dzSum = 0;
  let px = x;
  let pz = z;

  for (let i = 0; i < octaves; i++) {
    const g = vnoise2Grad(px + warp * dxSum, pz + warp * dzSum);
    const n = 1.0 - Math.abs(g.v * 2.0 - 1.0);
    const signFlip = g.v * 2.0 - 1.0 >= 0 ? -2.0 : 2.0;
    const gdx = g.dx * signFlip;
    const gdz = g.dz * signFlip;
    const slopeSq = dxSum * dxSum + dzSum * dzSum;
    const damp = 1.0 / (1.0 + erosion * 1.45 * slopeSq);
    sum += amp * n * n * damp;
    dxSum += amp * gdx * freq * 0.35;
    dzSum += amp * gdz * freq * 0.35;

    const nx = (ROT_A * px - ROT_B * pz) * 2.03 + 23.1;
    const nz = (ROT_B * px + ROT_A * pz) * 2.03 + 9.4;
    px = nx;
    pz = nz;
    freq *= 2.03;
    amp *= 0.48;
  }
  return sum;
}

/** Centerline X(z) of the winding Alpine glacier river gorge (passes cleanly through x=0 at z=0). */
export function alpineRiverCenterX(z: number): number {
  return Math.sin(z * 0.024) * 15.0 + Math.sin(z * 0.056) * 4.0;
}

/** Evaluate exact multifractal terrain height at (x, z), matching GPU `alpineTerrainHeight` 1:1. */
export function sampleMultifractalHeight(x: number, z: number, cfg: MultifractalTerrainConfig = {}): number {
  const seed = cfg.seed ?? 137.0;
  const maxHeight = cfg.maxHeight ?? 54.0;
  const ridgeWeight = cfg.ridgeWeight ?? 1.0;
  const erosion = cfg.erosion ?? 1.0;
  const gorgeEnabled = cfg.gorgeEnabled ?? true;

  const sx = x * 0.014 + seed * 0.13;
  const sz = z * 0.014 - seed * 0.09;

  // 1. Macro Musgrave Ridged Multifractal mountain spine
  const ridged = musgraveRidged2D(sx, sz, 5, 1.0, 2.05);
  // 2. Swiss-Turbulence analytical derivative-eroded gullies & valley benches
  const swiss = swissTurbulence2D(sx * 1.45 + 4.3, sz * 1.45 - 2.7, 5, erosion, 0.24);
  // 3. Dramatic background mountain massif (-Z) & towering outer valley walls
  const backMassif = smoothstep(-10.0, -135.0, z) * 0.96;
  const flankMassif = smoothstep(38.0, 128.0, Math.abs(x)) * 0.52;
  const uplift = backMassif + flankMassif;

  const baseField = mix(swiss * 0.92, ridged * 0.66 + swiss * 0.46, Math.max(0, Math.min(1, ridgeWeight * 0.78)));
  let h = (baseField * (0.62 + 0.50 * ridgeWeight) + uplift * (0.48 + 0.42 * ridged)) * maxHeight * 0.72 + 4.2;

  if (gorgeEnabled) {
    const rX = alpineRiverCenterX(z);
    const dRiver = Math.abs(x - rX);

    // Glacial U-valley opens gracefully toward the viewer (+Z > 6) so the viaduct, tower & alpine skyline shine!
    const foreOpen = smoothstep(5.0, 48.0, z);
    const chInner = 8.4 + foreOpen * 12.0;
    const chOuter = 20.5 + foreOpen * 24.0;
    const channelT = smoothstep(chInner, chOuter, dRiver);

    // Crisp chiseled canyon walls without spiky local fangs next to bridge abutments
    const wallMask = smoothstep(0.10, 0.45, channelT) * (1.0 - smoothstep(0.65, 0.96, channelT));
    const crag = (vnoise2Grad(x * 0.10 + 3.1, z * 0.10 - 1.7).v - 0.5) * 2.1 +
      (vnoise2Grad(x * 0.22 - 5.2, z * 0.22 + 4.3).v - 0.5) * 1.1;

    // Solid natural rock abutment ledges at x = +-21..36 around z in [-26, +12] for viaduct + watchtower
    const heroZone = smoothstep(40.0, 12.0, Math.abs(z + 4.0));
    const benchProfile = smoothstep(14.5, 20.5, dRiver) * smoothstep(42.0, 26.0, dRiver) * heroZone * (1.0 - foreOpen * 0.90);

    const canyonH = mix(-2.6, Math.max(h, 10.2), channelT) + crag * wallMask;
    const benchH = 10.6 + (swiss - 0.42) * 2.4;
    h = mix(canyonH, benchH, benchProfile * 0.88);

    // Roll foreground canyon shoulders gently down into pine hills so the entire viaduct & sky peaks stay unobstructed!
    const foreClear = smoothstep(4.0, 38.0, z) * smoothstep(95.0, 24.0, dRiver);
    h = mix(h, Math.min(h, 4.8 + (swiss - 0.35) * 3.2), foreClear * 0.88);
  }

  return h;
}

/** Full analytical multifractal sample (height, world normal, slope, river & snow masks). */
export function sampleMultifractalTerrain(
  x: number,
  z: number,
  cfg: MultifractalTerrainConfig = {},
): TerrainSample {
  const h = sampleMultifractalHeight(x, z, cfg);
  const eps = 0.45;
  const hx = sampleMultifractalHeight(x + eps, z, cfg) - sampleMultifractalHeight(x - eps, z, cfg);
  const hz = sampleMultifractalHeight(x, z + eps, cfg) - sampleMultifractalHeight(x, z - eps, cfg);
  const nx = -hx / (2 * eps);
  const ny = 1.0;
  const nz = -hz / (2 * eps);
  const invLen = 1 / (Math.hypot(nx, ny, nz) || 1);
  const normal: Vec3 = [nx * invLen, ny * invLen, nz * invLen];
  const slope = Math.max(0, Math.min(1, 1.0 - normal[1]));

  const gorgeEnabled = cfg.gorgeEnabled ?? true;
  const dRiver = gorgeEnabled ? Math.abs(x - alpineRiverCenterX(z)) : 999;
  const riverMask = gorgeEnabled ? 1.0 - smoothstep(7.5, 13.5, dRiver) : 0.0;

  const snowline = cfg.snowline ?? 24.5;
  const altSnow = smoothstep(snowline - 3.5, snowline + 7.5, h);
  const slopeSnow = 1.0 - smoothstep(0.32, 0.56, slope);
  const snowMask = Math.max(0, Math.min(1, altSnow * slopeSnow));

  return { height: h, normal, slope, riverMask, snowMask };
}
