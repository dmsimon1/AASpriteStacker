/**
 * Volumetric preprocessing for anti-aliased sprite stacking:
 *  - Exact O(N) 3D Euclidean Signed Distance Field (Felzenszwalb-Huttenlocher 3-pass EDT)
 *  - Exterior air padding so roof/wall caps always carry true outward normals
 *  - 3D RGB Edge Dilation (bleed padding) so GPU linear/trilinear sampling never creates dark halos
 *  - Smooth SDF-gradient normals + ambient occlusion + auto-emissive detection
 */

import { clamp } from "./math.js";
import type { AssetProvenance, SocketDef, Vec3, VolumeAsset } from "./types.js";

function edt1dSquared(
  f: Float32Array,
  n: number,
  out: Float32Array,
  v: Int32Array,
  z: Float32Array,
): void {
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
  const vBuf = new Int32Array(maxDim);
  const zBuf = new Float32Array(maxDim + 1);

  const run3D = (arr: Float32Array) => {
    for (let z = 0; z < h; z++) {
      const zb = z * area;
      for (let y = 0; y < l; y++) {
        const rb = zb + y * w;
        for (let x = 0; x < w; x++) fBuf[x] = arr[rb + x];
        edt1dSquared(fBuf, w, oBuf, vBuf, zBuf);
        for (let x = 0; x < w; x++) arr[rb + x] = oBuf[x];
      }
    }
    for (let z = 0; z < h; z++) {
      const zb = z * area;
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < l; y++) fBuf[y] = arr[zb + y * w + x];
        edt1dSquared(fBuf, l, oBuf, vBuf, zBuf);
        for (let y = 0; y < l; y++) arr[zb + y * w + x] = oBuf[y];
      }
    }
    for (let y = 0; y < l; y++) {
      for (let x = 0; x < w; x++) {
        const xy = y * w + x;
        for (let z = 0; z < h; z++) fBuf[z] = arr[z * area + xy];
        edt1dSquared(fBuf, h, oBuf, vBuf, zBuf);
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
  let curRgb = new Uint8Array(rgba);
  let nxtRgb = new Uint8Array(rgba);
  let curValid = new Uint8Array(total);
  let nxtValid = new Uint8Array(total);
  for (let i = 0; i < total; i++) curValid[i] = curRgb[i * 4 + 3] > 0 ? 1 : 0;

  const dirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];

  for (let it = 0; it < iterations; it++) {
    nxtValid.set(curValid);
    nxtRgb.set(curRgb);
    for (let z = 0; z < h; z++) {
      const zb = z * area;
      for (let y = 0; y < l; y++) {
        const rb = zb + y * w;
        for (let x = 0; x < w; x++) {
          const idx = rb + x;
          if (curValid[idx]) continue;
          let r = 0, g = 0, b = 0, cnt = 0;
          for (let d = 0; d < 6; d++) {
            const nx = x + dirs[d][0];
            const ny = y + dirs[d][1];
            const nz = z + dirs[d][2];
            if (nx < 0 || nx >= w || ny < 0 || ny >= l || nz < 0 || nz >= h) continue;
            const nIdx = nz * area + ny * w + nx;
            if (curValid[nIdx]) {
              const p = nIdx * 4;
              r += curRgb[p]; g += curRgb[p + 1]; b += curRgb[p + 2]; cnt++;
            }
          }
          if (cnt > 0) {
            const p = idx * 4;
            nxtRgb[p] = (r / cnt) | 0;
            nxtRgb[p + 1] = (g / cnt) | 0;
            nxtRgb[p + 2] = (b / cnt) | 0;
            nxtValid[idx] = 1;
          }
        }
      }
    }
    const tmpRgb = curRgb; curRgb = nxtRgb; nxtRgb = tmpRgb;
    const tmpValid = curValid; curValid = nxtValid; nxtValid = tmpValid;
  }
  return curRgb;
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

const _f32View = new Float32Array(1);
const _u32View = new Uint32Array(_f32View.buffer);

/**
 * Fast, exact IEEE-754 float32 -> float16 encoder for WebGL2 R16F 3D SDF textures.
 * Zero external dependencies; guarantees linear-filterable half-float precision across all WebGL2 GPUs.
 */
export function float32ToFloat16Array(src: Float32Array): Uint16Array {
  const out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const val = src[i];
    _f32View[0] = val;
    const x = _u32View[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = ((x >>> 23) & 0xff) - 127 + 15;
    let mant = x & 0x007fffff;
    if (exp <= 0) {
      if (exp < -10) {
        out[i] = sign;
      } else {
        mant = (mant | 0x00800000) >>> (1 - exp);
        out[i] = sign | ((mant + 0x1000) >>> 13);
      }
    } else if (exp >= 31) {
      out[i] = sign | 0x7bff; // clamp to max finite half (~65504) so SDF never emits Inf/NaN
    } else {
      out[i] = sign | (exp << 10) | ((mant + 0x1000) >>> 13);
    }
  }
  return out;
}

/**
 * Packs any VolumeAsset (including continuous-SDF AA-GeoField assets) into a standard
 * lightweight 2D horizontal sprite-stack strip (width = W * H, height = L, z = 0..H-1 left-to-right).
 */
export function packHorizontalSliceStrip(asset: VolumeAsset): { width: number; height: number; rgba: Uint8Array } {
  const { w, l, h, rgba } = asset;
  const outW = w * h;
  const outH = l;
  const out = new Uint8Array(outW * outH * 4);
  const area = w * l;
  for (let z = 0; z < h; z++) {
    const xOff = z * w;
    for (let y = 0; y < l; y++) {
      // Flip Y so slice top (+Y nose) aligns with image row 0 (matches loadHorizontalStripPixels)
      const imgY = l - 1 - y;
      const dstRow = (imgY * outW + xOff) * 4;
      const srcRow = (z * area + y * w) * 4;
      for (let x = 0; x < w; x++) {
        const sp = srcRow + x * 4;
        const dp = dstRow + x * 4;
        const a = rgba[sp + 3];
        if (a >= 128) {
          out[dp] = rgba[sp];
          out[dp + 1] = rgba[sp + 1];
          out[dp + 2] = rgba[sp + 2];
          out[dp + 3] = a;
        }
      }
    }
  }
  return { width: outW, height: outH, rgba: out };
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
  /** Compute full 3D EDT Signed Distance Field (default true). Set false for 5x faster loads on large crisp voxel-dda assets. */
  computeSdf?: boolean;
  explicitSdf?: Float32Array;
  explicitEmissive?: Uint8Array;
  explicitMaterial?: Uint8Array;
  sockets?: Record<string, SocketDef>;
  provenance?: AssetProvenance;
}

export function createVolumeAsset(opts: CreateVolumeAssetOptions): VolumeAsset {
  const { w, l, h } = opts;
  const area = w * l;
  const total = h * area;
  const sdfRange = opts.sdfRange ?? 6.0;
  const useSdf = opts.computeSdf !== false || Boolean(opts.explicitSdf);

  const rgba = dilateRgbEdges3D(opts.rgba, w, l, h, 3);
  const sdfF32 = useSdf
    ? (opts.explicitSdf ?? compute3DSdf(rgba, w, l, h, opts.smoothSdf ?? 0.14))
    : new Float32Array(total);
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

  if (!useSdf) {
    // Fast O(N) binary occupancy proxy when full 3D EDT is skipped
    for (let i = 0; i < total; i++) {
      sdfF32[i] = rgba[i * 4 + 3] >= 128 ? -0.5 : 0.5;
    }
  }

  const colorCounts = new Map<number, number>();
  let surfCount = 0;
  const isSurf = new Uint8Array(total);

  for (let z = 0; z < h; z++) {
    for (let y = 0; y < l; y++) {
      for (let x = 0; x < w; x++) {
        const idx = z * area + y * w + x;
        const p = idx * 4;
        const dNorm = clamp(sdfF32[idx] / sdfRange, -1, 1);
        sdfU8[idx] = clamp(Math.round(dNorm * 127 + 128), 0, 255);

        const solid = rgba[p + 3] >= 128;
        if (!solid && !useSdf) {
          normAo[p] = 128;
          normAo[p + 1] = 128;
          normAo[p + 2] = 255;
          normAo[p + 3] = 255;
          continue;
        }

        const nXm = atOcc(z, y, x - 1);
        const nXp = atOcc(z, y, x + 1);
        const nYm = atOcc(z, y - 1, x);
        const nYp = atOcc(z, y + 1, x);
        const nZm = atOcc(z - 1, y, x);
        const nZp = atOcc(z + 1, y, x);
        const interior = solid && nXm && nXp && nYm && nYp && nZm && nZp;

        if (interior && !useSdf) {
          normAo[p] = 128;
          normAo[p + 1] = 128;
          normAo[p + 2] = 255;
          normAo[p + 3] = 140;
          continue;
        }

        let gx = atSdf(z, y, x + 1) - atSdf(z, y, x - 1);
        let gy = atSdf(z, y + 1, x) - atSdf(z, y - 1, x);
        let gz = atSdf(z + 1, y, x) - atSdf(z - 1, y, x);
        const mag = Math.hypot(gx, gy, gz);
        if (mag > 1e-4) {
          gx /= mag; gy /= mag; gz /= mag;
        } else {
          gx = 0; gy = 0; gz = 1;
        }

        // Rich 18-neighbor cavity & upper-hemisphere baked voxel AO (MagicaVoxel-grade depth in window reveals, under eaves & boughs!)
        let occWeighted = 0;
        if (solid) {
          const sameRing =
            (nXm + nXp + nYm + nYp) * 0.45 +
            (atOcc(z, y - 1, x - 1) + atOcc(z, y - 1, x + 1) + atOcc(z, y + 1, x - 1) + atOcc(z, y + 1, x + 1)) * 0.55;
          const upRing =
            nZp * 1.15 +
            (atOcc(z + 1, y - 1, x) + atOcc(z + 1, y + 1, x) + atOcc(z + 1, y, x - 1) + atOcc(z + 1, y, x + 1)) * 0.95 +
            (atOcc(z + 1, y - 1, x - 1) + atOcc(z + 1, y - 1, x + 1) + atOcc(z + 1, y + 1, x - 1) + atOcc(z + 1, y + 1, x + 1)) * 0.65;
          const up2 = atOcc(z + 2, y, x) * 0.6;
          occWeighted = sameRing + upRing + up2;
        }
        const ao = clamp(1.0 - Math.max(0, occWeighted - 1.8) * 0.068, 0.44, 1.0);

        normAo[p] = clamp(Math.round((gx * 0.5 + 0.5) * 255), 0, 255);
        normAo[p + 1] = clamp(Math.round((gy * 0.5 + 0.5) * 255), 0, 255);
        normAo[p + 2] = clamp(Math.round((gz * 0.5 + 0.5) * 255), 0, 255);
        normAo[p + 3] = clamp(Math.round(ao * 255), 0, 255);

        if (!opts.explicitEmissive && solid && !interior) {
          isSurf[idx] = 1;
          surfCount++;
          const key = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
          colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
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

  const materialU8 = opts.explicitMaterial ? new Uint8Array(opts.explicitMaterial) : undefined;
  let hash = hashBytesFNV1a(opts.rgba);
  if (opts.explicitSdf) {
    hash += "-" + hashBytesFNV1a(new Uint8Array(opts.explicitSdf.buffer, opts.explicitSdf.byteOffset, opts.explicitSdf.byteLength));
  }
  if (materialU8) {
    hash += "-" + hashBytesFNV1a(materialU8);
  }

  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    hash,
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
    materialU8,
    hasExactSdf: Boolean(opts.explicitSdf),
    sockets: opts.sockets ?? {},
    provenance: opts.provenance ?? { kind: "slices" },
  };
}
