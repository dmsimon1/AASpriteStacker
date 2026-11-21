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
import type { AAMode, CameraMode, RibbonPoint, Vec3 } from "@aastack/core";
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
const modeBtn = document.getElementById("modeBtn") as HTMLButtonElement;
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
  camMode: "chase" as CameraMode,
  camPosSmooth: [0, 38, 22] as Vec3,
  camTargetSmooth: [0, 30, -20] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,
  score: 0,
  lastGateHit: -1,
};

const trailL: RibbonPoint[] = [];
const trailR: RibbonPoint[] = [];
const plumeL: RibbonPoint[] = [];
const plumeR: RibbonPoint[] = [];

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

const AA_CYCLE: AAMode[] = ["voxel-dda", "smooth-sdf", "legacy"];
function cycleAAMode(): void {
  const cur = world.doc.splitCompare.enabled ? world.doc.splitCompare.rightMode : world.doc.aaMode;
  const next = AA_CYCLE[(AA_CYCLE.indexOf(cur) + 1) % AA_CYCLE.length];
  if (world.doc.splitCompare.enabled) {
    world.applyPatch([{ op: "set", path: "splitCompare.rightMode", value: next }]);
  } else {
    world.applyPatch([{ op: "set", path: "aaMode", value: next }]);
  }
  syncControlsUI();
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
  world.applyPatch([
    {
      op: "set",
      path: "splitCompare",
      value: {
        enabled: next,
        splitX: world.doc.splitCompare.splitX || 0.5,
        leftMode: "legacy",
        rightMode: world.doc.aaMode === "legacy" ? "voxel-dda" : world.doc.aaMode,
      },
    },
  ]);
  syncControlsUI();
}

function labelForMode(m: AAMode): string {
  if (m === "legacy") return "Legacy 1×";
  if (m === "smooth-sdf") return "AA Smooth SDF";
  return "AA Voxel DDA";
}

function syncControlsUI(): void {
  const camLabels: Record<string, string> = { overhead: "Overhead", chase: "Chase", cockpit: "Cockpit" };
  camBtn.textContent = `Cam: ${camLabels[flight.camMode] ?? flight.camMode}`;

  const activeMode = world.doc.splitCompare.enabled ? world.doc.splitCompare.rightMode : world.doc.aaMode;
  modeBtn.textContent = labelForMode(activeMode);
  splitBtn.setAttribute("aria-pressed", String(world.doc.splitCompare.enabled));
  todBtn.textContent = TOD_PRESETS[todIdx].label;

  splitOverlay.classList.toggle("visible", world.doc.splitCompare.enabled);
  splitHandle.style.left = `${(world.doc.splitCompare.splitX * 100).toFixed(1)}%`;
  tagLeft.textContent = labelForMode(world.doc.splitCompare.leftMode);
  tagRight.textContent = `${labelForMode(world.doc.splitCompare.rightMode)} · ${world.doc.samples}×`;

  stage.classList.toggle("cockpit-mode", flight.camMode === "cockpit");
  const isCompact = renderer.isMobile || window.innerWidth < 760;
  if (isCompact) {
    hintBar.textContent = "Drag left to steer · BOOST · ROLL · CAM";
  } else if (flight.camMode === "overhead") {
    hintBar.textContent = "Move mouse / WASD to steer · Click: barrel roll · Hold Space/Shift: thrust · V: Chase view";
  } else if (flight.camMode === "chase") {
    hintBar.textContent = "Point / WASD to turn, climb & dive · Click: roll · Hold mouse/Shift: thrusters · V: Cockpit";
  } else {
    hintBar.textContent = "Cockpit View · Point / WASD to fly · Click: roll · Hold mouse/Shift: thrusters · V: Overhead";
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
  }
});
window.addEventListener("keyup", (e) => input.keys.delete(e.code));

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
modeBtn.addEventListener("click", cycleAAMode);
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

  updateTrail(trailL, wL, 0.45, flight.thrusting ? 0.52 : 0.34, 72);
  updateTrail(trailR, wR, 0.45, flight.thrusting ? 0.52 : 0.34, 72);

  if (flight.thrusting && tL && tR) {
    const flicker = 0.85 + Math.sin(world.doc.time * 48) * 0.25;
    const backTailL = vec3Add(tL, vec3Scale(forward, -6.5 * flicker));
    const backTailR = vec3Add(tR, vec3Scale(forward, -6.5 * flicker));
    plumeL.length = 0;
    plumeR.length = 0;
    for (let k = 0; k < 5; k++) {
      const f = k / 4;
      plumeL.push({ pos: vec3Lerp(tL, backTailL, f), age: f * 0.9, width: 0.95 * (1 - f * 0.65) });
      plumeR.push({ pos: vec3Lerp(tR, backTailR, f), age: f * 0.9, width: 0.95 * (1 - f * 0.65) });
    }
  } else {
    plumeL.length = 0;
    plumeR.length = 0;
  }

  world.doc.ribbons = [
    { id: "contrail-l", points: trailL, color: [242, 248, 255], alpha: 0.68, emissive: false },
    { id: "contrail-r", points: trailR, color: [242, 248, 255], alpha: 0.68, emissive: false },
    ...(plumeL.length > 1
      ? [
          { id: "plume-l", points: plumeL, color: [255, 188, 62] as [number, number, number], alpha: 0.95, emissive: true },
          { id: "plume-r", points: plumeR, color: [255, 188, 62] as [number, number, number], alpha: 0.95, emissive: true },
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

// 6. Diegetic Anti-Aliased Cockpit HUD Overlay (Cockpit Mode)
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
  const cy = ch * 0.44;
  const compact = cw < 640;

  // Translucent cyan-green HUD glass reticle & dynamic pitch/roll artificial horizon
  hudCtx.save();
  hudCtx.translate(cx, cy);
  hudCtx.rotate(-flight.bank);
  hudCtx.strokeStyle = "rgba(105, 250, 220, 0.72)";
  hudCtx.fillStyle = "rgba(105, 250, 220, 0.85)";
  hudCtx.lineWidth = 1.6;
  const pShift = flight.pitch * 120;
  for (let i = -2; i <= 2; i++) {
    const y = pShift + i * 28;
    const len = i === 0 ? 52 : 24;
    hudCtx.beginPath();
    hudCtx.moveTo(-len - 18, y); hudCtx.lineTo(-18, y);
    hudCtx.moveTo(18, y); hudCtx.lineTo(len + 18, y);
    hudCtx.stroke();
  }
  hudCtx.restore();

  // Center boresight & numeric speed/altitude tapes
  hudCtx.strokeStyle = "rgba(105, 250, 220, 0.88)";
  hudCtx.lineWidth = 1.8;
  hudCtx.beginPath();
  hudCtx.arc(cx, cy, 10, 0, Math.PI * 2);
  hudCtx.moveTo(cx - 22, cy); hudCtx.lineTo(cx - 12, cy);
  hudCtx.moveTo(cx + 12, cy); hudCtx.lineTo(cx + 22, cy);
  hudCtx.stroke();

  hudCtx.font = `600 ${compact ? 11 : 13}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  hudCtx.fillStyle = "rgba(120, 255, 225, 0.9)";
  hudCtx.textAlign = "right";
  hudCtx.fillText(`SPD ${Math.round(flight.speed * 11)}`, cx - (compact ? 72 : 120), cy + 4);
  hudCtx.textAlign = "left";
  hudCtx.fillText(`ALT ${Math.round(flight.pos[1] * 42)}`, cx + (compact ? 72 : 120), cy + 4);

  // Curved canopy arch frame
  hudCtx.strokeStyle = "#1c222e";
  hudCtx.lineWidth = compact ? 14 : 22;
  hudCtx.beginPath();
  hudCtx.arc(cx, ch * 0.98, Math.max(cw, ch) * 0.66, Math.PI * 1.12, Math.PI * 1.88);
  hudCtx.stroke();
  hudCtx.strokeStyle = "#e84a30";
  hudCtx.lineWidth = 3;
  hudCtx.beginPath();
  hudCtx.arc(cx, ch * 0.98, Math.max(cw, ch) * 0.66 - (compact ? 8 : 12), Math.PI * 1.24, Math.PI * 1.76);
  hudCtx.stroke();

  // Bottom instrument dashboard (scaled cleanly for both mobile & desktop!)
  const dashH = compact ? 86 : 118;
  const dashY = ch - dashH;
  hudCtx.fillStyle = "#1d2432";
  hudCtx.beginPath();
  hudCtx.moveTo(0, ch);
  hudCtx.lineTo(0, dashY + 18);
  hudCtx.lineTo(cw * 0.16, dashY);
  hudCtx.lineTo(cw * 0.84, dashY);
  hudCtx.lineTo(cw, dashY + 18);
  hudCtx.lineTo(cw, ch);
  hudCtx.closePath();
  hudCtx.fill();
  hudCtx.strokeStyle = "#364158";
  hudCtx.lineWidth = 2;
  hudCtx.stroke();

  // Center Attitude Ball (live pitch + bank!)
  const ballR = compact ? 28 : 38;
  const ballY = dashY + dashH * 0.52;
  hudCtx.save();
  hudCtx.beginPath();
  hudCtx.arc(cx, ballY, ballR, 0, Math.PI * 2);
  hudCtx.clip();
  hudCtx.translate(cx, ballY);
  hudCtx.rotate(-flight.bank);
  const hy = flight.pitch * ballR * 1.1;
  hudCtx.fillStyle = "#3385d6";
  hudCtx.fillRect(-ballR * 2, -ballR * 2, ballR * 4, ballR * 2 + hy);
  hudCtx.fillStyle = "#9c6838";
  hudCtx.fillRect(-ballR * 2, hy, ballR * 4, ballR * 2);
  hudCtx.strokeStyle = "#fff";
  hudCtx.lineWidth = 1.5;
  hudCtx.beginPath();
  hudCtx.moveTo(-ballR, hy); hudCtx.lineTo(ballR, hy);
  hudCtx.stroke();
  hudCtx.restore();
  hudCtx.strokeStyle = "#64748b";
  hudCtx.lineWidth = 2.5;
  hudCtx.beginPath();
  hudCtx.arc(cx, ballY, ballR, 0, Math.PI * 2);
  hudCtx.stroke();

  // Left live Terrain Radar Minimap (reads exact CPU/GPU-matched heightfield!)
  if (!compact) {
    const radS = 78;
    const rx = cx - 186;
    const ry = dashY + 20;
    hudCtx.fillStyle = "#081c16";
    hudCtx.fillRect(rx, ry, radS, radS);
    const grid = 15;
    const cell = radS / grid;
    const cYaw = Math.cos(flight.yaw), sYaw = Math.sin(flight.yaw);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const lx = (gx - 7) * 14;
        const lz = (gy - 7) * 14;
        const wx = flight.pos[0] + lx * cYaw + lz * sYaw;
        const wz = flight.pos[2] - lx * sYaw + lz * cYaw;
        const th = world.sampleTerrainHeight(wx, wz);
        if (th > 0.2) {
          hudCtx.fillStyle = th > 6 ? "#34d399" : "#10b981";
          hudCtx.fillRect(rx + gx * cell, ry + gy * cell, cell + 0.4, cell + 0.4);
        }
      }
    }
    hudCtx.strokeStyle = "rgba(52, 211, 153, 0.45)";
    hudCtx.lineWidth = 1;
    hudCtx.strokeRect(rx, ry, radS, radS);
    hudCtx.fillStyle = "#fbbf24";
    hudCtx.fillRect(rx + radS * 0.5 - 2, ry + radS * 0.5 - 2, 4, 4);

    // Right thruster & gate status MFD
    const mx = cx + 108;
    hudCtx.fillStyle = "#081c16";
    hudCtx.fillRect(mx, ry, radS, radS);
    hudCtx.strokeStyle = "rgba(52, 211, 153, 0.45)";
    hudCtx.strokeRect(mx, ry, radS, radS);
    hudCtx.fillStyle = "#34d399";
    hudCtx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    hudCtx.fillText(`GATES ${flight.score}`, mx + 8, ry + 20);
    hudCtx.fillText(flight.thrusting ? "AB: ON" : "AB: IDLE", mx + 8, ry + 38);
    // Thruster bar
    const barH = flight.thrusting ? 46 : 22;
    hudCtx.fillStyle = flight.thrusting ? "#f59e0b" : "#10b981";
    hudCtx.fillRect(mx + 56, ry + 68 - barH, 12, barH);
  }

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
  toggleSplit: toggleSplitCompare,
};

syncControlsUI();
resume();
