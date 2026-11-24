/**
 * Exact Continuous 3D Signed Distance Field (SDF) Primitives & CSG Operators.
 * Inspired by Inigo Quilez's analytic SDFs and Blender 4.x/5.x SDF Grid Nodes.
 * Evaluates exact mathematical distances (negative inside, zero on surface, positive outside)
 * with sharp architectural creases, chamfered bevels, organic smooth fillets (smin),
 * revolved lathe curves, and variable-radius 3D spline lofts.
 */

import type { Vec3 } from "@aastack/core";

export interface SmoothBlendResult {
  d: number;
  h: number;
}

/** Exact signed distance to an axis-aligned box centered at origin with half-extents (bx, by, bz). */
export function sdBox(px: number, py: number, pz: number, bx: number, by: number, bz: number): number {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const qz = Math.abs(pz) - bz;
  const outD = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inD = Math.min(Math.max(qx, qy, qz), 0);
  return outD + inD;
}

/** Exact signed distance to a smoothly beveled box (architectural stone & machined hulls). */
export function sdRoundBox(px: number, py: number, pz: number, bx: number, by: number, bz: number, r: number): number {
  return sdBox(px, py, pz, Math.max(0.01, bx - r), Math.max(0.01, by - r), Math.max(0.01, bz - r)) - r;
}

/** Exact signed distance to a Z-axis vertical cylinder centered at origin. */
export function sdCylinderZ(px: number, py: number, pz: number, radius: number, halfH: number): number {
  const dx = Math.hypot(px, py) - radius;
  const dz = Math.abs(pz) - halfH;
  return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
}

/** Exact signed distance to a Y-axis horizontal cylinder (arches, barrels, cannons, tunnels). */
export function sdCylinderY(px: number, py: number, pz: number, radius: number, halfL: number): number {
  const dr = Math.hypot(px, pz) - radius;
  const dy = Math.abs(py) - halfL;
  return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
}

/** Exact signed distance to an X-axis horizontal cylinder. */
export function sdCylinderX(px: number, py: number, pz: number, radius: number, halfW: number): number {
  const dr = Math.hypot(py, pz) - radius;
  const dx = Math.abs(px) - halfW;
  return Math.min(Math.max(dr, dx), 0) + Math.hypot(Math.max(dr, 0), Math.max(dx, 0));
}

/** Exact signed distance to a capped vertical frustum / cone along Z (turrets, stalactites, trunks). */
export function sdCappedConeZ(px: number, py: number, pz: number, rBot: number, rTop: number, halfH: number): number {
  const qx = Math.hypot(px, py);
  const qy = pz;
  const k1x = rTop, k1y = halfH;
  const k2x = rTop - rBot, k2y = 2 * halfH;
  const caX = qx - Math.min(qx, qy < 0 ? rBot : rTop);
  const caY = Math.abs(qy) - halfH;
  const k2Dot = k2x * k2x + k2y * k2y;
  const t = Math.max(0, Math.min(1, ((k1x - qx) * k2x + (k1y - qy) * k2y) / (k2Dot || 1e-6)));
  const cbX = qx - k1x + k2x * t;
  const cbY = qy - k1y + k2y * t;
  const s = cbX < 0 && caY < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(caX * caX + caY * caY, cbX * cbX + cbY * cbY));
}

/** Smooth ellipsoid distance estimate (domes, organic boulders, foliage clusters, submarine hulls). */
export function sdEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return (k0 * (k0 - 1.0)) / (k1 || 1e-6);
}

/** Exact signed distance to a torus centered at origin with normal along axis ("x" | "y" | "z"). */
export function sdTorus(px: number, py: number, pz: number, majorR: number, minorR: number, axis: "x" | "y" | "z" = "z"): number {
  if (axis === "x") {
    const qx = Math.hypot(py, pz) - majorR;
    return Math.hypot(qx, px) - minorR;
  }
  if (axis === "y") {
    const qx = Math.hypot(px, pz) - majorR;
    return Math.hypot(qx, py) - minorR;
  }
  const qx = Math.hypot(px, py) - majorR;
  return Math.hypot(qx, pz) - minorR;
}

/** Exact tapered capsule between 3D points a and b with endpoint radii rA -> rB. */
export function sdCapsule(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  rA: number, rB = rA,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const ba2 = bax * bax + bay * bay + baz * baz;
  const h = ba2 > 1e-8 ? Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / ba2)) : 0;
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.hypot(dx, dy, dz) - (rA + (rB - rA) * h);
}

/**
 * Exact continuous pitched gable roof prism (ridge runs along Y, base sits at z = 0, peak at z = ridgeH).
 * Eliminates 90-degree Lego roof staircases completely!
 */
export function sdPitchedRoofY(px: number, py: number, pz: number, halfW: number, halfL: number, ridgeH: number): number {
  const ax = Math.abs(px);
  const ay = Math.abs(py) - halfL;
  const slopeLen = Math.hypot(halfW, ridgeH) || 1;
  // Outward normal of right roof slope: (ridgeH, halfW) / slopeLen
  const nx = ridgeH / slopeLen;
  const nz = halfW / slopeLen;
  const dSlope = ax * nx + (pz - ridgeH) * nz;
  const dBot = -pz;
  const dProfile = Math.max(dSlope, dBot);
  return Math.min(Math.max(dProfile, ay), 0) + Math.hypot(Math.max(dProfile, 0), Math.max(ay, 0));
}

/**
 * Exact Roman semicircular (or pointed Gothic) arch prism running along Y (useful both as solid vault
 * ribs and as crisp arch subtractions through walls, bridges, and aqueducts!).
 * Base of piers at z = 0, springing height = pierH, arch crown at z = pierH + halfW.
 */
export function sdArchY(
  px: number, py: number, pz: number,
  halfW: number, pierH: number, halfDepth: number, pointed = 0,
): number {
  const ax = Math.abs(px);
  const dRect = sdBox(px, py, pz - pierH * 0.5, halfW, halfDepth, pierH * 0.5);
  let dTop: number;
  if (pointed > 0.01) {
    // Gothic pointed arch formed by two intersecting offset circles
    const shift = halfW * pointed;
    const rad = halfW + shift;
    const dr = Math.hypot(ax + shift, pz - pierH) - rad;
    const dy = Math.abs(py) - halfDepth;
    const dCap = Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
    dTop = Math.max(dCap, pierH - pz);
  } else {
    dTop = sdCylinderY(px, py, pz - pierH, halfW, halfDepth);
  }
  return Math.min(dRect, dTop);
}

/**
 * Exact continuous surface of revolution (Lathe) around the Z axis from an ordered 2D polyline [[r0,z0], [r1,z1], ...].
 * Builds classical domes, fluted column capitals, chalices, turrets, and curved hulls with zero stair-stepping!
 */
export function sdLatheZ(px: number, py: number, pz: number, profile: ReadonlyArray<readonly [number, number]>): number {
  const r = Math.hypot(px, py);
  const rTest = r + 1e-4;
  const n = profile.length;
  if (n < 2) return 1e6;
  let minD2 = 1e18;
  let windings = 0;
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    // Skip symmetry-axis closing segment (r === 0 on both endpoints) for surface distance!
    const onAxis = a[0] <= 1e-5 && b[0] <= 1e-5;
    if (!onAxis) {
      const wx = r - a[0];
      const wy = pz - a[1];
      const e2 = ex * ex + ey * ey;
      const t = e2 > 1e-8 ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / e2)) : 0;
      const dx = wx - ex * t;
      const dy = wy - ey * t;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
    const condA = pz >= a[1];
    const condB = pz < b[1];
    if (condA !== condB) {
      const xCross = a[0] + ((pz - a[1]) * ex) / (ey || 1e-8);
      if (rTest < xCross) windings ^= 1;
    }
  }
  return (windings ? -1 : 1) * Math.sqrt(minD2);
}

export interface SplinePoint {
  pos: Vec3;
  radius: number;
}

/** Evaluates a smooth Catmull-Rom 3D spline into dense loft samples for sdSplineLoft. */
export function sampleCatmullRomSpline(control: ReadonlyArray<SplinePoint>, stepsPerSeg = 8): SplinePoint[] {
  if (control.length < 2) return [...control];
  const out: SplinePoint[] = [];
  const n = control.length;
  const get = (i: number) => control[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const segSteps = i === n - 2 ? stepsPerSeg : stepsPerSeg;
    for (let s = 0; s < segSteps; s++) {
      const t = s / segSteps;
      const t2 = t * t;
      const t3 = t2 * t;
      const interp = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({
        pos: [
          interp(p0.pos[0], p1.pos[0], p2.pos[0], p3.pos[0]),
          interp(p0.pos[1], p1.pos[1], p2.pos[1], p3.pos[1]),
          interp(p0.pos[2], p1.pos[2], p2.pos[2], p3.pos[2]),
        ],
        radius: Math.max(0.15, interp(p0.radius, p1.radius, p2.radius, p3.radius)),
      });
    }
  }
  out.push(control[n - 1]);
  return out;
}

/** Exact continuous distance to a variable-radius 3D spline loft (gnarled tree branches, coral, stone arches, hulls). */
export function sdSplineLoft(px: number, py: number, pz: number, samples: ReadonlyArray<SplinePoint>, smoothK = 0.0): number {
  let d = 1e9;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const seg = sdCapsule(
      px, py, pz,
      a.pos[0], a.pos[1], a.pos[2],
      b.pos[0], b.pos[1], b.pos[2],
      a.radius, b.radius,
    );
    if (smoothK > 1e-4) {
      d = opSmoothMin(d, seg, smoothK).d;
    } else if (seg < d) {
      d = seg;
    }
  }
  return d;
}

/** Polynomial smooth union (Inigo Quilez smin): returns blended distance AND blend factor h in [0, 1]. */
export function opSmoothMin(a: number, b: number, k: number): SmoothBlendResult {
  if (k <= 1e-5) return a < b ? { d: a, h: 0 } : { d: b, h: 1 };
  const h = Math.max(k - Math.abs(a - b), 0.0) / k;
  const d = Math.min(a, b) - h * h * k * 0.25;
  // Blend factor where 0 = fully a, 1 = fully b
  const mixB = a < b ? h * 0.5 : 1.0 - h * 0.5;
  return { d, h: mixB };
}

/** Polynomial smooth subtraction (carve dCut out of dTarget with fillet radius k). */
export function opSmoothSubtract(dTarget: number, dCut: number, k: number): number {
  if (k <= 1e-5) return Math.max(dTarget, -dCut);
  const h = Math.max(0, Math.min(1, 0.5 - (0.5 * (dTarget + dCut)) / k));
  return dTarget + (-dCut - dTarget) * h + k * h * (1 - h);
}

/** Hollow shell operator (converts any solid SDF into a shell of thickness t). */
export function opOnion(d: number, thickness: number): number {
  return Math.abs(d) - thickness;
}

/** N-fold polar symmetry around Z (colonnades, circular temple columns, radial struts, gears). */
export function opPolarFold(px: number, py: number, count: number): [number, number] {
  const sector = (Math.PI * 2) / count;
  const a = Math.atan2(py, px);
  const r = Math.hypot(px, py);
  const folded = ((((a + sector * 0.5) % sector) + sector) % sector) - sector * 0.5;
  return [Math.cos(folded) * r, Math.sin(folded) * r];
}
