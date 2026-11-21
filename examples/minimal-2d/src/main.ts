/**
 * Minimal 2.5D Isometric & Oblique Transparent-Overlay Starter.
 * Demonstrates dropping an anti-aliased sprite stack directly over an existing Canvas2D tilemap
 * with zero dark halos, first-class isometric/oblique projections, and click-to-tile ground picking.
 */

import {
  AASpriteRenderer,
  SceneWorld,
  createIsometricCamera,
  projectWorldToScreen,
  quatFromYawPitchRoll,
  unprojectScreenToGround,
  type AAQuality,
  type IsometricPreset,
  // Drop-in URL loaders for your own assets:
  // loadSliceStripUrl,
  // loadVoxUrl,
} from "@aastack/core";
import { compileBlueprint, createCottageBlueprint } from "@aastack/blueprint";

const stageEl = document.getElementById("stage") as HTMLElement;
const tileCanvas = document.getElementById("tilemap2d") as HTMLCanvasElement;
const aaCanvas = document.getElementById("aaCanvas") as HTMLCanvasElement;
const statsEl = document.getElementById("stats")!;
const projBadge = document.getElementById("projBadge")!;
const splitBtn = document.getElementById("splitBtn") as HTMLButtonElement;
const ctx2d = tileCanvas.getContext("2d")!;

const PRESET_META: Record<IsometricPreset, { label: string; orthoSize: number }> = {
  "dimetric-2to1": { label: "dimetric-2to1 · 30° pitch · exact 2:1 diamond grid", orthoSize: 10.5 },
  "isometric": { label: "isometric · 35.264° axonometric · equal X/Y/Z axes", orthoSize: 10.5 },
  "oblique-stack": { label: "oblique-stack · un-foreshortened XZ · pure vertical slice skew", orthoSize: 11.5 },
  "topdown-3quarter": { label: "topdown-3quarter · 55° ortho RPG tilt", orthoSize: 10.8 },
};

// 1. Create renderer with background: "transparent" to overlay any existing 2D map / Canvas2D / PixiJS layer
const renderer = new AASpriteRenderer(aaCanvas, { background: "transparent", quality: "ultra" });
const world = new SceneWorld();

// 2. Register a sprite stack (or replace with: await loadSliceStripUrl("/car.png", { id: "prop", slices: 24 }))
//    or MagicaVoxel: await loadVoxUrl("/tank.vox", { id: "prop" })
const cottage = compileBlueprint(createCottageBlueprint("prop"));
world.registerAsset(cottage);
// Place cottage base flush on the Y = 0 tile plane (pivot.z * voxelScale = 10 * 0.28 = 2.8)
const baseY = cottage.pivot[2] * cottage.voxelScale;

let activePreset: IsometricPreset = "dimetric-2to1";
let targetTileX = 0;
let targetTileZ = 0;
const TILE_SIZE = 6.0;

function applyProjection(preset: IsometricPreset): void {
  activePreset = preset;
  const meta = PRESET_META[preset];
  world.doc.camera = createIsometricCamera({
    preset,
    target: [0, 2.4, 0],
    orthoSize: meta.orthoSize,
    obliqueSkew: 0.85,
  });
  projBadge.textContent = meta.label;
  drawTilemap2D();
}

world.applyPatch([
  { op: "set", path: "aaMode", value: "voxel-dda" },
  { op: "set", path: "samples", value: 8 },
  { op: "set", path: "splitCompare", value: { enabled: false, splitX: 0.5, leftMode: "legacy", rightMode: "voxel-dda" } },
  { op: "spawn", entity: { id: "hero", assetId: "prop", pos: [0, baseY, 0], rot: quatFromYawPitchRoll(0.55, 0, 0), scale: 1, outline: true, castShadow: false } },
]);

// Draw a live 2D HTML5 Canvas tilemap strictly synchronized with the WebGL2 camera via projectWorldToScreen()
function drawTilemap2D(): void {
  const rect = stageEl.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (tileCanvas.width !== Math.round(w * dpr) || tileCanvas.height !== Math.round(h * dpr)) {
    tileCanvas.width = Math.round(w * dpr);
    tileCanvas.height = Math.round(h * dpr);
  }
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2d.fillStyle = "#122219";
  ctx2d.fillRect(0, 0, w, h);

  const cam = world.doc.camera;
  const range = 5;
  for (let gx = -range; gx <= range; gx++) {
    for (let gz = -range; gz <= range; gz++) {
      const x0 = (gx - 0.5) * TILE_SIZE;
      const x1 = (gx + 0.5) * TILE_SIZE;
      const z0 = (gz - 0.5) * TILE_SIZE;
      const z1 = (gz + 0.5) * TILE_SIZE;
      const p0 = projectWorldToScreen([x0, 0, z0], cam, w, h);
      const p1 = projectWorldToScreen([x1, 0, z0], cam, w, h);
      const p2 = projectWorldToScreen([x1, 0, z1], cam, w, h);
      const p3 = projectWorldToScreen([x0, 0, z1], cam, w, h);

      const isRoad = gx === 0 || gz === 0;
      const isTarget = gx === targetTileX && gz === targetTileZ;
      const even = ((gx + gz) & 1) === 0;
      ctx2d.beginPath();
      ctx2d.moveTo(p0.x, p0.y);
      ctx2d.lineTo(p1.x, p1.y);
      ctx2d.lineTo(p2.x, p2.y);
      ctx2d.lineTo(p3.x, p3.y);
      ctx2d.closePath();

      ctx2d.fillStyle = isTarget
        ? "#5fd068"
        : isRoad
          ? even ? "#64748b" : "#5b6b82"
          : even ? "#4f9b42" : "#448a38";
      ctx2d.fill();
      ctx2d.strokeStyle = isTarget ? "rgba(254, 240, 138, 0.9)" : "rgba(15, 23, 42, 0.25)";
      ctx2d.lineWidth = isTarget ? 2 : 1;
      ctx2d.stroke();
    }
  }
}

applyProjection("dimetric-2to1");
window.addEventListener("resize", () => drawTilemap2D());

// Click any tile on the 2D canvas -> exact ground plane pick via unprojectScreenToGround()
stageEl.addEventListener("pointerdown", (e) => {
  const rect = stageEl.getBoundingClientRect();
  const hit = unprojectScreenToGround(
    e.clientX - rect.left,
    e.clientY - rect.top,
    world.doc.camera,
    rect.width,
    rect.height,
    0,
  );
  if (!hit) return;
  targetTileX = Math.max(-3, Math.min(3, Math.round(hit[0] / TILE_SIZE)));
  targetTileZ = Math.max(-3, Math.min(3, Math.round(hit[2] / TILE_SIZE)));
  drawTilemap2D();
});

// 3. Wire projection switcher, live AA quality softswitch & A/B split toggle
document.querySelectorAll<HTMLButtonElement>("[data-proj]").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyProjection(btn.dataset.proj as IsometricPreset);
    document.querySelectorAll<HTMLButtonElement>("[data-proj]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((btn) => {
  btn.addEventListener("click", () => {
    renderer.setQuality(btn.dataset.q as AAQuality, world);
    document.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  });
});
splitBtn.addEventListener("click", () => {
  world.doc.splitCompare.enabled = !world.doc.splitCompare.enabled;
  splitBtn.setAttribute("aria-pressed", String(world.doc.splitCompare.enabled));
});

// 4. Cool 60 fps rotation + smooth tile-glide loop
let yaw = 0.55;
let last = performance.now();
let frame = 0;
const MIN_FRAME_MS = 1000 / 60 - 1.8;
function loop(now: number) {
  const elapsed = now - last;
  if (elapsed < MIN_FRAME_MS) {
    requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min(elapsed / 1000, 0.05);
  last = now;
  yaw += 0.42 * dt;
  const ent = world.getEntity("hero");
  if (ent) {
    ent.rot = quatFromYawPitchRoll(yaw, 0, 0);
    const goalX = targetTileX * TILE_SIZE;
    const goalZ = targetTileZ * TILE_SIZE;
    ent.pos[0] += (goalX - ent.pos[0]) * Math.min(1, dt * 8);
    ent.pos[2] += (goalZ - ent.pos[2]) * Math.min(1, dt * 8);
  }
  renderer.render(world);
  if (++frame % 20 === 0) {
    const s = renderer.getStats();
    statsEl.textContent = `${s.fps} fps · ${s.gpuMs !== undefined ? `${s.gpuMs.toFixed(1)} ms gpu` : `${s.frameMs.toFixed(1)} ms`} · ${s.drawCalls} dc`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
