#!/usr/bin/env node
/**
 * @aastack/mcp — Zero-dependency Model Context Protocol (MCP) stdio server +
 * embedded localhost RFC 6455 WebSocket dev bridge for frontier coding agents
 * (Antigravity, Claude Code, Cursor, Codex, Gemini CLI).
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { parseVox, SceneWorld } from "@aastack/core";
import type { SceneDocument, ScenePatchOp } from "@aastack/core";
import { compileBlueprint } from "@aastack/blueprint";
import type { BlueprintSpec } from "@aastack/blueprint";
import {
  BLUEPRINT_SPEC_SCHEMA,
  ENGINE_TOOL_DEFINITIONS,
  SCENE_DOCUMENT_SCHEMA,
  SCENE_PATCH_OPS_SCHEMA,
  lintSceneWorld,
  lintVolumeAsset,
  validateBlueprintSpec,
  validateSceneDocument,
  validateScenePatchOps,
} from "@aastack/bridge";
import type { EngineToolResult } from "@aastack/bridge";
import { startBridgeRelay } from "./ws-relay.js";
import type { BridgeRelayHandle } from "./ws-relay.js";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..", "..");

/** Confine all MCP disk reads/writes strictly within the workspace root (blocks ../ traversal). */
export function resolveSafeWorkspacePath(targetPath: string, rootDir = REPO_ROOT): string {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("File path must be a non-empty string.");
  }
  const resolved = resolve(rootDir, targetPath);
  const rel = relative(rootDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path "${targetPath}" escapes workspace root "${rootDir}".`);
  }
  return resolved;
}

interface JsonRpcReq {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface McpContentBlock {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

const OFFLINE_AND_PERSIST_TOOLS = [
  {
    name: "aastack_compile_blueprint",
    description:
      "Validate, 3D-lint (floating voxel islands, socket bounds/proximity, mobile VRAM budget), and compile a declarative BlueprintSpec JSON into a VolumeAsset.",
    inputSchema: {
      type: "object",
      required: ["spec"],
      properties: {
        spec: BLUEPRINT_SPEC_SCHEMA,
      },
    },
  },
  {
    name: "aastack_inspect_vox",
    description:
      "Parse a MagicaVoxel .vox file inside the workspace and return dimensions, solid voxel metrics, geometric lint diagnostics, and GPU 3D texture budget.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Workspace-relative path to a .vox file" },
        id: { type: "string", description: "Asset identifier" },
      },
    },
  },
  {
    name: "aastack_carve_4view",
    description:
      "Run the soft visual-hull 3D SDF carver (aa_views_to_slices.py) on a 4-view orthographic PNG to produce edge-dilated slices.png, sdf.png, normals.png, comparison preview, and interactive HTML viewer.",
    inputSchema: {
      type: "object",
      required: ["inputPng", "outputSlicesPng"],
      properties: {
        inputPng: { type: "string" },
        outputSlicesPng: { type: "string" },
        slices: { type: "number" },
        round: { type: "boolean" },
        previewPng: { type: "string" },
        sdfPng: { type: "string" },
      },
    },
  },
  {
    name: "aastack_validate_scene_ir",
    description:
      "Validate a SceneDocument IR (and optional ScenePatchOp[] list) against strict schemas, RenderStyle, dangling parentIds, and mobile GPU fill-rate budgets.",
    inputSchema: {
      type: "object",
      required: ["scene"],
      properties: {
        scene: SCENE_DOCUMENT_SCHEMA,
        patches: SCENE_PATCH_OPS_SCHEMA,
      },
    },
  },
  {
    name: "aastack_get_sdk_spec",
    description:
      "Return the concise llms-full.txt specification of @aastack/core, @aastack/blueprint, @aastack/bridge, and @aastack/mcp.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aastack_live_sessions",
    description:
      "List all live WebGL2 browser tabs currently connected to the localhost @aastack/mcp WebSocket dev bridge (ws://127.0.0.1:<port>).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "aastack_save_blueprint",
    description:
      "Validate, 3D-lint, and persist a BlueprintSpec as a clean Git-diffable JSON file inside the workspace.",
    inputSchema: {
      type: "object",
      required: ["path", "spec"],
      properties: {
        path: { type: "string", description: "Workspace-relative output path (e.g. assets/interceptor.blueprint.json)." },
        spec: BLUEPRINT_SPEC_SCHEMA,
      },
    },
  },
  {
    name: "aastack_export_scene",
    description:
      "Export the live connected browser tab's SceneDocument (or an explicit scene object) as a clean Git-diffable .scene.json file inside the workspace.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Workspace-relative output path (e.g. scenes/level1.scene.json)." },
        sessionId: { type: "string", description: "Optional live browser sessionId to export from." },
        scene: SCENE_DOCUMENT_SCHEMA,
      },
    },
  },
];

const LIVE_TOOL_NAMES = new Set(ENGINE_TOOL_DEFINITIONS.map((t) => t.name));
const ALL_TOOLS = [...OFFLINE_AND_PERSIST_TOOLS, ...ENGINE_TOOL_DEFINITIONS];

let relayPromise: Promise<BridgeRelayHandle | null> | null = null;

function getRelay(): Promise<BridgeRelayHandle | null> {
  if (!relayPromise) {
    const port = Number(process.env.AASTACK_BRIDGE_PORT) || 8787;
    relayPromise = startBridgeRelay({ port }).catch(() => null);
  }
  return relayPromise;
}

async function formatLiveResultToMcp(
  res: EngineToolResult,
  savePath?: string,
): Promise<{ isError?: boolean; content: McpContentBlock[] }> {
  const content: McpContentBlock[] = [];
  const savedFiles: string[] = [];

  if (res.images && res.images.length > 0) {
    for (let i = 0; i < res.images.length; i++) {
      const img = res.images[i];
      if (savePath && i === 0) {
        const outPath = resolveSafeWorkspacePath(savePath);
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, Buffer.from(img.base64, "base64"));
        savedFiles.push(relative(REPO_ROOT, outPath));
      }
      content.push({
        type: "image",
        data: img.base64,
        mimeType: img.mimeType,
      });
    }
  }

  const textPayload = {
    ok: res.ok,
    ...(res.summary ? { summary: res.summary } : {}),
    ...(res.error ? { error: res.error } : {}),
    ...(savedFiles.length > 0 ? { savedFiles } : {}),
    ...(res.data ? { data: res.data } : {}),
    ...(res.diagnostics && res.diagnostics.length > 0 ? { diagnostics: res.diagnostics } : {}),
  };
  content.push({ type: "text", text: JSON.stringify(textPayload, null, 2) });
  return { ...(res.ok ? {} : { isError: true }), content };
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError?: boolean; content: McpContentBlock[] }> {
  const okJson = (payload: unknown, isError = false) => ({
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  });

  if (name === "aastack_compile_blueprint") {
    const schemaDiags = validateBlueprintSpec(args.spec);
    if (schemaDiags.some((d) => d.severity === "error")) {
      return okJson({ ok: false, diagnostics: schemaDiags }, true);
    }
    const spec = args.spec as BlueprintSpec;
    const asset = compileBlueprint(spec);
    const report = lintVolumeAsset(asset);
    return okJson(
      {
        ok: report.ok,
        id: asset.id,
        hash: asset.hash,
        ...report.metrics,
        diagnostics: report.diagnostics,
      },
      !report.ok,
    );
  }

  if (name === "aastack_inspect_vox") {
    const filePath = resolveSafeWorkspacePath(String(args.path ?? ""));
    const buf = await readFile(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const asset = parseVox(ab, { id: String(args.id ?? "vox-asset") });
    const report = lintVolumeAsset(asset);
    return okJson({
      ok: report.ok,
      id: asset.id,
      hash: asset.hash,
      ...report.metrics,
      diagnostics: report.diagnostics,
    });
  }

  if (name === "aastack_carve_4view") {
    const script = resolve(REPO_ROOT, "skills/aa-sprite-stacking/scripts/aa_views_to_slices.py");
    const pyBin = resolve(REPO_ROOT, ".venv/bin/python");
    const inPng = resolveSafeWorkspacePath(String(args.inputPng ?? ""));
    const outSlices = resolveSafeWorkspacePath(String(args.outputSlicesPng ?? ""));
    const cliArgs = [script, inPng, outSlices];
    if (typeof args.slices === "number") cliArgs.push("--slices", String(args.slices));
    if (args.round) cliArgs.push("--round");
    if (args.previewPng) cliArgs.push("--preview", resolveSafeWorkspacePath(String(args.previewPng)));
    if (args.sdfPng) cliArgs.push("--sdf", resolveSafeWorkspacePath(String(args.sdfPng)));
    const { stdout, stderr } = await execFileAsync(pyBin, cliArgs, { timeout: 60_000 });
    return okJson({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() });
  }

  if (name === "aastack_validate_scene_ir") {
    const docDiags = validateSceneDocument(args.scene);
    const patchDiags = Array.isArray(args.patches) ? validateScenePatchOps(args.patches) : [];
    const schemaErrors = [...docDiags, ...patchDiags].filter((d) => d.severity === "error");
    if (schemaErrors.length > 0) {
      return okJson({ ok: false, diagnostics: [...docDiags, ...patchDiags] }, true);
    }
    const world = new SceneWorld(args.scene as Partial<SceneDocument>);
    if (Array.isArray(args.patches)) {
      world.applyPatch(args.patches as ScenePatchOp[]);
    }
    const diagnostics = [...docDiags, ...patchDiags, ...lintSceneWorld(world, false)];
    const ok = !diagnostics.some((d) => d.severity === "error");
    return okJson({
      ok,
      entityCount: world.doc.entities.length,
      ribbonCount: world.doc.ribbons.length,
      cameraMode: world.doc.camera.mode,
      style: world.doc.style,
      diagnostics,
      warnings: diagnostics.map((d) => d.message),
    });
  }

  if (name === "aastack_get_sdk_spec") {
    const specText = await readFile(resolve(REPO_ROOT, "llms-full.txt"), "utf-8");
    return okJson({ ok: true, spec: specText });
  }

  if (name === "aastack_save_blueprint") {
    const schemaDiags = validateBlueprintSpec(args.spec);
    if (schemaDiags.some((d) => d.severity === "error")) {
      return okJson({ ok: false, error: "BlueprintSpec failed validation; file not written.", diagnostics: schemaDiags }, true);
    }
    const spec = args.spec as BlueprintSpec;
    const asset = compileBlueprint(spec);
    const report = lintVolumeAsset(asset);
    if (!report.ok) {
      return okJson({ ok: false, error: "BlueprintSpec failed geometric lint; file not written.", diagnostics: report.diagnostics }, true);
    }
    const outPath = resolveSafeWorkspacePath(String(args.path ?? ""));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(spec, null, 2) + "\n", "utf-8");
    return okJson({
      ok: true,
      savedPath: relative(REPO_ROOT, outPath),
      id: asset.id,
      hash: asset.hash,
      metrics: report.metrics,
      diagnostics: report.diagnostics,
    });
  }

  if (name === "aastack_export_scene") {
    let sceneObj: unknown = args.scene;
    if (!sceneObj) {
      const relay = await getRelay();
      if (!relay) {
        return okJson({ ok: false, error: "Bridge relay unavailable and no explicit scene provided." }, true);
      }
      const snapRes = await relay.callLiveTool(
        "aastack_live_snapshot",
        {},
        typeof args.sessionId === "string" ? args.sessionId : undefined,
      );
      if (!snapRes.ok || typeof snapRes.data?.snapshot !== "string") {
        return okJson({ ok: false, error: snapRes.error || "Failed to snapshot live browser scene." }, true);
      }
      sceneObj = JSON.parse(snapRes.data.snapshot);
    }
    const diags = validateSceneDocument(sceneObj);
    if (diags.some((d) => d.severity === "error")) {
      return okJson({ ok: false, error: "SceneDocument validation failed; file not written.", diagnostics: diags }, true);
    }
    const outPath = resolveSafeWorkspacePath(String(args.path ?? ""));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(sceneObj, null, 2) + "\n", "utf-8");
    return okJson({
      ok: true,
      savedPath: relative(REPO_ROOT, outPath),
      diagnostics: diags,
    });
  }

  if (name === "aastack_live_sessions") {
    const relay = await getRelay();
    if (!relay) {
      return okJson({ ok: false, error: "Failed to initialize localhost WebSocket bridge relay." }, true);
    }
    const sessions = await relay.listSessions();
    return okJson({
      ok: true,
      relayUrl: `ws://127.0.0.1:${relay.port}`,
      relayMode: relay.mode,
      count: sessions.length,
      sessions,
    });
  }

  if (LIVE_TOOL_NAMES.has(name)) {
    const relay = await getRelay();
    if (!relay) {
      return okJson({ ok: false, error: "Failed to initialize localhost WebSocket bridge relay." }, true);
    }
    const sessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;
    const savePath = typeof args.savePath === "string" ? args.savePath : undefined;
    const res = await relay.callLiveTool(name, args, sessionId);
    return formatLiveResultToMcp(res, savePath);
  }

  throw new Error(`Unknown tool: ${name}`);
}

function send(msg: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function runStdioServer(): void {
  // Eagerly bring up localhost WebSocket relay so ?bridge=1 browser tabs connect immediately
  void getRelay();

  process.stdout.on("error", () => process.exit(0));
  const cleanup = async () => {
    const r = await relayPromise?.catch(() => null);
    await r?.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void cleanup());
  process.on("SIGTERM", () => void cleanup());

  let buffer = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", async (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let req: JsonRpcReq;
      try {
        req = JSON.parse(trimmed) as JsonRpcReq;
      } catch {
        continue;
      }
      if (req.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "@aastack/mcp", version: "0.1.0" },
          },
        });
      } else if (req.method === "tools/list") {
        send({ jsonrpc: "2.0", id: req.id, result: { tools: ALL_TOOLS } });
      } else if (req.method === "tools/call") {
        const params = req.params ?? {};
        try {
          const result = await handleToolCall(
            String(params.name ?? ""),
            (params.arguments as Record<string, unknown>) ?? {},
          );
          send({ jsonrpc: "2.0", id: req.id, result });
        } catch (err) {
          send({
            jsonrpc: "2.0",
            id: req.id,
            result: {
              isError: true,
              content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            },
          });
        }
      } else if (req.id !== undefined) {
        send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
      }
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runStdioServer();
}
