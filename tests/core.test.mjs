import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneWorld,
  SpriteStackAnimator,
  computeCameraViewProj,
  createIsometricCamera,
  createSpriteStackClip,
  createVolumeAsset,
  extractFrustumPlanes,
  loadAnimatedStripGridPixels,
  loadSliceStripPixels,
  mat4AssetToLocal,
  mat4Invert,
  mat4TransformPoint,
  parseVox,
  projectWorldToScreen,
  quatFromYawPitchRoll,
  quatRotateVec3,
  sampleTerrainHeight,
  sphereInFrustum,
  unprojectScreenToGround,
} from "../packages/core/dist/index.js";
import { TERRAIN_FS } from "../packages/core/dist/terrain-shader.js";
import {
  compileBlueprint,
  createCloudBlueprint,
  createCottageBlueprint,
  createFighterJetBlueprint,
  createSkyGateBlueprint,
  createSportsCarBlueprint,
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

  // First-class RenderStyle softswitch defaults to punchy "arcade-8bit" and patches/undoes cleanly
  assert.equal(world.doc.style, "arcade-8bit");
  world.applyPatch([{ op: "set", path: "style", value: "hd-2d" }]);
  assert.equal(world.doc.style, "hd-2d");
  world.applyPatch([{ op: "set", path: "style", value: "smooth-toy" }]);
  assert.equal(world.doc.style, "smooth-toy");
  world.applyPatch([{ op: "set", path: "style", value: "retro-raw" }]);
  assert.equal(world.doc.style, "retro-raw");
  assert.equal(world.undo(), true);
  assert.equal(world.doc.style, "smooth-toy");
  world.applyPatch([{ op: "set", path: "style", value: "arcade-8bit" }]);
  assert.equal(world.doc.style, "arcade-8bit");

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

test("Drop-in loaders, Cottage preset, and genre-agnostic SceneWorld partial options", () => {
  // Cottage & Sports Car presets compile cleanly with sockets & expected dimensions
  const cottage = compileBlueprint(createCottageBlueprint());
  assert.deepEqual([cottage.w, cottage.l, cottage.h], [24, 24, 28]);
  assert.ok(cottage.sockets.chimney && cottage.sockets.vane);

  const car = compileBlueprint(createSportsCarBlueprint());
  assert.deepEqual([car.w, car.l, car.h], [24, 44, 20]);
  assert.ok(car.sockets.headlightL && car.sockets.tailR && car.sockets.roof);

  // Horizontal slice-strip loader decodes W*slices x L pixel buffer accurately
  const w = 2, l = 2, slices = 3;
  const strip = new Uint8Array(w * slices * l * 4);
  // Paint pixel (x=1, y=0) on slice z=2 red
  const px = (0 * (w * slices) + (2 * w + 1)) * 4;
  strip[px + 0] = 240; strip[px + 1] = 40; strip[px + 2] = 60; strip[px + 3] = 255;
  const asset = loadSliceStripPixels(strip, w * slices, l, { id: "strip-test", slices });
  assert.deepEqual([asset.w, asset.l, asset.h], [2, 2, 3]);
  const vIdx = (2 * (w * l) + 0 * w + 1) * 4;
  assert.equal(asset.rgba[vIdx + 0], 240);
  assert.equal(asset.rgba[vIdx + 3], 255);

  // SceneWorld merges partial camera/terrain options cleanly without clobbering sibling defaults
  const orthoWorld = new SceneWorld({
    camera: { mode: "ortho", orthoSize: 8 },
    terrain: { enabled: false },
    samples: 2,
  });
  assert.equal(orthoWorld.doc.camera.mode, "ortho");
  assert.equal(orthoWorld.doc.camera.orthoSize, 8);
  assert.ok(orthoWorld.doc.camera.far > 100);
  assert.equal(orthoWorld.doc.terrain.enabled, false);
  assert.equal(orthoWorld.doc.samples, 2);
});

test("First-class isometric, 2:1 dimetric, oblique sprite-stack & top-down camera projections", () => {
  const W = 800, H = 600;

  // 1. dimetric-2to1: exact 2:1 pixel-art diamond tile grid aspect ratio
  const cam2to1 = createIsometricCamera({ preset: "dimetric-2to1", orthoSize: 10 });
  const o = projectWorldToScreen([0, 0, 0], cam2to1, W, H);
  const px = projectWorldToScreen([1, 0, 0], cam2to1, W, H);
  const pz = projectWorldToScreen([0, 0, 1], cam2to1, W, H);
  const pxz = projectWorldToScreen([1, 0, 1], cam2to1, W, H);
  const diamondW = Math.abs(px.x - pz.x);
  const diamondH = Math.abs(pxz.y - o.y);
  assert.ok(Math.abs(diamondW / diamondH - 2.0) < 1e-4, `Expected exact 2:1 diamond ratio, got ${diamondW / diamondH}`);

  // 2. true isometric: equal screen lengths for unit X, Y, Z axes (35.264 deg axonometric)
  const camIso = createIsometricCamera({ preset: "isometric", orthoSize: 10 });
  const io = projectWorldToScreen([0, 0, 0], camIso, W, H);
  const ix = projectWorldToScreen([1, 0, 0], camIso, W, H);
  const iy = projectWorldToScreen([0, 1, 0], camIso, W, H);
  const iz = projectWorldToScreen([0, 0, 1], camIso, W, H);
  const lenX = Math.hypot(ix.x - io.x, ix.y - io.y);
  const lenY = Math.hypot(iy.x - io.x, iy.y - io.y);
  const lenZ = Math.hypot(iz.x - io.x, iz.y - io.y);
  assert.ok(Math.abs(lenX - lenY) < 1e-3 && Math.abs(lenY - lenZ) < 1e-3, `Expected equal iso axes, got ${lenX}/${lenY}/${lenZ}`);

  // 3. oblique-stack: un-foreshortened XZ footprint + pure vertical slice extrusion + negative OpenGL det
  const camOb = createIsometricCamera({ preset: "oblique-stack", pixelsPerUnit: 20, viewportHeightCss: H, obliqueSkew: 0.75 });
  assert.equal(camOb.mode, "oblique");
  assert.equal(camOb.orthoSize, H / 40);
  const oo = projectWorldToScreen([0, 0, 0], camOb, W, H);
  const ox = projectWorldToScreen([1, 0, 0], camOb, W, H);
  const oz = projectWorldToScreen([0, 0, 1], camOb, W, H);
  const oy = projectWorldToScreen([0, 1, 0], camOb, W, H);
  assert.ok(Math.abs((ox.x - oo.x) - 20) < 1e-4, "Oblique +X must be exactly 20px");
  assert.ok(Math.abs((oz.y - oo.y) - 20) < 1e-4, "Oblique +Z must be strictly un-foreshortened 20px");
  assert.ok(Math.abs(oy.x - oo.x) < 1e-4 && Math.abs((oo.y - oy.y) - 15) < 1e-4, "Oblique +Y must extrude straight up by skew*px");
  assert.ok(oy.depth < oo.depth, "Higher oblique slice must be closer in hardware depth");

  // 4. Round-trip projectWorldToScreen <-> unprojectScreenToGround across all presets + perspective
  const presets = ["dimetric-2to1", "isometric", "oblique-stack", "topdown-3quarter"];
  for (const preset of presets) {
    const cam = createIsometricCamera({ preset, orthoSize: 12 });
    const pt = [3.5, 0, -2.25];
    const scr = projectWorldToScreen(pt, cam, W, H);
    const back = unprojectScreenToGround(scr.x, scr.y, cam, W, H, 0);
    assert.ok(back !== null);
    assert.ok(Math.hypot(back[0] - pt[0], back[2] - pt[2]) < 1e-3, `Round-trip mismatch for ${preset}`);
  }
});

test("6-plane Gribb-Hartmann frustum sphere culling & zero-GC scratch matrix / fast computeSdf:false", () => {
  const world = new SceneWorld();
  const vp = computeCameraViewProj(world.doc.camera, 16 / 9);
  const planes = extractFrustumPlanes(vp);
  // Target [0, 18, 0] is dead-center in front of camera [0, 26, 42]
  assert.equal(sphereInFrustum(planes, 0, 18, 0, 2), true);
  // Point far behind camera (+Z = 120) must be culled
  assert.equal(sphereInFrustum(planes, 0, 26, 120, 2), false);
  // Point far off to the right (+X = 400) must be culled
  assert.equal(sphereInFrustum(planes, 400, 18, 0, 2), false);

  // Fast computeSdf: false volume creation + reusable out buffer on getVoxelToWorldMatrix
  const rgba = new Uint8Array(4 * 4 * 4 * 4);
  for (let i = 0; i < 64; i++) {
    rgba[i * 4 + 0] = 200; rgba[i * 4 + 1] = 120; rgba[i * 4 + 2] = 60; rgba[i * 4 + 3] = 255;
  }
  const fastAsset = createVolumeAsset({ id: "fast-cube", w: 4, l: 4, h: 4, rgba, computeSdf: false });
  assert.equal(fastAsset.w, 4);
  world.registerAsset(fastAsset);
  world.applyPatch([{ op: "spawn", entity: { id: "c1", assetId: "fast-cube", pos: [3, 4, 5], rot: [0, 0, 0, 1], scale: 1 } }]);
  const scratch = new Float32Array(16);
  const m = world.getVoxelToWorldMatrix(world.getEntity("c1"), scratch);
  assert.equal(m, scratch);
});

function buildVoxChunk(id, contentBytes, childBytes = new Uint8Array(0)) {
  const buf = new Uint8Array(12 + contentBytes.length + childBytes.length);
  for (let i = 0; i < 4; i++) buf[i] = id.charCodeAt(i);
  const dv = new DataView(buf.buffer);
  dv.setInt32(4, contentBytes.length, true);
  dv.setInt32(8, childBytes.length, true);
  buf.set(contentBytes, 12);
  buf.set(childBytes, 12 + contentBytes.length);
  return buf;
}

function encodeVoxDict(entries) {
  const parts = [];
  const hdr = new Uint8Array(4);
  new DataView(hdr.buffer).setInt32(0, entries.length, true);
  parts.push(hdr);
  for (const [k, v] of entries) {
    const kb = Buffer.from(k, "ascii");
    const vb = Buffer.from(v, "ascii");
    const kl = new Uint8Array(4);
    const vl = new Uint8Array(4);
    new DataView(kl.buffer).setInt32(0, kb.length, true);
    new DataView(vl.buffer).setInt32(0, vb.length, true);
    parts.push(kl, kb, vl, vb);
  }
  return Buffer.concat(parts);
}

test("Multi-model MagicaVoxel .vox scene graph (nTRN, nGRP, nSHP, _t, _r, _hidden)", () => {
  const makeSize = (x, y, z) => {
    const b = new Uint8Array(12);
    const dv = new DataView(b.buffer);
    dv.setInt32(0, x, true); dv.setInt32(4, y, true); dv.setInt32(8, z, true);
    return buildVoxChunk("SIZE", b);
  };
  const makeXyzi = (vox) => {
    const b = new Uint8Array(4 + vox.length * 4);
    new DataView(b.buffer).setInt32(0, vox.length, true);
    vox.forEach(([x, y, z, ci], i) => {
      b[4 + i * 4 + 0] = x; b[4 + i * 4 + 1] = y; b[4 + i * 4 + 2] = z; b[4 + i * 4 + 3] = ci;
    });
    return buildVoxChunk("XYZI", b);
  };
  const makeTrn = (nodeId, childId, attrs, frameDict) => {
    const b0 = new Uint8Array(4); new DataView(b0.buffer).setInt32(0, nodeId, true);
    const d0 = encodeVoxDict(attrs);
    const mid = new Uint8Array(16);
    const dv = new DataView(mid.buffer);
    dv.setInt32(0, childId, true);
    dv.setInt32(4, -1, true); // reserved
    dv.setInt32(8, 0, true);  // layerId
    dv.setInt32(12, 1, true); // numFrames
    const fd = encodeVoxDict(frameDict);
    return buildVoxChunk("nTRN", Buffer.concat([b0, d0, mid, fd]));
  };
  const makeGrp = (nodeId, childIds) => {
    const b0 = new Uint8Array(4); new DataView(b0.buffer).setInt32(0, nodeId, true);
    const d0 = encodeVoxDict([]);
    const c = new Uint8Array(4 + childIds.length * 4);
    const dv = new DataView(c.buffer);
    dv.setInt32(0, childIds.length, true);
    childIds.forEach((cid, i) => dv.setInt32(4 + i * 4, cid, true));
    return buildVoxChunk("nGRP", Buffer.concat([b0, d0, c]));
  };
  const makeShp = (nodeId, modelId) => {
    const b0 = new Uint8Array(4); new DataView(b0.buffer).setInt32(0, nodeId, true);
    const d0 = encodeVoxDict([]);
    const m = new Uint8Array(8);
    const dv = new DataView(m.buffer);
    dv.setInt32(0, 1, true); dv.setInt32(4, modelId, true);
    return buildVoxChunk("nSHP", Buffer.concat([b0, d0, m, encodeVoxDict([])]));
  };

  // Model 0: 3x1x1 bar along X; Model 1: 1x1x1 turret; Model 2: hidden cube that MUST be skipped
  const children = Buffer.concat([
    makeSize(3, 1, 1), makeXyzi([[0, 0, 0, 1], [1, 0, 0, 1], [2, 0, 0, 1]]),
    makeSize(1, 1, 1), makeXyzi([[0, 0, 0, 2]]),
    makeSize(1, 1, 1), makeXyzi([[0, 0, 0, 3]]),
    makeTrn(0, 1, [], []),
    makeGrp(1, [2, 4, 6]),
    // Child 2 -> model 0 rotated 90 deg around Z (row0=+Y [c0=1], row1=-X [c1=0, s1=neg(32)] => rotByte = 1 | (0<<2) | 32 = 33)
    makeTrn(2, 3, [], [["_t", "0 0 0"], ["_r", String(1 | (0 << 2) | 32)]]),
    makeShp(3, 0),
    // Child 4 -> model 1 translated +3 in Z
    makeTrn(4, 5, [], [["_t", "0 0 3"]]),
    makeShp(5, 1),
    // Child 6 -> hidden node far away (+50 in X) — must NOT inflate bounding box!
    makeTrn(6, 7, [["_hidden", "1"]], [["_t", "50 0 0"]]),
    makeShp(7, 2),
  ]);
  const header = Buffer.from([86, 79, 88, 32, 150, 0, 0, 0]); // "VOX " + version 150
  const main = buildVoxChunk("MAIN", new Uint8Array(0), children);
  const full = Buffer.concat([header, main]);
  const ab = full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength);

  const stitched = parseVox(ab, { id: "scene-test", computeSdf: false });
  // Model 0 rotated 90 deg in XY becomes 1 wide (X) x 3 long (Y), and Model 1 at Z=+3 makes height = 4!
  assert.equal(stitched.w, 1, `expected rotated width 1, got ${stitched.w}`);
  assert.equal(stitched.l, 3, `expected rotated length 3, got ${stitched.l}`);
  assert.equal(stitched.h, 4, `expected stitched height 4, got ${stitched.h}`);
  let solid = 0;
  for (let i = 3; i < stitched.rgba.length; i += 4) if (stitched.rgba[i] >= 128) solid++;
  assert.equal(solid, 4, "expected 3 voxels from model 0 + 1 voxel from model 1 (hidden model 2 skipped)");

  // Explicit modelIndex selects raw model without scene-graph stitching
  const single = parseVox(ab, { id: "m0-only", modelIndex: 0, computeSdf: false });
  assert.equal(single.w, 3);
  assert.equal(single.l, 1);
  assert.equal(single.h, 1);
});

test("SpriteStackAnimator + loadAnimatedStripGridPixels + tree-shakeable @aastack/core/terrain", () => {
  // Build a 3-frame animated strip grid: 3 rows x (2 slices * 2px wide) = 4px wide x 6px tall
  const sheetW = 4;
  const sheetH = 6;
  const rgba = new Uint8Array(sheetW * sheetH * 4);
  for (let f = 0; f < 3; f++) {
    // Mark a unique pixel per frame at slice 0, x=0, y=f*2
    const p = (f * 2 * sheetW + 0) * 4;
    rgba[p + 0] = 60 + f * 70;
    rgba[p + 1] = 200;
    rgba[p + 2] = 90;
    rgba[p + 3] = 255;
  }

  const clip = loadAnimatedStripGridPixels(rgba, sheetW, sheetH, {
    id: "walk",
    slices: 2,
    frames: 3,
    fps: 10,
    pingPong: true,
    computeSdf: false,
  });
  assert.equal(clip.frames.length, 3);
  assert.equal(clip.frames[0].w, 2);
  assert.equal(clip.frames[0].l, 2);
  assert.equal(clip.frames[0].h, 2);

  const world = new SceneWorld();
  const anim = new SpriteStackAnimator();
  anim.registerClip(world, clip);
  world.applyPatch([
    { op: "spawn", entity: { id: "runner", assetId: clip.frames[0].id, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: 1 } },
  ]);
  anim.bindEntity("runner", "walk");

  // Ping-pong at 10 fps (0.1s/frame): 0 -> 1 -> 2 -> 1 -> 0
  anim.update(world, 0.11);
  assert.equal(anim.getFrameIndex("runner"), 1);
  assert.equal(world.getEntity("runner").assetId, "walk#f1");

  anim.update(world, 0.1);
  assert.equal(anim.getFrameIndex("runner"), 2);
  assert.equal(world.getEntity("runner").assetId, "walk#f2");

  anim.update(world, 0.1);
  assert.equal(anim.getFrameIndex("runner"), 1);
  assert.equal(world.getEntity("runner").assetId, "walk#f1");

  // Pause & manual setFrame
  anim.pause("runner");
  anim.update(world, 0.5);
  assert.equal(anim.getFrameIndex("runner"), 1);
  anim.setFrame(world, "runner", 0);
  assert.equal(world.getEntity("runner").assetId, "walk#f0");

  // Custom createSpriteStackClip wrapper + tree-shakeable TERRAIN_FS export
  const manualClip = createSpriteStackClip({ id: "idle", frames: [clip.frames[0], clip.frames[1]], fps: 4 });
  assert.equal(manualClip.frames.length, 2);
  assert.equal(typeof TERRAIN_FS, "string");
  assert.ok(TERRAIN_FS.includes("terrainHeight") && TERRAIN_FS.includes("uWaveTime"));
});
