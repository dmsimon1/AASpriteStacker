/**
 * Compact, zero-dependency 3D math for 6-DOF transforms, cameras, and OBB raycasting.
 * Right-handed Y-up world coordinates: +X right, +Y up, -Z forward.
 * Column-major Float32Array(16) matching WebGL2 uniforms directly.
 */

import type { Quat, Vec3 } from "./types.js";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3Len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vec3Norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, -1];
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function quatIdentity(): Quat {
  return [0, 0, 0, 1];
}

export function quatNorm(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l > 1e-8 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : [0, 0, 0, 1];
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Intrinsic YXZ (Yaw -> Pitch -> Roll) flight quaternion in right-handed Y-up space:
 * - yaw: rotation around +Y (positive turns left / CCW from above)
 * - pitch: rotation around local +X (positive pitches nose UP)
 * - roll: rotation around local -Z forward axis (positive banks right wing down)
 */
export function quatFromYawPitchRoll(yaw: number, pitch: number, roll: number): Quat {
  const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
  // Banking right wing down is negative rotation around +Z (positive around -Z forward)
  const cr = Math.cos(-roll * 0.5), sr = Math.sin(-roll * 0.5);
  const qY: Quat = [0, sy, 0, cy];
  const qP: Quat = [sp, 0, 0, cp];
  const qR: Quat = [0, 0, sr, cr];
  return quatNorm(quatMul(quatMul(qY, qP), qR));
}

export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

export function mat4Identity(out = new Float32Array(16)): Float32Array {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function mat4Mul(a: Float32Array, b: Float32Array, out = new Float32Array(16)): Float32Array {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function mat4FromTRS(pos: Vec3, rot: Quat, scale: Vec3, out = new Float32Array(16)): Float32Array {
  const [x, y, z, w] = rot;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = scale;

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;

  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;

  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;

  out[12] = pos[0];
  out[13] = pos[1];
  out[14] = pos[2];
  out[15] = 1;
  return out;
}

/**
 * Exact matrix mapping asset voxel coordinates (vx, vy, vz) in [0..W] x [0..L] x [0..H]
 * to entity-local right-handed Y-up world coordinates:
 *   worldX = (vx - pivotX) * s
 *   worldY = (vz - pivotZ) * s
 *   worldZ = -(vy - pivotY) * s   (so asset +Y nose faces world -Z forward!)
 */
export function mat4AssetToLocal(pivot: Vec3, voxelScale: number, out = new Float32Array(16)): Float32Array {
  out.fill(0);
  // Column 0: vx -> +worldX
  out[0] = voxelScale;
  // Column 1: vy -> -worldZ
  out[6] = -voxelScale;
  // Column 2: vz -> +worldY
  out[9] = voxelScale;
  // Column 3: translation
  out[12] = -pivot[0] * voxelScale;
  out[13] = -pivot[2] * voxelScale;
  out[14] = pivot[1] * voxelScale;
  out[15] = 1;
  return out;
}

export function mat4Perspective(fovRad: number, aspect: number, near: number, far: number, out = new Float32Array(16)): Float32Array {
  const f = 1.0 / Math.tan(fovRad * 0.5);
  const nf = 1.0 / (near - far);
  out.fill(0);
  out[0] = f / Math.max(aspect, 1e-4);
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4Ortho(halfH: number, aspect: number, near: number, far: number, out = new Float32Array(16)): Float32Array {
  const halfW = halfH * Math.max(aspect, 1e-4);
  const lr = 1 / (-halfW - halfW);
  const bt = 1 / (-halfH - halfH);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = -2 * lr;
  out[5] = -2 * bt;
  out[10] = 2 * nf;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3, out = new Float32Array(16)): Float32Array {
  const z = vec3Norm(vec3Sub(eye, target));
  let x = vec3Cross(up, z);
  if (vec3Len(x) < 1e-6) {
    // Fallback when looking nearly straight down/up
    x = vec3Cross([0, 0, -1], z);
  }
  x = vec3Norm(x);
  const y = vec3Cross(z, x);

  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -vec3Dot(x, eye);
  out[13] = -vec3Dot(y, eye);
  out[14] = -vec3Dot(z, eye);
  out[15] = 1;
  return out;
}

export function mat4Invert(a: Float32Array, out = new Float32Array(16)): Float32Array {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return mat4Identity(out);
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export function mat4TransformPoint(m: Float32Array, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  const invW = Math.abs(w) > 1e-8 ? 1 / w : 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW,
  ];
}

export function mat4TransformDir(m: Float32Array, d: Vec3): Vec3 {
  const [x, y, z] = d;
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
}
