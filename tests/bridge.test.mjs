import assert from "node:assert/strict";
import test from "node:test";

import { SceneWorld } from "../packages/core/dist/index.js";
import {
  compileBlueprint,
  createCloudBlueprint,
  createFighterJetBlueprint,
  createSkyGateBlueprint,
} from "../packages/blueprint/dist/index.js";
import {
  ENGINE_TOOL_DEFINITIONS,
  executeEngineTool,
  lintSceneWorld,
  lintVolumeAsset,
  toAnthropicTools,
  toGeminiFunctionDeclarations,
  toOpenAITools,
  validateBlueprintSpec,
  validateSceneDocument,
  validateScenePatchOps,
} from "../packages/bridge/dist/index.js";
import { resolveSafeWorkspacePath } from "../packages/mcp/dist/server.js";
import { isAllowedLocalOrigin } from "../packages/mcp/dist/ws-relay.js";

// Tiny valid 1x1 PNG (base64) for headless mock capture tests
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeMockRenderer(world) {
  return {
    canvas: { width: 0, height: 0 },
    isMobile: false,
    render() {},
    getStats() {
      return {
        fps: 120,
        frameMs: 0.2,
        canvasWidth: 640,
        canvasHeight: 400,
        dpr: 1,
        drsScale: 1,
        drawCalls: 12,
        visibleEntities: world.doc.entities.length,
        totalEntities: world.doc.entities.length,
        isMobile: false,
        backend: "webgl2",
        activeSamples: 8,
        tick: world.doc.tick,
        time: world.doc.time,
      };
    },
    captureDataUrl() {
      return TINY_PNG_DATA_URL;
    },
  };
}

test("JSON Schema validators & vendor-neutral LLM tool adapters", () => {
  // Invalid RenderStyle caught with actionable error
  const badPatch = validateScenePatchOps([{ op: "set", path: "style", value: "neon-vaporwave" }]);
  assert.ok(badPatch.some((d) => d.severity === "error" && d.code === "INVALID_STYLE"));

  // Invalid BlueprintSpec caught cleanly
  const badSpec = validateBlueprintSpec({ id: "", size: [0, 10, 10], ops: [] });
  assert.ok(badSpec.some((d) => d.path === "$.id"));
  assert.ok(badSpec.some((d) => d.path === "$.size"));
  assert.ok(badSpec.some((d) => d.path === "$.ops"));

  // Invalid camera clip planes caught cleanly
  const badDoc = validateSceneDocument({ camera: { near: 50, far: 10 } });
  assert.ok(badDoc.some((d) => d.code === "INVALID_CAMERA_CLIP"));

  // Vendor-neutral adapters emit matching tool counts and provider shapes
  const openai = toOpenAITools();
  const anthropic = toAnthropicTools();
  const gemini = toGeminiFunctionDeclarations();
  assert.equal(openai.length, ENGINE_TOOL_DEFINITIONS.length);
  assert.equal(anthropic.length, ENGINE_TOOL_DEFINITIONS.length);
  assert.equal(gemini.length, ENGINE_TOOL_DEFINITIONS.length);
  assert.equal(openai[0].type, "function");
  assert.ok("input_schema" in anthropic[0]);
  assert.ok("parameters" in gemini[0]);
});

test("3D Geometric Linter passes all built-in presets cleanly and catches floating islands & bad sockets", () => {
  for (const spec of [
    createFighterJetBlueprint(),
    createCloudBlueprint(0),
    createCloudBlueprint(1),
    createCloudBlueprint(2),
    createSkyGateBlueprint(),
  ]) {
    const asset = compileBlueprint(spec);
    const report = lintVolumeAsset(asset);
    assert.equal(report.ok, true, `Preset ${spec.id} should lint ok`);
    assert.equal(report.metrics.connectedComponents, 1, `Preset ${spec.id} should have 1 connected component`);
    assert.equal(
      report.diagnostics.length,
      0,
      `Preset ${spec.id} should have 0 warnings, got: ${JSON.stringify(report.diagnostics)}`,
    );
  }

  // Deliberate disconnected floating voxel island + out-of-bounds socket + detached socket
  const flawed = compileBlueprint({
    id: "flawed-ship",
    size: [24, 24, 12],
    ops: [
      { op: "box", min: [2, 2, 2], max: [8, 8, 6], color: [100, 120, 160] },
      { op: "box", min: [18, 18, 8], max: [20, 20, 10], color: [255, 80, 40] }, // disconnected 27-voxel island!
    ],
    sockets: {
      oob: { pos: [30, 5, 5] },
      detached: { pos: [2, 20, 2] },
    },
  });
  const flawedReport = lintVolumeAsset(flawed);
  assert.equal(flawedReport.metrics.connectedComponents, 2);
  assert.ok(flawedReport.diagnostics.some((d) => d.code === "FLOATING_VOXEL_ISLAND"));
  assert.ok(flawedReport.diagnostics.some((d) => d.code === "SOCKET_OUT_OF_BOUNDS"));
  assert.ok(flawedReport.diagnostics.some((d) => d.code === "SOCKET_DETACHED"));

  // Empty volume (all subtracted) -> hard error
  const empty = compileBlueprint({
    id: "empty-cube",
    size: [8, 8, 8],
    ops: [
      { op: "box", min: [1, 1, 1], max: [5, 5, 5], color: [255, 255, 255] },
      { op: "box", min: [0, 0, 0], max: [7, 7, 7], subtract: true },
    ],
  });
  const emptyReport = lintVolumeAsset(empty);
  assert.equal(emptyReport.ok, false);
  assert.ok(emptyReport.diagnostics.some((d) => d.code === "EMPTY_VOLUME"));
});

test("In-process tool dispatcher executes patches, blueprint hot-swap, queries, captures & undo cleanly", async () => {
  const world = new SceneWorld({ seed: 11 });
  const jet = compileBlueprint(createFighterJetBlueprint());
  world.registerAsset(jet);
  world.applyPatch([
    {
      op: "spawn",
      entity: { id: "jet", assetId: jet.id, pos: [0, 28, 0], rot: [0, 0, 0, 1], scale: 1.0, tag: "player" },
    },
  ]);

  const events = [];
  const ctx = {
    world,
    renderer: makeMockRenderer(world),
    onAgentEvent: (ev) => events.push(ev),
  };

  // State inspection
  const stRes = await executeEngineTool(ctx, "aastack_live_state", {});
  assert.equal(stRes.ok, true);
  assert.equal(stRes.data.style, "arcade-8bit");

  // Patch + undo
  const pRes = await executeEngineTool(ctx, "aastack_live_patch", {
    ops: [{ op: "set", path: "style", value: "smooth-toy" }],
    label: "Switch to smooth-toy",
  });
  assert.equal(pRes.ok, true);
  assert.equal(world.doc.style, "smooth-toy");
  assert.equal(events.at(-1).summary, "Switch to smooth-toy");

  const uRes = await executeEngineTool(ctx, "aastack_live_undo", {});
  assert.equal(uRes.ok, true);
  assert.equal(world.doc.style, "arcade-8bit");

  // Blueprint hot-swap + spawn
  const hsRes = await executeEngineTool(ctx, "aastack_live_hot_swap_blueprint", {
    spec: {
      id: "beacon-cube",
      size: [10, 10, 10],
      ops: [{ op: "box", min: [2, 2, 2], max: [7, 7, 7], color: [72, 240, 255], emissive: true }],
      sockets: { top: { pos: [5, 5, 8], dir: [0, 0, 1] } },
    },
    spawnEntity: { id: "beacon-1", pos: [10, 25, -15] },
  });
  assert.equal(hsRes.ok, true);
  assert.ok(world.getEntity("beacon-1"));

  // Spatial queries: socket + terrain + raycast
  const sockRes = await executeEngineTool(ctx, "aastack_live_query", {
    kind: "socket",
    entityId: "beacon-1",
    socket: "top",
  });
  assert.equal(sockRes.ok, true);
  assert.ok(Array.isArray(sockRes.data.pos) && Array.isArray(sockRes.data.dir));

  const rayRes = await executeEngineTool(ctx, "aastack_live_query", {
    kind: "raycast",
    ro: [0, 28, 20],
    rd: [0, 0, -1],
  });
  assert.equal(rayRes.ok, true);
  assert.equal(rayRes.data.hit.entityId, "jet");

  // Single-frame & 2x2 views capture restore prior style cleanly
  const capRes = await executeEngineTool(ctx, "aastack_live_capture", { style: "hd-2d", maxSize: 512 });
  assert.equal(capRes.ok, true);
  assert.equal(capRes.images.length, 1);
  assert.equal(capRes.images[0].mimeType, "image/png");
  assert.equal(world.doc.style, "arcade-8bit", "Capture override must restore prior style");

  const viewsRes = await executeEngineTool(ctx, "aastack_live_capture_views", { preset: "turntable", entityId: "jet" });
  assert.equal(viewsRes.ok, true);
  assert.equal(viewsRes.images.length, 1);

  // Scene linter catches dangling parentId
  world.applyPatch([
    { op: "updateEntity", entityId: "beacon-1", patch: { parentId: "non-existent" } },
  ]);
  const sDiags = lintSceneWorld(world);
  assert.ok(sDiags.some((d) => d.code === "DANGLING_PARENT"));
});

test("Security boundaries: workspace path confinement & loopback Origin allowlist", () => {
  assert.throws(() => resolveSafeWorkspacePath("../outside.json"), /escapes workspace root/);
  assert.throws(() => resolveSafeWorkspacePath("/etc/passwd"), /escapes workspace root/);
  assert.ok(resolveSafeWorkspacePath("examples/out/test.blueprint.json").endsWith("examples/out/test.blueprint.json"));

  assert.equal(isAllowedLocalOrigin(undefined), true);
  assert.equal(isAllowedLocalOrigin("null"), true);
  assert.equal(isAllowedLocalOrigin("http://127.0.0.1:8765"), true);
  assert.equal(isAllowedLocalOrigin("http://localhost:3000"), true);
  assert.equal(isAllowedLocalOrigin("https://evil.example.com"), false);
  assert.equal(isAllowedLocalOrigin("http://127.0.0.1.evil.com"), false);
});
