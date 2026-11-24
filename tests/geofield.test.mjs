import assert from "node:assert/strict";
import test from "node:test";
import {
  MATERIAL_ID,
  float32ToFloat16Array,
  packHorizontalSliceStrip,
} from "../packages/core/dist/index.js";
import {
  SimulationZone,
  compileGeoVolume,
  fbm3,
  musgraveRidged2D,
  opPolarFold,
  opSmoothMin,
  sampleCatmullRomSpline,
  sampleMultifractalTerrain,
  scatterOnSdf,
  sdArchY,
  sdBox,
  sdCylinderZ,
  sdLatheZ,
  sdPitchedRoofY,
  sdSplineLoft,
  swissTurbulence2D,
} from "../packages/geofield/dist/index.js";

test("AA-GeoField continuous SDF primitives, smooth union, lathe, spline loft, and 2D slice export", () => {
  // 1. Exact box & pitched roof continuous signed distance
  assert.ok(sdBox(0, 0, 0, 2, 2, 2) < -1.9);
  assert.ok(Math.abs(sdBox(3, 0, 0, 2, 2, 2) - 1.0) < 1e-6);
  assert.ok(sdPitchedRoofY(0, 0, 1.0, 4, 4, 4) < 0);
  assert.ok(sdPitchedRoofY(3.8, 0, 3.8, 4, 4, 4) > 1.0); // cleanly outside 45-deg slope (no Lego stair!)

  // 2. Roman arch & lathe & polar symmetry
  assert.ok(sdArchY(0, 0, 2, 3, 2, 2) < 0);
  assert.ok(sdArchY(0, 0, 6, 3, 2, 2) > 0.5);
  const dome = sdLatheZ(0, 0, 3, [[0, 0], [4, 0], [4, 2], [2.5, 4.5], [0, 5.2]]);
  assert.ok(dome < 0, "interior of lathe dome must be negative");
  assert.ok(sdLatheZ(5, 0, 3, [[0, 0], [4, 0], [4, 2], [2.5, 4.5], [0, 5.2]]) > 0.5);
  assert.ok(sdLatheZ(10, 0, -2, [[0, 0], [4, 0], [4, 2], [2.5, 4.5], [0, 5.2]]) > 5.0, "below lathe must be strictly positive");
  assert.ok(sdLatheZ(10, 0, 9, [[0, 0], [4, 0], [4, 2], [2.5, 4.5], [0, 5.2]]) > 5.0, "above lathe must be strictly positive");
  const [fx, fy] = opPolarFold(0, 4, 8);
  assert.ok(Math.abs(Math.hypot(fx, fy) - 4) < 1e-6);

  // 3. Smooth blending returns blended distance < sharp min AND blend factor h in [0, 1]
  const sm = opSmoothMin(0.2, 0.2, 1.0);
  assert.ok(sm.d < 0.2 && sm.h > 0.45 && sm.h < 0.55);

  // 4. Catmull-Rom spline loft
  const samples = sampleCatmullRomSpline([
    { pos: [0, 0, 0], radius: 1.5 },
    { pos: [2, 0, 4], radius: 1.1 },
    { pos: [4, 1, 8], radius: 0.6 },
  ], 6);
  assert.ok(samples.length >= 13);
  assert.ok(sdSplineLoft(2, 0, 4, samples) < -0.5);
  assert.ok(sdSplineLoft(10, 0, 4, samples) > 5.0);

  // 5. Compile continuous GeoVolume -> VolumeAsset with exact R16F SDF + RG8 material + 2D horizontal slice strip!
  const asset = compileGeoVolume({
    id: "test_arch_column",
    name: "Test Arch Column",
    w: 24,
    l: 24,
    h: 28,
    voxelScale: 0.25,
    evaluate: (x, y, z, out) => {
      const cx = x - 12, cy = y - 12;
      const dBase = sdBox(cx, cy, z - 10, 6, 6, 10) + fbm3(x * 0.2, y * 0.2, z * 0.2, 2) * 0.3;
      out.union(dBase, [196, 184, 162], "stone", 0);
      const dCut = sdArchY(cx, cy, z, 3.2, 5.0, 8.0);
      out.subtract(dCut, 0.4, [154, 142, 126], "stone", 0);
      const dCap = sdPitchedRoofY(cx, cy, z - 19.5, 7.2, 7.2, 6.5);
      out.smoothUnion(dCap, 0.35, [176, 94, 62], "terracotta", 0);
    },
  });

  assert.equal(asset.hasExactSdf, true);
  assert.ok(asset.materialU8 instanceof Uint8Array);
  assert.equal(asset.materialU8.length, 24 * 24 * 28);
  assert.equal(asset.provenance.kind, "geofield");

  // Verify material IDs landed cleanly (stone & terracotta both present!)
  let hasStone = false, hasTerracotta = false;
  for (let i = 0; i < asset.materialU8.length; i++) {
    if (asset.materialU8[i] === MATERIAL_ID.stone) hasStone = true;
    if (asset.materialU8[i] === MATERIAL_ID.terracotta) hasTerracotta = true;
  }
  assert.ok(hasStone && hasTerracotta, "expected both stone and terracotta material classes");

  // Verify IEEE-754 float16 encoding preserves sign & magnitude cleanly
  const f16 = float32ToFloat16Array(new Float32Array([-3.5, 0.0, 2.25]));
  assert.equal(f16.length, 3);
  assert.equal((f16[0] & 0x8000) !== 0, true, "negative half-float sign bit");
  assert.equal(f16[1], 0);
  assert.equal((f16[2] & 0x8000) === 0, true, "positive half-float sign bit");

  // Verify lightweight 2D horizontal sprite-stack strip export!
  const strip = packHorizontalSliceStrip(asset);
  assert.equal(strip.width, 24 * 28);
  assert.equal(strip.height, 24);
  assert.equal(strip.rgba.length, 24 * 28 * 24 * 4);
  let opaquePx = 0;
  for (let i = 3; i < strip.rgba.length; i += 4) if (strip.rgba[i] >= 128) opaquePx++;
  assert.ok(opaquePx > 500, "exported 2D horizontal sprite strip must contain solid slices");

  // 6. Context-aware surface scattering & SimulationZone
  const pts = scatterOnSdf({
    sdf: (x, y, z) => z - (2.0 + Math.sin(x * 0.25) * 0.8),
    boundsMin: [-8, -8, 0],
    boundsMax: [8, 8, 6],
    count: 10,
    minSpacing: 2.0,
    minNormalZ: 0.7,
  });
  assert.ok(pts.length >= 6, "scatterOnSdf should place well-spaced surface points");
  for (const p of pts) assert.ok(p.normal[2] >= 0.7);

  const sim = new SimulationZone(
    () => ({ y: 0 }),
    (s, dt) => { s.y += dt * 4.0; },
  );
  sim.step(0.05);
  assert.ok(Math.abs(sim.state.y - 0.2) < 1e-6);
});

test("AA-GeoField seam-free periodic wrapped UVs (uvPhaseU8) preserve wrap continuity", () => {
  const tower = compileGeoVolume({
    id: "test_wrapped_tower",
    w: 24,
    l: 24,
    h: 20,
    voxelScale: 0.25,
    evaluate: (x, y, z, out) => {
      const lx = x - 12;
      const ly = y - 12;
      const d = sdCylinderZ(lx, ly, z - 10, 7.5, 9.5);
      // 8 full 2-brick periods around circumference -> integer wrap across atan2(-pi -> +pi)
      const u = (Math.atan2(ly, lx) / (Math.PI * 2)) * 8.0;
      const v = z / 4.0;
      out.union(d, [212, 198, 174], "stone", 0, [u, v]);
    },
  });

  assert.ok(tower.uvPhaseU8 instanceof Uint8Array, "uvPhaseU8 must be emitted when UVs are set");
  assert.equal(tower.uvPhaseU8.length, 24 * 24 * 20 * 4);

  // Sample two adjacent voxels straddling the atan2(-pi -> +pi) seam at x = 4, y = 11 vs y = 12, z = 10
  const idxA = (10 * 24 * 24 + 11 * 24 + 4) * 4;
  const idxB = (10 * 24 * 24 + 12 * 24 + 4) * 4;
  const cA = (tower.uvPhaseU8[idxA] / 255) * 2 - 1;
  const sA = (tower.uvPhaseU8[idxA + 1] / 255) * 2 - 1;
  const cB = (tower.uvPhaseU8[idxB] / 255) * 2 - 1;
  const sB = (tower.uvPhaseU8[idxB + 1] / 255) * 2 - 1;
  assert.ok(Math.hypot(cA, sA) > 0.92, "surface UV phase vector must have unit length");
  assert.ok(Math.hypot(cB, sB) > 0.92, "adjacent seam UV phase vector must have unit length");
  // Cosine similarity across the branch cut must stay strongly positive (zero 180-deg flip seam!)
  assert.ok(cA * cB + sA * sB > 0.4, "periodic cos/sin phase must stay continuous across atan2 wrap");

  // Far-air corner voxel must stay neutral (128 = zero vector)
  const airIdx = 0;
  assert.equal(tower.uvPhaseU8[airIdx], 128);
  assert.equal(tower.uvPhaseU8[airIdx + 1], 128);
});

test("Musgrave ridged multifractal + Swiss-Turbulence Alpine Gorge terrain engine", () => {
  const r0 = musgraveRidged2D(0.5, 0.8, 5);
  const s0 = swissTurbulence2D(0.5, 0.8, 5, 1.0);
  assert.ok(Number.isFinite(r0) && r0 > 0, "musgraveRidged2D must produce positive ridge height");
  assert.ok(Number.isFinite(s0) && s0 > 0, "swissTurbulence2D must produce positive eroded height");

  const river = sampleMultifractalTerrain(0, 0);
  const westBench = sampleMultifractalTerrain(-23, 0);
  const eastBench = sampleMultifractalTerrain(23, 0);
  const highPeak = sampleMultifractalTerrain(65, -165);

  assert.ok(river.height < 0, `gorge center must carve below river level, got ${river.height}`);
  assert.ok(river.riverMask > 0.9, "gorge center must have strong riverMask");
  assert.ok(westBench.height > 7 && westBench.height < 18, `west bridge bench expected ~10-14, got ${westBench.height}`);
  assert.ok(eastBench.height > 7 && eastBench.height < 18, `east bridge bench expected ~10-14, got ${eastBench.height}`);
  assert.ok(highPeak.height > westBench.height + 10, "background alpine massif must tower above valley bench");

  for (const s of [river, westBench, eastBench, highPeak]) {
    const nLen = Math.hypot(s.normal[0], s.normal[1], s.normal[2]);
    assert.ok(Math.abs(nLen - 1.0) < 1e-4, "analytical terrain normal must be unit length");
    assert.ok(s.normal[1] > 0, "terrain normal must point upward");
    assert.ok(s.slope >= 0 && s.slope <= 1, "slope must be normalized in [0,1]");
  }
});
