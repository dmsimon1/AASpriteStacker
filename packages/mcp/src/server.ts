#!/usr/bin/env node
/**
 * @aastack/mcp — Zero-dependency Model Context Protocol (MCP) stdio server
 * exposing first-principles AASpriteStacker tools to frontier coding agents
 * (Claude Code, Cursor, Antigravity, Codex, Gemini CLI).
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { parseVox, SceneWorld } from "@aastack/core";
import type { SceneDocument, ScenePatchOp } from "@aastack/core";
import { compileBlueprint } from "@aastack/blueprint";
import type { BlueprintSpec } from "@aastack/blueprint";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");

interface JsonRpcReq {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "aastack_compile_blueprint",
    description:
      "Compile and validate a declarative Voxel+SDF Blueprint JSON spec into an AASpriteStacker VolumeAsset, returning dimensions, solid voxel count, memory budget, sockets, and content hash.",
    inputSchema: {
      type: "object",
      properties: {
        spec: { type: "object", description: "BlueprintSpec JSON (id, size:[w,l,h], ops, sockets)" },
      },
      required: ["spec"],
    },
  },
  {
    name: "aastack_inspect_vox",
    description:
      "Parse a MagicaVoxel .vox file from disk and return voxel dimensions, occupancy, emissive count, and GPU 3D texture memory budget.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or repo-relative path to a .vox file" },
        id: { type: "string", description: "Asset identifier" },
      },
      required: ["path"],
    },
  },
  {
    name: "aastack_carve_4view",
    description:
      "Run the soft visual-hull 3D SDF carver (aa_views_to_slices.py) on a 4-view orthographic PNG to produce edge-dilated slices.png, sdf.png, normals.png, comparison preview, and interactive HTML viewer.",
    inputSchema: {
      type: "object",
      properties: {
        inputPng: { type: "string" },
        outputSlicesPng: { type: "string" },
        slices: { type: "number" },
        round: { type: "boolean" },
        previewPng: { type: "string" },
        sdfPng: { type: "string" },
      },
      required: ["inputPng", "outputSlicesPng"],
    },
  },
  {
    name: "aastack_validate_scene_ir",
    description:
      "Validate a SceneDocument IR (and optional ScenePatchOp[] list) for dangling parentIds, invalid camera/LOD ranges, and mobile GPU fill-rate budgets.",
    inputSchema: {
      type: "object",
      properties: {
        scene: { type: "object" },
        patches: { type: "array", items: { type: "object" } },
      },
      required: ["scene"],
    },
  },
  {
    name: "aastack_get_sdk_spec",
    description:
      "Return the concise llms-full.txt specification of the @aastack/core and @aastack/blueprint APIs so agents generate accurate zero-hallucination code.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "aastack_compile_blueprint") {
    const spec = args.spec as BlueprintSpec;
    const asset = compileBlueprint(spec);
    let solid = 0;
    let emis = 0;
    const total = asset.w * asset.l * asset.h;
    for (let i = 0; i < total; i++) {
      if (asset.rgba[i * 4 + 3] >= 128) solid++;
      if (asset.emisU8[i] > 0) emis++;
    }
    const gpuBytes = total * (4 + 1 + 4 + 1); // rgba + sdf + normAo + emis
    return {
      ok: true,
      id: asset.id,
      hash: asset.hash,
      dimensions: [asset.w, asset.l, asset.h],
      solidVoxels: solid,
      fillRatio: Number((solid / Math.max(total, 1)).toFixed(4)),
      emissiveVoxels: emis,
      gpuTextureKB: Number((gpuBytes / 1024).toFixed(1)),
      sockets: Object.keys(asset.sockets),
    };
  }

  if (name === "aastack_inspect_vox") {
    const filePath = resolve(REPO_ROOT, String(args.path));
    const buf = await readFile(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const asset = parseVox(ab, { id: String(args.id ?? "vox-asset") });
    let solid = 0;
    for (let i = 0; i < asset.w * asset.l * asset.h; i++) {
      if (asset.rgba[i * 4 + 3] >= 128) solid++;
    }
    return {
      ok: true,
      id: asset.id,
      hash: asset.hash,
      dimensions: [asset.w, asset.l, asset.h],
      solidVoxels: solid,
      gpuTextureKB: Number(((asset.w * asset.l * asset.h * 10) / 1024).toFixed(1)),
    };
  }

  if (name === "aastack_carve_4view") {
    const script = resolve(REPO_ROOT, "skills/aa-sprite-stacking/scripts/aa_views_to_slices.py");
    const pyBin = resolve(REPO_ROOT, ".venv/bin/python");
    const cliArgs = [script, String(args.inputPng), String(args.outputSlicesPng)];
    if (typeof args.slices === "number") cliArgs.push("--slices", String(args.slices));
    if (args.round) cliArgs.push("--round");
    if (args.previewPng) cliArgs.push("--preview", String(args.previewPng));
    if (args.sdfPng) cliArgs.push("--sdf", String(args.sdfPng));
    const { stdout, stderr } = await execFileAsync(pyBin, cliArgs, { timeout: 60_000 });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  }

  if (name === "aastack_validate_scene_ir") {
    const world = new SceneWorld(args.scene as Partial<SceneDocument>);
    if (Array.isArray(args.patches)) {
      world.applyPatch(args.patches as ScenePatchOp[]);
    }
    const warnings: string[] = [];
    const ids = new Set(world.doc.entities.map((e) => e.id));
    for (const e of world.doc.entities) {
      if (e.parentId && !ids.has(e.parentId)) {
        warnings.push(`Entity "${e.id}" references missing parentId "${e.parentId}".`);
      }
      if (e.scale <= 0) warnings.push(`Entity "${e.id}" has non-positive scale ${e.scale}.`);
    }
    if (world.doc.entities.length > 64) {
      warnings.push(`Scene has ${world.doc.entities.length} entities; enable distance LOD / culling for mobile 60fps.`);
    }
    const validStyles = new Set(["arcade-8bit", "hd-2d", "smooth-toy", "retro-raw"]);
    if (!validStyles.has(world.doc.style)) {
      warnings.push(`Unknown RenderStyle "${String(world.doc.style)}"; expected arcade-8bit | hd-2d | smooth-toy | retro-raw.`);
    }
    return {
      ok: warnings.length === 0,
      entityCount: world.doc.entities.length,
      ribbonCount: world.doc.ribbons.length,
      cameraMode: world.doc.camera.mode,
      style: world.doc.style,
      warnings,
    };
  }

  if (name === "aastack_get_sdk_spec") {
    const specText = await readFile(resolve(REPO_ROOT, "llms-full.txt"), "utf-8");
    return { ok: true, spec: specText };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function send(msg: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

process.stdout.on("error", () => process.exit(0));
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
      send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } });
    } else if (req.method === "tools/call") {
      const params = req.params ?? {};
      try {
        const result = await handleToolCall(
          String(params.name ?? ""),
          (params.arguments as Record<string, unknown>) ?? {},
        );
        send({
          jsonrpc: "2.0",
          id: req.id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        });
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
