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
  opPolarFold,
  opSmoothMin,
  sampleCatmullRomSpline,
  scatterOnSdf,
  sdArchY,
  sdBox,
  sdLatheZ,
  sdPitchedRoofY,
  sdSplineLoft,
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
