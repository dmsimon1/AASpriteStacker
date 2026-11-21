/**
 * Asset loaders for @aastack/core:
 *  - MagicaVoxel `.vox` binary parser (zero external deps, supports SIZE, XYZI, RGBA + default palette)
 *  - Standard horizontal `slices.png` strip loader (100% compatible with danielwh2/sprite-stacking)
 */

import { createVolumeAsset } from "./volume.js";
import type { SocketDef, Vec3, VolumeAsset } from "./types.js";

// Official MagicaVoxel default 256-color palette (subset generator matching ephtracy spec)
function defaultVoxPalette(): Uint8Array {
  const pal = new Uint8Array(256 * 4);
  // Classic MagicaVoxel default color cube + grayscale ramp
  const vals = [0xff, 0xcc, 0x99, 0x66, 0x33, 0x00];
  let idx = 1;
  for (let b = 0; b < 6 && idx < 216; b++) {
    for (let g = 0; g < 6 && idx < 216; g++) {
      for (let r = 0; r < 6 && idx < 216; r++) {
        pal[idx * 4 + 0] = vals[r];
        pal[idx * 4 + 1] = vals[g];
        pal[idx * 4 + 2] = vals[b];
        pal[idx * 4 + 3] = 255;
        idx++;
      }
    }
  }
  for (let i = idx; i < 256; i++) {
    const v = Math.round(((255 - i) / (256 - idx)) * 255);
    pal[i * 4 + 0] = v;
    pal[i * 4 + 1] = v;
    pal[i * 4 + 2] = v;
    pal[i * 4 + 3] = 255;
  }
  return pal;
}

export interface VoxParseOptions {
  id: string;
  name?: string;
  voxelScale?: number;
  pivot?: Vec3;
  computeSdf?: boolean;
  sockets?: Record<string, SocketDef>;
}

/** Parse a MagicaVoxel `.vox` binary buffer into an AA-ready VolumeAsset with 3D SDF & normals. */
export function parseVox(buffer: ArrayBuffer, opts: VoxParseOptions): VolumeAsset {
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  if (buffer.byteLength < 20) throw new Error("Invalid .vox file: too short");

  const readStr = (off: number): string =>
    String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);

  if (readStr(0) !== "VOX ") {
    throw new Error(`Invalid .vox magic: "${readStr(0)}"`);
  }

  let sizeX = 0, sizeY = 0, sizeZ = 0;
  let voxels: Array<[number, number, number, number]> = [];
  let palette = defaultVoxPalette();

  let offset = 8;
  const end = buffer.byteLength;

  const parseChunk = (pos: number, limit: number): number => {
    if (pos + 12 > limit) return limit;
    const id = readStr(pos);
    const contentBytes = view.getInt32(pos + 4, true);
    const childBytes = view.getInt32(pos + 8, true);
    const contentStart = pos + 12;
    const childStart = contentStart + contentBytes;
    const chunkEnd = Math.min(limit, childStart + childBytes);

    if (id === "SIZE" && contentBytes >= 12 && sizeX === 0) {
      sizeX = view.getInt32(contentStart, true);
      sizeY = view.getInt32(contentStart + 4, true);
      sizeZ = view.getInt32(contentStart + 8, true);
    } else if (id === "XYZI" && contentBytes >= 4 && voxels.length === 0) {
      const count = view.getInt32(contentStart, true);
      for (let i = 0; i < count; i++) {
        const p = contentStart + 4 + i * 4;
        if (p + 4 > childStart) break;
        voxels.push([u8[p], u8[p + 1], u8[p + 2], u8[p + 3]]);
      }
    } else if (id === "RGBA" && contentBytes >= 1024) {
      // Palette index 1..255 maps to entries 0..254 in the RGBA chunk
      const pal = new Uint8Array(256 * 4);
      for (let i = 0; i < 255; i++) {
        const src = contentStart + i * 4;
        const dst = (i + 1) * 4;
        pal[dst + 0] = u8[src + 0];
        pal[dst + 1] = u8[src + 1];
        pal[dst + 2] = u8[src + 2];
        pal[dst + 3] = u8[src + 3];
      }
      palette = pal;
    }

    let cPos = childStart;
    while (cPos < chunkEnd) {
      const next = parseChunk(cPos, chunkEnd);
      if (next <= cPos) break;
      cPos = next;
    }
    return chunkEnd;
  };

  while (offset < end) {
    const next = parseChunk(offset, end);
    if (next <= offset) break;
    offset = next;
  }

  if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) {
    throw new Error("Invalid .vox file: missing SIZE chunk");
  }

  const area = sizeX * sizeY;
  const rgba = new Uint8Array(sizeZ * area * 4);
  for (const [vx, vy, vz, ci] of voxels) {
    if (vx >= sizeX || vy >= sizeY || vz >= sizeZ || ci === 0) continue;
    // MagicaVoxel is Z-up; flip Y so nose (+Y) matches sprite-stacking convention
    const idx = vz * area + (sizeY - 1 - vy) * sizeX + vx;
    const p = idx * 4;
    const cp = ci * 4;
    rgba[p + 0] = palette[cp + 0];
    rgba[p + 1] = palette[cp + 1];
    rgba[p + 2] = palette[cp + 2];
    rgba[p + 3] = palette[cp + 3] || 255;
  }

  return createVolumeAsset({
    id: opts.id,
    name: opts.name ?? opts.id,
    w: sizeX,
    l: sizeY,
    h: sizeZ,
    rgba,
    voxelScale: opts.voxelScale ?? 1.0,
    pivot: opts.pivot,
    computeSdf: opts.computeSdf,
    sockets: opts.sockets,
    provenance: { kind: "vox", source: opts.id },
  });
}

export interface SliceStripOptions {
  id: string;
  slices: number;
  name?: string;
  voxelScale?: number;
  pivot?: Vec3;
  computeSdf?: boolean;
  sockets?: Record<string, SocketDef>;
}

/** Build a VolumeAsset from raw horizontal slice-strip RGBA pixels (width = w * slices, height = l). */
export function loadSliceStripPixels(
  stripRgba: Uint8Array | Uint8ClampedArray,
  stripWidth: number,
  stripHeight: number,
  opts: SliceStripOptions,
): VolumeAsset {
  const h = opts.slices;
  if (h < 1 || stripWidth % h !== 0) {
    throw new Error(`Strip width ${stripWidth} is not evenly divisible by slices=${h}`);
  }
  const w = stripWidth / h;
  const l = stripHeight;
  const area = w * l;
  const rgba = new Uint8Array(h * area * 4);

  for (let z = 0; z < h; z++) {
    const zBase = z * area;
    for (let y = 0; y < l; y++) {
      const srcRow = (y * stripWidth + z * w) * 4;
      const dstRow = (zBase + y * w) * 4;
      rgba.set(stripRgba.subarray(srcRow, srcRow + w * 4), dstRow);
    }
  }

  return createVolumeAsset({
    id: opts.id,
    name: opts.name ?? opts.id,
    w,
    l,
    h,
    rgba,
    voxelScale: opts.voxelScale ?? 1.0,
    pivot: opts.pivot,
    computeSdf: opts.computeSdf,
    sockets: opts.sockets,
    provenance: { kind: "slices", source: opts.id },
  });
}

/**
 * Browser helper: build a VolumeAsset directly from a loaded HTMLImageElement or ImageBitmap
 * containing a horizontal `slices.png` strip (width = W * slices, height = L).
 */
export function loadSliceStripFromImage(
  img: HTMLImageElement | ImageBitmap,
  opts: SliceStripOptions,
): VolumeAsset {
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  if (w < 1 || h < 1) {
    throw new Error(`Slice strip image "${opts.id}" has empty dimensions (${w}x${h}).`);
  }
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for loadSliceStripFromImage.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  return loadSliceStripPixels(data, w, h, opts);
}

/**
 * Browser drop-in loader: fetch a horizontal `slices.png` strip URL and compile it into an AA-ready VolumeAsset.
 * Compatible with Aseprite, SpriteStack, and standard horizontal slice strips.
 */
export async function loadSliceStripUrl(url: string, opts: SliceStripOptions): Promise<VolumeAsset> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load slice strip image from "${url}".`));
    el.src = url;
  });
  return loadSliceStripFromImage(img, opts);
}

/**
 * Browser / Node 18+ drop-in loader: fetch a MagicaVoxel `.vox` binary file and compile it into an AA-ready VolumeAsset.
 */
export async function loadVoxUrl(url: string, opts: VoxParseOptions): Promise<VolumeAsset> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch .vox asset from "${url}" (HTTP ${res.status}).`);
  }
  const buf = await res.arrayBuffer();
  return parseVox(buf, opts);
}
