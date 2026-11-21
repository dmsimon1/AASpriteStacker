/**
 * Volumetric preprocessing for anti-aliased sprite stacking:
 *  - Exact O(N) 3D Euclidean Signed Distance Field (Felzenszwalb-Huttenlocher 3-pass EDT)
 *  - Exterior air padding so roof/wall caps always carry true outward normals
 *  - 3D RGB Edge Dilation (bleed padding) so GPU linear/trilinear sampling never creates dark halos
 *  - Smooth SDF-gradient normals + ambient occlusion + auto-emissive detection
 */

import { clamp } from "./math.js";
import type { AssetProvenance, SocketDef, Vec3, VolumeAsset } from "./types.js";

function edt1dSquared(f: Float32Array, n: number, out: Float32Array): void {
  const v = new Int32Array(n);
  const z = new Float32Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -1e18;
  z[1] = 1e18;
  for (let q = 1; q < n; q++) {
    let s: number;
    while (true) {
      const r = v[k];
      s = (f[q] + q * q - (f[r] + r * r)) / (2 * (q - r));
      if (s <= z[k]) {
        k--;
      } else {
        break;
      }
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e18;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const d = q - v[k];
    out[q] = d * d + f[v[k]];
  }
}

export function compute3DSdf(rgba: Uint8Array, w: number, l: number, h: number, smoothStrength = 0.14): Float32Array {
  const area = w * l;
  const total = h * area;
  const INF = 1e9;
  const dOut = new Float32Array(total);
  const dIn = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const inside = rgba[i * 4 + 3] >= 128;
    dOut[i] = inside ? 0 : INF;
    dIn[i] = inside ? INF : 0;
  }

  const maxDim = Math.max(w, l, h);
  const fBuf = new Float32Array(maxDim);
  const oBuf = new Float32Array(maxDim);

  const run3D = (arr: Float32Array) => {
    for (let z = 0; z < h; z++) {
      const zb = z * area;
      for (let y = 0; y < l; y++) {
        const rb = zb + y * w;
        for (let x = 0; x < w; x++) fBuf[x] = arr[rb + x];
        edt1dSquared(fBuf, w, oBuf);
        for (let x = 0; x < w; x++) arr[rb + x] = oBuf[x];
      }
    }
    for (let z = 0; z < h; z++) {
      const zb = z * area;
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < l; y++) fBuf[y] = arr[zb + y * w + x];
        edt1dSquared(fBuf, l, oBuf);
        for (let y = 0; y < l; y++) arr[zb + y * w + x] = oBuf[y];
      }
    }
    for (let y = 0; y < l; y++) {
      for (let x = 0; x < w; x++) {
        const xy = y * w + x;
        for (let z = 0; z < h; z++) fBuf[z] = arr[z * area + xy];
        edt1dSquared(fBuf, h, oBuf);
        for (let z = 0; z < h; z++) arr[z * area + xy] = oBuf[z];
      }
    }
  };

  run3D(dOut);
  run3D(dIn);

  const sdf = new Float32Array(total);
  for (let z = 0; z < h; z++) {
    const dzB = Math.min(z + 1, h - z);
    const zb = z * area;
    for (let y = 0; y < l; y++) {
      const dyB = Math.min(dzB, y + 1, l - y);
      const rb = zb + y * w;
      for (let x = 0; x < w; x++) {
        const i = rb + x;
        const a = rgba[i * 4 + 3] / 255;
        const bDist = Math.min(dyB, x + 1, w - x);
        const din = Math.min(Math.sqrt(dIn[i]), bDist);
        let d = a >= 0.5 ? -(din - 0.5) : Math.sqrt(dOut[i]) - 0.5;
        if (a > 0.01 && a < 0.99 && Math.abs(d) <= 1.0) d = 0.5 - a;
        sdf[i] = d;
      }
    }
  }

  if (smoothStrength <= 0) return sdf;
  const tmp = new Float32Array(total);
  const wS = clamp(smoothStrength, 0, 0.25);
  const wM = 1 - 2 * wS;

  for (let z = 0; z < h; z++) {
    const zb = z * area;
    for (let y = 0; y < l; y++) {
      const rb = zb + y * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < w - 1 ? x + 1 : w - 1;
        tmp[rb + x] = wM * sdf[rb + x] + wS * (sdf[rb + xm] + sdf[rb + xp]);
      }
    }
  }
  for (let z = 0; z < h; z++) {
    const zb = z * area;
    for (let y = 0; y < l; y++) {
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < l - 1 ? y + 1 : l - 1;
      for (let x = 0; x < w; x++) {
        sdf[zb + y * w + x] = wM * tmp[zb + y * w + x] + wS * (tmp[zb + ym * w + x] + tmp[zb + yp * w + x]);
      }
    }
  }
  for (let z = 0; z < h; z++) {
    const zm = z > 0 ? z - 1 : 0;
    const zp = z < h - 1 ? z + 1 : h - 1;
    for (let i = 0; i < area; i++) {
      tmp[z * area + i] = wM * sdf[z * area + i] + wS * (sdf[zm * area + i] + sdf[zp * area + i]);
    }
  }
  return tmp;
}

export function dilateRgbEdges3D(rgba: Uint8Array, w: number, l: number, h: number, iterations = 3): Uint8Array {
  const area = w * l;
  const total = h * area;
  const out = new Uint8Array(rgba);
  let valid = new Uint8Array(total);
  for (let i = 0; i < total; i++) valid[i] = out[i * 4 + 3] > 0 ? 1 : 0;

  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];

  for (let it = 0; it < iterations; it++) {
    const nextValid = new Uint8Array(valid);
    const nextRgb = new Uint8Array(out);
    for (let z = 0; z < h; z++) {
      const zb = z * area;
      for (let y = 0; y < l; y++) {
        const rb = zb + y * w;
        for (let x = 0; x < w; x++) {
          const idx = rb + x;
          if (valid[idx]) continue;
          let r = 0, g = 0, b = 0, cnt = 0;
          for (let d = 0; d < 6; d++) {
            const nx = x + dirs[d][0];
            const ny = y + dirs[d][1];
            const nz = z + dirs[d][2];
            if (nx < 0 || nx >= w || ny < 0 || ny >= l || nz < 0 || nz >= h) continue;
            const nIdx = nz * area + ny * w + nx;
            if (valid[nIdx]) {
              const p = nIdx * 4;
              r += out[p]; g += out[p + 1]; b += out[p + 2]; cnt++;
            }
          }
          if (cnt > 0) {
            const p = idx * 4;
            nextRgb[p] = (r / cnt) | 0;
            nextRgb[p + 1] = (g / cnt) | 0;
            nextRgb[p + 2] = (b / cnt) | 0;
            nextValid[idx] = 1;
          }
        }
      }
    }
    out.set(nextRgb);
    valid = nextValid;
  }
  return out;
}

export function hashBytesFNV1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  const step = Math.max(1, (bytes.length / 4096) | 0);
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface CreateVolumeAssetOptions {
  id: string;
  name?: string;
  w: number;
  l: number;
  h: number;
  rgba: Uint8Array;
  voxelScale?: number;
  pivot?: Vec3;
  sdfRange?: number;
  smoothSdf?: number;
  explicitSdf?: Float32Array;
  explicitEmissive?: Uint8Array;
  sockets?: Record<string, SocketDef>;
  provenance?: AssetProvenance;
}

export function createVolumeAsset(opts: CreateVolumeAssetOptions): VolumeAsset {
  const { w, l, h } = opts;
  const area = w * l;
  const total = h * area;
  const sdfRange = opts.sdfRange ?? 6.0;

  const rgba = dilateRgbEdges3D(opts.rgba, w, l, h, 3);
  const sdfF32 = opts.explicitSdf ?? compute3DSdf(rgba, w, l, h, opts.smoothSdf ?? 0.14);
  const sdfU8 = new Uint8Array(total);
  const normAo = new Uint8Array(total * 4);
  const emisU8 = opts.explicitEmissive ? new Uint8Array(opts.explicitEmissive) : new Uint8Array(total);

  const atSdf = (z: number, y: number, x: number): number => {
    const oob = z < 0 || z >= h || y < 0 || y >= l || x < 0 || x >= w ? 1.0 : 0.0;
    const cz = clamp(z, 0, h - 1);
    const cy = clamp(y, 0, l - 1);
    const cx = clamp(x, 0, w - 1);
    return sdfF32[cz * area + cy * w + cx] + oob;
  };
  const atOcc = (z: number, y: number, x: number): number => {
    if (z < 0 || z >= h || y < 0 || y >= l || x < 0 || x >= w) return 0;
    return rgba[(z * area + y * w + x) * 4 + 3] >= 128 ? 1 : 0;
  };

  const colorCounts = new Map<number, number>();
  let surfCount = 0;
  const isSurf = new Uint8Array(total);

  for (let z = 0; z < h; z++) {
    for (let y = 0; y < l; y++) {
      for (let x = 0; x < w; x++) {
        const idx = z * area + y * w + x;
        const dNorm = clamp(sdfF32[idx] / sdfRange, -1, 1);
        sdfU8[idx] = clamp(Math.round(dNorm * 127 + 128), 0, 255);

        let gx = atSdf(z, y, x + 1) - atSdf(z, y, x - 1);
        let gy = atSdf(z, y + 1, x) - atSdf(z, y - 1, x);
        let gz = atSdf(z + 1, y, x) - atSdf(z - 1, y, x);
        const mag = Math.hypot(gx, gy, gz);
        if (mag > 1e-4) {
          gx /= mag; gy /= mag; gz /= mag;
        } else {
          gx = 0; gy = 0; gz = 1;
        }

        const upOcc =
          atOcc(z + 1, y, x) +
          atOcc(z + 1, y - 1, x) +
          atOcc(z + 1, y + 1, x) +
          atOcc(z + 1, y, x - 1) +
          atOcc(z + 1, y, x + 1);
        const ao = clamp(1.0 - upOcc * 0.045, 0.72, 1.0);

        const p = idx * 4;
        normAo[p] = clamp(Math.round((gx * 0.5 + 0.5) * 255), 0, 255);
        normAo[p + 1] = clamp(Math.round((gy * 0.5 + 0.5) * 255), 0, 255);
        normAo[p + 2] = clamp(Math.round((gz * 0.5 + 0.5) * 255), 0, 255);
        normAo[p + 3] = clamp(Math.round(ao * 255), 0, 255);

        if (!opts.explicitEmissive && rgba[p + 3] >= 128) {
          const interior =
            atOcc(z - 1, y, x) && atOcc(z + 1, y, x) &&
            atOcc(z, y - 1, x) && atOcc(z, y + 1, x) &&
            atOcc(z, y, x - 1) && atOcc(z, y, x + 1);
          if (!interior) {
            isSurf[idx] = 1;
            surfCount++;
            const key = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
            colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  if (!opts.explicitEmissive && surfCount > 0) {
    const dominant = new Set<number>();
    for (const [k, c] of colorCounts.entries()) {
      if (c / surfCount > 0.14) dominant.add(k);
    }
    for (let i = 0; i < total; i++) {
      if (!isSurf[i]) continue;
      const p = i * 4;
      const key = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
      if (dominant.has(key)) continue;
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = (maxC - minC) / (maxC || 1);
      if ((luma >= 180 && (sat >= 0.30 || luma >= 232)) || (maxC >= 215 && sat >= 0.62 && luma >= 110)) {
        emisU8[i] = 255;
      }
    }
  }

  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    hash: hashBytesFNV1a(opts.rgba),
    w,
    l,
    h,
    voxelScale: opts.voxelScale ?? 1.0,
    pivot: opts.pivot ?? [w * 0.5, l * 0.5, h * 0.5],
    sdfRange,
    rgba,
    sdfF32,
    sdfU8,
    normAo,
    emisU8,
    sockets: opts.sockets ?? {},
    provenance: opts.provenance ?? { kind: "slices" },
  };
}
