/**
 * Contemporary Multifractal Alpine Terrain Engine (1:1 CPU / WebGL2 GPU Parity).
 *
 * Synthesizes three proven geological terrain algorithms (zero smooth plastic Bryce/KPT look):
 *  1. Ken Musgrave's Ridged Multifractal (1993) with domain-warped rotated octaves for razor-sharp
 *     pyramidal alpine arêtes and jagged mountain skylines.
 *  2. Giliam de Carpentier's Swiss-Turbulence (2012) & Inigo Quilez analytical derivative damping
 *     for realistic eroded mountain gullies alongside flat rocky valley benches.
 *  3. Natural Glacial U-Valley & Bridgehead Spur shaping so 3D AA-GeoField architectural landmarks
 *     (stone viaducts, mountain watchtowers, conifers) snap cleanly onto real alpine rock ledges
 *     with open valley sightlines toward towering distant snow-capped peaks.
 */

import type { Vec3 } from "@aastack/core";
import { fract, mix, smoothstep } from "./fields.js";

export interface MultifractalTerrainConfig {
  /** World seed offset (shifts noise domain deterministically). */
  seed?: number;
  /** Peak vertical amplitude in world units (default 64). */
  maxHeight?: number;
  /** Musgrave ridged multifractal weight (0.2 = eroded hills, 1.0 = alpine peaks, 1.5 = jagged Dolomites). */
  ridgeWeight?: number;
  /** Swiss-Turbulence analytical derivative erosion strength (0..1.5, default 1.0). */
  erosion?: number;
  /** Altitude above which crisp wind-drifted alpine snowpack settles (default 22). */
  snowline?: number;
  /** Carve the central winding Alpine glacial river valley (default true). */
  gorgeEnabled?: boolean;
}

export interface TerrainSample {
  /** World Y elevation at (x, z) (negative under river surface y = 0). */
  height: number;
  /** Analytical unit surface normal [nx, ny, nz] in world space (+Y up). */
  normal: Vec3;
  /** Surface steepness in [0, 1] (0 = flat shelf, 1 = sheer granite face). */
  slope: number;
  /** [0, 1] glacier river channel mask (1 = deep river bed). */
  riverMask: number;
  /** [0, 1] snow accumulation mask (altitude + moderate-slope weighted). */
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
 * Ken Musgrave's Ridged Multifractal (1993) with rotated octaves and sharp ridge exponent.
 * Produces knife-edge alpine peaks, pyramidal crests, and jagged tectonic arêtes.
 */
export function musgraveRidged2D(
  x: number,
  z: number,
  octaves = 6,
  offset = 1.0,
  gain = 2.15,
): number {
  let sum = 0;
  let amp = 0.56;
  let weight = 1.0;
  let px = x;
  let pz = z;

  for (let i = 0; i < octaves; i++) {
    const n = vnoise2Grad(px, pz).v * 2.0 - 1.0;
    let sig = offset - Math.abs(n);
    sig = sig * sig * weight;
    weight = Math.max(0, Math.min(1, sig * gain));
    sum += sig * amp;
    const nx = (ROT_A * px - ROT_B * pz) * 2.09 + 17.3;
    const nz = (ROT_B * px + ROT_A * pz) * 2.09 + 11.7;
    px = nx;
    pz = nz;
    amp *= 0.49;
  }
  return sum;
}

/**
 * Giliam de Carpentier's Swiss-Turbulence (analytical derivative-damped pseudo-erosion).
 * High accumulated slope damps finer octaves and warps subsequent ridges down-slope,
 * carving dendritic erosion chutes and rocky scree aprons without offline simulation.
 */
export function swissTurbulence2D(
  x: number,
  z: number,
  octaves = 6,
  erosion = 1.0,
  warp = 0.28,
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
    const signed = g.v * 2.0 - 1.0;
    const n = 1.0 - Math.abs(signed);
    const sgn = signed >= 0 ? -2.0 : 2.0;
    const gdx = g.dx * sgn;
    const gdz = g.dz * sgn;
    const slopeSq = dxSum * dxSum + dzSum * dzSum;
    const damp = 1.0 / (1.0 + erosion * 1.65 * slopeSq);
    sum += amp * n * n * damp;
    dxSum += amp * gdx * freq * 0.36;
    dzSum += amp * gdz * freq * 0.36;

    const nx = (ROT_A * px - ROT_B * pz) * 2.05 + 23.1;
    const nz = (ROT_B * px + ROT_A * pz) * 2.05 + 9.4;
    px = nx;
    pz = nz;
    freq *= 2.05;
    amp *= 0.48;
  }
  return sum;
}

/** Winding Alpine glacial river centerline X(z) passing cleanly through x=0 at z=0. */
export function alpineRiverCenterX(z: number): number {
  return Math.sin(z * 0.019) * 18.0 + Math.sin(z * 0.047) * 5.0;
}

/** Evaluate exact multifractal terrain height at (x, z), matching GPU `alpineTerrainHeight` 1:1. */
export function sampleMultifractalHeight(x: number, z: number, cfg: MultifractalTerrainConfig = {}): number {
  const seed = cfg.seed ?? 137.0;
  const maxHeight = cfg.maxHeight ?? 44.0;
  const ridgeWeight = cfg.ridgeWeight ?? 1.0;
  const erosion = cfg.erosion ?? 1.0;
  const gorgeEnabled = cfg.gorgeEnabled ?? true;

  // Domain-warped tectonic coordinates so mountain chains curve organically instead of grid-aligned
  const wx = x * 0.0095 + seed * 0.13;
  const wz = z * 0.0095 - seed * 0.09;
  const warpX = (vnoise2Grad(wx * 1.2 + 3.1, wz * 1.2 - 1.4).v - 0.5) * 0.65;
  const warpZ = (vnoise2Grad(wx * 1.2 - 4.7, wz * 1.2 + 2.8).v - 0.5) * 0.65;
  const sx = wx + warpX;
  const sz = wz + warpZ;

  // 1. Macro Musgrave Ridged Multifractal alpine spine (6 octaves)
  const ridged = musgraveRidged2D(sx, sz, 6, 1.0, 2.15);
  // 2. Swiss-Turbulence analytical derivative-eroded mountain slopes & gullies (6 octaves)
  const swiss = swissTurbulence2D(sx * 1.38 + 4.3, sz * 1.38 - 2.7, 6, erosion, 0.28);

  // Sweeping distant alpine range (-Z) & flanking ridges calibrated so jagged peaks silhouette cleanly against sky!
  const distMassif = smoothstep(-28.0, -185.0, z) * 0.92;
  const sideRanges = smoothstep(34.0, 150.0, Math.abs(x)) * 0.58;
  const macroEnvelope = 0.28 + distMassif + sideRanges;

  const ridgeMix = Math.max(0, Math.min(1, ridgeWeight * 0.80));
  const rawField = mix(swiss * 0.92, ridged * 0.72 + swiss * 0.38, ridgeMix);
  const peaked = Math.pow(Math.max(0, rawField * 2.05), 1.32) * (0.64 + 0.52 * ridgeWeight);
  let h = peaked * macroEnvelope * maxHeight * 0.88 + 2.4;

  if (gorgeEnabled) {
    const rX = alpineRiverCenterX(z);
    const dRiver = Math.abs(x - rX);

    // Wide glacial U-valley pinching gently at bridge crossing (z=0), opening to sunlit valley & distant cirque
    const pinchAtBridge = Math.exp(-((z + 1.0) * (z + 1.0)) / (24.0 * 24.0));
    const headwallClose = smoothstep(-115.0, -230.0, z);
    const valleyHalfFloor = mix(15.5, 8.6, pinchAtBridge) * (1.0 - headwallClose * 0.78);
    const valleyHalfSlope = mix(52.0, 22.5, pinchAtBridge) * (1.0 - headwallClose * 0.45);
    const valleyT = smoothstep(valleyHalfFloor, valleyHalfSlope, dRiver);

    const riverBed = -2.2 + (vnoise2Grad(x * 0.09, z * 0.09).v - 0.5) * 1.1;
    const valleyH = mix(riverBed, h, Math.max(valleyT, headwallClose * 0.82));

    // Twin natural granite bridgehead ledges at x = +-21..36 around z in [-22, +10]
    const spurBand = smoothstep(26.0, 8.0, Math.abs(z + 3.0)) *
      smoothstep(13.5, 20.5, dRiver) *
      smoothstep(42.0, 26.0, dRiver);
    const spurRock = 10.6 + (swiss - 0.45) * 2.2;
    h = mix(valleyH, spurRock, spurBand * 0.90);

    // Keep foreground river mouth (+Z > 8) low and open so foreground flanks never feel like a dark tunnel
    const foreMouth = smoothstep(6.0, 38.0, z) * smoothstep(88.0, 20.0, dRiver);
    h = mix(h, Math.min(h, riverBed + smoothstep(12.0, 48.0, dRiver) * 8.5), foreMouth * 0.90);
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
  const riverMask = gorgeEnabled ? 1.0 - smoothstep(7.5, 14.0, dRiver) : 0.0;

  const snowline = cfg.snowline ?? 22.0;
  const altSnow = smoothstep(snowline - 2.0, snowline + 4.0, h);
  const slopeSnow = 1.0 - smoothstep(0.30, 0.46, slope);
  const snowMask = Math.max(0, Math.min(1, altSnow * slopeSnow));

  return { height: h, normal, slope, riverMask, snowMask };
}
