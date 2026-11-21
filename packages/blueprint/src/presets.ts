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

/**
 * Classic 2.5D pixel-art cottage with stepped grass plinth, warm timber-framed walls,
 * glowing amber windows, diagonal blue-shingled gabled roof, brick chimney, and a thin
 * 1-voxel rooftop weathervane — designed specifically to showcase rotation anti-aliasing
 * on diagonal roof edges, fine stripes, and 1px details.
 */
export function createCottageBlueprint(id = "aa-cottage"): BlueprintSpec {
  const EARTH: [number, number, number] = [108, 72, 46];
  const GRASS_DARK: [number, number, number] = [66, 138, 56];
  const GRASS: [number, number, number] = [94, 174, 68];
  const GRASS_HI: [number, number, number] = [132, 202, 82];
  const STONE: [number, number, number] = [164, 170, 178];
  const WALL: [number, number, number] = [244, 232, 198];
  const WALL_SHADE: [number, number, number] = [218, 202, 166];
  const TIMBER: [number, number, number] = [118, 76, 44];
  const DOOR: [number, number, number] = [42, 134, 122];
  const WINDOW_GLOW: [number, number, number] = [255, 224, 108];
  const ROOF_DARK: [number, number, number] = [56, 86, 136];
  const ROOF_MID: [number, number, number] = [78, 114, 170];
  const ROOF_LIGHT: [number, number, number] = [104, 142, 198];
  const CHIMNEY: [number, number, number] = [184, 66, 52];
  const CHIMNEY_TOP: [number, number, number] = [138, 46, 38];
  const METAL: [number, number, number] = [58, 66, 82];
  const GOLD: [number, number, number] = [255, 204, 52];

  return {
    id,
    name: "Sprite Stack Cottage",
    size: [24, 24, 28],
    voxelScale: 0.28,
    pivot: [12, 12, 10],
    smoothSdf: 0.14,
    ops: [
      // Rounded-corner earth & lush grass plinth
      { op: "box", min: [2, 3, 0], max: [21, 20, 1], color: EARTH },
      { op: "box", min: [3, 2, 0], max: [20, 21, 1], color: EARTH },
      { op: "box", min: [2, 3, 2], max: [21, 20, 3], color: GRASS },
      { op: "box", min: [3, 2, 2], max: [20, 21, 3], color: GRASS },
      { op: "paint", min: [2, 2, 2], max: [21, 21, 2], color: GRASS_DARK },
      { op: "paint", min: [4, 4, 3], max: [19, 19, 3], color: GRASS_HI },
      // Stone garden path leading to the front door (+Y)
      { op: "box", min: [10, 18, 3], max: [13, 21, 3], color: STONE },

      // Warm cream plaster cottage walls + lower wainscot trim
      { op: "box", min: [5, 5, 4], max: [18, 18, 13], color: WALL },
      { op: "paint", min: [5, 5, 4], max: [18, 18, 5], color: WALL_SHADE },
      // Timber corner posts & top eaves beam
      { op: "box", min: [5, 5, 4], max: [5, 5, 13], color: TIMBER, mirrorX: true },
      { op: "box", min: [5, 18, 4], max: [5, 18, 13], color: TIMBER, mirrorX: true },
      { op: "paint", min: [5, 5, 12], max: [18, 18, 13], color: TIMBER },

      // Front teal doorway (+Y face) with warm wooden threshold
      { op: "box", min: [10, 18, 4], max: [13, 18, 10], color: DOOR },
      { op: "paint", min: [13, 18, 7], max: [13, 18, 7], color: GOLD },

      // Glowing amber windows on left, right, front-upper & back faces
      { op: "box", min: [5, 8, 7], max: [5, 10, 10], color: WINDOW_GLOW, emissive: true, mirrorX: true },
      { op: "box", min: [5, 13, 7], max: [5, 15, 10], color: WINDOW_GLOW, emissive: true, mirrorX: true },
      { op: "box", min: [9, 5, 7], max: [14, 5, 10], color: WINDOW_GLOW, emissive: true },
      // Crisp timber window sills & center mullions (1px detail test!)
      { op: "paint", min: [5, 7, 6], max: [5, 16, 6], color: TIMBER, mirrorX: true },
      { op: "paint", min: [11, 5, 7], max: [12, 5, 10], color: TIMBER },

      // Pitched gabled roof (steep diagonal slopes + crisp alternating shingle bands!)
      {
        op: "wedge",
        min: [3, 4, 13],
        max: [20, 19, 22],
        taperAxis: "+z",
        shrinkAxis: "x",
        minScale: 0.08,
        color: ROOF_MID,
      },
      { op: "paint", min: [3, 4, 13], max: [20, 19, 13], color: ROOF_DARK },
      { op: "paint", min: [3, 4, 15], max: [20, 19, 15], color: ROOF_DARK },
      { op: "paint", min: [3, 4, 17], max: [20, 19, 17], color: ROOF_DARK },
      { op: "paint", min: [3, 4, 19], max: [20, 19, 19], color: ROOF_DARK },
      { op: "paint", min: [3, 4, 21], max: [20, 19, 22], color: ROOF_LIGHT },
      // Cream gable end infill inside the pitched roof (+Y & -Y)
      {
        op: "wedge",
        min: [6, 5, 13],
        max: [17, 18, 20],
        taperAxis: "+z",
        shrinkAxis: "x",
        minScale: 0.1,
        color: WALL,
      },
      // Upper attic gable window (front +Y)
      { op: "box", min: [11, 18, 15], max: [12, 18, 17], color: WINDOW_GLOW, emissive: true },

      // Brick red chimney rising through the roof slope
      { op: "box", min: [14, 7, 15], max: [16, 9, 23], color: CHIMNEY },
      { op: "paint", min: [14, 7, 23], max: [16, 9, 23], color: CHIMNEY_TOP },

      // Thin 1px rooftop weathervane mast + golden vane (ultimate 1px anti-aliasing test!)
      { op: "box", min: [12, 12, 22], max: [12, 12, 27], color: METAL },
      { op: "box", min: [10, 12, 26], max: [14, 12, 26], color: GOLD },
      { op: "box", min: [12, 12, 27], max: [12, 12, 27], color: GOLD, emissive: true },
    ],
    sockets: {
      chimney: { pos: [15, 8, 24], dir: [0, 0, 1] },
      vane: { pos: [12, 12, 27.5], dir: [0, 0, 1] },
    },
  };
}
