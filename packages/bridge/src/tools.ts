/**
 * Vendor-neutral in-process LLM tool dispatcher for AASpriteStacker.
 * Powers BOTH the browser live dev bridge AND any future in-browser BYOK AI Studio,
 * with single-frame PNG capture and 2x2 labeled multi-angle contact sheets.
 */

import { clamp, quatIdentity } from "@aastack/core";
import type {
  CameraMode,
  CameraState,
  DebugOverlay,
  EngineTelemetry,
  RenderStyle,
  ScenePatchOp,
  SceneWorld,
  Vec3,
} from "@aastack/core";
import { compileBlueprint } from "@aastack/blueprint";
import type { BlueprintSpec } from "@aastack/blueprint";
import { lintSceneWorld, lintVolumeAsset } from "./linter.js";
import type { AgentActivityEvent, CapturedImage, Diagnostic, EngineToolResult } from "./protocol.js";
import { validateBlueprintSpec, validateScenePatchOps } from "./validators.js";

export interface CaptureCapableRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly isMobile: boolean;
  render(world: SceneWorld): void;
  getStats(): EngineTelemetry;
  captureDataUrl(world: SceneWorld, mimeType?: "image/png" | "image/webp"): string;
}

export interface EngineToolContext {
  world: SceneWorld;
  renderer?: CaptureCapableRenderer;
  /** Optional hook so app-level camera state (e.g. Chase/Cockpit rig) stays synced with patches & captures. */
  setCameraMode?: (mode: CameraMode) => void;
  getCameraMode?: () => CameraMode;
  setStyle?: (style: RenderStyle) => void;
  /** Temporarily pause animation loop during multi-angle capture so views don't drift mid-sheet. */
  setPaused?: (paused: boolean) => void;
  /** Optional custom 2D HUD draw callback (e.g. Cockpit HUD canvas composited into captures). */
  getOverlayCanvas?: () => HTMLCanvasElement | null;
  onSyncUI?: () => void;
  onAgentEvent?: (event: AgentActivityEvent) => void;
}

function stripDataUrlPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

function renderScaledCanvasPng(
  renderer: CaptureCapableRenderer,
  world: SceneWorld,
  maxSize: number,
  overlayCanvas?: HTMLCanvasElement | null,
): CapturedImage {
  renderer.render(world);
  const src = renderer.canvas;
  const cap = clamp(Math.round(maxSize), 128, 1024);

  // Headless / Node mock fallback when DOM canvas creation is unavailable
  if (typeof document === "undefined" || !src || typeof src.width !== "number") {
    const dataUrl = renderer.captureDataUrl(world, "image/png");
    const st = renderer.getStats();
    return {
      mimeType: "image/png",
      base64: stripDataUrlPrefix(dataUrl),
      width: st.canvasWidth || cap,
      height: st.canvasHeight || Math.round(cap * 0.625),
    };
  }

  const sw = Math.max(1, src.width);
  const sh = Math.max(1, src.height);
  const scale = Math.min(1, cap / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const out = document.createElement("canvas");
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0, dw, dh);
  if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
    ctx.drawImage(overlayCanvas, 0, 0, dw, dh);
  }
  return {
    mimeType: "image/png",
    base64: stripDataUrlPrefix(out.toDataURL("image/png")),
    width: dw,
    height: dh,
  };
}

function emitActivity(ctx: EngineToolContext, tool: string, summary: string, canUndo: boolean, diags: Diagnostic[]): void {
  ctx.onAgentEvent?.({
    tool,
    summary,
    canUndo,
    diagnosticsCount: diags.length,
    timestamp: Date.now(),
  });
}

function summarizeScene(ctx: EngineToolContext, includeEntities = true): Record<string, unknown> {
  const { world, renderer } = ctx;
  const doc = world.doc;
  const assets = world.listAssets().map((a) => ({
    id: a.id,
    name: a.name,
    hash: a.hash,
    dimensions: [a.w, a.l, a.h],
    voxelScale: a.voxelScale,
    sockets: Object.keys(a.sockets),
    provenance: a.provenance,
  }));
  return {
    style: doc.style,
    aaMode: doc.aaMode,
    samples: doc.samples,
    debugOverlay: doc.debugOverlay,
    camera: doc.camera,
    lighting: doc.lighting,
    terrain: doc.terrain,
    splitCompare: doc.splitCompare,
    tick: doc.tick,
    time: Number(doc.time.toFixed(3)),
    entityCount: doc.entities.length,
    ribbonCount: doc.ribbons.length,
    assets,
    ...(includeEntities
      ? {
          entities: doc.entities.map((e) => ({
            id: e.id,
            assetId: e.assetId,
            pos: e.pos.map((v) => Number(v.toFixed(2))),
            rot: e.rot.map((v) => Number(v.toFixed(3))),
            scale: e.scale,
            tag: e.tag,
            visible: e.visible !== false,
            outline: e.outline !== false,
          })),
        }
      : {}),
    telemetry: renderer ? renderer.getStats() : null,
  };
}

export async function executeEngineTool(
  ctx: EngineToolContext,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<EngineToolResult> {
  const { world, renderer } = ctx;

  if (tool === "aastack_live_state") {
    const includeEntities = args.includeEntities !== false;
    const diags = lintSceneWorld(world);
    return {
      ok: true,
      summary: `Live scene: style=${world.doc.style}, entities=${world.doc.entities.length}, assets=${world.listAssets().length}`,
      data: summarizeScene(ctx, includeEntities),
      diagnostics: diags,
    };
  }

  if (tool === "aastack_live_patch") {
    const schemaDiags = validateScenePatchOps(args.ops);
    if (schemaDiags.some((d) => d.severity === "error")) {
      return {
        ok: false,
        error: "ScenePatchOp validation failed.",
        diagnostics: schemaDiags,
      };
    }
    const ops = args.ops as ScenePatchOp[];
    // Check if caller patched style or camera.mode so host app hooks stay cleanly in sync
    for (const op of ops) {
      if (op.op === "set" && op.path === "style" && ctx.setStyle) {
        ctx.setStyle(op.value as RenderStyle);
      } else if (op.op === "set" && op.path === "camera.mode" && ctx.setCameraMode) {
        ctx.setCameraMode(op.value as CameraMode);
      }
    }
    world.applyPatch(ops, true);
    ctx.onSyncUI?.();
    const diags = lintSceneWorld(world);
    const label = typeof args.label === "string" && args.label.trim() ? args.label.trim() : `Applied ${ops.length} patch op${ops.length === 1 ? "" : "s"}`;
    emitActivity(ctx, tool, label, true, diags);
    return {
      ok: true,
      summary: label,
      data: summarizeScene(ctx, false),
      diagnostics: diags,
    };
  }

  if (tool === "aastack_live_undo") {
    const undone = world.undo();
    ctx.onSyncUI?.();
    const summary = undone ? "Undid last patch" : "Undo stack is empty";
    if (undone) emitActivity(ctx, tool, summary, true, []);
    return {
      ok: true,
      summary,
      data: { undone, state: summarizeScene(ctx, false) },
    };
  }

  if (tool === "aastack_live_redo") {
    const redone = world.redo();
    ctx.onSyncUI?.();
    const summary = redone ? "Redid patch" : "Redo stack is empty";
    if (redone) emitActivity(ctx, tool, summary, true, []);
    return {
      ok: true,
      summary,
      data: { redone, state: summarizeScene(ctx, false) },
    };
  }

  if (tool === "aastack_live_hot_swap_blueprint") {
    const schemaDiags = validateBlueprintSpec(args.spec);
    if (schemaDiags.some((d) => d.severity === "error")) {
      return {
        ok: false,
        error: "BlueprintSpec validation failed.",
        diagnostics: schemaDiags,
      };
    }
    const spec = args.spec as BlueprintSpec;
    const asset = compileBlueprint(spec);
    const report = lintVolumeAsset(asset);
    if (!report.ok) {
      return {
        ok: false,
        error: `Blueprint "${spec.id}" failed geometric lint.`,
        data: { id: asset.id, metrics: report.metrics },
        diagnostics: report.diagnostics,
      };
    }

    world.registerAsset(asset);

    let spawnedId: string | null = null;
    if (args.spawnEntity && typeof args.spawnEntity === "object") {
      const se = args.spawnEntity as Record<string, unknown>;
      const entId = typeof se.id === "string" && se.id ? se.id : asset.id;
      const existing = world.getEntity(entId);
      if (existing) {
        world.applyPatch([
          {
            op: "updateEntity",
            entityId: entId,
            patch: {
              assetId: asset.id,
              ...(Array.isArray(se.pos) && se.pos.length === 3 ? { pos: se.pos as Vec3 } : {}),
              ...(typeof se.scale === "number" && se.scale > 0 ? { scale: se.scale } : {}),
              ...(typeof se.outline === "boolean" ? { outline: se.outline } : {}),
              ...(typeof se.castShadow === "boolean" ? { castShadow: se.castShadow } : {}),
            },
          },
        ]);
      } else {
        world.applyPatch([
          {
            op: "spawn",
            entity: {
              id: entId,
              assetId: asset.id,
              pos: (Array.isArray(se.pos) && se.pos.length === 3 ? se.pos : [0, 30, 0]) as Vec3,
              rot: quatIdentity(),
              scale: typeof se.scale === "number" && se.scale > 0 ? se.scale : 1.0,
              outline: typeof se.outline === "boolean" ? se.outline : true,
              castShadow: typeof se.castShadow === "boolean" ? se.castShadow : true,
              tag: typeof se.tag === "string" ? se.tag : "prop",
            },
          },
        ]);
      }
      spawnedId = entId;
    }

    ctx.onSyncUI?.();
    const warnCount = report.diagnostics.filter((d) => d.severity === "warning").length;
    const summary = `Hot-swapped "${asset.id}" (${report.metrics.solidVoxels} vox, ${warnCount} warn)`;
    emitActivity(ctx, tool, summary, Boolean(spawnedId), report.diagnostics);
    return {
      ok: true,
      summary,
      data: {
        id: asset.id,
        hash: asset.hash,
        spawnedEntityId: spawnedId,
        metrics: report.metrics,
      },
      diagnostics: report.diagnostics,
    };
  }

  if (tool === "aastack_live_query") {
    const kind = String(args.kind ?? "");
    if (kind === "terrainHeight") {
      const x = Number(args.x ?? 0);
      const z = Number(args.z ?? 0);
      const height = world.sampleTerrainHeight(x, z);
      return { ok: true, data: { kind, x, z, height: Number(height.toFixed(3)), isLand: height > 0 } };
    }
    if (kind === "raycast") {
      const ro = (args.ro ?? world.doc.camera.pos) as Vec3;
      const rd = (args.rd ?? [0, 0, -1]) as Vec3;
      const maxDist = typeof args.maxDist === "number" ? args.maxDist : 400;
      const hit = world.raycastEntities(ro, rd, maxDist);
      return { ok: true, data: { kind, hit } };
    }
    if (kind === "socket") {
      const entityId = String(args.entityId ?? "");
      const socket = String(args.socket ?? "");
      const pos = world.getSocketWorldPos(entityId, socket);
      const dir = world.getSocketWorldDir(entityId, socket);
      return {
        ok: Boolean(pos),
        data: { kind, entityId, socket, pos, dir },
        ...(pos ? {} : { error: `Socket "${socket}" not found on entity "${entityId}".` }),
      };
    }
    return { ok: false, error: `Unknown query kind "${kind}"; expected terrainHeight | raycast | socket.` };
  }

  if (tool === "aastack_live_snapshot") {
    return {
      ok: true,
      summary: `Snapshot captured at tick ${world.doc.tick}`,
      data: { snapshot: world.snapshot(), tick: world.doc.tick, time: world.doc.time },
    };
  }

  if (tool === "aastack_live_restore") {
    if (typeof args.snapshot !== "string" || !args.snapshot) {
      return { ok: false, error: "snapshot JSON string is required." };
    }
    world.restore(args.snapshot);
    ctx.onSyncUI?.();
    emitActivity(ctx, tool, `Restored snapshot (tick ${world.doc.tick})`, false, []);
    return { ok: true, summary: `Restored snapshot at tick ${world.doc.tick}`, data: summarizeScene(ctx, false) };
  }

  if (tool === "aastack_live_capture") {
    if (!renderer) {
      return { ok: false, error: "No WebGL2 renderer attached to this session." };
    }
    const maxSize = typeof args.maxSize === "number" ? clamp(Math.round(args.maxSize), 128, 1024) : 768;
    const prevCam: CameraState = {
      ...world.doc.camera,
      pos: [...world.doc.camera.pos] as Vec3,
      target: [...world.doc.camera.target] as Vec3,
      up: [...world.doc.camera.up] as Vec3,
    };
    const prevStyle = world.doc.style;
    const prevDebug = world.doc.debugOverlay;
    const prevCamMode = ctx.getCameraMode?.();

    ctx.setPaused?.(true);
    try {
      if (typeof args.style === "string") {
        world.doc.style = args.style as RenderStyle;
        ctx.setStyle?.(world.doc.style);
      }
      if (typeof args.debugOverlay === "string") {
        world.doc.debugOverlay = args.debugOverlay as DebugOverlay;
      }
      if (typeof args.cameraMode === "string") {
        world.doc.camera.mode = args.cameraMode as CameraMode;
        ctx.setCameraMode?.(args.cameraMode as CameraMode);
      }
      if (args.camera && typeof args.camera === "object") {
        const c = args.camera as Record<string, unknown>;
        if (Array.isArray(c.pos) && c.pos.length === 3) world.doc.camera.pos = [...c.pos] as Vec3;
        if (Array.isArray(c.target) && c.target.length === 3) world.doc.camera.target = [...c.target] as Vec3;
        if (Array.isArray(c.up) && c.up.length === 3) world.doc.camera.up = [...c.up] as Vec3;
        if (typeof c.fovDeg === "number") world.doc.camera.fovDeg = c.fovDeg;
      }

      const img = renderScaledCanvasPng(renderer, world, maxSize, ctx.getOverlayCanvas?.());
      img.label = `${world.doc.style} · ${world.doc.camera.mode}`;
      const stats = renderer.getStats();
      return {
        ok: true,
        summary: `Captured ${img.width}×${img.height} frame (${img.label})`,
        data: { telemetry: stats, style: world.doc.style, cameraMode: world.doc.camera.mode, debugOverlay: world.doc.debugOverlay },
        images: [img],
      };
    } finally {
      world.doc.camera = prevCam;
      world.doc.style = prevStyle;
      world.doc.debugOverlay = prevDebug;
      if (prevCamMode) ctx.setCameraMode?.(prevCamMode);
      ctx.setStyle?.(prevStyle);
      ctx.setPaused?.(false);
    }
  }

  if (tool === "aastack_live_capture_views") {
    if (!renderer) {
      return { ok: false, error: "No WebGL2 renderer attached to this session." };
    }
    const preset = args.preset === "turntable" ? "turntable" : "scene";
    const maxSize = typeof args.maxSize === "number" ? clamp(Math.round(args.maxSize), 256, 1024) : 960;

    const prevCam: CameraState = {
      ...world.doc.camera,
      pos: [...world.doc.camera.pos] as Vec3,
      target: [...world.doc.camera.target] as Vec3,
      up: [...world.doc.camera.up] as Vec3,
    };
    const prevStyle = world.doc.style;
    const prevDebug = world.doc.debugOverlay;
    const prevCamMode = ctx.getCameraMode?.();

    const targetEnt =
      (typeof args.entityId === "string" && world.getEntity(args.entityId)) ||
      world.doc.entities.find((e) => e.tag === "player") ||
      world.doc.entities[0];
    const center: Vec3 = targetEnt ? [...targetEnt.pos] : [0, 30, 0];
    const targetAsset = targetEnt ? world.getAsset(targetEnt.assetId) : undefined;
    const autoDist = targetAsset
      ? Math.max(targetAsset.w, targetAsset.l, targetAsset.h) * targetAsset.voxelScale * (targetEnt?.scale ?? 1) * 2.1
      : 16;
    const dist = typeof args.distance === "number" && args.distance > 1 ? args.distance : autoDist;

    const views: Array<{ label: string; setup: () => void }> =
      preset === "turntable"
        ? [
            // World forward/nose is -Z, so 0 deg places camera in front-starboard (-Z/+X) looking at the nose!
            { deg: 215, label: "0° Front-3/4" },
            { deg: 95, label: "90° Side" },
            { deg: 15, label: "180° Rear" },
            { deg: 305, label: "270° Top-3/4" },
          ].map((v, idx) => ({
            label: v.label,
            setup: () => {
              const rad = (v.deg * Math.PI) / 180;
              const elev = idx === 3 ? 0.58 : 0.28;
              world.doc.debugOverlay = "none";
              world.doc.camera.mode = "free";
              world.doc.camera.fovDeg = 46;
              world.doc.camera.pos = [
                center[0] + Math.sin(rad) * dist * Math.cos(elev),
                center[1] + Math.sin(elev) * dist,
                center[2] + Math.cos(rad) * dist * Math.cos(elev),
              ];
              world.doc.camera.target = center;
              world.doc.camera.up = [0, 1, 0];
              if (targetEnt) targetEnt.visible = true;
            },
          }))
        : [
            {
              label: "Chase",
              setup: () => {
                world.doc.debugOverlay = "none";
                world.doc.camera.mode = "chase";
                world.doc.camera.fovDeg = 52;
                world.doc.camera.pos = [center[0], center[1] + 5.2, center[2] + 16.5];
                world.doc.camera.target = [center[0], center[1], center[2] - 24];
                world.doc.camera.up = [0, 1, 0];
                if (targetEnt) targetEnt.visible = true;
              },
            },
            {
              label: "Overhead",
              setup: () => {
                world.doc.debugOverlay = "none";
                world.doc.camera.mode = "overhead";
                world.doc.camera.fovDeg = 46;
                world.doc.camera.pos = [center[0], center[1] + 56, center[2] + 18];
                world.doc.camera.target = [center[0], center[1] - 4, center[2] - 8];
                world.doc.camera.up = [0, 0, -1];
                if (targetEnt) targetEnt.visible = true;
              },
            },
            {
              label: "Side 3/4",
              setup: () => {
                world.doc.debugOverlay = "none";
                world.doc.camera.mode = "free";
                world.doc.camera.fovDeg = 48;
                world.doc.camera.pos = [center[0] + dist * 0.95, center[1] + dist * 0.35, center[2] + dist * 0.55];
                world.doc.camera.target = center;
                world.doc.camera.up = [0, 1, 0];
                if (targetEnt) targetEnt.visible = true;
              },
            },
            {
              label: "Normals Debug",
              setup: () => {
                world.doc.debugOverlay = "normals";
                world.doc.camera.mode = "free";
                world.doc.camera.fovDeg = 48;
                world.doc.camera.pos = [center[0] + dist * 0.65, center[1] + dist * 0.4, center[2] + dist * 0.85];
                world.doc.camera.target = center;
                world.doc.camera.up = [0, 1, 0];
                if (targetEnt) targetEnt.visible = true;
              },
            },
          ];

    const prevTargetVisible = targetEnt?.visible;
    ctx.setPaused?.(true);
    try {
      if (typeof args.style === "string") {
        world.doc.style = args.style as RenderStyle;
        ctx.setStyle?.(world.doc.style);
      }

      // Browser 2x2 contact sheet compositor
      if (typeof document !== "undefined" && renderer.canvas && renderer.canvas.width > 0) {
        const aspect = renderer.canvas.width / Math.max(1, renderer.canvas.height);
        const sheetW = maxSize;
        const sheetH = Math.min(maxSize, Math.max(256, Math.round(maxSize / Math.max(0.75, aspect))));
        const cellW = Math.floor(sheetW / 2);
        const cellH = Math.floor(sheetH / 2);

        const sheet = document.createElement("canvas");
        sheet.width = cellW * 2;
        sheet.height = cellH * 2;
        const sctx = sheet.getContext("2d")!;
        sctx.fillStyle = "#0b1220";
        sctx.fillRect(0, 0, sheet.width, sheet.height);

        for (let i = 0; i < 4; i++) {
          views[i].setup();
          renderer.render(world);
          const gx = (i % 2) * cellW;
          const gy = Math.floor(i / 2) * cellH;
          sctx.drawImage(renderer.canvas, gx, gy, cellW, cellH);

          // Crisp corner label badge
          const lbl = `${views[i].label} · ${world.doc.style}`;
          sctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
          const tw = sctx.measureText(lbl).width + 14;
          sctx.fillStyle = "rgba(9, 14, 24, 0.78)";
          sctx.fillRect(gx + 8, gy + 8, tw, 22);
          sctx.fillStyle = "#f8fafc";
          sctx.fillText(lbl, gx + 15, gy + 23);
        }
        // Subtle 2x2 divider cross
        sctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        sctx.lineWidth = 2;
        sctx.beginPath();
        sctx.moveTo(cellW, 0); sctx.lineTo(cellW, sheet.height);
        sctx.moveTo(0, cellH); sctx.lineTo(sheet.width, cellH);
        sctx.stroke();

        const sheetImg: CapturedImage = {
          label: `2x2 ${preset} (${world.doc.style})`,
          mimeType: "image/png",
          base64: stripDataUrlPrefix(sheet.toDataURL("image/png")),
          width: sheet.width,
          height: sheet.height,
        };
        return {
          ok: true,
          summary: `Captured 2×2 ${preset} contact sheet (${sheet.width}×${sheet.height})`,
          data: { preset, views: views.map((v) => v.label), style: world.doc.style, telemetry: renderer.getStats() },
          images: [sheetImg],
        };
      }

      // Node/mock fallback: capture each view and return primary image
      views[0].setup();
      const fallbackImg = renderScaledCanvasPng(renderer, world, maxSize);
      fallbackImg.label = `2x2 ${preset} (${world.doc.style})`;
      return {
        ok: true,
        summary: `Captured ${preset} views (headless fallback)`,
        data: { preset, views: views.map((v) => v.label), style: world.doc.style, telemetry: renderer.getStats() },
        images: [fallbackImg],
      };
    } finally {
      world.doc.camera = prevCam;
      world.doc.style = prevStyle;
      world.doc.debugOverlay = prevDebug;
      if (targetEnt) targetEnt.visible = prevTargetVisible;
      if (prevCamMode) ctx.setCameraMode?.(prevCamMode);
      ctx.setStyle?.(prevStyle);
      ctx.setPaused?.(false);
    }
  }

  return { ok: false, error: `Unknown live engine tool: "${tool}".` };
}
