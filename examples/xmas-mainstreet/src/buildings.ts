/**
 * Eight Bespoke Micro-Voxel Architectural Landmarks for Main Street Christmas.
 * Every building has a genuinely distinct historic silhouette, recessed doorways/display bays
 * with visible interior vignettes, smooth coherent roof snowdrifts, dentil cornices, hanging
 * shop signs, wreaths, and graded continuous emissive lighting.
 */

import { type RGB, type VolumeAsset } from "@aastack/core";
import { FAIRY_COLORS, PAL, VoxelCanvas, hash3, shadeRgb, type DetailLevel } from "./voxel-kit.js";

/** Scale coordinate cleanly between Ultra HD (1.0x micro-voxels) and Classic (0.5x voxels). */
function mkScale(detail: DetailLevel) {
  const s = detail === "ultra" ? 1 : 0.5;
  return {
    s,
    n: (v: number) => Math.max(1, Math.round(v * s)),
    c: (v: number) => Math.round(v * s),
  };
}

/**
 * 1. GRAND VICTORIAN CLOCKTOWER & TOWN HALL (76x64x132 @ 0.155 in Ultra!)
 *    - Fluted colonnade granite portico with carved stone arches & warm vestibule
 *    - Mansard slate roof with wrought-iron roof cresting, 3 glowing attic dormers & smooth snowdrifts
 *    - Open-arch belfry with a hanging golden brass bell right below the spire!
 *    - 4 illuminated cream-and-gold clockfaces with Roman ticks & hands at 11:55 PM
 */
export function createGrandClocktowerHall(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(76), L = n(64), H = n(132);
  const vs = 0.155 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = Math.floor(W * 0.5);

  const bx0 = c(4), bx1 = W - 1 - c(4);
  const by0 = c(4), by1 = L - 1 - c(12); // front portico juts out +Y!
  const wallH = c(46);

  // 1. Raised granite ashlar foundation & textured heritage brick hall with limestone quoins
  v.box(bx0 - 1, by0 - 1, 0, bx1 + 1, by1 + 1, c(5), PAL.stoneMid);
  v.box(bx0 - 1, by0 - 1, c(5), bx1 + 1, by1 + 1, c(6), PAL.stoneHi);
  v.masonryShell(bx0, by0, c(6), bx1, by1, wallH, PAL.brickRed, 11, Math.max(2, n(3)), PAL.stoneHi);

  // Belt course & overhanging dentil stone cornice!
  v.box(bx0 - 1, by0 - 1, c(24), bx1 + 1, by1 + 1, c(25), PAL.stoneHi);
  v.box(bx0 - 2, by0 - 2, wallH - 1, bx1 + 2, by1 + 2, wallH + 1, PAL.stoneHi);
  for (let x = bx0 - 1; x <= bx1 + 1; x += Math.max(2, n(3))) {
    v.put(x, by1 + 2, wallH - 2, PAL.stoneMid);
  }

  // Tall arched glowing mullioned windows across front (+Y), back (-Y), and sides!
  for (const off of [-24, -14, 14, 24]) {
    v.recessedWindow({
      face: "+y", wallCoord: by1, uCenter: cx + c(off), zBot: c(9), halfW: n(3.5), height: n(12),
      trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, arched: true, candle: true, recessDepth: n(2),
    });
    v.recessedWindow({
      face: "+y", wallCoord: by1, uCenter: cx + c(off), zBot: c(28), halfW: n(3.5), height: n(13),
      trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, arched: true, candle: true, recessDepth: n(2),
    });
  }
  for (const off of [-20, 0, 20]) {
    v.recessedWindow({
      face: "-y", wallCoord: by0, uCenter: cx + c(off), zBot: c(28), halfW: n(3.5), height: n(12),
      trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, arched: true, recessDepth: n(2),
    });
  }
  for (const side of ["+x", "-x"] as const) {
    const wc = side === "+x" ? bx1 : bx0;
    for (const yOff of [14, 26, 38]) {
      v.recessedWindow({
        face: side, wallCoord: wc, uCenter: c(yOff), zBot: c(28), halfW: n(3.2), height: n(12),
        trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, arched: true, recessDepth: n(2),
      });
    }
  }

  // Grand arched oak & stained-glass entrance vestibule behind the portico
  v.recessedWindow({
    face: "+y", wallCoord: by1, uCenter: cx, zBot: c(7), halfW: n(6), height: n(15),
    trim: PAL.oakDark, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, arched: true, curtains: false, snowSill: false, recessDepth: n(3),
  });
  // Double carved oak doors lower half
  v.box(cx - c(4), by1 - c(2), c(7), cx + c(4), by1 - c(1), c(15), PAL.oakDark);
  v.box(cx - c(2), by1 - c(2), c(11), cx - c(1), by1 - c(1), c(14), PAL.winCandle, 128);
  v.box(cx + c(1), by1 - c(2), c(11), cx + c(2), by1 - c(1), c(14), PAL.winCandle, 128);

  // 2. Fluted Granite Colonnade Portico + Steps + Pediment + Wreath (+Y front)
  const pW = c(15);
  const pFront = by1 + c(10);
  for (let st = 0; st < n(5); st++) {
    v.box(cx - pW - n(2) + st, by1, st, cx + pW + n(2) - st, pFront + n(2) - st, st, st % 2 === 0 ? PAL.stoneMid : PAL.stoneHi);
  }
  // 4 fluted limestone portico columns + warm glowing brass portico lanterns
  for (const colX of [-12, -5, 5, 12]) {
    const x = cx + c(colX);
    v.box(x - 1, pFront - c(2), c(5), x + 1, pFront, c(25), PAL.stoneHi);
    v.box(x - c(1.5), pFront - c(2.5), c(24), x + c(1.5), pFront + 1, c(26), PAL.stoneHi); // capital
  }
  v.put(cx - c(8), pFront - c(3), c(19), PAL.fairyWarm, 245);
  v.put(cx + c(8), pFront - c(3), c(19), PAL.fairyWarm, 245);
  // Triangular classical stone pediment crowned with fluffy snowdrift & Christmas wreath!
  for (let dz = 0; dz <= c(10); dz++) {
    const half = Math.max(0, Math.round((pW + n(2)) * (1 - dz / Math.max(1, c(10)))));
    v.box(cx - half, by1, c(26) + dz, cx + half, pFront + 1, c(26) + dz,
      dz >= c(9) || half <= n(2) ? PAL.snowHi : PAL.stoneHi);
    if (half > n(2)) {
      v.box(cx - half, by1, c(27) + dz, cx - half + n(1), pFront + 1, c(27) + dz, PAL.snowHi);
      v.box(cx + half - n(1), by1, c(27) + dz, cx + half, pFront + 1, c(27) + dz, PAL.snowHi);
    }
  }
  v.wreath("+y", pFront + 2, cx, c(30), n(3.8), true);

  // 3. Steep French Mansard Slate Roof + Smooth Snow Blanket + Iron Roof Cresting + 3 Dormers!
  const mansardH = c(16);
  for (let dz = 0; dz <= mansardH; dz++) {
    const u = dz / Math.max(1, mansardH);
    const ins = Math.round(u * c(7));
    const z = wallH + 1 + dz;
    const x0 = bx0 - 1 + ins, x1 = bx1 + 1 - ins;
    const y0 = by0 - 1 + ins, y1 = by1 + 1 - ins;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const shell = x === x0 || x === x1 || y === y0 || y === y1 || dz === mansardH;
      if (!shell) continue;
      if (dz === mansardH) {
        v.put(x, y, z, PAL.snowHi);
      } else {
        const wave = Math.sin(x * (0.18 / s) + y * (0.14 / s)) * 0.14;
        const snowy = u > (0.42 + wave) || dz <= 1;
        v.put(x, y, z, snowy ? (u > 0.7 ? PAL.snowHi : PAL.snowMid) : (dz % 3 === 0 ? PAL.slateMid : PAL.slateDark));
      }
    }
  }
  // Ornate wrought-iron cresting railing around mansard flat top + glowing eave fairy lights
  const crX0 = bx0 - 1 + c(7), crX1 = bx1 + 1 - c(7);
  const crY0 = by0 - 1 + c(7), crY1 = by1 + 1 - c(7);
  for (let x = crX0; x <= crX1; x += Math.max(1, n(2))) {
    v.put(x, crY1, wallH + mansardH + 2, PAL.iron);
    v.put(x, crY1, wallH + mansardH + 3, PAL.ironHi);
    v.put(x, crY0, wallH + mansardH + 2, PAL.iron);
  }
  v.eaveLightsAndIcicles(bx0 - 1, bx1 + 1, by1 + 2, wallH, 7, Math.max(2, n(3)));

  // 4. Soaring Central 4-Sided Clocktower + Open Brass Belfry + Oxidized Copper Spire!
  const tcx = cx;
  const tcy = Math.round((by0 + by1) * 0.52);
  const tw = c(12);
  const tBaseZ = wallH + c(8);
  const clkTopZ = c(96);

  v.masonryShell(tcx - tw, tcy - tw, tBaseZ, tcx + tw, tcy + tw, clkTopZ, PAL.brickRed, 29, Math.max(2, n(2)), PAL.stoneHi);
  v.box(tcx - tw - 1, tcy - tw - 1, c(72), tcx + tw + 1, tcy + tw + 1, c(74), PAL.stoneHi);
  v.box(tcx - tw - 2, tcy - tw - 2, clkTopZ - 1, tcx + tw + 2, tcy + tw + 2, clkTopZ + 1, PAL.stoneHi);

  // 4 Illuminated Roman-Tick Clockfaces pointing to 11:55 PM!
  const clkZ = c(85);
  const clkR = c(8.2);
  const drawClockFace = (face: "+y" | "-y" | "+x" | "-x") => {
    const wc = face === "+y" ? tcy + tw : face === "-y" ? tcy - tw : face === "+x" ? tcx + tw : tcx - tw;
    const out = (face === "+y" || face === "+x") ? 1 : -1;
    for (let dz = -clkR - 1; dz <= clkR + 1; dz++) {
      for (let du = -clkR - 1; du <= clkR + 1; du++) {
        const d = Math.hypot(du, dz);
        if (d > clkR + 0.6) continue;
        let col: RGB = [254, 240, 198];
        let em: number = 136;
        if (d >= clkR - n(1.3)) {
          col = PAL.brass; em = 0;
        } else {
          // 12 crisp Roman hour tick marks around perimeter
          const ang = Math.atan2(dz, du);
          const tick = Math.abs(Math.sin(ang * 6.0)) < 0.14 && d > clkR * 0.68 && d < clkR * 0.86;
          // Hands showing 11:55 PM (both hands near 12!)
          const minHand = dz > 0 && Math.abs(du + dz * 0.27) < n(0.75) && dz < clkR * 0.74;
          const hrHand = dz > 0 && Math.abs(du + dz * 0.08) < n(0.95) && dz < clkR * 0.48;
          const pin = d < n(1.1);
          if (tick || minHand || hrHand || pin) { col = PAL.iron; em = 0; }
        }
        if (face === "+y" || face === "-y") v.put(tcx + du, wc + out, clkZ + dz, col, em);
        else v.put(wc + out, tcy + du, clkZ + dz, col, em);
      }
    }
  };
  drawClockFace("+y"); drawClockFace("-y"); drawClockFace("+x"); drawClockFace("-x");

  // Open Arched Belfry Lantern Gallery with a real Hanging Golden Brass Bell inside!
  const belBot = clkTopZ + 2;
  const belTop = c(108);
  const bw = c(9);
  for (const [ox, oy] of [[-bw, -bw], [bw, -bw], [-bw, bw], [bw, bw]]) {
    v.box(tcx + ox - 1, tcy + oy - 1, belBot, tcx + ox + 1, tcy + oy + 1, belTop, PAL.stoneHi);
  }
  // Warm illuminated belfry vault & sculpted hanging brass bell
  for (let dz = 0; dz < c(6); dz++) {
    const br = Math.max(1, Math.round((1.5 + (1 - dz / Math.max(1, c(6))) * 2.2) * s));
    for (let dy = -br; dy <= br; dy++) for (let dx = -br; dx <= br; dx++) {
      if (Math.hypot(dx, dy) <= br) v.put(tcx + dx, tcy + dy, belBot + c(2) + dz, PAL.brass, 110);
    }
  }
  v.put(tcx, tcy, belTop - 1, PAL.fairyWarm, 235);
  v.box(tcx - bw - 2, tcy - bw - 2, belTop, tcx + bw + 2, tcy + bw + 2, belTop + 1, PAL.snowHi);

  // Steep Oxidized Verdigris Copper Steeple + Smooth Snow Collar + Radiant Golden Finial!
  for (let z = belTop + 2; z < H - c(3); z++) {
    const u = (z - (belTop + 2)) / Math.max(1, H - c(3) - (belTop + 2));
    const rad = Math.max(0.5, (1 - u) * (bw + n(1.5)));
    for (let y = Math.round(tcy - rad); y <= Math.round(tcy + rad); y++) {
      for (let x = Math.round(tcx - rad); x <= Math.round(tcx + rad); x++) {
        if (Math.abs(x - tcx) < rad - 1.2 && Math.abs(y - tcy) < rad - 1.2) continue;
        const snowEdge = u < (0.20 + Math.sin(x * 0.3) * 0.05);
        v.put(x, y, z, snowEdge ? PAL.snowHi : (Math.abs(x - tcx) > rad - 1.5 && Math.abs(y - tcy) > rad - 1.5) ? PAL.copperHi : PAL.copperPatina);
      }
    }
  }
  for (let z = H - c(4); z < H; z++) v.put(tcx, tcy, z, PAL.brass, z === H - 1 ? 245 : 0);

  return v.toAsset("xmas_clocktower", "Grand Clocktower Town Hall", vs);
}

/**
 * 2. CORNER VICTORIAN TURRET TOY EMPORIUM ("KRINGLE TOYS" — 68x60x98 @ 0.145)
 *    - Signature conical snow-capped corner Victorian turret tower with curved windows!
 *    - Deep 3-voxel recessed bow display windows showing a glowing miniature Christmas tree,
 *      tiny red toy locomotive, & wrapped gift boxes INSIDE the shopfront!
 *    - Burgundy & cream striped snow-draped awning + hanging wrought-iron shop sign!
 */
export function createTurretToyEmporium(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(68), L = n(60), H = n(98);
  const vs = 0.145 / s;
  const v = new VoxelCanvas(W, L, H);

  const bx0 = c(4), bx1 = W - 1 - c(6);
  const by0 = c(5), by1 = L - 1 - c(11);
  const wallH = c(50);

  // Main heritage burgundy brick store block
  v.box(bx0 - 1, by0 - 1, 0, bx1 + 1, by1 + 1, c(4), PAL.stoneDark);
  v.masonryShell(bx0, by0, c(4), bx1, by1, wallH, PAL.brickRed, 19, Math.max(2, n(3)), PAL.creamTrim);
  v.box(bx0 - 1, by0 - 1, c(25), bx1 + 1, by1 + 1, c(26), PAL.creamTrim);
  v.box(bx0 - 2, by0 - 2, wallH - 1, bx1 + 2, by1 + 2, wallH + 1, PAL.creamTrim);

  // Deep 4-voxel recessed Ground-Floor Toy Display Vignette (+Y front)!
  const midX = Math.round((bx0 + bx1) * 0.5);
  // Central recessed Dutch oak doorway with brass lantern & transom
  v.recessedWindow({
    face: "+y", wallCoord: by1, uCenter: midX, zBot: c(4), halfW: n(4.5), height: n(17),
    trim: PAL.oakDark, sill: PAL.stoneMid, lit: true, warmCol: PAL.winCandle, curtains: false, snowSill: false, recessDepth: n(3),
  });
  v.box(midX - c(3), by1 - c(2), c(4), midX + c(3), by1 - c(2), c(15), PAL.mahogany);
  v.box(midX - c(2), by1 - c(2), c(10), midX + c(2), by1 - c(2), c(14), PAL.winCandle, 130);

  // Left & Right WIDE Toy Display Windows with VISIBLE MINIATURE CHRISTMAS TREE + RED TOY TRAIN INSIDE!!
  for (const [wx, hasTree] of [[bx0 + c(14), true], [bx1 - c(14), false]] as Array<[number, boolean]>) {
    v.recessedWindow({
      face: "+y", wallCoord: by1, uCenter: wx, zBot: c(6), halfW: n(7.5), height: n(14),
      trim: PAL.creamTrim, sill: PAL.oakDark, lit: true, warmCol: PAL.winCandle, curtains: true, snowSill: true, recessDepth: n(3),
    });
    // Interior toy shop vignette placed 2 voxels deep behind the mullioned glass!
    if (hasTree) {
      // Glowing miniature decorated Christmas tree inside the left toy display window!
      for (let dz = 0; dz < c(8); dz++) {
        const r = Math.max(0, Math.round((1 - dz / Math.max(1, c(8))) * c(3.2)));
        for (let dx = -r; dx <= r; dx++) {
          const orb = ((dx + dz) & 3) === 0;
          v.put(wx + dx, by1 - c(2), c(7) + dz, orb ? PAL.fairyRed : PAL.pineHi, orb ? 235 : 90);
        }
      }
      v.put(wx, by1 - c(2), c(15), PAL.fairyGold, 245);
    } else {
      // Tiny red wooden toy locomotive & colorful stacked gift boxes inside the right display window!
      v.box(wx - c(4), by1 - c(2), c(7), wx + c(3), by1 - c(2), c(9), PAL.hollyRed, 115);
      v.box(wx + c(1), by1 - c(2), c(9), wx + c(3), by1 - c(2), c(11), PAL.brass, 115);
      v.box(wx - c(5), by1 - c(2), c(10), wx - c(2), by1 - c(2), c(12), PAL.fairyBlue, 120);
    }
  }

  // Second-floor arched Victorian windows with pine window boxes & glowing candles
  for (const wx of [bx0 + c(15), midX, bx1 - c(15)]) {
    v.recessedWindow({
      face: "+y", wallCoord: by1, uCenter: wx, zBot: c(30), halfW: n(4), height: n(13),
      trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, arched: true, candle: true, recessDepth: n(2),
    });
    // Evergreen holiday window box brimming with holly berries!
    v.box(wx - c(4), by1 + 1, c(28), wx + c(4), by1 + c(2), c(29), PAL.oakDark);
    for (let dx = -c(4); dx <= c(4); dx++) {
      v.put(wx + dx, by1 + c(2), c(30), (dx & 3) === 0 ? PAL.hollyRed : PAL.pineHi);
    }
  }
  // Side & rear windows so zero blank walls from any camera angle
  for (const yw of [by0 + c(12), by1 - c(12)]) {
    v.recessedWindow({ face: "+x", wallCoord: bx1, uCenter: yw, zBot: c(30), halfW: n(3.5), height: n(11), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, recessDepth: n(2) });
    v.recessedWindow({ face: "-x", wallCoord: bx0, uCenter: yw, zBot: c(30), halfW: n(3.5), height: n(11), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winAmber, recessDepth: n(2) });
  }

  // Scalloped burgundy-and-cream striped canvas awning with thick snow lip + holly wreath!
  for (let dy = 1; dy <= c(6); dy++) {
    const az = c(24) - Math.floor(dy * 0.52);
    for (let x = bx0 + c(2); x <= bx1 - c(2); x++) {
      const stripe = (Math.floor(x / Math.max(1, n(3))) & 1) === 0;
      v.put(x, by1 + dy, az, stripe ? PAL.hollyRed : PAL.creamTrim);
      v.put(x, by1 + dy, az + 1, dy <= c(4) ? PAL.snowHi : PAL.snowMid);
    }
  }
  v.wreath("+y", by1 + 1, midX, c(27), n(3.0), true);

  // Hanging wrought-iron wooden shop sign protruding over sidewalk!
  const sgX = bx1 - c(4);
  v.box(sgX, by1 + 1, c(28), sgX, by1 + c(8), c(28), PAL.iron);
  v.box(sgX, by1 + c(2), c(24), sgX, by1 + c(7), c(27), PAL.mahogany);
  v.put(sgX, by1 + c(4), c(26), PAL.brass, 175);
  v.put(sgX, by1 + c(5), c(26), PAL.brass, 175);

  // Steep Snow-Blanketed Pitched Roof + Attic Dormer + Brick Chimney
  const roofH = c(22);
  const midY = (by0 + by1) * 0.5;
  const halfD = (by1 - by0) * 0.5;
  for (let dz = 0; dz <= roofH; dz++) {
    const u = dz / Math.max(1, roofH);
    const ySpan = Math.max(0.5, (1 - u) * (halfD + n(2)));
    for (let x = bx0 - 1; x <= bx1 + 1; x++) {
      const gable = x <= bx0 || x >= bx1;
      for (let y = Math.round(midY - ySpan); y <= Math.round(midY + ySpan); y++) {
        const slope = Math.abs(y - midY) >= ySpan - 1.3;
        if (!slope && !gable) continue;
        if (gable && !slope) v.put(x, y, wallH + dz, PAL.brickRed);
        else {
          const drift = Math.sin(x * (0.2 / s)) * 0.1;
          v.put(x, y, wallH + dz, dz === 0 && drift < 0 ? PAL.slateDark : (u > 0.55 + drift ? PAL.snowHi : PAL.snowMid));
        }
      }
    }
  }
  // Glowing gabled dormer peeking out roof
  v.box(midX - c(5), by1 - c(7), wallH + c(3), midX + c(5), by1 - c(2), wallH + c(11), PAL.creamTrim);
  v.box(midX - c(3), by1 - c(2), wallH + c(4), midX + c(3), by1 - c(2), wallH + c(9), PAL.winCandle, 124);
  v.box(midX - c(6), by1 - c(8), wallH + c(12), midX + c(6), by1 - c(1), wallH + c(13), PAL.snowHi);

  // SIGNATURE CORNER VICTORIAN CONICAL TURRET TOWER on the front-left corner!
  const tX = bx0 + c(3), tY = by1 - c(2);
  const tRad = c(9);
  const tTopZ = wallH + c(14);
  for (let z = c(24); z <= tTopZ; z++) {
    for (let dy = -tRad; dy <= tRad; dy++) for (let dx = -tRad; dx <= tRad; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > tRad || d < tRad - n(2)) continue;
      const winBand = z >= c(32) && z <= c(44) && (Math.abs(Math.atan2(dy, dx) - 1.1) < 1.3);
      const mull = (Math.round(Math.atan2(dy, dx) * 4) & 1) === 0;
      if (z === c(24) || z === tTopZ) v.put(tX + dx, tY + dy, z, PAL.creamTrim);
      else if (winBand && !mull && d >= tRad - 1.1) v.put(tX + dx, tY + dy, z, PAL.winCandle, 128);
      else v.put(tX + dx, tY + dy, z, PAL.brickRed);
    }
  }
  // Conical snowy verdigris turret witch-hat spire!
  for (let z = tTopZ + 1; z < H - c(2); z++) {
    const u = (z - tTopZ) / Math.max(1, H - c(2) - tTopZ);
    const r = Math.max(0.5, (1 - u) * (tRad + n(1.5)));
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r || d < r - 1.3) continue;
      v.put(tX + dx, tY + dy, z, u < 0.30 || dy > 0 ? PAL.snowHi : PAL.copperPatina);
    }
  }
  v.put(tX, tY, H - 1, PAL.brass, 240);
  v.eaveLightsAndIcicles(bx0, bx1, by1 + 2, wallH, 13, Math.max(2, n(3)));

  return v.toAsset("shop_toys", "Kringle Turret Toy Emporium", vs, {}, [W * 0.5, L * 0.5, 0]);
}

/**
 * 3. GRAND STARLIGHT ART DECO CINEMA (66x60x92 @ 0.145)
 *    - Curved protruding 3-sided glowing Marquee Canopy with triple incandescent chaser bulbs
 *    - Vertical illuminated retro CINEMA blade tower + stepped Art Deco crown parapet
 *    - Open tiled lobby recess with freestanding glowing brass-and-glass ticket kiosk & 4 movie posters!
 */
export function createStarlightCinema(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(66), L = n(60), H = n(92);
  const vs = 0.145 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = Math.floor(W * 0.5);
  const bx0 = c(4), bx1 = W - 1 - c(4);
  const by0 = c(5), by1 = L - 1 - c(14);
  const wallH = c(62);

  // Terracotta & warm limestone Art Deco masonry massing with fluted vertical pilasters
  v.masonryShell(bx0, by0, 0, bx1, by1, wallH, PAL.brickTerracotta, 47, Math.max(2, n(3)), PAL.stoneHi);
  for (let x = bx0 + c(6); x <= bx1 - c(6); x += Math.max(4, c(8))) {
    v.box(x - 1, by1, c(26), x + 1, by1 + 1, wallH + c(4), PAL.stoneHi);
  }
  // Stepped Art Deco crown parapet piled thick with fluffy snow!
  v.box(bx0, by0, wallH, bx1, by1, wallH + c(2), PAL.snowHi);
  for (let x = bx0; x <= bx1; x++) {
    const stepH = Math.round(Math.max(0, c(10) - Math.abs(x - cx) * 0.32));
    const qStep = Math.floor(stepH / Math.max(1, c(3))) * c(3);
    v.box(x, by1 - 1, wallH, x, by1 + 1, wallH + qStep, PAL.stoneHi);
    v.put(x, by1, wallH + qStep + 1, PAL.snowHi);
  }

  // Deep Recessed Grand Theater Foyer + Freestanding Glowing Brass Ticket Kiosk + 4 Framed Movie Posters!
  for (let z = c(1); z < c(20); z++) {
    for (let x = cx - c(14); x <= cx + c(14); x++) {
      for (let y = by1 - c(7); y <= by1; y++) v.clear(x, y, z);
    }
  }
  // Checkered marble foyer floor + warm interior ceiling + velvet doors
  for (let y = by1 - c(7); y <= by1; y++) for (let x = cx - c(14); x <= cx + c(14); x++) {
    v.put(x, y, 0, ((Math.floor(x / n(2)) + Math.floor(y / n(2))) & 1) === 0 ? PAL.creamTrim : PAL.mahogany);
    v.put(x, y, c(19), PAL.winCandle, 128);
  }
  v.box(cx - c(14), by1 - c(8), 0, cx + c(14), by1 - c(7), c(19), PAL.mahogany);
  for (const dx of [-6, 0, 6]) {
    v.box(cx + c(dx) - c(2), by1 - c(7), c(2), cx + c(dx) + c(2), by1 - c(7), c(14), PAL.winHoney, 120);
  }
  // Freestanding Octagonal Brass & Glass Ticket Booth right in front of the doors!
  v.box(cx - c(3), by1 - c(4), c(1), cx + c(3), by1 - c(1), c(7), PAL.mahogany);
  v.box(cx - c(3), by1 - c(4), c(7), cx + c(3), by1 - c(1), c(13), PAL.winCandle, 145);
  v.box(cx - c(3.5), by1 - c(4.5), c(13), cx + c(3.5), by1 - c(0.5), c(15), PAL.brass);

  // 4 Glowing Illuminated Movie Poster Display Cases flanking the entrance!
  for (const px of [bx0 + c(7), bx0 + c(13), bx1 - c(13), bx1 - c(7)]) {
    v.box(px - c(2.2), by1, c(5), px + c(2.2), by1 + 1, c(16), PAL.brass);
    v.box(px - c(1.5), by1 + 1, c(6), px + c(1.5), by1 + 1, c(15), px < cx ? [196, 134, 92] : [118, 168, 212], 132);
  }

  // ICONIC CURVED PROTRUDING 3-SIDED GLOWING ART DECO MARQUEE CANOPY!
  for (let dy = 1; dy <= c(11); dy++) {
    const taper = Math.round(Math.pow(dy / Math.max(1, c(11)), 1.4) * c(9));
    const mx0 = bx0 + c(4) + taper;
    const mx1 = bx1 - c(4) - taper;
    // Glowing recessed underside soffit bathed in golden incandescent bulbs
    for (let x = mx0; x <= mx1; x++) {
      const soffBulb = ((x + dy) % Math.max(2, n(3)) === 0);
      v.put(x, by1 + dy, c(20), soffBulb ? PAL.fairyWarm : PAL.winCandle, soffBulb ? 245 : 138);
      // Cream illuminated letterboard band + crimson trim + snow blanket on top!
      const onRim = dy >= c(10) || x <= mx0 + 1 || x >= mx1 - 1;
      if (onRim) {
        for (let z = c(21); z <= c(28); z++) {
          const isTrim = z === c(21) || z === c(28);
          const isText = z >= c(23) && z <= c(26) && ((x + dy) % Math.max(2, n(3)) === 0);
          const isChaser = isTrim && ((x + dy) % Math.max(2, n(2)) === 0);
          v.put(x, by1 + dy, z, isChaser ? PAL.fairyWarm : isTrim ? PAL.hollyRed : isText ? PAL.iron : PAL.creamTrim,
            isChaser ? 255 : isTrim ? 0 : isText ? 0 : 142);
        }
      }
      v.put(x, by1 + dy, c(29), dy <= c(8) ? PAL.snowHi : PAL.snowMid);
    }
  }

  // Soaring Vertical Retro Glowing Blade Sign rising above the marquee!
  for (let z = c(30); z <= H - c(4); z++) {
    for (let dy = 1; dy <= c(9); dy++) {
      const frame = dy === c(9) || z === c(30) || z === H - c(4);
      const bulb = frame && ((z + dy) % Math.max(2, n(3)) === 0);
      v.put(cx - 1, by1 + dy, z, bulb ? PAL.fairyRed : frame ? PAL.brass : PAL.mahogany, bulb ? 255 : 0);
      v.put(cx, by1 + dy, z, bulb ? PAL.fairyWarm : (z % Math.max(2, n(4)) < n(2) ? PAL.fairyGold : PAL.mahogany), bulb ? 255 : (z % Math.max(2, n(4)) < n(2) ? 185 : 0));
      v.put(cx + 1, by1 + dy, z, bulb ? PAL.fairyRed : frame ? PAL.brass : PAL.mahogany, bulb ? 255 : 0);
    }
  }
  // Glowing side windows for corner depth
  for (const side of ["+x", "-x"] as const) {
    const wc = side === "+x" ? bx1 : bx0;
    for (const yw of [by0 + c(14), by1 - c(12)]) {
      v.recessedWindow({ face: side, wallCoord: wc, uCenter: yw, zBot: c(34), halfW: n(3.5), height: n(13), trim: PAL.stoneHi, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, recessDepth: n(2) });
    }
  }

  return v.toAsset("shop_cinema", "Grand Starlight Cinema", vs);
}

/**
 * 4. HALF-TIMBERED ALPINE HEARTHSTONE BAKERY & COCOA HOUSE (64x56x84 @ 0.145)
 *    - Overhanging JETTED second story resting on carved oak corbel brackets!
 *    - Authentic dark-oak Tudor half-timber diagonal cross-bracing over warm cream stucco
 *    - Protruding exterior fieldstone fireplace chimney + scalloped green snowy awning!
 */
export function createTudorBakeryCafe(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(64), L = n(56), H = n(84);
  const vs = 0.145 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = Math.floor(W * 0.5);

  const bx0 = c(5), bx1 = W - 1 - c(7);
  const by0 = c(6), by1 = L - 1 - c(11);
  const floor1H = c(24);
  const wallH = c(48);

  // Ground floor warm limestone masonry recessed 2 voxels under the overhanging jetted upper story!
  v.masonryShell(bx0 + c(1), by0 + c(1), 0, bx1 - c(1), by1 - c(1), floor1H, PAL.stoneMid, 23, Math.max(2, n(2)), PAL.stoneHi);

  // Carved oak corbel brackets supporting the jetted second floor!
  for (let x = bx0 + c(2); x <= bx1 - c(2); x += Math.max(3, c(6))) {
    v.box(x, by1 - 1, floor1H - c(3), x + 1, by1 + 1, floor1H, PAL.oakDark);
  }
  v.box(bx0 - 1, by0 - 1, floor1H, bx1 + 1, by1 + 2, floor1H + 1, PAL.oakDark);

  // Overhanging jetted second story in cream stucco with crisp dark-oak Tudor timber beams & diagonals!
  v.masonryShell(bx0 - 1, by0 - 1, floor1H + 1, bx1 + 1, by1 + 2, wallH, PAL.stuccoCream, 31, Math.max(2, n(3)), PAL.oakDark);
  for (let z = floor1H + 1; z <= wallH; z++) {
    for (let x = bx0 - 1; x <= bx1 + 1; x++) {
      const colBeam = (x - bx0) % Math.max(4, c(10)) === 0;
      const midBeam = z === floor1H + c(11) || z >= wallH - 1;
      const diag = Math.abs(((x - bx0) % Math.max(4, c(10))) - (z - floor1H)) <= 1 && z < floor1H + c(11);
      if (colBeam || midBeam || diag) {
        v.put(x, by1 + 2, z, PAL.oakDark);
        v.put(x, by0 - 1, z, PAL.oakDark);
      }
    }
  }

  // Warm bakery display bay windows + arched oak entrance + scalloped forest-green awning!
  v.recessedWindow({
    face: "+y", wallCoord: by1 - 1, uCenter: cx - c(11), zBot: c(5), halfW: n(7), height: n(13),
    trim: PAL.oakDark, sill: PAL.oakWarm, lit: true, warmCol: PAL.winHoney, curtains: true, candle: true, recessDepth: n(3),
  });
  v.recessedWindow({
    face: "+y", wallCoord: by1 - 1, uCenter: cx + c(11), zBot: c(5), halfW: n(7), height: n(13),
    trim: PAL.oakDark, sill: PAL.oakWarm, lit: true, warmCol: PAL.winCandle, curtains: true, candle: true, recessDepth: n(3),
  });
  v.recessedWindow({
    face: "+y", wallCoord: by1 - 1, uCenter: cx, zBot: c(3), halfW: n(3.8), height: n(15),
    trim: PAL.oakDark, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, arched: true, curtains: false, snowSill: false, recessDepth: n(3),
  });
  // Forest-green & cream striped bakery awning with snow pillow on top!
  for (let dy = 1; dy <= c(5); dy++) {
    const az = c(22) - Math.floor(dy * 0.45);
    for (let x = bx0; x <= bx1; x++) {
      const stripe = (Math.floor(x / Math.max(1, n(3))) & 1) === 0;
      v.put(x, by1 + dy, az, stripe ? PAL.pineMid : PAL.creamTrim);
      v.put(x, by1 + dy, az + 1, PAL.snowHi);
    }
  }
  v.wreath("+y", by1 + 2, cx, floor1H + c(2), n(3.0), true);

  // Upper Tudor mullioned windows with draped curtains & candles!
  for (const wx of [cx - c(13), cx, cx + c(13)]) {
    v.recessedWindow({
      face: "+y", wallCoord: by1 + 2, uCenter: wx, zBot: floor1H + c(6), halfW: n(4), height: n(12),
      trim: PAL.oakDark, sill: PAL.oakDark, lit: true, warmCol: PAL.winCandle, candle: true, recessDepth: n(2),
    });
  }
  for (const side of ["+x", "-x"] as const) {
    const wc = side === "+x" ? bx1 + 1 : bx0 - 1;
    v.recessedWindow({ face: side, wallCoord: wc, uCenter: Math.round((by0 + by1) * 0.5), zBot: floor1H + c(6), halfW: n(4), height: n(11), trim: PAL.oakDark, sill: PAL.oakDark, lit: true, warmCol: PAL.winHoney, recessDepth: n(2) });
  }

  // Steep Front-Facing Swiss/Alpine Gable Roof (different orientation from Toy Shop for dynamic skyline!)
  const roofH = c(26);
  const halfW = (bx1 - bx0) * 0.5 + n(3);
  for (let dz = 0; dz <= roofH; dz++) {
    const u = dz / Math.max(1, roofH);
    const xSpan = Math.max(0.5, (1 - u) * halfW);
    for (let y = by0 - c(2); y <= by1 + c(4); y++) {
      const onGable = y <= by0 - 1 || y >= by1 + 2;
      for (let x = Math.round(cx - xSpan); x <= Math.round(cx + xSpan); x++) {
        const slope = Math.abs(x - cx) >= xSpan - 1.5;
        if (!slope && !onGable) continue;
        if (onGable && !slope) {
          const timber = (dz % Math.max(3, c(6)) === 0) || Math.abs(x - cx) < 1;
          v.put(x, y, wallH + dz, timber ? PAL.oakDark : PAL.stuccoCream);
        } else {
          v.put(x, y, wallH + dz, dz === 0 ? PAL.cedarRoof : (u > 0.45 ? PAL.snowHi : PAL.snowMid));
        }
      }
    }
  }
  // Glowing cozy rose/circular attic gable window right under the snow peak!
  v.recessedWindow({
    face: "+y", wallCoord: by1 + 2, uCenter: cx, zBot: wallH + c(5), halfW: n(3.5), height: n(9),
    trim: PAL.oakDark, sill: PAL.oakDark, lit: true, warmCol: PAL.winCandle, arched: true, recessDepth: n(2),
  });

  // Protruding Exterior Fieldstone Bakery Fireplace Chimney climbing the right wall!
  for (let z = 0; z < H - c(2); z++) {
    const chW = z < floor1H ? c(5) : c(3);
    for (let dy = -chW; dy <= chW; dy++) for (let dx = 0; dx <= c(4); dx++) {
      const st = (hash3(dx, dy, z, 61) & 15) - 7;
      v.put(bx1 + 1 + dx, Math.round((by0 + by1) * 0.45) + dy, z, z >= H - c(4) ? PAL.snowHi : shadeRgb(PAL.stoneMid, st));
    }
  }
  v.eaveLightsAndIcicles(bx0 - 2, bx1 + 2, by1 + c(4), wallH, 23, Math.max(2, n(3)));

  return v.toAsset("shop_bakery", "Hearthstone Tudor Bakery", vs);
}

/**
 * 5. DUTCH STEPPED-GABLE BOOKSHOP & ANTIQUE EMPORIUM (64x56x94 @ 0.145)
 *    - Iconic stepped Flemish/Dutch gable crowned with snowy limestone coping
 *    - Heritage midnight-navy masonry + 2-story glowing bay window packed with tiny colorful books!
 *    - Second-floor wrought-iron Juliet balcony draped in evergreen pine garland & fairy lights!
 */
export function createDutchGableBookshop(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(64), L = n(56), H = n(94);
  const vs = 0.145 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = Math.floor(W * 0.5);
  const bx0 = c(5), bx1 = W - 1 - c(5);
  const by0 = c(6), by1 = L - 1 - c(10);
  const wallH = c(52);

  v.box(bx0 - 1, by0 - 1, 0, bx1 + 1, by1 + 1, c(4), PAL.stoneDark);
  v.masonryShell(bx0, by0, c(4), bx1, by1, wallH, PAL.brickNavy, 37, Math.max(2, n(3)), PAL.stoneHi);
  v.box(bx0 - 1, by0 - 1, c(25), bx1 + 1, by1 + 1, c(26), PAL.stoneHi);

  // Recessed warm mahogany bookshop entrance + wide bay window packed with colorful miniature books!
  v.recessedWindow({
    face: "+y", wallCoord: by1, uCenter: cx - c(12), zBot: c(5), halfW: n(5.5), height: n(15),
    trim: PAL.oakDark, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, arched: true, curtains: false, recessDepth: n(3),
  });
  v.recessedWindow({
    face: "+y", wallCoord: by1, uCenter: cx + c(7), zBot: c(6), halfW: n(11), height: n(14),
    trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, curtains: false, recessDepth: n(3),
  });
  // Floor-to-ceiling colorful miniature book rows visible INSIDE the recessed bookshop window!
  const bookCols: RGB[] = [PAL.hollyRed, PAL.pineHi, PAL.brass, [88, 124, 178], PAL.oakWarm];
  for (let shelf = 0; shelf < 3; shelf++) {
    const sz = c(7) + shelf * c(4);
    for (let x = cx - c(2); x <= cx + c(16); x++) {
      if ((x & 1) === 0) v.put(x, by1 - c(2), sz, bookCols[hash3(x, shelf, 1, 7) % bookCols.length], 108);
      v.put(x, by1 - c(2), sz - 1, PAL.oakDark);
    }
  }

  // Second-floor tall library windows + Wrought-Iron Juliet Balcony draped in pine garland & fairy lights!
  for (const wx of [cx - c(14), cx, cx + c(14)]) {
    v.recessedWindow({
      face: "+y", wallCoord: by1, uCenter: wx, zBot: c(29), halfW: n(4.2), height: n(15),
      trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, candle: true, recessDepth: n(2),
    });
  }
  // Wrought-iron balcony slab & ornate balusters across the upper front!
  v.box(cx - c(18), by1 + 1, c(28), cx + c(18), by1 + c(5), c(29), PAL.stoneMid);
  for (let x = cx - c(18); x <= cx + c(18); x++) {
    v.put(x, by1 + c(5), c(35), PAL.iron);
    v.put(x, by1 + c(5), c(36), PAL.snowHi);
    if ((x - cx) % Math.max(2, n(2)) === 0) {
      for (let z = c(29); z <= c(35); z++) v.put(x, by1 + c(5), z, PAL.iron);
    }
    // Evergreen holiday garland & twinkling lights swooping along the iron balcony!
    const sag = Math.round(Math.abs(Math.sin((x - cx) * 0.25)) * c(2));
    v.put(x, by1 + c(6), c(34) - sag, (x & 3) === 0 ? PAL.fairyGold : PAL.pineHi, (x & 3) === 0 ? 235 : 0);
  }
  v.wreath("+y", by1 + 1, cx - c(12), c(23), n(2.8), true);

  // Iconic Stepped Dutch/Flemish Gable Facade (front +Y and back -Y) + pitched snowy slate roof behind!
  const gSteps = 5;
  const stepH = c(6);
  const halfW = (bx1 - bx0) * 0.5;
  for (let st = 0; st < gSteps; st++) {
    const wHalf = Math.round(halfW * (1 - st * 0.19));
    const z0 = wallH + st * stepH;
    const z1 = z0 + stepH;
    v.box(cx - wHalf, by1 - 1, z0, cx + wHalf, by1 + 1, z1, PAL.brickNavy);
    v.box(cx - wHalf, by0 - 1, z0, cx + wHalf, by0 + 1, z1, PAL.brickNavy);
    // Snowy limestone step caps on every gable tier!
    v.box(cx - wHalf - 1, by1 - 1, z1, cx + wHalf + 1, by1 + 1, z1 + 1, PAL.stoneHi);
    v.box(cx - wHalf - 1, by1 - 1, z1 + 2, cx + wHalf + 1, by1 + 1, z1 + 2, PAL.snowHi);
  }
  // Glowing arched attic study window inside the stepped gable!
  v.recessedWindow({
    face: "+y", wallCoord: by1 + 1, uCenter: cx, zBot: wallH + c(5), halfW: n(4.5), height: n(12),
    trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, arched: true, candle: true, recessDepth: n(2),
  });
  // Snowy pitched roof spanning behind the Dutch gable
  const roofTop = wallH + gSteps * stepH - c(2);
  for (let dz = 0; dz <= roofTop - wallH; dz++) {
    const u = dz / Math.max(1, roofTop - wallH);
    const xSpan = Math.max(0.5, (1 - u) * halfW);
    for (let y = by0 + 1; y <= by1 - 1; y++) {
      for (let x = Math.round(cx - xSpan); x <= Math.round(cx + xSpan); x++) {
        if (Math.abs(x - cx) < xSpan - 1.4) continue;
        v.put(x, y, wallH + dz, u > 0.35 ? PAL.snowHi : PAL.snowMid);
      }
    }
  }
  for (const side of ["+x", "-x"] as const) {
    const wc = side === "+x" ? bx1 : bx0;
    v.recessedWindow({ face: side, wallCoord: wc, uCenter: Math.round((by0 + by1) * 0.5), zBot: c(30), halfW: n(4), height: n(13), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, recessDepth: n(2) });
  }
  v.eaveLightsAndIcicles(bx0, bx1, by1 + 2, wallH, 37, Math.max(2, n(3)));

  return v.toAsset("shop_books", "Dutch Gable Bookshop", vs);
}

/**
 * 6. WRAP-AROUND VERANDA NORTH STAR INN (72x64x88 @ 0.145)
 *    - Cozy timber-and-stone mountain lodge with a covered wrap-around veranda porch,
 *      turned white railings, warm glowing hanging porch lanterns, and glowing windows on ALL 4 sides!
 */
export function createVerandaNorthStarInn(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(72), L = n(64), H = n(88);
  const vs = 0.145 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = Math.floor(W * 0.5);

  const bx0 = c(10), bx1 = W - 1 - c(6);
  const by0 = c(6), by1 = L - 1 - c(12);
  const wallH = c(48);

  // Fieldstone base + warm sage-painted heritage timber clapboard lodge
  v.masonryShell(bx0, by0, 0, bx1, by1, c(10), PAL.stoneMid, 71, Math.max(2, n(3)), PAL.stoneHi);
  v.masonryShell(bx0, by0, c(10), bx1, by1, wallH, PAL.brickSage, 73, Math.max(2, n(3)), PAL.creamTrim);
  v.box(bx0 - 1, by0 - 1, c(24), bx1 + 1, by1 + 1, c(25), PAL.creamTrim);

  // Wrap-around covered porch deck (+Y front AND -X west side!) with white balustrade & hanging brass lanterns!
  v.box(bx0 - c(8), by0, 0, bx1 + c(2), by1 + c(9), c(3), PAL.oakDark);
  // Porch columns & railings
  for (let x = bx0 - c(7); x <= bx1 + c(1); x += Math.max(4, c(9))) {
    v.box(x, by1 + c(8), c(3), x + 1, by1 + c(8), c(21), PAL.creamTrim);
    if (x > bx0 - c(6) && x < bx1) v.put(x, by1 + c(7), c(18), PAL.fairyWarm, 240);
  }
  for (let y = by0 + c(2); y <= by1 + c(8); y += Math.max(4, c(9))) {
    v.box(bx0 - c(7), y, c(3), bx0 - c(7), y + 1, c(21), PAL.creamTrim);
  }
  // Balustrade rail
  v.box(bx0 - c(7), by1 + c(8), c(9), bx1 + c(1), by1 + c(8), c(10), PAL.creamTrim);
  v.box(bx0 - c(7), by0 + c(2), c(9), bx0 - c(7), by1 + c(8), c(10), PAL.creamTrim);
  // Sloped snow-covered porch veranda roof!
  for (let dy = 0; dy <= c(9); dy++) {
    const z = c(24) - Math.floor(dy * 0.35);
    v.box(bx0 - c(8), by1 + dy, z, bx1 + c(2), by1 + dy, z, PAL.cedarRoof);
    v.box(bx0 - c(8), by1 + dy, z + 1, bx1 + c(2), by1 + dy, z + 1, PAL.snowHi);
  }
  for (let dx = 0; dx <= c(8); dx++) {
    const z = c(24) - Math.floor(dx * 0.35);
    v.box(bx0 - dx, by0, z, bx0 - dx, by1 + c(8), z, PAL.cedarRoof);
    v.box(bx0 - dx, by0, z + 1, bx0 - dx, by1 + c(8), z + 1, PAL.snowHi);
  }

  // Cozy glowing windows on ALL 4 sides!
  for (const wx of [cx - c(14), cx, cx + c(14)]) {
    v.recessedWindow({ face: "+y", wallCoord: by1, uCenter: wx, zBot: c(7), halfW: n(4), height: n(13), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, candle: true, recessDepth: n(2) });
    v.recessedWindow({ face: "+y", wallCoord: by1, uCenter: wx, zBot: c(29), halfW: n(4), height: n(13), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, candle: true, recessDepth: n(2) });
    v.recessedWindow({ face: "-y", wallCoord: by0, uCenter: wx, zBot: c(29), halfW: n(4), height: n(12), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winAmber, recessDepth: n(2) });
  }
  for (const yw of [by0 + c(14), by1 - c(14)]) {
    v.recessedWindow({ face: "-x", wallCoord: bx0, uCenter: yw, zBot: c(8), halfW: n(4), height: n(12), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winCandle, recessDepth: n(2) });
    v.recessedWindow({ face: "-x", wallCoord: bx0, uCenter: yw, zBot: c(29), halfW: n(4), height: n(12), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, recessDepth: n(2) });
    v.recessedWindow({ face: "+x", wallCoord: bx1, uCenter: yw, zBot: c(29), halfW: n(4), height: n(12), trim: PAL.creamTrim, sill: PAL.stoneHi, lit: true, warmCol: PAL.winHoney, recessDepth: n(2) });
  }
  v.wreath("+y", by1 + 1, cx, c(27), n(3.2), true);

  // Steep Snow-Blanketed Lodge Roof + 2 Twin Dormers + Stone Fireplace Chimney!
  const roofH = c(26);
  const midY = (by0 + by1) * 0.5;
  const halfD = (by1 - by0) * 0.5 + n(2);
  for (let dz = 0; dz <= roofH; dz++) {
    const u = dz / Math.max(1, roofH);
    const ySpan = Math.max(0.5, (1 - u) * halfD);
    for (let x = bx0 - 1; x <= bx1 + 1; x++) {
      const onGable = x <= bx0 || x >= bx1;
      for (let y = Math.round(midY - ySpan); y <= Math.round(midY + ySpan); y++) {
        const slope = Math.abs(y - midY) >= ySpan - 1.4;
        if (!slope && !onGable) continue;
        if (onGable && !slope) v.put(x, y, wallH + dz, PAL.brickSage);
        else v.put(x, y, wallH + dz, dz === 0 ? PAL.cedarRoof : (u > 0.48 ? PAL.snowHi : PAL.snowMid));
      }
    }
  }
  for (const dx of [-12, 12]) {
    v.box(cx + c(dx) - c(4), by1 - c(6), wallH + c(3), cx + c(dx) + c(4), by1 - c(1), wallH + c(11), PAL.creamTrim);
    v.box(cx + c(dx) - c(2.5), by1 - c(1), wallH + c(5), cx + c(dx) + c(2.5), by1 - c(1), wallH + c(9), PAL.winCandle, 126);
    v.box(cx + c(dx) - c(5), by1 - c(7), wallH + c(12), cx + c(dx) + c(5), by1, wallH + c(13), PAL.snowHi);
  }
  // Stone chimney climbing the east end
  v.box(bx1, Math.round(midY - c(3)), 0, bx1 + c(4), Math.round(midY + c(3)), H - c(6), PAL.stoneMid);
  v.box(bx1, Math.round(midY - c(3)), H - c(5), bx1 + c(4), Math.round(midY + c(3)), H - c(4), PAL.snowHi);
  v.eaveLightsAndIcicles(bx0, bx1, by1 + 2, wallH, 71, Math.max(2, n(3)));

  return v.toAsset("shop_inn", "North Star Veranda Inn", vs);
}

/**
 * 7. VICTORIAN PARK BANDSTAND GAZEBO (48x48x58 @ 0.13)
 *    - Octagonal stone deck with stairs, turned timber pillars, glowing brass chandelier inside,
 *      festive garland swags with red bows & warm fairy bulbs, and snowy copper cupola roof!
 */
export function createParkBandstandGazebo(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(48), L = n(48), H = n(58);
  const vs = 0.13 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5, cy = (L - 1) * 0.5;
  const rad = c(19);

  // Raised octagonal snow-dusted stone deck
  for (let z = 0; z < c(5); z++) {
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const oct = Math.max(dx, dy, (dx + dy) * 0.72);
      if (oct <= rad) {
        const edge = oct > rad - n(2);
        v.put(x, y, z, z === c(4) ? (edge ? PAL.snowHi : PAL.oakWarm) : PAL.stoneMid);
      }
    }
  }
  // 8 turned cream timber pillars + low carved filigree balustrade (leaving front +Y entry open!)
  const pR = rad - c(2);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const px = Math.round(cx + Math.cos(a) * pR);
    const py = Math.round(cy + Math.sin(a) * pR);
    v.box(px - 1, py - 1, c(5), px + 1, py + 1, c(28), PAL.creamTrim);
    // Connect adjacent pillars with balustrade railings & overhanging evergreen swags!
    const a2 = ((k + 1) * Math.PI) / 4 + Math.PI / 8;
    const px2 = Math.round(cx + Math.cos(a2) * pR);
    const py2 = Math.round(cy + Math.sin(a2) * pR);
    const isEntry = k === 1;
    const steps = c(14);
    for (let t = 1; t < steps; t++) {
      const u = t / steps;
      const rx = Math.round(px + (px2 - px) * u);
      const ry = Math.round(py + (py2 - py) * u);
      if (!isEntry) {
        v.put(rx, ry, c(12), PAL.creamTrim);
        if ((t & 1) === 0) {
          for (let z = c(5); z < c(12); z++) v.put(rx, ry, z, PAL.creamTrim);
        }
      }
      // Hanging festive evergreen garland & sparkling warm bulbs along the upper fascia!
      const sag = Math.round(Math.sin(u * Math.PI) * c(3));
      const bulb = (t % Math.max(2, n(3)) === 0);
      v.put(rx, ry, c(26) - sag, bulb ? PAL.fairyWarm : PAL.pineHi, bulb ? 245 : 0);
      if (t === Math.floor(steps * 0.5)) v.put(rx, ry, c(26) - sag - 1, PAL.hollyRed);
    }
  }

  // Warm Glowing Hanging Brass Chandelier right under the vaulted dome ceiling!
  for (let z = c(24); z <= c(31); z++) v.put(cx, cy, z, PAL.brass);
  for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [0, 0]]) {
    v.put(cx + c(ox), cy + c(oy), c(24), PAL.fairyWarm, 250);
    v.put(cx + c(ox), cy + c(oy), c(23), PAL.brass);
  }

  // Graceful Swooping Octagonal Snow-Draped Copper Pavilion Roof + Finial!
  for (let z = c(28); z < H - c(4); z++) {
    const u = (z - c(28)) / Math.max(1, H - c(4) - c(28));
    // Concave Victorian pagoda/gazebo sweep!
    const r = Math.max(0.6, Math.pow(1 - u, 1.35) * (rad + n(3)));
    for (let y = 0; y < L; y++) for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const oct = Math.max(dx, dy, (dx + dy) * 0.72);
      if (oct > r || oct < r - n(1.8)) continue;
      v.put(x, y, z, u > 0.15 ? (u > 0.55 ? PAL.snowHi : PAL.snowMid) : PAL.copperPatina);
    }
  }
  for (let z = H - c(5); z < H; z++) v.put(cx, cy, z, PAL.brass, z === H - 1 ? 240 : 0);

  return v.toAsset("xmas_gazebo", "Victorian Park Gazebo", vs);
}

/**
 * 8. ARCHED GRANITE CREEK FOOTBRIDGE (56x32x26 @ 0.14)
 *    - Carved granite voussoir arch spanning our winding frozen winter creek!
 *    - Snow-capped stone parapets & 4 warm glowing wrought-iron bridge lanterns!
 */
export function createStoneArchBridge(detail: DetailLevel): VolumeAsset {
  const { s, c, n } = mkScale(detail);
  const W = n(56), L = n(32), H = n(26);
  const vs = 0.14 / s;
  const v = new VoxelCanvas(W, L, H);
  const cx = (W - 1) * 0.5;

  for (let x = 0; x < W; x++) {
    const nx = (x - cx) / Math.max(1, W * 0.5); // -1..+1
    const archTop = Math.round((1 - nx * nx) * c(8.5));
    const deckZ = c(2) + Math.round((1 - nx * nx) * c(6.5));
    for (let y = c(2); y <= L - 1 - c(2); y++) {
      const onParapet = y <= c(4) || y >= L - 1 - c(4);
      // Carved stone arch masonry beneath the roadway
      for (let z = 0; z <= deckZ; z++) {
        if (Math.abs(nx) < 0.72 && z < archTop) continue; // open semicircular creek arch!
        const isVoussoir = Math.abs(z - archTop) <= n(1.5) && Math.abs(nx) < 0.74;
        const grain = (hash3(x, y, z, 89) & 15) - 7;
        v.put(x, y, z, isVoussoir ? PAL.stoneHi : shadeRgb(PAL.stoneMid, grain));
      }
      // Snow-dusted cobblestone bridge deck
      if (!onParapet) {
        v.put(x, y, deckZ, (hash3(x, y, 1, 91) > 150) ? PAL.snowMid : PAL.stoneDark);
      } else {
        // Low stone parapet walls capped with fluffy snow!
        for (let z = deckZ + 1; z <= deckZ + c(6); z++) {
          v.put(x, y, z, z === deckZ + c(6) ? PAL.snowHi : PAL.stoneHi);
        }
      }
    }
  }
  // 4 ornate wrought-iron glowing bridge lanterns on the stone corner piers!
  for (const lx of [c(6), W - 1 - c(6)]) {
    for (const ly of [c(3), L - 1 - c(3)]) {
      for (let z = c(8); z <= c(16); z++) v.put(lx, ly, z, PAL.iron);
      v.box(lx - 1, ly - 1, c(16), lx + 1, ly + 1, c(19), PAL.fairyWarm, 248);
      v.put(lx, ly, c(20), PAL.snowHi);
    }
  }

  return v.toAsset("xmas_bridge", "Granite Arch Creek Bridge", vs);
}
