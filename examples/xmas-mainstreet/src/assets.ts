/**
 * Ultra-Detail Procedural Voxel Assets for Main Street Christmas (@aastack/core).
 * Uses graded continuous emissive (0..255) so warm shop interiors & clockfaces keep razor-sharp
 * 1px window mullions while fairy lights, marquee chasers, ornaments & Rudolph's nose sparkle!
 *
 * Supports live Detail toggle:
 *  - "ultra": Full 2x miniature diorama fidelity (up to 52x52x92 voxel landmarks, recessed bay
 *             windows with visible toys/books, hanging icicles, wreaths, tinsel & 70+ ornaments)
 *  - "classic": Crisp 1x retro voxel scale for side-by-side detail comparison
 */

import { createVolumeAsset, type RGB, type SocketDef, type VolumeAsset } from "@aastack/core";

export type DetailLevel = "classic" | "ultra";

function hash3(a: number, b: number, c: number, seed: number): number {
  let n = (a * 374761393 + b * 668265263 + c * 2147483647 + seed * 1597334677) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) & 255;
}

function tintRgb(base: RGB, delta: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(base[0] + delta))),
    Math.max(0, Math.min(255, Math.round(base[1] + delta))),
    Math.max(0, Math.min(255, Math.round(base[2] + delta))),
  ];
}

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
    pivot: pivot ?? [w * 0.5, l * 0.5, 0],
    rgba,
    explicitEmissive: emis,
    sockets,
    computeSdf: false,
    provenance: { kind: "blueprint", source: "xmas-mainstreet" },
  });
}

// Shared winter palette (warm cozy Christmas Eve storybook tones)
const SNOW_HI: RGB = [242, 247, 255];
const SNOW_MID: RGB = [212, 224, 242];
const SNOW_SHADE: RGB = [174, 194, 222];
const ICE_ICICLE: RGB = [194, 228, 250];
const PINE_DARK: RGB = [22, 62, 46];
const PINE_MID: RGB = [34, 88, 60];
const PINE_HI: RGB = [52, 118, 76];
const HOLLY_RED: RGB = [218, 38, 46];
const GOLD_TRIM: RGB = [232, 188, 72];
const WARM_WIN_HI: RGB = [252, 212, 126];
const WARM_WIN_MID: RGB = [236, 174, 88];
const WARM_WIN_DEEP: RGB = [184, 118, 58];
const DARK_WOOD: RGB = [66, 44, 34];
const CREAM_TRIM: RGB = [234, 226, 210];
const IRON_DARK: RGB = [34, 40, 52];
const FAIRY_WARM: RGB = [255, 228, 134];
const FAIRY_RED: RGB = [255, 62, 72];
const FAIRY_GREEN: RGB = [68, 238, 124];
const FAIRY_BLUE: RGB = [88, 188, 255];
const FAIRY_GOLD: RGB = [255, 198, 62];

const FAIRY_PAL: RGB[] = [FAIRY_WARM, FAIRY_RED, FAIRY_GOLD, FAIRY_GREEN, FAIRY_BLUE];

/** Helper: draw a charming pine wreath with red bow on a front (+Y) facade wall! */
function drawWreath(
  put: (x: number, y: number, z: number, rgb: RGB, emissive?: boolean | number) => void,
  cx: number,
  y: number,
  cz: number,
  m: number,
): void {
  const rOut = 1.65 * m;
  const rIn = 0.72 * m;
  for (let dz = -Math.ceil(rOut); dz <= Math.ceil(rOut); dz++) {
    for (let dx = -Math.ceil(rOut); dx <= Math.ceil(rOut); dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= rOut && d >= rIn) {
        const berry = ((dx + dz) & 3) === 0 && m === 2;
        put(cx + dx, y, cz + dz, berry ? HOLLY_RED : PINE_HI);
      }
    }
  }
  // Red velvet bow at bottom/top of wreath
  put(cx, y, Math.round(cz - 1.3 * m), HOLLY_RED);
  if (m === 2) {
    put(cx - 1, y, Math.round(cz - 1.5 * m), HOLLY_RED);
    put(cx + 1, y, Math.round(cz - 1.5 * m), HOLLY_RED);
  }
}

/**
 * 1. HERO CENTERPIECE: Giant Decorated Town Square Christmas Tree + Presents!
 *    - ultra: 52x52x80 @ 0.16 (12.8 world units tall!)
 *    - classic: 26x26x40 @ 0.32
 */
export function createTownSquareTreeAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 26 * m, L = 26 * m, H = 40 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  const vs = 0.32 / m;

  return buildVoxelAsset(
    "xmas_giant_tree",
    "Town Square Christmas Tree",
    W,
    L,
    H,
    vs,
    (put) => {
      // 1. Snow-covered octagonal tree skirt & stone planter curb
      for (let z = 0; z < 2 * m; z++) {
        const r = (z === 0 ? 11.4 : 10.6) * m;
        for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= r) {
            const curb = d > r - 1.15 * m;
            put(x, y, z, curb ? [118, 124, 138] : z === 0 ? SNOW_MID : SNOW_HI);
          }
        }
      }

      // 2. Sturdy cedar trunk
      for (let z = m; z < 9 * m; z++) {
        for (let dy = -Math.round(1.6 * m); dy <= Math.round(1.6 * m); dy++) {
          for (let dx = -Math.round(1.6 * m); dx <= Math.round(1.6 * m); dx++) {
            if (Math.hypot(dx, dy) <= 1.65 * m) put(cx + dx, cy + dy, z, DARK_WOOD);
          }
        }
      }

      // 3. Colorful wrapped Christmas presents with ribbons & bows nestled under the boughs!
      const gifts: Array<[number, number, number, number, number, RGB, RGB]> = [
        [-5.2, 4.2, 2.6, 2.4, 2.4, [212, 42, 52], GOLD_TRIM],
        [4.8, 4.6, 2.8, 2.2, 2.2, [44, 114, 198], SNOW_HI],
        [5.6, -3.6, 2.5, 2.6, 2.0, [48, 152, 82], HOLLY_RED],
        [-5.5, -4.2, 2.6, 2.4, 2.6, [232, 174, 52], [186, 36, 48]],
        [0.4, 6.4, 2.4, 2.2, 1.9, [168, 64, 178], GOLD_TRIM],
        [-0.8, -6.2, 2.4, 2.4, 2.1, [218, 86, 46], CREAM_TRIM],
        [6.8, 1.0, 2.1, 2.0, 1.8, [58, 168, 186], GOLD_TRIM],
        [-7.0, 0.4, 2.0, 2.2, 2.0, [214, 48, 92], SNOW_HI],
      ];
      for (const [gx, gy, gw, gl, gh, boxCol, ribCol] of gifts) {
        const x0 = Math.round(cx + (gx - gw * 0.5) * m);
        const x1 = Math.round(cx + (gx + gw * 0.5) * m);
        const y0 = Math.round(cy + (gy - gl * 0.5) * m);
        const y1 = Math.round(cy + (gy + gl * 0.5) * m);
        const mx = Math.round((x0 + x1) * 0.5);
        const my = Math.round((y0 + y1) * 0.5);
        for (let z = 2 * m; z < Math.round((2 + gh) * m); z++) {
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const isRib = Math.abs(x - mx) < Math.max(1, Math.floor(m * 0.6)) || Math.abs(y - my) < Math.max(1, Math.floor(m * 0.6));
            put(x, y, z, isRib ? ribCol : boxCol);
          }
        }
        put(mx, my, Math.round((2 + gh) * m), ribCol);
      }

      // 4. Layered drooping spruce boughs with patchy snow & multi-tone evergreen shading!
      const zStart = 5 * m;
      const zTop = 35 * m;
      for (let z = zStart; z <= zTop; z++) {
        const u = (z - zStart) / (zTop - zStart); // 0 bottom -> 1 top
        // 7 organic drooping pine tier skirts
        const tierPhase = (u * 7.2) % 1;
        const skirt = 1.0 + (1.0 - tierPhase) * 0.28;
        const baseR = (1.0 - Math.pow(u, 0.92)) * 10.6 * skirt * m;
        if (baseR < 0.7) continue;

        for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = y - cy;
          const d = Math.hypot(dx, dy);
          if (d > baseR + 1.4 * m) continue;
          const ang = Math.atan2(dy, dx);
          // Organic branch lobes around circumference
          const lobe = 1.0 + 0.14 * Math.sin(ang * 7.0 + Math.floor(u * 7.2) * 1.3) + 0.08 * Math.cos(ang * 11.0 - u * 6.0);
          const rEff = baseR * lobe;
          if (d > rEff) continue;

          const isOuter = d >= rEff - 1.35 * m;
          const n = hash3(x, y, z, 31);
          // Snow settles softly on top edges of each drooping bough tier!
          const snowTop = tierPhase > 0.62 && isOuter && n > 92;
          if (snowTop) {
            put(x, y, z, n > 180 ? SNOW_HI : SNOW_MID);
          } else {
            const col = !isOuter ? PINE_DARK : (n > 175 ? PINE_HI : n > 75 ? PINE_MID : PINE_DARK);
            put(x, y, z, col);
          }

          // Spiraling golden tinsel garland & sparkling jewel-like Christmas fairy lights on outer boughs!
          if (isOuter && d >= rEff - 0.95 * m && u > 0.04 && u < 0.94) {
            const spiral = (((ang / (Math.PI * 2)) + 1.0 + u * 4.5) % 1.0);
            if (Math.abs(spiral - 0.5) < (m === 2 ? 0.042 : 0.065)) {
              put(x, y, z, GOLD_TRIM, 155);
            } else if (n > (m === 2 ? 243 : 235)) {
              const bulbCol = FAIRY_PAL[n % FAIRY_PAL.length];
              put(x, y, z, bulbCol, 245);
            }
          }
        }
      }

      // 5. Radiant 3D Golden Star Topper (z = 35*m .. 39.5*m)
      const starZ = Math.round(37.2 * m);
      for (let dz = -2 * m; dz <= 2 * m; dz++) {
        for (let dy = -2 * m; dy <= 2 * m; dy++) {
          for (let dx = -2 * m; dx <= 2 * m; dx++) {
            const manh = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
            const axisRay = (Math.abs(dx) <= m * 0.5 && Math.abs(dy) <= m * 0.5) ||
                            (Math.abs(dz) <= m * 0.5 && Math.abs(dy) <= m * 0.5) ||
                            (Math.abs(dz) <= m * 0.5 && Math.abs(dx) <= m * 0.5);
            if (manh <= 1.3 * m || (axisRay && manh <= 2.2 * m)) {
              put(cx + dx, cy + dy, starZ + dz, [255, 232, 118], 255);
            }
          }
        }
      }
    },
    { star: { pos: [cx, cy, 37.5 * m] } },
    [cx, cy, 0],
  );
}

/**
 * 2. GRAND CLOCKTOWER TOWN HALL (North Anchor Landmark of Main Street!)
 *    - ultra: 52x44x92 @ 0.22 (soaring brick & limestone civic landmark with illuminated 4-sided clock!)
 *    - classic: 26x22x46 @ 0.44
 */
export function createClocktowerHallAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 26 * m, L = 22 * m, H = 46 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  const vs = 0.44 / m;

  const BRICK_BASE: RGB = [132, 62, 54];
  const STONE_HI: RGB = [208, 202, 190];
  const STONE_MID: RGB = [166, 160, 150];
  const SLATE_ROOF: RGB = [52, 62, 82];
  const COPPER_SPIRE: RGB = [68, 128, 116];

  return buildVoxelAsset(
    "xmas_clocktower",
    "Grand Clocktower Town Hall",
    W,
    L,
    H,
    vs,
    (put) => {
      // 1. Stone foundation steps & grand main civic hall (z = 0..17*m, y = 2*m..18*m)
      const bx0 = 1 * m, bx1 = W - 1 - 1 * m;
      const by0 = 2 * m, by1 = L - 1 - 4 * m;
      const wallH = 16 * m;

      for (let z = 0; z < wallH; z++) {
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          const onEdge = x === bx0 || x === bx1 || y === by0 || y === by1;
          if (!onEdge) continue;
          const quoin = (x <= bx0 + m || x >= bx1 - m) && (y <= by0 + m || y >= by1 - m);
          const stoneBand = z < 2 * m || z === 8 * m || z === wallH - 1;
          if (quoin || stoneBand) {
            put(x, y, z, z === 0 ? STONE_MID : STONE_HI);
            continue;
          }
          // Tall recessed glowing mullioned arched windows along front/back/sides!
          const u = (y === by0 || y === by1) ? (x - bx0) : (y - by0);
          const span = (y === by0 || y === by1) ? (bx1 - bx0) : (by1 - by0);
          const inWinCol = u >= 3 * m && u <= span - 3 * m && ((u % (4 * m)) >= m && (u % (4 * m)) < 3 * m);
          const inWinRow = (z >= 3 * m && z <= 6 * m) || (z >= 10 * m && z <= 14 * m);
          // Front central doorway arch (y === by1)
          const isFrontDoor = y === by1 && Math.abs(x - cx) <= 2.4 * m && z < 7 * m;
          if (isFrontDoor) {
            const frame = Math.abs(x - cx) >= 1.8 * m || z >= 6 * m;
            put(x, y, z, frame ? STONE_HI : DARK_WOOD);
            if (!frame && z >= 4 * m && Math.abs(x - cx) <= 1.2 * m) put(x, y, z, WARM_WIN_HI, 130);
          } else if (inWinCol && inWinRow) {
            const mullion = (m === 2 && ((u % (4 * m)) === 2 * m || z === 12 * m));
            if (mullion) put(x, y, z, CREAM_TRIM);
            else put(x, y, z, z >= 10 * m ? WARM_WIN_HI : WARM_WIN_MID, 128);
          } else {
            const bv = ((hash3(x, y, z, 11) & 15) - 7);
            put(x, y, z, tintRgb(BRICK_BASE, bv));
          }
        }
      }

      // 2. Front Classical Columned Entrance Portico + Pediment + Wreath (+Y front)
      for (let x = Math.round(cx - 5 * m); x <= Math.round(cx + 5 * m); x++) {
        for (let y = by1; y <= by1 + 3 * m; y++) {
          put(x, y, 0, STONE_MID);
          put(x, y, 1 * m, STONE_HI);
        }
      }
      // 4 white classical portico columns + warm porch lanterns!
      for (const ox of [-4.2, -1.8, 1.8, 4.2]) {
        const px = Math.round(cx + ox * m);
        for (let z = 1 * m; z < 9 * m; z++) put(px, by1 + 2.6 * m, z, STONE_HI);
      }
      put(Math.round(cx - 2.6 * m), by1 + 2 * m, 5 * m, FAIRY_WARM, 235);
      put(Math.round(cx + 2.6 * m), by1 + 2 * m, 5 * m, FAIRY_WARM, 235);
      // Snowy triangular gable roof over portico
      for (let step = 0; step <= 3 * m; step++) {
        const z = 9 * m + step;
        const half = Math.round(5.4 * m - step * 1.45);
        for (let y = by1; y <= by1 + 3 * m; y++) {
          for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
            const topSnow = step >= 3 * m - m || Math.abs(x - cx) >= half - m;
            put(x, y, z, topSnow ? SNOW_HI : STONE_HI);
          }
        }
      }
      drawWreath(put, cx, by1 + 3 * m, Math.round(10.2 * m), m);

      // 3. Smooth fluffy snow-blanketed pitched slate roof (coherent snowdrifts, zero noisy speckling!)
      for (let step = 0; step <= 6 * m; step++) {
        const z = wallH + step;
        const u = step / (6 * m);
        const inset = Math.round(step * 1.05);
        for (let y = by0 - 1 + inset; y <= by1 + 1 - inset; y++) {
          for (let x = bx0 - 1 + Math.floor(inset * 0.45); x <= bx1 + 1 - Math.floor(inset * 0.45); x++) {
            const onShell = x <= bx0 + Math.floor(inset * 0.45) || x >= bx1 - Math.floor(inset * 0.45) ||
                            y <= by0 + inset || y >= by1 - inset || step === 6 * m;
            if (!onShell) continue;
            const driftWave = Math.sin(x * (0.28 / m) + y * (0.22 / m)) * 0.5 + 0.5;
            const eaveSlate = step === 0 && driftWave < 0.45;
            if (eaveSlate) put(x, y, z, SLATE_ROOF);
            else put(x, y, z, u > 0.55 || driftWave > 0.58 ? SNOW_HI : u > 0.22 ? SNOW_MID : SNOW_SHADE);
          }
        }
      }
      // String of warm golden fairy bulbs lining front roofline eave!
      for (let x = bx0; x <= bx1; x += 2 * m) {
        put(x, by1 + 1, wallH - 1, FAIRY_WARM, 235);
      }

      // 4. Soaring Central Square Clocktower Rising to z = 35*m!
      const tw = 4.6 * m;
      const tcx = cx, tcy = by0 + (by1 - by0) * 0.52;
      for (let z = wallH; z < 35 * m; z++) {
        const x0 = Math.round(tcx - tw), x1 = Math.round(tcx + tw);
        const y0 = Math.round(tcy - tw), y1 = Math.round(tcy + tw);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const onEdge = x === x0 || x === x1 || y === y0 || y === y1;
          if (!onEdge) continue;
          const corner = (x <= x0 + m * 0.6 || x >= x1 - m * 0.6) && (y <= y0 + m * 0.6 || y >= y1 - m * 0.6);
          const cornice = z === 24 * m || z === 34 * m;
          if (corner || cornice) {
            put(x, y, z, STONE_HI);
            continue;
          }
          // Illuminated 4-sided Clockface at z = 26*m .. 33*m!
          const clkZ = 29.5 * m;
          const u = (y === y0 || y === y1) ? (x - tcx) : (y - tcy);
          const dClk = Math.hypot(u, z - clkZ);
          if (dClk <= 3.1 * m) {
            if (dClk >= 2.55 * m) {
              put(x, y, z, GOLD_TRIM);
            } else {
              // Crisp dark clock hands pointing to 11:55 PM on Christmas Eve!!
              const dz = z - clkZ;
              const isMinHand = dz > 0 && Math.abs(u + dz * 0.25) < 0.48 * m && dz < 2.2 * m;
              const isHrHand = dz > 0 && Math.abs(u - dz * 0.45) < 0.48 * m && dz < 1.45 * m;
              const isCenter = dClk < 0.55 * m;
              if (isMinHand || isHrHand || isCenter) put(x, y, z, IRON_DARK);
              else put(x, y, z, [254, 240, 198], 138);
            }
          } else {
            const bv = ((hash3(x, y, z, 27) & 15) - 7);
            put(x, y, z, tintRgb(BRICK_BASE, bv));
          }
        }
      }

      // 5. Steep Copper-Patina Clocktower Spire + Smooth Snow Collar + Golden Finial!
      for (let z = 35 * m; z < H - m; z++) {
        const u = (z - 35 * m) / (H - m - 35 * m);
        const rad = Math.max(0.45, (1 - u) * (tw + 0.6 * m));
        for (let y = Math.round(tcy - rad); y <= Math.round(tcy + rad); y++) {
          for (let x = Math.round(tcx - rad); x <= Math.round(tcx + rad); x++) {
            const onFace = Math.abs(x - tcx) >= rad - 1.1 || Math.abs(y - tcy) >= rad - 1.1;
            if (!onFace) continue;
            const drift = Math.sin(x * (0.4 / m) - y * (0.35 / m)) * 0.08;
            const snowCollar = u < (0.24 + drift);
            put(x, y, z, snowCollar ? (u < 0.12 ? SNOW_HI : SNOW_MID) : COPPER_SPIRE);
          }
        }
      }
      put(tcx, tcy, H - 1, GOLD_TRIM, 240);
    },
    {},
    [cx, cy, 0],
  );
}

export type ShopStyle = "toys" | "bakery" | "books" | "cinema" | "jeweler" | "tavern";

/**
 * 3. SIX DISTINCT HANDCRAFTED VICTORIAN MAIN STREET SHOPFRONTS!
 *    Front facade faces +Y (rotated cleanly when placed along West or East Main Street).
 *    Every shop features:
 *      - Brick/clapboard/timber micro-texture + stone trim & quoins
 *      - 2-voxel recessed glowing bay display windows with miniature toys/books/trees inside!
 *      - Striped snow-topped canvas awning OR glowing vintage Art Deco Cinema Marquee!
 *      - Second-floor mullioned windows with Christmas wreaths + glowing garlands
 *      - Snow-blanketed pitched/mansard roof with dormer windows, brick chimney & hanging icicles!
 */
export function createVictorianShopAsset(id: string, style: ShopStyle, seed: number, detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 20 * m;
  const L = 18 * m;
  const wallH = (style === "cinema" ? 17 : style === "books" ? 16 : 15) * m;
  const roofH = (style === "cinema" ? 5 : 8) * m;
  const H = wallH + roofH + 2 * m;
  const vs = 0.44 / m;

  const palettes: Record<ShopStyle, { wall: RGB; trim: RGB; awningA: RGB; awningB: RGB; roof: RGB; win: RGB }> = {
    toys: { wall: [148, 56, 52], trim: [232, 224, 206], awningA: [204, 38, 44], awningB: [242, 238, 230], roof: [54, 62, 78], win: WARM_WIN_HI },
    bakery: { wall: [214, 198, 174], trim: [84, 56, 42], awningA: [36, 108, 68], awningB: [236, 226, 206], roof: [88, 58, 52], win: WARM_WIN_MID },
    books: { wall: [48, 66, 98], trim: [222, 214, 198], awningA: [148, 44, 52], awningB: [224, 184, 88], roof: [52, 58, 72], win: WARM_WIN_MID },
    cinema: { wall: [138, 74, 62], trim: [236, 222, 188], awningA: [198, 42, 48], awningB: [252, 214, 114], roof: [46, 52, 68], win: WARM_WIN_HI },
    jeweler: { wall: [64, 106, 86], trim: [232, 216, 184], awningA: [32, 72, 62], awningB: [224, 184, 82], roof: [58, 64, 80], win: WARM_WIN_HI },
    tavern: { wall: [118, 98, 82], trim: [72, 48, 36], awningA: [138, 46, 42], awningB: [216, 204, 184], roof: [76, 52, 48], win: WARM_WIN_DEEP },
  };
  const pal = palettes[style];
  const bx0 = 1 * m, bx1 = W - 1 - 1 * m;
  const by0 = 1 * m, by1 = L - 1 - 3 * m; // Leave 3*m in front (+Y) for awnings, marquee, porch & wreaths!

  return buildVoxelAsset(
    id,
    `Main Street Shop (${style})`,
    W,
    L,
    H,
    vs,
    (put) => {
      // 1. Snow-dusted foundation plinth & textured walls
      for (let z = 0; z < wallH; z++) {
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          const onEdge = x === bx0 || x === bx1 || y === by0 || y === by1;
          if (!onEdge) continue;
          const isFront = y === by1;
          const corner = (x <= bx0 + m * 0.6 || x >= bx1 - m * 0.6) && (y <= by0 + m * 0.6 || y >= by1 - m * 0.6);
          const band = z === 0 || z === 7 * m || z === wallH - 1;

          // Recessed Ground-Floor Shopfront Display Windows & Central Door (+Y front)!
          if (isFront && z >= 1 * m && z < 7 * m && x >= bx0 + 2 * m && x <= bx1 - 2 * m) {
            const dxC = Math.abs(x - (W - 1) * 0.5);
            if (dxC < 1.8 * m) {
              // Shop door with glowing upper glass pane & brass handle
              const glass = z >= 3.5 * m && z < 6 * m && dxC < 1.15 * m;
              put(x, y - (m === 2 ? 1 : 0), z, glass ? pal.win : DARK_WOOD, glass ? 124 : 0);
              if (m === 2 && Math.abs(dxC - 1.5 * m) < 0.7) put(x, y, z, pal.trim);
              continue;
            }
            // Wide glowing bay display windows (recessed 1 voxel inward with miniature interior displays!)
            if (z >= 2 * m && z < 6 * m && dxC >= 2.4 * m && dxC <= 6.8 * m) {
              const mullion = m === 2 && (Math.abs(dxC - 4.6 * m) < 0.55 || z === 4 * m);
              if (mullion) {
                put(x, y, z, pal.trim);
              } else {
                // Interior toy/book/bakery silhouette color variation inside warm glowing glass!
                const r = hash3(x, z, 3, seed);
                let winCol = pal.win;
                if (z < 3.2 * m) {
                  if (style === "toys") winCol = r > 170 ? [228, 68, 68] : r > 100 ? [72, 168, 92] : [244, 198, 72];
                  else if (style === "books") winCol = r > 160 ? [188, 68, 62] : r > 90 ? [68, 124, 178] : [214, 172, 82];
                  else if (style === "bakery") winCol = [238, 186, 108];
                }
                put(x, y - (m === 2 ? 1 : 0), z, winCol, 134);
              }
              continue;
            }
            if (z === 1 * m) {
              put(x, y, z, DARK_WOOD);
              continue;
            }
          }

          // Second-floor crisp mullioned Victorian windows (front +Y, back -Y, AND side gables for corner inns!)
          if ((isFront || y === by0 || x === bx0 || x === bx1) && z >= 9 * m && z <= 13 * m && style !== "cinema") {
            const onSide = (x === bx0 || x === bx1) && !isFront && y !== by0;
            const relU = onSide ? (y - by0) : (x - bx0);
            const spanU = onSide ? (by1 - by0) : (bx1 - bx0);
            const winPos = onSide
              ? [Math.round(spanU * 0.34), Math.round(spanU * 0.66)]
              : [Math.round(spanU * 0.24), Math.round(spanU * 0.50), Math.round(spanU * 0.76)];
            let hitWin = false;
            for (let wi = 0; wi < winPos.length; wi++) {
              const d = Math.abs(relU - winPos[wi]);
              if (d <= 1.45 * m) {
                hitWin = true;
                const isFrame = d >= 1.2 * m || z === 9 * m || z === 13 * m;
                const isBar = m === 2 && (d < 0.45 || z === 11 * m);
                if (isFrame || isBar) {
                  put(x, y, z, pal.trim);
                } else {
                  const lit = hash3(wi, seed, onSide ? 3 : isFront ? 1 : 2, seed) > 52;
                  put(x, y - (isFront && m === 2 ? 1 : 0), z, lit ? pal.win : [22, 28, 44], lit ? 120 : 0);
                }
                break;
              }
            }
            if (hitWin) continue;
          }

          // Tudor half-timber beams on Bakery & Tavern!
          const tudorBeam = (style === "bakery" || style === "tavern") &&
            (z === 11 * m || ((x - bx0) % (4 * m) === 0));
          if (corner || band || tudorBeam) {
            put(x, y, z, tudorBeam ? DARK_WOOD : pal.trim);
          } else {
            const grain = ((hash3(x, y, z, seed) & 15) - 7);
            put(x, y, z, tintRgb(pal.wall, grain));
          }
        }
      }

      // 2. Front Architectural Feature: Vintage Cinema Marquee OR Striped Snow-Topped Shop Awning!
      if (style === "cinema") {
        // Iconic protruding glowing Art Deco triangular marquee canopy!
        for (let dy = 1; dy <= 3 * m; dy++) {
          const inset = Math.floor(dy * 0.45);
          const mx0 = bx0 + 2 * m + inset;
          const mx1 = bx1 - 2 * m - inset;
          for (let x = mx0; x <= mx1; x++) {
            put(x, by1 + dy, 7 * m, [252, 232, 168], 165);
            put(x, by1 + dy, 8 * m, [196, 42, 48]);
            put(x, by1 + dy, 9 * m, SNOW_HI); // snow cap on top of marquee!
            // Sparkling warm marquee chaser bulbs along front rim!
            if ((dy === 3 * m || x === mx0 || x === mx1) && ((x + dy) % Math.max(1, m) === 0)) {
              put(x, by1 + dy, 7 * m + (m === 2 ? 1 : 0), FAIRY_WARM, 250);
            }
          }
        }
        // Vertical glowing vintage CINEMA blade sign!
        const sx = Math.round((W - 1) * 0.5);
        for (let z = 10 * m; z <= 16 * m; z++) {
          for (let dy = 1; dy <= 2 * m; dy++) {
            const isBulb = dy === 2 * m && (z % m === 0);
            put(sx, by1 + dy, z, isBulb ? FAIRY_RED : [255, 212, 92], isBulb ? 255 : 175);
          }
        }
      } else {
        // Striped Victorian shopfront canvas awning with thick snow lip & festive lights!
        for (let dy = 1; dy <= 2 * m; dy++) {
          const az = 7 * m - Math.floor((dy - 1) * 0.65);
          for (let x = bx0 + 1 * m; x <= bx1 - 1 * m; x++) {
            const stripe = (Math.floor(x / m) & 1) === 0;
            put(x, by1 + dy, az, stripe ? pal.awningA : pal.awningB);
            put(x, by1 + dy, az + 1, SNOW_HI); // fresh snow lip sitting on awning!
          }
        }
        // Festive hanging Christmas wreaths above the door & flanking windows!
        drawWreath(put, (W - 1) * 0.5, by1 + 1, Math.round(8.2 * m), m);
        // Warm glowing porch entrance lanterns
        put(Math.round((W - 1) * 0.5 - 2.1 * m), by1 + 1, Math.round(5.4 * m), FAIRY_WARM, 235);
        put(Math.round((W - 1) * 0.5 + 2.1 * m), by1 + 1, Math.round(5.4 * m), FAIRY_WARM, 235);
      }

      // 3. Snow-Blanketed Pitched Roof + Attic Dormer Window + Hanging Icicles + Brick Chimney!
      if (style === "cinema") {
        // Art Deco stepped parapet crown with thick snow blanket
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          const edge = x === bx0 || x === bx1 || y === by0 || y === by1;
          put(x, y, wallH, edge ? pal.trim : SNOW_HI);
          if (edge && y === by1) {
            const archH = Math.round(Math.max(0, 3 * m - Math.abs(x - (W - 1) * 0.5) * 0.45));
            for (let dz = 1; dz <= archH; dz++) put(x, y, wallH + dz, dz === archH ? SNOW_HI : pal.trim);
          }
        }
      } else {
        // Classic snow-laden Victorian pitched roof running left-to-right (front eave on +Y)
        const halfDepth = (by1 - by0) * 0.5;
        const midY = (by0 + by1) * 0.5;
        for (let step = 0; step <= roofH; step++) {
          const z = wallH + step;
          const u = step / roofH;
          const ySpan = Math.max(0.5, (1 - u) * (halfDepth + 1.1 * m));
          for (let x = bx0 - m * 0.5; x <= bx1 + m * 0.5; x++) {
            const onGable = x <= bx0 || x >= bx1;
            for (let y = Math.round(midY - ySpan); y <= Math.round(midY + ySpan); y++) {
              const onSlope = Math.abs(y - midY) >= ySpan - 1.25;
              if (!onSlope && !onGable) continue;
              if (onGable && !onSlope) {
                put(x, y, z, pal.wall);
              } else {
                // Smooth lush winter snowdrift blanket over roof slopes (zero noisy per-voxel dark speckles!)
                const drift = Math.sin(x * (0.28 / m) + seed) * 0.5 + 0.5;
                const bottomEave = step === 0 && drift < 0.42;
                if (bottomEave) put(x, y, z, pal.roof);
                else put(x, y, z, u > 0.56 || drift > 0.62 ? SNOW_HI : u > 0.20 ? SNOW_MID : SNOW_SHADE);
              }
            }
          }
        }
        // Cozy glowing attic Dormer Window peeking out the front snowy roof!
        const dcx = Math.round((W - 1) * 0.5);
        for (let z = wallH + m; z <= wallH + 4 * m; z++) {
          for (let dx = -2 * m; dx <= 2 * m; dx++) {
            const isWin = Math.abs(dx) <= m && z >= wallH + 2 * m && z <= wallH + 3.5 * m;
            put(dcx + dx, by1 - m, z, isWin ? pal.win : pal.trim, isWin ? 122 : 0);
          }
        }
        for (let dx = -2.4 * m; dx <= 2.4 * m; dx++) {
          put(dcx + dx, by1 - m, wallH + 4 * m + 1, SNOW_HI);
        }
      }

      // Warm glowing icicle fairy lights & glistening crystal icicles along front roofline eave!
      for (let x = bx0; x <= bx1; x += Math.max(1, m)) {
        const phase = Math.floor(x / m);
        if (phase % 2 === 0) {
          put(x, by1 + 1, wallH - 1, FAIRY_PAL[(phase + seed) % FAIRY_PAL.length], 235);
        } else if (m === 2 && (phase % 3 === 1)) {
          put(x, by1 + 1, wallH - 2, ICE_ICICLE);
          put(x, by1 + 1, wallH - 3, ICE_ICICLE);
        }
      }

      // Red Brick Chimney topped with a snowy rim
      const chX = bx1 - 3 * m, chY = by0 + 3 * m;
      for (let z = wallH + 2 * m; z <= H - 1; z++) {
        for (let dy = -m * 0.7; dy <= m * 0.7; dy++) for (let dx = -m * 0.7; dx <= m * 0.7; dx++) {
          put(chX + dx, chY + dy, z, z === H - 1 ? SNOW_HI : [126, 60, 54]);
        }
      }
    },
    {
      eaveL: { pos: [bx0, by1 + 1, wallH - 1] },
      eaveR: { pos: [bx1, by1 + 1, wallH - 1] },
    },
    [W * 0.5, L * 0.5, 0],
  );
}

/**
 * 4. COZY ALPINE WOODEN CHRISTMAS MARKET STALL (Town Square booths serving cocoa & ornaments!)
 */
export function createMarketStallAsset(id: string, roofColor: RGB, detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 12 * m, L = 10 * m, H = 12 * m;
  const vs = 0.34 / m;

  return buildVoxelAsset(
    id,
    "Christmas Market Stall",
    W,
    L,
    H,
    vs,
    (put) => {
      // Timber counter base & back wall
      for (let z = 0; z < 4 * m; z++) {
        for (let y = m; y <= L - 2 * m; y++) for (let x = m; x <= W - 2 * m; x++) {
          const edge = x === m || x === W - 2 * m || y === m || y === L - 2 * m || z === 4 * m - 1;
          if (edge) put(x, y, z, z === 4 * m - 1 ? [146, 102, 68] : [102, 66, 44]);
        }
      }
      // Corner timber posts + warm hanging counter goods & cocoa mugs
      for (const [px, py] of [[m, m], [W - 2 * m, m], [m, L - 2 * m], [W - 2 * m, L - 2 * m]]) {
        for (let z = 4 * m; z < 8 * m; z++) put(px, py, z, DARK_WOOD);
      }
      // Back timber wall + warm glowing lantern inside booth
      for (let z = 4 * m; z < 8 * m; z++) {
        for (let x = m; x <= W - 2 * m; x++) put(x, m, z, [96, 62, 42]);
      }
      put(W * 0.5, L * 0.5, 7 * m, FAIRY_WARM, 240);
      put(W * 0.5 - 2 * m, L * 0.5, 7 * m, FAIRY_WARM, 220);
      put(W * 0.5 + 2 * m, L * 0.5, 7 * m, FAIRY_WARM, 220);
      // Striped snow-topped pitched booth roof + garland
      for (let step = 0; step <= 3 * m; step++) {
        const z = 8 * m + step;
        const inset = step;
        for (let y = inset; y <= L - 1 - inset; y++) for (let x = 0; x < W; x++) {
          const stripe = (Math.floor(x / m) & 1) === 0;
          put(x, y, z, step >= 2 * m ? SNOW_HI : stripe ? roofColor : CREAM_TRIM);
        }
      }
      for (let x = m; x <= W - 2 * m; x += m) {
        put(x, L - 1 - m, 8 * m - 1, (Math.floor(x / m) & 1) === 0 ? PINE_HI : FAIRY_WARM, (Math.floor(x / m) & 1) === 0 ? 0 : 230);
      }
    },
    {},
    [W * 0.5, L * 0.5, 0],
  );
}

/**
 * 5. VINTAGE CRIMSON & FOREST-GREEN HOLIDAY STREETCAR / TROLLEY!
 *    Glides down Main Street iron tracks with glowing warm windows, roof snowcap, brass headlight & front wreath!
 */
export function createHolidayTrolleyAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 13 * m, L = 30 * m, H = 16 * m;
  const cx = (W - 1) * 0.5;
  const vs = 0.28 / m;

  const RED_BODY: RGB = [184, 34, 42];
  const CREAM_BAND: RGB = [238, 228, 206];
  const GREEN_TRIM: RGB = [32, 86, 56];

  return buildVoxelAsset(
    "xmas_trolley",
    "Vintage Holiday Trolley",
    W,
    L,
    H,
    vs,
    (put) => {
      // Undercarriage & steel bogie wheels
      for (let y = 3 * m; y <= L - 4 * m; y++) {
        for (let x = Math.round(cx - 3.6 * m); x <= Math.round(cx + 3.6 * m); x++) {
          put(x, y, 1 * m, IRON_DARK);
        }
      }
      for (const wy of [6 * m, 10 * m, 20 * m, 24 * m]) {
        for (const sgn of [-1, 1]) {
          put(cx + sgn * 3.8 * m, wy, 0, [52, 58, 72]);
          put(cx + sgn * 3.8 * m, wy, 1 * m, [76, 84, 102]);
        }
      }

      // Sculpted vintage streetcar body with warm glowing arched passenger windows!
      for (let y = 2 * m; y <= L - 3 * m; y++) {
        const isEnd = y <= 3 * m || y >= L - 4 * m;
        const halfW = isEnd ? 3.8 * m : 4.5 * m;
        for (let z = 2 * m; z < 11 * m; z++) {
          for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
            const onShell = Math.abs(x - cx) >= halfW - 1 || y === 2 * m || y === L - 3 * m;
            if (!onShell) continue;
            if (z < 5 * m) {
              put(x, y, z, z === 4 * m ? GOLD_TRIM : RED_BODY);
            } else if (z < 9 * m) {
              // Warm illuminated passenger windows with cream mullions!
              const isWinSide = Math.abs(x - cx) >= halfW - 1 && y > 4 * m && y < L - 5 * m && ((y % (3 * m)) >= m);
              const isWinEnd = (y === 2 * m || y === L - 3 * m) && Math.abs(x - cx) <= 2.6 * m && z >= 6 * m;
              if (isWinSide || isWinEnd) {
                put(x, y, z, WARM_WIN_HI, 136);
              } else {
                put(x, y, z, CREAM_BAND);
              }
            } else {
              put(x, y, z, GREEN_TRIM);
            }
          }
        }
      }

      // Clerestory roof piled with fresh snow + festive roof fairy lights + angled brass trolley pole!
      for (let y = 2 * m; y <= L - 3 * m; y++) {
        for (let x = Math.round(cx - 4.4 * m); x <= Math.round(cx + 4.4 * m); x++) {
          put(x, y, 11 * m, SNOW_MID);
          if (Math.abs(x - cx) <= 2.6 * m && y >= 5 * m && y <= L - 6 * m) {
            put(x, y, 12 * m, GREEN_TRIM);
            put(x, y, 13 * m, SNOW_HI);
          }
        }
        if (y % (2 * m) === 0) {
          put(Math.round(cx - 4.6 * m), y, 10 * m, FAIRY_WARM, 230);
          put(Math.round(cx + 4.6 * m), y, 10 * m, FAIRY_WARM, 230);
        }
      }
      // Brass pantograph / trolley pole
      for (let i = 0; i < 4 * m; i++) {
        put(cx, Math.round(L * 0.5 - i * 1.1), 13 * m + Math.floor(i * 0.7), GOLD_TRIM);
      }

      // Glowing golden brass headlamps (+Y front & -Y rear) + Christmas wreath on front bumper!
      put(cx, L - 2 * m, 4 * m, [255, 248, 196], 255);
      put(cx, L - 2 * m, 10 * m, [255, 244, 178], 240);
      put(cx, 1 * m, 4 * m, FAIRY_RED, 235);
      drawWreath(put, cx, L - 2 * m, Math.round(5.4 * m), Math.max(1, m - 1));
    },
    { headlight: { pos: [cx, L - 1 * m, 4 * m], dir: [0, 1, -0.2] } },
    [cx, L * 0.5, 0],
  );
}

/**
 * 6. VINTAGE 1950s WOODY STATION WAGON WITH A SNOWY CHRISTMAS TREE TIED TO THE ROOF!
 */
export function createWoodyWagonAsset(id: string, paintColor: RGB, detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 8 * m, L = 16 * m, H = 10 * m;
  const cx = (W - 1) * 0.5;
  const vs = 0.28 / m;
  const WOOD_PANEL: RGB = [156, 104, 56];

  return buildVoxelAsset(
    id,
    "Holiday Woody Wagon",
    W,
    L,
    H,
    vs,
    (put) => {
      // Body & woodgrain side panels
      for (let y = 2 * m; y <= 13 * m; y++) for (let x = 1 * m; x <= 6 * m; x++) {
        const isSide = x === 1 * m || x === 6 * m;
        put(x, y, 1 * m, paintColor);
        put(x, y, 2 * m, isSide && y >= 4 * m && y <= 11 * m ? WOOD_PANEL : paintColor);
      }
      // Greenhouse windows & snowy roof
      for (let y = 3 * m; y <= 10 * m; y++) for (let x = 1.5 * m; x <= 5.5 * m; x++) {
        const isWin = y === 3 * m || y === 10 * m || x <= 2 * m || x >= 5 * m;
        put(x, y, 3 * m, isWin ? WARM_WIN_MID : paintColor, isWin ? 95 : 0);
        put(x, y, 4 * m, SNOW_HI);
      }
      // Fresh-cut snowy pine tree strapped onto the roof rack!
      for (let y = 2 * m; y <= 11 * m; y++) {
        const r = Math.max(0.5, (11 * m - y) * 0.24);
        for (let dz = 0; dz <= Math.ceil(r); dz++) {
          for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
            if (Math.hypot(dx, dz) <= r) {
              put(cx + dx, y, 5 * m + dz, dz >= r - 0.8 ? SNOW_HI : PINE_HI);
            }
          }
        }
      }
      // Wheels, glowing headlights (+Y) & red taillights (-Y)
      for (const [wx, wy] of [[1 * m, 4 * m], [6 * m, 4 * m], [1 * m, 11 * m], [6 * m, 11 * m]]) {
        put(wx, wy, 0, IRON_DARK);
      }
      put(1.5 * m, 14 * m, 2 * m, [255, 246, 186], 250);
      put(5.5 * m, 14 * m, 2 * m, [255, 246, 186], 250);
      put(1.5 * m, 1 * m, 2 * m, FAIRY_RED, 235);
      put(5.5 * m, 1 * m, 2 * m, FAIRY_RED, 235);
    },
    {},
    [cx, L * 0.5, 0],
  );
}

/**
 * 7. SANTA'S 6-DOF SLEIGH + 4 REINDEER TEAM WITH RUDOLPH'S GLOWING RUBY NOSE!
 *    Soars overhead in the starry Christmas Eve sky trailing sparkling golden stardust!
 */
export function createSantaSleighAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 18 * m, L = 44 * m, H = 14 * m;
  const cx = (W - 1) * 0.5;
  const vs = 0.28 / m;
  const SLEIGH_RED: RGB = [206, 32, 42];
  const REINDEER: RGB = [132, 86, 52];
  const REINDEER_HI: RGB = [166, 116, 74];

  return buildVoxelAsset(
    "santa_sleigh",
    "Santa's Sleigh & Reindeer",
    W,
    L,
    H,
    vs,
    (put) => {
      // 1. Curved golden sleigh runners (y = 2*m..17*m)
      for (const sgn of [-1, 1]) {
        const rx = cx + sgn * 3.4 * m;
        for (let y = 2 * m; y <= 17 * m; y++) {
          const curl = y > 14 * m ? Math.round((y - 14 * m) * 0.9) : 0;
          put(rx, y, 1 * m + curl, GOLD_TRIM, 150);
        }
        put(rx, 5 * m, 2 * m, GOLD_TRIM);
        put(rx, 13 * m, 2 * m, GOLD_TRIM);
      }

      // 2. Sculpted Victorian Curved Crimson & Gold Sleigh Hull (swept backrest + swooping cutout sides!)
      for (let y = 3 * m; y <= 16 * m; y++) {
        const yn = y / m;
        const sideTop = yn < 6.5 ? 7.6 - (yn - 3) * 0.35 : yn < 12.5 ? 5.2 + Math.sin((yn - 6.5) * 0.45) * 0.5 : 6.4;
        const halfW = yn > 13.5 ? Math.max(2.0, 3.6 - (yn - 13.5) * 0.55) * m : 3.6 * m;
        for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x++) {
          for (let z = 3 * m; z <= Math.round(sideTop * m); z++) {
            const side = Math.abs(x - cx) >= halfW - m * 0.85 || y <= 4 * m || y >= 15 * m || z === 3 * m;
            if (!side) continue;
            const isRim = z >= Math.round(sideTop * m) - (m === 2 ? 1 : 0);
            const isGoldScroll = Math.abs(z - 4.5 * m) < 0.6 * m && Math.abs(yn - 9.5) < 3.0;
            put(x, y, z, isRim || isGoldScroll ? GOLD_TRIM : SLEIGH_RED);
          }
        }
      }
      // Toy sack & colorful wrapped gifts stacked in back of sleigh!
      for (let y = 4 * m; y <= 8 * m; y++) for (let x = Math.round(cx - 2.4 * m); x <= Math.round(cx + 2.4 * m); x++) {
        for (let z = 4 * m; z <= 8 * m; z++) {
          if (Math.hypot((x - cx) / m, (y - 6 * m) / m, (z - 5.5 * m) / m) <= 2.6) {
            put(x, y, z, z > 7 * m ? [48, 162, 88] : [148, 108, 68]);
          }
        }
      }
      // Santa Claus (crimson coat, white fur trim, snowy beard & red cap!)
      for (let z = 5 * m; z <= 9 * m; z++) {
        for (let dy = -m; dy <= m; dy++) for (let dx = -m; dx <= m; dx++) {
          const col = z >= 8.5 * m ? SLEIGH_RED : z >= 7.5 * m ? [246, 206, 178] : z === 5 * m ? SNOW_HI : SLEIGH_RED;
          put(cx + dx, 10.5 * m + dy, z, col);
        }
      }
      put(cx, 10.5 * m, 10 * m, SNOW_HI); // pom-pom!

      // 3. Glowing golden reins connecting sleigh to twin reindeer pairs + Rudolph!
      const deerPos: Array<[number, number, boolean]> = [
        [-2.8, 25, false], [2.8, 25, false],
        [-2.8, 34, false], [2.8, 34, false],
        [0.0, 40, true], // Rudolph leading out front!
      ];
      for (const sgn of [-1, 1]) {
        for (let y = 15 * m; y <= 39 * m; y += Math.max(1, m)) {
          put(cx + sgn * 2.2 * m, y, 5 * m, GOLD_TRIM, 160);
        }
      }
      for (const [dxOff, yOff, isRudolph] of deerPos) {
        const dx = cx + dxOff * m;
        const dy = yOff * m;
        // Body
        for (let y = dy - 2.2 * m; y <= dy + 1.8 * m; y++) {
          for (let z = 4 * m; z <= 6 * m; z++) {
            put(dx, y, z, z === 6 * m ? REINDEER_HI : REINDEER);
            if (m === 2) put(dx + 1, y, z, REINDEER);
          }
        }
        // Galloping legs
        put(dx, dy + 1.5 * m, 3 * m, REINDEER);
        put(dx, dy - 2.0 * m, 3 * m, REINDEER);
        // Neck, head & antlers
        for (let z = 6 * m; z <= 8 * m; z++) put(dx, dy + 1.8 * m, z, REINDEER_HI);
        put(dx, dy + 2.6 * m, 8 * m, REINDEER_HI);
        put(dx - m, dy + 1.6 * m, 9 * m, [196, 178, 146]);
        put(dx + m, dy + 1.6 * m, 9 * m, [196, 178, 146]);
        // Rudolph's bright glowing ruby-red nose!!
        if (isRudolph) {
          put(dx, dy + 3.4 * m, 8 * m, FAIRY_RED, 255);
          if (m === 2) put(dx + 1, dy + 3.4 * m, 8 * m, FAIRY_RED, 255);
        }
      }
    },
    {
      runnerL: { pos: [cx - 3.4 * m, 2 * m, 1.2 * m] },
      runnerR: { pos: [cx + 3.4 * m, 2 * m, 1.2 * m] },
      nose: { pos: [cx, 43.4 * m, 8 * m] },
    },
    [cx, 18 * m, 5 * m],
  );
}

/** 8. Ornate Victorian Cast-Iron Streetlamp wrapped in pine garland & red bow with warm frosted lantern! */
export function createVictorianLampAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 5 * m, L = 5 * m, H = 15 * m;
  const cx = Math.floor(W * 0.5), cy = Math.floor(L * 0.5);
  return buildVoxelAsset(
    "xmas_lamp",
    "Victorian Holiday Lamp",
    W,
    L,
    H,
    0.34 / m,
    (put) => {
      // Fluted cast-iron base
      for (let z = 0; z < 3 * m; z++) {
        put(cx, cy, z, IRON_DARK);
        if (z < m) { put(cx - 1, cy, z, IRON_DARK); put(cx + 1, cy, z, IRON_DARK); put(cx, cy - 1, z, IRON_DARK); put(cx, cy + 1, z, IRON_DARK); }
      }
      // Slender iron post + spiraling evergreen garland & red bow!
      for (let z = 3 * m; z <= 10 * m; z++) {
        put(cx, cy, z, z % (2 * m) === 0 ? PINE_HI : IRON_DARK);
      }
      put(cx + 1, cy, 9 * m, PINE_HI);
      put(cx - 1, cy, 9 * m, HOLLY_RED);
      // Warm frosted 4-pane glass lantern + snowy iron cap
      for (let z = 11 * m; z <= 13 * m; z++) {
        for (let dy = -Math.floor(0.7 * m); dy <= Math.floor(0.7 * m); dy++) {
          for (let dx = -Math.floor(0.7 * m); dx <= Math.floor(0.7 * m); dx++) {
            put(cx + dx, cy + dy, z, FAIRY_WARM, 248);
          }
        }
      }
      put(cx, cy, 14 * m, SNOW_HI);
    },
    { globe: { pos: [cx, cy, 12 * m] } },
    [cx, cy, 0],
  );
}

/** 9. Organic Snow-Dusted Perimeter Evergreen Pine Tree (natural drooping bough lobes, zero zebra striping!). */
export function createSnowPineAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 13 * m, L = 13 * m, H = 20 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  return buildVoxelAsset(
    "xmas_pine",
    "Snowy Pine",
    W,
    L,
    H,
    0.44 / m,
    (put) => {
      for (let z = 0; z < 4 * m; z++) {
        for (let dy = -Math.floor(0.6 * m); dy <= Math.floor(0.6 * m); dy++) {
          for (let dx = -Math.floor(0.6 * m); dx <= Math.floor(0.6 * m); dx++) {
            put(cx + dx, cy + dy, z, DARK_WOOD);
          }
        }
      }
      for (let z = 3 * m; z < H; z++) {
        const u = (z - 3 * m) / (H - 3 * m);
        const tierPhase = (u * 5.2) % 1;
        const skirt = 1.0 + (1.0 - tierPhase) * 0.34;
        const baseR = Math.max(0.5, (1.0 - Math.pow(u, 0.92)) * 4.7 * skirt) * m;
        for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = y - cy;
          const d = Math.hypot(dx, dy);
          if (d > baseR + 1.2 * m) continue;
          const ang = Math.atan2(dy, dx);
          const lobe = 1.0 + 0.22 * Math.sin(ang * 6.0 + Math.floor(u * 5.2) * 1.9) + 0.10 * Math.cos(ang * 9.0 - u * 4.0);
          const rEff = baseR * lobe;
          if (d > rEff) continue;
          const outer = d >= rEff - 1.2 * m;
          const n = hash3(x, y, z, 53);
          const snowCap = (u > 0.86) || (tierPhase > 0.64 && outer && lobe > 0.94 && n > 75);
          if (snowCap) put(x, y, z, n > 165 ? SNOW_HI : SNOW_MID);
          else put(x, y, z, !outer ? PINE_DARK : n > 160 ? PINE_HI : PINE_MID);
        }
      }
    },
    {},
    [cx, cy, 0],
  );
}

/** 10. Cheerful Classic Snowman with Top Hat, Red Scarf & Carrot Nose! */
export function createSnowmanAsset(detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 8 * m, L = 8 * m, H = 12 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  return buildVoxelAsset(
    "xmas_snowman",
    "Snowman",
    W,
    L,
    H,
    0.26 / m,
    (put) => {
      const spheres: Array<[number, number]> = [[2.2, 2.3], [5.4, 1.75], [8.0, 1.25]];
      for (const [sz, sr] of spheres) {
        for (let z = 0; z < H; z++) for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          if (Math.hypot((x - cx) / m, (y - cy) / m, (z / m - sz)) <= sr) {
            put(x, y, z, z / m > sz ? SNOW_HI : SNOW_MID);
          }
        }
      }
      // Red scarf & coal buttons
      for (let x = Math.round(cx - 1.6 * m); x <= Math.round(cx + 1.6 * m); x++) put(x, cy + m, Math.round(6.8 * m), HOLLY_RED);
      put(cx, Math.round(cy + 1.9 * m), Math.round(5.4 * m), IRON_DARK);
      // Carrot nose (+Y) & top hat
      put(cx, Math.round(cy + 1.6 * m), Math.round(8.0 * m), [244, 126, 38]);
      put(cx, Math.round(cy + 2.2 * m), Math.round(8.0 * m), [244, 126, 38]);
      for (let z = Math.round(9.2 * m); z <= Math.round(11.4 * m); z++) {
        const r = z <= Math.round(9.6 * m) ? 1.7 * m : 1.05 * m;
        for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
          if (Math.hypot(x - cx, y - cy) <= r) put(x, y, z, z === Math.round(10.0 * m) ? HOLLY_RED : IRON_DARK);
        }
      }
    },
    {},
    [cx, cy, 0],
  );
}

/** 11. Cute Storybook Bundled-Up Winter Ice Skater / Main Street Shopper (puffer coat, arms, scarf, rounded head & pom-pom beanie)! */
export function createWinterPersonAsset(id: string, coatColor: RGB, scarfColor: RGB, detail: DetailLevel): VolumeAsset {
  const m = detail === "ultra" ? 2 : 1;
  const W = 7 * m, L = 7 * m, H = 9 * m;
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  return buildVoxelAsset(
    id,
    "Winter Skater",
    W,
    L,
    H,
    0.22 / m,
    (put) => {
      // Winter boots / skates
      for (let z = 0; z < 2 * m; z++) {
        for (const sgn of [-1, 1]) {
          put(cx + sgn * 0.9 * m, cy, z, IRON_DARK);
          if (m === 2) put(cx + sgn * 0.9 * m, cy + 1, z, IRON_DARK);
        }
      }
      // Cozy winter coat torso + outstretched mittened arms
      for (let z = 2 * m; z < 5.5 * m; z++) {
        const halfW = z < 3 * m ? 1.55 * m : 1.35 * m;
        for (let dy = -Math.round(0.95 * m); dy <= Math.round(0.95 * m); dy++) {
          for (let dx = -Math.round(halfW); dx <= Math.round(halfW); dx++) {
            put(cx + dx, cy + dy, z, z >= 4.6 * m ? scarfColor : coatColor);
          }
        }
      }
      // Mittens at sides
      put(cx - 2.1 * m, cy + 0.4 * m, Math.round(3.6 * m), scarfColor);
      put(cx + 2.1 * m, cy + 0.4 * m, Math.round(3.6 * m), scarfColor);
      // Rounded cozy face & knit pom-pom beanie hat!
      for (let z = Math.round(5.5 * m); z < Math.round(7.4 * m); z++) {
        for (let dy = -Math.floor(0.75 * m); dy <= Math.floor(0.75 * m); dy++) {
          for (let dx = -Math.floor(0.85 * m); dx <= Math.floor(0.85 * m); dx++) {
            put(cx + dx, cy + dy, z, [244, 206, 178]);
          }
        }
      }
      for (let dy = -Math.floor(0.85 * m); dy <= Math.floor(0.85 * m); dy++) {
        for (let dx = -Math.floor(0.95 * m); dx <= Math.floor(0.95 * m); dx++) {
          put(cx + dx, cy + dy, Math.round(7.5 * m), scarfColor);
        }
      }
      put(cx, cy, Math.round(8.4 * m), SNOW_HI); // fluffy beanie pom-pom!
    },
    {},
    [cx, cy, 0],
  );
}

/** Transparent proxy asset used to pass moving Trolley headlight & Sleigh shadow via uShadowCasters. */
export function createLightProxyAsset(): VolumeAsset {
  return createVolumeAsset({
    id: "light_proxy",
    name: "Light Proxy",
    w: 2,
    l: 2,
    h: 2,
    voxelScale: 1.0,
    pivot: [1, 1, 1],
    rgba: new Uint8Array(2 * 2 * 2 * 4),
    computeSdf: false,
    provenance: { kind: "blueprint", source: "xmas-mainstreet" },
  });
}
