import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { SceneWorld } from "../packages/core/dist/index.js";
import { compileBlueprint, createFighterJetBlueprint } from "../packages/blueprint/dist/index.js";
import { connectDevBridge } from "../packages/bridge/dist/client.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MCP_BIN = resolve(ROOT, "packages/mcp/dist/server.js");
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function spawnMcpServer(port) {
  const proc = spawn(process.execPath, [MCP_BIN], {
    env: { ...process.env, AASTACK_BRIDGE_PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  let nextId = 1;
  const pending = new Map();

  proc.stdout.setEncoding("utf-8");
  proc.stdout.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        p.resolve(msg);
      }
    }
  });

  const rpc = (method, params = {}) =>
    new Promise((resolveReq, rejectReq) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectReq(new Error(`MCP RPC ${method} timed out`));
      }, 10_000);
      pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolveReq(val);
        },
      });
      proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  const kill = async () => {
    proc.kill("SIGTERM");
    await new Promise((r) => proc.once("exit", r));
  };

  return { proc, rpc, kill };
}

test("End-to-end MCP Leader + Follower Relay <-> Live Browser Bridge (patch, hot-swap, image/png capture, undo, save)", async () => {
  const testPort = 18787 + Math.floor(Math.random() * 500);
  const leader = spawnMcpServer(testPort);
  let follower = null;
  let bridge = null;
  const outBpPath = "examples/out/e2e-test.blueprint.json";
  const outScenePath = "examples/out/e2e-test.scene.json";

  try {
    // 1. Initialize Leader MCP server (brings up localhost WS relay on testPort)
    const init1 = await leader.rpc("initialize", {});
    assert.equal(init1.result.serverInfo.name, "@aastack/mcp");

    const listTools = await leader.rpc("tools/list", {});
    const toolNames = new Set(listTools.result.tools.map((t) => t.name));
    assert.ok(toolNames.has("aastack_live_patch"));
    assert.ok(toolNames.has("aastack_live_capture_views"));
    assert.ok(toolNames.has("aastack_save_blueprint"));

    // Wait briefly for relay listen to complete via aastack_live_sessions
    const sess0 = await leader.rpc("tools/call", { name: "aastack_live_sessions", arguments: {} });
    const sess0Json = JSON.parse(sess0.result.content[0].text);
    assert.equal(sess0Json.relayMode, "leader");
    assert.equal(sess0Json.count, 0);

    // 2. Spawn SECOND Follower MCP server on the EXACT SAME port -> proves multi-agent port sharing!
    follower = spawnMcpServer(testPort);
    await follower.rpc("initialize", {});
    const fSess0 = await follower.rpc("tools/call", { name: "aastack_live_sessions", arguments: {} });
    const fSess0Json = JSON.parse(fSess0.result.content[0].text);
    assert.equal(fSess0Json.relayMode, "follower");

    // 3. Connect a real WebSocket browser client using connectDevBridge()
    const world = new SceneWorld({ seed: 11 });
    world.registerAsset(compileBlueprint(createFighterJetBlueprint()));
    world.applyPatch([
      { op: "spawn", entity: { id: "jet", assetId: "fighter-jet", pos: [0, 30, 0], rot: [0, 0, 0, 1], scale: 1 } },
    ]);
    const mockRenderer = {
      canvas: { width: 0, height: 0 },
      isMobile: false,
      render() {},
      getStats() {
        return {
          fps: 120, frameMs: 0.2, canvasWidth: 640, canvasHeight: 400, dpr: 1, drsScale: 1,
          drawCalls: 20, visibleEntities: world.doc.entities.length, totalEntities: world.doc.entities.length,
          isMobile: false, backend: "webgl2", activeSamples: 8, tick: world.doc.tick, time: world.doc.time,
        };
      },
      captureDataUrl() { return TINY_PNG_DATA_URL; },
    };

    const agentEvents = [];
    await new Promise((resolveConn) => {
      bridge = connectDevBridge(
        { world, renderer: mockRenderer, onAgentEvent: (ev) => agentEvents.push(ev) },
        {
          url: `ws://127.0.0.1:${testPort}`,
          sessionId: "test-tab-1",
          title: "E2E Flight Test",
          onStatusChange: (st) => { if (st === "connected") resolveConn(); },
        },
      );
    });
    // Small tick for hello registration to settle on leader
    await new Promise((r) => setTimeout(r, 40));

    // 4. Follower MCP sees the live browser session!
    const fSess1 = await follower.rpc("tools/call", { name: "aastack_live_sessions", arguments: {} });
    const fSess1Json = JSON.parse(fSess1.result.content[0].text);
    assert.equal(fSess1Json.count, 1);
    assert.equal(fSess1Json.sessions[0].sessionId, "test-tab-1");

    // 5. Follower MCP sends live patch -> mutates browser SceneWorld & triggers Agent Live event!
    const patchCall = await follower.rpc("tools/call", {
      name: "aastack_live_patch",
      arguments: {
        sessionId: "test-tab-1",
        label: "Sunset Smooth Toy",
        ops: [
          { op: "set", path: "style", value: "smooth-toy" },
          { op: "set", path: "lighting.timeOfDay", value: 0.52 },
        ],
      },
    });
    assert.ok(!patchCall.result.isError);
    assert.equal(world.doc.style, "smooth-toy");
    assert.equal(world.doc.lighting.timeOfDay, 0.52);
    assert.equal(agentEvents.at(-1).summary, "Sunset Smooth Toy");

    // 6. Follower MCP requests live PNG capture -> receives native MCP image/png content block!
    const capCall = await follower.rpc("tools/call", {
      name: "aastack_live_capture",
      arguments: { sessionId: "test-tab-1", maxSize: 512 },
    });
    assert.ok(!capCall.result.isError);
    const imgBlock = capCall.result.content.find((c) => c.type === "image");
    const txtBlock = capCall.result.content.find((c) => c.type === "text");
    assert.ok(imgBlock && imgBlock.mimeType === "image/png" && imgBlock.data.length > 20);
    assert.ok(txtBlock && JSON.parse(txtBlock.text).ok === true);

    // 7. Leader MCP hot-swaps a new blueprint & spawns entity live
    const bpSpec = {
      id: "e2e-drone",
      size: [12, 12, 8],
      ops: [{ op: "sphere", center: [6, 6, 4], radius: 3.2, color: [255, 110, 40] }],
      sockets: { core: { pos: [6, 6, 4] } },
    };
    const swapCall = await leader.rpc("tools/call", {
      name: "aastack_live_hot_swap_blueprint",
      arguments: { spec: bpSpec, spawnEntity: { id: "drone-1", pos: [12, 30, -10] } },
    });
    assert.ok(!swapCall.result.isError);
    assert.ok(world.getEntity("drone-1"));

    // 8. Leader saves blueprint & exports live scene to workspace JSON files; path traversal blocked
    const saveBp = await leader.rpc("tools/call", {
      name: "aastack_save_blueprint",
      arguments: { path: outBpPath, spec: bpSpec },
    });
    assert.ok(!saveBp.result.isError);
    const savedBpJson = JSON.parse(await readFile(resolve(ROOT, outBpPath), "utf-8"));
    assert.equal(savedBpJson.id, "e2e-drone");

    const expScene = await leader.rpc("tools/call", {
      name: "aastack_export_scene",
      arguments: { path: outScenePath, sessionId: "test-tab-1" },
    });
    assert.ok(!expScene.result.isError);
    const exportedScene = JSON.parse(await readFile(resolve(ROOT, outScenePath), "utf-8"));
    assert.equal(exportedScene.style, "smooth-toy");

    const badSave = await leader.rpc("tools/call", {
      name: "aastack_save_blueprint",
      arguments: { path: "../escaped.json", spec: bpSpec },
    });
    assert.equal(badSave.result.isError, true);

    // 9. Leader undoes hot-swap spawn & patch cleanly
    await leader.rpc("tools/call", { name: "aastack_live_undo", arguments: {} });
    await leader.rpc("tools/call", { name: "aastack_live_undo", arguments: {} });
    assert.equal(world.doc.style, "arcade-8bit");
  } finally {
    bridge?.disconnect();
    if (follower) await follower.kill();
    await leader.kill();
    await rm(resolve(ROOT, "examples/out"), { recursive: true, force: true });
  }
});
