/**
 * Lightweight, zero-dependency runtime validators for @aastack/bridge.
 * Kept separate from static Draft 2020-12 JSON Schema metadata so browser apps
 * importing @aastack/bridge/client tree-shake away all schema description strings.
 */

import type { Diagnostic } from "./protocol.js";

export const VALID_RENDER_STYLES = ["arcade-8bit", "hd-2d", "smooth-toy", "retro-raw"] as const;
export const VALID_AA_MODES = ["legacy", "voxel-dda", "smooth-sdf", "bandlimited"] as const;
export const VALID_SHADE_STYLES = ["toon-aa", "pbr-lite", "unlit"] as const;
export const VALID_CAMERA_MODES = ["overhead", "chase", "cockpit", "ortho", "free"] as const;
export const VALID_DEBUG_OVERLAYS = ["none", "normals", "depth", "object-id", "overdraw"] as const;
export const VALID_BLUEPRINT_OPS = ["box", "sphere", "ellipsoid", "capsule", "wedge", "torus", "paint"] as const;

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every(isFiniteNum);
}

function isQuat(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every(isFiniteNum);
}

function isRGB(v: unknown): v is [number, number, number] {
  return isVec3(v) && v.every((c) => c >= 0 && c <= 255);
}

export function validateBlueprintSpec(raw: unknown): Diagnostic[] {
  const diags: Diagnostic[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ severity: "error", code: "SCHEMA_TYPE", path: "$", message: "BlueprintSpec must be a JSON object." }];
  }
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || s.id.trim().length === 0) {
    diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: "$.id", message: "BlueprintSpec.id must be a non-empty string." });
  }
  if (!isVec3(s.size) || !s.size.every((n) => Number.isInteger(n) && n >= 1 && n <= 256)) {
    diags.push({
      severity: "error",
      code: "SCHEMA_SIZE",
      path: "$.size",
      message: "BlueprintSpec.size must be [W, L, H] integers between 1 and 256.",
      suggestion: "Use e.g. [32, 34, 14] (max total volume 256*256*128 voxels).",
    });
  } else if (s.size[0] * s.size[1] * s.size[2] > 256 * 256 * 128) {
    diags.push({
      severity: "error",
      code: "SCHEMA_VOLUME_LIMIT",
      path: "$.size",
      message: `Grid volume ${s.size[0] * s.size[1] * s.size[2]} exceeds safety cap of ${256 * 256 * 128} voxels.`,
    });
  }
  if (s.voxelScale !== undefined && (!isFiniteNum(s.voxelScale) || s.voxelScale <= 0)) {
    diags.push({ severity: "error", code: "SCHEMA_RANGE", path: "$.voxelScale", message: "voxelScale must be > 0." });
  }
  if (s.pivot !== undefined && !isVec3(s.pivot)) {
    diags.push({ severity: "error", code: "SCHEMA_TYPE", path: "$.pivot", message: "pivot must be a [x, y, z] numeric tuple." });
  }
  if (!Array.isArray(s.ops) || s.ops.length === 0) {
    diags.push({
      severity: "error",
      code: "SCHEMA_REQUIRED",
      path: "$.ops",
      message: "BlueprintSpec.ops must be a non-empty array of CSG operations.",
    });
  } else {
    const validOps = new Set<string>(VALID_BLUEPRINT_OPS);
    for (let i = 0; i < s.ops.length; i++) {
      const op = s.ops[i] as Record<string, unknown> | null;
      const p = `$.ops[${i}]`;
      if (!op || typeof op !== "object" || typeof op.op !== "string" || !validOps.has(op.op)) {
        diags.push({
          severity: "error",
          code: "SCHEMA_OP",
          path: p,
          message: `Invalid op "${String(op?.op)}"; expected one of ${VALID_BLUEPRINT_OPS.join(", ")}.`,
        });
        continue;
      }
      if (op.color !== undefined && !isRGB(op.color)) {
        diags.push({ severity: "error", code: "SCHEMA_RGB", path: `${p}.color`, message: "color must be [r, g, b] in 0..255." });
      }
      if (op.op === "box" || op.op === "paint" || op.op === "wedge") {
        if (!isVec3(op.min)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.min`, message: `${op.op}.min must be [x, y, z].` });
        if (!isVec3(op.max)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.max`, message: `${op.op}.max must be [x, y, z].` });
        if (op.op === "paint" && !isRGB(op.color)) {
          diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.color`, message: "paint op requires color [r, g, b]." });
        }
        if (op.op === "wedge") {
          if (!["+x", "-x", "+y", "-y", "+z", "-z"].includes(String(op.taperAxis))) {
            diags.push({ severity: "error", code: "SCHEMA_ENUM", path: `${p}.taperAxis`, message: "wedge.taperAxis must be +x|-x|+y|-y|+z|-z." });
          }
          if (!["x", "y", "z"].includes(String(op.shrinkAxis))) {
            diags.push({ severity: "error", code: "SCHEMA_ENUM", path: `${p}.shrinkAxis`, message: "wedge.shrinkAxis must be x|y|z." });
          }
        }
      } else if (op.op === "sphere") {
        if (!isVec3(op.center)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.center`, message: "sphere.center must be [x, y, z]." });
        if (!isFiniteNum(op.radius) || op.radius <= 0) diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.radius`, message: "sphere.radius must be > 0." });
      } else if (op.op === "ellipsoid") {
        if (!isVec3(op.center)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.center`, message: "ellipsoid.center must be [x, y, z]." });
        if (!isVec3(op.radii) || op.radii.some((r) => r <= 0)) diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.radii`, message: "ellipsoid.radii must be positive [rx, ry, rz]." });
      } else if (op.op === "capsule") {
        if (!isVec3(op.a)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.a`, message: "capsule.a must be [x, y, z]." });
        if (!isVec3(op.b)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.b`, message: "capsule.b must be [x, y, z]." });
        if (!isFiniteNum(op.rA) || op.rA <= 0) diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.rA`, message: "capsule.rA must be > 0." });
      } else if (op.op === "torus") {
        if (!isVec3(op.center)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.center`, message: "torus.center must be [x, y, z]." });
        if (!isFiniteNum(op.majorRadius) || op.majorRadius <= 0) diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.majorRadius`, message: "torus.majorRadius must be > 0." });
        if (!isFiniteNum(op.minorRadius) || op.minorRadius <= 0) diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.minorRadius`, message: "torus.minorRadius must be > 0." });
        if (!["x", "y", "z"].includes(String(op.axis))) diags.push({ severity: "error", code: "SCHEMA_ENUM", path: `${p}.axis`, message: "torus.axis must be x|y|z." });
      }
    }
  }
  if (s.sockets !== undefined) {
    if (!s.sockets || typeof s.sockets !== "object" || Array.isArray(s.sockets)) {
      diags.push({ severity: "error", code: "SCHEMA_TYPE", path: "$.sockets", message: "sockets must be a map of socketName -> { pos, dir? }." });
    } else {
      for (const [k, v] of Object.entries(s.sockets as Record<string, unknown>)) {
        const sv = v as Record<string, unknown> | null;
        if (!sv || typeof sv !== "object" || !isVec3(sv.pos)) {
          diags.push({ severity: "error", code: "SCHEMA_SOCKET", path: `$.sockets.${k}.pos`, message: `Socket "${k}" requires pos: [x, y, z].` });
        }
        if (sv?.dir !== undefined && !isVec3(sv.dir)) {
          diags.push({ severity: "error", code: "SCHEMA_SOCKET", path: `$.sockets.${k}.dir`, message: `Socket "${k}".dir must be [dx, dy, dz].` });
        }
      }
    }
  }
  return diags;
}

export function validateScenePatchOps(raw: unknown): Diagnostic[] {
  const diags: Diagnostic[] = [];
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ severity: "error", code: "SCHEMA_TYPE", path: "$", message: "Patch ops must be a non-empty array of ScenePatchOp." }];
  }
  const styleSet = new Set<string>(VALID_RENDER_STYLES);
  const aaSet = new Set<string>(VALID_AA_MODES);
  const dbgSet = new Set<string>(VALID_DEBUG_OVERLAYS);

  for (let i = 0; i < raw.length; i++) {
    const op = raw[i] as Record<string, unknown> | null;
    const p = `$[${i}]`;
    if (!op || typeof op !== "object" || typeof op.op !== "string") {
      diags.push({ severity: "error", code: "SCHEMA_OP", path: p, message: "Each patch item must be an object with op." });
      continue;
    }
    if (op.op === "set") {
      if (typeof op.path !== "string" || op.path.length === 0) {
        diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.path`, message: "set op requires a dot-path string." });
        continue;
      }
      if (op.path === "style" && !styleSet.has(String(op.value))) {
        diags.push({
          severity: "error",
          code: "INVALID_STYLE",
          path: `${p}.value`,
          message: `Unknown RenderStyle "${String(op.value)}".`,
          suggestion: `Expected one of: ${VALID_RENDER_STYLES.join(" | ")}.`,
        });
      }
      if (op.path === "aaMode" && !aaSet.has(String(op.value))) {
        diags.push({
          severity: "error",
          code: "INVALID_AA_MODE",
          path: `${p}.value`,
          message: `Unknown AAMode "${String(op.value)}".`,
          suggestion: `Expected one of: ${VALID_AA_MODES.join(" | ")}.`,
        });
      }
      if (op.path === "debugOverlay" && !dbgSet.has(String(op.value))) {
        diags.push({ severity: "error", code: "INVALID_DEBUG_OVERLAY", path: `${p}.value`, message: `Unknown debugOverlay "${String(op.value)}".` });
      }
      if (op.path === "samples" && ![1, 4, 8].includes(Number(op.value))) {
        diags.push({ severity: "error", code: "INVALID_SAMPLES", path: `${p}.value`, message: "samples must be 1, 4, or 8." });
      }
    } else if (op.op === "spawn") {
      const ent = op.entity as Record<string, unknown> | null;
      if (!ent || typeof ent !== "object") {
        diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.entity`, message: "spawn op requires entity object." });
      } else {
        if (typeof ent.id !== "string" || !ent.id) diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.entity.id`, message: "entity.id must be a non-empty string." });
        if (typeof ent.assetId !== "string" || !ent.assetId) diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.entity.assetId`, message: "entity.assetId must be a non-empty string." });
        if (!isVec3(ent.pos)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.entity.pos`, message: "entity.pos must be [x, y, z]." });
        if (!isQuat(ent.rot)) diags.push({ severity: "error", code: "SCHEMA_QUAT", path: `${p}.entity.rot`, message: "entity.rot must be [x, y, z, w] quaternion." });
        if (!isFiniteNum(ent.scale) || ent.scale <= 0) diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.entity.scale`, message: "entity.scale must be > 0." });
      }
    } else if (op.op === "remove") {
      if (typeof op.entityId !== "string" || !op.entityId) {
        diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.entityId`, message: "remove op requires entityId." });
      }
    } else if (op.op === "updateEntity") {
      if (typeof op.entityId !== "string" || !op.entityId) {
        diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.entityId`, message: "updateEntity op requires entityId." });
      }
      const patch = op.patch as Record<string, unknown> | null;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        diags.push({ severity: "error", code: "SCHEMA_REQUIRED", path: `${p}.patch`, message: "updateEntity op requires patch object." });
      } else {
        if (patch.pos !== undefined && !isVec3(patch.pos)) diags.push({ severity: "error", code: "SCHEMA_VEC3", path: `${p}.patch.pos`, message: "patch.pos must be [x, y, z]." });
        if (patch.rot !== undefined && !isQuat(patch.rot)) diags.push({ severity: "error", code: "SCHEMA_QUAT", path: `${p}.patch.rot`, message: "patch.rot must be [x, y, z, w]." });
        if (patch.scale !== undefined && (!isFiniteNum(patch.scale) || patch.scale <= 0)) {
          diags.push({ severity: "error", code: "SCHEMA_RANGE", path: `${p}.patch.scale`, message: "patch.scale must be > 0." });
        }
      }
    } else {
      diags.push({
        severity: "error",
        code: "SCHEMA_OP",
        path: `${p}.op`,
        message: `Unknown patch op "${op.op}"; expected set | spawn | remove | updateEntity.`,
      });
    }
  }
  return diags;
}

export function validateSceneDocument(raw: unknown): Diagnostic[] {
  const diags: Diagnostic[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ severity: "error", code: "SCHEMA_TYPE", path: "$", message: "SceneDocument must be a JSON object." }];
  }
  const d = raw as Record<string, unknown>;
  if (d.style !== undefined && !VALID_RENDER_STYLES.includes(d.style as (typeof VALID_RENDER_STYLES)[number])) {
    diags.push({
      severity: "error",
      code: "INVALID_STYLE",
      path: "$.style",
      message: `Unknown RenderStyle "${String(d.style)}".`,
      suggestion: `Expected one of: ${VALID_RENDER_STYLES.join(" | ")}.`,
    });
  }
  if (d.aaMode !== undefined && !VALID_AA_MODES.includes(d.aaMode as (typeof VALID_AA_MODES)[number])) {
    diags.push({ severity: "error", code: "INVALID_AA_MODE", path: "$.aaMode", message: `Unknown AAMode "${String(d.aaMode)}".` });
  }
  if (d.samples !== undefined && ![1, 4, 8].includes(Number(d.samples))) {
    diags.push({ severity: "error", code: "INVALID_SAMPLES", path: "$.samples", message: "samples must be 1, 4, or 8." });
  }
  if (d.camera && typeof d.camera === "object") {
    const cam = d.camera as Record<string, unknown>;
    if (isFiniteNum(cam.near) && isFiniteNum(cam.far) && cam.near >= cam.far) {
      diags.push({ severity: "error", code: "INVALID_CAMERA_CLIP", path: "$.camera", message: `camera.near (${cam.near}) must be < camera.far (${cam.far}).` });
    }
  }
  return diags;
}
