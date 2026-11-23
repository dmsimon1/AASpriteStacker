/**
 * Micro-Voxel Hero Centerpiece, Heritage Vehicles, Storybook Villagers, Fairy-Lit Winter Birches,
 * and Rich Victorian Street Clutter for Main Street Christmas (@aastack/core).
 */

import { createVolumeAsset, type RGB, type VolumeAsset } from "@aastack/core";
import { FAIRY_COLORS, PAL, VoxelCanvas, hash3, shadeRgb, type DetailLevel } from "./voxel-kit.js";

function mkScale(detail: DetailLevel) {
  const s = detail === "ultra" ? 1 : 0.5;
  return {
    s,
    n: (v: number) => Math.max(1, Math.round(v * s)),
    c: (v: number) => Math.round(v * s),
  };
}

/**
 * 1. HERO CENTERPIECE: 116-Slice Giant Town Square Christmas Tree + Wrought-Iron Fence + 16 Gifts!
 *    (72x72x116 @ 0.12 in Ultra -> 13.9 world units tall!)
 */
export function createGiantChristmasTree(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(72), L = n(72), H = n(116);
  const vs = 0.12 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;

  // 1. Octagonal carved granite planter curb + fluffy snow skirt + low wrought-iron ornamental fence!
  const baseR = c(32);
  for (let z = 0; z < c(6); z++) {
    const r = baseR - (z > c(3) ? n(1) : 0);
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const oct = Math.max(dx, dy, (dx + dy) * 0.72);
      if (oct > r) continue;
      if (oct > r - n(2.5)) {
        v.put(x, y, z, z === c(5) ? PAL.snowHi : (z === 0 ? PAL.stoneDark : PAL.stoneMid));
      } else if (z <= c(4)) {
        v.put(x, y, z, z === c(4) ? PAL.snowHi : PAL.snowMid);
      }
    }
  }
  // Low wrought-iron decorative fence posts around planter rim
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const fx = Math.round(cx + Math.cos(a) * (baseR - n(1.5)));
    const fy = Math.round(cy + Math.sin(a) * (baseR - n(1.5)));
    for (let z = c(6); z <= c(10); z++) v.put(fx, fy, z, z === c(10) ? PAL.brass : PAL.iron);
  }

  // Sturdy dark cedar trunk
  for (let z = c(4); z < c(26); z++) {
    const tr = c(4.2);
    for (let dy = -tr; dy <= tr; dy++) for (let dx = -tr; dx <= tr; dx++) {
      if (Math.hypot(dx, dy) <= tr) v.put(cx + dx, cy + dy, z, PAL.oakDark);
    }
  }

  // 16 Richly Wrapped Christmas Presents with contrasting ribbons & bows piled around the snow base!
  const gifts: Array<[number, number, number, number, number, RGB, RGB]> = [
    [-14, 11, 7, 6, 7, PAL.hollyRed, PAL.brass],
    [13, 12, 8, 6, 6, [44, 102, 176], PAL.snowHi],
    [15, -10, 7, 7, 6, [42, 134, 74], PAL.hollyRed],
    [-15, -11, 7, 7, 7, PAL.brass, PAL.mahogany],
    [1, 17, 7, 6, 5, [148, 56, 158], PAL.brass],
    [-2, -17, 7, 7, 6, [198, 86, 44], PAL.creamTrim],
    [18, 2, 6, 6, 5, [52, 148, 166], PAL.brass],
    [-19, 1, 6, 6, 6, [188, 46, 86], PAL.snowHi],
    [-9, 15, 5, 5, 5, PAL.pineHi, PAL.brass],
    [9, 15, 5, 5, 6, PAL.hollyRed, PAL.snowHi],
    [10, -15, 5, 6, 5, [54, 112, 188], PAL.brass],
    [-10, -15, 6, 5, 5, PAL.creamTrim, PAL.hollyRed],
  ];
  for (const [gx, gy, gw, gl, gh, boxCol, ribCol] of gifts) {
    const x0 = Math.round(cx + c(gx - gw * 0.5)), x1 = Math.round(cx + c(gx + gw * 0.5));
    const y0 = Math.round(cy + c(gy - gl * 0.5)), y1 = Math.round(cy + c(gy + gl * 0.5));
    const mx = Math.round((x0 + x1) * 0.5), my = Math.round((y0 + y1) * 0.5);
    const zTop = c(5 + gh);
    for (let z = c(5); z <= zTop; z++) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const rib = Math.abs(x - mx) < n(1) || Math.abs(y - my) < n(1);
        v.put(x, y, z, rib ? ribCol : boxCol);
      }
    }
    v.put(mx, my, zTop + 1, ribCol);
    v.put(mx - 1, my, zTop + 1, ribCol);
    v.put(mx + 1, my, zTop + 1, ribCol);
  }

  // 2. Lush Multi-Tiered Drooping Spruce Boughs + Patchy Moonlight Snow + Spiraling Gold Tinsel + 140+ Fairy Lights!
  const zStart = c(14);
  const zTop = c(102);
  for (let z = zStart; z <= zTop; z++) {
    const u = (z - zStart) / Math.max(1, zTop - zStart);
    const tiers = 9.5;
    const tierPhase = (u * tiers) % 1;
    const skirt = 1.0 + Math.pow(1.0 - tierPhase, 1.25) * 0.34;
    const baseR = (1.0 - Math.pow(u, 0.90)) * c(29) * skirt;
    if (baseR < 0.8) continue;

    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > baseR + n(4)) continue;
      const ang = Math.atan2(dy, dx);
      const lobe = 1.0 + 0.17 * Math.sin(ang * 8.0 + Math.floor(u * tiers) * 1.45) + 0.09 * Math.cos(ang * 13.0 - u * 7.0);
      const rEff = baseR * lobe;
      if (d > rEff) continue;

      const isOuter = d >= rEff - n(3.2);
      const isTip = d >= rEff - n(1.6);
      const hVal = hash3(x, y, z, 31);
      // Organic moonlight snow resting gently on upper branch faces
      const snowRest = tierPhase > 0.66 && isTip && lobe > 0.96 && hVal > 92;
      if (snowRest) {
        v.put(x, y, z, hVal > 180 ? PAL.snowHi : PAL.snowMid);
      } else {
        const col = !isOuter ? PAL.pineDeep : (hVal > 175 ? PAL.pineHi : hVal > 82 ? PAL.pineMid : PAL.pineDeep);
        v.put(x, y, z, col);
      }

      // 3D Spiraling Golden Tinsel Garland + Sparkling Jewel-Toned Fairy Lights & Glass Baubles!
      if (isTip && u > 0.03 && u < 0.95) {
        const sp1 = (((ang / (Math.PI * 2)) + 1.0 + u * 5.2) % 1.0);
        const sp2 = (((ang / (Math.PI * 2)) + 1.5 + u * 5.2) % 1.0);
        if (Math.abs(sp1 - 0.5) < (s >= 1 ? 0.026 : 0.052)) {
          v.put(x, y, z, PAL.brass, 148);
        } else if (Math.abs(sp2 - 0.5) < (s >= 1 ? 0.014 : 0.03)) {
          v.put(x, y, z, PAL.hollyRed, 90);
        } else if (hVal > (s >= 1 ? 248 : 240)) {
          const bulb = FAIRY_COLORS[hVal % FAIRY_COLORS.length];
          v.put(x, y, z, bulb, 250);
          if (s >= 1 && (hVal & 3) === 0) {
            // Glossy 2-voxel glass ornament bauble!
            v.put(x, y, z - 1, bulb, 185);
          }
        }
      }
    }
  }

  // 3. Radiant 8-Point 3D Golden Bethlehem Star Topper (z = 102..115)
  const starZ = c(108);
  for (let dz = -c(6); dz <= c(6); dz++) {
    for (let dy = -c(5); dy <= c(5); dy++) {
      for (let dx = -c(5); dx <= c(5); dx++) {
        const core = Math.hypot(dx, dy, dz) <= n(2.1);
        const rayZ = Math.hypot(dx, dy) <= n(1.0) && Math.abs(dz) <= c(6);
        const rayX = Math.hypot(dy, dz) <= n(1.0) && Math.abs(dx) <= c(5);
        const rayY = Math.hypot(dx, dz) <= n(1.0) && Math.abs(dy) <= c(5);
        if (core || rayZ || rayX || rayY) {
          v.put(cx + dx, cy + dy, starZ + dz, [255, 232, 118], 255);
        }
      }
    }
  }

  return v.toAsset("xmas_giant_tree", "Giant Town Square Christmas Tree", vs, { star: { pos: [cx, cy, starZ] } }, [cx, cy, 0]);
}

/**
 * 2. HERITAGE 1900s MAHOGANY & BURGUNDY HOLIDAY STREETCAR TROLLEY (36x88x48 @ 0.105)
 *    - Curved brass cowcatcher, riveted steel bogies, open brass-railed end vestibules,
 *      visible warm interior wooden benches & ceiling lamps, arched clerestory roof vents,
 *      snowy roof blanket, brass trolley pole & front holly wreath!
 */
export function createHeritageTrolley(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(36), L = n(88), H = n(48);
  const vs = 0.105 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5;

  const RED_HERITAGE: RGB = [152, 34, 42];
  const GREEN_HUNTER: RGB = [26, 68, 48];

  // Undercarriage frame, riveted wheel bogies & curved brass cowcatchers on both ends!
  v.box(cx - c(10), c(10), c(3), cx + c(10), L - 1 - c(10), c(5), PAL.iron);
  for (const wy of [18, 28, 60, 70]) {
    for (const sgn of [-1, 1]) {
      const wx = cx + sgn * c(11);
      for (let dz = 0; dz <= c(4); dz++) for (let dy = -c(2); dy <= c(2); dy++) {
        if (Math.hypot(dy, dz - c(2)) <= c(2.4)) v.put(wx, c(wy) + dy, dz, dz === c(2) ? PAL.ironHi : PAL.iron);
      }
    }
  }
  // Curved cowcatcher grille at front (+Y) & rear (-Y)
  for (const [ey, dir] of [[L - 1 - c(6), 1], [c(6), -1]]) {
    for (let dx = -c(9); dx <= c(9); dx += Math.max(1, n(2))) {
      for (let step = 0; step < c(5); step++) {
        v.put(cx + dx, ey + dir * step, c(1) + Math.floor((c(5) - step) * 0.6), PAL.brass);
      }
    }
  }

  // Open brass-railed vestibules at both ends + paneled mahogany/burgundy main passenger saloon!
  const ySal0 = c(15), ySal1 = L - 1 - c(15);
  const yEnd0 = c(7), yEnd1 = L - 1 - c(7);
  // Floor & visible cozy oak interior benches!
  v.box(cx - c(12), yEnd0, c(6), cx + c(12), yEnd1, c(7), PAL.oakDark);
  v.box(cx - c(11), ySal0 + c(2), c(8), cx - c(7), ySal1 - c(2), c(12), PAL.oakWarm);
  v.box(cx + c(7), ySal0 + c(2), c(8), cx + c(11), ySal1 - c(2), c(12), PAL.oakWarm);
  // Warm interior overhead brass lamps glowing softly through the mullioned windows!
  for (let y = ySal0 + c(8); y <= ySal1 - c(8); y += Math.max(4, c(12))) {
    v.put(cx, y, c(28), PAL.fairyWarm, 240);
  }

  // Curved end dashboards & main saloon walls with 6 recessed arched mullioned windows per side!
  for (let y = yEnd0; y <= yEnd1; y++) {
    const inSaloon = y >= ySal0 && y <= ySal1;
    const taper = inSaloon ? 0 : Math.round(Math.pow(Math.min(y - yEnd0, yEnd1 - y) < c(8) ? (1 - Math.min(y - yEnd0, yEnd1 - y) / Math.max(1, c(8))) : 0, 1.4) * c(3));
    const hw = c(13) - taper;
    for (let z = c(7); z <= c(31); z++) {
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const onShell = Math.abs(x - cx) >= hw - 1 || y === yEnd0 || y === yEnd1;
        if (!onShell) continue;
        // Open side entry steps at vestibules
        if (!inSaloon && z > c(16) && Math.abs(x - cx) >= hw - 1 && y !== yEnd0 && y !== yEnd1) continue;
        if (z <= c(15)) {
          const trim = z === c(15) || z === c(7);
          const panel = z >= c(9) && z <= c(13) && ((y % Math.max(3, c(7))) !== 0);
          v.put(x, y, z, trim ? PAL.brass : panel ? RED_HERITAGE : PAL.mahogany);
        } else if (z <= c(27)) {
          const winCol = inSaloon && ((y - ySal0) % Math.max(4, c(9))) >= n(2) && ((y - ySal0) % Math.max(4, c(9))) <= c(7);
          const endWin = (y === yEnd0 || y === yEnd1) && Math.abs(x - cx) <= c(7) && z >= c(18) && z <= c(26);
          if (winCol || endWin) {
            const innerBar = z === c(25);
            if (innerBar) v.put(x, y, z, PAL.creamTrim);
            else v.put(x, y, z, z > c(24) ? PAL.winAmber : PAL.winCandle, 126);
          } else {
            v.put(x, y, z, PAL.creamTrim);
          }
        } else {
          v.put(x, y, z, z === c(28) ? PAL.brass : GREEN_HUNTER);
        }
      }
    }
  }

  // Arched Clerestory Monitor Roof piled with fluffy snow + glowing amber transom vents + roof fairy lights!
  for (let y = yEnd0 - 1; y <= yEnd1 + 1; y++) {
    for (let x = Math.round(cx - c(13)); x <= Math.round(cx + c(13)); x++) {
      const dx = Math.abs(x - cx);
      v.put(x, y, c(32), dx > c(11) ? GREEN_HUNTER : PAL.snowMid);
      if (dx <= c(11)) v.put(x, y, c(33), PAL.snowHi);
      if (dx <= c(7) && y >= ySal0 && y <= ySal1) {
        const ventWin = dx >= c(6) && ((y % Math.max(3, c(6))) >= n(2));
        v.put(x, y, c(34), ventWin ? PAL.winHoney : GREEN_HUNTER, ventWin ? 120 : 0);
        v.put(x, y, c(35), ventWin ? PAL.winHoney : GREEN_HUNTER, ventWin ? 120 : 0);
        v.put(x, y, c(36), PAL.snowMid);
        if (dx <= c(5)) v.put(x, y, c(37), PAL.snowHi);
      }
    }
    if (y % Math.max(2, c(4)) === 0 && y >= yEnd0 && y <= yEnd1) {
      v.put(cx - c(14), y, c(31), PAL.fairyWarm, 240);
      v.put(cx + c(14), y, c(31), PAL.fairyWarm, 240);
    }
  }
  // Angled brass trolley pole & contact wheel
  for (let i = 0; i < c(14); i++) {
    v.put(cx, Math.round(L * 0.52 - i * 1.1), c(37) + Math.floor(i * 0.72), PAL.brass);
  }

  // Brass headlamps (+Y front & -Y rear) + festive pine holly wreath mounted on front dash!
  v.box(cx - n(1), yEnd1 + 1, c(12), cx + n(1), yEnd1 + 2, c(14), PAL.brass);
  v.put(cx, yEnd1 + 2, c(13), [255, 248, 198], 255);
  v.put(cx, yEnd1 + 1, c(30), [255, 244, 178], 245);
  v.put(cx, yEnd0 - 1, c(13), PAL.fairyRed, 240);
  v.wreath("+y", yEnd1 + 1, cx, c(17), n(3.2), true);

  return v.toAsset("xmas_trolley", "Heritage 1900s Holiday Trolley", vs, {
    headlight: { pos: [cx, yEnd1 + 2, c(13)], dir: [0, 1, -0.2] },
  }, [cx, L * 0.5, 0]);
}

/**
 * 3. VICTORIAN HORSE-DRAWN CHRISTMAS SLEIGH CARRIAGE (28x68x32 @ 0.11)
 *    - Sculpted trotting chestnut horse with harness & red plume + curved burgundy/gold open sleigh
 *      with warm glowing brass carriage lanterns & bundled driver!
 */
export function createHorseSleighCarriage(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(28), L = n(68), H = n(32);
  const vs = 0.11 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5;
  const HORSE_BROWN: RGB = [118, 68, 42];
  const HORSE_MANE: RGB = [52, 34, 24];

  // 1. Curved golden sleigh runners (y = c(4)..c(36))
  for (const sgn of [-1, 1]) {
    const rx = cx + sgn * c(8);
    for (let y = c(4); y <= c(36); y++) {
      const curl = y > c(30) ? Math.round((y - c(30)) * 0.9) : 0;
      v.put(rx, y, c(1) + curl, PAL.brass);
      v.put(rx, y, c(2) + curl, PAL.brass);
    }
    v.box(rx, c(10), c(2), rx, c(11), c(7), PAL.iron);
    v.box(rx, c(26), c(2), rx, c(27), c(7), PAL.iron);
  }
  // Sculpted curved open sleigh body + plush tartan seat + brass carriage lanterns + driver!
  for (let y = c(6); y <= c(32); y++) {
    const yn = y / s;
    const topZ = yn < 12 ? 18 - (yn - 6) * 0.45 : yn < 24 ? 13 : 16;
    const hw = c(8.5);
    for (let z = c(6); z <= c(topZ); z++) {
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const edge = Math.abs(x - cx) >= hw - n(1.2) || y <= c(8) || y >= c(30) || z === c(6);
        if (!edge) continue;
        v.put(x, y, z, z >= c(topZ) - 1 ? PAL.brass : PAL.mahogany);
      }
    }
  }
  // Driver in dark coat & top hat + plaid blanket + gift pile
  v.box(cx - c(5), c(12), c(8), cx + c(5), c(19), c(14), PAL.hollyRed);
  v.box(cx - c(3), c(21), c(9), cx + c(3), c(26), c(18), PAL.iron);
  v.box(cx - c(2), c(22), c(18), cx + c(2), c(25), c(22), [242, 204, 174]);
  v.box(cx - c(2.5), c(22), c(22), cx + c(2.5), c(25), c(26), PAL.iron);
  // Twin glowing brass carriage lanterns!
  v.put(cx - c(9), c(28), c(18), PAL.fairyWarm, 248);
  v.put(cx + c(9), c(28), c(18), PAL.fairyWarm, 248);

  // Wooden harness shafts connecting sleigh to the trotting chestnut horse!
  for (const sgn of [-1, 1]) {
    for (let y = c(32); y <= c(52); y++) v.put(cx + sgn * c(5), y, c(11), PAL.oakDark);
  }
  // Sculpted trotting chestnut horse (y = c(44)..c(64))
  v.box(cx - c(3.5), c(44), c(10), cx + c(3.5), c(58), c(17), HORSE_BROWN);
  // 4 trotting legs
  v.box(cx - c(3), c(45), 0, cx - c(2), c(47), c(10), HORSE_BROWN);
  v.box(cx + c(2), c(47), 0, cx + c(3), c(49), c(10), HORSE_BROWN);
  v.box(cx - c(3), c(55), c(1), cx - c(2), c(57), c(10), HORSE_BROWN);
  v.box(cx + c(2), c(57), 0, cx + c(3), c(59), c(10), HORSE_BROWN);
  // Tail, arched neck, head, bridle & festive red crest plume!
  v.box(cx - 1, c(41), c(7), cx + 1, c(44), c(15), HORSE_MANE);
  for (let dz = 0; dz < c(8); dz++) {
    v.box(cx - c(2), c(57) + Math.floor(dz * 0.45), c(16) + dz, cx + c(2), c(60) + Math.floor(dz * 0.45), c(16) + dz, HORSE_BROWN);
  }
  v.box(cx - c(1.8), c(60), c(21), cx + c(1.8), c(66), c(25), HORSE_BROWN);
  v.put(cx, c(61), c(26), PAL.hollyRed);
  v.put(cx, c(61), c(27), PAL.hollyRed);

  return v.toAsset("xmas_carriage", "Victorian Horse-Drawn Sleigh", vs, {}, [cx, L * 0.5, 0]);
}

/**
 * 4. 1950s WOODY STATION WAGON WITH A SNOWY CHRISTMAS TREE TIED TO THE ROOF! (24x48x30 @ 0.105)
 */
export function createWoodyWagon(id: string, paint: RGB, detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(24), L = n(48), H = n(30);
  const vs = 0.105 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5;

  // Sculpted body with chrome bumpers, wheel fenders & real woodgrain trim!
  v.box(c(3), c(4), c(3), W - 1 - c(3), L - 1 - c(4), c(9), paint);
  // Chrome front & rear bumpers
  v.box(c(2), L - 1 - c(3), c(3), W - 1 - c(2), L - 1 - c(2), c(5), PAL.stoneHi);
  v.box(c(2), c(2), c(3), W - 1 - c(2), c(3), c(5), PAL.stoneHi);
  // Classic Woody ash-wood side panels framed in oak!
  for (const sx of [c(3), W - 1 - c(3)]) {
    v.box(sx, c(8), c(4), sx, L - 1 - c(14), c(9), PAL.oakWarm);
    v.box(sx, c(8), c(4), sx, L - 1 - c(14), c(4), PAL.oakDark);
    v.box(sx, c(8), c(9), sx, L - 1 - c(14), c(9), PAL.oakDark);
  }
  // Rounded cabin greenhouse with warm glowing windows & snowy roof
  v.box(c(4), c(8), c(10), W - 1 - c(4), L - 1 - c(14), c(15), paint);
  v.box(c(4), c(10), c(10), W - 1 - c(4), L - 1 - c(16), c(14), PAL.winHoney, 108);
  v.box(c(5), c(8), c(15), W - 1 - c(5), L - 1 - c(14), c(16), PAL.snowHi);

  // Finely branched snow-dusted Christmas tree strapped onto roof rack with twine!
  for (let y = c(6); y <= L - 1 - c(12); y++) {
    const u = (y - c(6)) / Math.max(1, L - 1 - c(18));
    const rad = Math.max(0.6, (1 - u) * c(5.8));
    for (let dz = 0; dz <= Math.ceil(rad); dz++) for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
      if (Math.hypot(dx, dz) <= rad) {
        const rope = Math.abs(y - c(16)) < 1 || Math.abs(y - c(24)) < 1;
        v.put(cx + dx, y, c(17) + dz, rope ? PAL.creamTrim : dz >= rad - n(1.2) ? PAL.snowHi : PAL.pineHi);
      }
    }
  }
  // 4 rounded rubber wheels with chrome hubcaps
  for (const wy of [12, 36]) for (const sx of [c(2), W - 1 - c(2)]) {
    for (let dz = 0; dz <= c(5); dz++) for (let dy = -c(2.5); dy <= c(2.5); dy++) {
      if (Math.hypot(dy, dz - c(2.5)) <= c(2.8)) {
        v.put(sx, c(wy) + dy, dz, Math.hypot(dy, dz - c(2.5)) <= c(1.2) ? PAL.stoneHi : PAL.iron);
      }
    }
  }
  // Warm chrome-rimmed headlamps (+Y) & ruby taillights (-Y)
  v.box(c(4), L - 1 - c(3), c(6), c(6), L - 1 - c(3), c(8), [255, 248, 196], 250);
  v.box(W - 1 - c(6), L - 1 - c(3), c(6), W - 1 - c(4), L - 1 - c(3), c(8), [255, 248, 196], 250);
  v.box(c(4), c(3), c(6), c(6), c(3), c(7), PAL.fairyRed, 235);
  v.box(W - 1 - c(6), c(3), c(6), W - 1 - c(4), c(3), c(7), PAL.fairyRed, 235);

  return v.toAsset(id, "1950s Holiday Woody Wagon", vs, {}, [cx, L * 0.5, 0]);
}

/**
 * 5. BAROQUE SCROLLED SANTA'S 6-DOF SLEIGH + 5 GALLOPING REINDEER WITH RUDOLPH! (44x104x32 @ 0.125)
 */
export function createSantaSleighAerial(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(44), L = n(104), H = n(32);
  const vs = 0.125 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5;
  const DEER_BODY: RGB = [126, 80, 48];
  const DEER_HI: RGB = [166, 114, 72];

  // Sweeping spiral curled golden runners (y = c(4)..c(42))
  for (const sgn of [-1, 1]) {
    const rx = cx + sgn * c(8.5);
    for (let y = c(4); y <= c(40); y++) {
      const curl = y > c(32) ? Math.round(Math.pow((y - c(32)) / Math.max(1, c(8)), 1.7) * c(8)) : 0;
      v.put(rx, y, c(2) + curl, PAL.brass, 145);
      v.put(rx, y, c(3) + curl, PAL.brass, 145);
    }
    v.box(rx, c(12), c(3), rx, c(13), c(8), PAL.brass);
    v.box(rx, c(28), c(3), rx, c(29), c(8), PAL.brass);
  }

  // Graceful Baroque Scrolled Crimson & Gold Sleigh Hull (swooping side cutouts & flared high rear!)
  for (let y = c(6); y <= c(38); y++) {
    const yn = y / s;
    const topProfile = yn < 14 ? 21 - (yn - 6) * 0.75 : yn < 28 ? 14 + Math.sin((yn - 14) * 0.25) * 1.4 : 18 - (yn - 28) * 0.35;
    const hw = yn > 30 ? Math.max(4, 9.5 - (yn - 30) * 0.55) * s : c(9.5);
    for (let z = c(7); z <= c(topProfile); z++) {
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const shell = Math.abs(x - cx) >= hw - n(1.5) || y <= c(8) || y >= c(36) || z <= c(8);
        if (!shell) continue;
        const rim = z >= c(topProfile) - n(1.2);
        const scroll = Math.abs(z - c(11)) <= 1 && yn > 12 && yn < 30;
        v.put(x, y, z, rim || scroll ? PAL.brass : PAL.hollyRed, rim ? 110 : 0);
      }
    }
  }
  // Overflowing velvet toy sack + wrapped presents + sculpted Santa Claus with white beard & red cap!
  for (let z = c(9); z <= c(19); z++) for (let y = c(9); y <= c(19); y++) for (let x = cx - c(6); x <= cx + c(6); x++) {
    if (Math.hypot((x - cx) / s, (y - c(14)) / s, (z - c(13)) / s) <= 6.2) {
      v.put(x, y, z, z > c(16) ? PAL.pineHi : [142, 98, 58]);
    }
  }
  // Santa
  v.box(cx - c(3.5), c(21), c(10), cx + c(3.5), c(27), c(19), PAL.hollyRed);
  v.box(cx - c(3.5), c(21), c(10), cx + c(3.5), c(27), c(11), PAL.snowHi); // fur trim
  v.box(cx - c(2.5), c(22), c(19), cx + c(2.5), c(26), c(23), [244, 206, 178]); // face
  v.box(cx - c(2.5), c(25), c(18), cx + c(2.5), c(27), c(20), PAL.snowHi); // beard
  v.box(cx - c(2.5), c(22), c(23), cx + c(2.5), c(26), c(26), PAL.hollyRed); // cap
  v.put(cx, c(21), c(26), PAL.snowHi);
  // Warm sleigh dashboard lantern!
  v.put(cx, c(37), c(17), PAL.fairyWarm, 250);

  // Twin glowing golden reins + 5 Sculpted Galloping Reindeer with branched antlers & Rudolph's glowing nose!
  for (const sgn of [-1, 1]) {
    for (let y = c(34); y <= c(92); y += Math.max(1, n(1))) {
      v.put(cx + sgn * c(5.5), y, c(13), PAL.brass, 155);
    }
  }
  const team: Array<[number, number, boolean]> = [
    [-7, 56, false], [7, 56, false],
    [-7, 76, false], [7, 76, false],
    [0, 94, true], // Rudolph leading!
  ];
  for (const [dxOff, yOff, isRudolph] of team) {
    const dx = cx + c(dxOff);
    const dy = c(yOff);
    v.box(dx - c(2), dy - c(5), c(10), dx + c(2), dy + c(5), c(15), DEER_BODY);
    v.box(dx - c(1.5), dy - c(4), c(14), dx + c(1.5), dy + c(4), c(16), DEER_HI);
    // Galloping angled legs!
    for (let k = 0; k < c(6); k++) {
      v.put(dx - c(1.5), dy + c(4) + Math.floor(k * 0.6), c(10) - k, DEER_BODY);
      v.put(dx + c(1.5), dy + c(4) + Math.floor(k * 0.5), c(10) - k, DEER_BODY);
      v.put(dx - c(1.5), dy - c(5) - Math.floor(k * 0.6), c(10) - k, DEER_BODY);
      v.put(dx + c(1.5), dy - c(5) - Math.floor(k * 0.5), c(10) - k, DEER_BODY);
    }
    // Red collar with gold jingle bells + arched neck + sculpted head + branched antlers!
    v.box(dx - c(2), dy + c(3), c(12), dx + c(2), dy + c(5), c(16), PAL.hollyRed);
    v.box(dx - c(1.5), dy + c(4), c(15), dx + c(1.5), dy + c(7), c(20), DEER_HI);
    v.box(dx - c(1.5), dy + c(5), c(19), dx + c(1.5), dy + c(9.5), c(22), DEER_HI);
    // Branched antlers
    for (const asgn of [-1, 1]) {
      for (let k = 0; k < c(5); k++) v.put(dx + asgn * (c(1.5) + Math.floor(k * 0.6)), dy + c(5) - Math.floor(k * 0.3), c(22) + k, PAL.creamTrim);
      v.put(dx + asgn * c(3.5), dy + c(5), c(25), PAL.creamTrim);
    }
    if (isRudolph) {
      v.box(dx - n(0.7), dy + c(9.5), c(20), dx + n(0.7), dy + c(10.5), c(21), PAL.fairyRed, 255);
    }
  }

  return v.toAsset("santa_sleigh", "Baroque Santa Sleigh & Reindeer", vs, {
    runnerL: { pos: [cx - c(8.5), c(4), c(2.5)] },
    runnerR: { pos: [cx + c(8.5), c(4), c(2.5)] },
  }, [cx, c(36), c(12)]);
}

/**
 * 6. STORYBOOK MINIATURE VILLAGER / ICE SKATER (16x16x28 @ 0.072)
 *    - Real winter boots/skates, tailored winter coat with buttons, flowing scarf, outstretched
 *      mittened arms holding a wrapped gift box or hot cocoa cup, sculpted hair & pom-pom beanie!
 */
export function createStorybookVillager(
  id: string,
  coat: RGB,
  scarf: RGB,
  heldProp: "gift" | "cocoa" | "skate",
  detail: DetailLevel,
): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(16), L = n(16), H = n(28);
  const vs = 0.072 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;

  // Boots / ice skates + legs
  for (const sgn of [-1, 1]) {
    v.box(cx + sgn * c(2) - n(0.8), cy - n(1), 0, cx + sgn * c(2) + n(0.8), cy + n(1.5), c(2), heldProp === "skate" ? PAL.stoneHi : PAL.iron);
    v.box(cx + sgn * c(2) - n(0.8), cy - n(0.8), c(2), cx + sgn * c(2) + n(0.8), cy + n(0.8), c(7), [38, 44, 62]);
  }
  // Tailored flared winter coat with brass buttons & white fur hem!
  for (let z = c(7); z <= c(17); z++) {
    const flare = z < c(11) ? c(4.2) : c(3.4);
    v.box(cx - flare, cy - c(2.4), z, cx + flare, cy + c(2.4), z, z === c(7) ? PAL.snowHi : coat);
  }
  v.put(cx, cy + c(2.6), c(11), PAL.brass);
  v.put(cx, cy + c(2.6), c(14), PAL.brass);
  // Warm wrapped scarf + trailing scarf tail down back!
  v.box(cx - c(3.6), cy - c(2.6), c(16), cx + c(3.6), cy + c(2.6), c(18), scarf);
  v.box(cx + c(1.5), cy - c(3.2), c(11), cx + c(3.0), cy - c(2.5), c(17), scarf);
  // Arms & mittens
  v.box(cx - c(5.2), cy - c(1), c(11), cx - c(3.5), cy + c(1.8), c(15), coat);
  v.box(cx + c(3.5), cy - c(1), c(11), cx + c(5.2), cy + c(1.8), c(15), coat);
  v.box(cx - c(5.2), cy + c(1.5), c(11), cx - c(4.0), cy + c(2.8), c(13), scarf);
  v.box(cx + c(4.0), cy + c(1.5), c(11), cx + c(5.2), cy + c(2.8), c(13), scarf);
  // Held miniature Christmas gift box or warm steaming cocoa cup!
  if (heldProp === "gift") {
    v.box(cx - c(2.2), cy + c(2.8), c(11), cx + c(2.2), cy + c(6.2), c(15), PAL.hollyRed);
    v.box(cx, cy + c(2.8), c(11), cx, cy + c(6.2), c(15), PAL.brass);
  } else if (heldProp === "cocoa") {
    v.box(cx + c(3.5), cy + c(2.8), c(12), cx + c(5.2), cy + c(4.5), c(14), PAL.creamTrim);
  }
  // Rounded head, rosy cheeks, hair, knit pom-pom beanie!
  v.box(cx - c(2.6), cy - c(2.4), c(18), cx + c(2.6), cy + c(2.4), c(23), [242, 204, 176]);
  v.box(cx - c(2.8), cy - c(2.6), c(22), cx + c(2.8), cy + c(2.6), c(25), scarf);
  v.box(cx - c(1.4), cy - c(1.4), c(25), cx + c(1.4), cy + c(1.4), c(27), PAL.snowHi);

  return v.toAsset(id, "Storybook Villager", vs, {}, [cx, cy, 0]);
}

/**
 * 7. ORNATE VICTORIAN TWIN-GLOBE STREETLAMP WRAPPED IN GARLAND (16x16x40 @ 0.10)
 */
export function createVictorianTripleLamp(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(16), L = n(16), H = n(40);
  const vs = 0.10 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = Math.floor(W * 0.5), cy = Math.floor(L * 0.5);

  // Fluted cast-iron base plinth
  v.box(cx - c(2.5), cy - c(2.5), 0, cx + c(2.5), cy + c(2.5), c(3), PAL.iron);
  v.box(cx - c(1.6), cy - c(1.6), c(3), cx + c(1.6), cy + c(1.6), c(8), PAL.iron);
  // Slender fluted shaft wrapped in evergreen pine garland & red ribbon bow!
  for (let z = c(8); z <= c(32); z++) {
    v.put(cx, cy, z, PAL.iron);
    if (z >= c(14) && z <= c(28)) {
      const a = z * 0.55;
      v.put(cx + Math.round(Math.cos(a) * n(1)), cy + Math.round(Math.sin(a) * n(1)), z, (z & 3) === 0 ? PAL.hollyRed : PAL.pineHi);
    }
  }
  // Ornate scrolled cross-arm + 2 snow-capped frosted warm Victorian glass lanterns!
  v.box(cx - c(5), cy, c(29), cx + c(5), cy, c(30), PAL.iron);
  for (const ox of [-5, 5]) {
    const gx = cx + c(ox);
    v.box(gx - n(1.5), cy - n(1.5), c(31), gx + n(1.5), cy + n(1.5), c(35), PAL.fairyWarm, 248);
    v.box(gx - n(2), cy - n(2), c(36), gx + n(2), cy + n(2), c(36), PAL.iron);
    v.box(gx - n(1.5), cy - n(1.5), c(37), gx + n(1.5), cy + n(1.5), c(37), PAL.snowHi);
  }
  v.put(cx, cy, c(33), PAL.brass);

  return v.toAsset("xmas_lamp", "Victorian Twin-Globe Streetlamp", vs, {}, [cx, cy, 0]);
}

/**
 * 8. TIMBER CHRISTMAS MARKET CHALET STALL WITH DISPLAYED WARES & EDISON BULBS (32x26x32 @ 0.12)
 */
export function createMarketStall(id: string, stripeCol: RGB, detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(32), L = n(26), H = n(32);
  const vs = 0.12 / s;
  const v = new VoxelCanvas(W, L, H);

  // Carved timber counter base & rear chalet wall
  v.masonryShell(c(3), c(3), 0, W - 1 - c(3), L - 1 - c(5), c(10), PAL.oakMid, 5, Math.max(1, n(2)), PAL.oakDark);
  v.box(c(2), c(3), c(10), W - 1 - c(2), L - 1 - c(4), c(11), PAL.oakWarm); // wooden serving counter top!
  // Tiny festive wares displayed on counter: brass hot-cocoa urn, colorful ornaments & mini wreaths!
  v.box(c(6), L - 1 - c(7), c(12), c(9), L - 1 - c(5), c(15), PAL.brass);
  v.box(c(14), L - 1 - c(6), c(12), c(17), L - 1 - c(5), c(14), PAL.hollyRed);
  v.box(c(20), L - 1 - c(6), c(12), c(24), L - 1 - c(5), c(14), PAL.pineHi);
  // 4 timber posts + rear shelved chalet wall + warm hanging Edison bulbs!
  for (const [px, py] of [[c(3), c(3)], [W - 1 - c(3), c(3)], [c(3), L - 1 - c(5)], [W - 1 - c(3), L - 1 - c(5)]]) {
    v.box(px, py, c(11), px + 1, py + 1, c(21), PAL.oakDark);
  }
  v.box(c(3), c(3), c(11), W - 1 - c(3), c(4), c(21), PAL.oakMid);
  v.wreath("+y", c(5), Math.floor(W * 0.5), c(16), n(2.4), true);
  for (let x = c(6); x <= W - 1 - c(6); x += Math.max(2, c(5))) {
    v.put(x, L - 1 - c(6), c(20), PAL.fairyWarm, 245);
  }
  // Striped snow-topped pitched booth roof + front evergreen swag!
  for (let step = 0; step <= c(9); step++) {
    const z = c(21) + step;
    const ins = Math.round(step * 1.15);
    for (let y = Math.max(0, ins); y <= Math.min(L - 1, L - 1 - ins); y++) {
      for (let x = c(1); x <= W - 1 - c(1); x++) {
        const stripe = (Math.floor(x / Math.max(1, n(3))) & 1) === 0;
        v.put(x, y, z, step >= c(3) ? PAL.snowHi : stripe ? stripeCol : PAL.creamTrim);
      }
    }
  }
  for (let x = c(3); x <= W - 1 - c(3); x += Math.max(1, n(2))) {
    const bulb = (x & 3) === 0;
    v.put(x, L - 1 - c(4), c(20), bulb ? PAL.fairyGold : PAL.pineHi, bulb ? 235 : 0);
  }

  return v.toAsset(id, "Christmas Market Chalet", vs);
}

/**
 * 9. DELICATE FAIRY-LIT WHITE WINTER BIRCH TREE (34x34x54 @ 0.14)
 *    - Slender white-bark trunk splitting into fine 1px snow-frosted branches wrapped in
 *      twinkling warm golden fairy lights (absolute showstopper under 8x RGSS AA!!).
 */
export function createFairyBirchTree(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(34), L = n(34), H = n(54);
  const vs = 0.14 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  const BARK_HI: RGB = [228, 230, 236];
  const BARK_MARK: RGB = [76, 82, 94];

  // White birch trunk with dark horizontal lenticel markings & golden fairy light spiral
  for (let z = 0; z < c(20); z++) {
    const r = Math.max(0.8, (2.2 - z / Math.max(1, c(20)) * 0.9) * s);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (Math.hypot(dx, dy) <= r) {
        v.put(cx + dx, cy + dy, z, (z % Math.max(2, n(4)) === 0 && dx > 0) ? BARK_MARK : BARK_HI);
      }
    }
    if (z > c(3) && z % Math.max(2, n(3)) === 0) {
      const a = z * 0.6;
      v.put(cx + Math.round(Math.cos(a) * (r + 0.8)), cy + Math.round(Math.sin(a) * (r + 0.8)), z, PAL.fairyWarm, 240);
    }
  }
  // 8 Graceful radiating winter branches with snowy twigs & twinkling fairy-light tips!
  for (let b = 0; b < 8; b++) {
    const ang = (b / 8) * Math.PI * 2 + (b & 1) * 0.25;
    const z0 = c(15 + (b % 3) * 4);
    const len = c(14 + (b % 2) * 4);
    const pitch = 0.65 + (b % 3) * 0.16;
    for (let t = 0; t <= len; t++) {
      const bx = cx + Math.cos(ang) * t * 0.72;
      const by = cy + Math.sin(ang) * t * 0.72;
      const bz = z0 + t * pitch;
      v.put(bx, by, bz, BARK_HI);
      if (t % Math.max(2, n(3)) === 1) v.put(bx, by, bz + 1, PAL.snowHi);
      if (t > c(4) && t % Math.max(2, n(4)) === 0) v.put(bx, by, bz - 1, PAL.fairyWarm, 248);
      // Secondary fine sub-twigs!
      if (t === Math.floor(len * 0.55) || t === Math.floor(len * 0.8)) {
        for (const subSgn of [-1, 1]) {
          const sa = ang + subSgn * 0.65;
          for (let k = 1; k <= c(6); k++) {
            const sx = bx + Math.cos(sa) * k * 0.7;
            const sy = by + Math.sin(sa) * k * 0.7;
            const sz = bz + k * 0.55;
            v.put(sx, sy, sz, k === c(6) ? PAL.fairyGold : BARK_HI, k === c(6) ? 245 : 0);
          }
        }
      }
    }
  }
  return v.toAsset("xmas_birch", "Fairy-Lit Winter Birch", vs, {}, [cx, cy, 0]);
}

/** 10. Two Organic Snow-Dusted Conifer Species (Tall Alpine Spruce & Broad Fluffy Fir). */
export function createOrganicSnowConifer(id: string, tall: boolean, detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(tall ? 28 : 34), L = n(tall ? 28 : 34), H = n(tall ? 58 : 48);
  const vs = 0.20 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  const seed = tall ? 53 : 89;

  for (let z = 0; z < c(11); z++) {
    const tr = c(2.2);
    for (let dy = -tr; dy <= tr; dy++) for (let dx = -tr; dx <= tr; dx++) {
      if (Math.hypot(dx, dy) <= tr) v.put(cx + dx, cy + dy, z, PAL.oakDark);
    }
  }
  const zStart = c(8);
  const tiers = tall ? 7.2 : 5.6;
  const maxR = c(tall ? 11.5 : 14.5);
  for (let z = zStart; z < H; z++) {
    const u = (z - zStart) / Math.max(1, H - zStart);
    const tierPhase = (u * tiers) % 1;
    const skirt = 1.0 + Math.pow(1.0 - tierPhase, 1.2) * 0.35;
    const baseR = Math.max(0.6, (1.0 - Math.pow(u, 0.90)) * maxR * skirt);
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > baseR + n(3)) continue;
      const ang = Math.atan2(dy, dx);
      const lobe = 1.0 + 0.22 * Math.sin(ang * 6.0 + Math.floor(u * tiers) * 1.9 + seed) + 0.11 * Math.cos(ang * 10.0 - u * 5.0);
      const rEff = baseR * lobe;
      if (d > rEff) continue;
      const outer = d >= rEff - n(2.4);
      const hVal = hash3(x, y, z, seed);
      const snowCap = (u > 0.88) || (tierPhase > 0.62 && outer && lobe > 0.93 && hVal > 72);
      if (snowCap) v.put(x, y, z, hVal > 165 ? PAL.snowHi : PAL.snowMid);
      else v.put(x, y, z, !outer ? PAL.pineDeep : hVal > 160 ? PAL.pineHi : PAL.pineMid);
    }
  }
  return v.toAsset(id, tall ? "Alpine Snow Spruce" : "Broad Snow Fir", vs, {}, [cx, cy, 0]);
}

/** 11. Rich Micro-Scale Street Props: Snowman, Park Bench, Glowing Firepit Brazier, Vintage Red Postbox! */
export function createDetailedSnowman(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(20), L = n(20), H = n(32);
  const vs = 0.088 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;

  const balls: Array<[number, number]> = [[6, 6.2], [14.5, 4.6], [21.5, 3.4]];
  for (const [sz, sr] of balls) {
    for (let z = 0; z < H; z++) for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot((x - cx) / s, (y - cy) / s, z / s - sz) <= sr) {
        v.put(x, y, z, z / s > sz ? PAL.snowHi : PAL.snowMid);
      }
    }
  }
  // Coal buttons, twig arms, plaid red scarf, orange carrot nose & tilted top hat!
  for (const bz of [12, 14.5, 17]) v.put(cx, cy + c(4.6), c(bz), PAL.iron);
  for (const sgn of [-1, 1]) {
    for (let k = 0; k < c(6); k++) v.put(cx + sgn * (c(4.2) + k), cy, c(15) + Math.floor(k * 0.45), PAL.oakDark);
  }
  for (let dx = -c(4); dx <= c(4); dx++) for (let dy = -c(4); dy <= c(4); dy++) {
    const d = Math.hypot(dx, dy);
    if (d <= c(4.2) && d >= c(2.6)) v.put(cx + dx, cy + dy, c(18.5), ((dx + dy) & 2) === 0 ? PAL.hollyRed : PAL.pineHi);
  }
  for (let k = 1; k <= c(3.2); k++) v.put(cx, cy + c(3.2) + k, c(21.5), [236, 118, 34]);
  v.put(cx - n(1.2), cy + c(3.2), c(22.6), PAL.iron);
  v.put(cx + n(1.2), cy + c(3.2), c(22.6), PAL.iron);
  for (let z = c(24.5); z <= c(30.5); z++) {
    const r = z <= c(25.5) ? c(4.5) : c(2.8);
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) v.put(x, y, z, z === c(26.5) ? PAL.hollyRed : PAL.iron);
    }
  }
  return v.toAsset("xmas_snowman", "Detailed Snowman", vs, {}, [cx, cy, 0]);
}

export function createSnowBench(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(22), L = n(10), H = n(13);
  const vs = 0.095 / s;
  const v = new VoxelCanvas(W, L, H);
  for (const sx of [c(3), W - 1 - c(3)]) {
    v.box(sx, c(2), 0, sx + 1, L - 1 - c(2), c(6), PAL.iron);
    v.box(sx, c(2), c(6), sx + 1, c(3), c(11), PAL.iron);
  }
  v.box(c(1), c(3), c(5), W - 1 - c(1), L - 1 - c(2), c(6), PAL.oakMid);
  v.box(c(1), c(2), c(8), W - 1 - c(1), c(3), c(11), PAL.oakMid);
  v.box(c(1), c(2), c(12), W - 1 - c(1), c(3), c(12), PAL.snowHi);
  v.box(c(2), c(4), c(7), W - 1 - c(2), L - 1 - c(3), c(7), PAL.snowMid);
  return v.toAsset("xmas_bench", "Snowy Park Bench", vs);
}

export function createFireBrazier(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(12), L = n(12), H = n(16);
  const vs = 0.095 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  // Wrought-iron tripod basket
  for (let z = 0; z < c(9); z++) {
    const r = z < c(4) ? c(3.2) : c(4.4);
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && d >= r - n(1.3)) v.put(x, y, z, PAL.iron);
    }
  }
  // Glowing warm crackling embers & dancing firelight tongues warming the ice skaters!
  for (let z = c(6); z <= c(13); z++) {
    const r = Math.max(0.6, (1 - (z - c(6)) / Math.max(1, c(8))) * c(3.2));
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) {
        const col: RGB = z > c(11) ? [255, 224, 108] : z > c(8) ? [255, 138, 42] : [224, 62, 28];
        v.put(x, y, z, col, 248);
      }
    }
  }
  return v.toAsset("xmas_brazier", "Warming Fire Brazier", vs, {}, [cx, cy, 0]);
}

export function createVintagePostbox(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(10), L = n(10), H = n(18);
  const vs = 0.095 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  for (let z = 0; z < c(16); z++) {
    const r = z < c(2) ? c(3.6) : z >= c(13) ? Math.max(1, c(3.4) - (z - c(13))) : c(3.0);
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) {
        v.put(x, y, z, z >= c(15) ? PAL.snowHi : z === c(10) && y > cy + c(2) ? PAL.iron : PAL.hollyRed);
      }
    }
  }
  return v.toAsset("xmas_postbox", "Vintage Red Postbox", vs, {}, [cx, cy, 0]);
}

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
    provenance: { kind: "blueprint", source: "xmas-mainstreet-v2" },
  });
}
