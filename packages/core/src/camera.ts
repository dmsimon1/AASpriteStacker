/**
 * First-class 2.5D Isometric, Dimetric (2:1), Oblique Sprite-Stacking, and 6-DOF Camera Helpers.
 * Works identically across WebGL2 rendering, world->screen DOM placement, and click-to-tile ground picking.
 */

import {
  mat4Invert,
  mat4LookAt,
  mat4Mul,
  mat4ObliqueOrtho,
  mat4Ortho,
  mat4Perspective,
  mat4TransformPoint,
} from "./math.js";
import type { CameraState, IsometricPreset, Vec3 } from "./types.js";

const TRUE_ISOMETRIC_ELEVATION_DEG = (Math.atan(Math.SQRT1_2) * 180) / Math.PI; // 35.2643897 deg

export interface IsometricCameraOptions {
  /**
   * Classic 2.5D projection preset (default "dimetric-2to1"):
   * - "dimetric-2to1": classic pixel-art 2:1 isometric diamond tile grid (30 deg elevation, 45 deg yaw)
   * - "isometric": true mathematical axonometric isometric (35.264 deg elevation, 45 deg yaw)
   * - "oblique-stack": classic 2D SpriteStack / Nium oblique shear (un-foreshortened circular XZ footprints + vertical slice extrusion)
   * - "topdown-3quarter": 3/4 RPG top-down orthographic tilt (55 deg elevation, 0 deg yaw)
   */
  preset?: IsometricPreset;
  /** World-space focus point [X, Y, Z]. Defaults to [0, 0, 0]. */
  target?: Vec3;
  /** Horizontal camera azimuth in degrees (default 45 for iso/dimetric, 0 for oblique/topdown). */
  yawDeg?: number;
  /** Override camera pitch elevation in degrees (applies to orthographic presets). */
  elevationDeg?: number;
  /** Vertical slice extrusion ratio for "oblique-stack" (default 1.0; use 0.5 for cabinet half-height stacking). */
  obliqueSkew?: number;
  /** Half-height of the viewport in world units (ignored if pixelsPerUnit + viewportHeightCss are provided). */
  orthoSize?: number;
  /** Exact 2D pixel-lock zoom: CSS pixels per 1.0 world unit (requires viewportHeightCss). */
  pixelsPerUnit?: number;
  /** Canvas CSS height in pixels (used with pixelsPerUnit to lock 1:1 with a 2D tilemap). */
  viewportHeightCss?: number;
  /** Orbit distance from target along the viewing axis (default 80). */
  distance?: number;
  near?: number;
  far?: number;
}

/**
 * Create a drop-in 2.5D Isometric, 2:1 Dimetric, Oblique Sprite-Stacking, or 3/4 Top-Down CameraState.
 */
export function createIsometricCamera(opts: IsometricCameraOptions = {}): CameraState {
  const preset: IsometricPreset = opts.preset ?? "dimetric-2to1";
  const target: Vec3 = opts.target ? [opts.target[0], opts.target[1], opts.target[2]] : [0, 0, 0];
  const distance = opts.distance ?? 80;
  const near = opts.near ?? 0.5;
  const far = opts.far ?? Math.max(240, distance * 3);

  const orthoSize =
    opts.pixelsPerUnit && opts.viewportHeightCss
      ? opts.viewportHeightCss / Math.max(2 * opts.pixelsPerUnit, 1e-4)
      : (opts.orthoSize ?? 10);

  if (preset === "oblique-stack") {
    const yawDeg = opts.yawDeg ?? 0;
    const skew = opts.obliqueSkew ?? 1.0;
    const yaw = (yawDeg * Math.PI) / 180;
    const norm = Math.hypot(1, skew) || 1;
    const pos: Vec3 = [
      target[0] + (Math.sin(yaw) * skew * distance) / norm,
      target[1] + distance / norm,
      target[2] + (Math.cos(yaw) * skew * distance) / norm,
    ];
    return {
      mode: "oblique",
      pos,
      target,
      up: [0, 1, 0],
      fovDeg: 45,
      orthoSize,
      obliqueSkew: skew,
      obliqueYawDeg: yawDeg,
      near,
      far,
    };
  }

  const defaultYaw = preset === "topdown-3quarter" ? 0 : 45;
  const defaultElev =
    preset === "isometric"
      ? TRUE_ISOMETRIC_ELEVATION_DEG
      : preset === "topdown-3quarter"
        ? 55
        : 30; // exact 2:1 pixel-art diamond tile projection (sin(30 deg) = 0.5)

  const yaw = ((opts.yawDeg ?? defaultYaw) * Math.PI) / 180;
  const elev = ((opts.elevationDeg ?? defaultElev) * Math.PI) / 180;
  const horiz = Math.cos(elev) * distance;
  const pos: Vec3 = [
    target[0] + Math.sin(yaw) * horiz,
    target[1] + Math.sin(elev) * distance,
    target[2] + Math.cos(yaw) * horiz,
  ];

  return {
    mode: "ortho",
    pos,
    target,
    up: [0, 1, 0],
    fovDeg: 45,
    orthoSize,
    near,
    far,
  };
}

/**
 * Canonical View-Projection matrix builder shared by AASpriteRenderer and CPU picking/projection helpers.
 * Supports perspective ("chase", "overhead", "cockpit", "free"), orthographic ("ortho"), and oblique ("oblique").
 */
export function computeCameraViewProj(
  cam: CameraState,
  aspect: number,
  viewOut: Float32Array = new Float32Array(16),
  projOut: Float32Array = new Float32Array(16),
  viewProjOut: Float32Array = new Float32Array(16),
): Float32Array {
  if (cam.mode === "oblique") {
    const skew = cam.obliqueSkew ?? 1.0;
    const yawRad = ((cam.obliqueYawDeg ?? 0) * Math.PI) / 180;
    return mat4ObliqueOrtho(cam.orthoSize, aspect, cam.near, cam.far, skew, cam.target, yawRad, viewProjOut);
  }
  const view = mat4LookAt(cam.pos, cam.target, cam.up, viewOut);
  const proj =
    cam.mode === "ortho"
      ? mat4Ortho(cam.orthoSize, aspect, cam.near, cam.far, projOut)
      : mat4Perspective((cam.fovDeg * Math.PI) / 180, aspect, cam.near, cam.far, projOut);
  return mat4Mul(proj, view, viewProjOut);
}

export interface ScreenProjection {
  /** Screen X in CSS/logical pixels from left edge. */
  x: number;
  /** Screen Y in CSS/logical pixels from top edge. */
  y: number;
  /** Normalized depth in [0..1] (0 = near, 1 = far). */
  depth: number;
  /** True when the point lies inside the camera's near/far clip range. */
  visible: boolean;
}

/** Project a 3D world point [X, Y, Z] to 2D canvas/DOM coordinates for aligning HUDs or 2D tile overlays. */
export function projectWorldToScreen(
  worldPos: Vec3,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
): ScreenProjection {
  const aspect = viewportW / Math.max(viewportH, 1);
  const vp = computeCameraViewProj(cam, aspect);
  const ndc = mat4TransformPoint(vp, worldPos);
  return {
    x: (ndc[0] * 0.5 + 0.5) * viewportW,
    y: (0.5 - ndc[1] * 0.5) * viewportH,
    depth: ndc[2] * 0.5 + 0.5,
    visible: ndc[2] >= -1 && ndc[2] <= 1,
  };
}

/**
 * Unproject a 2D canvas/mouse coordinate (top-left origin) onto a horizontal ground plane `Y = groundY`.
 * Works identically for perspective, orthographic, 2:1 dimetric, true isometric, and oblique cameras.
 */
export function unprojectScreenToGround(
  screenX: number,
  screenY: number,
  cam: CameraState,
  viewportW: number,
  viewportH: number,
  groundY = 0,
): Vec3 | null {
  const aspect = viewportW / Math.max(viewportH, 1);
  const vp = computeCameraViewProj(cam, aspect);
  const inv = mat4Invert(vp);
  const ndcX = (screenX / Math.max(viewportW, 1)) * 2 - 1;
  const ndcY = 1 - (screenY / Math.max(viewportH, 1)) * 2;
  const nearP = mat4TransformPoint(inv, [ndcX, ndcY, -1]);
  const farP = mat4TransformPoint(inv, [ndcX, ndcY, 1]);
  const dy = farP[1] - nearP[1];
  if (Math.abs(dy) < 1e-6) return null;
  const t = (groundY - nearP[1]) / dy;
  return [
    nearP[0] + (farP[0] - nearP[0]) * t,
    groundY,
    nearP[2] + (farP[2] - nearP[2]) * t,
  ];
}
