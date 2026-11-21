/**
 * Built-in high-craft Blueprint presets showcasing 6-DOF aircraft, volumetric clouds,
 * aerial rings (hollow cavities), and classic props — all with semantic sockets!
 */

import type { BlueprintSpec } from "./index.js";

/**
 * Sleek swept-wing twin-engine interceptor fighter jet (charcoal stealth hull,
 * crimson/orange intake & wingtip accents, cyan bubble canopy, glowing twin afterburners).
 * Nose faces +Y (world -Z forward), wings span X, vertical tail rises +Z.
 */
export function createFighterJetBlueprint(id = "fighter-jet"): BlueprintSpec {
  const HULL: [number, number, number] = [66, 76, 94];
  const HULL_DARK: [number, number, number] = [30, 35, 48];
  const HULL_LIGHT: [number, number, number] = [118, 136, 160];
  const ACCENT: [number, number, number] = [255, 78, 36];
  const CANOPY: [number, number, number] = [44, 222, 255];
  const CANOPY_HI: [number, number, number] = [224, 252, 255];
  const THRUSTER: [number, number, number] = [255, 224, 84];

  return {
    id,
    name: "SkyStack Interceptor",
    size: [32, 34, 14],
    voxelScale: 0.24,
    pivot: [16, 16, 5.5],
    smoothSdf: 0.12,
    ops: [
      // Tapered central fuselage spine
      { op: "capsule", a: [16, 5, 5.5], b: [16, 30, 5.5], rA: 3.1, rB: 1.0, color: HULL },
      // Sleek sharp nosecone tip with bright nose trim
      { op: "capsule", a: [16, 28, 5.5], b: [16, 33, 5.2], rA: 1.5, rB: 0.55, color: HULL_DARK },
      { op: "paint", min: [15, 31, 4], max: [16, 33, 6], color: ACCENT },
      // Twin side engine nacelles (mirrored X)
      { op: "capsule", a: [12.5, 4.5, 5.2], b: [12.5, 20, 5.5], rA: 2.3, rB: 2.0, color: HULL_DARK, mirrorX: true },
      // Blazing red-orange air-intake lip stripes on nacelles
      { op: "box", min: [10, 18, 4], max: [14, 21, 7], color: ACCENT, mirrorX: true },
      // Swept delta main wings (layered capsules + leading-edge highlights for razor-clean silhouette!)
      { op: "capsule", a: [12, 17, 5.2], b: [2, 9, 5.2], rA: 1.8, rB: 1.0, color: HULL, mirrorX: true },
      { op: "capsule", a: [12, 12, 5.2], b: [2.5, 8.5, 5.2], rA: 1.7, rB: 0.9, color: HULL_DARK, mirrorX: true },
      { op: "capsule", a: [11, 14.5, 5.2], b: [4.5, 10, 5.2], rA: 1.5, rB: 1.1, color: HULL, mirrorX: true },
      // Bright silver-steel wing leading-edge bevel & panel highlights
      { op: "paint", min: [7, 13, 6], max: [11, 17, 8], color: HULL_LIGHT, mirrorX: true },
      // Blazing red-orange wingtip pods & vivid chevron bars
      { op: "capsule", a: [2.2, 7.5, 5.2], b: [2.2, 11.5, 5.2], rA: 1.08, rB: 0.92, color: ACCENT, mirrorX: true },
      { op: "paint", min: [5, 10, 4], max: [7, 14, 7], color: ACCENT, mirrorX: true },
      // Rear horizontal stabilizers
      { op: "capsule", a: [12, 6, 5.4], b: [6.5, 3.5, 5.4], rA: 1.2, rB: 0.75, color: HULL_DARK, mirrorX: true },
      { op: "paint", min: [6, 3, 5], max: [8, 5, 7], color: HULL_LIGHT, mirrorX: true },
      // Twin canted vertical tail fins with vivid orange tip flashes
      { op: "capsule", a: [11.5, 5.5, 6.2], b: [10.2, 4.0, 11.5], rA: 1.15, rB: 0.65, color: HULL_DARK, mirrorX: true },
      { op: "capsule", a: [11.5, 8.0, 6.2], b: [10.4, 5.5, 11.2], rA: 0.95, rB: 0.6, color: HULL, mirrorX: true },
      { op: "paint", min: [9, 3, 9], max: [11, 6, 12], color: ACCENT, mirrorX: true },
      // Dorsal hull highlight ridge
      { op: "paint", min: [15, 7, 7], max: [16, 26, 9], color: HULL_LIGHT },
      // Luminous cyan glass bubble canopy + specular glint
      { op: "ellipsoid", center: [16, 21.5, 7.6], radii: [2.15, 4.6, 2.25], color: CANOPY },
      { op: "ellipsoid", center: [15.4, 22.9, 8.8], radii: [0.95, 2.1, 0.85], color: CANOPY_HI },
      // Glowing dual afterburner nozzles (emissive!)
      { op: "sphere", center: [12.5, 3.2, 5.2], radius: 1.5, color: THRUSTER, emissive: true, mirrorX: true },
    ],
    sockets: {
      thrusterL: { pos: [12.5, 2.0, 5.2], dir: [0, -1, 0] },
      thrusterR: { pos: [19.5, 2.0, 5.2], dir: [0, -1, 0] },
      wingtipL: { pos: [2.2, 7.5, 5.2], dir: [0, -1, 0] },
      wingtipR: { pos: [29.8, 7.5, 5.2], dir: [0, -1, 0] },
      cockpitCam: { pos: [16.0, 23.0, 9.6], dir: [0, 1, 0] },
    },
  };
}

/**
 * Multi-lobed volumetric cumulus cloud blueprint (crisp 3-tone sunlit white tops,
 * sky-tinted mid body, cool periwinkle undersides so clouds pop with bold 8-bit volume!).
 */
export function createCloudBlueprint(variant: 0 | 1 | 2 = 0, id = `cloud-${variant}`): BlueprintSpec {
  const WHITE: [number, number, number] = [255, 255, 255];
  const MID: [number, number, number] = [226, 238, 255];
  const SHADE: [number, number, number] = [156, 184, 226];

  if (variant === 0) {
    return {
      id,
      name: "Cumulus Cluster A",
      size: [26, 22, 12],
      voxelScale: 0.72,
      pivot: [13, 11, 5],
      smoothSdf: 0.2,
      ops: [
        { op: "ellipsoid", center: [13, 11, 5.5], radii: [7.5, 6.2, 4.4], color: WHITE },
        { op: "ellipsoid", center: [7, 12, 4.8], radii: [5.4, 5.0, 3.6], color: WHITE },
        { op: "ellipsoid", center: [19, 10, 4.8], radii: [5.6, 4.8, 3.5], color: WHITE },
        { op: "ellipsoid", center: [12, 6, 4.6], radii: [5.2, 4.4, 3.4], color: WHITE },
        { op: "ellipsoid", center: [15, 15, 5.2], radii: [4.8, 4.6, 3.6], color: WHITE },
        { op: "paint", min: [0, 0, 0], max: [25, 21, 5], color: MID },
        { op: "paint", min: [0, 0, 0], max: [25, 21, 3], color: SHADE },
      ],
    };
  }
  if (variant === 1) {
    return {
      id,
      name: "Cumulus Streak B",
      size: [28, 18, 11],
      voxelScale: 0.68,
      pivot: [14, 9, 4.5],
      smoothSdf: 0.2,
      ops: [
        { op: "ellipsoid", center: [8, 9, 4.8], radii: [6.5, 5.2, 3.8], color: WHITE },
        { op: "ellipsoid", center: [15, 10, 5.4], radii: [6.8, 5.5, 4.2], color: WHITE },
        { op: "ellipsoid", center: [22, 8, 4.4], radii: [4.8, 4.4, 3.2], color: WHITE },
        { op: "paint", min: [0, 0, 0], max: [27, 17, 4], color: MID },
        { op: "paint", min: [0, 0, 0], max: [27, 17, 2], color: SHADE },
      ],
    };
  }
  return {
    id,
    name: "Cumulus Puff C",
    size: [20, 20, 12],
    voxelScale: 0.65,
    pivot: [10, 10, 5],
    smoothSdf: 0.2,
    ops: [
      { op: "ellipsoid", center: [10, 10, 5.6], radii: [6.4, 6.2, 4.4], color: WHITE },
      { op: "ellipsoid", center: [6, 8, 4.6], radii: [4.2, 4.2, 3.2], color: WHITE },
      { op: "ellipsoid", center: [14, 12, 4.8], radii: [4.4, 4.0, 3.4], color: WHITE },
      { op: "paint", min: [0, 0, 0], max: [19, 19, 5], color: MID },
      { op: "paint", min: [0, 0, 0], max: [19, 19, 3], color: SHADE },
    ],
  };
}

/**
 * Glowing hollow sky-ring checkpoint gate — demonstrates true hollow 3D cavities
 * that classic 4-view visual hulls cannot carve, with glowing cyan beacon emitters!
 */
export function createSkyGateBlueprint(id = "sky-gate"): BlueprintSpec {
  const FRAME: [number, number, number] = [48, 60, 86];
  const GLOW: [number, number, number] = [68, 248, 255];
  const GOLD: [number, number, number] = [255, 204, 46];

  return {
    id,
    name: "Sky Gate Ring",
    size: [26, 8, 26],
    voxelScale: 0.65,
    pivot: [13, 4, 13],
    smoothSdf: 0.14,
    ops: [
      { op: "torus", center: [13, 4, 13], majorRadius: 9.8, minorRadius: 2.0, axis: "y", color: FRAME },
      { op: "torus", center: [13, 4, 13], majorRadius: 8.6, minorRadius: 0.95, axis: "y", color: GLOW, emissive: true },
      { op: "box", min: [11, 1, 22], max: [14, 6, 25], color: GOLD, emissive: true },
      { op: "box", min: [11, 1, 0], max: [14, 6, 3], color: GOLD, emissive: true },
    ],
    sockets: {
      center: { pos: [13, 4, 13], dir: [0, 1, 0] },
    },
  };
}
