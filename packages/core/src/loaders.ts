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
  /** Optional explicit sub-model index to extract instead of stitching the full nTRN/nSHP scene graph. */
  modelIndex?: number;
  sockets?: Record<string, SocketDef>;
}

interface RawVoxModel {
  sx: number;
  sy: number;
  sz: number;
  voxels: Array<[number, number, number, number]>;
}

interface VoxTransformNode {
  kind: "trn";
  childId: number;
  tx: number;
  ty: number;
  tz: number;
  rotByte: number;
  hidden: boolean;
}

interface VoxGroupNode {
  kind: "grp";
  children: number[];
}

interface VoxShapeNode {
  kind: "shp";
  modelIds: number[];
}

type VoxSceneNode = VoxTransformNode | VoxGroupNode | VoxShapeNode;

function decodeVoxRotMatrix(rotByte: number): [number, number, number, number, number, number, number, number, number] {
  const c0 = rotByte & 3;
  const c1 = (rotByte >> 2) & 3;
  if (c0 > 2 || c1 > 2 || c0 === c1) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const c2 = 3 - c0 - c1;
  const s0 = (rotByte & 16) ? -1 : 1;
  const s1 = (rotByte & 32) ? -1 : 1;
  const s2 = (rotByte & 64) ? -1 : 1;
  const m: [number, number, number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  m[0 * 3 + c0] = s0;
  m[1 * 3 + c1] = s1;
  m[2 * 3 + c2] = s2;
  return m;
}

function mulMat3(
  a: [number, number, number, number, number, number, number, number, number],
  b: [number, number, number, number, number, number, number, number, number],
): [number, number, number, number, number, number, number, number, number] {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/**
 * Parse a MagicaVoxel `.vox` binary buffer into an AA-ready VolumeAsset.
 * Supports single-model files AND multi-object MagicaVoxel scene graphs (SIZE, XYZI, RGBA, nTRN, nGRP, nSHP).
 */
export function parseVox(buffer: ArrayBuffer, opts: VoxParseOptions): VolumeAsset {
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  if (buffer.byteLength < 20) throw new Error("Invalid .vox file: too short");

  const readStr = (off: number): string =>
    String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);

  if (readStr(0) !== "VOX ") {
    throw new Error(`Invalid .vox magic: "${readStr(0)}"`);
  }

  const readDict = (pos: number, limit: number): { dict: Record<string, string>; next: number } => {
    const dict: Record<string, string> = {};
    if (pos + 4 > limit) return { dict, next: limit };
    const n = view.getInt32(pos, true);
    let cur = pos + 4;
    for (let i = 0; i < n && cur + 4 <= limit; i++) {
      const kLen = view.getInt32(cur, true);
      cur += 4;
      if (kLen < 0 || cur + kLen > limit) return { dict, next: limit };
      let k = "";
      for (let j = 0; j < kLen; j++) k += String.fromCharCode(u8[cur + j]);
      cur += kLen;
      if (cur + 4 > limit) return { dict, next: limit };
      const vLen = view.getInt32(cur, true);
      cur += 4;
      if (vLen < 0 || cur + vLen > limit) return { dict, next: limit };
      let v = "";
      for (let j = 0; j < vLen; j++) v += String.fromCharCode(u8[cur + j]);
      cur += vLen;
      dict[k] = v;
    }
    return { dict, next: cur };
  };

  const models: RawVoxModel[] = [];
  const nodes = new Map<number, VoxSceneNode>();
  const referencedChildren = new Set<number>();
  let palette = defaultVoxPalette();

  let offset = 8;
  const end = buffer.byteLength;

  const parseChunk = (pos: number, limit: number): number => {
    if (pos + 12 > limit) return limit;
    const id = readStr(pos);
    const contentBytes = view.getInt32(pos + 4, true);
    const childBytes = view.getInt32(pos + 8, true);
    const contentStart = pos + 12;
    const childStart = Math.min(limit, contentStart + Math.max(0, contentBytes));
    const chunkEnd = Math.min(limit, childStart + Math.max(0, childBytes));

    if (id === "SIZE" && contentBytes >= 12) {
      models.push({
        sx: view.getInt32(contentStart, true),
        sy: view.getInt32(contentStart + 4, true),
        sz: view.getInt32(contentStart + 8, true),
        voxels: [],
      });
    } else if (id === "XYZI" && contentBytes >= 4 && models.length > 0) {
      const target = models[models.length - 1];
      const count = view.getInt32(contentStart, true);
      for (let i = 0; i < count; i++) {
        const p = contentStart + 4 + i * 4;
        if (p + 4 > childStart) break;
        target.voxels.push([u8[p], u8[p + 1], u8[p + 2], u8[p + 3]]);
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
    } else if (id === "nTRN" && contentBytes >= 24) {
      const nodeId = view.getInt32(contentStart, true);
      const { dict: attrs, next: p1 } = readDict(contentStart + 4, childStart);
      if (p1 + 16 <= childStart) {
        const childId = view.getInt32(p1, true);
        const numFrames = view.getInt32(p1 + 12, true);
        let tx = 0, ty = 0, tz = 0;
        let rotByte = 0x04; // identity
        if (numFrames > 0) {
          const { dict: f0 } = readDict(p1 + 16, childStart);
          if (f0._t) {
            const parts = f0._t.trim().split(/\s+/).map(Number);
            if (parts.length >= 3 && parts.every(Number.isFinite)) {
              tx = parts[0]; ty = parts[1]; tz = parts[2];
            }
          }
          if (f0._r !== undefined) {
            const parsed = Number(f0._r);
            if (Number.isFinite(parsed)) rotByte = parsed & 0xff;
          }
        }
        nodes.set(nodeId, { kind: "trn", childId, tx, ty, tz, rotByte, hidden: attrs._hidden === "1" });
        referencedChildren.add(childId);
      }
    } else if (id === "nGRP" && contentBytes >= 8) {
      const nodeId = view.getInt32(contentStart, true);
      const { next: p1 } = readDict(contentStart + 4, childStart);
      if (p1 + 4 <= childStart) {
        const numChildren = view.getInt32(p1, true);
        const children: number[] = [];
        for (let i = 0; i < numChildren; i++) {
          const cp = p1 + 4 + i * 4;
          if (cp + 4 > childStart) break;
          const cid = view.getInt32(cp, true);
          children.push(cid);
          referencedChildren.add(cid);
        }
        nodes.set(nodeId, { kind: "grp", children });
      }
    } else if (id === "nSHP" && contentBytes >= 8) {
      const nodeId = view.getInt32(contentStart, true);
      const { next: p1 } = readDict(contentStart + 4, childStart);
      if (p1 + 4 <= childStart) {
        const numModels = view.getInt32(p1, true);
        const modelIds: number[] = [];
        let cur = p1 + 4;
        for (let i = 0; i < numModels && cur + 4 <= childStart; i++) {
          modelIds.push(view.getInt32(cur, true));
          const { next: afterAttr } = readDict(cur + 4, childStart);
          cur = afterAttr;
        }
        nodes.set(nodeId, { kind: "shp", modelIds });
      }
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

  if (models.length === 0 || models[0].sx <= 0 || models[0].sy <= 0 || models[0].sz <= 0) {
    throw new Error("Invalid .vox file: missing SIZE chunk");
  }

  let sizeX = 0, sizeY = 0, sizeZ = 0;
  let finalVoxels: Array<[number, number, number, number]>;

  const useSceneGraph = opts.modelIndex === undefined && nodes.size > 0;
  if (!useSceneGraph) {
    const mIdx = Math.max(0, Math.min(models.length - 1, opts.modelIndex ?? 0));
    const m = models[mIdx];
    sizeX = m.sx; sizeY = m.sy; sizeZ = m.sz;
    finalVoxels = m.voxels;
  } else {
    // Traverse MagicaVoxel scene graph (nTRN -> nGRP -> nSHP) and stitch all visible models/instances into one volume
    const placed: Array<[number, number, number, number]> = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let shapeCount = 0;
    let hasRotation = false;
    let lastModelIdx = 0;

    const visit = (
      nodeId: number,
      rot: [number, number, number, number, number, number, number, number, number],
      tx: number,
      ty: number,
      tz: number,
      depth: number,
    ) => {
      if (depth > 32) return;
      const node = nodes.get(nodeId);
      if (!node) return;
      if (node.kind === "trn") {
        if (node.hidden) return;
        const ntx = tx + rot[0] * node.tx + rot[1] * node.ty + rot[2] * node.tz;
        const nty = ty + rot[3] * node.tx + rot[4] * node.ty + rot[5] * node.tz;
        const ntz = tz + rot[6] * node.tx + rot[7] * node.ty + rot[8] * node.tz;
        const nrot = mulMat3(rot, decodeVoxRotMatrix(node.rotByte));
        if (node.rotByte !== 0x04) hasRotation = true;
        visit(node.childId, nrot, ntx, nty, ntz, depth + 1);
      } else if (node.kind === "grp") {
        for (const cid of node.children) visit(cid, rot, tx, ty, tz, depth + 1);
      } else if (node.kind === "shp") {
        const mid = node.modelIds[0];
        const m = mid !== undefined ? models[mid] : undefined;
        if (!m) return;
        shapeCount++;
        lastModelIdx = mid;
        const cx = Math.floor(m.sx / 2);
        const cy = Math.floor(m.sy / 2);
        const cz = Math.floor(m.sz / 2);
        for (const [vx, vy, vz, ci] of m.voxels) {
          if (ci === 0) continue;
          const lx = vx - cx, ly = vy - cy, lz = vz - cz;
          const wx = Math.round(tx + rot[0] * lx + rot[1] * ly + rot[2] * lz);
          const wy = Math.round(ty + rot[3] * lx + rot[4] * ly + rot[5] * lz);
          const wz = Math.round(tz + rot[6] * lx + rot[7] * ly + rot[8] * lz);
          if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
          if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
          if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
          placed.push([wx, wy, wz, ci]);
        }
      }
    };

    const ident: [number, number, number, number, number, number, number, number, number] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const roots = Array.from(nodes.keys()).filter((id) => !referencedChildren.has(id));
    for (const rootId of roots.length > 0 ? roots : [0]) {
      visit(rootId, ident, 0, 0, 0, 0);
    }

    if (placed.length === 0 || (shapeCount === 1 && !hasRotation)) {
      const m = models[shapeCount === 1 ? lastModelIdx : 0];
      sizeX = m.sx; sizeY = m.sy; sizeZ = m.sz;
      finalVoxels = m.voxels;
    } else {
      sizeX = Math.min(256, maxX - minX + 1);
      sizeY = Math.min(256, maxY - minY + 1);
      sizeZ = Math.min(128, maxZ - minZ + 1);
      finalVoxels = placed.map(([wx, wy, wz, ci]) => [wx - minX, wy - minY, wz - minZ, ci]);
    }
  }

  const area = sizeX * sizeY;
  const rgba = new Uint8Array(sizeZ * area * 4);
  for (const [vx, vy, vz, ci] of finalVoxels) {
    if (vx < 0 || vy < 0 || vz < 0 || vx >= sizeX || vy >= sizeY || vz >= sizeZ || ci === 0) continue;
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
