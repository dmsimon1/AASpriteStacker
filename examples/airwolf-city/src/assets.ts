/**
 * Dual-Resolution (Classic 1x / HD 2x) Procedural Voxel Assets for Airwolf Midnight Pixel City.
 * Every landmark is sculpted with genuine miniature-diorama architectural detail:
 *  - Airwolf (Bell 222A): 28-slice Classic OR 56-slice HD (64x116x56) with 1px nose pitot probe,
 *    recessed fighter canopy mullions + glowing HUD screens, curved pearl-white/phantom-black livery
 *    with silver trim pinstripe, quad sponson chain guns, dorsal turbojet nacelles + intake grilles,
 *    swept tailplane winglets, titanium rotor swashplate, and high-res articulated rotors.
 *  - City Architecture: Art Deco setback skyscrapers with spires & cornices, glass curtain towers with
 *    rooftop water tanks, brick lofts with 1px fire escapes & striped street awnings, neon rooftop
 *    truss billboards, Airwolf HQ Helipad tower with safety rails & radar cupola, rocky Coastal
 *    Lighthouse + warm-lit Keeper's Cottage, moored harbor tugboat & yacht, taxis, and police cruisers.
 */

import { createVolumeAsset, type RGB, type SocketDef, type VolumeAsset } from "@aastack/core";

export type DetailLevel = "classic" | "hd";

function buildVoxelAsset(
  id: string,
  name: string,
  w: number,
  l: number,
  h: number,
  voxelScale: number,
  fill: (put: (x: number, y: number, z: number, rgb: RGB, emissive?: boolean | number) => void) => void,
  sockets: Record<string, SocketDef> = {},
  pivot?: [number, number, number],
): VolumeAsset {
  const rgba = new Uint8Array(w * l * h * 4);
  const emis = new Uint8Array(w * l * h);
  const put = (x: number, y: number, z: number, rgb: RGB, emissive: boolean | number = false) => {
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
    emis[idx] = typeof emissive === "number" ? Math.max(0, Math.min(255, Math.round(emissive))) : (emissive ? 255 : 0);
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
    explicitEmissive: emis,
    sockets,
    computeSdf: false,
    provenance: { kind: "blueprint", source: "airwolf-city-hd" },
  });
}

function hash3(a: number, b: number, c: number, seed: number): number {
  let n = (a * 374761393 + b * 668265263 + c * 2147483647 + seed * 1597334677) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) & 255;
}

/**
 * Iconic Airwolf (Bell 222A) Fuselage:
 *  - classic: 32x58x28 @ voxelScale 0.26 (28 slices)
 *  - hd:      64x116x56 @ voxelScale 0.13 (56 slices, 2x micro-detail!)
 */
export function createAirwolfFuselageAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 32 * m;
  const L = 58 * m;
  const H = 28 * m;
  const cx = (W - 1) * 0.5;
  const vs = 0.26 / m;

  const BLACK_DEEP: RGB = [28, 34, 48];
  const BLACK_PANEL: RGB = [38, 46, 64];
  const BLACK_MID: RGB = [52, 64, 88];
  const BLACK_SPEC: RGB = [98, 118, 152];
  const SILVER_TRIM: RGB = [164, 178, 202];
  const STEEL_DARK: RGB = [58, 68, 86];
  const STEEL_HI: RGB = [138, 154, 178];
  const PEARL_HI: RGB = [242, 246, 252];
  const PEARL_SHADE: RGB = [190, 202, 220];
  const GLASS_DARK: RGB = [20, 44, 86];
  const GLASS_MID: RGB = [38, 82, 138];
  const GLASS_SPEC: RGB = [148, 220, 255];
  const HUD_AMBER: RGB = [255, 204, 74];
  const HUD_CYAN: RGB = [82, 246, 222];
  const HUD_GREEN: RGB = [88, 255, 138];
  const JET_GLOW: RGB = [255, 132, 42];
  const JET_CORE: RGB = [138, 236, 255];
  const NAV_RED: RGB = [255, 48, 60];
  const NAV_GREEN: RGB = [52, 255, 142];
  const SPOT_LENS: RGB = [255, 250, 214];

  return buildVoxelAsset(
    "airwolf_hull",
    detail === "hd" ? "Airwolf Bell 222A (HD 56-Slice)" : "Airwolf Bell 222A (28-Slice)",
    W,
    L,
    H,
    vs,
    (put) => {
      // 1. Sleek retractable undercarriage skids & belly keel fairing (z = 1..2.5*m)
      for (let y = 26 * m; y <= 41 * m; y++) {
        for (const sgn of [-1, 1]) {
          const sx = cx + sgn * 4.5 * m;
          put(sx, y, 1 * m, STEEL_DARK);
          if (m === 2) put(sx, y, 1 * m + 1, STEEL_DARK);
          if (Math.abs(y - 29 * m) < m || Math.abs(y - 38 * m) < m) {
            for (let z = 1 * m; z <= 3 * m; z++) put(sx, y, z, STEEL_HI);
          }
        }
      }

      // 2. Sculpted streamlined Bell 222A main fuselage (y = 24*m..55*m)
      for (let y = 24 * m; y <= 55 * m; y++) {
        const yn = y / m; // continuous classic-space longitudinal coordinate
        let halfW = 0;
        let zBot = 4;
        let zTop = 16;
        if (yn >= 46) {
          // Razor-sleek aerodynamic shark nose cone
          const u = (yn - 46) / 9;
          halfW = Math.max(0.65, 5.25 * Math.pow(1 - u, 0.72));
          zBot = 4.0 + u * 3.1;
          zTop = 14.6 - u * 6.9;
        } else if (yn >= 38) {
          // Forward fighter cockpit cabin with curved windscreen rake
          const u = (yn - 38) / 8;
          halfW = 5.85 - u * 0.6;
          zBot = 3.1 + u * 0.9;
          zTop = 17.8 - u * 3.2;
        } else if (yn >= 29) {
          // Muscular mid-cabin & dorsal transmission fairing
          const u = (yn - 29) / 9;
          halfW = 5.45 + Math.sin(u * Math.PI) * 0.72;
          zBot = 3.1;
          zTop = 18.4;
        } else {
          // Smooth taper into tail boom
          const u = (29 - yn) / 5;
          halfW = 5.45 - u * 2.95;
          zBot = 3.3 + u * 4.7;
          zTop = 18.2 - u * 4.0;
        }

        const zMid = (zBot + zTop) * 0.5;
        const radZ = Math.max(1.1, (zTop - zBot) * 0.5);
        // Swept Airwolf black/pearl-white livery boundary
        const splitZn = zBot + (zTop - zBot) * (yn > 42 ? 0.43 : 0.36) + Math.sin((yn - 34) * 0.14) * 0.25;

        const zMin = Math.floor(zBot * m);
        const zMax = Math.ceil(zTop * m);
        for (let z = zMin; z <= zMax; z++) {
          const zn = z / m;
          const nz = (zn - zMid) / radZ;
          if (Math.abs(nz) > 1.02) continue;
          const spanX = halfW * m * Math.sqrt(Math.max(0, 1 - nz * nz * 0.86));
          const xMin = Math.round(cx - spanX);
          const xMax = Math.round(cx + spanX);

          for (let x = xMin; x <= xMax; x++) {
            const dx = Math.abs(x - cx);
            const dxn = dx / m;
            const isShell = dx >= spanX - 1.15 * m || z <= zMin + m || z >= zMax - m;
            if (!isShell && m === 2) {
              // Keep interior solid enough for crisp sliceClip exploded view!
              const innerFill = ((x + y) & 1) === 0;
              if (!innerFill) continue;
              put(x, y, z, zn <= splitZn ? PEARL_SHADE : BLACK_DEEP);
              continue;
            }

            // Wrap-around fighter cockpit canopy with thin mullions & glowing multi-color HUD
            const inCanopy = yn >= 37.2 && yn <= 48.2 && zn >= splitZn + 1.0 && zn <= zTop - 0.55 && isShell;
            const isCenterMullion = dxn < (m === 2 ? 0.38 : 0.72) && yn >= 41.2 && yn <= 47.6;
            const isSidePillar = Math.abs(yn - 42.3) < (m === 2 ? 0.38 : 0.55);
            if (inCanopy && !isCenterMullion && !isSidePillar) {
              const isSideGlass = yn >= 37.2 && yn < 42.3 && dxn > (spanX / m) - 1.35;
              const isFrontGlass = yn >= 42.3 && yn <= 48.2;
              if (isFrontGlass || isSideGlass) {
                const hudBand = yn >= 43.8 && yn <= 45.2 && Math.abs(zn - (splitZn + 2.0)) < 0.75 && dxn >= 0.8 && dxn <= 3.3;
                const specStreak = Math.abs(yn - 46.2) < 0.65 && Math.abs(zn - (zTop - 1.45)) < 0.7 && x < cx;
                const lowerTint = zn < splitZn + 1.65;
                if (hudBand) {
                  put(x, y, z, dxn < 1.6 ? HUD_AMBER : dxn < 2.5 ? HUD_CYAN : HUD_GREEN, true);
                } else if (specStreak) {
                  put(x, y, z, GLASS_SPEC);
                } else {
                  put(x, y, z, lowerTint ? GLASS_DARK : GLASS_MID);
                }
                continue;
              }
            }

            // Cabin tinted side window with subtle warm interior console glow
            if (yn >= 31.8 && yn <= 35.6 && zn >= 9.6 && zn <= 12.6 && dx >= spanX - 1.15 * m) {
              const isGlow = yn >= 33.0 && yn <= 34.0 && zn >= 10.6 && zn <= 11.4;
              const isFrame = yn < 32.3 || yn > 35.1 || zn < 10.1 || zn > 12.1;
              put(x, y, z, isFrame ? STEEL_DARK : isGlow ? HUD_AMBER : GLASS_DARK, isGlow);
              continue;
            }

            // Airwolf iconic phantom-black over pearl-white + thin silver pinstripe along the boundary!
            const distSplit = zn - splitZn;
            if (m === 2 && Math.abs(distSplit) < 0.32 && dx >= spanX - 1.3 * m) {
              put(x, y, z, SILVER_TRIM);
            } else if (distSplit <= 0) {
              const keelShade = zn <= zBot + 1.35;
              const panelGroove = m === 2 && (Math.abs(yn - 36) < 0.28 || Math.abs(yn - 44) < 0.28);
              put(x, y, z, keelShade || panelGroove ? PEARL_SHADE : PEARL_HI);
            } else {
              const topRidge = zn >= zTop - 1.0 && dxn <= 2.3;
              const shoulder = dx >= spanX - 1.25 * m && distSplit >= 0.4 && distSplit <= 2.0;
              const panelLine = m === 2 && (Math.abs(yn - 31) < 0.28 || Math.abs(yn - 37) < 0.28 || Math.abs(yn - 49) < 0.28);
              if (panelLine) put(x, y, z, BLACK_DEEP);
              else put(x, y, z, topRidge ? BLACK_SPEC : shoulder ? BLACK_MID : BLACK_PANEL);
            }
          }
        }
      }

      // 3. Slender 1px silver nose pitot probe & chin nose searchlight turret!
      for (let y = 55 * m; y < Math.min(L, 57.5 * m); y++) {
        put(cx, y, Math.round(7.6 * m), SILVER_TRIM);
      }
      for (let z = Math.round(5.0 * m); z <= Math.round(7.4 * m); z++) {
        for (let x = Math.round(cx - 1.4 * m); x <= Math.round(cx + 1.4 * m); x++) {
          put(x, Math.round(53.8 * m), z, STEEL_DARK);
          put(x, Math.round(54.5 * m), z, STEEL_HI);
        }
      }
      for (let z = Math.round(5.6 * m); z <= Math.round(6.8 * m); z++) {
        for (let x = Math.round(cx - 0.8 * m); x <= Math.round(cx + 0.8 * m); x++) {
          put(x, Math.round(55.2 * m), z, SPOT_LENS, true);
        }
      }

      // 4. Sculpted Twin Airwolf Side Sponsons (airfoil profile + quad chain guns + wingtip nav beacons!)
      for (const sgn of [-1, 1]) {
        for (let lat = 5 * m; lat <= 13.5 * m; lat++) {
          const latn = lat / m;
          const x = Math.round(cx + sgn * lat);
          const frac = (latn - 5) / 8.5;
          const y0 = Math.round((27.8 + frac * 4.8) * m);
          const y1 = Math.round((41.4 - frac * 3.2) * m);
          const zBot = Math.round((4.0 + frac * 1.2) * m);
          const zTop = Math.round((9.2 - frac * 1.8) * m);
          for (let y = y0; y <= y1; y++) {
            const chordU = (y - y0) / Math.max(1, y1 - y0);
            const arch = Math.sin(chordU * Math.PI);
            const localTop = Math.round(zBot + (zTop - zBot) * (0.45 + 0.55 * arch));
            for (let z = zBot; z <= localTop; z++) {
              if (z <= zBot + m) put(x, y, z, PEARL_HI);
              else if (m === 2 && z === zBot + m + 1 && (y === y0 || y === y1 || lat >= 12.5 * m)) put(x, y, z, SILVER_TRIM);
              else if (z >= localTop - (m === 2 ? 1 : 0) && latn < 11.5) put(x, y, z, BLACK_SPEC);
              else put(x, y, z, BLACK_PANEL);
            }
          }
          // Twin retractable chain gun & ADF cannon barrels per sponson
          if (Math.abs(latn - 7.8) < 0.45 || Math.abs(latn - 10.2) < 0.45) {
            const gunZ = Math.round((5.4 + frac * 0.8) * m);
            for (let y = y1 + 1; y <= y1 + Math.round(5.4 * m); y++) {
              const tip = y >= y1 + Math.round(4.6 * m);
              put(x, y, gunZ, tip ? SILVER_TRIM : STEEL_DARK);
              if (m === 2 && y <= y1 + 3) put(x, y, gunZ + 1, STEEL_HI);
            }
          }
        }
        // Wingtip glowing navigation beacons (Port Red / Starboard Emerald)
        const tipX = Math.round(cx + sgn * 14 * m);
        for (let dy = 0; dy < Math.round(1.6 * m); dy++) {
          for (let dz = 0; dz < m; dz++) {
            put(tipX, Math.round(33.8 * m) + dy, Math.round(5.8 * m) + dz, sgn < 0 ? NAV_RED : NAV_GREEN, true);
          }
        }
      }

      // 5. Twin Dorsal Supersonic Turbojet Nacelles (air intakes + side cooling louvers + glowing exhaust rings!)
      for (const sgn of [-1, 1]) {
        const nx = cx + sgn * 3.1 * m;
        for (let y = 24.5 * m; y <= 37.5 * m; y++) {
          const yn = y / m;
          for (let dx = -Math.round(1.4 * m); dx <= Math.round(1.4 * m); dx++) {
            for (let z = 16 * m; z <= 20.5 * m; z++) {
              const zn = z / m;
              const rad = Math.hypot(dx / m, (zn - 18.0) * 0.85);
              if (rad > 1.55) continue;
              if (yn >= 37.0 && rad < 1.15) {
                put(nx + dx, y, z, rad < 0.65 ? STEEL_HI : BLACK_DEEP); // sculpted turbine fan intake!
              } else if (yn <= 25.2 && rad < 1.25) {
                put(nx + dx, y, z, rad < 0.65 ? JET_CORE : JET_GLOW, true); // glowing supersonic nozzle!
              } else {
                const louver = m === 2 && Math.abs(dx / m) > 1.0 && (y % 4 === 0) && yn > 27 && yn < 35;
                put(nx + dx, y, z, louver ? STEEL_DARK : zn > 19.6 ? BLACK_SPEC : BLACK_MID);
              }
            }
          }
        }
      }

      // 6. Slender Swept Tail Boom with pearl-white ventral sweep & silver dorsal stripe
      for (let y = 4 * m; y <= 25 * m; y++) {
        const yn = y / m;
        const u = (25 - yn) / 21;
        const halfW = Math.max(0.85, 2.65 - u * 1.45) * m;
        const zBot = (8.0 + u * 2.6) * m;
        const zTop = (14.4 - u * 1.2) * m;
        const splitZ = zBot + (zTop - zBot) * 0.34;
        for (let z = Math.floor(zBot); z <= Math.ceil(zTop); z++) {
          for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
            if (z <= splitZ) put(x, y, z, PEARL_HI);
            else if (m === 2 && Math.abs(z - splitZ) <= 1) put(x, y, z, SILVER_TRIM);
            else put(x, y, z, z >= Math.ceil(zTop) - m ? BLACK_SPEC : BLACK_PANEL);
          }
        }
      }

      // 7. Swept Horizontal Stabilizers + Iconic Airwolf Vertical Endplate Winglets
      for (const sgn of [-1, 1]) {
        for (let lat = 2 * m; lat <= 7.5 * m; lat++) {
          const x = Math.round(cx + sgn * lat);
          const sweep = (lat / m - 2) * 0.55 * m;
          const y0 = Math.round(10.8 * m - sweep);
          const y1 = Math.round(15.2 * m - sweep);
          for (let y = y0; y <= y1; y++) {
            put(x, y, Math.round(11.2 * m), BLACK_MID);
            put(x, y, Math.round(11.8 * m), BLACK_SPEC);
          }
          if (lat >= 7 * m) {
            for (let z = Math.round(9.8 * m); z <= Math.round(14.5 * m); z++) {
              for (let y = Math.round(8.2 * m); y <= Math.round(11.0 * m); y++) {
                put(x, y, z, z >= 13.8 * m ? SILVER_TRIM : BLACK_DEEP);
              }
            }
          }
        }
      }

      // 8. Swept Dorsal Tail Fin + Pearl Ventral Skeg + Glowing Crimson Anti-Collision Strobe
      for (let z = 12 * m; z <= 24.5 * m; z++) {
        const zn = z / m;
        const u = (zn - 12) / 12.5;
        const y0 = Math.round((4.8 - u * 3.4) * m);
        const y1 = Math.round((12.4 - u * 4.6) * m);
        for (let y = y0; y <= y1; y++) {
          const lead = y >= y1 - (m === 2 ? 1 : 0);
          for (let dx = -Math.floor(0.6 * m); dx <= Math.ceil(0.6 * m); dx++) {
            put(cx + dx, y, z, lead ? SILVER_TRIM : zn > 20 ? BLACK_SPEC : BLACK_PANEL);
          }
        }
      }
      for (let z = 7 * m; z <= 10.5 * m; z++) {
        for (let y = 5 * m; y <= 9.2 * m; y++) {
          for (let dx = -Math.floor(0.5 * m); dx <= Math.ceil(0.5 * m); dx++) {
            put(cx + dx, y, z, PEARL_HI);
          }
        }
      }
      for (let dz = 0; dz < m; dz++) {
        for (let dx = -Math.floor(0.5 * m); dx <= Math.ceil(0.5 * m); dx++) {
          put(cx + dx, Math.round(3.0 * m), Math.round(25.0 * m) + dz, NAV_RED, true);
        }
      }

      // 9. Titanium Main Rotor Mast + Swashplate Collar rising to top slice
      for (let z = 18.5 * m; z <= 27.2 * m; z++) {
        const zn = z / m;
        const rad = zn >= 22.8 && zn <= 24.2 ? 1.85 * m : zn >= 22 ? 0.9 * m : 1.45 * m;
        for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) {
          for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
            if (Math.hypot(dx, dy) <= rad) {
              put(cx + dx, 33 * m + dy, z, zn >= 22.8 && zn <= 24.4 ? SILVER_TRIM : zn >= 25 ? STEEL_HI : STEEL_DARK);
            }
          }
        }
      }
    },
    {
      mainRotor: { pos: [cx, 33.0 * m, 27.2 * m], dir: [0, 0, 1] },
      tailRotor: { pos: [cx - 2.3 * m, 6.2 * m, 13.5 * m], dir: [-1, 0, 0] },
      searchlight: { pos: [cx, 55.6 * m, 6.2 * m], dir: [0, 1, -0.35] },
      jetL: { pos: [cx - 3.1 * m, 24.4 * m, 18.0 * m], dir: [0, -1, 0] },
      jetR: { pos: [cx + 3.1 * m, 24.4 * m, 18.0 * m], dir: [0, -1, 0] },
    },
    [cx, 33.0 * m, 11.0 * m],
  );
}

/** Articulated 2-blade Airwolf Main Rotor (Classic 54x54x3 or HD 108x108x6). */
export function createMainRotorAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 54 * m, L = 54 * m, H = 3 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  const HUB: RGB = [112, 126, 148];
  const HUB_HI: RGB = [174, 188, 210];
  const BLADE: RGB = [34, 42, 56];
  const EDGE: RGB = [88, 104, 128];
  const STRIPE: RGB = [248, 212, 68];
  const TIP_GLOW: RGB = [186, 228, 255];

  return buildVoxelAsset(
    "airwolf_main_rotor",
    "Airwolf Main Rotor",
    W,
    L,
    H,
    0.26 / m,
    (put) => {
      // Titanium rotor head + pitch control arms
      for (let z = 0; z < H; z++) {
        const rad = z >= H - m ? 1.45 * m : 2.2 * m;
        for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++) {
          for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
            if (Math.hypot(dx, dy) <= rad) put(cx + dx, cy + dy, z, z === H - 1 ? HUB_HI : HUB);
          }
        }
      }
      // 2 long tapered graphite airfoil blades along X
      const zBlade = Math.floor(H * 0.5);
      for (let x = m; x < W - m; x++) {
        const distn = Math.abs(x - cx) / m;
        if (distn < 2.2) continue;
        const isStripe = distn >= 19.8 && distn <= 22.4;
        const isTip = distn >= 24.4;
        const col = isTip ? TIP_GLOW : isStripe ? STRIPE : BLADE;
        put(x, cy, zBlade, col, isTip);
        if (distn < 23.8) put(x, cy - 1, zBlade, isStripe ? STRIPE : EDGE);
        if (m === 2 && distn < 21.5) put(x, cy + 1, zBlade, isStripe ? STRIPE : BLADE);
        if (m === 2 && distn < 6.0) put(x, cy, zBlade + 1, HUB);
      }
    },
    {},
    [cx, cy, H * 0.5],
  );
}

/** Articulated Vertical Tail Rotor spinning around local X axis. */
export function createTailRotorAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 3 * m, L = 14 * m, H = 14 * m;
  const cy = (L - 1) * 0.5, cz = (H - 1) * 0.5;
  const HUB: RGB = [118, 134, 156];
  const BLADE: RGB = [42, 50, 66];
  const TIP: RGB = [255, 84, 76];

  return buildVoxelAsset(
    "airwolf_tail_rotor",
    "Airwolf Tail Rotor",
    W,
    L,
    H,
    0.26 / m,
    (put) => {
      for (let x = Math.floor(W * 0.4); x < W; x++) put(x, cy, cz, HUB);
      const bx = Math.floor(W * 0.45);
      for (let z = 0; z < H; z++) {
        const dn = Math.abs(z - cz) / m;
        if (dn < 1.1) continue;
        const isTip = dn > 4.6;
        put(bx, cy, z, isTip ? TIP : BLADE, dn > 5.2);
        if (m === 2 && dn < 5.0) put(bx, cy + 1, z, BLADE);
      }
    },
    {},
    [W * 0.45, cy, cz],
  );
}

/** Transparent proxy asset used to pass Airwolf drop shadow & searchlight hit via uShadowCasters. */
export function createLightProxyAsset(): VolumeAsset {
  return createVolumeAsset({
    id: "light_proxy",
    name: "Searchlight Ground Target",
    w: 2,
    l: 2,
    h: 2,
    voxelScale: 1.0,
    pivot: [1, 1, 1],
    rgba: new Uint8Array(2 * 2 * 2 * 4),
    computeSdf: false,
    provenance: { kind: "blueprint", source: "airwolf-city-hd" },
  });
}

export type TowerStyle = "artdeco" | "glass" | "brick" | "neon";

/**
 * Handcrafted Miniature Diorama Skyscraper:
 *  - "artdeco": Setback crown tiers, fluted stone pilasters, golden lobby arcade, rooftop Deco spire & beacon
 *  - "glass":   Sapphire curtain-wall tower with varied office blinds, rooftop wooden water tank & AC fans
 *  - "brick":   Warm terracotta loft block with stone lintels, 1px iron exterior fire escapes, street awnings & water tower
 *  - "neon":    Midnight downtown hotel with glowing marquee & multi-bar neon billboard on rooftop steel truss
 */
export function createTowerAsset(
  id: string,
  baseW: number,
  baseL: number,
  baseH: number,
  seed: number,
  style: TowerStyle,
  detail: DetailLevel,
): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const w = baseW * m;
  const l = baseL * m;
  const h = baseH * m;
  const extraH = (style === "artdeco" ? 11 : 8) * m;
  const vs = 0.62 / m;

  const wallBase: RGB =
    style === "brick" ? [98, 62, 60]
    : style === "artdeco" ? [68, 76, 98]
    : style === "neon" ? [38, 46, 76]
    : [44, 58, 86];
  const wallTrim: RGB =
    style === "brick" ? [136, 98, 90]
    : style === "artdeco" ? [116, 128, 156]
    : style === "neon" ? [68, 82, 122]
    : [76, 96, 130];
  const lobbyBase: RGB = [34, 40, 56];
  const roofCol: RGB = [48, 56, 74];
  const winWarm: RGB = [242, 198, 114];
  const winAmber: RGB = [228, 162, 82];
  const winDim: RGB = [152, 118, 76];
  const winCyan: RGB = [118, 194, 224];
  const winOff: RGB = [16, 22, 38];
  const winGlassReflect: RGB = [28, 38, 62];
  const neonPink: RGB = [255, 68, 178];
  const neonCyan: RGB = [64, 240, 255];
  const neonGold: RGB = [255, 214, 78];
  const ironDark: RGB = [32, 38, 52];
  const awningA: RGB = style === "brick" ? [196, 54, 58] : [44, 142, 178];
  const awningB: RGB = [232, 224, 206];

  return buildVoxelAsset(
    id,
    id,
    w,
    l,
    h + extraH,
    vs,
    (put) => {
      // Helper to build a single architectural tier with setbacks, pilasters, recessed windows & cornices
      const buildTier = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, isGround: boolean) => {
        const floorStep = 3 * m;
        for (let z = z0; z < z1; z++) {
          const relZ = z - z0;
          const isCornice = z === z1 - 1;
          const isFloorBand = relZ % floorStep === 0 || (m === 2 && relZ % floorStep === 1 && relZ < 2);
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const onEdge = x === x0 || x === x1 || y === y0 || y === y1;
              if (!onEdge && !isCornice) continue;
              if (isCornice) {
                put(x, y, z, onEdge ? wallTrim : roofCol);
                continue;
              }
              const corner = (x <= x0 + (m - 1) || x >= x1 - (m - 1)) && (y <= y0 + (m - 1) || y >= y1 - (m - 1));
              if (corner) {
                put(x, y, z, wallTrim);
                continue;
              }
              // Ground-floor glowing storefront arcade & entrance doors (cozy warm glow, zero blowout!)
              if (isGround && z < 3 * m) {
                const coord = (x === x0 || x === x1) ? (y - y0) : (x - x0);
                const isShopWin = z >= m && z < 3 * m - (m === 2 ? 1 : 0) && (coord % (3 * m)) >= m;
                if (isShopWin) {
                  put(x, y, z, style === "neon" ? winCyan : winWarm, 132);
                } else {
                  put(x, y, z, z === 0 ? lobbyBase : wallTrim);
                }
                continue;
              }
              // Architectural pilasters & crisp recessed office/apartment window suites!
              const uCoord = (x === x0 || x === x1) ? (y - y0) : (x - x0);
              const bayStride = 2 * m;
              const bayPhase = uCoord % bayStride;
              // Leave crisp 1-voxel stone/steel mullion between every window pane in HD!
              const inBay = (m === 2 ? (bayPhase === 1 || bayPhase === 2) : (bayPhase === 1)) &&
                uCoord > m && uCoord < ((x === x0 || x === x1) ? (y1 - y0 - m) : (x1 - x0 - m));
              if (isFloorBand || !inBay) {
                const sill = style === "brick" && relZ % floorStep === 0;
                put(x, y, z, sill ? wallTrim : isFloorBand ? wallTrim : wallBase);
              } else {
                const floorIdx = Math.floor(z / floorStep);
                const suiteIdx = Math.floor(uCoord / (4 * m)); // cluster adjacent panes into realistic rooms/suites!
                const floorRoll = hash3(floorIdx, seed, 3, seed);
                const suiteRoll = hash3(suiteIdx, floorIdx, (x === x0 || x === x1) ? 1 : 2, seed);
                const paneRoll = hash3(Math.floor(uCoord / bayStride), floorIdx, 9, seed);
                // Some entire floors dark (unoccupied at midnight), lit suites have warm cohesive room hues!
                const floorActive = floorRoll > 66;
                const litThresh = style === "glass" ? 168 : 176;
                if (floorActive && suiteRoll > litThresh && paneRoll > 48) {
                  const col = suiteRoll > 236 ? winCyan : suiteRoll > 212 ? winWarm : suiteRoll > 190 ? winAmber : winDim;
                  // Top voxel of each HD window pane slightly shaded like interior ceiling / venetian blind!
                  const isTopOfPane = m === 2 && (relZ % floorStep === floorStep - 1);
                  const isUpperLit = isTopOfPane && (suiteRoll & 1) === 0;
                  const emisVal = isUpperLit ? 68 : suiteRoll > 212 ? 128 : 108;
                  put(x, y, z, isUpperLit ? winDim : col, emisVal);
                } else {
                  const subtleSkyRef = ((floorIdx + suiteIdx) % 7 === 0);
                  put(x, y, z, subtleSkyRef ? winGlassReflect : winOff);
                }
              }
            }
          }
        }
        // Decorative parapet coping rim
        for (let x = x0; x <= x1; x++) { put(x, y0, z1, wallTrim); put(x, y1, z1, wallTrim); }
        for (let y = y0; y <= y1; y++) { put(x0, y, z1, wallTrim); put(x1, y, z1, wallTrim); }
      };

      if (style === "artdeco") {
        // 3-tier iconic stepped Art Deco skyscraper!
        const t1 = Math.round(h * 0.62);
        const t2 = Math.round(h * 0.86);
        buildTier(0, w - 1, 0, l - 1, 0, t1, true);
        buildTier(2 * m, w - 1 - 2 * m, 2 * m, l - 1 - 2 * m, t1, t2, false);
        buildTier(4 * m, w - 1 - 4 * m, 4 * m, l - 1 - 4 * m, t2, h, false);
        // Glowing Art Deco crown uplight corners at each setback!
        for (const [cxp, cyp, czp] of [
          [2 * m, 2 * m, t1 + 1], [w - 1 - 2 * m, 2 * m, t1 + 1],
          [2 * m, l - 1 - 2 * m, t1 + 1], [w - 1 - 2 * m, l - 1 - 2 * m, t1 + 1],
          [4 * m, 4 * m, t2 + 1], [w - 1 - 4 * m, l - 1 - 4 * m, t2 + 1],
        ]) {
          put(cxp, cyp, czp, neonGold, true);
        }
        // Stepped silver Art Deco spire + glowing crimson aviation strobe
        const scx = Math.floor(w * 0.5), scy = Math.floor(l * 0.5);
        for (let z = h; z < h + 4 * m; z++) {
          const rad = Math.max(0, Math.round((1 - (z - h) / (4 * m)) * 2.5 * m));
          for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
            put(scx + dx, scy + dy, z, z === h + m ? neonGold : wallTrim, z === h + m);
          }
        }
        for (let z = h + 4 * m; z < h + 10 * m; z++) put(scx, scy, z, [156, 170, 196]);
        put(scx, scy, h + 10 * m, [255, 52, 62], true);
      } else {
        buildTier(0, w - 1, 0, l - 1, 0, h, true);

        // Striped street-level storefront awning along front & side faces (HD & Classic!)
        const awZ = 3 * m;
        for (let x = 2 * m; x < w - 2 * m; x++) {
          const stripe = (Math.floor(x / m) & 1) === 0;
          const col = style === "neon" ? (stripe ? neonPink : neonCyan) : (stripe ? awningA : awningB);
          put(x, l - 1, awZ, col, style === "neon");
          if (m === 2) put(x, l - 2, awZ + 1, col, style === "neon");
        }

        // Exterior iron fire escape balconies on brick lofts (stunning in HD 2x!)
        if (style === "brick") {
          for (let z = 6 * m; z < h - 2 * m; z += 3 * m) {
            for (let x = 4 * m; x <= 9 * m; x++) {
              put(x, 0, z, ironDark);
              if (m === 2 && (x % 2 === 0)) put(x, 0, z + 1, ironDark);
            }
          }
        }

        // Rooftop mechanical penthouse
        const px0 = 2 * m, px1 = Math.min(w - 3 * m, 6 * m);
        const py0 = 2 * m, py1 = Math.min(l - 3 * m, 6 * m);
        for (let z = h; z < h + 3 * m; z++) {
          for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) {
            put(x, y, z, z === h + 3 * m - 1 ? [104, 118, 142] : [64, 74, 94]);
          }
        }

        // Classic NYC wooden rooftop water tower on stilts (brick & glass blocks!)
        if (style === "brick" || style === "glass") {
          const wx = w - 4 * m, wy = 4 * m;
          for (let z = h; z < h + 2 * m; z++) {
            put(wx - m, wy - m, z, ironDark); put(wx + m, wy - m, z, ironDark);
            put(wx - m, wy + m, z, ironDark); put(wx + m, wy + m, z, ironDark);
          }
          for (let z = h + 2 * m; z < h + 5 * m; z++) {
            for (let dy = -Math.round(1.5 * m); dy <= Math.round(1.5 * m); dy++) {
              for (let dx = -Math.round(1.5 * m); dx <= Math.round(1.5 * m); dx++) {
                if (Math.hypot(dx, dy) <= 1.55 * m) {
                  const band = z === h + 3 * m;
                  put(wx + dx, wy + dy, z, band ? ironDark : [132, 94, 66]);
                }
              }
            }
          }
          for (let z = h + 5 * m; z < h + 6.5 * m; z++) {
            const r = Math.max(0.5, (1.6 - (z - (h + 5 * m)) / m) * m);
            for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
              for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
                if (Math.hypot(dx, dy) <= r) put(wx + dx, wy + dy, z, [78, 86, 102]);
              }
            }
          }
        }

        // Multi-bar glowing rooftop neon billboard on steel truss (neon blocks!)
        if (style === "neon") {
          for (let z = h; z < h + 4 * m; z++) {
            put(3 * m, l - 2 * m, z, ironDark);
            put(w - 3 * m, l - 2 * m, z, ironDark);
          }
          for (let x = 2 * m; x < w - 2 * m; x++) {
            for (let dz = 0; dz < 2 * m; dz++) {
              const barCol = dz < m ? neonCyan : ((Math.floor(x / m) % 3 === 0) ? neonGold : neonPink);
              put(x, l - 1 - (m === 2 ? 1 : 0), h + 2 * m + dz, barCol, true);
            }
          }
        }

        // Slender rooftop radio mast + glowing crimson aviation strobe on taller buildings
        if (baseH >= 22) {
          const ax = w - 4 * m, ay = l - 4 * m;
          for (let z = h; z < h + 6 * m; z++) put(ax, ay, z, [126, 140, 166]);
          put(ax, ay, h + 6 * m, [255, 48, 58], true);
        }
      }
    },
    {},
    [w * 0.5, l * 0.5, 0],
  );
}

/** Airwolf Corporate HQ Tower with crisp high-res glowing yellow H Helipad, corner approach beacons, & radar cupola! */
export function createHelipadTowerAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const w = 22 * m, l = 22 * m, h = 20 * m;
  const vs = 0.62 / m;
  const WALL: RGB = [44, 54, 78];
  const TRIM: RGB = [96, 112, 142];
  const PAD: RGB = [56, 64, 82];
  const PAD_LINE: RGB = [82, 92, 114];
  const GOLD: RGB = [255, 214, 72];
  const CYAN: RGB = [76, 238, 255];

  return buildVoxelAsset(
    "tower_helipad",
    "Airwolf HQ Helipad Tower",
    w,
    l,
    h + 4 * m,
    vs,
    (put) => {
      for (let z = 0; z < h; z++) {
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const edge = x === 0 || x === w - 1 || y === 0 || y === l - 1;
          if (!edge && z < h - 1) continue;
          if (z === h - 1) {
            const dxn = (x - (w - 1) * 0.5) / m;
            const dyn = (y - (l - 1) * 0.5) / m;
            const dn = Math.hypot(dxn, dyn);
            const inRing = Math.abs(dn - 7.4) < 0.72;
            const inOuter = Math.abs(dn - 8.8) < 0.28;
            const inH =
              (Math.abs(dxn) >= 2.2 && Math.abs(dxn) <= 3.45 && Math.abs(dyn) <= 4.1) ||
              (Math.abs(dyn) <= 0.72 && Math.abs(dxn) <= 3.45);
            if (inRing || inH) put(x, y, z, GOLD, true);
            else if (inOuter) put(x, y, z, PAD_LINE);
            else if (edge) put(x, y, z, TRIM);
            else put(x, y, z, PAD);
            continue;
          }
          const cornerPier = (x < 2 * m || x >= w - 2 * m) && (y < 2 * m || y >= l - 2 * m);
          const band = z % (4 * m) < m;
          const mullion = ((x === 0 || x === w - 1) ? y : x) % (2 * m) === 0;
          if (cornerPier || band || mullion) {
            put(x, y, z, band ? TRIM : WALL);
          } else {
            // Sleek dark smoked obsidian glass with subtle occasional late-night ops floor glow
            const fl = Math.floor(z / (4 * m));
            const st = Math.floor(((x === 0 || x === w - 1) ? y : x) / (5 * m));
            const r = hash3(st, fl, (x === 0 || x === w - 1) ? 1 : 2, 99);
            const lit = r > 196 && (z % (4 * m)) >= m + (m === 2 ? 1 : 0);
            put(x, y, z, lit ? [116, 198, 232] : [18, 26, 46], lit ? 112 : 0);
          }
        }
      }
      // Rooftop perimeter safety rail posts + 4 bright glowing cyan corner beacons
      for (let i = 2 * m; i < w - 2 * m; i += 2 * m) {
        put(i, 0, h, TRIM); put(i, l - 1, h, TRIM);
        put(0, i, h, TRIM); put(w - 1, i, h, TRIM);
      }
      for (const [bx, by] of [[m, m], [w - 1 - m, m], [m, l - 1 - m], [w - 1 - m, l - 1 - m]]) {
        put(bx, by, h, CYAN, true);
        if (m === 2) put(bx, by, h + 1, CYAN, true);
      }
    },
    { pad: { pos: [w * 0.5, l * 0.5, h] } },
    [w * 0.5, l * 0.5, 0],
  );
}

/**
 * Iconic Red-and-White Coastal Lighthouse + Warm-Lit Keeper's Cottage on a Rocky Stone Cape!
 */
export function createLighthouseAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const w = 22 * m, l = 22 * m, h = 34 * m;
  const vs = 0.58 / m;
  const cx = 9.0 * m, cy = 11.0 * m;

  return buildVoxelAsset(
    "coastal_lighthouse",
    "Coastal Lighthouse & Keeper's Cottage",
    w,
    l,
    h,
    vs,
    (put) => {
      // 1. Layered rocky granite cape & seawall foundation
      for (let z = 0; z < 4 * m; z++) {
        const zn = z / m;
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const dTower = Math.hypot((x - cx) / m, (y - cy) / m);
          const dCottage = Math.hypot((x - 15.8 * m) / m, (y - 10.5 * m) / m);
          const inRock = dTower <= (6.8 - zn * 0.42) || dCottage <= (5.4 - zn * 0.35);
          if (inRock) {
            const tone = 92 + Math.round(zn * 10) + ((hash3(x, y, z, 7) & 15) - 7);
            put(x, y, z, [tone, tone + 8, tone + 22]);
          }
        }
      }

      // 2. Cozy warm-lit Keeper's Cottage nestled right beside the lighthouse!
      const kx0 = Math.round(13.0 * m), kx1 = Math.round(19.2 * m);
      const ky0 = Math.round(7.4 * m), ky1 = Math.round(13.6 * m);
      const kz0 = 3 * m, kz1 = 8 * m;
      for (let z = kz0; z < kz1; z++) {
        for (let y = ky0; y <= ky1; y++) for (let x = kx0; x <= kx1; x++) {
          const edge = x === kx0 || x === kx1 || y === ky0 || y === ky1;
          if (!edge) continue;
          const isWin = z >= kz0 + 1.5 * m && z <= kz0 + 3.4 * m && (
            ((y === ky0 || y === ky1) && Math.abs(x - 16.1 * m) < 1.2 * m) ||
            (x === kx1 && Math.abs(y - 10.5 * m) < 1.3 * m)
          );
          put(x, y, z, isWin ? [255, 224, 132] : [224, 218, 206], isWin);
        }
      }
      // Gabled red-slate roof on Keeper's Cottage + brick chimney!
      for (let step = 0; step <= 3 * m; step++) {
        const z = kz1 + step;
        const inset = step;
        for (let y = ky0 - 1; y <= ky1 + 1; y++) {
          for (let x = kx0 - 1 + inset; x <= kx1 + 1 - inset; x++) {
            if (x <= kx1 + 1 - inset) put(x, y, z, [156, 52, 54]);
          }
        }
      }
      for (let z = kz1 + m; z <= kz1 + 4 * m; z++) {
        put(Math.round(18.0 * m), Math.round(8.5 * m), z, [104, 72, 68]);
      }

      // 3. Tapered red-and-white striped Lighthouse tower with spiral glowing porthole windows!
      for (let z = 4 * m; z < 24 * m; z++) {
        const zn = z / m;
        const r = (4.6 - (zn - 4) * 0.095) * m;
        const isRed = Math.floor((zn - 4) / 4) % 2 === 1;
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r) {
            const win1 = Math.abs(zn - 11.5) < 0.9 && y > cy + r - 1.3 * m && Math.abs(x - cx) <= 0.85 * m;
            const win2 = Math.abs(zn - 17.5) < 0.9 && x < cx - r + 1.3 * m && Math.abs(y - cy) <= 0.85 * m;
            if (win1 || win2) put(x, y, z, [255, 226, 134], true);
            else put(x, y, z, isRed ? [218, 46, 52] : [240, 238, 230]);
          }
        }
      }

      // 4. Gallery observation deck + 1px iron railing posts
      for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 4.3 * m) put(x, y, 24 * m, [44, 52, 70]);
        if (d >= 3.5 * m && d <= 4.3 * m && ((x + y) % (m === 2 ? 3 : 2) === 0)) {
          put(x, y, 24 * m + 1, [82, 96, 122]);
          if (m === 2) put(x, y, 24 * m + 2, [82, 96, 122]);
        }
      }

      // 5. Bright 360-degree Fresnel lantern room
      for (let z = 25 * m; z <= 28.5 * m; z++) {
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= 2.45 * m) {
            const frame = d > 1.8 * m && (Math.abs(x - cx) < 0.45 * m || Math.abs(y - cy) < 0.45 * m);
            put(x, y, z, frame ? [44, 52, 70] : [255, 246, 178], !frame);
          }
        }
      }

      // 6. Domed copper-slate cupola & lightning rod
      for (let z = 29 * m; z <= 32.5 * m; z++) {
        const r = Math.max(0.5, (2.8 - (z - 29 * m) / m * 0.72) * m);
        for (let y = 0; y < l; y++) for (let x = 0; x < w; x++) {
          if (Math.hypot(x - cx, y - cy) <= r) put(x, y, z, [54, 68, 92]);
        }
      }
      put(cx, cy, 33 * m, [172, 188, 212]);
    },
    { beacon: { pos: [cx, cy, 26.8 * m] } },
    [cx, cy, 0],
  );
}

/** Moored Harbor Tugboat / Midnight Patrol Boat bobbing in the coastal bay! */
export function createHarborBoatAsset(id: string, hullColor: RGB, detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 10 * m, L = 20 * m, H = 12 * m;
  const cx = (W - 1) * 0.5;
  const vs = 0.42 / m;

  return buildVoxelAsset(
    id,
    "Harbor Boat",
    W,
    L,
    H,
    vs,
    (put) => {
      // Sculpted boat hull with pointed bow (+Y)
      for (let y = 2 * m; y <= 18 * m; y++) {
        const yn = y / m;
        const halfW = yn > 13 ? Math.max(0.8, 3.8 * (1 - (yn - 13) / 5.5)) * m : 3.8 * m;
        for (let z = 0; z < 3 * m; z++) {
          for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
            const isRim = z === 3 * m - 1 && (Math.abs(x - cx) >= halfW - m || yn < 3 || yn > 16.5);
            put(x, y, z, isRim ? [232, 236, 244] : z === 0 ? [34, 42, 58] : hullColor);
          }
        }
      }
      // Deck house & glowing warm wheelhouse cabin windows
      for (let y = 6 * m; y <= 12 * m; y++) {
        for (let x = Math.round(cx - 2.3 * m); x <= Math.round(cx + 2.3 * m); x++) {
          for (let z = 3 * m; z < 7 * m; z++) {
            const win = z >= 4.5 * m && z < 6 * m && (y === 12 * m || x === Math.round(cx - 2.3 * m) || x === Math.round(cx + 2.3 * m));
            put(x, y, z, win ? [255, 226, 134] : [236, 238, 244], win);
          }
        }
      }
      // Smokestack & mast with warm stern/mast light
      for (let z = 7 * m; z < 11 * m; z++) {
        put(cx, 8 * m, z, z >= 9 * m ? [212, 56, 56] : [52, 60, 76]);
      }
      put(cx, 11 * m, 9 * m, [255, 240, 174], true);
      // Port Red / Starboard Green bow nav lights
      put(Math.round(cx - 2.2 * m), 15 * m, 3 * m, [255, 52, 62], true);
      put(Math.round(cx + 2.2 * m), 15 * m, 3 * m, [52, 255, 142], true);
    },
    {},
    [cx, L * 0.5, 0],
  );
}

/** Slender 1px midnight streetlamp with curved arm and warm glowing globe. */
export function createStreetLampAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 5 * m, L = 6 * m, H = 13 * m;
  const cx = Math.floor(W * 0.5), cy = Math.floor(L * 0.45);
  return buildVoxelAsset(
    "street_lamp",
    "Street Lamp",
    W,
    L,
    H,
    0.45 / m,
    (put) => {
      for (let z = 0; z < 2 * m; z++) put(cx, cy, z, [78, 88, 110]);
      for (let z = 2 * m; z <= 10 * m; z++) put(cx, cy, z, [58, 68, 88]);
      put(cx, cy + 1, 11 * m, [78, 88, 110]);
      put(cx, cy + m, 10 * m, [255, 224, 134], true);
      if (m === 2) put(cx, cy + m + 1, 10 * m, [255, 236, 168], true);
      put(cx, cy + m, 11 * m, [48, 56, 74]);
    },
    {},
    [cx, cy, 0],
  );
}

/** Layered miniature park pine tree for downtown pocket park & waterfront promenade. */
export function createParkTreeAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 10 * m, L = 10 * m, H = 15 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  return buildVoxelAsset(
    "park_tree",
    "Park Tree",
    W,
    L,
    H,
    0.52 / m,
    (put) => {
      for (let z = 0; z < 4 * m; z++) {
        for (let dy = -Math.floor(0.6 * m); dy <= Math.floor(0.6 * m); dy++) {
          for (let dx = -Math.floor(0.6 * m); dx <= Math.floor(0.6 * m); dx++) {
            put(cx + dx, cy + dy, z, [96, 66, 46]);
          }
        }
      }
      for (let z = 3 * m; z < H; z++) {
        const zn = z / m;
        // Tiered pine boughs!
        const tierWave = 1.0 + 0.22 * Math.sin(zn * 1.9);
        const r = Math.max(0.6, (15 - zn) * 0.36 * tierWave) * m;
        for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          if (Math.hypot(x - cx, y - cy) <= r) {
            const hi = ((x + y + z) & 1) === 0;
            put(x, y, z, hi ? [48, 134, 80] : [30, 94, 68]);
          }
        }
      }
    },
    {},
    [cx, cy, 0],
  );
}

/** Midnight cruising city cars (Yellow Taxi with roof sign, Police Cruiser with red/blue lightbar, Sedan). */
export function createCityCarAsset(id: string, bodyColor: RGB, kind: "taxi" | "police" | "sedan", detail: DetailLevel): VolumeAsset {
  const m = detail === "hd" ? 2 : 1;
  const W = 6 * m, L = 11 * m, H = 6 * m;
  return buildVoxelAsset(
    id,
    "City Car",
    W,
    L,
    H,
    0.34 / m,
    (put) => {
      for (let y = m; y <= 9 * m; y++) for (let x = m; x <= 4 * m; x++) {
        put(x, y, m, bodyColor);
        put(x, y, 2 * m, bodyColor);
        if (m === 2) put(x, y, 3, bodyColor);
      }
      for (let y = 3 * m; y <= 7 * m; y++) for (let x = m; x <= 4 * m; x++) {
        const isGlass = y === 3 * m || y === 7 * m || (m === 2 && (y === 3 * m + 1 || y === 7 * m - 1));
        put(x, y, 3 * m, isGlass ? [44, 76, 124] : kind === "police" ? [236, 240, 248] : bodyColor);
        if (m === 2) put(x, y, 3 * m + 1, isGlass ? [58, 96, 152] : kind === "police" ? [236, 240, 248] : bodyColor);
      }
      // Roof details: Taxi glowing yellow sign or Police red/blue lightbar!
      if (kind === "taxi") {
        for (let x = 2 * m; x <= 3 * m; x++) put(x, 5 * m, 4 * m, [255, 224, 92], true);
      } else if (kind === "police") {
        put(2 * m, 5 * m, 4 * m, [255, 48, 62], true);
        put(3 * m, 5 * m, 4 * m, [64, 176, 255], true);
      }
      // Wheels
      for (const [wx, wy] of [[m, 2 * m], [4 * m, 2 * m], [m, 8 * m], [4 * m, 8 * m]]) {
        put(wx, wy, 0, [24, 28, 36]);
        if (m === 2) put(wx, wy + 1, 0, [24, 28, 36]);
      }
      // Glowing headlights (+Y) and red taillights (-Y)
      put(m, 10 * m, m, [255, 248, 194], true);
      put(4 * m, 10 * m, m, [255, 248, 194], true);
      put(m, 0, m, [255, 48, 62], true);
      put(4 * m, 0, m, [255, 48, 62], true);
    },
    {},
    [W * 0.5, L * 0.5, 0],
  );
}
