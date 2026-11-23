/**
 * Airwolf Midnight Pixel City (@aastack/core).
 * Playable dual-resolution (Classic 28-Slice / HD 56-Slice) miniature pixel-city showcase:
 *  - Wide diorama establishing shot framing the entire midnight coastal island, Art Deco skyline,
 *    harbor pier, moored boats, Keeper's Cottage + Coastal Lighthouse, and cruising taxis/police
 *  - Live Detail Toggle (G): hot-swaps Classic 1x (28-slice) <-> HD 2x (56-slice) in place
 *  - Real 6-DOF helicopter physics + Mach Turbo Boost (Shift) + Rooftop H Helipad landing (L)
 *  - Real-time volumetric nose searchlight cone + exact 3D voxel-DDA raycast + Bayer-dithered ground pool
 *  - Exploded Slice Assembly Mode (X): draws all 28 (Classic) or 56 (HD) slices in 1 WebGL2 instanced draw call
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
  type VolumeAsset,
} from "@aastack/core";
import {
  createAirwolfFuselageAsset,
  createCityCarAsset,
  createHarborBoatAsset,
  createHelipadTowerAsset,
  createLightProxyAsset,
  createLighthouseAsset,
  createMainRotorAsset,
  createParkTreeAsset,
  createStreetLampAsset,
  createTailRotorAsset,
  createTowerAsset,
  type DetailLevel,
} from "./assets.js";
import { CITY_GROUND_FS } from "./city-ground-shader.js";

type CamMode = "iso" | "chase" | "orbit";
type TodPreset = "night" | "sunset" | "day";

const HELIPAD_POS: Vec3 = [-13, 20 * 0.62, -12]; // 12.40 exact rooftop height
const LIGHTHOUSE_POS: Vec3 = [0, 0, -73];
const LIGHTHOUSE_BEACON_POS: Vec3 = [0, 26.8 * 0.58, -73];
const AIRWOLF_SCALE = 0.78;
const MAX_SLICES = 56;

// ---------------------------------------------------------------------------
// 1. Parse URL Query Parameters (deterministic visual QA & deep-links)
// ---------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
const noHud = params.get("nohud") === "1";
const holdLoop = params.get("hold") === "1";
if (noHud) document.body.classList.add("nohud");

const initQuality = (params.get("quality") as AAQuality | null) ?? "ultra";
const initDetail: DetailLevel = params.get("detail") === "classic" ? "classic" : "hd";

// ---------------------------------------------------------------------------
// 2. Initialize WebGL2 AASpriteRenderer + Midnight Pixel City SceneWorld
// ---------------------------------------------------------------------------
const canvas = document.getElementById("c") as HTMLCanvasElement;

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
    pos: [52, 46, 56],
    target: [0, 10, -10],
    up: [0, 1, 0],
    fovDeg: 38,
    orthoSize: 36,
    near: 0.4,
    far: 700,
  },
  lighting: {
    sunAzimuthDeg: 34,
    sunElevationDeg: 42,
    timeOfDay: 0.94,
    fogDensity: 0.22,
    shadeStyle: "toon-aa",
    outlineWidth: 0.84,
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
// 3. Dual-Resolution Asset Cache (Classic 1x / HD 2x live hot-swap!)
// ---------------------------------------------------------------------------
const assetPacks: Partial<Record<DetailLevel, VolumeAsset[]>> = {};
world.registerAsset(createLightProxyAsset());

function buildAssetPack(detail: DetailLevel): VolumeAsset[] {
  return [
    createAirwolfFuselageAsset(detail),
    createMainRotorAsset(detail),
    createTailRotorAsset(detail),
    createHelipadTowerAsset(detail),
    createLighthouseAsset(detail),
    createStreetLampAsset(detail),
    createParkTreeAsset(detail),
    // 6 handcrafted miniature diorama skyline blueprints
    createTowerAsset("tower_artdeco_tall", 18, 18, 34, 11, "artdeco", detail),
    createTowerAsset("tower_glass_mid", 20, 16, 26, 23, "glass", detail),
    createTowerAsset("tower_neon_hotel", 20, 18, 28, 37, "neon", detail),
    createTowerAsset("tower_brick_lofts", 18, 18, 20, 51, "brick", detail),
    createTowerAsset("tower_waterfront", 18, 16, 16, 67, "glass", detail),
    createTowerAsset("tower_neon_low", 16, 16, 18, 83, "neon", detail),
    // Moored harbor vessels
    createHarborBoatAsset("boat_tug", [188, 48, 52], detail),
    createHarborBoatAsset("boat_patrol", [54, 96, 148], detail),
    // Cruising midnight street traffic
    createCityCarAsset("car_taxi", [244, 196, 46], "taxi", detail),
    createCityCarAsset("car_police", [34, 42, 62], "police", detail),
    createCityCarAsset("car_crimson", [214, 52, 62], "sedan", detail),
  ];
}

function applyDetailPack(detail: DetailLevel): void {
  state.detail = detail;
  if (!assetPacks[detail]) {
    assetPacks[detail] = buildAssetPack(detail);
  }
  for (const a of assetPacks[detail]!) {
    world.registerAsset(a);
  }
  // Slightly finer JFA outline scale at HD 2x so intricate mullions, fire escapes & water towers stay ultra-crisp!
  world.doc.lighting.outlineWidth = detail === "hd" ? 0.68 : 0.88;
  // Sync exploded slice clips to active slice count (28 for Classic, 56 for HD)
  const activeSlices = detail === "hd" ? 56 : 28;
  for (let z = 0; z < MAX_SLICES; z++) {
    const sl = world.getEntity(`airwolf_s${z}`);
    if (!sl) continue;
    if (z < activeSlices) {
      sl.sliceClip = [z / activeSlices, (z + 1) / activeSlices];
    } else {
      sl.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Populate Midnight City, Harbor Pier, Moored Boats, Streetlamps, Trees, Cars & Airwolf
// ---------------------------------------------------------------------------
const initialEntities: EntityState[] = [];

// Shadow-caster slot 0 (ALWAYS present): Airwolf drop shadow onto streets & bay
initialEntities.push({
  id: "heli_shadow_proxy",
  assetId: "light_proxy",
  pos: [-14, 21, -36],
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
  pos: [-14, 0.2, -24],
  rot: quatIdentity(),
  scale: 4.8,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Hero Airwolf Bell 222A Fuselage
initialEntities.push({
  id: "airwolf",
  assetId: "airwolf_hull",
  pos: [-14, 21, -36],
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

// Up to 56 single-slice instanced entities for Exploded Slice Assembly Mode (1 WebGL2 instanced draw call!)
for (let z = 0; z < MAX_SLICES; z++) {
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
    sliceClip: [z / MAX_SLICES, (z + 1) / MAX_SLICES],
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

// Iconic Red-and-White Coastal Lighthouse + Keeper's Cottage at end of harbor pier (0, 0, -73)
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

// Moored Harbor Tugboat & Coastal Patrol Boat bobbing beside the stone pier slips!
initialEntities.push({
  id: "harbor_tug",
  assetId: "boat_tug",
  pos: [-12.5, 0.05, -62.5],
  rot: quatFromYawPitchRoll(0.32, 0, 0),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.65,
  tag: "boat",
});
initialEntities.push({
  id: "harbor_patrol",
  assetId: "boat_patrol",
  pos: [13.5, 0.05, -52.0],
  rot: quatFromYawPitchRoll(-0.45, 0, 0),
  scale: 0.92,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.65,
  tag: "boat",
});

// Skyline block specs aligned cleanly between avenues (X = -26, 0, 26; Z = -24, 0, 24)
const BLOCK_BUILDINGS: Array<{ id: string; asset: string; x: number; z: number; yawDeg: number; halfW: number; halfL: number; topY: number }> = [
  // North harbor waterfront row (Z = -36) — low stepped waterfront framing the North Pier & Coastal Lighthouse!
  { id: "b_nw", asset: "tower_brick_lofts", x: -39, z: -36, yawDeg: 0, halfW: 6.0, halfL: 6.0, topY: 20 * 0.62 },
  { id: "b_n1", asset: "tower_waterfront", x: -13, z: -36, yawDeg: 90, halfW: 6.0, halfL: 5.4, topY: 16 * 0.62 },
  { id: "b_n2", asset: "tower_neon_low", x: 13, z: -36, yawDeg: 180, halfW: 5.4, halfL: 5.4, topY: 18 * 0.62 },
  { id: "b_ne", asset: "tower_glass_mid", x: 39, z: -36, yawDeg: 0, halfW: 6.5, halfL: 5.5, topY: 26 * 0.62 },
  // Mid-north row (Z = -12) — note (-13, -12) is HQ Helipad Tower!
  { id: "b_w1", asset: "tower_glass_mid", x: -39, z: -12, yawDeg: 90, halfW: 5.5, halfL: 6.5, topY: 26 * 0.62 },
  { id: "b_c1", asset: "tower_artdeco_tall", x: 13, z: -12, yawDeg: 0, halfW: 6.0, halfL: 6.0, topY: 36 * 0.62 },
  { id: "b_e1", asset: "tower_artdeco_tall", x: 39, z: -12, yawDeg: 270, halfW: 6.0, halfL: 6.0, topY: 36 * 0.62 },
  // Mid-south row (Z = +12) — note (-13, 12) is Central Pocket Park + Fountain!
  { id: "b_w2", asset: "tower_neon_hotel", x: -39, z: 12, yawDeg: 0, halfW: 6.5, halfL: 6.0, topY: 28 * 0.62 },
  { id: "b_c2", asset: "tower_neon_hotel", x: 13, z: 12, yawDeg: 180, halfW: 6.5, halfL: 6.0, topY: 28 * 0.62 },
  { id: "b_e2", asset: "tower_brick_lofts", x: 39, z: 12, yawDeg: 90, halfW: 6.0, halfL: 6.0, topY: 20 * 0.62 },
  // South skyline row (Z = +36)
  { id: "b_sw", asset: "tower_artdeco_tall", x: -39, z: 36, yawDeg: 0, halfW: 6.0, halfL: 6.0, topY: 36 * 0.62 },
  { id: "b_s1", asset: "tower_glass_mid", x: -13, z: 36, yawDeg: 180, halfW: 6.5, halfL: 5.5, topY: 26 * 0.62 },
  { id: "b_s2", asset: "tower_brick_lofts", x: 13, z: 36, yawDeg: 180, halfW: 6.0, halfL: 6.0, topY: 20 * 0.62 },
  { id: "b_se", asset: "tower_neon_low", x: 39, z: 36, yawDeg: 0, halfW: 5.4, halfL: 5.4, topY: 18 * 0.62 },
];

for (const b of BLOCK_BUILDINGS) {
  initialEntities.push({
    id: b.id,
    assetId: b.asset,
    pos: [b.x, 0, b.z],
    rot: quatFromYawPitchRoll((b.yawDeg * Math.PI) / 180, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.45,
    tag: "building",
  });
}

// Pocket Park trees nestled around the fountain at (-13, 0, 12) + waterfront promenade trees
const TREE_COORDS: Array<[number, number, number]> = [
  [-18.8, 7.4, 1.05],
  [-7.2, 7.4, 0.95],
  [-18.6, 16.6, 1.0],
  [-7.4, 16.4, 1.08],
  [-13.0, 6.8, 0.92],
  [-18.8, 12.0, 0.95],
  [-30.0, -45.5, 0.85],
  [30.0, -45.5, 0.85],
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

// Slender 1px Streetlamps lining avenues & North Lighthouse Pier (1 instanced draw call!)
const LAMP_COORDS: Array<[number, number, number]> = [
  [-5.2, -5.2, 0], [5.2, 5.2, Math.PI],
  [-5.2, 18.8, 0], [5.2, -18.8, Math.PI],
  [-31.2, -5.2, 0], [-20.8, 5.2, Math.PI],
  [20.8, -5.2, 0], [31.2, 5.2, Math.PI],
  [-5.2, 29.2, 0], [5.2, 29.2, Math.PI],
  [-31.2, 29.2, 0], [31.2, 29.2, Math.PI],
  [-20.8, -18.8, 0], [20.8, -18.8, Math.PI],
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

// 12 Midnight Cruising Street Cars (Taxis, Police Cruisers, Crimson Sedans)
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
const CAR_ASSETS = ["car_taxi", "car_police", "car_crimson"];

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
// 5. Simulation State: Wide Diorama Framing, HD/Classic Detail, 6-DOF Physics
// ---------------------------------------------------------------------------
const state = {
  detail: initDetail as DetailLevel,
  pos: [-14, 21, -36] as Vec3,
  vel: [0, 0, 0] as Vec3,
  yaw: 0.42,
  pitch: -0.16,
  roll: 0.16,
  rotorAng: 0,
  tailAng: 0,
  turbo: 0,
  turboForced: params.get("turbo") === "1",
  autopilot: params.get("autopilot") !== "0",
  landed: false,
  landingToPad: false,
  searchlightOn: params.get("searchlight") !== "0",
  exploded: params.get("cam") === "exploded",
  explodeT: params.get("cam") === "exploded" ? 1 : 0,

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
  // Wide sweeping diorama opening shot framing the full glowing island, skyline, harbor boats, lighthouse & Airwolf!
  orbitYawOffset: 0.52,
  orbitPitchOffset: 0.43,
  zoomDist: 86,
  camPosSmooth: [46, 48, 58] as Vec3,
  camTargetSmooth: [-2, 10, -14] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,
  simTime: Number(params.get("t") ?? 18.4) || 18.4,
  spotWorld: [-10, 0.2, -24] as Vec3,
  spotTargetLabel: "Midnight Avenue",
};

const trailL: RibbonPoint[] = [];
const trailR: RibbonPoint[] = [];

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
    world.doc.lighting.fogDensity = 0.20;
  } else if (preset === "sunset") {
    world.doc.lighting.timeOfDay = 0.52;
    world.doc.lighting.sunAzimuthDeg = -32;
    world.doc.lighting.sunElevationDeg = 18;
    world.doc.lighting.fogDensity = 0.26;
  } else {
    world.doc.lighting.timeOfDay = 0.06;
    world.doc.lighting.sunAzimuthDeg = 42;
    world.doc.lighting.sunElevationDeg = 56;
    world.doc.lighting.fogDensity = 0.18;
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
    const d = state.detail === "hd" ? "HD 56-Slice" : "Classic 28-Slice";
    rightLbl.textContent = `RIGHT: AASpriteStacker (${s} RGSS AA + ${d})`;
  }
}

function sampleAutopilotPose(t: number): { pos: Vec3; vel: Vec3; yaw: number; bank: number; turboPulse: number } {
  const w = 0.22;
  const a = t * w;
  const xAt = (s: number) => Math.sin(s) * 26.0 + Math.sin(s * 2.0) * 7.5;
  const zAt = (s: number) => -18.0 + Math.cos(s) * 44.0 - Math.cos(s * 2.0) * 5.0;
  const yAt = (s: number) => 20.5 + Math.sin(s * 1.5 + 0.4) * 3.0;

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

  const yaw = Math.atan2(-vx, -vz);
  const yawPrev = Math.atan2(-vxPrev, -vzPrev);
  let dYaw = yaw - yawPrev;
  while (dYaw > Math.PI) dYaw -= Math.PI * 2;
  while (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const yawRate = dYaw / dtSec;

  const bank = clamp(-yawRate * 0.72, -0.52, 0.52);
  const turboPulse = clamp(Math.sin(a * 2.0 - 0.8) * 1.4 - 0.55, 0, 1);
  return { pos: [x, y, z], vel: [vx, vy, vz], yaw, bank, turboPulse };
}

function getObstacleCeiling(x: number, z: number): number {
  if (Math.abs(x - HELIPAD_POS[0]) < 7.2 && Math.abs(z - HELIPAD_POS[2]) < 7.2) {
    return HELIPAD_POS[1] + 2.12;
  }
  if (Math.hypot(x - LIGHTHOUSE_POS[0], z - LIGHTHOUSE_POS[2]) < 7.2) {
    return 22.5;
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

  // 1. Coastal Lighthouse Rotating Volumetric Bay Beam (synced 1:1 with CITY_GROUND_FS!)
  const lhAng = world.doc.terrain.waveTime * 0.72 + 0.65;
  const lhDir: Vec3 = [Math.cos(lhAng), -0.17, Math.sin(lhAng)];
  const lhPts: RibbonPoint[] = [];
  const lhLen = 54;
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    lhPts.push({
      pos: [
        LIGHTHOUSE_BEACON_POS[0] + lhDir[0] * (1.4 + u * lhLen),
        Math.max(0.4, LIGHTHOUSE_BEACON_POS[1] + lhDir[1] * (1.4 + u * lhLen)),
        LIGHTHOUSE_BEACON_POS[2] + lhDir[2] * (1.4 + u * lhLen),
      ],
      age: 0.08 + u * 0.84,
      width: 1.0 + u * 16.5,
    });
  }
  ribbons.push({
    id: "lighthouse_beam",
    points: lhPts,
    color: [255, 232, 146] as [number, number, number],
    alpha: 0.14 + nightW * 0.25,
    emissive: true,
  });

  // 2. Airwolf Real-Time Volumetric Nose Searchlight Cone + Exact 3D Voxel-DDA Raycast!
  const spotEnt = world.getEntity("searchlight_spot")!;
  if (state.searchlightOn && state.explodeT < 0.15) {
    const sockPos = world.getSocketWorldPos("airwolf", "searchlight") ?? state.pos;
    const sweep = state.autopilot ? Math.sin(state.simTime * 1.15) * 0.28 : Math.sin(state.simTime * 0.7) * 0.12;
    const aimYaw = state.yaw + sweep;
    const aimPitch = clamp(-0.56 + state.pitch * 0.45, -1.05, -0.26);
    const cp = Math.cos(aimPitch);
    const beamDir: Vec3 = vec3Norm([-Math.sin(aimYaw) * cp, Math.sin(aimPitch), -Math.cos(aimYaw) * cp]);

    const tGround = beamDir[1] < -0.04 ? clamp((0.15 - sockPos[1]) / beamDir[1], 4, 88) : 64;
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
          : hit.entityId.startsWith("harbor_")
            ? "Harbor Vessel"
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

    spotEnt.pos = [state.spotWorld[0], 0.2, state.spotWorld[2]];
    spotEnt.scale = hit ? 3.5 : 5.4;

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
      outerPts.push({ pos: p, age: 0.04 + u * 0.84, width: 0.9 + u * 20.5 });
      innerPts.push({ pos: p, age: 0.02 + u * 0.80, width: 0.45 + u * 8.2 });
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
    state.spotTargetLabel = state.exploded
      ? `${state.detail === "hd" ? 56 : 28}-Slice Inspect`
      : "Off";
  }

  // 3. Sleek Twin Supersonic Dorsal Turbojet Afterburner Ribbons
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

  const targetExplode = state.exploded ? 1 : 0;
  state.explodeT = lerp(state.explodeT, targetExplode, 1 - Math.exp(-safeDt * 6.0));
  if (Math.abs(state.explodeT - targetExplode) < 0.002) state.explodeT = targetExplode;

  // Gently bob moored harbor tugboat & patrol yacht on midnight waves
  const tug = world.getEntity("harbor_tug");
  if (tug) {
    tug.pos[1] = 0.08 + Math.sin(state.simTime * 1.9) * 0.14;
    tug.rot = quatFromYawPitchRoll(0.32, Math.sin(state.simTime * 1.4) * 0.04, Math.cos(state.simTime * 1.7) * 0.05);
  }
  const patrol = world.getEntity("harbor_patrol");
  if (patrol) {
    patrol.pos[1] = 0.08 + Math.sin(state.simTime * 2.2 + 1.4) * 0.12;
    patrol.rot = quatFromYawPitchRoll(-0.45, Math.cos(state.simTime * 1.6) * 0.04, Math.sin(state.simTime * 1.9) * 0.05);
  }

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

  const turboKey = keys.has("ShiftLeft") || keys.has("ShiftRight") || state.turboForced;

  if (state.exploded) {
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
    const target: Vec3 = [HELIPAD_POS[0], HELIPAD_POS[1] + 2.12, HELIPAD_POS[2]];
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

    state.pos[0] = clamp(state.pos[0] + state.vel[0] * safeDt, -74, 74);
    state.pos[2] = clamp(state.pos[2] + state.vel[2] * safeDt, -92, 64);
    state.pos[1] = clamp(state.pos[1] + state.vel[1] * safeDt, 3.4, 52);

    const floorY = getObstacleCeiling(state.pos[0], state.pos[2]);
    if (state.pos[1] < floorY) {
      state.pos[1] = floorY;
      if (state.vel[1] < 0) state.vel[1] = 0;
      if (Math.hypot(state.pos[0] - HELIPAD_POS[0], state.pos[2] - HELIPAD_POS[2]) < 6.5 && climbIn <= 0 && fwdIn === 0) {
        state.landed = true;
      }
    }

    const fwdSpeed = state.vel[0] * fwdX + state.vel[2] * fwdZ;
    const targetPitch = state.landed ? 0 : -clamp(fwdSpeed * 0.015 + fwdIn * 0.14 + state.turbo * 0.12, -0.26, 0.38);
    const targetRoll = state.landed ? 0 : clamp(-yawIn * (0.28 + Math.min(Math.abs(fwdSpeed), 22) * 0.014), -0.58, 0.58);
    state.pitch = lerp(state.pitch, targetPitch, 1 - Math.exp(-safeDt * 6.0));
    state.roll = lerp(state.roll, targetRoll, 1 - Math.exp(-safeDt * 6.0));

    state.rotorAng += safeDt * (state.landed ? 9.5 : 27.0 + state.turbo * 16.0);
    state.tailAng += safeDt * (state.landed ? 14.0 : 40.0);
  }

  // Apply transforms to Airwolf hull, shadow proxy, rotors, and 28/56 exploded slices!
  const airwolf = world.getEntity("airwolf")!;
  airwolf.pos = [...state.pos];
  airwolf.rot = quatFromYawPitchRoll(state.yaw, state.pitch, state.roll);
  const showSlices = state.explodeT > 0.015;
  airwolf.visible = !showSlices;

  const shadowProxy = world.getEntity("heli_shadow_proxy")!;
  shadowProxy.pos = [...state.pos];

  const mainRotor = world.getEntity("airwolf_main_rotor")!;
  mainRotor.pos = [0, state.explodeT * 6.4, 0];
  mainRotor.rot = quatFromYawPitchRoll(state.rotorAng, 0, 0);

  const tailRotor = world.getEntity("airwolf_tail_rotor")!;
  tailRotor.pos = [-state.explodeT * 2.5, 0, 0];
  tailRotor.rot = quatFromYawPitchRoll(0, state.tailAng, 0);

  const activeSlices = state.detail === "hd" ? 56 : 28;
  const gapPerSlice = state.detail === "hd" ? 0.22 : 0.44;
  for (let z = 0; z < MAX_SLICES; z++) {
    const sl = world.getEntity(`airwolf_s${z}`)!;
    const active = showSlices && z < activeSlices;
    sl.visible = active;
    if (active) {
      sl.pos[1] = (z - (activeSlices - 1) * 0.5) * gapPerSlice * state.explodeT;
    }
  }

  updateSearchlightAndRibbons(safeDt);
  updateCamera(safeDt);
}

function updateCamera(dt: number, snap = false): void {
  const cam = world.doc.camera;
  const fwdX = -Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);

  let wantPos: Vec3;
  let wantTarget: Vec3;
  let wantUp: Vec3 = [0, 1, 0];
  let wantFov = 38;

  if (state.explodeT > 0.25) {
    const orbYaw = state.yaw + state.orbitYawOffset + state.simTime * 0.20;
    const dist = clamp(state.zoomDist * 0.34, 21, 34);
    const elev = clamp(state.orbitPitchOffset * 0.62, 0.14, 0.65);
    wantPos = [
      state.pos[0] + Math.sin(orbYaw) * Math.cos(elev) * dist,
      state.pos[1] + Math.sin(elev) * dist + 1.0,
      state.pos[2] + Math.cos(orbYaw) * Math.cos(elev) * dist,
    ];
    wantTarget = [state.pos[0], state.pos[1] + 0.9, state.pos[2]];
    wantFov = 40;
  } else if (state.camMode === "chase") {
    const dist = 17.0 + state.turbo * 3.8;
    const height = 5.8 - state.turbo * 0.8;
    wantPos = [
      state.pos[0] - fwdX * dist,
      Math.max(4.5, state.pos[1] + height),
      state.pos[2] - fwdZ * dist,
    ];
    wantTarget = [
      state.pos[0] + fwdX * 14.0,
      state.pos[1] - 1.8,
      state.pos[2] + fwdZ * 14.0,
    ];
    const bankCam = state.roll * 0.28;
    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    wantUp = vec3Norm([rightX * Math.sin(bankCam), Math.cos(bankCam), rightZ * Math.sin(bankCam)]);
    wantFov = 50 + state.turbo * 8;
  } else if (state.camMode === "orbit") {
    const a = state.orbitYawOffset + state.simTime * 0.14;
    const r = clamp(state.zoomDist * 1.15, 58, 130);
    const elev = clamp(state.orbitPitchOffset, 0.22, 1.05);
    wantPos = [Math.sin(a) * Math.cos(elev) * r, Math.sin(elev) * r + 10, -14 + Math.cos(a) * Math.cos(elev) * r];
    wantTarget = [0, 9, -14];
    wantFov = 38;
  } else {
    // Wide Miniature Diorama Establishing Shot!
    // When zoomed wide (default ~86), anchors gracefully on the full glowing island + north lighthouse bay;
    // as you zoom in closer (wheel in), smoothly tracks right onto Airwolf!
    const dist = clamp(state.zoomDist, 24, 128);
    const closeTrack = clamp((78 - dist) / 48, 0, 1);
    const wHeli = lerp(0.32, 0.85, closeTrack);
    const elev = clamp(state.orbitPitchOffset, 0.20, 1.15);
    const az = state.orbitYawOffset;

    wantTarget = [
      lerp(-2.0, state.pos[0] + fwdX * 3.5, wHeli),
      lerp(10.5, state.pos[1] * 0.72 + 2.5, wHeli),
      lerp(-18.0, state.pos[2] + fwdZ * 3.5, wHeli),
    ];
    wantPos = [
      wantTarget[0] + Math.sin(az) * Math.cos(elev) * dist,
      Math.max(9, wantTarget[1] + Math.sin(elev) * dist),
      wantTarget[2] + Math.cos(az) * Math.cos(elev) * dist,
    ];
    wantFov = 38;
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
  setPressed("btnDetail_classic", state.detail === "classic");
  setPressed("btnDetail_hd", state.detail === "hd");

  const expBtn = document.getElementById("btnExplode");
  if (expBtn) expBtn.textContent = `Exploded ${state.detail === "hd" ? "56" : "28"}-Slice (X)`;

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
  const sliceNum = state.detail === "hd" ? 56 : 28;
  const detailTag = state.detail === "hd" ? "HD 2x (56-Slice)" : "Classic 1x (28-Slice)";
  const modeStr = state.exploded
    ? `EXPLODED ${sliceNum}-SLICE (1 instanced draw call)`
    : state.landed
      ? "ROOFTOP H HELIPAD (IDLE)"
      : state.turbo > 0.35
        ? "MACH TURBO BOOST"
        : state.autopilot
          ? "AUTOPILOT PATROL"
          : "MANUAL 6-DOF FLIGHT";
  statsEl.textContent =
    `STATUS  ${modeStr}  |  ${detailTag}\n` +
    `FLIGHT  ${String(spdKts).padStart(3, " ")} KTS  |  ALT ${String(altFt).padStart(3, " ")} FT  |  SPOT: ${state.spotTargetLabel}\n` +
    `ENGINE  ${s.fps.toFixed(0).padStart(2, " ")} FPS  |  ${s.drawCalls} draws (${s.visibleEntities}/${s.totalEntities} ents)  |  ${s.activeSamples}x RGSS AA`;
}

document.getElementById("btnCamIso")?.addEventListener("click", () => { state.exploded = false; state.camMode = "iso"; syncUiButtons(); });
document.getElementById("btnCamChase")?.addEventListener("click", () => { state.exploded = false; state.camMode = "chase"; syncUiButtons(); });
document.getElementById("btnCamOrbit")?.addEventListener("click", () => { state.exploded = false; state.camMode = "orbit"; syncUiButtons(); });
document.getElementById("btnExplode")?.addEventListener("click", () => { state.exploded = !state.exploded; syncUiButtons(); });
document.getElementById("btnAutopilot")?.addEventListener("click", () => {
  state.exploded = false; state.landingToPad = false; state.landed = false;
  state.autopilot = !state.autopilot;
  syncUiButtons();
});
document.getElementById("btnTurbo")?.addEventListener("click", () => {
  state.exploded = false; state.landingToPad = false; state.landed = false;
  state.turboForced = !state.turboForced;
  syncUiButtons();
});
document.getElementById("btnSpot")?.addEventListener("click", () => { state.searchlightOn = !state.searchlightOn; syncUiButtons(); });
document.getElementById("btnPad")?.addEventListener("click", () => {
  state.exploded = false;
  if (state.landed || state.landingToPad) {
    state.landed = false; state.landingToPad = false; state.autopilot = true;
  } else {
    state.autopilot = false; state.turboForced = false; state.landingToPad = true;
  }
  syncUiButtons();
});
document.getElementById("btnSplit")?.addEventListener("click", () => { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); });

document.getElementById("btnDetail_classic")?.addEventListener("click", () => { applyDetailPack("classic"); applySplit(); syncUiButtons(); });
document.getElementById("btnDetail_hd")?.addEventListener("click", () => { applyDetailPack("hd"); applySplit(); syncUiButtons(); });

for (const t of ["night", "sunset", "day"] as TodPreset[]) {
  document.getElementById(`btnTod_${t}`)?.addEventListener("click", () => { applyTod(t); syncUiButtons(); });
}
for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) {
  document.getElementById(`btnQual_${q}`)?.addEventListener("click", () => { applyQuality(q); applySplit(); syncUiButtons(); });
}

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  keys.add(e.code);

  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyR", "KeyC", "KeyF"].includes(e.code)) {
    if (state.autopilot || state.landingToPad) {
      state.autopilot = false; state.landingToPad = false; state.exploded = false;
      syncUiButtons();
    }
    if (e.code === "Space") e.preventDefault();
  }

  if (e.code === "KeyX") { state.exploded = !state.exploded; syncUiButtons(); }
  else if (e.code === "KeyG") { applyDetailPack(state.detail === "hd" ? "classic" : "hd"); applySplit(); syncUiButtons(); }
  else if (e.code === "KeyV") {
    state.exploded = false;
    state.camMode = state.camMode === "iso" ? "chase" : state.camMode === "chase" ? "orbit" : "iso";
    syncUiButtons();
  } else if (e.code === "KeyP") { state.exploded = false; state.landingToPad = false; state.autopilot = !state.autopilot; syncUiButtons(); }
  else if (e.code === "KeyM") { state.searchlightOn = !state.searchlightOn; syncUiButtons(); }
  else if (e.code === "KeyE") { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); }
  else if (e.code === "KeyN") { applyTod(state.tod === "night" ? "sunset" : state.tod === "sunset" ? "day" : "night"); syncUiButtons(); }
  else if (e.code === "KeyL") { document.getElementById("btnPad")?.click(); }
  else if (e.code === "KeyH" || e.code === "KeyU") { document.body.classList.toggle("nohud"); }
});
window.addEventListener("keyup", (e) => { keys.delete(e.code); });

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
window.addEventListener("pointerup", () => { dragSplit = false; dragOrbit = false; });
canvas.addEventListener("pointerdown", (e) => { dragOrbit = true; lastPtrX = e.clientX; lastPtrY = e.clientY; });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  state.zoomDist = clamp(state.zoomDist + e.deltaY * 0.045, 24, 128);
}, { passive: false });

// ---------------------------------------------------------------------------
// 7. Initial Pose, Deterministic API Hook, and 60fps Loop
// ---------------------------------------------------------------------------
applyDetailPack(state.detail);
applyTod(state.tod);
applyQuality(state.quality);
applySplit();

const initAp = sampleAutopilotPose(state.simTime);
state.pos = [...initAp.pos];
state.vel = [...initAp.vel];
state.yaw = initAp.yaw;
state.pitch = -0.18;
state.roll = initAp.bank;
state.turbo = state.turboForced ? 1 : initAp.turboPulse * 0.65;

stepSimulation(0.016);
updateCamera(1.0, true);
renderer.render(world);
syncUiButtons();
updateStatsHud();
document.body.classList.add("ready");

declare global {
  interface Window {
    heliDemo?: {
      world: SceneWorld;
      renderer: AASpriteRenderer;
      set: (opts: Partial<{
        detail: DetailLevel;
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
    if (opts.detail !== undefined && opts.detail !== state.detail) applyDetailPack(opts.detail);
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
