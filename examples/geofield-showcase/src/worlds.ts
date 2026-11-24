/**
 * Non-Legoland Procedural World Assets built with @aastack/geofield (Blender Geometry Nodes
 * Fields + Exact Continuous R16F SDF + Triplanar Materials + Spline Lofts + Lathe Curves).
 *
 * ZERO legacy templates reused! Two completely original miniature worlds:
 *   World A: Sunken Bioluminescent Roman Rotunda & Volcanic Sea Cave + Brass Bathysphere
 *   World B: Sunlit Mediterranean Cliffside Arch, Stone Viaduct Bridge, Lookout Tower & Olive Trees
 */

import type { RGB, VolumeAsset } from "@aastack/core";
import {
  compileGeoVolume,
  fbm3,
  mix,
  opOnion,
  opPolarFold,
  ridge3,
  sampleCatmullRomSpline,
  sdArchY,
  sdBox,
  sdCappedConeZ,
  sdCapsule,
  sdCylinderX,
  sdCylinderY,
  sdCylinderZ,
  sdEllipsoid,
  sdLatheZ,
  sdPitchedRoofY,
  sdRoundBox,
  sdSplineLoft,
  sdTorus,
  smoothstep,
  voronoi3,
} from "@aastack/geofield";

export interface GeoParams {
  /** Erosion / natural weathering intensity (0..1). */
  weathering: number;
  /** Organic moss / ivy / bioluminescent drape coverage (0..1). */
  drape: number;
}

// ============================================================================
// WORLD A: SUNKEN BIOLUMINESCENT ROMAN ROTUNDA & VOLCANIC SEA CAVE
// ============================================================================

/**
 * 1. Sunken Circular Roman Rotunda (96x96x84 @ 0.26):
 *    - Stepped circular marble stylobate + 12-fold fluted colonnade with turned bases & capitals
 *    - 12 semicircular Roman arches carrying a continuous stone entablature cornice
 *    - Hollow coffered dome with open skylight oculus + organic ancient weathered fracture
 *    - Lush draped sea-moss + glowing bioluminescent central thermal brazier!
 */
export function createSunkenRomanRotunda(params: GeoParams): VolumeAsset {
  const W = 96, L = 96, H = 84;
  const cx = W * 0.5, cy = L * 0.5;
  const weath = params.weathering;
  const drape = params.drape;

  const MARBLE_HI: RGB = [214, 206, 192];
  const MARBLE_WARM: RGB = [184, 174, 156];
  const MARBLE_DARK: RGB = [118, 122, 128];
  const MOSS_DEEP: RGB = [28, 92, 68];
  const MOSS_HI: RGB = [52, 138, 92];
  const BRASS_GOLD: RGB = [208, 162, 74];
  const BIO_CYAN: RGB = [64, 242, 232];
  const BIO_AMBER: RGB = [255, 198, 84];

  const domeProfile: Array<[number, number]> = [
    [0, 50], [34, 50], [34, 53], [32, 55], [29, 63], [23, 71], [14, 77], [0, 79],
  ];

  return compileGeoVolume({
    id: "roman_rotunda",
    name: "Sunken Roman Rotunda",
    w: W, l: L, h: H,
    voxelScale: 0.26,
    pivot: [cx, cy, 0],
    sockets: {
      oculus: { pos: [cx, cy, 78] },
      brazier: { pos: [cx, cy, 22] },
    },
    evaluate: (x, y, z, out) => {
      const lx = x - cx;
      const ly = y - cy;
      const rad = Math.hypot(lx, ly);
      const ang = Math.atan2(ly, lx);
      const TAU = Math.PI * 2;
      const nWeath = fbm3(x * 0.08, y * 0.08, z * 0.08, 3);
      const erosion = nWeath * (0.32 + weath * 0.62);

      // 1. Stepped circular travertine stylobate rising out of the glowing lagoon!
      const dStep1 = sdCylinderZ(lx, ly, z - 3.0, 41.5, 3.0) + erosion * 0.28;
      const dStep2 = sdCylinderZ(lx, ly, z - 7.0, 37.5, 2.2) + erosion * 0.20;
      const dStep3 = sdCylinderZ(lx, ly, z - 10.5, 34.5, 1.8) + erosion * 0.16;
      const dPlinth = Math.min(dStep1, Math.min(dStep2, dStep3));
      out.union(dPlinth, MARBLE_WARM, "stone", 0, [(ang / TAU) * 24.0, z / 5.2]);

      // Sunken circular thermal wading pool carved inside the temple floor!
      const dPoolCut = sdCylinderZ(lx, ly, z - 11.5, 24.0, 3.2);
      out.subtract(dPoolCut, 0.45, MARBLE_DARK, "stone", 0, [(ang / TAU) * 16.0, z / 4.8]);

      // 2. 12-Fold Polar Fluted Marble Colonnade (classical turned bases, fluted shafts, flaring capitals!)
      const [fx, fy] = opPolarFold(lx, ly, 12);
      const colX = fx - 30.2;
      const colY = fy;
      const colAng = Math.atan2(colY, colX);
      const flute = Math.cos(colAng * 10.0) * 0.22;
      const dColShaft = sdCylinderZ(colX, colY, z - 28.0, 2.75 - flute, 15.8) + erosion * 0.12;
      const dColBase = sdTorus(colX, colY, z - 13.0, 2.95, 1.05, "z");
      const dColCap = sdCappedConeZ(colX, colY, z - 44.2, 2.7, 4.1, 1.6);
      const dColAbacus = sdRoundBox(colX, colY, z - 46.2, 3.9, 3.9, 1.0, 0.35);
      const dColumn = Math.min(Math.min(dColShaft, dColBase), Math.min(dColCap, dColAbacus));
      out.union(dColumn, MARBLE_HI, "stone", 0, [(colAng / TAU) * 3.0, z / 6.0]);

      // 3. Classical Ring Entablature + Arched Arcade Drum + Carved Cornice Ring!
      const dDrumOuter = sdCylinderZ(lx, ly, z - 49.5, 34.0, 4.8);
      const dDrumInner = sdCylinderZ(lx, ly, z - 49.5, 26.8, 6.2);
      let dDrum = Math.max(dDrumOuter, -dDrumInner) + erosion * 0.18;
      // Carve 12 sweeping arched niches between the columns right into the lower drum!
      const [ax, ay] = opPolarFold(
        lx * Math.cos(Math.PI / 12) - ly * Math.sin(Math.PI / 12),
        lx * Math.sin(Math.PI / 12) + ly * Math.cos(Math.PI / 12),
        12,
      );
      const dArcadeArch = sdArchY(ay, ax - 30.0, z - 36.0, 5.1, 6.0, 6.5, 0);
      dDrum = Math.max(dDrum, -dArcadeArch);
      const dCornice = sdTorus(lx, ly, z - 53.8, 33.8, 1.8, "z");
      const dFriezeBand = sdTorus(lx, ly, z - 46.8, 32.8, 1.0, "z");
      out.union(Math.min(dDrum, Math.min(dCornice, dFriezeBand)), MARBLE_HI, "stone", 0, [(ang / TAU) * 22.0, z / 4.6]);

      // 4. Hollow Coffered Roman Dome (sdLatheZ + opOnion shell + open oculus + ancient atmospheric breach!)
      const dDomeSolid = sdLatheZ(lx, ly, z, domeProfile);
      let dDomeShell = Math.max(opOnion(dDomeSolid, 2.3), 51.0 - z) + erosion * 0.20;
      // Open classical skylight oculus at dome apex!
      const dOculus = sdCylinderZ(lx, ly, z - 74.0, 9.8, 12.0);
      dDomeShell = Math.max(dDomeShell, -dOculus);
      // Dramatic asymmetric ancient breach on the front-right dome flank so camera peers inside the colonnade!
      const dBreach = sdEllipsoid(lx - 18.0, ly + 17.0, z - 66.0, 17.5, 16.5, 14.5) + nWeath * 3.6;
      dDomeShell = Math.max(dDomeShell, -dBreach);
      // Carved golden-bronze oculus rim ring!
      const dOculusRing = sdTorus(lx, ly, z - 76.6, 10.6, 1.15, "z");
      const domeArc = Math.hypot(rad - 34.0, z - 51.0);
      out.union(dDomeShell, MARBLE_WARM, "stone", 0, [(ang / TAU) * 18.0, domeArc / 5.2]);
      out.union(Math.max(dOculusRing, -dBreach), BRASS_GOLD, "metal", 0, [(ang / TAU) * 10.0, z / 3.0]);

      // 5. Central Sunken Marble Altar Pedestal + Glowing Bioluminescent Crystal Heart!
      const dAltar = sdLatheZ(lx, ly, z - 8.5, [
        [0, 0], [8.0, 0], [7.2, 2.2], [4.6, 4.5], [4.2, 10.5], [6.8, 12.2], [7.2, 13.8], [0, 13.8],
      ]);
      out.union(dAltar, MARBLE_HI, "stone", 0, [(ang / TAU) * 6.0, z / 4.0]);
      const dBrassBasin = sdTorus(lx, ly, z - 22.0, 5.4, 0.9, "z");
      out.union(dBrassBasin, BRASS_GOLD, "metal", 0);

      // Glowing faceted bioluminescent crystal cluster rising from the brass basin!
      const dCrys1 = sdCappedConeZ(lx, ly, z - 26.5, 2.6, 0.3, 5.4);
      const dCrys2 = sdCappedConeZ(lx - 2.3, ly + 1.4, z - 25.0, 1.6, 0.2, 3.8);
      const dCrys3 = sdCappedConeZ(lx + 1.9, ly - 2.1, z - 24.5, 1.5, 0.2, 3.4);
      out.union(dCrys1, BIO_AMBER, "bioFluid", 235);
      out.union(Math.min(dCrys2, dCrys3), BIO_CYAN, "bioFluid", 245);

      // 6. Context-Aware Organic Moss & Bioluminescent Lichen Drape (Blender Field Mask!)
      if (drape > 0.05 && out.d < 2.2) {
        const mossNoise = fbm3(x * 0.14 + 7.1, y * 0.14, z * 0.14, 3);
        const onTopRim = smoothstep(49.0, 62.0, z) * smoothstep(0.1 - drape * 0.45, 0.55, mossNoise);
        const nearWater = smoothstep(18.0, 7.0, z) * smoothstep(0.05 - drape * 0.4, 0.48, mossNoise);
        const mossMask = Math.min(1, (onTopRim * 0.9 + nearWater * 0.75) * drape);
        if (mossMask > 0.15) {
          out.paint(mossMask, mossNoise > 0.25 ? MOSS_HI : MOSS_DEEP, "foliage", 0);
        }
        // Subtle glowing cyan bioluminescent water-line mineral veins!
        if (z < 12.5 && rad > 22.0) {
          const v = voronoi3(x * 0.18, y * 0.18, z * 0.18);
          if (v.f1 < 0.26 && mossNoise > 0.15) {
            out.paint(0.85 * drape, BIO_CYAN, "bioFluid", 190);
          }
        }
      }
    },
  });
}

/**
 * 2. Sculpted Volcanic Basalt Sea Cave Arch & Cliffs (88x64x72 @ 0.34):
 *    - Sweeping organic volcanic natural stone arch built via sdSplineLoft + ridge3 basalt erosion
 *    - Mossy stepped ledges + glowing cyan/magenta mineral crystal crevices!
 */
export function createVolcanicCaveArch(params: GeoParams): VolumeAsset {
  const W = 88, L = 64, H = 72;
  const cx = W * 0.5, cy = L * 0.5;
  const archSamples = sampleCatmullRomSpline([
    { pos: [-35, 0, 2], radius: 13.5 },
    { pos: [-30, -3, 28], radius: 10.5 },
    { pos: [-14, -5, 52], radius: 8.8 },
    { pos: [6, -2, 57], radius: 8.2 },
    { pos: [26, 3, 44], radius: 9.8 },
    { pos: [35, 6, 4], radius: 14.5 },
  ], 7);

  const BASALT_DARK: RGB = [42, 48, 62];
  const BASALT_MID: RGB = [64, 72, 88];
  const MOSS_CAVE: RGB = [34, 108, 78];
  const VEIN_CYAN: RGB = [48, 232, 224];
  const VEIN_MAGENTA: RGB = [236, 78, 168];

  return compileGeoVolume({
    id: "volcanic_arch",
    name: "Volcanic Basalt Sea Arch",
    w: W, l: L, h: H,
    voxelScale: 0.34,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy;
      const rNoise = ridge3(x * 0.065, y * 0.065, z * 0.055, 3);
      const strata = Math.sin(z * 0.42 + fbm3(x * 0.06, y * 0.06, z * 0.06, 2) * 2.8) * 1.1;
      const disp = (rNoise - 0.5) * (3.2 + params.weathering * 2.8) + strata * 0.55;

      const dArch = sdSplineLoft(lx, ly, z, archSamples, 2.2) + disp;
      const dLeftPeak = sdCappedConeZ(lx + 32, ly + 4, z - 30, 15.5, 5.0, 30) + disp * 0.8;
      const dRightPeak = sdCappedConeZ(lx - 32, ly - 5, z - 24, 16.0, 6.2, 24) + disp * 0.8;
      // Hanging volcanic stalactites beneath the arch crown!
      const dStal1 = sdCappedConeZ(lx + 5, ly + 3, z - 44, 0.4, 2.8, 6.5);
      const dStal2 = sdCappedConeZ(lx - 10, ly + 2, z - 46, 0.3, 2.2, 5.5);

      out.union(dArch, rNoise > 0.56 ? BASALT_MID : BASALT_DARK, "matte", 0);
      out.smoothUnion(dLeftPeak, 4.5, BASALT_DARK, "matte", 0);
      out.smoothUnion(dRightPeak, 4.5, BASALT_MID, "matte", 0);
      out.smoothUnion(Math.min(dStal1, dStal2), 2.0, BASALT_MID, "matte", 0);

      if (out.d < 2.2) {
        const mF = fbm3(x * 0.11 + 3.1, y * 0.11, z * 0.11, 2);
        const mossM = smoothstep(32, 54, z) * smoothstep(0.05 - params.drape * 0.35, 0.45, mF) * params.drape;
        if (mossM > 0.2) out.paint(mossM, MOSS_CAVE, "foliage", 0);
        // Bioluminescent mineral seams glowing smoothly inside rock clefts!
        if (z > 4 && z < 34) {
          const v = voronoi3(x * 0.12, y * 0.12, z * 0.12);
          const veinT = smoothstep(0.56, 0.72, v.f1) * smoothstep(0.46, 0.28, rNoise);
          if (veinT > 0.12) {
            out.paint(veinT * 0.92, lx < 0 ? VEIN_CYAN : VEIN_MAGENTA, "bioFluid", Math.round(veinT * 225));
          }
        }
      }
    },
  });
}

/**
 * 3. Hero Articulated Steampunk Brass & Glass Bathysphere (48x58x46 @ 0.14):
 *    - Smooth revolved brushed-brass spherical pressure hull + equatorial riveted flange
 *    - Recessed glossy glass dome viewport with glowing amber cabin instruments inside
 *    - Curved hydrodynamic skids, top brass cupola hatch, dorsal fin, & nose searchlight housing!
 */
export function createBrassBathysphere(): VolumeAsset {
  const W = 48, L = 58, H = 46;
  const cx = W * 0.5, cy = L * 0.5, cz = H * 0.5 + 1;
  const BRASS_HI: RGB = [218, 172, 78];
  const BRASS_DARK: RGB = [132, 92, 42];
  const COPPER_PATINA: RGB = [68, 134, 122];
  const IRON_DARK: RGB = [42, 48, 60];
  const GLASS_GLOW: RGB = [255, 224, 136];
  const LAMP_CORE: RGB = [245, 252, 224];

  const skidL = sampleCatmullRomSpline([
    { pos: [-10, -14, -14], radius: 1.3 },
    { pos: [-10, 0, -16], radius: 1.4 },
    { pos: [-10, 14, -13], radius: 1.2 },
  ], 6);

  return compileGeoVolume({
    id: "bathysphere_hull",
    name: "Brass Deep-Sea Bathysphere",
    w: W, l: L, h: H,
    voxelScale: 0.14,
    pivot: [cx, cy, cz],
    sockets: {
      propeller: { pos: [cx, cy - 22.5, cz] },
      searchlight: { pos: [cx, cy + 19.5, cz - 7.5] },
    },
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy, lz = z - cz;
      const ax = Math.abs(lx);
      const TAU = Math.PI * 2;
      const hullU = (Math.atan2(lx, lz) / TAU) * 6.0;
      const hullV = (Math.atan2(ly - 1.5, Math.hypot(lx, lz)) / Math.PI) * 4.0;

      // Main brushed-brass pressure sphere + sleek tapered tail fairing (riveted spherical UVs!)
      const dSphere = sdEllipsoid(lx, ly - 1.5, lz, 14.5, 16.5, 14.2);
      const dTailCone = sdCylinderY(lx, ly + 12.5, lz, Math.max(2.5, 11.5 - Math.max(0, -ly - 4) * 0.52), 9.0);
      out.union(dSphere, BRASS_HI, "metal", 0, [hullU, hullV]);
      out.smoothUnion(dTailCone, 3.2, COPPER_PATINA, "metal", 0, [hullU, hullV]);

      // Equatorial riveted bronze belt & vertical spine strap
      const dBelt = sdTorus(lx, ly - 1.5, lz, 14.6, 1.35, "z");
      const dSpine = sdTorus(lx, ly - 1.5, lz, 14.5, 1.0, "x");
      out.union(Math.min(dBelt, dSpine), BRASS_DARK, "metal", 0);

      // Top cupola entry hatch & glass lantern dome
      const dCupola = sdCylinderZ(lx, ly - 1.0, lz - 14.2, 5.5, 3.0);
      const dHatchRim = sdTorus(lx, ly - 1.0, lz - 16.8, 5.5, 0.9, "z");
      out.union(Math.min(dCupola, dHatchRim), BRASS_DARK, "metal", 0);

      // Forward recessed brass bezel + warm glowing glossy observation viewport!
      const dPortBezel = sdTorus(lx, ly - 15.8, lz - 1.0, 6.8, 1.45, "y");
      const dPortGlass = sdEllipsoid(lx, ly - 15.6, lz - 1.0, 6.0, 3.8, 6.0);
      out.union(dPortBezel, BRASS_HI, "metal", 0);
      out.union(dPortGlass, GLASS_GLOW, "glass", 172);

      // Twin side portholes glowing softly amber!
      const dSideBezel = sdTorus(ax - 13.8, ly - 1.5, lz + 0.5, 3.6, 0.85, "x");
      const dSideGlass = sdEllipsoid(ax - 13.6, ly - 1.5, lz + 0.5, 2.0, 3.1, 3.1);
      out.union(dSideBezel, BRASS_DARK, "metal", 0);
      out.union(dSideGlass, GLASS_GLOW, "glass", 155);

      // Underslung bow searchlight projector housing + glowing lens!
      const dSpotBody = sdCylinderY(lx, ly - 16.0, lz + 7.5, 2.8, 3.4);
      const dSpotLens = sdEllipsoid(lx, ly - 19.2, lz + 7.5, 2.3, 1.2, 2.3);
      out.union(dSpotBody, IRON_DARK, "metal", 0);
      out.union(dSpotLens, LAMP_CORE, "glass", 252);

      // Curved twin dive skids & stern diving planes (mirrored via ax!)
      const dSkid = sdSplineLoft(-ax, ly, lz, skidL, 0.6);
      const dStrut1 = sdCapsule(-ax, ly, lz, -10, 6, -15, -8, 5, -9, 1.1, 1.1);
      const dStrut2 = sdCapsule(-ax, ly, lz, -10, -7, -15, -8, -6, -9, 1.1, 1.1);
      const dFinV = sdRoundBox(lx, ly + 17.5, lz, 0.9, 4.2, 8.5, 0.4);
      const dFinH = sdRoundBox(lx, ly + 17.5, lz, 8.2, 3.5, 0.9, 0.4);
      out.union(Math.min(Math.min(dSkid, dStrut1), dStrut2), IRON_DARK, "metal", 0);
      out.union(Math.min(dFinV, dFinH), BRASS_DARK, "metal", 0);
    },
  });
}

export function createBathyspherePropeller(): VolumeAsset {
  const W = 20, L = 12, H = 20;
  const cx = W * 0.5, cy = L * 0.5, cz = H * 0.5;
  const BRASS: RGB = [226, 182, 82];
  return compileGeoVolume({
    id: "bathysphere_prop",
    name: "Brass Propeller",
    w: W, l: L, h: H,
    voxelScale: 0.14,
    pivot: [cx, cy, cz],
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy, lz = z - cz;
      const dHub = sdCylinderY(lx, ly, lz, 2.2, 2.4);
      const [fx, fz] = opPolarFold(lx, lz, 4);
      const dBlade = sdEllipsoid(fx - 5.2, ly + fz * 0.25, fz, 4.2, 0.85, 1.85);
      out.union(Math.min(dHub, dBlade), BRASS, "metal", 0);
    },
  });
}

/**
 * 4. Organic Bioluminescent Antler Coral Cluster (38x38x34 @ 0.19):
 *    - Branching curved coral antlers via sdSplineLoft + smin organic forks
 *    - Soft glowing bioluminescent cyan or magenta polyp tips!
 */
export function createBioCoralCluster(id: string, tipCol: RGB, seed: number): VolumeAsset {
  const W = 38, L = 38, H = 34;
  const cx = W * 0.5, cy = L * 0.5;
  const b1 = sampleCatmullRomSpline([
    { pos: [0, 0, 2], radius: 3.4 }, { pos: [2, 1, 12], radius: 2.5 }, { pos: [6, 3, 24], radius: 1.5 }, { pos: [9, 5, 30], radius: 1.2 },
  ], 5);
  const b2 = sampleCatmullRomSpline([
    { pos: [0, 0, 3], radius: 3.0 }, { pos: [-4, 2, 13], radius: 2.2 }, { pos: [-9, 4, 23], radius: 1.4 }, { pos: [-11, 2, 28], radius: 1.1 },
  ], 5);
  const b3 = sampleCatmullRomSpline([
    { pos: [0, 0, 4], radius: 2.8 }, { pos: [1, -5, 13], radius: 2.0 }, { pos: [-2, -10, 22], radius: 1.3 },
  ], 5);
  const b4 = sampleCatmullRomSpline([
    { pos: [2, 1, 12], radius: 1.9 }, { pos: [8, -4, 19], radius: 1.3 }, { pos: [12, -7, 25], radius: 1.0 },
  ], 5);
  const STEM_COL: RGB = [52, 64, 86];
  const ROCK_COL: RGB = [46, 52, 66];

  return compileGeoVolume({
    id,
    name: "Bioluminescent Antler Coral",
    w: W, l: L, h: H,
    voxelScale: 0.19,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy;
      const dRock = sdEllipsoid(lx, ly, z - 2.0, 12.0, 11.0, 4.8) + fbm3(x * 0.16 + seed, y * 0.16, z * 0.16, 2) * 1.4;
      out.union(dRock, ROCK_COL, "stone", 0);

      let dCoral = sdSplineLoft(lx, ly, z, b1, 0.8);
      dCoral = Math.min(dCoral, sdSplineLoft(lx, ly, z, b2, 0.8));
      dCoral = Math.min(dCoral, sdSplineLoft(lx, ly, z, b3, 0.8));
      dCoral = Math.min(dCoral, sdSplineLoft(lx, ly, z, b4, 0.8));
      const tipGlow = smoothstep(14.0, 26.0, z);
      const col: RGB = [
        Math.round(mix(STEM_COL[0], tipCol[0], tipGlow)),
        Math.round(mix(STEM_COL[1], tipCol[1], tipGlow)),
        Math.round(mix(STEM_COL[2], tipCol[2], tipGlow)),
      ];
      out.smoothUnion(dCoral, 2.2, col, tipGlow > 0.45 ? "bioFluid" : "foliage", Math.round(tipGlow * 238));
    },
  });
}

// ============================================================================
// WORLD B: SUNLIT MEDITERRANEAN CLIFFSIDE ARCH & LANTERN BRIDGE (TINY GLADE TRIBUTE)
// ============================================================================

/**
 * 5. Sweeping Curved Stone Viaduct Arch Bridge (112x48x58 @ 0.26):
 *    - Smooth arched stone roadway with 3 carved semicircular arches + projecting keystone rings
 *    - Low rounded stone parapets, weathered ashlar stone triplanar relief, draped emerald coastal ivy
 *    - 4 wrought-iron warm dusk lanterns crowning the piers!
 */
export function createCoastalStoneViaduct(params: GeoParams): VolumeAsset {
  const W = 112, L = 48, H = 58;
  const cx = W * 0.5, cy = L * 0.5;
  const STONE_WARM: RGB = [212, 196, 168];
  const STONE_TRIM: RGB = [232, 220, 198];
  const STONE_SHADE: RGB = [156, 144, 126];
  const IVY_DARK: RGB = [44, 98, 52];
  const IVY_HI: RGB = [76, 134, 62];
  const IRON: RGB = [44, 48, 56];
  const LANTERN_GLOW: RGB = [255, 218, 122];

  return compileGeoVolume({
    id: "coastal_viaduct",
    name: "Curved Stone Viaduct Bridge",
    w: W, l: L, h: H,
    voxelScale: 0.26,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const lx = x - cx;
      // Gentle S-curve grace across the water channel (non-grid organic flow!)
      const curveY = Math.sin(lx * 0.045) * 4.5;
      const ly = (y - cy) - curveY;
      // Graceful arched camelback roadway silhouette!
      const nx = lx / 52.0;
      const deckTop = 27.0 + Math.max(0, 1.0 - nx * nx) * 11.5;
      const nW = fbm3(x * 0.11, y * 0.11, z * 0.11, 3);
      const weath = nW * (0.18 + params.weathering * 0.42);
      // Exact arc-length wrapped running-bond brick UVs along the S-curved stone bridge!
      const uBridge = (lx * 1.03 + (Math.abs(ly) < 7.8 ? ly * 0.0 : 0.0)) / 6.8;
      const vBridge = z / 4.2;

      // Main stone viaduct mass following the curved path
      const dBody = sdRoundBox(lx, ly, z - deckTop * 0.5, 53.0, 9.2, deckTop * 0.5, 0.55) + weath * 0.35;
      out.union(dBody, STONE_WARM, "stone", 0, [uBridge, vBridge]);

      // Raised low rounded stone parapet walls on both bridge edges + projecting cornice coping!
      const dParapetL = sdRoundBox(lx, ly - 7.8, z - (deckTop + 2.6), 52.5, 1.5, 3.0, 0.45);
      const dParapetR = sdRoundBox(lx, ly + 7.8, z - (deckTop + 2.6), 52.5, 1.5, 3.0, 0.45);
      const dStringCourse = sdRoundBox(lx, ly, z - (deckTop - 0.6), 53.2, 9.9, 1.0, 0.28);
      out.union(Math.min(Math.min(dParapetL, dParapetR), dStringCourse), STONE_TRIM, "stone", 0, [uBridge, vBridge]);

      // Projecting radial stone archivolt rings with TRUE RADIAL ARCH VOUSSOIR UVs on all 3 arches!
      const arches: Array<[number, number, number, number]> = [
        [0, 14.5, 15.0, 9.5],
        [-33.5, 10.5, 11.5, 7.5],
        [33.5, 10.5, 11.5, 7.5],
      ];
      let bestArchCut = 1e6;
      let archInnerUv: [number, number] = [uBridge, vBridge];
      for (const [ax0, ar, ah, voussoirPeriods] of arches) {
        const dx = lx - ax0;
        const dCut = sdArchY(dx, ly, z, ar, ah, 14.0, 0);
        const rad = Math.hypot(dx, z - ah);
        const theta = Math.atan2(Math.max(0, z - ah), dx);
        const uV = (theta / Math.PI) * voussoirPeriods;
        if (dCut < bestArchCut) {
          bestArchCut = dCut;
          archInnerUv = z >= ah - 0.8 ? [uV, ly / 5.2] : [ly / 5.2, z / 4.2];
        }
        // Raised sculpted Roman voussoir ring hugging the front & back bridge faces
        if (z >= ah - 0.8) {
          const ringRadial = Math.abs(rad - (ar + 1.45)) - 1.55;
          const ringDepth = Math.abs(ly) - 9.75;
          const dRing = Math.max(ringRadial, ringDepth);
          out.union(dRing, STONE_TRIM, "stone", 0, [uV, (rad - ar) / 6.2]);
        }
      }

      // Carve the 3 generous semicircular Roman stone arches cleanly through the viaduct!
      out.subtract(bestArchCut, 0.35, STONE_SHADE, "stone", 0, archInnerUv);

      // Carved stone buttress cutwaters anchoring both central bridge piers!
      for (const px of [-18.5, 18.5]) {
        const dButtress = sdCappedConeZ(lx - px, Math.abs(ly) - 9.0, z - 12.0, 4.4, 2.4, 12.5);
        const bAng = Math.atan2(Math.abs(ly) - 9.0, lx - px);
        out.smoothUnion(dButtress, 0.9, STONE_TRIM, "stone", 0, [(bAng / (Math.PI * 2)) * 4.0, z / 4.2]);
      }

      // 4 Wrought-iron glowing coastal bridge lanterns perched on the pier buttresses!
      for (const px of [-18.5, 18.5]) {
        for (const sgn of [-1, 1]) {
          const lz0 = 27.0 + Math.max(0, 1.0 - (px / 52.0) ** 2) * 11.5 + 5.2;
          const dPost = sdCylinderZ(lx - px, ly - sgn * 7.8, z - (lz0 + 4.2), 0.72, 4.5);
          const dCap = sdCappedConeZ(lx - px, ly - sgn * 7.8, z - (lz0 + 10.8), 2.1, 0.3, 1.3);
          const dBulb = sdEllipsoid(lx - px, ly - sgn * 7.8, z - (lz0 + 8.8), 1.55, 1.55, 2.0);
          out.union(Math.min(dPost, dCap), IRON, "metal", 0);
          out.union(dBulb, LANTERN_GLOW, "glass", 242);
        }
      }

      // Lush trailing Mediterranean ivy draping gracefully over the stone parapets and arches!
      if (params.drape > 0.05 && out.d < 2.2) {
        const ivyF = fbm3(x * 0.14 + 4.2, y * 0.14, z * 0.11, 3);
        const nearTop = smoothstep(14.0, 32.0, z) * smoothstep(0.18 - params.drape * 0.45, 0.56, ivyF);
        const ivyCluster = sdEllipsoid(lx + 18.5, ly - 9.4, z - 26.0, 5.2, 2.8, 7.5) + ivyF * 2.4;
        const ivyCluster2 = sdEllipsoid(lx - 18.5, ly + 9.4, z - 24.0, 5.5, 2.8, 6.8) + ivyF * 2.4;
        if (params.drape > 0.25) {
          out.smoothUnion(Math.min(ivyCluster, ivyCluster2) + (1.0 - params.drape) * 3.0, 1.6, ivyF > 0.1 ? IVY_HI : IVY_DARK, "foliage", 0);
        }
        if (nearTop > 0.25) {
          out.paint(nearTop * params.drape * 0.9, ivyF > 0.2 ? IVY_HI : IVY_DARK, "foliage", 0);
        }
      }
    },
  });
}

/**
 * 6. Coastal Round Lookout Tower & Sunlit Terracotta Cottage (Tiny Glade Fusion! 76x76x92 @ 0.24):
 *    - Smooth cylindrical limestone tower (sdLatheZ) + steep conical terracotta roof (ZERO Lego cone!)
 *    - Smoothly fused asymmetric cottage wing with razor-smooth 45-deg pitched roof (sdPitchedRoofY!)
 *    - Arched glowing honey-amber windows, timber entrance arch, curved chimney, & climbing ivy!
 */
export function createCoastalLookoutTower(params: GeoParams): VolumeAsset {
  const W = 76, L = 76, H = 92;
  const cx = W * 0.5, cy = L * 0.5;
  const STONE_CREAM: RGB = [226, 212, 186];
  const STONE_BASE: RGB = [184, 172, 152];
  const TERRA_HI: RGB = [194, 96, 62];
  const TERRA_DEEP: RGB = [156, 72, 48];
  const TIMBER: RGB = [112, 74, 48];
  const WIN_WARM: RGB = [252, 206, 118];
  const IVY: RGB = [56, 116, 56];
  const BRASS: RGB = [216, 174, 78];

  const towerProfile: Array<[number, number]> = [
    [0, 0], [16.5, 0], [15.0, 12], [13.6, 48], [15.4, 52], [15.4, 56], [0, 56],
  ];

  return compileGeoVolume({
    id: "coastal_tower",
    name: "Mediterranean Stone Tower & Cottage",
    w: W, l: L, h: H,
    voxelScale: 0.24,
    pivot: [cx, cy, 0],
    sockets: {
      chimney: { pos: [cx + 22, cy - 6, 49] },
      lantern: { pos: [cx - 8, cy + 16, 36] },
    },
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy;
      const TAU = Math.PI * 2;
      const nW = fbm3(x * 0.11, y * 0.11, z * 0.11, 3);
      const weath = nW * (0.12 + params.weathering * 0.32);

      // 1. Round limestone coastal tower (sdLatheZ + EXACT 360-deg wrapped cylindrical brick UVs!)
      const tx = lx + 9.0, ty = ly + 3.0;
      const tAng = Math.atan2(ty, tx);
      // 11 integer 2-brick periods = 22 crisp ashlar stones seamlessly wrapping 360 degrees!
      const towerUv: [number, number] = [(tAng / TAU) * 11.0, z / 4.4];
      const dTower = sdLatheZ(tx, ty, z, towerProfile) + weath * 0.25;
      const dCorbel = sdTorus(tx, ty, z - 51.5, 14.5, 1.4, "z");
      out.union(Math.min(dTower, dCorbel), z < 13 ? STONE_BASE : STONE_CREAM, "stone", 0, towerUv);

      // Smooth steep conical terracotta roof with RADIATING CONICAL BARREL-TILE UVs + brass finial!
      const dConeRoof = sdCappedConeZ(tx, ty, z - 70.5, 18.2, 0.7, 15.8);
      const dFinial = sdCylinderZ(tx, ty, z - 87.5, 0.7, 3.2);
      const dOrb = sdEllipsoid(tx, ty, z - 88.2, 1.5, 1.5, 1.5);
      // 14 integer 2-tile periods = 28 barrel tiles radiating cleanly from finial apex to eaves!
      out.union(dConeRoof, TERRA_HI, "terracotta", 0, [(tAng / TAU) * 14.0, (z - 54.5) / 5.4]);
      out.union(Math.min(dFinial, dOrb), BRASS, "metal", 0);

      // 2. Fused Asymmetric Stone Cottage Wing (tangent-aligned planar masonry UVs!)
      const wx = lx - 13.5, wy = ly - 2.0;
      const dWing = sdRoundBox(wx, wy, z - 15.0, 14.5, 12.5, 15.5, 0.65) + weath * 0.25;
      const wingU = Math.abs(wx) / 14.5 > Math.abs(wy) / 12.5 ? wy / 6.4 : wx / 6.4;
      out.smoothUnion(dWing, 1.6, STONE_CREAM, "stone", 0, [wingU, z / 4.4]);

      // Smooth 45-deg pitched terracotta cottage roof (slope-aligned barrel-tile UVs!)
      const dWingRoof = sdPitchedRoofY(wy, wx, z - 29.0, 15.2, 16.5, 14.5);
      const dRidgeBeam = sdCylinderX(wx, wy, z - 43.3, 1.15, 16.8);
      out.union(Math.min(dWingRoof, dRidgeBeam), TERRA_DEEP, "terracotta", 0, [wx / 4.4, (z - 29.0) / 3.8]);

      // Tall sculpted stone cottage chimney with terracotta pot!
      const dChim = sdRoundBox(lx - 22.0, ly + 6.0, z - 36.0, 2.6, 2.6, 12.0, 0.35);
      const dChimCap = sdCylinderZ(lx - 22.0, ly + 6.0, z - 48.5, 1.8, 1.4);
      const chimU = Math.abs(lx - 22.0) > Math.abs(ly + 6.0) ? (ly + 6.0) / 3.8 : (lx - 22.0) / 3.8;
      out.union(dChim, STONE_BASE, "stone", 0, [chimU, z / 3.4]);
      out.union(dChimCap, TERRA_HI, "terracotta", 0);

      // 3. Recessed Arched Glowing Windows + Timber Arched Cottage Door (cleanly clear of cottage roof!)
      const dWinTop1 = sdArchY(tx, ty + 13.0, z - 36.0, 2.8, 4.5, 4.8, 0.25);
      const dWinTop2 = sdArchY(ty, tx + 13.0, z - 36.0, 2.8, 4.5, 4.8, 0.25);
      const dWinMid = sdArchY(tx, ty + 13.0, z - 20.0, 2.5, 3.8, 4.8, 0);
      const dCotWin = sdArchY(wx - 4.0, wy + 12.0, z - 14.0, 3.8, 4.2, 4.6, 0);
      const dCotDoor = sdArchY(wx + 5.5, wy + 12.0, z - 1.5, 3.2, 8.2, 4.6, 0);
      out.subtract(Math.min(Math.min(dWinTop1, dWinTop2), Math.min(dWinMid, dCotWin)), 0.35, WIN_WARM, "glass", 145);
      out.subtract(dCotDoor, 0.35, TIMBER, "wood", 0);

      // Warm window panes set cleanly inside the carved arch recesses
      const dPane1 = sdBox(tx, ty + 11.2, z - 39.2, 2.6, 0.9, 4.4);
      const dPane2 = sdBox(tx, ty + 11.2, z - 22.8, 2.3, 0.9, 3.6);
      const dPane3 = sdBox(wx - 4.0, wy + 10.4, z - 17.5, 3.6, 0.9, 4.0);
      const dPane4 = sdBox(tx + 11.2, ty, z - 39.2, 0.9, 2.6, 4.4);
      out.union(Math.min(Math.min(dPane1, dPane2), Math.min(dPane3, dPane4)), WIN_WARM, "glass", 162);

      // Climbing Mediterranean coastal ivy hugging the warm limestone base!
      if (params.drape > 0.05 && out.d < 2.2) {
        const iv = fbm3(x * 0.14 + 9.2, y * 0.14, z * 0.12, 3);
        const m = smoothstep(34.0, 6.0, z) * smoothstep(0.14 - params.drape * 0.42, 0.52, iv) * params.drape;
        if (m > 0.22) out.paint(m, IVY, "foliage", 0);
      }
    },
  });
}

/**
 * 7. Sculpted Sunlit Mediterranean Limestone Cliff Bluff (80x68x54 @ 0.32):
 *    - Horizontal coastal strata + organic eroded ledges + lush emerald hilltop meadow cap!
 */
export function createCoastalLimestoneCliff(id: string, seed: number, params: GeoParams): VolumeAsset {
  const W = 80, L = 68, H = 54;
  const cx = W * 0.5, cy = L * 0.5;
  const LIME_HI: RGB = [214, 198, 168];
  const LIME_WARM: RGB = [178, 156, 128];
  const GRASS_HI: RGB = [98, 146, 68];
  const GRASS_DEEP: RGB = [62, 108, 52];

  return compileGeoVolume({
    id,
    name: "Mediterranean Limestone Cliff",
    w: W, l: L, h: H,
    voxelScale: 0.32,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy;
      const rN = ridge3(x * 0.065 + seed, y * 0.065, z * 0.06, 3);
      const fN = fbm3(x * 0.08 + seed * 2, y * 0.08, z * 0.08, 3);
      const strata = Math.sin(z * 0.55 + fN * 2.5) * 1.15;
      const disp = (rN - 0.45) * (3.2 + params.weathering * 2.4) + strata * 0.55;

      // Broad flat-topped terraced limestone headland so tower & trees sit naturally on top!
      const dCore = sdEllipsoid(lx, ly, z - 8.0, 32.0, 26.0, 22.0) + disp;
      const dShelf = sdCylinderZ(lx + 4.0, ly - 2.0, z - 12.0, 24.5, 13.0) + disp * 0.65;
      const dTopCut = z - (24.5 + fN * 1.6);
      const dCliff = Math.max(Math.min(dCore, dShelf), dTopCut);

      const col = rN > 0.52 ? LIME_HI : LIME_WARM;
      out.union(dCliff, col, "matte", 0);

      // Velvety sunlit Mediterranean meadow grass draped naturally across the flat cliff crown!
      if (out.d < 2.2) {
        const grassMask = smoothstep(20.5, 23.8, z - fN * 1.5);
        if (grassMask > 0.15) {
          out.paint(grassMask, fN > 0.05 ? GRASS_HI : GRASS_DEEP, "foliage", 0);
        }
      }
    },
  });
}

/**
 * 8. Organic Gnarled Mediterranean Olive Tree (52x52x54 @ 0.17):
 *    - Curved split trunk & gnarled limbs built from sdSplineLoft + smin (ZERO Lego cones!)
 *    - Painterly billowing silvery-sage canopy puffs with Dreams-inspired micro-flecks!
 */
export function createGnarledOliveTree(id: string, seed: number): VolumeAsset {
  const W = 52, L = 52, H = 54;
  const cx = W * 0.5, cy = L * 0.5;
  const trunk = sampleCatmullRomSpline([
    { pos: [0, 0, 0], radius: 4.2 },
    { pos: [1.5, -1.0, 10], radius: 3.0 },
    { pos: [-1.5, 1.5, 20], radius: 2.3 },
    { pos: [-5.5, 3.0, 29], radius: 1.5 },
  ], 5);
  const limbA = sampleCatmullRomSpline([
    { pos: [-1.0, 1.0, 18], radius: 2.1 },
    { pos: [5.5, -3.5, 26], radius: 1.5 },
    { pos: [11.0, -5.0, 32], radius: 1.1 },
  ], 4);
  const limbB = sampleCatmullRomSpline([
    { pos: [0.5, -0.5, 16], radius: 1.9 },
    { pos: [2.0, 7.5, 25], radius: 1.4 },
    { pos: [4.5, 11.5, 31], radius: 1.0 },
  ], 4);

  const BARK: RGB = [108, 86, 68];
  const LEAF_SAGE: RGB = [94, 134, 76];
  const LEAF_SUN: RGB = [132, 166, 92];
  const LEAF_DEEP: RGB = [58, 92, 54];

  const puffs: Array<[number, number, number, number, number, number]> = [
    [-7, 4, 34, 11.5, 10.5, 7.8],
    [11, -5, 36, 11.0, 10.0, 7.2],
    [4, 11, 35, 10.2, 9.8, 7.0],
    [0, 0, 41, 12.0, 11.0, 7.5],
    [-11, -5, 31, 8.5, 8.0, 6.0],
  ];

  return compileGeoVolume({
    id,
    name: "Gnarled Olive Tree",
    w: W, l: L, h: H,
    voxelScale: 0.17,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy;
      const n = fbm3(x * 0.16 + seed, y * 0.16, z * 0.16, 3);
      let dWood = sdSplineLoft(lx, ly, z, trunk, 1.0);
      dWood = Math.min(dWood, sdSplineLoft(lx, ly, z, limbA, 0.8));
      dWood = Math.min(dWood, sdSplineLoft(lx, ly, z, limbB, 0.8));
      out.union(dWood + n * 0.55, BARK, "wood", 0);

      let dCrown = 1e6;
      for (const [px, py, pz, rx, ry, rz] of puffs) {
        const dp = sdEllipsoid(lx - px, ly - py, z - pz, rx, ry, rz);
        dCrown = Math.min(dCrown, dp);
      }
      dCrown += n * 2.4;
      const leafCol = z > 37 ? LEAF_SUN : (n > 0.05 ? LEAF_SAGE : LEAF_DEEP);
      out.smoothUnion(dCrown, 1.8, leafCol, "foliage", 0);
    },
  });
}

/**
 * 9. Slender Wind-Sculpted Tuscan Cypress (30x30x72 @ 0.16):
 *    - Gently curving organic needle spire (ZERO straight geometric cone!)
 */
export function createTuscanCypress(id: string, seed: number): VolumeAsset {
  const W = 30, L = 30, H = 72;
  const cx = W * 0.5, cy = L * 0.5;
  const BARK: RGB = [96, 72, 54];
  const CYPRESS_DEEP: RGB = [38, 78, 52];
  const CYPRESS_HI: RGB = [62, 108, 66];

  return compileGeoVolume({
    id,
    name: "Tuscan Cypress",
    w: W, l: L, h: H,
    voxelScale: 0.16,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const bendX = Math.sin(z * 0.05 + seed) * 1.6;
      const bendY = Math.cos(z * 0.04 + seed * 1.7) * 1.1;
      const lx = x - cx - bendX, ly = y - cy - bendY;
      const dTrunk = sdCylinderZ(lx, ly, z - 8.0, 1.6, 8.5);
      out.union(dTrunk, BARK, "wood", 0);

      const u = Math.max(0, Math.min(1, (z - 9.0) / 58.0));
      const swayR = Math.sin(Math.pow(u, 0.72) * Math.PI) * 7.2 + 0.5;
      const n = fbm3(x * 0.22 + seed, y * 0.22, z * 0.18, 3);
      const dCanopy = sdCylinderZ(lx, ly, z - 38.0, swayR, 29.0) + n * 1.65;
      out.smoothUnion(dCanopy, 1.2, n > 0.1 ? CYPRESS_HI : CYPRESS_DEEP, "foliage", 0);
    },
  });
}

/**
 * 10. Curved Wooden Coastal Fishing Skiff (52x26x22 @ 0.15):
 *     - Hollow curved wooden boat hull (opOnion(sdEllipsoid)) + timber thwarts + glowing bow lantern!
 */
export function createCoastalSkiff(): VolumeAsset {
  const W = 52, L = 26, H = 22;
  const cx = W * 0.5, cy = L * 0.5;
  const HULL_CREAM: RGB = [232, 222, 202];
  const HULL_BLUE: RGB = [52, 118, 166];
  const OAK: RGB = [138, 92, 54];
  const LANTERN: RGB = [255, 222, 128];

  return compileGeoVolume({
    id: "coastal_skiff",
    name: "Mediterranean Wooden Skiff",
    w: W, l: L, h: H,
    voxelScale: 0.15,
    pivot: [cx, cy, 3],
    evaluate: (x, y, z, out) => {
      const lx = x - cx, ly = y - cy;
      // Sheer curve rising gently toward bow and stern!
      const sheer = (lx * lx) * 0.0085;
      const dOuter = sdEllipsoid(lx, ly, z - 9.5 - sheer * 0.4, 22.5, 9.6, 8.8);
      const dHull = Math.max(opOnion(dOuter, 1.35), z - (10.2 + sheer));
      const stripe = z > 7.4 + sheer * 0.6 ? HULL_BLUE : HULL_CREAM;
      out.union(dHull, stripe, "wood", 0);

      // Wooden rowing benches & mast stub
      const dBench1 = sdRoundBox(lx + 4.5, ly, z - 8.2, 2.0, 7.2, 0.7, 0.2);
      const dBench2 = sdRoundBox(lx - 6.5, ly, z - 8.2, 2.0, 6.4, 0.7, 0.2);
      const dMast = sdCylinderZ(lx - 11.5, ly, z - 12.5, 0.75, 6.5);
      out.union(Math.min(Math.min(dBench1, dBench2), dMast), OAK, "wood", 0);

      // Warm glowing bow fishing lantern
      const dLantern = sdEllipsoid(lx + 19.2, ly, z - 14.5, 1.4, 1.4, 1.8);
      out.union(dLantern, LANTERN, "glass", 240);
    },
  });
}

/** Tiny glowing particle sphere (bubbles / bioluminescent plankton / golden fireflies!) */
export function createGlowOrbAsset(id: string, col: RGB): VolumeAsset {
  return compileGeoVolume({
    id,
    name: id,
    w: 8, l: 8, h: 8,
    voxelScale: 0.048,
    pivot: [4, 4, 4],
    evaluate: (x, y, z, out) => {
      out.union(sdEllipsoid(x - 4, y - 4, z - 4, 2.2, 2.2, 2.2), col, "bioFluid", 238);
    },
  });
}

// ============================================================================
// WORLD C: ALPINE MULTIFRACTAL GORGE & STONE VIADUCT (SNOW-DUSTED CONIFERS)
// ============================================================================

/**
 * 11. Organic Snow-Dusted Alpine Mountain Spruce (40x40x74 @ 0.21):
 *     - Layered drooping conical spruce bough whorls using 7-fold polar symmetry + natural sway
 *     - Crisp sunlit alpine snow caps clinging naturally to the upper faces of each bough tier!
 */
export function createAlpineSpruceGeo(id: string, seed: number, snowAmt = 0.58): VolumeAsset {
  const W = 40, L = 40, H = 74;
  const cx = W * 0.5, cy = L * 0.5;
  const BARK: RGB = [86, 62, 46];
  const PINE_DEEP: RGB = [26, 62, 46];
  const PINE_MID: RGB = [42, 86, 58];
  const SNOW_WHITE: RGB = [234, 240, 248];

  const tiers: Array<[number, number, number]> = [
    [15, 15.0, 9.5],
    [25, 13.0, 9.0],
    [35, 11.0, 8.5],
    [45, 8.8, 8.0],
    [54, 6.4, 7.2],
    [63, 4.0, 6.5],
  ];

  return compileGeoVolume({
    id,
    name: "Snow-Dusted Alpine Spruce",
    w: W, l: L, h: H,
    voxelScale: 0.21,
    pivot: [cx, cy, 0],
    evaluate: (x, y, z, out) => {
      const swayX = Math.sin(z * 0.045 + seed) * 1.1;
      const swayY = Math.cos(z * 0.04 + seed * 1.3) * 0.9;
      const lx = x - cx - swayX;
      const ly = y - cy - swayY;
      const r = Math.hypot(lx, ly);

      // Sturdy tapering alpine spruce trunk
      const dTrunk = sdCappedConeZ(lx, ly, z - 24.0, 2.4, 0.5, 24.5);
      out.union(dTrunk, BARK, "wood", 0);

      // 6 tiered drooping spruce bough whorls with 7-fold star-bough lobing!
      const n = fbm3(x * 0.21 + seed, y * 0.21, z * 0.19, 3);
      let dFoliage = 1e6;
      let snowWeight = 0;
      for (let i = 0; i < tiers.length; i++) {
        const [tz, rad, th] = tiers[i];
        const rot = i * 0.55 + seed;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const rx = lx * cs - ly * sn;
        const ry = lx * sn + ly * cs;
        const [fx, fy] = opPolarFold(rx, ry, 7);
        const lobe = Math.cos(Math.atan2(fy, fx) * 7.0) * 0.18;
        const droop = Math.min(1.0, r / Math.max(rad, 1.0)) * 2.6;
        const dTier = sdCappedConeZ(lx, ly, z - tz + droop, rad * (1.0 + lobe), 0.75, th) + n * 1.15;
        if (dTier < dFoliage) {
          dFoliage = dTier;
          const topOfTier = smoothstep(tz - 1.2, tz + th * 0.55, z + droop * 0.65);
          snowWeight = topOfTier * smoothstep(0.15 - snowAmt * 0.55, 0.55, n + snowAmt * 0.45);
        }
      }

      const pineCol = n > 0.08 ? PINE_MID : PINE_DEEP;
      out.smoothUnion(dFoliage, 0.85, pineCol, "foliage", 0);
      if (snowAmt > 0.05 && out.d < 2.0 && snowWeight > 0.28) {
        out.paint(snowWeight * snowAmt, SNOW_WHITE, "matte", 0);
      }
    },
  });
}
