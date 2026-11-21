/**
 * 3D Geometric & Mobile-Budget Linter for AASpriteStacker.
 * Catches common LLM & authoring defects in <1ms so frontier agents self-correct in 1 turn:
 *  - Empty assets (0 solid voxels)
 *  - Floating disconnected voxel islands (exact 3D 6-connected-component BFS with bbox)
 *  - Semantic sockets outside volume bounds or detached from solid hull
 *  - Sparse grids / mobile 3D texture memory budgets
 *  - SceneIR integrity (dangling parentId/assetId, invalid scales, mobile entity counts)
 */

import type { SceneWorld, VolumeAsset } from "@aastack/core";
import type { Diagnostic } from "./protocol.js";
import { validateSceneDocument } from "./validators.js";

export interface VolumeMetrics {
  dimensions: [number, number, number];
  totalVoxels: number;
  solidVoxels: number;
  emissiveVoxels: number;
  fillRatio: number;
  connectedComponents: number;
  gpuTextureKB: number;
  sockets: string[];
}

export interface VolumeLintReport {
  ok: boolean;
  metrics: VolumeMetrics;
  diagnostics: Diagnostic[];
}

export function lintVolumeAsset(asset: VolumeAsset): VolumeLintReport {
  const { w, l, h, rgba, emisU8 } = asset;
  const area = w * l;
  const total = h * area;
  const diagnostics: Diagnostic[] = [];

  let solid = 0;
  let emissive = 0;
  for (let i = 0; i < total; i++) {
    if (rgba[i * 4 + 3] >= 128) solid++;
    if (emisU8[i] > 0) emissive++;
  }

  const gpuTextureKB = Number(((total * 10) / 1024).toFixed(1));
  const fillRatio = Number((solid / Math.max(total, 1)).toFixed(4));

  if (solid === 0) {
    diagnostics.push({
      severity: "error",
      code: "EMPTY_VOLUME",
      path: "$.ops",
      message: `Asset "${asset.id}" compiled to 0 solid voxels.`,
      suggestion: "Check primitive coordinates against size [W, L, H] and ensure subtract ops do not erase the entire hull.",
    });
    return {
      ok: false,
      metrics: {
        dimensions: [w, l, h],
        totalVoxels: total,
        solidVoxels: 0,
        emissiveVoxels: 0,
        fillRatio: 0,
        connectedComponents: 0,
        gpuTextureKB,
        sockets: Object.keys(asset.sockets),
      },
      diagnostics,
    };
  }

  // Exact 3D 6-connected-component BFS to detect floating disconnected voxel islands
  const visited = new Uint8Array(total);
  const queue = new Int32Array(solid);
  interface Island {
    count: number;
    min: [number, number, number];
    max: [number, number, number];
  }
  const islands: Island[] = [];

  for (let start = 0; start < total; start++) {
    if (visited[start] || rgba[start * 4 + 3] < 128) continue;
    visited[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let minX = w, minY = l, minZ = h;
    let maxX = -1, maxY = -1, maxZ = -1;

    while (head < tail) {
      const idx = queue[head++];
      const z = Math.floor(idx / area);
      const rem = idx - z * area;
      const y = Math.floor(rem / w);
      const x = rem - y * w;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

      if (x > 0) {
        const n = idx - 1;
        if (!visited[n] && rgba[n * 4 + 3] >= 128) { visited[n] = 1; queue[tail++] = n; }
      }
      if (x + 1 < w) {
        const n = idx + 1;
        if (!visited[n] && rgba[n * 4 + 3] >= 128) { visited[n] = 1; queue[tail++] = n; }
      }
      if (y > 0) {
        const n = idx - w;
        if (!visited[n] && rgba[n * 4 + 3] >= 128) { visited[n] = 1; queue[tail++] = n; }
      }
      if (y + 1 < l) {
        const n = idx + w;
        if (!visited[n] && rgba[n * 4 + 3] >= 128) { visited[n] = 1; queue[tail++] = n; }
      }
      if (z > 0) {
        const n = idx - area;
        if (!visited[n] && rgba[n * 4 + 3] >= 128) { visited[n] = 1; queue[tail++] = n; }
      }
      if (z + 1 < h) {
        const n = idx + area;
        if (!visited[n] && rgba[n * 4 + 3] >= 128) { visited[n] = 1; queue[tail++] = n; }
      }
    }
    islands.push({ count: tail, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
  }

  islands.sort((a, b) => b.count - a.count);
  if (islands.length > 1) {
    for (let i = 1; i < Math.min(islands.length, 4); i++) {
      const isl = islands[i];
      diagnostics.push({
        severity: "warning",
        code: "FLOATING_VOXEL_ISLAND",
        path: "$.ops",
        message: `Disconnected voxel island #${i} (${isl.count} voxels) at bbox [${isl.min.join(",")}]..[${isl.max.join(",")}].`,
        suggestion: "Connect this component to the primary body with an overlapping strut/capsule or remove unintended debris.",
      });
    }
    if (islands.length > 4) {
      diagnostics.push({
        severity: "warning",
        code: "FLOATING_VOXEL_ISLANDS_MORE",
        path: "$.ops",
        message: `${islands.length - 4} additional smaller disconnected voxel islands detected.`,
      });
    }
  }

  // Semantic socket bounds & hull proximity validation
  for (const [name, sock] of Object.entries(asset.sockets)) {
    const [sx, sy, sz] = sock.pos;
    if (sx < -0.5 || sx > w + 0.5 || sy < -0.5 || sy > l + 0.5 || sz < -0.5 || sz > h + 0.5) {
      diagnostics.push({
        severity: "warning",
        code: "SOCKET_OUT_OF_BOUNDS",
        path: `$.sockets.${name}.pos`,
        message: `Socket "${name}" at [${sx}, ${sy}, ${sz}] lies outside asset grid [0..${w}, 0..${l}, 0..${h}].`,
        suggestion: "Place socket coordinates in voxel grid space [0..W, 0..L, 0..H].",
      });
      continue;
    }
    // Sockets inside the primary solid hull bounding box (e.g. hollow ring "center" or interior cockpit) are valid;
    // flag sockets floating far outside the primary body (> 4 voxels from any solid voxel).
    const primary = islands[0];
    const insidePrimaryBbox =
      sx >= primary.min[0] - 2 && sx <= primary.max[0] + 3 &&
      sy >= primary.min[1] - 2 && sy <= primary.max[1] + 3 &&
      sz >= primary.min[2] - 2 && sz <= primary.max[2] + 3;
    if (insidePrimaryBbox) continue;

    // Check nearest solid voxel within radius 4 around socket
    const r = 4;
    const x0 = Math.max(0, Math.floor(sx - r)), x1 = Math.min(w - 1, Math.ceil(sx + r));
    const y0 = Math.max(0, Math.floor(sy - r)), y1 = Math.min(l - 1, Math.ceil(sy + r));
    const z0 = Math.max(0, Math.floor(sz - r)), z1 = Math.min(h - 1, Math.ceil(sz + r));
    let minD2 = Infinity;
    for (let z = z0; z <= z1; z++) {
      const dz = z + 0.5 - sz;
      const zb = z * area;
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - sy;
        const rb = zb + y * w;
        for (let x = x0; x <= x1; x++) {
          if (rgba[(rb + x) * 4 + 3] < 128) continue;
          const dx = x + 0.5 - sx;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < minD2) minD2 = d2;
        }
      }
    }
    if (minD2 > 16.0) {
      diagnostics.push({
        severity: "warning",
        code: "SOCKET_DETACHED",
        path: `$.sockets.${name}.pos`,
        message: `Socket "${name}" at [${sx}, ${sy}, ${sz}] is > 4 voxels away from any solid voxel.`,
        suggestion: "Move the socket closer to the hull surface (e.g. wingtip, nozzle, canopy).",
      });
    }
  }

  if (fillRatio < 0.015) {
    diagnostics.push({
      severity: "warning",
      code: "SPARSE_GRID",
      path: "$.size",
      message: `Asset "${asset.id}" has low occupancy (${(fillRatio * 100).toFixed(2)}% of ${w}×${l}×${h}).`,
      suggestion: "Tighten BlueprintSpec.size to reduce mobile 3D texture memory and OBB raymarch steps.",
    });
  }
  if (gpuTextureKB > 512) {
    diagnostics.push({
      severity: "warning",
      code: "MOBILE_VRAM_BUDGET",
      path: "$.size",
      message: `Asset "${asset.id}" uses ${gpuTextureKB} KB of 3D textures (> 512 KB mobile recommendation).`,
      suggestion: "Prefer voxel grids <= 48×48×24 for mobile-friendly actors.",
    });
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  return {
    ok: !hasError,
    metrics: {
      dimensions: [w, l, h],
      totalVoxels: total,
      solidVoxels: solid,
      emissiveVoxels: emissive,
      fillRatio,
      connectedComponents: islands.length,
      gpuTextureKB,
      sockets: Object.keys(asset.sockets),
    },
    diagnostics,
  };
}

export function lintSceneWorld(world: SceneWorld, checkAssetRegistry = true): Diagnostic[] {
  const diags: Diagnostic[] = [...validateSceneDocument(world.doc)];
  const doc = world.doc;
  const ids = new Set(doc.entities.map((e) => e.id));
  const hasRegisteredAssets = world.listAssets().length > 0;
  let visibleCount = 0;

  for (let i = 0; i < doc.entities.length; i++) {
    const e = doc.entities[i];
    const p = `$.entities[${i}]`;
    if (e.visible !== false) visibleCount++;
    if (e.parentId && !ids.has(e.parentId)) {
      diags.push({
        severity: "error",
        code: "DANGLING_PARENT",
        path: `${p}.parentId`,
        message: `Entity "${e.id}" references missing parentId "${e.parentId}".`,
      });
    }
    if (checkAssetRegistry && hasRegisteredAssets && !world.getAsset(e.assetId)) {
      diags.push({
        severity: "warning",
        code: "MISSING_ASSET",
        path: `${p}.assetId`,
        message: `Entity "${e.id}" references unregistered assetId "${e.assetId}".`,
        suggestion: "Register or hot-swap the asset before spawning entities referencing it.",
      });
    }
    if (e.scale <= 0) {
      diags.push({
        severity: "error",
        code: "INVALID_SCALE",
        path: `${p}.scale`,
        message: `Entity "${e.id}" has non-positive scale ${e.scale}.`,
      });
    }
  }

  if (visibleCount > 64) {
    diags.push({
      severity: "warning",
      code: "MOBILE_ENTITY_BUDGET",
      path: "$.entities",
      message: `Scene has ${visibleCount} visible entities (> 64 mobile 60fps recommendation).`,
      suggestion: "Cull far props or keep active OBB count <= 48 on mobile GPUs.",
    });
  }
  return diags;
}
