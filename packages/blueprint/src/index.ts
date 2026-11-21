/**
 * @aastack/blueprint — Frontier-AI-friendly Declarative Voxel + 3D SDF Blueprint DSL.
 *
 * Accepts pure JSON specs (for MCP / LLM codegen / Git diffs) or fluent TS builders,
 * compiling deterministically into @aastack/core VolumeAssets with exact 3D SDF,
 * smooth normals, RGB edge dilation, emissive masks, and named semantic sockets.
 */

import { clamp, createVolumeAsset } from "@aastack/core";
import type { RGB, SocketDef, Vec3, VolumeAsset } from "@aastack/core";

export type BlueprintOp =
  | {
      op: "box";
      min: Vec3;
      max: Vec3;
      color?: RGB;
      emissive?: boolean;
      subtract?: boolean;
      mirrorX?: boolean;
    }
  | {
      op: "sphere";
      center: Vec3;
      radius: number;
      color?: RGB;
      emissive?: boolean;
      subtract?: boolean;
      mirrorX?: boolean;
    }
  | {
      op: "ellipsoid";
      center: Vec3;
      radii: Vec3;
      color?: RGB;
      emissive?: boolean;
      subtract?: boolean;
      mirrorX?: boolean;
    }
  | {
      op: "capsule";
      a: Vec3;
      b: Vec3;
      rA: number;
      rB?: number;
      color?: RGB;
      emissive?: boolean;
      subtract?: boolean;
      mirrorX?: boolean;
    }
  | {
      op: "wedge";
      min: Vec3;
      max: Vec3;
      /** Axis along which the prism tapers ("+y" nose taper, "+z" roof taper, "+x" wing sweep). */
      taperAxis: "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
      /** Axis that narrows as taper progresses. */
      shrinkAxis: "x" | "y" | "z";
      minScale?: number;
      color?: RGB;
      emissive?: boolean;
      mirrorX?: boolean;
    }
  | {
      op: "torus";
      center: Vec3;
      majorRadius: number;
      minorRadius: number;
      /** Normal axis of the ring ("x", "y" forward-facing flight gate, or "z"). */
      axis: "x" | "y" | "z";
      color?: RGB;
      emissive?: boolean;
    }
  | {
      op: "paint";
      min: Vec3;
      max: Vec3;
      color: RGB;
      emissive?: boolean;
      mirrorX?: boolean;
    };

export interface BlueprintSpec {
  id: string;
  name?: string;
  /** Grid size [W (right), L (nose=+Y), H (up=+Z)]. */
  size: [number, number, number];
  voxelScale?: number;
  pivot?: Vec3;
  smoothSdf?: number;
  ops: BlueprintOp[];
  sockets?: Record<string, SocketDef>;
}

function distPointSegment(px: number, py: number, pz: number, a: Vec3, b: Vec3): [number, number] {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const ab2 = abx * abx + aby * aby + abz * abz;
  const t = ab2 > 1e-8 ? clamp((apx * abx + apy * aby + apz * abz) / ab2, 0, 1) : 0;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return [Math.hypot(dx, dy, dz), t];
}

export function compileBlueprint(spec: BlueprintSpec): VolumeAsset {
  const [w, l, h] = spec.size;
  if (w < 1 || l < 1 || h < 1 || w * l * h > 256 * 256 * 128) {
    throw new Error(`Invalid blueprint grid size [${w}, ${l}, ${h}]`);
  }

  const area = w * l;
  const total = h * area;
  const rgba = new Uint8Array(total * 4);
  const emis = new Uint8Array(total);
  const cxMirror = w - 1;

  const setVox = (x: number, y: number, z: number, col: RGB, isEmis: boolean, erase: boolean) => {
    if (x < 0 || x >= w || y < 0 || y >= l || z < 0 || z >= h) return;
    const idx = z * area + y * w + x;
    const p = idx * 4;
    if (erase) {
      rgba[p + 3] = 0;
      emis[idx] = 0;
    } else {
      rgba[p + 0] = col[0];
      rgba[p + 1] = col[1];
      rgba[p + 2] = col[2];
      rgba[p + 3] = 255;
      emis[idx] = isEmis ? 255 : 0;
    }
  };

  const paintOnly = (x: number, y: number, z: number, col: RGB, isEmis: boolean) => {
    if (x < 0 || x >= w || y < 0 || y >= l || z < 0 || z >= h) return;
    const idx = z * area + y * w + x;
    const p = idx * 4;
    if (rgba[p + 3] < 128) return;
    rgba[p + 0] = col[0];
    rgba[p + 1] = col[1];
    rgba[p + 2] = col[2];
    if (isEmis) emis[idx] = 255;
  };

  const applyWithMirror = (x: number, _y: number, _z: number, mirrorX: boolean, fn: (xx: number) => void) => {
    fn(x);
    if (mirrorX) {
      const mx = cxMirror - x;
      if (mx !== x) fn(mx);
    }
  };

  for (const op of spec.ops) {
    const col: RGB = ("color" in op && op.color) ? op.color : [200, 200, 200];
    const isEmis = "emissive" in op ? Boolean(op.emissive) : false;
    const erase = "subtract" in op ? Boolean(op.subtract) : false;
    const mirrorX = "mirrorX" in op ? Boolean(op.mirrorX) : false;

    if (op.op === "box" || op.op === "paint") {
      const x0 = Math.max(0, Math.floor(Math.min(op.min[0], op.max[0])));
      const x1 = Math.min(w - 1, Math.floor(Math.max(op.min[0], op.max[0])));
      const y0 = Math.max(0, Math.floor(Math.min(op.min[1], op.max[1])));
      const y1 = Math.min(l - 1, Math.floor(Math.max(op.min[1], op.max[1])));
      const z0 = Math.max(0, Math.floor(Math.min(op.min[2], op.max[2])));
      const z1 = Math.min(h - 1, Math.floor(Math.max(op.min[2], op.max[2])));
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            applyWithMirror(x, y, z, mirrorX, (xx) => {
              if (op.op === "paint") paintOnly(xx, y, z, col, isEmis);
              else setVox(xx, y, z, col, isEmis, erase);
            });
          }
        }
      }
    } else if (op.op === "sphere") {
      const [cx, cy, cz] = op.center;
      const r = op.radius;
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(l - 1, Math.ceil(cy + r));
      const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(h - 1, Math.ceil(cz + r));
      for (let z = z0; z <= z1; z++) {
        const dz = z + 0.5 - cz;
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - cy;
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - cx;
            if (dx * dx + dy * dy + dz * dz <= r2) {
              applyWithMirror(x, y, z, mirrorX, (xx) => setVox(xx, y, z, col, isEmis, erase));
            }
          }
        }
      }
    } else if (op.op === "ellipsoid") {
      const [cx, cy, cz] = op.center;
      const [rx, ry, rz] = op.radii;
      const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(l - 1, Math.ceil(cy + ry));
      const z0 = Math.max(0, Math.floor(cz - rz)), z1 = Math.min(h - 1, Math.ceil(cz + rz));
      for (let z = z0; z <= z1; z++) {
        const nz = (z + 0.5 - cz) / Math.max(rz, 0.25);
        for (let y = y0; y <= y1; y++) {
          const ny = (y + 0.5 - cy) / Math.max(ry, 0.25);
          for (let x = x0; x <= x1; x++) {
            const nx = (x + 0.5 - cx) / Math.max(rx, 0.25);
            if (nx * nx + ny * ny + nz * nz <= 1.0) {
              applyWithMirror(x, y, z, mirrorX, (xx) => setVox(xx, y, z, col, isEmis, erase));
            }
          }
        }
      }
    } else if (op.op === "capsule") {
      const rB = op.rB ?? op.rA;
      const rMax = Math.max(op.rA, rB);
      const x0 = Math.max(0, Math.floor(Math.min(op.a[0], op.b[0]) - rMax));
      const x1 = Math.min(w - 1, Math.ceil(Math.max(op.a[0], op.b[0]) + rMax));
      const y0 = Math.max(0, Math.floor(Math.min(op.a[1], op.b[1]) - rMax));
      const y1 = Math.min(l - 1, Math.ceil(Math.max(op.a[1], op.b[1]) + rMax));
      const z0 = Math.max(0, Math.floor(Math.min(op.a[2], op.b[2]) - rMax));
      const z1 = Math.min(h - 1, Math.ceil(Math.max(op.a[2], op.b[2]) + rMax));
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const [d, t] = distPointSegment(x + 0.5, y + 0.5, z + 0.5, op.a, op.b);
            const r = op.rA + (rB - op.rA) * t;
            if (d <= r) {
              applyWithMirror(x, y, z, mirrorX, (xx) => setVox(xx, y, z, col, isEmis, erase));
            }
          }
        }
      }
    } else if (op.op === "wedge") {
      const x0 = Math.max(0, Math.floor(Math.min(op.min[0], op.max[0])));
      const x1 = Math.min(w - 1, Math.floor(Math.max(op.min[0], op.max[0])));
      const y0 = Math.max(0, Math.floor(Math.min(op.min[1], op.max[1])));
      const y1 = Math.min(l - 1, Math.floor(Math.max(op.min[1], op.max[1])));
      const z0 = Math.max(0, Math.floor(Math.min(op.min[2], op.max[2])));
      const z1 = Math.min(h - 1, Math.floor(Math.max(op.min[2], op.max[2])));
      const minS = op.minScale ?? 0.05;
      const midX = 0.5 * (x0 + x1), midY = 0.5 * (y0 + y1), midZ = 0.5 * (z0 + z1);
      const halfX = Math.max(0.5, 0.5 * (x1 - x0)), halfY = Math.max(0.5, 0.5 * (y1 - y0)), halfZ = Math.max(0.5, 0.5 * (z1 - z0));

      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            let t = 0;
            if (op.taperAxis === "+x") t = (x - x0) / Math.max(1, x1 - x0);
            else if (op.taperAxis === "-x") t = (x1 - x) / Math.max(1, x1 - x0);
            else if (op.taperAxis === "+y") t = (y - y0) / Math.max(1, y1 - y0);
            else if (op.taperAxis === "-y") t = (y1 - y) / Math.max(1, y1 - y0);
            else if (op.taperAxis === "+z") t = (z - z0) / Math.max(1, z1 - z0);
            else t = (z1 - z) / Math.max(1, z1 - z0);

            const scale = 1.0 - (1.0 - minS) * clamp(t, 0, 1);
            let inside = true;
            if (op.shrinkAxis === "x") inside = Math.abs(x - midX) <= halfX * scale + 0.1;
            else if (op.shrinkAxis === "y") inside = Math.abs(y - midY) <= halfY * scale + 0.1;
            else inside = Math.abs(z - midZ) <= halfZ * scale + 0.1;
            if (inside) {
              applyWithMirror(x, y, z, mirrorX, (xx) => setVox(xx, y, z, col, isEmis, false));
            }
          }
        }
      }
    } else if (op.op === "torus") {
      const [cx, cy, cz] = op.center;
      const R = op.majorRadius;
      const r = op.minorRadius;
      const ext = R + r + 1;
      const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(w - 1, Math.ceil(cx + ext));
      const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(l - 1, Math.ceil(cy + ext));
      const z0 = Math.max(0, Math.floor(cz - ext)), z1 = Math.min(h - 1, Math.ceil(cz + ext));
      for (let z = z0; z <= z1; z++) {
        const dz = z + 0.5 - cz;
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - cy;
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - cx;
            let qx = 0, qy = 0;
            if (op.axis === "y") { qx = Math.hypot(dx, dz) - R; qy = dy; }
            else if (op.axis === "x") { qx = Math.hypot(dy, dz) - R; qy = dx; }
            else { qx = Math.hypot(dx, dy) - R; qy = dz; }
            if (qx * qx + qy * qy <= r * r) {
              setVox(x, y, z, col, isEmis, false);
            }
          }
        }
      }
    }
  }

  return createVolumeAsset({
    id: spec.id,
    name: spec.name ?? spec.id,
    w,
    l,
    h,
    rgba,
    voxelScale: spec.voxelScale ?? 1.0,
    pivot: spec.pivot ?? [w * 0.5, l * 0.5, h * 0.5],
    smoothSdf: spec.smoothSdf ?? 0.14,
    explicitEmissive: emis,
    sockets: spec.sockets ?? {},
    provenance: { kind: "blueprint", source: spec.id },
  });
}

export * from "./presets.js";
