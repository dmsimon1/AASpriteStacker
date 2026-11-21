import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneWorld,
  mat4AssetToLocal,
  mat4Invert,
  mat4TransformPoint,
  parseVox,
  quatFromYawPitchRoll,
  quatRotateVec3,
  sampleTerrainHeight,
} from "../packages/core/dist/index.js";
import {
  compileBlueprint,
  createCloudBlueprint,
  createFighterJetBlueprint,
  createSkyGateBlueprint,
} from "../packages/blueprint/dist/index.js";

test("6-DOF quaternion & asset-to-world right-handed mapping", () => {
  // Identity orientation: asset nose (+Y) maps to world -Z forward, dorsal (+Z) maps to +Y up!
  const a2l = mat4AssetToLocal([16, 16, 6], 1.0);
  const nose = mat4TransformPoint(a2l, [16, 30, 6]);
  assert.deepEqual(nose, [0, 0, -14]);
  const dorsal = mat4TransformPoint(a2l, [16, 16, 12]);
  assert.deepEqual(dorsal, [0, 6, 0]);

  // 90 deg pitch up rotates forward (0, 0, -1) to +Y up (0, 1, 0)
  const qPitchUp = quatFromYawPitchRoll(0, Math.PI * 0.5, 0);
  const fwd = quatRotateVec3(qPitchUp, [0, 0, -1]);
  assert.ok(Math.abs(fwd[0]) < 1e-5 && Math.abs(fwd[1] - 1) < 1e-5 && Math.abs(fwd[2]) < 1e-5);

  // Invert round-trip
  const inv = mat4Invert(a2l);
  const back = mat4TransformPoint(inv, nose);
  assert.ok(Math.abs(back[0] - 16) < 1e-5 && Math.abs(back[1] - 30) < 1e-5 && Math.abs(back[2] - 6) < 1e-5);
});

test("Blueprint compiler builds FighterJet, Clouds, and hollow SkyGate with sockets & RGB edge bleed", () => {
  const jet = compileBlueprint(createFighterJetBlueprint());
  assert.equal(jet.w, 32);
  assert.equal(jet.l, 34);
  assert.equal(jet.h, 14);
  assert.ok(jet.sockets.thrusterL && jet.sockets.wingtipR && jet.sockets.cockpitCam);

  // Hollow torus SkyGate MUST be empty right through its center hole!
  const gate = compileBlueprint(createSkyGateBlueprint());
  const centerIdx = Math.floor(gate.h / 2) * gate.w * gate.l + Math.floor(gate.l / 2) * gate.w + Math.floor(gate.w / 2);
  assert.equal(gate.rgba[centerIdx * 4 + 3], 0, "SkyGate center cavity must be hollow (alpha === 0)");

  // Edge dilation check: transparent voxel next to solid cloud voxel must carry dilated RGB while alpha === 0
  const cloud = compileBlueprint(createCloudBlueprint(0));
  let foundBleed = false;
  for (let i = 0; i < cloud.w * cloud.l * cloud.h; i++) {
    if (cloud.rgba[i * 4 + 3] === 0 && cloud.rgba[i * 4] > 150) {
      foundBleed = true;
      break;
    }
  }
  assert.ok(foundBleed, "Expected RGB edge dilation into adjacent transparent voxels");
});

test("MagicaVoxel .vox binary parser decodes SIZE + XYZI + RGBA accurately", () => {
  // Construct minimal valid VOX 150 binary with 2x2x2 grid and 1 colored voxel at (1, 0, 1)
  const sizeBytes = 12;
  const xyziBytes = 8; // count=1 + 4 bytes
  const rgbaBytes = 1024;
  const mainChildBytes = (12 + sizeBytes) + (12 + xyziBytes) + (12 + rgbaBytes);
  const buf = new ArrayBuffer(8 + 12 + mainChildBytes);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const putStr = (off, s) => { for (let i = 0; i < 4; i++) u8[off + i] = s.charCodeAt(i); };

  putStr(0, "VOX "); dv.setInt32(4, 150, true);
  putStr(8, "MAIN"); dv.setInt32(12, 0, true); dv.setInt32(16, mainChildBytes, true);
  let p = 20;
  putStr(p, "SIZE"); dv.setInt32(p + 4, sizeBytes, true); dv.setInt32(p + 8, 0, true);
  dv.setInt32(p + 12, 2, true); dv.setInt32(p + 16, 2, true); dv.setInt32(p + 20, 2, true);
  p += 12 + sizeBytes;
  putStr(p, "XYZI"); dv.setInt32(p + 4, xyziBytes, true); dv.setInt32(p + 8, 0, true);
  dv.setInt32(p + 12, 1, true);
  u8[p + 16] = 1; u8[p + 17] = 0; u8[p + 18] = 1; u8[p + 19] = 1; // color index 1
  p += 12 + xyziBytes;
  putStr(p, "RGBA"); dv.setInt32(p + 4, rgbaBytes, true); dv.setInt32(p + 8, 0, true);
  u8[p + 12] = 220; u8[p + 13] = 50; u8[p + 14] = 90; u8[p + 15] = 255;

  const asset = parseVox(buf, { id: "test-vox" });
  assert.deepEqual([asset.w, asset.l, asset.h], [2, 2, 2]);
  // y flipped: vy=0 -> l-1-0 = 1, vz=1, vx=1 -> idx = 1*4 + 1*2 + 1 = 7
  assert.equal(asset.rgba[7 * 4 + 3], 255);
  assert.equal(asset.rgba[7 * 4 + 0], 220);
});

test("SceneWorld patchable IR, Undo/Redo, Snapshot/Restore, Sockets, and 3D Voxel Raycast", () => {
  const world = new SceneWorld({ seed: 11 });
  const jet = compileBlueprint(createFighterJetBlueprint());
  world.registerAsset(jet);

  world.applyPatch([
    {
      op: "spawn",
      entity: { id: "jet", assetId: jet.id, pos: [0, 20, 0], rot: [0, 0, 0, 1], scale: 1.0 },
    },
  ]);
  assert.equal(world.doc.entities.length, 1);

  const snap = world.snapshot();
  world.applyPatch([{ op: "updateEntity", entityId: "jet", patch: { pos: [50, 20, -30] } }]);
  assert.deepEqual(world.getEntity("jet").pos, [50, 20, -30]);

  assert.equal(world.undo(), true);
  assert.deepEqual(world.getEntity("jet").pos, [0, 20, 0]);
  assert.equal(world.redo(), true);
  assert.deepEqual(world.getEntity("jet").pos, [50, 20, -30]);

  world.restore(snap);
  assert.deepEqual(world.getEntity("jet").pos, [0, 20, 0]);

  // Semantic socket query returns exact world-space coordinate
  const wL = world.getSocketWorldPos("jet", "wingtipL");
  const wR = world.getSocketWorldPos("jet", "wingtipR");
  assert.ok(wL && wR && wL[0] < 0 && wR[0] > 0, `expected symmetric wingtips, got ${wL} and ${wR}`);

  // Exact 3D voxel raycast hits jet fuselage along -Z from behind
  const hit = world.raycastEntities([0, 20, 20], [0, 0, -1], 100);
  assert.ok(hit && hit.entityId === "jet" && hit.distance > 10 && hit.distance < 25, `unexpected hit: ${JSON.stringify(hit)}`);

  // Deterministic terrain height sampling returns valid non-negative heights with islands & ocean
  let hasOcean = false, hasLand = false;
  for (let x = -200; x <= 200; x += 20) {
    for (let z = -200; z <= 200; z += 20) {
      const h = sampleTerrainHeight(x, z, world.doc.terrain);
      assert.ok(h >= 0);
      if (h === 0) hasOcean = true;
      if (h > 2) hasLand = true;
    }
  }
  assert.ok(hasOcean && hasLand, "Expected archipelago heightfield to contain both ocean and islands");
});
