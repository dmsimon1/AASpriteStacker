/**
 * Procedural Voxel Assets for Airwolf Midnight Pixel City (@aastack/core).
 * Sculpted with exact voxel-level control:
 *  - 28-slice Airwolf Bell 222A fuselage (phantom black dorsal / pearl-white belly, twin sponsons,
 *    chain guns, glowing amber cockpit HUD, twin dorsal turbojets, crimson tail strobe, nose spotlight)
 *  - Independently articulated 2-blade Main Rotor & vertical Tail Rotor attached via semantic sockets
 *  - Hardware-instanced midnight city towers, rooftop H helipad HQ, neon hotel, coastal lighthouse,
 *    streetlamps, park trees, and cruising street cars
 */

import { createVolumeAsset, type RGB, type SocketDef, type VolumeAsset } from "@aastack/core";

function buildVoxelAsset(
  id: string,
  name: string,
  w: number,
  l: number,
  h: number,
  voxelScale: number,
  fill: (put: (x: number, y: number, z: number, rgb: RGB, emissive?: boolean) => void) => void,
  sockets: Record<string, SocketDef> = {},
  pivot?: [number, number, number],
): VolumeAsset {
  const rgba = new Uint8Array(w * l * h * 4);
  const emis = new Uint8Array(w * l * h);
  const put = (x: number, y: number, z: number, rgb: RGB, emissive = false) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);
    if (ix < 0 || ix >= w || iy < 0 || iy >= l || iz < 0 || iz >= h) return;
    const idx = iz * l * w + iy * w + ix;
    const p = idx * 4;
    rgba[p] = rgb[0];
    rgba[p + 1] = rgb[1];
    rgba[p + 2] = rgb[2];
    rgba[p + 3] = 255;
    if (emissive) emis[idx] = 255;
  };
  fill(put);
  return createVolumeAsset({
    id,
    name,
    w,
    l,
    h,
    voxelScale,
    pivot: pivot ?? [w * 0.5, l * 0.5, h * 0.5],
    rgba,
    emissiveMask: emis,
    sockets,
    computeSdf: false, // Crisp voxel-dda runs blazing fast without upfront 3D EDT on large grids
    provenance: { kind: "blueprint", source: "airwolf-city" },
  });
}

/**
 * Iconic 28-layer Airwolf (Bell 222A) Fuselage:
 *  - X = width (32), Y = length (58, nose = +Y), Z = height (28 slices!)
 *  - Phantom-black gloss upper hull + razor-sharp pearl-white sculpted lower belly
 *  - Twin aerodynamic side sponsons with chain guns + port/starboard nav beacons
 *  - Wrap-around smoked fighter canopy with glowing amber/emerald cockpit instrumentation
 *  - Twin dorsal turbojet intakes + glowing exhaust nozzles (jetL / jetR)
 *  - Slender swept tail boom + crimson strobe fin + chin nose searchlight turret
 */
export function createAirwolfFuselageAsset(): VolumeAsset {
  const W = 32, L = 58, H = 28;
  const cx = 15.5;

  const BLACK_DEEP: RGB = [32, 39, 54];
  const BLACK_MID: RGB = [52, 63, 86];
  const BLACK_SPEC: RGB = [96, 114, 146];
  const STEEL_DARK: RGB = [66, 76, 96];
  const STEEL_HI: RGB = [138, 154, 178];
  const PEARL_HI: RGB = [238, 243, 250];
  const PEARL_SHADE: RGB = [194, 204, 220];
  const GLASS_DARK: RGB = [26, 52, 96];
  const GLASS_SPEC: RGB = [126, 208, 255];
  const HUD_AMBER: RGB = [255, 204, 78];
  const HUD_CYAN: RGB = [88, 242, 214];
  const JET_GLOW: RGB = [255, 132, 42];
  const JET_CORE: RGB = [122, 232, 255];
  const NAV_RED: RGB = [255, 48, 58];
  const NAV_GREEN: RGB = [52, 255, 136];
  const SPOT_LENS: RGB = [255, 248, 208];

  return buildVoxelAsset(
    "airwolf_hull",
    "Airwolf Bell 222A (28 Slices)",
    W,
    L,
    H,
    0.26,
    (put) => {
      // 1. Sleek retractable landing gear doors / subtle lower belly skids (z = 0..2)
      for (let y = 26; y <= 41; y++) {
        put(11, y, 1, STEEL_DARK);
        put(20, y, 1, STEEL_DARK);
        if (y === 29 || y === 38) {
          put(11, y, 2, STEEL_HI);
          put(20, y, 2, STEEL_HI);
        }
      }

      // 2. Sculpted streamlined main fuselage (y = 24..55, z = 3..18)
      for (let y = 24; y <= 55; y++) {
        // Longitudinal profile: sleek pointed shark nose (+Y = 55) tapering aft to tail boom (y = 24)
        let halfW = 0;
        let zBot = 4;
        let zTop = 16;
        if (y >= 46) {
          // Pointed shark nose cone (y = 46..55)
          const u = (y - 46) / 9;
          halfW = Math.max(0.8, 5.2 * Math.pow(1 - u, 0.72));
          zBot = 4.2 + u * 2.8;
          zTop = 14.5 - u * 6.8;
        } else if (y >= 38) {
          // Forward cockpit cabin (y = 38..46)
          const u = (y - 38) / 8;
          halfW = 5.8 - u * 0.6;
          zBot = 3.2 + u * 1.0;
          zTop = 17.6 - u * 3.1;
        } else if (y >= 29) {
          // Wide mid-cabin + dorsal engine fairing (y = 29..38)
          const u = (y - 29) / 9;
          halfW = 5.4 + Math.sin(u * Math.PI) * 0.7;
          zBot = 3.2;
          zTop = 18.2;
        } else {
          // Taper into tail boom (y = 24..29)
          const u = (29 - y) / 5;
          halfW = 5.4 - u * 2.9;
          zBot = 3.4 + u * 4.6;
          zTop = 18.0 - u * 3.8;
        }

        const zMid = (zBot + zTop) * 0.5;
        const radZ = Math.max(1.2, (zTop - zBot) * 0.5);
        // Iconic Airwolf black/white split line sweeps low at nose and rises slightly aft
        const splitZ = zBot + (zTop - zBot) * (y > 42 ? 0.42 : 0.36);

        for (let z = Math.floor(zBot); z <= Math.ceil(zTop); z++) {
          const nz = (z - zMid) / radZ;
          if (Math.abs(nz) > 1.02) continue;
          const spanX = halfW * Math.sqrt(Math.max(0, 1 - nz * nz * 0.88));
          const xMin = Math.round(cx - spanX);
          const xMax = Math.round(cx + spanX);
          for (let x = xMin; x <= xMax; x++) {
            const dx = Math.abs(x - cx);
            const isOuter = dx >= spanX - 1.1 || z <= Math.floor(zBot) + 1 || z >= Math.ceil(zTop) - 1;

            // Wrap-around fighter cockpit windshield (y = 37..48, upper half)
            const inCanopy = y >= 37 && y <= 48 && z >= splitZ + 1.1 && z <= zTop - 0.5 && isOuter;
            const isCenterStrut = dx < 0.8 && y >= 41 && y <= 47;
            if (inCanopy && !isCenterStrut) {
              const isSideWin = y >= 37 && y <= 42 && dx > spanX - 1.5;
              const isFrontGlass = y >= 43 && y <= 48;
              if (isFrontGlass || isSideWin) {
                const hudGlow = (y === 44 || y === 45) && z === Math.round(splitZ + 2.2) && dx >= 1.2 && dx <= 3.2;
                const spec = y === 46 && z === Math.round(zTop - 1.5) && x < cx;
                if (hudGlow) put(x, y, z, dx < 2.2 ? HUD_AMBER : HUD_CYAN, true);
                else if (spec) put(x, y, z, GLASS_SPEC);
                else put(x, y, z, GLASS_DARK);
                continue;
              }
            }

            // Side passenger window slit (glowing subtle amber instrument glow)
            if (y >= 32 && y <= 35 && z >= 10 && z <= 12 && dx >= spanX - 1.1) {
              const isGlow = y === 33 && z === 11;
              put(x, y, z, isGlow ? HUD_AMBER : GLASS_DARK, isGlow);
              continue;
            }

            // Iconic Airwolf black-over-pearl-white livery
            if (z <= splitZ) {
              put(x, y, z, z <= zBot + 1.4 ? PEARL_SHADE : PEARL_HI);
            } else {
              const topRidge = z >= zTop - 1.2 && dx <= 2.2;
              const bevel = dx >= spanX - 1.3 && z >= splitZ + 0.5 && z <= splitZ + 1.8;
              put(x, y, z, topRidge ? BLACK_SPEC : bevel ? BLACK_MID : BLACK_DEEP);
            }
          }
        }
      }

      // 3. Chin nose searchlight turret (glowing warm lens!)
      for (let z = 5; z <= 7; z++) {
        for (let x = 14; x <= 17; x++) {
          put(x, 54, z, STEEL_DARK);
        }
      }
      put(15, 55, 6, SPOT_LENS, true);
      put(16, 55, 6, SPOT_LENS, true);
      put(15, 55, 7, SPOT_LENS, true);
      put(16, 55, 7, SPOT_LENS, true);

      // 4. Iconic Twin Airwolf Aerodynamic Side Sponsons (stub wings + chain guns + nav lights!)
      for (const sgn of [-1, 1]) {
        for (let lat = 5; lat <= 13; lat++) {
          const x = Math.round(cx + sgn * lat);
          const frac = (lat - 5) / 8; // 0 at root -> 1 at tip
          const y0 = Math.round(28 + frac * 4.5);
          const y1 = Math.round(41 - frac * 3.0);
          const zBot = Math.round(4 + frac * 1.2);
          const zTop = Math.round(9 - frac * 1.5);
          for (let y = y0; y <= y1; y++) {
            for (let z = zBot; z <= zTop; z++) {
              // Pearl-white sculpted belly sweep on sponson underside, phantom black on top!
              if (z <= zBot + 1) put(x, y, z, PEARL_HI);
              else if (z === zTop && lat < 11) put(x, y, z, BLACK_SPEC);
              else put(x, y, z, BLACK_DEEP);
            }
          }
          // Twin retractable chain guns & ADF cannon barrels protruding from sponson leading edge!
          if (lat === 8 || lat === 10) {
            for (let y = y1 + 1; y <= y1 + 5; y++) {
              put(x, y, zBot + 1, y === y1 + 5 ? STEEL_HI : STEEL_DARK);
            }
          }
        }
        // Wingtip glowing navigation beacons (Red port / Green starboard)
        const tipX = Math.round(cx + sgn * 14);
        put(tipX, 34, 6, sgn < 0 ? NAV_RED : NAV_GREEN, true);
        put(tipX, 35, 6, sgn < 0 ? NAV_RED : NAV_GREEN, true);
        put(tipX, 34, 7, BLACK_MID);
      }

      // 5. Twin Dorsal Supersonic Turbojet Engine Nacelles + Glowing Exhaust Nozzles (y = 25..37, z = 16..20)
      for (const sgn of [-1, 1]) {
        const nx = Math.round(cx + sgn * 3.0);
        for (let y = 25; y <= 37; y++) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let z = 16; z <= 20; z++) {
              if (z === 20 && Math.abs(dx) === 1) continue;
              if (y === 37 && dx === 0 && z >= 17 && z <= 19) {
                put(nx + dx, y, z, STEEL_DARK); // turbine air intake
              } else if (y === 25 && z >= 17 && z <= 19) {
                // Glowing supersonic afterburner exhaust ring!
                put(nx + dx, y, z, dx === 0 && z === 18 ? JET_CORE : JET_GLOW, true);
              } else {
                put(nx + dx, y, z, z === 20 ? BLACK_SPEC : BLACK_MID);
              }
            }
          }
        }
      }

      // 6. Slender Swept Tail Boom (y = 4..25)
      for (let y = 4; y <= 25; y++) {
        const u = (25 - y) / 21; // 0 at root -> 1 at tail tip
        const halfW = Math.max(1.0, 2.6 - u * 1.4);
        const zBot = 8.0 + u * 2.5;
        const zTop = 14.2 - u * 1.2;
        const splitZ = zBot + (zTop - zBot) * 0.34;
        for (let z = Math.floor(zBot); z <= Math.ceil(zTop); z++) {
          for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
            if (z <= splitZ) put(x, y, z, PEARL_HI);
            else put(x, y, z, z >= Math.ceil(zTop) - 1 ? BLACK_SPEC : BLACK_DEEP);
          }
        }
      }

      // 7. Swept Horizontal Tailplane Stabilizers (y = 10..15)
      for (const sgn of [-1, 1]) {
        for (let lat = 2; lat <= 7; lat++) {
          const x = Math.round(cx + sgn * lat);
          const sweep = Math.round((lat - 2) * 0.5);
          for (let y = 11 - sweep; y <= 15 - sweep; y++) {
            put(x, y, 11, BLACK_MID);
            put(x, y, 12, BLACK_SPEC);
          }
          // Vertical endplate winglets (Airwolf tail signature!)
          if (lat === 7) {
            for (let z = 10; z <= 14; z++) {
              put(x, 9, z, BLACK_DEEP);
              put(x, 10, z, BLACK_MID);
            }
          }
        }
      }

      // 8. Swept Dorsal Tail Fin + Ventral Skeg + Glowing Crimson Anti-Collision Strobe (y = 2..11, z = 7..25)
      for (let z = 12; z <= 24; z++) {
        const u = (z - 12) / 12;
        const y0 = Math.round(5 - u * 3.5);
        const y1 = Math.round(12 - u * 4.5);
        for (let y = y0; y <= y1; y++) {
          put(15, y, z, z > 20 ? BLACK_SPEC : BLACK_DEEP);
          put(16, y, z, z > 20 ? BLACK_SPEC : BLACK_DEEP);
        }
      }
      // Pearl-white ventral fin beneath tail
      for (let z = 7; z <= 10; z++) {
        for (let y = 5; y <= 9; y++) {
          put(15, y, z, PEARL_HI);
          put(16, y, z, PEARL_HI);
        }
      }
      // Glowing crimson tail strobe at top of fin!
      put(15, 3, 25, NAV_RED, true);
      put(16, 3, 25, NAV_RED, true);

      // 9. Titanium Main Rotor Mast rising to z = 27
      for (let z = 19; z <= 27; z++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (z >= 22 && (Math.abs(dx) + Math.abs(dy) > 1)) continue;
            put(15.5 + dx, 33 + dy, z, z >= 25 ? STEEL_HI : STEEL_DARK);
          }
        }
      }
    },
    {
      mainRotor: { pos: [15.5, 33.0, 27.2], dir: [0, 0, 1] },
      tailRotor: { pos: [13.2, 6.2, 13.5], dir: [-1, 0, 0] },
      searchlight: { pos: [15.5, 55.5, 6.0], dir: [0, 1, -0.35] },
      jetL: { pos: [12.5, 24.5, 18.0], dir: [0, -1, 0] },
      jetR: { pos: [18.5, 24.5, 18.0], dir: [0, -1, 0] },
    },
    [15.5, 33.0, 11.0],
  );
}

/** Sleek 2-blade Airwolf Main Rotor (1px slender tips prove zero-blink 8x RGSS AA!). */
export function createMainRotorAsset(): VolumeAsset {
  const W = 54, L = 54, H = 3;
  const cx = 26.5, cy = 26.5;
  const HUB: RGB = [96, 108, 128];
  const BLADE: RGB = [32, 38, 50];
  const EDGE: RGB = [74, 86, 106];
  const STRIPE: RGB = [242, 206, 66];
  const TIP_GLOW: RGB = [190, 224, 255];

  return buildVoxelAsset(
    "airwolf_main_rotor",
    "Airwolf Main Rotor",
    W,
    L,
    H,
    0.26,
    (put) => {
      // Titanium rotor hub
      for (let z = 0; z <= 2; z++) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (Math.hypot(dx, dy) <= (z === 2 ? 1.4 : 2.1)) put(cx + dx, cy + dy, z, HUB);
        }
      }
      // 2 long aerodynamic graphite blades (along X axis) with high-vis yellow stripes
      for (let x = 1; x < W - 1; x++) {
        const dist = Math.abs(x - cx);
        if (dist < 2.2) continue;
        const isStripe = dist >= 20 && dist <= 22.5;
        const isTip = dist >= 24.5;
        put(x, cy, 1, isTip ? TIP_GLOW : isStripe ? STRIPE : BLADE, isTip);
        if (dist < 23) put(x, cy - 1, 1, isStripe ? STRIPE : EDGE);
      }
    },
    {},
    [cx, cy, 1.0],
  );
}

/** Vertical 2-blade Tail Rotor spinning around local X axis. */
export function createTailRotorAsset(): VolumeAsset {
  const W = 3, L = 14, H = 14;
  const cy = 6.5, cz = 6.5;
  const HUB: RGB = [104, 118, 138];
  const BLADE: RGB = [42, 48, 62];
  const TIP: RGB = [255, 86, 76];

  return buildVoxelAsset(
    "airwolf_tail_rotor",
    "Airwolf Tail Rotor",
    W,
    L,
    H,
    0.26,
    (put) => {
      put(1, cy, cz, HUB);
      put(2, cy, cz, HUB);
      for (let z = 0; z < H; z++) {
        const d = Math.abs(z - cz);
        if (d < 1.2) continue;
        put(1, cy, z, d > 4.5 ? TIP : BLADE, d > 5.2);
      }
    },
    {},
    [1.0, cy, cz],
  );
}

/** Tiny 1x1x1 transparent proxy asset used purely to pass live spotlight target into CITY_GROUND_FS via uShadowCasters. */
export function createLightProxyAsset(): VolumeAsset {
  return createVolumeAsset({
    id: "light_proxy",
    name: "Searchlight Ground Target",
    w: 2,
    l: 2,
    h: 2,
    voxelScale: 1.0,
    pivot: [1, 1, 1],
    rgba: new Uint8Array(2 * 2 * 2 * 4), // fully transparent!
    computeSdf: false,
    provenance: { kind: "blueprint", source: "airwolf-city" },
  });
}

/** Skyscraper with glowing golden/cyan pixel windows, rooftop parapet, AC unit, and 1px red aviation beacon spire. */
export function createTowerAsset(id: string, w: number, l: number, h: number, seed: number, style: "office" | "brick" | "neon"): VolumeAsset {
  const hash = (a: number, b: number, c: number) => {
    let n = (a * 374761393 + b * 668265263 + c * 2147483647 + seed * 1597334677) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) & 255;
  };
  const wallBase: RGB = style === "brick" ? [78, 56, 62] : style === "neon" ? [38, 46, 72] : [48, 58, 80];
  const wallTrim: RGB = style === "brick" ? [102, 76, 80] : style === "neon" ? [58, 70, 104] : [72, 86, 114];
  const roofCol: RGB = [52, 60, 76];
  const winWarm: RGB = [255, 224, 134];
  const winAmber: RGB = [255, 178, 86];
  const winCyan: RGB = [116, 232, 255];
  const winOff: RGB = [20, 26, 42];
  const neonPink: RGB = [255, 68, 178];
  const neonCyan: RGB = [64, 238, 255];

  return buildVoxelAsset(
    id,
    id,
    w,
    l,
    h + 7,
    0.62,
    (put) => {
      for (let z = 0; z < h; z++) {
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const edge = x === 0 || x === w - 1 || y === 0 || y === l - 1;
          if (!edge && z < h - 1) continue;
          if (z === h - 1) {
            put(x, y, z, edge ? wallTrim : roofCol);
            continue;
          }
          const corner = (x === 0 || x === w - 1) && (y === 0 || y === l - 1);
          const isFloorBand = z <= 1 || z % 3 === 0;
          if (corner || isFloorBand) {
            put(x, y, z, z === 0 ? [34, 40, 54] : wallTrim);
          } else {
            const winCol = (x === 0 || x === w - 1) ? (y % 2 === 1) : (x % 2 === 1);
            if (winCol) {
              const r = hash(x, y, Math.floor(z / 3));
              if (r > 135) {
                const col = r > 225 ? winCyan : r > 180 ? winWarm : winAmber;
                put(x, y, z, col, true);
              } else {
                put(x, y, z, winOff);
              }
            } else {
              put(x, y, z, wallBase);
            }
          }
        }
      }
      // Rooftop parapet rim + AC penthouse box
      for (let x = 0; x < w; x++) { put(x, 0, h, wallTrim); put(x, l - 1, h, wallTrim); }
      for (let y = 0; y < l; y++) { put(0, y, h, wallTrim); put(w - 1, y, h, wallTrim); }
      for (let z = h; z < h + 3; z++) {
        for (let y = 2; y <= 5; y++) for (let x = 2; x <= 5; x++) {
          if (x < w - 2 && y < l - 2) put(x, y, z, z === h + 2 ? [94, 106, 128] : [64, 74, 92]);
        }
      }
      // Neon sign bar on neon downtown block
      if (style === "neon") {
        for (let x = 2; x < w - 2; x++) {
          put(x, l - 1, h + 1, (x & 1) === 0 ? neonPink : neonCyan, true);
          put(x, l - 1, h + 2, neonPink, true);
        }
      }
      // 1px slender rooftop radio antenna + glowing crimson aviation warning strobe!
      if (h >= 24) {
        const ax = w - 4, ay = l - 4;
        for (let z = h; z < h + 6; z++) put(ax, ay, z, [112, 124, 146]);
        put(ax, ay, h + 6, [255, 48, 58], true);
      }
    },
    {},
    [w * 0.5, l * 0.5, 0],
  );
}

/** Corporate HQ Tower with glowing rooftop H Helipad where Airwolf can take off and land! */
export function createHelipadTowerAsset(): VolumeAsset {
  const w = 22, l = 22, h = 22;
  const WALL: RGB = [46, 56, 78];
  const TRIM: RGB = [86, 100, 126];
  const PAD: RGB = [62, 70, 86];
  const GOLD: RGB = [255, 212, 74];
  const CYAN: RGB = [76, 236, 255];

  return buildVoxelAsset(
    "tower_helipad",
    "Airwolf HQ Helipad Tower",
    w,
    l,
    h + 2,
    0.62,
    (put) => {
      for (let z = 0; z < h; z++) {
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const edge = x === 0 || x === w - 1 || y === 0 || y === l - 1;
          if (!edge && z < h - 1) continue;
          if (z === h - 1) {
            const dx = x - (w - 1) * 0.5;
            const dy = y - (l - 1) * 0.5;
            const d = Math.hypot(dx, dy);
            const inRing = Math.abs(d - 7.5) < 0.85;
            const inH = (Math.abs(dx) >= 2.2 && Math.abs(dx) <= 3.6 && Math.abs(dy) <= 4.2) || (Math.abs(dy) <= 0.85 && Math.abs(dx) <= 3.6);
            if (inRing || inH) put(x, y, z, GOLD, true);
            else if (edge) put(x, y, z, TRIM);
            else put(x, y, z, PAD);
            continue;
          }
          const glassBand = z >= 3 && z % 3 !== 0 && !((x <= 1 || x >= w - 2) && (y <= 1 || y >= l - 2));
          if (glassBand) {
            const lit = ((x + y + z * 3) % 5) < 2;
            put(x, y, z, lit ? [126, 224, 255] : [22, 32, 54], lit);
          } else {
            put(x, y, z, z % 3 === 0 ? TRIM : WALL);
          }
        }
      }
      // 4 glowing cyan corner helipad approach beacons
      for (const [bx, by] of [[1, 1], [w - 2, 1], [1, l - 2], [w - 2, l - 2]]) {
        put(bx, by, h, CYAN, true);
      }
    },
    { pad: { pos: [w * 0.5, l * 0.5, h] } },
    [w * 0.5, l * 0.5, 0],
  );
}

/** Iconic Red-and-White Coastal Lighthouse at the end of the harbor pier! */
export function createLighthouseAsset(): VolumeAsset {
  const w = 16, l = 16, h = 32;
  const cx = 7.5, cy = 7.5;
  return buildVoxelAsset(
    "coastal_lighthouse",
    "Coastal Lighthouse",
    w,
    l,
    h,
    0.58,
    (put) => {
      // Rocky stone pier foundation
      for (let z = 0; z < 4; z++) {
        const r = 6.6 - z * 0.45;
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          if (Math.hypot(x - cx, y - cy) <= r) put(x, y, z, [98 + z * 8, 106 + z * 8, 122 + z * 8]);
        }
      }
      // Tapered red & white striped lighthouse shaft
      for (let z = 4; z < 23; z++) {
        const r = 4.6 - (z - 4) * 0.095;
        const isRed = Math.floor((z - 4) / 4) % 2 === 1;
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r) {
            const win = (z === 13 || z === 14) && y > cy + r - 1.3 && Math.abs(x - cx) <= 0.8;
            if (win) put(x, y, z, [255, 224, 128], true);
            else put(x, y, z, isRed ? [216, 48, 52] : [238, 236, 228]);
          }
        }
      }
      // Gallery deck + 1px iron railing posts
      for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 4.1) put(x, y, 23, [46, 54, 72]);
        if (d >= 3.2 && d <= 4.1 && ((x + y) & 1) === 0) put(x, y, 24, [72, 84, 106]);
      }
      // Bright glowing 360-degree beacon room
      for (let z = 24; z <= 27; z++) for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 2.4) {
          const frame = d > 1.7 && (Math.abs(x - cx) < 0.6 || Math.abs(y - cy) < 0.6);
          put(x, y, z, frame ? [44, 52, 68] : [255, 242, 168], !frame);
        }
      }
      // Domed slate cap & spire
      for (let z = 28; z <= 31; z++) {
        const r = Math.max(0.55, 2.7 - (z - 28) * 0.72);
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          if (Math.hypot(x - cx, y - cy) <= r) put(x, y, z, [52, 62, 84]);
        }
      }
    },
    { beacon: { pos: [cx, cy, 26] } },
    [cx, cy, 0],
  );
}

/** Slender 1px midnight streetlamp with glowing warm globe. */
export function createStreetLampAsset(): VolumeAsset {
  return buildVoxelAsset(
    "street_lamp",
    "Street Lamp",
    5,
    5,
    12,
    0.45,
    (put) => {
      put(2, 2, 0, [68, 78, 96]);
      put(2, 2, 1, [68, 78, 96]);
      for (let z = 2; z <= 9; z++) put(2, 2, z, [54, 64, 82]);
      put(2, 2, 10, [255, 224, 134], true);
      put(2, 3, 10, [255, 224, 134], true);
      put(2, 2, 11, [44, 52, 68]);
    },
    {},
    [2.5, 2.5, 0],
  );
}

/** Stylized park pine tree for the city central plaza. */
export function createParkTreeAsset(): VolumeAsset {
  const W = 10, L = 10, H = 14;
  return buildVoxelAsset(
    "park_tree",
    "Park Tree",
    W,
    L,
    H,
    0.55,
    (put) => {
      for (let z = 0; z < 4; z++) { put(4, 4, z, [92, 62, 44]); put(5, 4, z, [92, 62, 44]); put(4, 5, z, [92, 62, 44]); put(5, 5, z, [92, 62, 44]); }
      for (let z = 3; z < H; z++) {
        const r = Math.max(0.7, (H - z) * 0.42);
        for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          if (Math.hypot(x - 4.5, y - 4.5) <= r) {
            const hi = ((x + y + z) & 1) === 0;
            put(x, y, z, hi ? [48, 128, 76] : [32, 92, 68]);
          }
        }
      }
    },
    {},
    [5, 5, 0],
  );
}

/** Tiny midnight cruising street car with glowing headlights and red taillights. */
export function createCityCarAsset(id: string, bodyColor: RGB): VolumeAsset {
  return buildVoxelAsset(
    id,
    "City Car",
    6,
    11,
    5,
    0.34,
    (put) => {
      for (let y = 1; y <= 9; y++) for (let x = 1; x <= 4; x++) {
        put(x, y, 1, bodyColor);
        put(x, y, 2, bodyColor);
      }
      for (let y = 3; y <= 7; y++) for (let x = 1; x <= 4; x++) {
        put(x, y, 3, (y === 3 || y === 7) ? [42, 68, 108] : bodyColor);
      }
      // Wheels
      for (const [wx, wy] of [[1, 2], [4, 2], [1, 8], [4, 8]]) put(wx, wy, 0, [26, 28, 36]);
      // Glowing headlights (+Y) and red taillights (-Y)
      put(1, 10, 1, [255, 246, 186], true);
      put(4, 10, 1, [255, 246, 186], true);
      put(1, 0, 1, [255, 48, 62], true);
      put(4, 0, 1, [255, 48, 62], true);
    },
    {},
    [3, 5.5, 0],
  );
}
