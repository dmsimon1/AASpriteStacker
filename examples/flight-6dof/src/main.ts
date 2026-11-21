/**
 * SkyStack — Flagship 6-DOF Anti-Aliased Flight Sandbox powered by @aastack/core & @aastack/blueprint.
 * Showcases:
 *  - Overhead / Chase / Cockpit 6-DOF cameras (yaw, pitch, 360° barrel rolls)
 *  - Instanced OBB RGSS DDA & Smooth SDF aircraft, volumetric clouds, and hollow sky-gate rings
 *  - Perspective Voxel-Space terraced island archipelago, ocean sparkles, projected cloud shadows, fog
 *  - Depth-tested 3D wingtip contrails & glowing thruster plumes attached to semantic sockets
 *  - Live diegetic Cockpit HUD (radar minimap reading CPU/GPU-matched heightfield, attitude ball, HUD glass)
 *  - Full mobile multi-touch controls (floating virtual thumbstick + 44px+ Boost/Roll/View/A-B buttons)
 *  - Live A/B Split-Screen Curtain + SceneIR Inspector + Deterministic Snapshot/Rewind
 */

import {
  AASpriteRenderer,
  SceneWorld,
  clamp,
  createTouchController,
  lerp,
  quatFromYawPitchRoll,
  quatRotateVec3,
  vec3Add,
  vec3Lerp,
  vec3Scale,
} from "@aastack/core";
import type { AAMode, CameraMode, RenderStyle, RibbonPoint, Vec3 } from "@aastack/core";
import {
  compileBlueprint,
  createCloudBlueprint,
  createFighterJetBlueprint,
  createSkyGateBlueprint,
} from "@aastack/blueprint";

const stage = document.getElementById("stage") as HTMLElement;
const glCanvas = document.getElementById("glCanvas") as HTMLCanvasElement;
const hudCanvas = document.getElementById("hudCanvas") as HTMLCanvasElement;
const hudCtx = hudCanvas.getContext("2d")!;

const splitOverlay = document.getElementById("splitOverlay") as HTMLElement;
const splitHandle = document.getElementById("splitHandle") as HTMLElement;
const tagLeft = document.getElementById("tagLeft") as HTMLElement;
const tagRight = document.getElementById("tagRight") as HTMLElement;
const statsBar = document.getElementById("statsBar") as HTMLElement;
const hintBar = document.getElementById("hintBar") as HTMLElement;

const camBtn = document.getElementById("camBtn") as HTMLButtonElement;
const styleBtn = document.getElementById("styleBtn") as HTMLButtonElement;
const splitBtn = document.getElementById("splitBtn") as HTMLButtonElement;
const todBtn = document.getElementById("todBtn") as HTMLButtonElement;
const inspectorBtn = document.getElementById("inspectorBtn") as HTMLButtonElement;
const inspectorDrawer = document.getElementById("inspectorDrawer") as HTMLElement;
const irPreview = document.getElementById("irPreview") as HTMLElement;

const mobileBoostBtn = document.getElementById("mobileBoostBtn") as HTMLButtonElement;
const mobileRollBtn = document.getElementById("mobileRollBtn") as HTMLButtonElement;
const stickBase = document.getElementById("stickBase") as HTMLElement;
const stickKnob = document.getElementById("stickKnob") as HTMLElement;

// 1. Initialize @aastack/core World & WebGL2 Mobile-Adaptive Renderer
const world = new SceneWorld({ seed: 11 });
const renderer = new AASpriteRenderer(glCanvas, { quality: "auto", adaptiveDpr: true });

// 2. Compile Declarative Blueprints into GPU-ready VolumeAssets (with 3D SDF, normals, sockets!)
const jetAsset = compileBlueprint(createFighterJetBlueprint("fighter-jet"));
const cloud0 = compileBlueprint(createCloudBlueprint(0, "cloud-0"));
const cloud1 = compileBlueprint(createCloudBlueprint(1, "cloud-1"));
const cloud2 = compileBlueprint(createCloudBlueprint(2, "cloud-2"));
const gateAsset = compileBlueprint(createSkyGateBlueprint("sky-gate"));

world.registerAsset(jetAsset);
world.registerAsset(cloud0);
world.registerAsset(cloud1);
world.registerAsset(cloud2);
world.registerAsset(gateAsset);

// 3. Populate SceneIR via surgical declarative patches
world.applyPatch(
  [
    {
      op: "set",
      path: "style",
      value: "arcade-8bit",
    },
    {
      op: "set",
      path: "aaMode",
      value: "voxel-dda",
    },
    {
      op: "set",
      path: "samples",
      value: renderer.isMobile ? 4 : 8,
    },
    {
      op: "set",
      path: "terrain",
      value: {
        enabled: true,
        seed: 11,
        maxHeight: 16.5,
        scale: 0.0085,
        waveTime: 0,
        terraceSteps: 6,
      },
    },
    {
      op: "spawn",
      entity: {
        id: "jet",
        assetId: "fighter-jet",
        pos: [0, 30, 0],
        rot: [0, 0, 0, 1],
        scale: 1.0,
        outline: true,
        castShadow: true,
        emissiveBoost: 1.2,
        tag: "player",
      },
    },
  ],
  false,
);

// Spawn volumetric cumulus cloud field (recycled smoothly around the aircraft!)
const CLOUD_COUNT = renderer.isMobile ? 14 : 22;
const CLOUD_SPAN = 260;
const clouds: Array<{ id: string; alt: number; drift: number }> = [];
for (let i = 0; i < CLOUD_COUNT; i++) {
  const ang = i * 2.39996;
  const dist = 28 + ((i * 37) % 120);
  const cx = Math.cos(ang) * dist;
  const cz = Math.sin(ang) * dist;
  const alt = 22 + (i % 5) * 6.5;
  const id = `cloud-${i}`;
  clouds.push({ id, alt, drift: 1.4 + (i % 4) * 0.55 });
  world.applyPatch(
    [
      {
        op: "spawn",
        entity: {
          id,
          assetId: `cloud-${i % 3}`,
          pos: [cx, alt, cz],
          rot: quatFromYawPitchRoll((i * 1.1) % 6.28, 0, 0),
          scale: 0.9 + (i % 3) * 0.32,
          outline: false, // Soft puffy clouds without harsh black outlines!
          castShadow: true,
          tag: "cloud",
        },
      },
    ],
    false,
  );
}

// Spawn 5 glowing hollow aerial sky-gate checkpoints across the archipelago
const gateCoords: Array<[number, number, number, number]> = [
  [0, 29, -85, 0],
  [70, 34, -150, -0.6],
  [120, 28, -50, -1.6],
  [45, 32, 65, -2.5],
  [-65, 30, 15, 1.2],
];
for (let i = 0; i < gateCoords.length; i++) {
  const [gx, gy, gz, gyaw] = gateCoords[i];
  world.applyPatch(
    [
      {
        op: "spawn",
        entity: {
          id: `gate-${i}`,
          assetId: "sky-gate",
          pos: [gx, gy, gz],
          rot: quatFromYawPitchRoll(gyaw, 0, 0),
          scale: 1.0,
          outline: true,
          castShadow: false,
          emissiveBoost: 1.4,
          tag: "gate",
        },
      },
    ],
    false,
  );
}

// 4. Arcade 6-DOF Flight Simulation State
const flight = {
  pos: [0, 30, 0] as Vec3,
  yaw: 0,
  pitch: 0,
  bank: 0,
  barrelPhase: 0, // 0..1 when performing 360° barrel roll
  barrelDir: 1,
  speed: 36,
  thrusting: false,
  forceThrust: false,
  camMode: "chase" as CameraMode,
  camPosSmooth: [0, 38, 22] as Vec3,
  camTargetSmooth: [0, 30, -20] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,
  score: 0,
  lastGateHit: -1,
};

const trailL: RibbonPoint[] = [];
const trailR: RibbonPoint[] = [];
const plumeOuterL: RibbonPoint[] = [];
const plumeOuterR: RibbonPoint[] = [];
const plumeCoreL: RibbonPoint[] = [];
const plumeCoreR: RibbonPoint[] = [];

// Pointer (mouse) + Keyboard + Multi-Touch Mobile Inputs
const input = {
  pointerX: 0, // -1..1
  pointerY: 0, // -1..1
  pointerActive: false,
  mouseDown: false,
  keys: new Set<string>(),
};

const touchCtrl = createTouchController({
  steerZone: stage,
  stickBase,
  stickKnob,
  maxRadius: 48,
});

function triggerBarrelRoll(): void {
  if (flight.barrelPhase > 0.01) return;
  const steer = touchCtrl.state.steering ? touchCtrl.state.steerX : input.pointerX;
  flight.barrelDir = steer < -0.1 ? -1 : 1;
  flight.barrelPhase = 0.001;
}

function cycleCamera(): void {
  const order: CameraMode[] = ["overhead", "chase", "cockpit"];
  const idx = (order.indexOf(flight.camMode) + 1) % order.length;
  flight.camMode = order[idx];
  syncControlsUI();
}

const STYLE_CYCLE: RenderStyle[] = ["arcade-8bit", "hd-2d", "smooth-toy", "retro-raw"];
const AA_STYLES: RenderStyle[] = ["arcade-8bit", "hd-2d", "smooth-toy"];

function aaModeForStyle(s: RenderStyle): AAMode {
  if (s === "retro-raw") return "legacy";
  if (s === "smooth-toy") return "smooth-sdf";
  return "voxel-dda";
}

function labelForStyle(s: RenderStyle): string {
  if (s === "hd-2d") return "HD-2D";
  if (s === "smooth-toy") return "Smooth Toy";
  if (s === "retro-raw") return "Retro 1×";
  return "8-Bit AA";
}

function applyRenderStyle(next: RenderStyle): void {
  const mode = aaModeForStyle(next);
  if (world.doc.splitCompare.enabled) {
    const rightStyle = next === "retro-raw" ? "arcade-8bit" : next;
    const rightMode = aaModeForStyle(rightStyle);
    world.applyPatch([
      { op: "set", path: "style", value: rightStyle },
      { op: "set", path: "aaMode", value: rightMode },
      { op: "set", path: "splitCompare.rightMode", value: rightMode },
    ]);
  } else {
    world.applyPatch([
      { op: "set", path: "style", value: next },
      { op: "set", path: "aaMode", value: mode },
    ]);
  }
  syncControlsUI();
}

function cycleRenderStyle(): void {
  const list = world.doc.splitCompare.enabled ? AA_STYLES : STYLE_CYCLE;
  const cur = world.doc.style ?? "arcade-8bit";
  const next = list[(list.indexOf(cur) + 1) % list.length];
  applyRenderStyle(next);
}

const TOD_PRESETS = [
  { label: "Day", val: 0.0 },
  { label: "Sunset", val: 0.52 },
  { label: "Night", val: 0.92 },
];
let todIdx = 0;
function cycleTimeOfDay(): void {
  todIdx = (todIdx + 1) % TOD_PRESETS.length;
  world.applyPatch([{ op: "set", path: "lighting.timeOfDay", value: TOD_PRESETS[todIdx].val }]);
  syncControlsUI();
}

function toggleSplitCompare(): void {
  const next = !world.doc.splitCompare.enabled;
  const activeStyle = world.doc.style === "retro-raw" ? "arcade-8bit" : world.doc.style;
  const rightMode = aaModeForStyle(activeStyle);
  const ops: Parameters<SceneWorld["applyPatch"]>[0] = [];
  if (next && world.doc.style === "retro-raw") {
    ops.push({ op: "set", path: "style", value: "arcade-8bit" });
    ops.push({ op: "set", path: "aaMode", value: "voxel-dda" });
  }
  ops.push({
    op: "set",
    path: "splitCompare",
    value: {
      enabled: next,
      splitX: world.doc.splitCompare.splitX || 0.5,
      leftMode: "legacy",
      rightMode,
    },
  });
  world.applyPatch(ops);
  syncControlsUI();
}

function syncControlsUI(): void {
  const camLabels: Record<string, string> = { overhead: "Overhead", chase: "Chase", cockpit: "Cockpit" };
  camBtn.textContent = `Cam: ${camLabels[flight.camMode] ?? flight.camMode}`;

  const activeStyle = world.doc.style ?? "arcade-8bit";
  styleBtn.textContent = `Style: ${labelForStyle(activeStyle)}`;
  splitBtn.setAttribute("aria-pressed", String(world.doc.splitCompare.enabled));
  todBtn.textContent = TOD_PRESETS[todIdx].label;

  splitOverlay.classList.toggle("visible", world.doc.splitCompare.enabled);
  splitHandle.style.left = `${(world.doc.splitCompare.splitX * 100).toFixed(1)}%`;
  tagLeft.textContent = "Retro 1×";
  tagRight.textContent = `${labelForStyle(activeStyle)} · ${world.doc.samples}×`;

  stage.classList.toggle("cockpit-mode", flight.camMode === "cockpit");
  const isCompact = renderer.isMobile || window.innerWidth < 760;
  if (isCompact) {
    hintBar.textContent = "Drag left to steer · BOOST · ROLL · CAM";
  } else if (flight.camMode === "overhead") {
    hintBar.textContent = "Mouse / WASD to steer · Click: roll · Shift: boost · M: style · V: Chase";
  } else if (flight.camMode === "chase") {
    hintBar.textContent = "Point / WASD to fly · Click: roll · Hold mouse/Shift: boost · M: style · V: Cockpit";
  } else {
    hintBar.textContent = "Cockpit · Point / WASD to fly · Click: roll · Hold mouse/Shift: boost · M: style · V: Overhead";
  }
}

// Desktop Mouse + Keyboard Listeners
stage.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const r = stage.getBoundingClientRect();
  input.pointerX = clamp(((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1, -1, 1);
  input.pointerY = clamp(((e.clientY - r.top) / Math.max(r.height, 1)) * 2 - 1, -1, 1);
  input.pointerActive = true;
});

let downTime = 0;
stage.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") return;
  if ((e.target as HTMLElement).closest("button, select, input, .hud-interactive, #splitHandle")) return;
  input.mouseDown = true;
  downTime = performance.now();
});
stage.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "mouse") return;
  if (input.mouseDown && performance.now() - downTime < 230) {
    triggerBarrelRoll();
  }
  input.mouseDown = false;
});

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
  input.keys.add(e.code);
  if (e.code === "Space" || e.code === "KeyV") {
    e.preventDefault();
    cycleCamera();
  } else if (e.code === "KeyR") {
    triggerBarrelRoll();
  } else if (e.code === "KeyC") {
    toggleSplitCompare();
  } else if (e.code === "KeyM") {
    cycleRenderStyle();
  }
});
window.addEventListener("keyup", (e) => input.keys.delete(e.code));
window.addEventListener("resize", syncControlsUI);

// Split-Screen Curtain Dragging (works for both mouse & touch!)
let draggingSplit = false;
splitHandle.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  draggingSplit = true;
  splitHandle.setPointerCapture(e.pointerId);
});
splitHandle.addEventListener("pointermove", (e) => {
  if (!draggingSplit) return;
  const r = stage.getBoundingClientRect();
  const x = clamp((e.clientX - r.left) / Math.max(r.width, 1), 0.08, 0.92);
  world.applyPatch([{ op: "set", path: "splitCompare.splitX", value: x }], false);
  splitHandle.style.left = `${(x * 100).toFixed(1)}%`;
});
splitHandle.addEventListener("pointerup", () => {
  draggingSplit = false;
});

// UI Buttons + Mobile Touch Action Buttons
camBtn.addEventListener("click", cycleCamera);
styleBtn.addEventListener("click", cycleRenderStyle);
splitBtn.addEventListener("click", toggleSplitCompare);
todBtn.addEventListener("click", cycleTimeOfDay);

mobileBoostBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  touchCtrl.state.thrust = true;
  mobileBoostBtn.setAttribute("aria-pressed", "true");
});
const releaseBoost = () => {
  touchCtrl.state.thrust = false;
  mobileBoostBtn.setAttribute("aria-pressed", "false");
};
mobileBoostBtn.addEventListener("pointerup", releaseBoost);
mobileBoostBtn.addEventListener("pointercancel", releaseBoost);
mobileBoostBtn.addEventListener("pointerleave", releaseBoost);
mobileRollBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  triggerBarrelRoll();
});

// AI-First SceneIR Inspector + Deterministic Snapshot/Rewind Controls
let savedSnapshot: string | null = null;
inspectorBtn.addEventListener("click", () => {
  const open = !inspectorDrawer.classList.contains("open");
  inspectorDrawer.classList.toggle("open", open);
  inspectorBtn.setAttribute("aria-pressed", String(open));
});
document.getElementById("snapBtn")?.addEventListener("click", () => {
  savedSnapshot = world.snapshot();
  const btn = document.getElementById("restoreBtn") as HTMLButtonElement | null;
  if (btn) btn.disabled = false;
});
document.getElementById("restoreBtn")?.addEventListener("click", () => {
  if (!savedSnapshot) return;
  world.restore(savedSnapshot);
  const jet = world.getEntity("jet");
  if (jet) flight.pos = [...jet.pos] as Vec3;
  syncControlsUI();
});
document.getElementById("debugNormBtn")?.addEventListener("click", () => {
  const next = world.doc.debugOverlay === "normals" ? "none" : "normals";
  world.applyPatch([{ op: "set", path: "debugOverlay", value: next }]);
});

// 5. Fixed-Step 6-DOF Flight Physics & World Update
function stepSimulation(dt: number): void {
  world.stepClock(dt);

  // Merge keyboard + pointer + mobile multi-touch inputs
  const keyX = (input.keys.has("KeyD") || input.keys.has("ArrowRight") ? 1 : 0) -
               (input.keys.has("KeyA") || input.keys.has("ArrowLeft") ? 1 : 0);
  const keyY = (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) -
               (input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0);

  let steerX = keyX;
  let steerY = keyY;
  if (touchCtrl.state.steering) {
    steerX = touchCtrl.state.steerX;
    steerY = touchCtrl.state.steerY;
  } else if (keyX === 0 && keyY === 0 && input.pointerActive) {
    steerX = Math.abs(input.pointerX) > 0.08 ? input.pointerX : 0;
    steerY = Math.abs(input.pointerY) > 0.08 ? input.pointerY : 0;
  }

  flight.thrusting =
    flight.forceThrust ||
    touchCtrl.state.thrust ||
    input.mouseDown ||
    input.keys.has("ShiftLeft") ||
    input.keys.has("ShiftRight");

  const targetSpeed = flight.thrusting ? 64 : 36;
  flight.speed = lerp(flight.speed, targetSpeed, clamp(dt * 4.5, 0, 1));

  // Turn yaw & bank smoothly
  flight.yaw -= steerX * 1.45 * dt;
  const targetBank = steerX * 0.92;
  flight.bank = lerp(flight.bank, targetBank, clamp(dt * 6.5, 0, 1));

  // Pitch climb/dive (gentle auto-level in overhead mode, full climb/dive in chase & cockpit!)
  const targetPitch = flight.camMode === "overhead" ? -steerY * 0.14 : clamp(-steerY * 0.62, -0.58, 0.58);
  flight.pitch = lerp(flight.pitch, targetPitch, clamp(dt * 5.2, 0, 1));

  // Barrel roll animation
  let rollExtra = 0;
  if (flight.barrelPhase > 0) {
    flight.barrelPhase += dt * 1.45;
    if (flight.barrelPhase >= 1) {
      flight.barrelPhase = 0;
    } else {
      const ease = flight.barrelPhase * flight.barrelPhase * (3 - 2 * flight.barrelPhase);
      rollExtra = ease * Math.PI * 2 * flight.barrelDir;
    }
  }

  const totalRoll = flight.bank + rollExtra;
  const rotQ = quatFromYawPitchRoll(flight.yaw, flight.pitch, totalRoll);
  const forward = quatRotateVec3(rotQ, [0, 0, -1]);
  const upVec = quatRotateVec3(rotQ, [0, 1, 0]);

  flight.pos = vec3Add(flight.pos, vec3Scale(forward, flight.speed * dt));

  // Terrain clearance floor (uses exact CPU/GPU-matched heightfield!) & ceiling
  const groundH = world.sampleTerrainHeight(flight.pos[0], flight.pos[2]);
  const minAlt = groundH + 4.5;
  if (flight.pos[1] < minAlt) {
    flight.pos[1] = lerp(flight.pos[1], minAlt + 1.5, clamp(dt * 8, 0, 1));
    if (flight.pitch < 0) flight.pitch *= 0.7;
  }
  if (flight.pos[1] > 62) {
    flight.pos[1] = 62;
    if (flight.pitch > 0) flight.pitch *= 0.8;
  }

  // Update jet entity in SceneIR
  const jetEnt = world.getEntity("jet");
  if (jetEnt) {
    jetEnt.pos = [...flight.pos];
    jetEnt.rot = rotQ;
    jetEnt.visible = flight.camMode !== "cockpit";
    jetEnt.emissiveBoost = flight.thrusting ? 2.2 : 0.95;
  }

  // Wrap volumetric clouds infinitely around the jet so you never run out of sky!
  for (const c of clouds) {
    const ent = world.getEntity(c.id);
    if (!ent) continue;
    ent.pos[0] += c.drift * dt;
    const dx = ent.pos[0] - flight.pos[0];
    const dz = ent.pos[2] - flight.pos[2];
    if (dx > CLOUD_SPAN * 0.5) ent.pos[0] -= CLOUD_SPAN;
    if (dx < -CLOUD_SPAN * 0.5) ent.pos[0] += CLOUD_SPAN;
    if (dz > CLOUD_SPAN * 0.5) ent.pos[2] -= CLOUD_SPAN;
    if (dz < -CLOUD_SPAN * 0.5) ent.pos[2] += CLOUD_SPAN;
  }

  // Check Sky-Gate ring pass-throughs
  for (let i = 0; i < gateCoords.length; i++) {
    const g = world.getEntity(`gate-${i}`);
    if (!g) continue;
    const d = Math.hypot(g.pos[0] - flight.pos[0], g.pos[1] - flight.pos[1], g.pos[2] - flight.pos[2]);
    if (d < 8.0 && flight.lastGateHit !== i) {
      flight.score++;
      flight.lastGateHit = i;
    }
  }

  // Update 3D Wingtip Contrails & Dual Thruster Plumes from Semantic Sockets!
  const wL = world.getSocketWorldPos("jet", "wingtipL");
  const wR = world.getSocketWorldPos("jet", "wingtipR");
  const tL = world.getSocketWorldPos("jet", "thrusterL");
  const tR = world.getSocketWorldPos("jet", "thrusterR");

  const updateTrail = (arr: RibbonPoint[], head: Vec3 | null, lifeSpeed: number, width: number, maxLen: number) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      arr[i].age += dt * lifeSpeed;
      if (arr[i].age >= 1.0) arr.splice(i, 1);
    }
    if (head) {
      arr.unshift({ pos: head, age: 0, width });
      if (arr.length > maxLen) arr.pop();
    }
  };

  updateTrail(trailL, wL, 0.44, flight.thrusting ? 0.54 : 0.36, 76);
  updateTrail(trailR, wR, 0.44, flight.thrusting ? 0.54 : 0.36, 76);

  // Fiery multi-layer twin thruster flames (lively burn at cruise + blazing roaring jet on afterburner!)
  if (tL && tR && flight.camMode !== "cockpit") {
    const fA = 0.88 + Math.sin(world.doc.time * 52) * 0.18 + Math.cos(world.doc.time * 87) * 0.08;
    const fB = 0.88 + Math.cos(world.doc.time * 58) * 0.18 + Math.sin(world.doc.time * 79) * 0.08;
    const outerLen = flight.thrusting ? 7.8 : 2.9;
    const coreLen = flight.thrusting ? 4.6 : 1.7;
    const outerW = flight.thrusting ? 1.15 : 0.68;
    const coreW = flight.thrusting ? 0.68 : 0.38;

    const tailOuterL = vec3Add(tL, vec3Scale(forward, -outerLen * fA));
    const tailOuterR = vec3Add(tR, vec3Scale(forward, -outerLen * fB));
    const tailCoreL = vec3Add(tL, vec3Scale(forward, -coreLen * fA));
    const tailCoreR = vec3Add(tR, vec3Scale(forward, -coreLen * fB));

    plumeOuterL.length = 0;
    plumeOuterR.length = 0;
    plumeCoreL.length = 0;
    plumeCoreR.length = 0;
    for (let k = 0; k < 5; k++) {
      const f = k / 4;
      plumeOuterL.push({ pos: vec3Lerp(tL, tailOuterL, f), age: f * 0.88, width: outerW * (1 - f * 0.62) });
      plumeOuterR.push({ pos: vec3Lerp(tR, tailOuterR, f), age: f * 0.88, width: outerW * (1 - f * 0.62) });
      plumeCoreL.push({ pos: vec3Lerp(tL, tailCoreL, f), age: f * 0.82, width: coreW * (1 - f * 0.7) });
      plumeCoreR.push({ pos: vec3Lerp(tR, tailCoreR, f), age: f * 0.82, width: coreW * (1 - f * 0.7) });
    }
  } else {
    plumeOuterL.length = 0;
    plumeOuterR.length = 0;
    plumeCoreL.length = 0;
    plumeCoreR.length = 0;
  }

  world.doc.ribbons = [
    { id: "contrail-l", points: trailL, color: [248, 252, 255], alpha: 0.78, emissive: false },
    { id: "contrail-r", points: trailR, color: [248, 252, 255], alpha: 0.78, emissive: false },
    ...(plumeOuterL.length > 1
      ? [
          { id: "plume-outer-l", points: plumeOuterL, color: [255, 96, 26] as [number, number, number], alpha: 0.96, emissive: true },
          { id: "plume-outer-r", points: plumeOuterR, color: [255, 96, 26] as [number, number, number], alpha: 0.96, emissive: true },
          { id: "plume-core-l", points: plumeCoreL, color: [255, 240, 128] as [number, number, number], alpha: 0.98, emissive: true },
          { id: "plume-core-r", points: plumeCoreR, color: [255, 240, 128] as [number, number, number], alpha: 0.98, emissive: true },
        ]
      : []),
  ];

  // Update 6-DOF Camera Rig (Overhead / Chase / Cockpit)
  const cam = world.doc.camera;
  cam.mode = flight.camMode;
  if (flight.camMode === "overhead") {
    const desiredPos: Vec3 = [flight.pos[0], flight.pos[1] + 58, flight.pos[2] + 18];
    const desiredTgt: Vec3 = [flight.pos[0] + forward[0] * 10, flight.pos[1] - 4, flight.pos[2] + forward[2] * 10];
    flight.camPosSmooth = vec3Lerp(flight.camPosSmooth, desiredPos, clamp(dt * 6, 0, 1));
    flight.camTargetSmooth = vec3Lerp(flight.camTargetSmooth, desiredTgt, clamp(dt * 8, 0, 1));
    flight.camUpSmooth = vec3Lerp(flight.camUpSmooth, [0, 0, -1], clamp(dt * 6, 0, 1));
    cam.fovDeg = 46;
  } else if (flight.camMode === "chase") {
    const chaseOffset = vec3Add(vec3Scale(forward, -16.5), vec3Scale([0, 1, 0], 5.2));
    const desiredPos = vec3Add(flight.pos, chaseOffset);
    const desiredTgt = vec3Add(flight.pos, vec3Scale(forward, 26));
    const bankedUp = vec3Lerp([0, 1, 0], upVec, 0.35);
    flight.camPosSmooth = vec3Lerp(flight.camPosSmooth, desiredPos, clamp(dt * 9, 0, 1));
    flight.camTargetSmooth = vec3Lerp(flight.camTargetSmooth, desiredTgt, clamp(dt * 11, 0, 1));
    flight.camUpSmooth = vec3Lerp(flight.camUpSmooth, bankedUp, clamp(dt * 6, 0, 1));
    cam.fovDeg = flight.thrusting ? 60 : 52;
  } else {
    // True 6-DOF Cockpit attached to semantic cockpitCam socket with full horizon roll!
    const cockPos = world.getSocketWorldPos("jet", "cockpitCam") ?? flight.pos;
    flight.camPosSmooth = cockPos;
    flight.camTargetSmooth = vec3Add(cockPos, vec3Scale(forward, 60));
    flight.camUpSmooth = upVec;
    cam.fovDeg = flight.thrusting ? 66 : 58;
  }
  cam.pos = flight.camPosSmooth;
  cam.target = flight.camTargetSmooth;
  cam.up = flight.camUpSmooth;
}

// 6. Diegetic Style-Aware 16-Bit Arcade / HD Cockpit HUD Overlay (Cockpit Mode)
function drawAnalogDial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  frac: number,
  label: string,
  warn = false,
): void {
  // Metallic outer bezel + dark CRT face
  ctx.fillStyle = "#313b4f";
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a111a";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Graduated tick marks around upper 250° arc
  const startA = Math.PI * 0.78;
  const sweepA = Math.PI * 1.44;
  for (let i = 0; i <= 8; i++) {
    const a = startA + (i / 8) * sweepA;
    const inner = i % 2 === 0 ? r - 5 : r - 3;
    ctx.strokeStyle = i >= 7 ? "#ff5a36" : "#7dd3fc";
    ctx.lineWidth = i % 2 === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    ctx.lineTo(x + Math.cos(a) * (r - 1.2), y + Math.sin(a) * (r - 1.2));
    ctx.stroke();
  }

  // Glowing arcade orange needle
  const nA = startA + clamp(frac, 0, 1) * sweepA;
  ctx.strokeStyle = warn ? "#ff3b1f" : "#ff8a24";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(nA) * (r - 4), y + Math.sin(nA) * (r - 4));
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(x, y, 2.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + r * 0.66);
}

function drawCockpitHud(): void {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (hudCanvas.width !== w || hudCanvas.height !== h) {
    hudCanvas.width = w;
    hudCanvas.height = h;
  }
  hudCtx.clearRect(0, 0, w, h);
  if (flight.camMode !== "cockpit") return;

  hudCtx.save();
  hudCtx.scale(dpr, dpr);
  const cw = rect.width;
  const ch = rect.height;
  const cx = cw * 0.5;
  const cy = ch * 0.42;
  const compact = cw < 640;
  const isArcade = world.doc.style === "arcade-8bit" || world.doc.style === "retro-raw";
  const hudCol = isArcade ? "rgba(74, 255, 198, 0.88)" : "rgba(116, 245, 224, 0.78)";
  const hudDim = isArcade ? "rgba(74, 255, 198, 0.34)" : "rgba(116, 245, 224, 0.25)";

  // 1. Translucent HUD Glass Visor + Top Compass Strip
  const visorW = compact ? 190 : 280;
  const visorH = compact ? 132 : 176;
  hudCtx.fillStyle = isArcade ? "rgba(18, 92, 86, 0.10)" : "rgba(38, 120, 128, 0.08)";
  hudCtx.strokeStyle = hudDim;
  hudCtx.lineWidth = 1.5;
  hudCtx.beginPath();
  hudCtx.moveTo(cx - visorW * 0.44, cy - visorH * 0.52);
  hudCtx.lineTo(cx + visorW * 0.44, cy - visorH * 0.52);
  hudCtx.lineTo(cx + visorW * 0.5, cy + visorH * 0.48);
  hudCtx.lineTo(cx - visorW * 0.5, cy + visorH * 0.48);
  hudCtx.closePath();
  hudCtx.fill();
  hudCtx.stroke();

  // Dynamic heading compass ribbon across top of HUD glass
  const headingDeg = (((-flight.yaw * 180) / Math.PI) % 360 + 360) % 360;
  const compY = cy - visorH * 0.38;
  hudCtx.save();
  hudCtx.beginPath();
  hudCtx.rect(cx - visorW * 0.38, compY - 14, visorW * 0.76, 24);
  hudCtx.clip();
  hudCtx.strokeStyle = hudCol;
  hudCtx.fillStyle = hudCol;
  hudCtx.lineWidth = 1.3;
  hudCtx.font = "700 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  hudCtx.textAlign = "center";
  const cardinals: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let d = -60; d <= 60; d += 15) {
    const tickDeg = Math.round((headingDeg + d) / 15) * 15;
    const normDeg = ((tickDeg % 360) + 360) % 360;
    const dx = ((tickDeg - headingDeg) / 60) * (visorW * 0.36);
    const tx = cx + dx;
    hudCtx.beginPath();
    hudCtx.moveTo(tx, compY + 2);
    hudCtx.lineTo(tx, compY + (normDeg % 45 === 0 ? 8 : 5));
    hudCtx.stroke();
    if (normDeg % 45 === 0) {
      hudCtx.fillText(cardinals[normDeg] ?? String(normDeg).padStart(3, "0"), tx, compY - 1);
    }
  }
  hudCtx.restore();
  // Compass center caret
  hudCtx.fillStyle = "#ff8a24";
  hudCtx.beginPath();
  hudCtx.moveTo(cx, compY + 9);
  hudCtx.lineTo(cx - 4, compY + 14);
  hudCtx.lineTo(cx + 4, compY + 14);
  hudCtx.closePath();
  hudCtx.fill();

  // Dynamic pitch/roll artificial horizon ladder
  hudCtx.save();
  hudCtx.beginPath();
  hudCtx.rect(cx - visorW * 0.44, cy - visorH * 0.28, visorW * 0.88, visorH * 0.72);
  hudCtx.clip();
  hudCtx.translate(cx, cy + 4);
  hudCtx.rotate(-flight.bank);
  hudCtx.strokeStyle = hudCol;
  hudCtx.fillStyle = hudCol;
  hudCtx.lineWidth = isArcade ? 2.0 : 1.6;
  const pShift = flight.pitch * 130;
  for (let i = -2; i <= 2; i++) {
    const y = pShift + i * 26;
    const len = i === 0 ? 48 : 22;
    hudCtx.beginPath();
    hudCtx.moveTo(-len - 18, y);
    hudCtx.lineTo(-18, y);
    if (i !== 0) {
      hudCtx.lineTo(-18, y + (i > 0 ? -5 : 5));
    }
    hudCtx.moveTo(18, y);
    hudCtx.lineTo(len + 18, y);
    if (i !== 0) {
      hudCtx.moveTo(18, y);
      hudCtx.lineTo(18, y + (i > 0 ? -5 : 5));
    }
    hudCtx.stroke();
  }
  hudCtx.restore();

  // Center boresight reticle + Speed/Alt numeric readouts
  hudCtx.save();
  hudCtx.shadowColor = "rgba(2, 24, 34, 0.65)";
  hudCtx.shadowBlur = 3;
  hudCtx.strokeStyle = hudCol;
  hudCtx.lineWidth = 2;
  hudCtx.beginPath();
  hudCtx.arc(cx, cy + 4, 9, 0, Math.PI * 2);
  hudCtx.moveTo(cx - 22, cy + 4);
  hudCtx.lineTo(cx - 12, cy + 4);
  hudCtx.moveTo(cx + 12, cy + 4);
  hudCtx.lineTo(cx + 22, cy + 4);
  hudCtx.stroke();

  hudCtx.font = `700 ${compact ? 11 : 13}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  hudCtx.fillStyle = hudCol;
  hudCtx.textAlign = "right";
  hudCtx.fillText(`SPD ${Math.round(flight.speed * 11)}`, cx - (compact ? 64 : 104), cy + 8);
  hudCtx.textAlign = "left";
  hudCtx.fillText(`ALT ${Math.round(flight.pos[1] * 42)}`, cx + (compact ? 64 : 104), cy + 8);
  hudCtx.restore();

  // 2. Curved Beveled Canopy Arch with Racing Orange Trim & Bolts
  const archR = Math.max(cw, ch) * 0.66;
  const archCy = ch * 0.99;
  hudCtx.strokeStyle = "#161c28";
  hudCtx.lineWidth = compact ? 16 : 26;
  hudCtx.beginPath();
  hudCtx.arc(cx, archCy, archR, Math.PI * 1.1, Math.PI * 1.9);
  hudCtx.stroke();
  hudCtx.strokeStyle = "#334155";
  hudCtx.lineWidth = 2;
  hudCtx.beginPath();
  hudCtx.arc(cx, archCy, archR - (compact ? 7 : 11), Math.PI * 1.12, Math.PI * 1.88);
  hudCtx.stroke();
  hudCtx.strokeStyle = "#ff542e";
  hudCtx.lineWidth = isArcade ? 4 : 3;
  hudCtx.beginPath();
  hudCtx.arc(cx, archCy, archR - (compact ? 9 : 14), Math.PI * 1.24, Math.PI * 1.76);
  hudCtx.stroke();

  // 3. Chunky 16-Bit Beveled Instrument Console Dashboard
  const dashH = compact ? 96 : 138;
  const dashY = ch - dashH;
  const consoleGrad = hudCtx.createLinearGradient(0, dashY, 0, ch);
  consoleGrad.addColorStop(0, "#2b3549");
  consoleGrad.addColorStop(0.16, "#1f2737");
  consoleGrad.addColorStop(1, "#121722");
  hudCtx.fillStyle = consoleGrad;
  hudCtx.beginPath();
  hudCtx.moveTo(0, ch);
  hudCtx.lineTo(0, dashY + 20);
  hudCtx.lineTo(cw * 0.14, dashY);
  hudCtx.lineTo(cw * 0.86, dashY);
  hudCtx.lineTo(cw, dashY + 20);
  hudCtx.lineTo(cw, ch);
  hudCtx.closePath();
  hudCtx.fill();

  // Crisp top metallic bevel highlight + rivets
  hudCtx.strokeStyle = "#4b5a78";
  hudCtx.lineWidth = 2.5;
  hudCtx.stroke();
  hudCtx.strokeStyle = "#0b0f18";
  hudCtx.lineWidth = 1.5;
  hudCtx.beginPath();
  hudCtx.moveTo(cw * 0.14 + 4, dashY + 5);
  hudCtx.lineTo(cw * 0.86 - 4, dashY + 5);
  hudCtx.stroke();

  // Rivet bolts along console rim
  const rivetXs = compact
    ? [cw * 0.18, cw * 0.34, cw * 0.66, cw * 0.82]
    : [cw * 0.17, cw * 0.29, cw * 0.42, cw * 0.58, cw * 0.71, cw * 0.83];
  for (const rx of rivetXs) {
    hudCtx.fillStyle = "#5b6d8f";
    hudCtx.beginPath();
    hudCtx.arc(rx, dashY + 10, 2.2, 0, Math.PI * 2);
    hudCtx.fill();
  }

  // 4. Center Attitude Ball (Artificial Horizon) + Orange Aircraft Wing Chevron
  const ballR = compact ? 28 : 39;
  const ballY = dashY + (compact ? 45 : 54);
  hudCtx.fillStyle = "#3a4760";
  hudCtx.beginPath();
  hudCtx.arc(cx, ballY, ballR + 4, 0, Math.PI * 2);
  hudCtx.fill();

  hudCtx.save();
  hudCtx.beginPath();
  hudCtx.arc(cx, ballY, ballR, 0, Math.PI * 2);
  hudCtx.clip();
  hudCtx.translate(cx, ballY);
  hudCtx.rotate(-flight.bank);
  const hy = flight.pitch * ballR * 1.15;
  hudCtx.fillStyle = isArcade ? "#1d8cf8" : "#3385d6";
  hudCtx.fillRect(-ballR * 2, -ballR * 2, ballR * 4, ballR * 2 + hy);
  hudCtx.fillStyle = isArcade ? "#b86b28" : "#9c6838";
  hudCtx.fillRect(-ballR * 2, hy, ballR * 4, ballR * 2);
  hudCtx.strokeStyle = "#f8fafc";
  hudCtx.lineWidth = 1.8;
  hudCtx.beginPath();
  hudCtx.moveTo(-ballR, hy);
  hudCtx.lineTo(ballR, hy);
  hudCtx.stroke();
  hudCtx.strokeStyle = "rgba(255,255,255,0.55)";
  hudCtx.lineWidth = 1.2;
  for (const off of [-14, -7, 7, 14]) {
    hudCtx.beginPath();
    hudCtx.moveTo(-10, hy + off);
    hudCtx.lineTo(10, hy + off);
    hudCtx.stroke();
  }
  hudCtx.restore();

  // Fixed center orange aircraft symbol over horizon ball
  hudCtx.strokeStyle = "#ff7824";
  hudCtx.lineWidth = 2.6;
  hudCtx.beginPath();
  hudCtx.moveTo(cx - 18, ballY);
  hudCtx.lineTo(cx - 6, ballY);
  hudCtx.lineTo(cx, ballY + 5);
  hudCtx.lineTo(cx + 6, ballY);
  hudCtx.lineTo(cx + 18, ballY);
  hudCtx.stroke();

  // 5. Left Live Rotating Green CRT Terrain Radar Minimap (29x29 desktop, 17x17 mobile!)
  const radS = compact ? 64 : 98;
  const rx = compact ? cx - ballR - radS - 18 : cx - 284;
  const ry = dashY + (compact ? 18 : 24);
  hudCtx.fillStyle = "#334155";
  hudCtx.fillRect(rx - 3, ry - 3, radS + 6, radS + 6);
  hudCtx.fillStyle = "#041a12";
  hudCtx.fillRect(rx, ry, radS, radS);

  const grid = compact ? 15 : 27;
  const cell = radS / grid;
  const halfG = (grid - 1) * 0.5;
  const stepW = compact ? 14 : 9.5;
  const cYaw = Math.cos(flight.yaw);
  const sYaw = Math.sin(flight.yaw);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const lx = (gx - halfG) * stepW;
      const lz = (gy - halfG) * stepW;
      const wx = flight.pos[0] + lx * cYaw + lz * sYaw;
      const wz = flight.pos[2] - lx * sYaw + lz * cYaw;
      const th = world.sampleTerrainHeight(wx, wz);
      if (th > 0.15) {
        hudCtx.fillStyle = th > 9 ? "#6ee7b7" : th > 4 ? "#34d399" : "#059669";
        hudCtx.fillRect(rx + gx * cell, ry + gy * cell, cell + 0.35, cell + 0.35);
      }
    }
  }
  // Radar range ring + rotating sweep line
  const radCx = rx + radS * 0.5;
  const radCy = ry + radS * 0.5;
  hudCtx.strokeStyle = "rgba(52, 211, 153, 0.32)";
  hudCtx.lineWidth = 1;
  hudCtx.beginPath();
  hudCtx.arc(radCx, radCy, radS * 0.34, 0, Math.PI * 2);
  hudCtx.moveTo(rx, radCy);
  hudCtx.lineTo(rx + radS, radCy);
  hudCtx.moveTo(radCx, ry);
  hudCtx.lineTo(radCx, ry + radS);
  hudCtx.stroke();

  const sweepAng = (world.doc.time * 2.4) % (Math.PI * 2);
  hudCtx.strokeStyle = "rgba(110, 255, 200, 0.65)";
  hudCtx.lineWidth = 1.5;
  hudCtx.beginPath();
  hudCtx.moveTo(radCx, radCy);
  hudCtx.lineTo(radCx + Math.cos(sweepAng) * radS * 0.46, radCy + Math.sin(sweepAng) * radS * 0.46);
  hudCtx.stroke();

  // Plot nearby sky-gate blips on radar
  hudCtx.fillStyle = "#38bdf8";
  for (let i = 0; i < gateCoords.length; i++) {
    const g = world.getEntity(`gate-${i}`);
    if (!g) continue;
    const dx = g.pos[0] - flight.pos[0];
    const dz = g.pos[2] - flight.pos[2];
    const lx = dx * cYaw - dz * sYaw;
    const lz = dx * sYaw + dz * cYaw;
    const px = radCx + (lx / (halfG * stepW)) * (radS * 0.48);
    const py = radCy + (lz / (halfG * stepW)) * (radS * 0.48);
    if (px > rx + 3 && px < rx + radS - 3 && py > ry + 3 && py < ry + radS - 3) {
      hudCtx.fillRect(px - 2, py - 2, 4, 4);
    }
  }
  // Yellow player chevron in center of radar
  hudCtx.fillStyle = "#fde047";
  hudCtx.beginPath();
  hudCtx.moveTo(radCx, radCy - 4);
  hudCtx.lineTo(radCx - 3.5, radCy + 3.5);
  hudCtx.lineTo(radCx + 3.5, radCy + 3.5);
  hudCtx.closePath();
  hudCtx.fill();

  // 6. Four Analog Dials + Toggle Switches + Status LEDs (Desktop & Tablet >= 640px)
  if (!compact) {
    const dialR = 23;
    const spdFrac = clamp((flight.speed - 20) / 52, 0, 1);
    const altFrac = clamp(flight.pos[1] / 62, 0, 1);
    const thrFrac = flight.thrusting ? 0.94 : 0.42;
    const bankFrac = clamp(0.5 + flight.bank * 0.45, 0, 1);

    drawAnalogDial(hudCtx, cx - 140, dashY + 46, dialR, spdFrac, "SPD", flight.thrusting);
    drawAnalogDial(hudCtx, cx - 82, dashY + 46, dialR, altFrac, "ALT", flight.pos[1] < 10);
    drawAnalogDial(hudCtx, cx + 82, dashY + 46, dialR, thrFrac, "THR", flight.thrusting);
    drawAnalogDial(hudCtx, cx + 140, dashY + 46, dialR, bankFrac, "BNK", false);

    // Chunky toggle switches & glowing AB warning lamp beneath dials
    const swY = dashY + 94;
    for (let s = 0; s < 3; s++) {
      const sx = cx - 148 + s * 28;
      hudCtx.fillStyle = "#0f172a";
      hudCtx.fillRect(sx - 6, swY - 8, 12, 18);
      hudCtx.fillStyle = s === 0 && flight.thrusting ? "#ff542e" : "#cbd5e1";
      hudCtx.fillRect(sx - 3, s % 2 === 0 ? swY - 5 : swY + 1, 6, 6);
    }
    // Glowing orange Afterburner indicator lamp
    const abX = cx + 112;
    hudCtx.fillStyle = flight.thrusting ? "#ff6b1a" : "#3b2316";
    hudCtx.fillRect(abX - 28, swY - 7, 56, 16);
    hudCtx.strokeStyle = "#475569";
    hudCtx.lineWidth = 1.5;
    hudCtx.strokeRect(abX - 28, swY - 7, 56, 16);
    hudCtx.fillStyle = flight.thrusting ? "#fff7ed" : "#9a6b52";
    hudCtx.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    hudCtx.textAlign = "center";
    hudCtx.fillText(flight.thrusting ? "AB BOOST" : "AB STBY", abX, swY + 4);
  }

  // 7. Right Top-Down Pixel-Art Fighter Jet Status MFD + Segmented Bar Gauges
  const mfdW = compact ? 64 : 104;
  const mfdH = compact ? 64 : 98;
  const mx = compact ? cx + ballR + 18 : cx + 184;
  const my = dashY + (compact ? 18 : 24);
  hudCtx.fillStyle = "#334155";
  hudCtx.fillRect(mx - 3, my - 3, mfdW + 6, mfdH + 6);
  hudCtx.fillStyle = "#041a12";
  hudCtx.fillRect(mx, my, mfdW, mfdH);
  hudCtx.strokeStyle = "rgba(52, 211, 153, 0.35)";
  hudCtx.lineWidth = 1;
  hudCtx.strokeRect(mx + 2, my + 2, mfdW - 4, mfdH - 4);

  // Top-down green wireframe/pixel fighter jet icon inside MFD
  const jx = mx + (compact ? 22 : 38);
  const jy = my + (compact ? 35 : 52);
  const js = compact ? 0.62 : 1.0;
  hudCtx.fillStyle = "#34d399";
  hudCtx.beginPath();
  hudCtx.moveTo(jx, jy - 22 * js); // nose
  hudCtx.lineTo(jx + 5 * js, jy - 6 * js);
  hudCtx.lineTo(jx + 20 * js, jy + 8 * js); // right wingtip
  hudCtx.lineTo(jx + 18 * js, jy + 13 * js);
  hudCtx.lineTo(jx + 6 * js, jy + 10 * js);
  hudCtx.lineTo(jx + 10 * js, jy + 19 * js); // tail
  hudCtx.lineTo(jx - 10 * js, jy + 19 * js);
  hudCtx.lineTo(jx - 6 * js, jy + 10 * js);
  hudCtx.lineTo(jx - 18 * js, jy + 13 * js);
  hudCtx.lineTo(jx - 20 * js, jy + 8 * js); // left wingtip
  hudCtx.lineTo(jx - 5 * js, jy - 6 * js);
  hudCtx.closePath();
  hudCtx.fill();
  // Thruster glow dots on MFD jet
  hudCtx.fillStyle = flight.thrusting ? "#ff7824" : "#fde047";
  hudCtx.fillRect(jx - 6 * js, jy + 19 * js, 4 * js, (flight.thrusting ? 7 : 3) * js);
  hudCtx.fillRect(jx + 2 * js, jy + 19 * js, 4 * js, (flight.thrusting ? 7 : 3) * js);

  // Segmented twin thruster / speed vertical gauges
  const segs = 8;
  const activeSegs = flight.thrusting ? 8 : 4;
  const gx = mx + mfdW - (compact ? 16 : 24);
  const gyBase = my + mfdH - 10;
  const segH = compact ? 4.5 : 7.5;
  for (let i = 0; i < segs; i++) {
    const lit = i < activeSegs;
    hudCtx.fillStyle = !lit ? "#0d3326" : i >= 6 ? "#ff6b1a" : i >= 4 ? "#facc15" : "#34d399";
    hudCtx.fillRect(gx, gyBase - i * (segH + 1.8) - segH, compact ? 10 : 15, segH);
  }
  hudCtx.fillStyle = "#6ee7b7";
  hudCtx.font = `700 ${compact ? 8 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  hudCtx.textAlign = "left";
  hudCtx.fillText(`G:${flight.score}`, mx + 6, my + (compact ? 12 : 15));

  // 8. Live Tilting Center Fighter Yoke / Control Stick!
  const stickBaseY = ch + 6;
  const stickDx = clamp(flight.bank * 32, -30, 30);
  const stickDy = clamp(-flight.pitch * 24, -18, 18);
  const gripX = cx + stickDx;
  const gripY = ch - (compact ? 22 : 34) + stickDy;

  // Rubber bellows boot
  hudCtx.fillStyle = "#0e131c";
  hudCtx.beginPath();
  hudCtx.ellipse(cx, ch - 2, compact ? 22 : 30, compact ? 10 : 14, 0, Math.PI, Math.PI * 2);
  hudCtx.fill();
  // Tilting metal shaft
  hudCtx.strokeStyle = "#475569";
  hudCtx.lineWidth = compact ? 8 : 11;
  hudCtx.lineCap = "round";
  hudCtx.beginPath();
  hudCtx.moveTo(cx, stickBaseY);
  hudCtx.lineTo(gripX, gripY);
  hudCtx.stroke();
  // Contoured flight grip handle + orange trigger cap
  hudCtx.fillStyle = "#1e293b";
  hudCtx.strokeStyle = "#64748b";
  hudCtx.lineWidth = 2;
  hudCtx.beginPath();
  hudCtx.roundRect(gripX - (compact ? 11 : 15), gripY - (compact ? 12 : 16), compact ? 22 : 30, compact ? 22 : 28, 7);
  hudCtx.fill();
  hudCtx.stroke();
  // Blazing orange arcade fire button on stick top
  hudCtx.fillStyle = flight.thrusting ? "#ff3b1f" : "#ff6b1a";
  hudCtx.beginPath();
  hudCtx.arc(gripX, gripY - (compact ? 5 : 7), compact ? 4.5 : 5.5, 0, Math.PI * 2);
  hudCtx.fill();

  hudCtx.restore();
}

// 7. Main Loop with content-visibility & visibilitychange Power Conservation
let pausedByVis = false;
let rafId = 0;
let lastNow = performance.now();
let uiTick = 0;

function frame(now: number): void {
  rafId = 0;
  if (pausedByVis) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
  lastNow = now;

  stepSimulation(dt);
  renderer.render(world);
  drawCockpitHud();

  uiTick++;
  if ((uiTick & 7) === 0) {
    const st = renderer.getStats();
    statsBar.textContent =
      `${st.fps} fps · ${st.frameMs.toFixed(1)} ms · ${st.drawCalls} dc · ` +
      `${st.canvasWidth}×${st.canvasHeight} (DRS ${st.drsScale}) · ${st.isMobile ? "Mobile" : "Desktop"} · Gates: ${flight.score}`;
    if (inspectorDrawer.classList.contains("open")) {
      irPreview.textContent = JSON.stringify(
        {
          telemetry: st,
          camera: world.doc.camera.mode,
          style: world.doc.style,
          aaMode: world.doc.aaMode,
          splitCompare: world.doc.splitCompare,
          entities: world.doc.entities.length,
          jetSockets: Object.keys(jetAsset.sockets),
        },
        null,
        2,
      );
    }
  }

  rafId = requestAnimationFrame(frame);
}

function resume(): void {
  pausedByVis = false;
  lastNow = performance.now();
  if (!rafId) rafId = requestAnimationFrame(frame);
}
function pause(): void {
  pausedByVis = true;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

stage.addEventListener("contentvisibilityautostatechange", (e) => {
  if ((e as Event & { skipped?: boolean }).skipped) pause();
  else resume();
});
if (!("contentVisibility" in document.documentElement.style)) {
  new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) resume();
      else pause();
    },
    { rootMargin: "200px" },
  ).observe(stage);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
  else resume();
});

// Expose live engine handle for AI/console scripting & automated visual verification!
(window as unknown as Record<string, unknown>).__AASTACK__ = {
  world,
  renderer,
  flight,
  applyPatch: (ops: Parameters<SceneWorld["applyPatch"]>[0]) => {
    world.applyPatch(ops);
    syncControlsUI();
  },
  setCameraMode: (m: CameraMode) => {
    flight.camMode = m;
    syncControlsUI();
  },
  setStyle: (s: RenderStyle) => {
    applyRenderStyle(s);
  },
  setThrust: (on: boolean) => {
    flight.forceThrust = on;
  },
  toggleSplit: toggleSplitCompare,
};

syncControlsUI();
resume();
