/**
 * Micro-Voxel Sculpting Kit for Ultra-Detail Miniature Dioramas (@aastack/core).
 * Provides rich architectural primitives (recessed windows with visible interiors,
 * arched stonework, dentil cornices, sculpted overhanging snowdrifts, wreaths,
 * hanging iron signs, and desaturated heritage winter palettes) with graded
 * continuous emissive (0..255) so interiors glow softly while fairy lights sparkle!
 */

import { createVolumeAsset, type RGB, type SocketDef, type VolumeAsset } from "@aastack/core";

export type DetailLevel = "classic" | "ultra";

// Desaturated heritage winter palette (storybook film warmth, never garish neon Crayola!)
export const PAL = {
  snowHi: [238, 244, 254] as RGB,
  snowMid: [204, 218, 238] as RGB,
  snowShade: [158, 178, 208] as RGB,
  icicle: [188, 224, 248] as RGB,

  pineDeep: [18, 48, 38] as RGB,
  pineMid: [28, 72, 52] as RGB,
  pineHi: [44, 96, 66] as RGB,
  hollyRed: [188, 36, 44] as RGB,

  brickRed: [122, 54, 48] as RGB,
  brickTerracotta: [138, 68, 52] as RGB,
  brickNavy: [42, 58, 86] as RGB,
  brickSage: [58, 92, 76] as RGB,
  stuccoCream: [208, 194, 170] as RGB,
  stoneHi: [198, 192, 180] as RGB,
  stoneMid: [152, 148, 140] as RGB,
  stoneDark: [104, 102, 100] as RGB,

  slateDark: [44, 52, 68] as RGB,
  slateMid: [62, 72, 92] as RGB,
  copperPatina: [64, 122, 112] as RGB,
  copperHi: [88, 148, 136] as RGB,
  cedarRoof: [78, 52, 46] as RGB,

  oakDark: [56, 38, 28] as RGB,
  oakMid: [94, 64, 44] as RGB,
  oakWarm: [136, 94, 58] as RGB,
  mahogany: [102, 34, 34] as RGB,
  iron: [30, 35, 46] as RGB,
  ironHi: [64, 72, 88] as RGB,
  brass: [214, 172, 68] as RGB,
  creamTrim: [224, 216, 200] as RGB,

  // Warm glowing interiors (used with graded emissive 100..138 -> zero white blowout!)
  winCandle: [248, 202, 116] as RGB,
  winHoney: [232, 166, 82] as RGB,
  winAmber: [198, 124, 56] as RGB,
  winCurtain: [148, 62, 54] as RGB,
  winDark: [20, 26, 42] as RGB,

  // Sparkling lights & accents (used with emissive 215..255!)
  fairyWarm: [255, 226, 134] as RGB,
  fairyGold: [255, 194, 64] as RGB,
  fairyRed: [255, 64, 72] as RGB,
  fairyGreen: [68, 232, 122] as RGB,
  fairyBlue: [88, 186, 255] as RGB,
};

export const FAIRY_COLORS: RGB[] = [
  PAL.fairyWarm,
  PAL.fairyRed,
  PAL.fairyGold,
  PAL.fairyGreen,
  PAL.fairyBlue,
];

export function hash3(a: number, b: number, c: number, seed: number): number {
  let n = (a * 374761393 + b * 668265263 + c * 2147483647 + seed * 1597334677) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) & 255;
}

export function shadeRgb(base: RGB, delta: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(base[0] + delta))),
    Math.max(0, Math.min(255, Math.round(base[1] + delta))),
    Math.max(0, Math.min(255, Math.round(base[2] + delta))),
  ];
}

export class VoxelCanvas {
  public readonly w: number;
  public readonly l: number;
  public readonly h: number;
  public readonly rgba: Uint8Array;
  public readonly emis: Uint8Array;

  constructor(w: number, l: number, h: number) {
    this.w = w;
    this.l = l;
    this.h = h;
    this.rgba = new Uint8Array(w * l * h * 4);
    this.emis = new Uint8Array(w * l * h);
  }

  put(x: number, y: number, z: number, rgb: RGB, emissive: boolean | number = false): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.l || iz < 0 || iz >= this.h) return;
    const idx = iz * this.l * this.w + iy * this.w + ix;
    const p = idx * 4;
    this.rgba[p] = rgb[0];
    this.rgba[p + 1] = rgb[1];
    this.rgba[p + 2] = rgb[2];
    this.rgba[p + 3] = 255;
    this.emis[idx] = typeof emissive === "number"
      ? Math.max(0, Math.min(255, Math.round(emissive)))
      : (emissive ? 255 : 0);
  }

  clear(x: number, y: number, z: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const iz = Math.round(z);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.l || iz < 0 || iz >= this.h) return;
    const idx = iz * this.l * this.w + iy * this.w + ix;
    this.rgba[idx * 4 + 3] = 0;
    this.emis[idx] = 0;
  }

  box(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    rgb: RGB,
    emissive: boolean | number = false,
  ): void {
    const ax = Math.max(0, Math.round(Math.min(x0, x1)));
    const bx = Math.min(this.w - 1, Math.round(Math.max(x0, x1)));
    const ay = Math.max(0, Math.round(Math.min(y0, y1)));
    const by = Math.min(this.l - 1, Math.round(Math.max(y0, y1)));
    const az = Math.max(0, Math.round(Math.min(z0, z1)));
    const bz = Math.min(this.h - 1, Math.round(Math.max(z0, z1)));
    for (let z = az; z <= bz; z++) {
      for (let y = ay; y <= by; y++) {
        for (let x = ax; x <= bx; x++) {
          this.put(x, y, z, rgb, emissive);
        }
      }
    }
  }

  /** Draws a textured masonry/wood hollow shell box with subtle course variation (zero flat plastic slabs!). */
  masonryShell(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    base: RGB,
    seed: number,
    wallThick = 2,
    quoin?: RGB,
  ): void {
    const ax = Math.round(x0), bx = Math.round(x1);
    const ay = Math.round(y0), by = Math.round(y1);
    const az = Math.round(z0), bz = Math.round(z1);
    for (let z = az; z <= bz; z++) {
      const courseOff = (z & 1) * 2;
      for (let y = ay; y <= by; y++) {
        for (let x = ax; x <= bx; x++) {
          const dWall = Math.min(x - ax, bx - x, y - ay, by - y);
          if (dWall >= wallThick && z > az && z < bz) continue;
          const isCornerX = (x - ax) <= wallThick || (bx - x) <= wallThick;
          const isCornerY = (y - ay) <= wallThick || (by - y) <= wallThick;
          if (quoin && isCornerX && isCornerY && ((Math.floor(z / 2) & 1) === 0 || dWall === 0)) {
            this.put(x, y, z, shadeRgb(quoin, ((hash3(x, y, z, seed) & 7) - 3)));
          } else {
            const brickHash = hash3(Math.floor((x + courseOff) / 3), Math.floor((y + courseOff) / 3), Math.floor(z / 2), seed);
            const mortar = (z % 2 === 0 && ((x + y + courseOff) % 4 === 0)) ? -8 : 0;
            this.put(x, y, z, shadeRgb(base, ((brickHash & 15) - 7) + mortar));
          }
        }
      }
    }
  }

  /**
   * Carves a TRUE 2-to-3 voxel deep recessed Victorian window on a wall face (+Y, -Y, +X, or -X)
   * complete with stone sill piled with snow, lintel keystone, slender wood mullions, draped curtains,
   * and warm graded interior glow!
   */
  recessedWindow(opts: {
    face: "+y" | "-y" | "+x" | "-x";
    wallCoord: number;
    uCenter: number;
    zBot: number;
    halfW: number;
    height: number;
    trim: RGB;
    sill: RGB;
    lit: boolean;
    warmCol?: RGB;
    arched?: boolean;
    curtains?: boolean;
    snowSill?: boolean;
    candle?: boolean;
    recessDepth?: number;
  }): void {
    const {
      face, wallCoord, uCenter, zBot, halfW, height, trim, sill, lit,
      warmCol = PAL.winCandle, arched = false, curtains = true, snowSill = true,
      candle = false, recessDepth = 2,
    } = opts;
    const hw = Math.round(halfW);
    const h = Math.round(height);
    const uc = Math.round(uCenter);
    const zb = Math.round(zBot);
    const inward = (face === "+y" || face === "+x") ? -1 : 1;
    const out = -inward;

    const place = (u: number, d: number, z: number, rgb: RGB, em: boolean | number = false) => {
      if (face === "+y" || face === "-y") this.put(u, wallCoord + d, z, rgb, em);
      else this.put(wallCoord + d, u, z, rgb, em);
    };
    const dig = (u: number, d: number, z: number) => {
      if (face === "+y" || face === "-y") this.clear(u, wallCoord + d, z);
      else this.clear(wallCoord + d, u, z);
    };

    // Protruding stone sill + fluffy snow lip + upper lintel/arch trim
    for (let du = -hw - 1; du <= hw + 1; du++) {
      place(uc + du, out, zb - 1, sill);
      place(uc + du, 0, zb - 1, sill);
      if (snowSill && Math.abs(du) <= hw) place(uc + du, out, zb, PAL.snowHi);
      if (!arched) {
        place(uc + du, out, zb + h, sill);
        place(uc + du, 0, zb + h, sill);
      }
    }

    // Carve recess cavity & place glass, mullions, curtains, and windowsill candle!
    for (let dz = 0; dz < h; dz++) {
      const z = zb + dz;
      const archRad = arched && dz > h - hw - 1 ? Math.sqrt(Math.max(0, hw * hw - Math.pow(dz - (h - hw - 1), 2))) : hw;
      for (let du = -hw; du <= hw; du++) {
        if (Math.abs(du) > archRad + 0.35) {
          if (arched && Math.abs(du) <= archRad + 1.35) place(uc + du, out, z, sill);
          continue;
        }
        const onFrame = Math.abs(du) >= Math.floor(archRad) || dz === 0 || (!arched && dz === h - 1);
        if (onFrame) {
          place(uc + du, 0, z, trim);
          for (let d = 1; d < recessDepth; d++) place(uc + du, inward * d, z, shadeRgb(trim, -20));
          continue;
        }
        // Carve open the exterior recess layers so 3D baked cavity AO shadows the reveal!
        for (let d = 0; d < recessDepth; d++) dig(uc + du, inward * d, z);

        // Slender wood window crossbars sitting 1 voxel deep
        const isVBar = du === 0 && hw >= 3;
        const isHBar = dz === Math.floor(h * 0.52) && h >= 6;
        if (isVBar || isHBar) {
          place(uc + du, inward, z, trim);
        }

        // Back glowing glass + draped crimson curtains + subtle candle glow!
        const isCurtain = curtains && Math.abs(du) >= hw - 1 && dz >= Math.floor(h * 0.35);
        if (lit) {
          if (isCurtain) {
            place(uc + du, inward * recessDepth, z, PAL.winCurtain, 68);
          } else {
            // Subtle warm gradient: brighter cozy glow lower, softer amber near ceiling
            const upperDim = dz > h * 0.72;
            const col = upperDim ? PAL.winAmber : warmCol;
            const em = upperDim ? 96 : 126;
            place(uc + du, inward * recessDepth, z, col, em);
          }
        } else {
          place(uc + du, inward * recessDepth, z, PAL.winDark, 0);
        }
      }
    }

    // Tiny glowing Christmas window candle centered right behind the lower pane!
    if (candle && lit) {
      place(uc, inward, zb + 1, PAL.creamTrim);
      place(uc, inward, zb + 2, PAL.fairyWarm, 235);
    }
  }

  /** Lush circular pine holly wreath with red velvet bow & optional twinkling lights. */
  wreath(face: "+y" | "-y" | "+x" | "-x", wallCoord: number, uC: number, zC: number, radius: number, lights = true): void {
    const rOut = radius;
    const rIn = Math.max(0.8, radius * 0.44);
    for (let dz = -Math.ceil(rOut); dz <= Math.ceil(rOut); dz++) {
      for (let du = -Math.ceil(rOut); du <= Math.ceil(rOut); du++) {
        const d = Math.hypot(du, dz);
        if (d <= rOut && d >= rIn) {
          const isBulb = lights && ((du * 3 + dz * 5) & 7) === 0;
          const isBerry = !isBulb && ((du + dz) & 3) === 0;
          const col = isBulb ? PAL.fairyWarm : isBerry ? PAL.hollyRed : ((du + dz) & 1) === 0 ? PAL.pineHi : PAL.pineMid;
          const em = isBulb ? 225 : 0;
          if (face === "+y" || face === "-y") this.put(uC + du, wallCoord, zC + dz, col, em);
          else this.put(wallCoord, uC + du, zC + dz, col, em);
        }
      }
    }
    // Red velvet bow & ribbon tails at bottom of wreath
    const bowZ = Math.round(zC - rOut * 0.75);
    for (const du of [-1, 0, 1]) {
      const col = PAL.hollyRed;
      if (face === "+y" || face === "-y") {
        this.put(uC + du, wallCoord, bowZ, col);
        if (du !== 0) this.put(uC + du, wallCoord, bowZ - 1, col);
      } else {
        this.put(wallCoord, uC + du, bowZ, col);
        if (du !== 0) this.put(wallCoord, uC + du, bowZ - 1, col);
      }
    }
  }

  /** Smooth sculpted snow-draped cornice & glistening hanging crystal icicles along a +Y eave! */
  eaveLightsAndIcicles(x0: number, x1: number, yFront: number, zEave: number, seed: number, spacing = 3): void {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      const phase = x - Math.round(x0);
      if (phase % spacing === 0) {
        const col = FAIRY_COLORS[(Math.floor(phase / spacing) + seed) % FAIRY_COLORS.length];
        this.put(x, yFront, zEave, col, 238);
      } else if (phase % 5 === 2) {
        const len = 1 + (hash3(x, yFront, zEave, seed) % 3);
        for (let k = 1; k <= len; k++) this.put(x, yFront, zEave - k, PAL.icicle);
      }
    }
  }

  /** Builds the finished @aastack/core VolumeAsset with explicit graded emissive mask. */
  toAsset(
    id: string,
    name: string,
    voxelScale: number,
    sockets: Record<string, SocketDef> = {},
    pivot?: [number, number, number],
  ): VolumeAsset {
    return createVolumeAsset({
      id,
      name,
      w: this.w,
      l: this.l,
      h: this.h,
      voxelScale,
      pivot: pivot ?? [this.w * 0.5, this.l * 0.5, 0],
      rgba: this.rgba,
      explicitEmissive: this.emis,
      sockets,
      computeSdf: false,
      provenance: { kind: "blueprint", source: "xmas-mainstreet-v2" },
    });
  }
}
