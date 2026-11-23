/**
 * Airwolf Midnight Pixel City (@aastack/core).
 * Original playable 6-DOF & 2.5D anti-aliased sprite-stacking helicopter showcase:
 *  - 28-layer articulated Airwolf (Bell 222A) with independently spinning main & tail rotors
 *  - Real 6-DOF helicopter physics + Supersonic Turbo Boost (Shift) + Rooftop H Helipad landing
 *  - Real-time volumetric nose searchlight cone + exact 3D voxel-DDA building raycast + Bayer-dithered ground pool
 *  - Exploded 28-Layer Assembly Mode (X) rendering all 28 separated slices in 1 WebGL2 instanced draw call via sliceClip
 *  - Live A/B Split (Classic 1x Nearest vs AASpriteStacker 8x RGSS AA) + Eco 2x / Bal 4x / Ultra 8x runtime quality toggle
 */

import {
  AASpriteRenderer,
  SceneWorld,
  clamp,
  lerp,
  quatFromYawPitchRoll,
  quatIdentity,
  vec3Add,
  vec3Norm,
  vec3Scale,
  vec3Sub,
  type AAQuality,
  type EntityState,
  type RibbonPoint,
  type Vec3,
} from "@aastack/core";
import {
  createAirwolfFuselageAsset,
  createCityCarAsset,
  createHelipadTowerAsset,
  createLightProxyAsset,
  createLighthouseAsset,
  createMainRotorAsset,
  createParkTreeAsset,
  createStreetLampAsset,
  createTailRotorAsset,
  createTowerAsset,
} from "./assets.js";
import { CITY_GROUND_FS } from "./city-ground-shader.js";

type CamMode = "iso" | "chase" | "orbit";
type TodPreset = "night" | "sunset" | "day";

const HELIPAD_POS: Vec3 = [-13, 13.64, -12];
const LIGHTHOUSE_POS: Vec3 = [0, 0, -73];
const LIGHTHOUSE_BEACON_POS: Vec3 = [0, 26 * 0.58, -73];
const AIRWOLF_SCALE = 0.76;
const SLICE_COUNT = 28;

// ---------------------------------------------------------------------------
// 1. Parse URL Query Parameters (deterministic visual QA & deep-links)
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const noHud = params.get("nohud") === "1";
const holdLoop = params.get("hold") === "1";

if (noHud) document.body.classList.add("nohud");

// ---------------------------------------------------------------------------
// 2. Initialize WebGL2 AASpriteRenderer + Midnight Pixel City SceneWorld
// ---------------------------------------------------------------------------
const canvas = document.getElementById("c") as HTMLCanvasElement;
const initQuality = (params.get("quality") as AAQuality | null) ?? "ultra";

const renderer = new AASpriteRenderer(canvas, {
  background: "terrain",
  terrainShader: CITY_GROUND_FS,
  quality: initQuality,
  instanceBatching: "aggressive",
  adaptiveDpr: !holdLoop,
  maxDpr: initQuality === "ultra" ? 2.0 : 1.5,
  preserveDrawingBuffer: true,
});

const world = new SceneWorld({
  seed: 42,
  style: "arcade-8bit",
  aaMode: "voxel-dda",
  samples: initQuality === "eco" ? 2 : initQuality === "balanced" ? 4 : 8,
  camera: {
    mode: "free",
    pos: [28, 36, 46],
    target: [0, 12, 8],
    up: [0, 1, 0],
    fovDeg: 44,
    orthoSize: 28,
    near: 0.4,
    far: 620,
  },
  lighting: {
    sunAzimuthDeg: 34,
    sunElevationDeg: 42,
    timeOfDay: 0.94,
    fogDensity: 0.24,
    shadeStyle: "toon-aa",
    outlineWidth: 0.88,
    selfShadow: true,
  },
  terrain: {
    enabled: true,
    seed: 42,
    maxHeight: 0,
    scale: 0.01,
    waveTime: 0,
    terraceSteps: 0,
  },
  splitCompare: {
    enabled: false,
    splitX: 0.5,
    leftMode: "legacy",
    rightMode: "voxel-dda",
  },
});

// ---------------------------------------------------------------------------
// 3. Register Procedural Voxel Assets
// ---------------------------------------------------------------------------
world.registerAsset(createAirwolfFuselageAsset());
world.registerAsset(createMainRotorAsset());
world.registerAsset(createTailRotorAsset());
world.registerAsset(createLightProxyAsset());
world.registerAsset(createHelipadTowerAsset());
world.registerAsset(createLighthouseAsset());
world.registerAsset(createStreetLampAsset());
world.registerAsset(createParkTreeAsset());

// 6 varied skyline tower blueprints (hardware-instanced across all city blocks)
world.registerAsset(createTowerAsset("tower_tall_office", 18, 18, 34, 11, "office"));
world.registerAsset(createTowerAsset("tower_mid_office", 20, 16, 26, 23, "office"));
world.registerAsset(createTowerAsset("tower_neon_hotel", 20, 18, 28, 37, "neon"));
world.registerAsset(createTowerAsset("tower_brick_lofts", 18, 18, 20, 51, "brick"));
world.registerAsset(createTowerAsset("tower_waterfront", 18, 16, 16, 67, "office"));
world.registerAsset(createTowerAsset("tower_neon_low", 16, 16, 18, 83, "neon"));

// 3 midnight street car liveries
world.registerAsset(createCityCarAsset("car_crimson", [218, 54, 62]));
world.registerAsset(createCityCarAsset("car_taxi", [244, 196, 46]));
world.registerAsset(createCityCarAsset("car_cyan", [74, 178, 224]));

// ---------------------------------------------------------------------------
// 4. Populate Midnight City, Harbor Pier, Streetlamps, Park Trees, Cars & Airwolf
// ---------------------------------------------------------------------------
const initialEntities: EntityState[] = [];

// Shadow-caster slot 0 (ALWAYS present): Airwolf drop shadow onto streets & bay
initialEntities.push({
  id: "heli_shadow_proxy",
  assetId: "light_proxy",
  pos: [10, 18, 18],
  rot: quatIdentity(),
  scale: 3.6,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Shadow-caster slot 1 (ALWAYS present): Airwolf nose searchlight live ground hit pool
initialEntities.push({
  id: "searchlight_spot",
  assetId: "light_proxy",
  pos: [10, 0.2, 6],
  rot: quatIdentity(),
  scale: 4.8,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Hero 28-slice Airwolf Bell 222A Fuselage
initialEntities.push({
  id: "airwolf",
  assetId: "airwolf_hull",
  pos: [10, 18, 18],
  rot: quatIdentity(),
  scale: AIRWOLF_SCALE,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.55,
  castShadow: false,
  visible: true,
  tag: "player",
});

// Articulated Main & Tail Rotors attached via semantic sockets
initialEntities.push({
  id: "airwolf_main_rotor",
  assetId: "airwolf_main_rotor",
  pos: [0, 0, 0],
  rot: quatIdentity(),
  scale: 1.0,
  parentId: "airwolf",
  parentSocket: "mainRotor",
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.4,
  castShadow: false,
  visible: true,
  tag: "player",
});

initialEntities.push({
  id: "airwolf_tail_rotor",
  assetId: "airwolf_tail_rotor",
  pos: [0, 0, 0],
  rot: quatIdentity(),
  scale: 1.0,
  parentId: "airwolf",
  parentSocket: "tailRotor",
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.4,
  castShadow: false,
  visible: true,
  tag: "player",
});

// 28 single-slice instanced entities for Exploded 28-Layer Assembly Mode (1 WebGL2 instanced draw call!)
for (let z = 0; z < SLICE_COUNT; z++) {
  initialEntities.push({
    id: `airwolf_s${z}`,
    assetId: "airwolf_hull",
    pos: [0, 0, 0],
    rot: quatIdentity(),
    scale: 1.0,
    parentId: "airwolf",
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.55,
    sliceClip: [z / SLICE_COUNT, (z + 1) / SLICE_COUNT],
    castShadow: false,
    visible: false,
    tag: "player_slice",
  });
}

// Corporate HQ Helipad Tower at (-13, 0, -12)
initialEntities.push({
  id: "tower_hq_helipad",
  assetId: "tower_helipad",
  pos: [-13, 0, -12],
  rot: quatIdentity(),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.45,
  tag: "building",
});

// Iconic Red-and-White Coastal Lighthouse at end of harbor pier (0, 0, 72)
initialEntities.push({
  id: "coastal_lighthouse",
  assetId: "coastal_lighthouse",
  pos: LIGHTHOUSE_POS,
  rot: quatIdentity(),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.85,
  tag: "landmark",
});

// Skyline block specs aligned cleanly between avenues (X = -26, 0, 26; Z = -24, 0, 24)
// North harbor row (Z = -36) steps down near Central Ave so the stone pier & Coastal Lighthouse shine cleanly!
const BLOCK_BUILDINGS: Array<{ id: string; asset: string; x: number; z: number; yawDeg: number; halfW: number; halfL: number; topY: number }> = [
  // North harbor waterfront row (Z = -36) — low stepped waterfront framing the North Pier & Coastal Lighthouse!
  { id: "b_nw", asset: "tower_brick_lofts", x: -39, z: -36, yawDeg: 0, halfW: 6.0, halfL: 6.0, topY: 20 * 0.62 },
  { id: "b_n1", asset: "tower_waterfront", x: -13, z: -36, yawDeg: 90, halfW: 6.0, halfL: 5.4, topY: 16 * 0.62 },
  { id: "b_n2", asset: "tower_neon_low", x: 13, z: -36, yawDeg: 180, halfW: 5.4, halfL: 5.4, topY: 18 * 0.62 },
  { id: "b_ne", asset: "tower_mid_office", x: 39, z: -36, yawDeg: 0, halfW: 6.5, halfL: 5.5, topY: 26 * 0.62 },
  // Mid-north row (Z = -12) — note (-13, -12) is HQ Helipad Tower!
  { id: "b_w1", asset: "tower_mid_office", x: -39, z: -12, yawDeg: 90, halfW: 5.5, halfL: 6.5, topY: 26 * 0.62 },
  { id: "b_c1", asset: "tower_tall_office", x: 13, z: -12, yawDeg: 0, halfW: 6.0, halfL: 6.0, topY: 34 * 0.62 },
  { id: "b_e1", asset: "tower_tall_office", x: 39, z: -12, yawDeg: 270, halfW: 6.0, halfL: 6.0, topY: 34 * 0.62 },
  // Mid-south row (Z = +12) — note (-13, 12) is Central Pocket Park + Fountain!
  { id: "b_w2", asset: "tower_neon_hotel", x: -39, z: 12, yawDeg: 0, halfW: 6.5, halfL: 6.0, topY: 28 * 0.62 },
  { id: "b_c2", asset: "tower_neon_hotel", x: 13, z: 12, yawDeg: 180, halfW: 6.5, halfL: 6.0, topY: 28 * 0.62 },
  { id: "b_e2", asset: "tower_brick_lofts", x: 39, z: 12, yawDeg: 90, halfW: 6.0, halfL: 6.0, topY: 20 * 0.62 },
  // South skyline row (Z = +36)
  { id: "b_sw", asset: "tower_tall_office", x: -39, z: 36, yawDeg: 0, halfW: 6.0, halfL: 6.0, topY: 34 * 0.62 },
  { id: "b_s1", asset: "tower_mid_office", x: -13, z: 36, yawDeg: 180, halfW: 6.5, halfL: 5.5, topY: 26 * 0.62 },
  { id: "b_s2", asset: "tower_waterfront", x: 13, z: 36, yawDeg: 180, halfW: 6.0, halfL: 5.4, topY: 16 * 0.62 },
  { id: "b_se", asset: "tower_neon_low", x: 39, z: 36, yawDeg: 0, halfW: 5.4, halfL: 5.4, topY: 18 * 0.62 },
];

for (const b of BLOCK_BUILDINGS) {
  initialEntities.push({
    id: b.id,
    assetId: b.asset,
    pos: [b.x, 0, b.z],
    rot: quatFromYawPitchRoll((b.yawDeg * Math.PI) / 180, 0, 0),
    scale: 1.0,
    outline: true,
    emissiveBoost: 1.45,
    tag: "building",
  });
}

// Pocket Park trees nestled around the fountain at (-13, 0, 12)
const TREE_COORDS: Array<[number, number, number]> = [
  [-18.8, 7.4, 1.05],
  [-7.2, 7.4, 0.95],
  [-18.6, 16.6, 1.0],
  [-7.4, 16.4, 1.08],
  [-13.0, 6.8, 0.9],
  [-18.8, 12.0, 0.92],
];
TREE_COORDS.forEach(([tx, tz, sc], i) => {
  initialEntities.push({
    id: `park_tree_${i}`,
    assetId: "park_tree",
    pos: [tx, 0, tz],
    rot: quatFromYawPitchRoll(i * 1.1, 0, 0),
    scale: sc,
    outline: true,
    tag: "prop",
  });
});

// Slender 1px Streetlamps lining main intersections & Lighthouse Pier (1 instanced draw call!)
const LAMP_COORDS: Array<[number, number, number]> = [
  // Central avenue corners (match CITY_GROUND_FS warm lamp pools!)
  [-5.2, -5.2, 0], [5.2, 5.2, Math.PI],
  [-5.2, 18.8, 0], [5.2, -18.8, Math.PI],
  [-31.2, -5.2, 0], [-20.8, 5.2, Math.PI],
  [20.8, -5.2, 0], [31.2, 5.2, Math.PI],
  [-5.2, 29.2, 0], [5.2, 29.2, Math.PI],
  [-31.2, 29.2, 0], [31.2, 29.2, Math.PI],
  [-20.8, -18.8, 0], [20.8, -18.8, Math.PI],
  // North Lighthouse Stone Pier lamps
  [-5.1, -52, 0], [5.1, -52, Math.PI],
  [-5.1, -62, 0], [5.1, -62, Math.PI],
];
LAMP_COORDS.forEach(([lx, lz, yaw], i) => {
  initialEntities.push({
    id: `lamp_${i}`,
    assetId: "street_lamp",
    pos: [lx, 0, lz],
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: false,
    emissiveBoost: 1.85,
    tag: "prop",
  });
});

// 12 Midnight Cruising Street Cars looping cleanly along the avenue grid
interface TrafficCar {
  id: string;
  axis: "x" | "z";
  laneCoord: number;
  dir: 1 | -1;
  minT: number;
  maxT: number;
  posT: number;
  speed: number;
}
const CARS: TrafficCar[] = [
  { id: "car_0", axis: "z", laneCoord: 1.9, dir: -1, minT: -43, maxT: 43, posT: 16, speed: 9.5 },
  { id: "car_1", axis: "z", laneCoord: -1.9, dir: 1, minT: -43, maxT: 43, posT: -24, speed: 8.8 },
  { id: "car_2", axis: "z", laneCoord: 27.9, dir: -1, minT: -43, maxT: 43, posT: 28, speed: 10.2 },
  { id: "car_3", axis: "z", laneCoord: 24.1, dir: 1, minT: -43, maxT: 43, posT: -8, speed: 8.2 },
  { id: "car_4", axis: "z", laneCoord: -24.1, dir: -1, minT: -43, maxT: 43, posT: -4, speed: 9.0 },
  { id: "car_5", axis: "z", laneCoord: -27.9, dir: 1, minT: -43, maxT: 43, posT: 30, speed: 9.8 },
  { id: "car_6", axis: "x", laneCoord: -1.9, dir: -1, minT: -49, maxT: 49, posT: 24, speed: 10.4 },
  { id: "car_7", axis: "x", laneCoord: 1.9, dir: 1, minT: -49, maxT: 49, posT: -18, speed: 9.2 },
  { id: "car_8", axis: "x", laneCoord: 22.1, dir: -1, minT: -49, maxT: 49, posT: -6, speed: 8.6 },
  { id: "car_9", axis: "x", laneCoord: 25.9, dir: 1, minT: -49, maxT: 49, posT: 14, speed: 9.6 },
  { id: "car_10", axis: "x", laneCoord: -25.9, dir: -1, minT: -49, maxT: 49, posT: 32, speed: 10.0 },
  { id: "car_11", axis: "x", laneCoord: -22.1, dir: 1, minT: -49, maxT: 49, posT: -30, speed: 9.1 },
];
const CAR_ASSETS = ["car_taxi", "car_crimson", "car_cyan"];

CARS.forEach((c, i) => {
  const yaw = c.axis === "z" ? (c.dir < 0 ? 0 : Math.PI) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  const pos: Vec3 = c.axis === "z" ? [c.laneCoord, 0, c.posT] : [c.posT, 0, c.laneCoord];
  initialEntities.push({
    id: c.id,
    assetId: CAR_ASSETS[i % CAR_ASSETS.length],
    pos,
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: 1.0,
    outline: true,
    emissiveBoost: 1.8,
    tag: "traffic",
  });
});

world.doc.entities = initialEntities;

// ---------------------------------------------------------------------------
// 5. Simulation State: 6-DOF Helicopter Physics, Autopilot, Turbo, Searchlight, Exploded 28-Layer
// ---------------------------------------------------------------------------
const state = {
  // Helicopter kinematics
  pos: [14, 19.5, 28] as Vec3,
  vel: [0, 0, 0] as Vec3,
  yaw: 0.42, // radians; yaw=0 faces -Z
  pitch: -0.14, // negative tilts nose DOWN (forward thrust)
  roll: 0.16, // positive banks right wing DOWN
  rotorAng: 0,
  tailAng: 0,
  turbo: 0, // 0..1 smooth turbo boost blend
  turboForced: params.get("turbo") === "1",
  autopilot: params.get("autopilot") !== "0",
  landed: false,
  landingToPad: false,
  searchlightOn: params.get("searchlight") !== "0",
  exploded: params.get("cam") === "exploded",
  explodeT: params.get("cam") === "exploded" ? 1 : 0,

  // Camera & presentation
  camMode: ((): CamMode => {
    const c = params.get("cam");
    if (c === "chase" || c === "orbit") return c;
    return "iso";
  })(),
  tod: ((): TodPreset => {
    const t = params.get("tod");
    if (t === "sunset" || t === "day") return t;
    return "night";
  })(),
  quality: initQuality as AAQuality,
  splitEnabled: params.get("split") === "1",
  splitX: clamp(Number(params.get("splitX") ?? 0.5) || 0.5, 0.08, 0.92),
  orbitYawOffset: 0.34,
  orbitPitchOffset: 0.34,
  zoomDist: 38,
  camPosSmooth: [4, 34, -4] as Vec3,
  camTargetSmooth: [-10, 15, -34] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,
  simTime: Number(params.get("t") ?? 18.6) || 18.6,
  spotWorld: [10, 0.2, 16] as Vec3,
  spotTargetLabel: "Harbor Ave",
};

// Twin supersonic turbojet contrail ring buffers
const trailL: RibbonPoint[] = [];
const trailR: RibbonPoint[] = [];

// Keyboard + pointer state
const keys = new Set<string>();
let dragOrbit = false;
let dragSplit = false;
let lastPtrX = 0;
let lastPtrY = 0;

function applyTod(preset: TodPreset): void {
  state.tod = preset;
  if (preset === "night") {
    world.doc.lighting.timeOfDay = 0.94;
    world.doc.lighting.sunAzimuthDeg = 34;
    world.doc.lighting.sunElevationDeg = 42;
    world.doc.lighting.fogDensity = 0.24;
  } else if (preset === "sunset") {
    world.doc.lighting.timeOfDay = 0.52;
    world.doc.lighting.sunAzimuthDeg = -32;
    world.doc.lighting.sunElevationDeg = 18;
    world.doc.lighting.fogDensity = 0.30;
  } else {
    world.doc.lighting.timeOfDay = 0.06;
    world.doc.lighting.sunAzimuthDeg = 42;
    world.doc.lighting.sunElevationDeg = 56;
    world.doc.lighting.fogDensity = 0.22;
  }
}

function applyQuality(q: AAQuality): void {
  state.quality = q;
  renderer.setQuality(q, world);
}

function applySplit(): void {
  world.doc.splitCompare.enabled = state.splitEnabled;
  world.doc.splitCompare.splitX = state.splitX;
  world.doc.splitCompare.leftMode = "legacy";
  world.doc.splitCompare.rightMode = "voxel-dda";

  const splitBar = document.getElementById("splitBar");
  const splitLabels = document.getElementById("splitLabels");
  const rightLbl = document.getElementById("splitRightLabel");
  if (splitBar) {
    splitBar.style.display = state.splitEnabled ? "block" : "none";
    splitBar.style.left = `${(state.splitX * 100).toFixed(2)}%`;
  }
  if (splitLabels) {
    splitLabels.style.display = state.splitEnabled ? "flex" : "none";
  }
  if (rightLbl) {
    const s = state.quality === "eco" ? "2x" : state.quality === "balanced" ? "4x" : "8x";
    rightLbl.textContent = `RIGHT: AASpriteStacker (${s} RGSS AA + 1-OBB 3D Volume)`;
  }
}

// Smooth closed patrol figure-loop sweeping over downtown skyline, HQ helipad, and out around the North Coastal Lighthouse!
function sampleAutopilotPose(t: number): { pos: Vec3; vel: Vec3; yaw: number; bank: number; turboPulse: number } {
  const w = 0.22;
  const a = t * w;
  const xAt = (s: number) => Math.sin(s) * 26.0 + Math.sin(s * 2.0) * 7.5;
  const zAt = (s: number) => -18.0 + Math.cos(s) * 44.0 - Math.cos(s * 2.0) * 5.0;
  const yAt = (s: number) => 19.6 + Math.sin(s * 1.5 + 0.4) * 3.0;

  const eps = 0.04;
  const x = xAt(a), y = yAt(a), z = zAt(a);
  const xn = xAt(a + eps), yn = yAt(a + eps), zn = zAt(a + eps);
  const xp = xAt(a - eps), zp = zAt(a - eps);

  const dtSec = eps / w;
  const vx = (xn - x) / dtSec;
  const vy = (yn - y) / dtSec;
  const vz = (zn - z) / dtSec;

  const vxPrev = (x - xp) / dtSec;
  const vzPrev = (z - zp) / dtSec;

  // Forward vector for yaw is [-sin(yaw), 0, -cos(yaw)]
  const yaw = Math.atan2(-vx, -vz);
  const yawPrev = Math.atan2(-vxPrev, -vzPrev);
  let dYaw = yaw - yawPrev;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const yawRate = dYaw / dtSec;

  // Coordinated Airwolf bank angle into turns
  const bank = clamp(-yawRate * 0.72, -0.52, 0.52);
  // Subtle supersonic afterburner surge when sweeping along the harbor strait!
  const turboPulse = clamp(Math.sin(a * 2.0 - 0.8) * 1.4 - 0.55, 0, 1);
  return { pos: [x, y, z], vel: [vx, vy, vz], yaw, bank, turboPulse };
}

function getObstacleCeiling(x: number, z: number): number {
  // Rooftop H Helipad at (-13, -12) — allows smooth landing on the glowing H!
  if (Math.abs(x - HELIPAD_POS[0]) < 7.2 && Math.abs(z - HELIPAD_POS[2]) < 7.2) {
    return HELIPAD_POS[1] + 2.05;
  }
  // Coastal lighthouse tower
  if (Math.hypot(x - LIGHTHOUSE_POS[0], z - LIGHTHOUSE_POS[2]) < 6.2) {
    return 21.5;
  }
  for (const b of BLOCK_BUILDINGS) {
    if (Math.abs(x - b.x) < b.halfW + 3.2 && Math.abs(z - b.z) < b.halfL + 3.2) {
      return b.topY + 4.0;
    }
  }
  return 3.4;
}

function updateSearchlightAndRibbons(dt: number): void {
  const ribbons = [];
  const nightW = clamp((world.doc.lighting.timeOfDay - 0.48) / 0.52, 0, 1);

  // 1. Coastal Lighthouse Rotating Volumetric Bay Beam (synced 1:1 with CITY_GROUND_FS uWaveTime * 0.72 + 0.65!)
  const lhAng = world.doc.terrain.waveTime * 0.72 + 0.65;
  const lhDir: Vec3 = [Math.cos(lhAng), -0.17, Math.sin(lhAng)];
  const lhPts: RibbonPoint[] = [];
  const lhLen = 50;
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    lhPts.push({
      pos: [
        LIGHTHOUSE_BEACON_POS[0] + lhDir[0] * (1.4 + u * lhLen),
        Math.max(0.4, LIGHTHOUSE_BEACON_POS[1] + lhDir[1] * (1.4 + u * lhLen)),
        LIGHTHOUSE_BEACON_POS[2] + lhDir[2] * (1.4 + u * lhLen),
      ],
      age: 0.08 + u * 0.84,
      width: 1.0 + u * 15.5,
    });
  }
  ribbons.push({
    id: "lighthouse_beam",
    points: lhPts,
    color: [255, 232, 146] as [number, number, number],
    alpha: 0.14 + nightW * 0.24,
    emissive: true,
  });

  // 2. Airwolf Real-Time Volumetric Nose Searchlight Cone + Exact Building/Ground Raycast!
  const spotEnt = world.getEntity("searchlight_spot")!;
  if (state.searchlightOn && state.explodeT < 0.15) {
    const sockPos = world.getSocketWorldPos("airwolf", "searchlight") ?? state.pos;
    // Slight sweeping search gimbal around Airwolf's nose heading
    const sweep = state.autopilot ? Math.sin(state.simTime * 1.15) * 0.28 : Math.sin(state.simTime * 0.7) * 0.12;
    const aimYaw = state.yaw + sweep;
    const aimPitch = clamp(-0.56 + state.pitch * 0.45, -1.05, -0.26);
    const cp = Math.cos(aimPitch);
    const beamDir: Vec3 = vec3Norm([-Math.sin(aimYaw) * cp, Math.sin(aimPitch), -Math.cos(aimYaw) * cp]);

    // Intersect ground plane Y = 0
    const tGround = beamDir[1] < -0.04 ? clamp((0.15 - sockPos[1]) / beamDir[1], 4, 82) : 64;

    // Exact 3D voxel-DDA raycast against buildings & coastal lighthouse (skip Airwolf nose via 1.6u offset)
    const rayStart: Vec3 = vec3Add(sockPos, vec3Scale(beamDir, 1.6));
    const hit = world.raycastEntities(rayStart, beamDir, Math.max(1, tGround - 1.6));
    let beamLen = tGround;
    let targetLabel = "Harbor Bay";
    if (hit && hit.entityId !== "airwolf" && !hit.entityId.startsWith("airwolf_") && hit.entityId !== "heli_shadow_proxy" && hit.entityId !== "searchlight_spot") {
      beamLen = hit.distance + 1.6;
      state.spotWorld = [hit.point[0], hit.point[1], hit.point[2]];
      targetLabel = hit.entityId === "coastal_lighthouse"
        ? "Coastal Lighthouse"
        : hit.entityId === "tower_hq_helipad"
          ? "Airwolf HQ Helipad"
          : hit.entityId.startsWith("car_")
            ? "Street Traffic"
            : "Downtown Tower";
    } else {
      state.spotWorld = [
        sockPos[0] + beamDir[0] * tGround,
        0.2,
        sockPos[2] + beamDir[2] * tGround,
      ];
      const onIsland = Math.abs(state.spotWorld[0]) <= 56 && state.spotWorld[2] >= -48 && state.spotWorld[2] <= 52;
      const onPier = Math.abs(state.spotWorld[0]) <= 6.2 && state.spotWorld[2] < -48 && state.spotWorld[2] >= -80;
      targetLabel = onPier ? "Lighthouse Pier" : onIsland ? "Midnight Avenue" : "Harbor Bay";
    }
    state.spotTargetLabel = targetLabel;

    // Pass exact spotlight XZ into CITY_GROUND_FS via uShadowCasters[1]!
    spotEnt.pos = [state.spotWorld[0], 0.2, state.spotWorld[2]];
    spotEnt.scale = hit ? 3.2 : 5.0;

    // Outer translucent volumetric cone + bright inner core beam
    const outerPts: RibbonPoint[] = [];
    const innerPts: RibbonPoint[] = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const d = 0.2 + u * beamLen;
      const p: Vec3 = [
        sockPos[0] + beamDir[0] * d,
        Math.max(0.15, sockPos[1] + beamDir[1] * d),
        sockPos[2] + beamDir[2] * d,
      ];
      outerPts.push({ pos: p, age: 0.04 + u * 0.84, width: 0.9 + u * 19.5 });
      innerPts.push({ pos: p, age: 0.02 + u * 0.80, width: 0.45 + u * 7.8 });
    }
    ribbons.push({
      id: "searchlight_outer",
      points: outerPts,
      color: [255, 228, 138] as [number, number, number],
      alpha: (0.14 + nightW * 0.24) * (1 - state.explodeT * 6),
      emissive: true,
    });
    ribbons.push({
      id: "searchlight_core",
      points: innerPts,
      color: [255, 250, 214] as [number, number, number],
      alpha: (0.18 + nightW * 0.30) * (1 - state.explodeT * 6),
      emissive: true,
    });
  } else {
    spotEnt.scale = 0.001;
    state.spotTargetLabel = state.exploded ? "28-Slice Inspect" : "Off";
  }

  // 3. Sleek Twin Supersonic Dorsal Turbojet Afterburner Ribbons (cyan-gold plumes from jetL / jetR!)
  const jetLPos = world.getSocketWorldPos("airwolf", "jetL");
  const jetRPos = world.getSocketWorldPos("airwolf", "jetR");
  const speed = Math.hypot(state.vel[0], state.vel[1], state.vel[2]);
  const emitJet = !state.exploded && !state.landed && (state.turbo > 0.14 || speed > 10.0);

  if (state.exploded || state.landed) {
    trailL.length = 0;
    trailR.length = 0;
  } else {
    const decay = dt * (state.turbo > 0.35 ? 2.6 : 4.2);
    for (const trail of [trailL, trailR]) {
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age += decay;
        if (trail[i].age >= 1.0) trail.splice(i, 1);
      }
    }
    if (emitJet && jetLPos && jetRPos) {
      // Guard against discontinuous teleport jumps
      if (trailL.length > 0) {
        const dJump = Math.hypot(jetLPos[0] - trailL[0].pos[0], jetLPos[1] - trailL[0].pos[1], jetLPos[2] - trailL[0].pos[2]);
        if (dJump > 6.0) { trailL.length = 0; trailR.length = 0; }
      }
      const w = 0.28 + state.turbo * 0.44;
      trailL.unshift({ pos: [...jetLPos], age: 0.01, width: w });
      trailR.unshift({ pos: [...jetRPos], age: 0.01, width: w });
      if (trailL.length > 15) trailL.length = 15;
      if (trailR.length > 15) trailR.length = 15;
    }
    if (trailL.length >= 2) {
      const col: [number, number, number] = state.turbo > 0.4 ? [116, 228, 255] : [255, 178, 86];
      const alpha = clamp(0.28 + state.turbo * 0.46, 0.24, 0.74);
      ribbons.push({ id: "jet_trail_l", points: trailL, color: col, alpha, emissive: true });
      ribbons.push({ id: "jet_trail_r", points: trailR, color: col, alpha, emissive: true });
    }
  }

  world.doc.ribbons = ribbons;
}

function stepSimulation(dt: number): void {
  const safeDt = Math.min(dt, 0.05);
  state.simTime += safeDt;
  world.stepClock(safeDt);

  // Smooth exploded assembly transition
  const targetExplode = state.exploded ? 1 : 0;
  state.explodeT = lerp(state.explodeT, targetExplode, 1 - Math.exp(-safeDt * 6.0));
  if (Math.abs(state.explodeT - targetExplode) < 0.002) state.explodeT = targetExplode;

  // Move 12 midnight cruising street cars along avenues
  for (const c of CARS) {
    c.posT += c.dir * c.speed * safeDt;
    if (c.posT > c.maxT) c.posT = c.minT;
    if (c.posT < c.minT) c.posT = c.maxT;
    const ent = world.getEntity(c.id);
    if (ent) {
      ent.pos[0] = c.axis === "z" ? c.laneCoord : c.posT;
      ent.pos[2] = c.axis === "z" ? c.posT : c.laneCoord;
    }
  }

  // Helicopter flight physics / autopilot / exploded showcase hover
  const turboKey = keys.has("ShiftLeft") || keys.has("ShiftRight") || state.turboForced;

  if (state.exploded) {
    // Freeze forward travel and showcase all 28 Airwolf slices high above the midnight skyline & bay!
    state.vel[0] *= 0.85;
    state.vel[1] *= 0.85;
    state.vel[2] *= 0.85;
    state.pitch = lerp(state.pitch, -0.04, 1 - Math.exp(-safeDt * 5));
    state.roll = lerp(state.roll, 0.05, 1 - Math.exp(-safeDt * 5));
    state.pos[1] = lerp(state.pos[1], 27.5, 1 - Math.exp(-safeDt * 3.5));
    state.turbo = lerp(state.turbo, 0, 1 - Math.exp(-safeDt * 6));
    state.rotorAng += safeDt * 4.5;
    state.tailAng += safeDt * 9.0;
  } else if (state.landingToPad) {
    // Smooth autonomous approach & touchdown onto the glowing rooftop H Helipad!
    const target: Vec3 = [HELIPAD_POS[0], HELIPAD_POS[1] + 2.08, HELIPAD_POS[2]];
    const diff = vec3Sub(target, state.pos);
    const dist = Math.hypot(diff[0], diff[1], diff[2]);
    const k = 1 - Math.exp(-safeDt * 2.4);
    state.pos[0] = lerp(state.pos[0], target[0], k);
    state.pos[1] = lerp(state.pos[1], target[1], k);
    state.pos[2] = lerp(state.pos[2], target[2], k);
    state.vel = vec3Scale(diff, 1.5);
    state.pitch = lerp(state.pitch, 0, 1 - Math.exp(-safeDt * 4));
    state.roll = lerp(state.roll, 0, 1 - Math.exp(-safeDt * 4));
    state.turbo = lerp(state.turbo, 0, 1 - Math.exp(-safeDt * 6));
    state.rotorAng += safeDt * (dist < 1.2 ? 9.0 : 22.0);
    state.tailAng += safeDt * 28.0;
    if (dist < 0.25) {
      state.landed = true;
      state.landingToPad = false;
      state.vel = [0, 0, 0];
    }
  } else if (state.autopilot) {
    const ap = sampleAutopilotPose(state.simTime);
    const blend = 1 - Math.exp(-safeDt * 4.2);
    state.pos[0] = lerp(state.pos[0], ap.pos[0], blend);
    state.pos[1] = lerp(state.pos[1], ap.pos[1], blend);
    state.pos[2] = lerp(state.pos[2], ap.pos[2], blend);
    state.vel = ap.vel;

    // Shortest-angle yaw tracking
    let dy = ap.yaw - state.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    state.yaw += dy * (1 - Math.exp(-safeDt * 5.0));

    const spd = Math.hypot(ap.vel[0], ap.vel[2]);
    const wantTurbo = turboKey ? 1 : ap.turboPulse * 0.72;
    state.turbo = lerp(state.turbo, wantTurbo, 1 - Math.exp(-safeDt * 4.5));
    state.pitch = lerp(state.pitch, -clamp(spd * 0.015 + state.turbo * 0.12, 0.04, 0.34), 1 - Math.exp(-safeDt * 4.5));
    state.roll = lerp(state.roll, ap.bank, 1 - Math.exp(-safeDt * 4.5));
    state.landed = false;
    state.rotorAng += safeDt * (26.0 + state.turbo * 14.0);
    state.tailAng += safeDt * 38.0;
  } else {
    // Full responsive manual 6-DOF helicopter flight!
    const fwdIn = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const yawIn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    const climbIn = (keys.has("Space") || keys.has("KeyR") ? 1 : 0) - (keys.has("KeyC") || keys.has("KeyF") ? 1 : 0);

    if (fwdIn !== 0 || climbIn > 0 || turboKey) state.landed = false;

    const wantTurbo = turboKey && fwdIn >= 0 ? 1 : 0;
    state.turbo = lerp(state.turbo, wantTurbo, 1 - Math.exp(-safeDt * 5.5));

    const yawRate = yawIn * (state.turbo > 0.3 ? 1.55 : 1.95);
    state.yaw += yawRate * safeDt;

    const fwdX = -Math.sin(state.yaw);
    const fwdZ = -Math.cos(state.yaw);
    const thrust = (fwdIn + (state.turbo > 0.25 && fwdIn >= 0 ? 1.35 * state.turbo : 0)) * 34.0;
    const drag = Math.exp(-safeDt * (state.turbo > 0.25 ? 1.05 : 1.85));

    state.vel[0] = state.vel[0] * drag + fwdX * thrust * safeDt;
    state.vel[2] = state.vel[2] * drag + fwdZ * thrust * safeDt;
    state.vel[1] = state.vel[1] * Math.exp(-safeDt * 3.0) + climbIn * 24.0 * safeDt;

    state.pos[0] = clamp(state.pos[0] + state.vel[0] * safeDt, -72, 72);
    state.pos[2] = clamp(state.pos[2] + state.vel[2] * safeDt, -64, 92);
    state.pos[1] = clamp(state.pos[1] + state.vel[1] * safeDt, 3.4, 48);

    // Gentle rooftop / obstacle clearance
    const floorY = getObstacleCeiling(state.pos[0], state.pos[2]);
    if (state.pos[1] < floorY) {
      state.pos[1] = floorY;
      if (state.vel[1] < 0) state.vel[1] = 0;
      if (Math.hypot(state.pos[0] - HELIPAD_POS[0], state.pos[2] - HELIPAD_POS[2]) < 6.5 && climbIn <= 0 && fwdIn === 0) {
        state.landed = true;
      }
    }

    // Authentic helicopter attitude coupling: forward acceleration pitches nose DOWN; turns bank smoothly!
    const fwdSpeed = state.vel[0] * fwdX + state.vel[2] * fwdZ;
    const targetPitch = state.landed ? 0 : -clamp(fwdSpeed * 0.015 + fwdIn * 0.14 + state.turbo * 0.12, -0.26, 0.38);
    const targetRoll = state.landed ? 0 : clamp(-yawIn * (0.28 + Math.min(Math.abs(fwdSpeed), 22) * 0.014), -0.58, 0.58);
    state.pitch = lerp(state.pitch, targetPitch, 1 - Math.exp(-safeDt * 6.0));
    state.roll = lerp(state.roll, targetRoll, 1 - Math.exp(-safeDt * 6.0));

    state.rotorAng += safeDt * (state.landed ? 9.5 : 27.0 + state.turbo * 16.0);
    state.tailAng += safeDt * (state.landed ? 14.0 : 40.0);
  }

  // Apply transforms to Airwolf hull, shadow proxy, rotors, and 28 exploded slices!
  const airwolf = world.getEntity("airwolf")!;
  airwolf.pos = [...state.pos];
  airwolf.rot = quatFromYawPitchRoll(state.yaw, state.pitch, state.roll);
  const showSlices = state.explodeT > 0.015;
  airwolf.visible = !showSlices;

  const shadowProxy = world.getEntity("heli_shadow_proxy")!;
  shadowProxy.pos = [...state.pos];

  const mainRotor = world.getEntity("airwolf_main_rotor")!;
  mainRotor.pos = [0, state.explodeT * 6.2, 0];
  mainRotor.rot = quatFromYawPitchRoll(state.rotorAng, 0, 0);

  const tailRotor = world.getEntity("airwolf_tail_rotor")!;
  tailRotor.pos = [-state.explodeT * 2.4, 0, 0];
  tailRotor.rot = quatFromYawPitchRoll(0, state.tailAng, 0);

  for (let z = 0; z < SLICE_COUNT; z++) {
    const sl = world.getEntity(`airwolf_s${z}`)!;
    sl.visible = showSlices;
    if (showSlices) {
      sl.pos[1] = (z - (SLICE_COUNT - 1) * 0.5) * 0.44 * state.explodeT;
    }
  }

  // Update volumetric nose searchlight cone, lighthouse beam, & twin turbojet contrails
  updateSearchlightAndRibbons(safeDt);

  // Camera framing
  updateCamera(safeDt);
}

function updateCamera(dt: number, snap = false): void {
  const cam = world.doc.camera;
  const fwdX = -Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);

  let wantPos: Vec3;
  let wantTarget: Vec3;
  let wantUp: Vec3 = [0, 1, 0];
  let wantFov = 44;

  if (state.explodeT > 0.25) {
    // Tight heroic museum turntable framing around all 28 separated Airwolf slices + floating rotors!
    const orbYaw = state.yaw + state.orbitYawOffset + state.simTime * 0.22;
    const dist = clamp(state.zoomDist * 0.68, 23, 38);
    const elev = clamp(state.orbitPitchOffset * 0.62, 0.14, 0.68);
    wantPos = [
      state.pos[0] + Math.sin(orbYaw) * Math.cos(elev) * dist,
      state.pos[1] + Math.sin(elev) * dist + 1.2,
      state.pos[2] + Math.cos(orbYaw) * Math.cos(elev) * dist,
    ];
    wantTarget = [state.pos[0], state.pos[1] + 1.0, state.pos[2]];
    wantFov = 42;
  } else if (state.camMode === "chase") {
    // Dramatic 6-DOF tactical tail chase behind Airwolf's twin dorsal turbojets & banking horizon!
    const dist = 17.5 + state.turbo * 3.8;
    const height = 6.2 - state.turbo * 0.8;
    wantPos = [
      state.pos[0] - fwdX * dist,
      Math.max(4.5, state.pos[1] + height),
      state.pos[2] - fwdZ * dist,
    ];
    wantTarget = [
      state.pos[0] + fwdX * 12.0,
      state.pos[1] - 1.6,
      state.pos[2] + fwdZ * 12.0,
    ];
    // Subtle horizon roll matching Airwolf's bank angle!
    const bankCam = state.roll * 0.28;
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    wantUp = vec3Norm([rightX * Math.sin(bankCam), Math.cos(bankCam), rightZ * Math.sin(bankCam)]);
    wantFov = 50 + state.turbo * 8;
  } else if (state.camMode === "orbit") {
    // Sweeping Coastal Lighthouse & Midnight City panorama orbiting the island
    const a = state.orbitYawOffset + state.simTime * 0.14;
    const r = clamp(state.zoomDist * 1.45, 42, 110);
    const elev = clamp(state.orbitPitchOffset, 0.2, 1.05);
    wantPos = [Math.sin(a) * Math.cos(elev) * r, Math.sin(elev) * r + 8, 12 + Math.cos(a) * Math.cos(elev) * r];
    wantTarget = [0, 9, 14];
    wantFov = 42;
  } else {
    // Default "iso": Rich 3/4 miniature pixel city tracking camera inspired by diorama helicopter classics!
    const dist = clamp(state.zoomDist, 22, 82);
    const elev = clamp(state.orbitPitchOffset, 0.22, 1.12);
    const az = state.orbitYawOffset;
    wantTarget = [
      state.pos[0] * 0.72 + fwdX * 4.5,
      state.pos[1] * 0.58 + 3.5,
      state.pos[2] * 0.72 + fwdZ * 4.5,
    ];
    wantPos = [
      wantTarget[0] + Math.sin(az) * Math.cos(elev) * dist,
      Math.max(8, wantTarget[1] + Math.sin(elev) * dist),
      wantTarget[2] + Math.cos(az) * Math.cos(elev) * dist,
    ];
    wantFov = 40;
  }

  const k = snap ? 1 : 1 - Math.exp(-dt * 5.2);
  for (let i = 0; i < 3; i++) {
    state.camPosSmooth[i] = lerp(state.camPosSmooth[i], wantPos[i], k);
    state.camTargetSmooth[i] = lerp(state.camTargetSmooth[i], wantTarget[i], k);
    state.camUpSmooth[i] = lerp(state.camUpSmooth[i], wantUp[i], k);
  }
  cam.pos = [...state.camPosSmooth];
  cam.target = [...state.camTargetSmooth];
  cam.up = vec3Norm(state.camUpSmooth);
  cam.fovDeg = lerp(cam.fovDeg, wantFov, k);
}

// ---------------------------------------------------------------------------
// 6. HUD & Interactive Controls Wiring
// ---------------------------------------------------------------------------
function syncUiButtons(): void {
  const setPressed = (id: string, val: boolean) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("aria-pressed", val ? "true" : "false");
  };
  setPressed("btnCamIso", state.camMode === "iso" && !state.exploded);
  setPressed("btnCamChase", state.camMode === "chase" && !state.exploded);
  setPressed("btnCamOrbit", state.camMode === "orbit" && !state.exploded);
  setPressed("btnExplode", state.exploded);
  setPressed("btnAutopilot", state.autopilot && !state.exploded);
  setPressed("btnTurbo", state.turboForced || state.turbo > 0.45);
  setPressed("btnSpot", state.searchlightOn);
  setPressed("btnSplit", state.splitEnabled);
  setPressed("btnPad", state.landed || state.landingToPad);

  for (const t of ["night", "sunset", "day"] as TodPreset[]) {
    setPressed(`btnTod_${t}`, state.tod === t);
  }
  for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) {
    setPressed(`btnQual_${q}`, state.quality === q);
  }
}

function updateStatsHud(): void {
  const statsEl = document.getElementById("stats");
  if (!statsEl) return;
  const s = renderer.getStats();
  const spdKts = Math.round(Math.hypot(state.vel[0], state.vel[2]) * 9.5 + state.turbo * 165);
  const altFt = Math.round(state.pos[1] * 24);
  const modeStr = state.exploded
    ? "EXPLODED 28-SLICE (1 instanced draw call)"
    : state.landed
      ? "ROOFTOP H HELIPAD (IDLE)"
      : state.turbo > 0.35
        ? "MACH TURBO BOOST"
        : state.autopilot
          ? "AUTOPILOT PATROL"
          : "MANUAL 6-DOF FLIGHT";
  statsEl.textContent =
    `STATUS  ${modeStr}\n` +
    `FLIGHT  ${String(spdKts).padStart(3, " ")} KTS  |  ALT ${String(altFt).padStart(3, " ")} FT  |  SPOT: ${state.spotTargetLabel}\n` +
    `ENGINE  ${s.fps.toFixed(0).padStart(2, " ")} FPS  |  ${s.drawCalls} draws (${s.visibleEntities}/${s.totalEntities} ents)  |  ${s.activeSamples}x RGSS AA`;
}

// Wire toolbar clicks
document.getElementById("btnCamIso")?.addEventListener("click", () => { state.exploded = false; state.camMode = "iso"; syncUiButtons(); });
document.getElementById("btnCamChase")?.addEventListener("click", () => { state.exploded = false; state.camMode = "chase"; syncUiButtons(); });
document.getElementById("btnCamOrbit")?.addEventListener("click", () => { state.exploded = false; state.camMode = "orbit"; syncUiButtons(); });
document.getElementById("btnExplode")?.addEventListener("click", () => { state.exploded = !state.exploded; syncUiButtons(); });
document.getElementById("btnAutopilot")?.addEventListener("click", () => {
  state.exploded = false;
  state.landingToPad = false;
  state.landed = false;
  state.autopilot = !state.autopilot;
  syncUiButtons();
});
document.getElementById("btnTurbo")?.addEventListener("click", () => {
  state.exploded = false;
  state.landingToPad = false;
  state.landed = false;
  state.turboForced = !state.turboForced;
  syncUiButtons();
});
document.getElementById("btnSpot")?.addEventListener("click", () => {
  state.searchlightOn = !state.searchlightOn;
  syncUiButtons();
});
document.getElementById("btnPad")?.addEventListener("click", () => {
  state.exploded = false;
  if (state.landed || state.landingToPad) {
    state.landed = false;
    state.landingToPad = false;
    state.autopilot = true;
  } else {
    state.autopilot = false;
    state.turboForced = false;
    state.landingToPad = true;
  }
  syncUiButtons();
});
document.getElementById("btnSplit")?.addEventListener("click", () => {
  state.splitEnabled = !state.splitEnabled;
  applySplit();
  syncUiButtons();
});

for (const t of ["night", "sunset", "day"] as TodPreset[]) {
  document.getElementById(`btnTod_${t}`)?.addEventListener("click", () => { applyTod(t); syncUiButtons(); });
}
for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) {
  document.getElementById(`btnQual_${q}`)?.addEventListener("click", () => { applyQuality(q); applySplit(); syncUiButtons(); });
}

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  keys.add(e.code);

  // Instant seamless handoff from Autopilot to Manual 6-DOF on flight input
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyR", "KeyC", "KeyF"].includes(e.code)) {
    if (state.autopilot || state.landingToPad) {
      state.autopilot = false;
      state.landingToPad = false;
      state.exploded = false;
      syncUiButtons();
    }
    if (e.code === "Space") e.preventDefault();
  }

  if (e.code === "KeyX") { state.exploded = !state.exploded; syncUiButtons(); }
  else if (e.code === "KeyV") {
    state.exploded = false;
    state.camMode = state.camMode === "iso" ? "chase" : state.camMode === "chase" ? "orbit" : "iso";
    syncUiButtons();
  } else if (e.code === "KeyP") {
    state.exploded = false;
    state.landingToPad = false;
    state.autopilot = !state.autopilot;
    syncUiButtons();
  } else if (e.code === "KeyM") {
    state.searchlightOn = !state.searchlightOn;
    syncUiButtons();
  } else if (e.code === "KeyE") {
    state.splitEnabled = !state.splitEnabled;
    applySplit();
    syncUiButtons();
  } else if (e.code === "KeyN") {
    applyTod(state.tod === "night" ? "sunset" : state.tod === "sunset" ? "day" : "night");
    syncUiButtons();
  } else if (e.code === "KeyL") {
    document.getElementById("btnPad")?.click();
  } else if (e.code === "KeyH" || e.code === "KeyU") {
    document.body.classList.toggle("nohud");
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

// Pointer drag orbit + wheel zoom + draggable A/B Split handle
const splitBar = document.getElementById("splitBar");
splitBar?.addEventListener("pointerdown", (e) => {
  dragSplit = true;
  e.stopPropagation();
  splitBar.setPointerCapture(e.pointerId);
});
window.addEventListener("pointermove", (e) => {
  if (dragSplit) {
    state.splitX = clamp(e.clientX / Math.max(1, window.innerWidth), 0.06, 0.94);
    applySplit();
    return;
  }
  if (!dragOrbit) return;
  const dx = e.clientX - lastPtrX;
  const dy = e.clientY - lastPtrY;
  lastPtrX = e.clientX;
  lastPtrY = e.clientY;
  state.orbitYawOffset -= dx * 0.0065;
  state.orbitPitchOffset = clamp(state.orbitPitchOffset + dy * 0.0055, 0.16, 1.18);
});
window.addEventListener("pointerup", () => {
  dragSplit = false;
  dragOrbit = false;
});
canvas.addEventListener("pointerdown", (e) => {
  dragOrbit = true;
  lastPtrX = e.clientX;
  lastPtrY = e.clientY;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  state.zoomDist = clamp(state.zoomDist + e.deltaY * 0.03, 18, 92);
}, { passive: false });

// ---------------------------------------------------------------------------
// 7. Initial Pose, Deterministic API Hook, and 60fps Loop
// ---------------------------------------------------------------------------
applyTod(state.tod);
applyQuality(state.quality);
applySplit();

// Snap Airwolf cleanly onto its patrol pose at t = state.simTime so frame 0 is already heroic!
const initAp = sampleAutopilotPose(state.simTime);
state.pos = [...initAp.pos];
state.vel = [...initAp.vel];
state.yaw = initAp.yaw;
state.pitch = -0.18;
state.roll = initAp.bank;
state.turbo = state.turboForced ? 1 : initAp.turboPulse * 0.65;
if (state.turboForced) {
  // Pre-seed glowing twin afterburner ribbons behind Airwolf for instant capture beauty!
  const fwdX = -Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  for (let i = 0; i < 18; i++) {
    const back = 1.6 + i * 0.95;
    const age = i / 18;
    trailL.push({
      pos: [state.pos[0] - fwdX * back - rightX * 0.72, state.pos[1] + 1.32 - i * 0.04, state.pos[2] - fwdZ * back - rightZ * 0.72],
      age,
      width: 1.55,
    });
    trailR.push({
      pos: [state.pos[0] - fwdX * back + rightX * 0.72, state.pos[1] + 1.32 - i * 0.04, state.pos[2] - fwdZ * back + rightZ * 0.72],
      age,
      width: 1.55,
    });
  }
}

stepSimulation(0.016);
updateCamera(1.0, true);
renderer.render(world);
syncUiButtons();
updateStatsHud();
document.body.classList.add("ready");

// Expose clean deterministic control API for verification & interactive scripting
declare global {
  interface Window {
    heliDemo?: {
      world: SceneWorld;
      renderer: AASpriteRenderer;
      set: (opts: Partial<{
        camMode: CamMode;
        exploded: boolean;
        explodeT: number;
        tod: TodPreset;
        quality: AAQuality;
        splitEnabled: boolean;
        splitX: number;
        turboForced: boolean;
        searchlightOn: boolean;
        autopilot: boolean;
        orbitYawOffset: number;
        orbitPitchOffset: number;
        zoomDist: number;
        simTime: number;
        noHud: boolean;
      }>) => void;
      step: (dt: number) => void;
      getStats: () => ReturnType<AASpriteRenderer["getStats"]>;
    };
  }
}

window.heliDemo = {
  world,
  renderer,
  set(opts) {
    if (opts.camMode !== undefined) state.camMode = opts.camMode;
    if (opts.exploded !== undefined) state.exploded = opts.exploded;
    if (opts.explodeT !== undefined) state.explodeT = opts.explodeT;
    if (opts.tod !== undefined) applyTod(opts.tod);
    if (opts.quality !== undefined) applyQuality(opts.quality);
    if (opts.splitEnabled !== undefined) state.splitEnabled = opts.splitEnabled;
    if (opts.splitX !== undefined) state.splitX = opts.splitX;
    if (opts.turboForced !== undefined) {
      state.turboForced = opts.turboForced;
      if (!opts.turboForced) state.turbo = 0;
    }
    if (opts.searchlightOn !== undefined) state.searchlightOn = opts.searchlightOn;
    if (opts.autopilot !== undefined) state.autopilot = opts.autopilot;
    if (opts.orbitYawOffset !== undefined) state.orbitYawOffset = opts.orbitYawOffset;
    if (opts.orbitPitchOffset !== undefined) state.orbitPitchOffset = opts.orbitPitchOffset;
    if (opts.zoomDist !== undefined) state.zoomDist = opts.zoomDist;
    if (opts.simTime !== undefined) {
      trailL.length = 0;
      trailR.length = 0;
      state.simTime = opts.simTime;
      const ap = sampleAutopilotPose(state.simTime);
      state.pos = [...ap.pos];
      state.vel = [...ap.vel];
      state.yaw = ap.yaw;
      state.roll = ap.bank;
      state.pitch = -0.18;
    }
    if (opts.exploded) {
      trailL.length = 0;
      trailR.length = 0;
      state.turbo = 0;
      state.pos[1] = 27.5;
    }
    if (opts.noHud !== undefined) document.body.classList.toggle("nohud", opts.noHud);
    applySplit();
    stepSimulation(0.016);
    updateCamera(1.0, true);
    renderer.render(world);
    syncUiButtons();
    updateStatsHud();
  },
  step(dt) {
    stepSimulation(dt);
    renderer.render(world);
    updateStatsHud();
  },
  getStats: () => renderer.getStats(),
};

let lastTs = performance.now();
let hudAcc = 0;

function tick(ts: number): void {
  const dt = clamp((ts - lastTs) / 1000, 0.001, 0.05);
  lastTs = ts;
  stepSimulation(dt);
  renderer.render(world);
  hudAcc += dt;
  if (hudAcc >= 0.14) {
    hudAcc = 0;
    updateStatsHud();
  }
  requestAnimationFrame(tick);
}

if (!holdLoop) {
  requestAnimationFrame(tick);
}
