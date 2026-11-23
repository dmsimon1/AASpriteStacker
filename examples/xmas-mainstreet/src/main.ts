/**
 * Main Street Christmas — Ultra-Detail Winter Village Diorama (@aastack/core).
 * Showcases ultra-high-detail procedural voxel architecture, graded continuous emissive lighting,
 * overhead catenary festoon light strands, 6-DOF Santa's Sleigh flight, gliding Holiday Trolley,
 * reflective Frozen Ice Skating Rink with spinning skaters, drifting 3D snowflakes, and live
 * Detail: Classic 1x / Ultra HD 2x + A/B Split comparison.
 */

import {
  AASpriteRenderer,
  SceneWorld,
  clamp,
  createVolumeAsset,
  lerp,
  quatFromYawPitchRoll,
  quatIdentity,
  vec3Norm,
  type AAQuality,
  type EntityState,
  type RibbonPoint,
  type RibbonState,
  type Vec3,
  type VolumeAsset,
} from "@aastack/core";
import {
  createClocktowerHallAsset,
  createHolidayTrolleyAsset,
  createLightProxyAsset,
  createMarketStallAsset,
  createSantaSleighAsset,
  createSnowPineAsset,
  createSnowmanAsset,
  createTownSquareTreeAsset,
  createVictorianLampAsset,
  createVictorianShopAsset,
  createWinterPersonAsset,
  createWoodyWagonAsset,
  type DetailLevel,
} from "./assets.js";
import { XMAS_GROUND_FS } from "./xmas-ground-shader.js";

type CamMode = "wide" | "street" | "plaza" | "sleigh";
type TodPreset = "eve" | "midnight" | "morning";
type SnowMode = "gentle" | "heavy" | "off";

const params = new URLSearchParams(window.location.search);
const noHud = params.get("nohud") === "1";
const holdLoop = params.get("hold") === "1";
if (noHud) document.body.classList.add("nohud");

const initQuality = (params.get("quality") as AAQuality | null) ?? "ultra";
const initDetail: DetailLevel = params.get("detail") === "classic" ? "classic" : "ultra";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new AASpriteRenderer(canvas, {
  background: "terrain",
  terrainShader: XMAS_GROUND_FS,
  quality: initQuality,
  instanceBatching: "aggressive",
  adaptiveDpr: !holdLoop,
  maxDpr: initQuality === "ultra" ? 2.0 : 1.5,
  preserveDrawingBuffer: true,
});

const world = new SceneWorld({
  seed: 25,
  style: "arcade-8bit",
  aaMode: "voxel-dda",
  samples: initQuality === "eco" ? 2 : initQuality === "balanced" ? 4 : 8,
  camera: {
    mode: "free",
    pos: [34, 34, 54],
    target: [-2, 6, -4],
    up: [0, 1, 0],
    fovDeg: 38,
    orthoSize: 32,
    near: 0.4,
    far: 650,
  },
  lighting: {
    sunAzimuthDeg: 32,
    sunElevationDeg: 34,
    timeOfDay: 0.78, // Magical Christmas Eve cobalt twilight!
    fogDensity: 0.24,
    shadeStyle: "toon-aa",
    outlineWidth: 0.56,
    selfShadow: true,
  },
  terrain: {
    enabled: true,
    seed: 25,
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

// Tiny crisp 1-voxel glowing snowflake asset (1 instanced draw call for 72 drifting flakes!)
function createSnowflakeAsset(): VolumeAsset {
  return createVolumeAsset({
    id: "snow_flake",
    name: "Snowflake",
    w: 2,
    l: 2,
    h: 2,
    voxelScale: 0.14,
    pivot: [1, 1, 1],
    rgba: new Uint8Array([
      244, 248, 255, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]),
    explicitEmissive: new Uint8Array([155, 0, 0, 0, 0, 0, 0, 0]),
    computeSdf: false,
    provenance: { kind: "blueprint", source: "xmas-mainstreet" },
  });
}

// ---------------------------------------------------------------------------
// 1. Dual-Resolution Asset Cache (Classic 1x <-> Ultra HD 2x live hot-swap!)
// ---------------------------------------------------------------------------
const assetPacks: Partial<Record<DetailLevel, VolumeAsset[]>> = {};
world.registerAsset(createLightProxyAsset());
world.registerAsset(createSnowflakeAsset());

function buildAssetPack(detail: DetailLevel): VolumeAsset[] {
  return [
    createTownSquareTreeAsset(detail),
    createClocktowerHallAsset(detail),
    createVictorianShopAsset("shop_toys", "toys", 11, detail),
    createVictorianShopAsset("shop_bakery", "bakery", 23, detail),
    createVictorianShopAsset("shop_books", "books", 37, detail),
    createVictorianShopAsset("shop_cinema", "cinema", 47, detail),
    createVictorianShopAsset("shop_jeweler", "jeweler", 59, detail),
    createVictorianShopAsset("shop_tavern", "tavern", 71, detail),
    createMarketStallAsset("stall_red", [188, 38, 46], detail),
    createMarketStallAsset("stall_green", [36, 108, 66], detail),
    createHolidayTrolleyAsset(detail),
    createWoodyWagonAsset("woody_green", [34, 92, 62], detail),
    createWoodyWagonAsset("woody_red", [176, 36, 44], detail),
    createSantaSleighAsset(detail),
    createVictorianLampAsset(detail),
    createSnowPineAsset(detail),
    createSnowmanAsset(detail),
    createWinterPersonAsset("skater_red", [198, 42, 52], [244, 214, 118], detail),
    createWinterPersonAsset("skater_blue", [44, 98, 178], [226, 48, 56], detail),
    createWinterPersonAsset("skater_green", [42, 128, 76], [240, 236, 224], detail),
  ];
}

function applyDetailPack(detail: DetailLevel): void {
  state.detail = detail;
  if (!assetPacks[detail]) {
    assetPacks[detail] = buildAssetPack(detail);
  }
  for (const a of assetPacks[detail]!) world.registerAsset(a);
  world.doc.lighting.outlineWidth = detail === "ultra" ? 0.56 : 0.78;
}

// ---------------------------------------------------------------------------
// 2. Populate Main Street Christmas Village
// ---------------------------------------------------------------------------
const initialEntities: EntityState[] = [];

// Shadow-caster slot 0 (ALWAYS present): Moving Holiday Trolley Headlight Pool!
initialEntities.push({
  id: "trolley_headlight_proxy",
  assetId: "light_proxy",
  pos: [0, 0.2, 8],
  rot: quatIdentity(),
  scale: 3.4,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Shadow-caster slot 1 (ALWAYS present): Santa's Sleigh Soft Aerial Shadow!
initialEntities.push({
  id: "sleigh_shadow_proxy",
  assetId: "light_proxy",
  pos: [0, 22, -6],
  rot: quatIdentity(),
  scale: 4.0,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Hero Landmark 1: Soaring Grand Clocktower Town Hall anchoring North Main Street (faces South +Z!)
initialEntities.push({
  id: "town_hall",
  assetId: "xmas_clocktower",
  pos: [0, 0, -35.5],
  rot: quatFromYawPitchRoll(Math.PI, 0, 0),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.25,
  tag: "landmark",
});

// Hero Landmark 2: Giant Decorated Town Square Christmas Tree dead center of the Plaza!
initialEntities.push({
  id: "giant_tree",
  assetId: "xmas_giant_tree",
  pos: [0, 0, -19.0],
  rot: quatIdentity(),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.45,
  tag: "landmark",
});

// 4 Cozy Wooden Christmas Market Stalls framing the Giant Christmas Tree in Town Square
const STALLS: Array<[string, string, number, number, number]> = [
  ["stall_ne", "stall_red", 9.6, -24.5, Math.PI * 0.72],
  ["stall_se", "stall_green", 9.6, -13.5, Math.PI * 0.28],
  ["stall_nw", "stall_green", -8.2, -26.0, -Math.PI * 0.75],
  ["stall_sw", "stall_red", -8.2, -12.0, -Math.PI * 0.25],
];
for (const [id, assetId, sx, sz, yaw] of STALLS) {
  initialEntities.push({
    id,
    assetId,
    pos: [sx, 0, sz],
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.3,
    tag: "prop",
  });
}

// 10 Handcrafted Victorian Shopfronts lining BOTH sides of Main Street!
// West row (X = -15.6) faces EAST (+X -> yaw = -PI/2); East row (X = +15.6) faces WEST (-X -> yaw = +PI/2)!
const WEST_SHOPS: Array<[string, string, number]> = [
  ["w_toys", "shop_toys", 2],
  ["w_bakery", "shop_bakery", 12],
  ["w_books", "shop_books", 22],
  ["w_jeweler", "shop_jeweler", 32],
  ["w_tavern", "shop_tavern", 42],
];
const EAST_SHOPS: Array<[string, string, number]> = [
  ["e_cinema", "shop_cinema", 2],
  ["e_jeweler", "shop_jeweler", 12],
  ["e_toys", "shop_toys", 22],
  ["e_bakery", "shop_bakery", 32],
  ["e_books", "shop_books", 42],
];
for (const [id, assetId, z] of WEST_SHOPS) {
  initialEntities.push({
    id,
    assetId,
    pos: [-15.6, 0, z],
    rot: quatFromYawPitchRoll(-Math.PI / 2, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.25,
    tag: "building",
  });
}
for (const [id, assetId, z] of EAST_SHOPS) {
  initialEntities.push({
    id,
    assetId,
    pos: [15.6, 0, z],
    rot: quatFromYawPitchRoll(Math.PI / 2, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.25,
    tag: "building",
  });
}

// Cozy North Star Inn framing the East Town Square wing (angled warmly toward Plaza & Main Street!)
initialEntities.push({
  id: "east_plaza_inn",
  assetId: "shop_tavern",
  pos: [22.5, 0, -21.5],
  rot: quatFromYawPitchRoll(Math.PI * 0.78, 0, 0),
  scale: 1.12,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.25,
  tag: "building",
});

// Vintage Red & Forest-Green Holiday Trolley gliding along the center Main Street tracks!
initialEntities.push({
  id: "holiday_trolley",
  assetId: "xmas_trolley",
  pos: [0, 0, 14],
  rot: quatIdentity(),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "vehicle",
});

// 2 Vintage 1950s Woody Station Wagons with snowy Christmas trees tied to their roofs!
initialEntities.push({
  id: "woody_northbound",
  assetId: "woody_green",
  pos: [3.9, 0, 28],
  rot: quatIdentity(),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "vehicle",
});
initialEntities.push({
  id: "woody_southbound",
  assetId: "woody_red",
  pos: [-3.9, 0, 8],
  rot: quatFromYawPitchRoll(Math.PI, 0, 0),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "vehicle",
});

// Santa's 6-DOF Sleigh + Reindeer Team with Rudolph's glowing nose soaring overhead!
initialEntities.push({
  id: "santa_sleigh",
  assetId: "santa_sleigh",
  pos: [12, 22, -6],
  rot: quatIdentity(),
  scale: 0.92,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.55,
  tag: "player",
});

// Ornate Victorian Garland Streetlamps lining Main Street sidewalks & Town Square Ice Rink!
const LAMP_POS: Array<[number, number]> = [
  [-7.0, -4], [7.0, -4],
  [-7.0, 8], [7.0, 8],
  [-7.0, 20], [7.0, 20],
  [-7.0, 32], [7.0, 32],
  [-7.0, 44], [7.0, 44],
  // Corner light poles around the Frozen Ice Skating Rink!
  [-10.2, -11.2], [-26.8, -11.2],
  [-10.2, -30.8], [-26.8, -30.8],
  // Flanking Town Hall Portico
  [-7.5, -31.0], [7.5, -31.0],
];
LAMP_POS.forEach(([lx, lz], i) => {
  initialEntities.push({
    id: `lamp_${i}`,
    assetId: "xmas_lamp",
    pos: [lx, 0, lz],
    rot: quatIdentity(),
    scale: 1.0,
    aaPriority: "hero",
    outline: false,
    emissiveBoost: 1.65,
    tag: "lamp",
  });
});

// Cheerful Snowmen cheering beside the Ice Rink & Town Hall!
const SNOWMEN: Array<[number, number, number]> = [
  [-10.4, -18.5, -Math.PI * 0.5],
  [9.2, -30.5, Math.PI * 0.85],
  [-10.5, 48.0, -Math.PI * 0.3],
];
SNOWMEN.forEach(([sx, sz, yaw], i) => {
  initialEntities.push({
    id: `snowman_${i}`,
    assetId: "xmas_snowman",
    pos: [sx, 0, sz],
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: 1.0,
    outline: true,
    tag: "prop",
  });
});

// 5 Bundled-Up Ice Skaters gliding smooth figure-8 loops across the Frozen Ice Rink (-18.5, -21)!
interface SkaterSpec {
  id: string;
  asset: string;
  phase: number;
  speed: number;
  rx: number;
  rz: number;
}
const SKATERS: SkaterSpec[] = [
  { id: "skater_0", asset: "skater_red", phase: 0.0, speed: 0.72, rx: 5.4, rz: 6.8 },
  { id: "skater_1", asset: "skater_blue", phase: 1.6, speed: 0.65, rx: 4.2, rz: 5.5 },
  { id: "skater_2", asset: "skater_green", phase: 3.1, speed: 0.82, rx: 5.8, rz: 6.2 },
  { id: "skater_3", asset: "skater_red", phase: 4.5, speed: -0.68, rx: 3.6, rz: 4.6 },
  { id: "skater_4", asset: "skater_blue", phase: 5.4, speed: 0.58, rx: 5.0, rz: 7.2 },
];
for (const sk of SKATERS) {
  initialEntities.push({
    id: sk.id,
    assetId: sk.asset,
    pos: [-18.5, 0, -21],
    rot: quatIdentity(),
    scale: 1.0,
    outline: true,
    tag: "skater",
  });
}

// Cozy Main Street Sidewalk Shoppers strolling by the glowing display windows!
const SHOPPERS: Array<[string, string, number, number, number]> = [
  ["shopper_0", "skater_red", -9.4, 3.5, -Math.PI * 0.4],
  ["shopper_1", "skater_blue", -8.8, 14.5, 0.2],
  ["shopper_2", "skater_green", 9.2, 4.2, Math.PI * 0.45],
  ["shopper_3", "skater_red", 8.6, 17.0, Math.PI],
  ["shopper_4", "skater_blue", -9.0, 26.5, -0.3],
  ["shopper_5", "skater_green", 9.0, 29.0, Math.PI * 0.8],
  ["shopper_6", "skater_red", 4.5, -13.5, 0.4],
  ["shopper_7", "skater_blue", -4.2, -13.8, -0.5],
];
for (const [id, assetId, px, pz, yaw] of SHOPPERS) {
  initialEntities.push({
    id,
    assetId,
    pos: [px, 0, pz],
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: 1.0,
    outline: true,
    tag: "shopper",
  });
}

// Enchanted Snow-Laden Perimeter Evergreen Forest framing the cozy village valley!
const PINES: Array<[number, number, number]> = [
  // Behind Clocktower Town Hall (North hills)
  [-24, -44, 1.25], [-16, -47, 1.35], [-8, -48, 1.15], [8, -48, 1.2], [16, -47, 1.4], [25, -44, 1.2],
  [-32, -38, 1.3], [-34, -28, 1.15], [-34, -18, 1.25], [-33, -8, 1.1],
  // West behind shopfronts
  [-27, 4, 1.2], [-28, 16, 1.35], [-27, 28, 1.15], [-28, 40, 1.3], [-22, 50, 1.1],
  // East behind shopfronts & North Star Inn
  [33, -34, 1.25], [34, -22, 1.35], [33, -10, 1.15],
  [27, 4, 1.25], [28, 16, 1.18], [27, 28, 1.32], [28, 40, 1.22], [22, 50, 1.15],
  // Accent snowy pines inside Town Square corners
  [-12, -37, 0.92], [13, -37, 0.95], [16, -10, 0.88],
];
PINES.forEach(([px, pz, sc], i) => {
  initialEntities.push({
    id: `pine_${i}`,
    assetId: "xmas_pine",
    pos: [px, 0, pz],
    rot: quatFromYawPitchRoll(i * 1.37, 0, 0),
    scale: sc,
    outline: true,
    tag: "tree",
  });
});

// 72 Gentle Drifting 3D Snowflakes (1 single WebGL2 instanced draw call!)
interface SnowflakeParticle {
  id: string;
  x0: number;
  z0: number;
  y: number;
  speed: number;
  phase: number;
}
const SNOWFLAKES: SnowflakeParticle[] = [];
for (let i = 0; i < 72; i++) {
  const rx = ((i * 73.13) % 1) * 72 - 36;
  const rz = ((i * 41.79) % 1) * 96 - 44;
  const ry = ((i * 19.37) % 1) * 28 + 1.5;
  SNOWFLAKES.push({
    id: `flake_${i}`,
    x0: rx,
    z0: rz,
    y: ry,
    speed: 2.0 + (i % 5) * 0.45,
    phase: i * 0.85,
  });
  initialEntities.push({
    id: `flake_${i}`,
    assetId: "snow_flake",
    pos: [rx, ry, rz],
    rot: quatIdentity(),
    scale: 1.0,
    outline: false,
    emissiveBoost: 1.0,
    tag: "snow",
  });
}

world.doc.entities = initialEntities;

// ---------------------------------------------------------------------------
// 3. Simulation State, Overhead Catenary Festoon String Lights & Camera Rig
// ---------------------------------------------------------------------------
const state = {
  detail: initDetail as DetailLevel,
  camMode: ((): CamMode => {
    const c = params.get("cam");
    if (c === "street" || c === "plaza" || c === "sleigh") return c;
    return "wide";
  })(),
  tod: ((): TodPreset => {
    const t = params.get("tod");
    if (t === "midnight" || t === "morning") return t;
    return "eve";
  })(),
  snowMode: "gentle" as SnowMode,
  quality: initQuality as AAQuality,
  splitEnabled: params.get("split") === "1",
  splitX: clamp(Number(params.get("splitX") ?? 0.5) || 0.5, 0.08, 0.92),
  simTime: Number(params.get("t") ?? 4.5) || 4.5,
  orbitYawOffset: 0.42,
  orbitPitchOffset: 0.44,
  zoomDist: 64,
  camPosSmooth: [28, 30, 50] as Vec3,
  camTargetSmooth: [-2, 6, -6] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,

  // Santa's Sleigh 6-DOF kinematics
  sleighManual: false,
  sleighPos: [10, 21, -8] as Vec3,
  sleighVel: [0, 0, 0] as Vec3,
  sleighYaw: 0.4,
  sleighPitch: -0.06,
  sleighRoll: 0.14,
};

const stardustL: RibbonPoint[] = [];
const stardustR: RibbonPoint[] = [];
const keys = new Set<string>();
let dragOrbit = false;
let dragSplit = false;
let lastPtrX = 0;
let lastPtrY = 0;

function applyTod(preset: TodPreset): void {
  state.tod = preset;
  if (preset === "eve") {
    world.doc.lighting.timeOfDay = 0.78;
    world.doc.lighting.sunAzimuthDeg = 32;
    world.doc.lighting.sunElevationDeg = 34;
    world.doc.lighting.fogDensity = 0.24;
  } else if (preset === "midnight") {
    world.doc.lighting.timeOfDay = 0.96;
    world.doc.lighting.sunAzimuthDeg = 28;
    world.doc.lighting.sunElevationDeg = 38;
    world.doc.lighting.fogDensity = 0.28;
  } else {
    world.doc.lighting.timeOfDay = 0.06;
    world.doc.lighting.sunAzimuthDeg = 42;
    world.doc.lighting.sunElevationDeg = 52;
    world.doc.lighting.fogDensity = 0.16;
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
  if (splitLabels) splitLabels.style.display = state.splitEnabled ? "flex" : "none";
  if (rightLbl) {
    const s = state.quality === "eco" ? "2x" : state.quality === "balanced" ? "4x" : "8x";
    const d = state.detail === "ultra" ? "Ultra HD 2x" : "Classic 1x";
    rightLbl.textContent = `RIGHT: AASpriteStacker (${s} RGSS AA + ${d})`;
  }
}

function makeCatenaryRibbon(id: string, p0: Vec3, p1: Vec3, sag: number, color: [number, number, number], width: number, alpha: number): RibbonState {
  const pts: RibbonPoint[] = [];
  const segs = 10;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const drop = Math.sin(u * Math.PI) * sag;
    pts.push({
      pos: [
        lerp(p0[0], p1[0], u),
        lerp(p0[1], p1[1], u) - drop,
        lerp(p0[2], p1[2], u),
      ],
      age: 0.12,
      width,
    });
  }
  return { id, points: pts, color, alpha, emissive: true };
}

function sampleSleighAutopilot(t: number): { pos: Vec3; vel: Vec3; yaw: number; bank: number } {
  const w = 0.24;
  const a = t * w;
  const xAt = (s: number) => Math.sin(s) * 26.0;
  const zAt = (s: number) => -4.0 + Math.cos(s) * 38.0;
  const yAt = (s: number) => 20.5 + Math.sin(s * 2.0) * 3.2;

  const eps = 0.04;
  const x = xAt(a), y = yAt(a), z = zAt(a);
  const xn = xAt(a + eps), yn = yAt(a + eps), zn = zAt(a + eps);
  const xp = xAt(a - eps), zp = zAt(a - eps);
  const dt = eps / w;
  const vx = (xn - x) / dt, vy = (yn - y) / dt, vz = (zn - z) / dt;
  const yaw = Math.atan2(-vx, -vz);
  const yawPrev = Math.atan2(-(x - xp) / dt, -(z - zp) / dt);
  let dy = yaw - yawPrev;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  return { pos: [x, y, z], vel: [vx, vy, vz], yaw, bank: clamp((-dy / dt) * 0.65, -0.45, 0.45) };
}

function stepSimulation(dt: number): void {
  const safeDt = Math.min(dt, 0.05);
  state.simTime += safeDt;
  world.stepClock(safeDt);

  // 1. Glide Vintage Red Holiday Trolley back and forth down Main Street rails!
  const trolley = world.getEntity("holiday_trolley")!;
  const trCycle = Math.sin(state.simTime * 0.18 - 1.15);
  const trVel = Math.cos(state.simTime * 0.18 - 1.15);
  const trZ = 15.0 + trCycle * 22.0; // glides cleanly between Z = -7 (Town Square) and Z = +37 (South Main St)
  const trHeadingSouth = trVel > 0;
  trolley.pos = [0, 0, trZ];
  trolley.rot = quatFromYawPitchRoll(trHeadingSouth ? Math.PI : 0, 0, 0);

  // Project live Trolley golden headlight pool ahead along the snowy rails!
  const hlProxy = world.getEntity("trolley_headlight_proxy")!;
  hlProxy.pos = [0, 0.2, trZ + (trHeadingSouth ? 7.8 : -7.8)];

  // 2. Cruise the 2 Vintage Woody Station Wagons along the Main Street lanes!
  const wNorth = world.getEntity("woody_northbound")!;
  let zn = wNorth.pos[2] - safeDt * 6.8;
  if (zn < -8) zn = 50;
  wNorth.pos[2] = zn;

  const wSouth = world.getEntity("woody_southbound")!;
  let zs = wSouth.pos[2] + safeDt * 6.2;
  if (zs > 50) zs = -8;
  wSouth.pos[2] = zs;

  // 3. Glide 5 Bundled-Up Ice Skaters smoothly in figure-8 & oval loops on the Frozen Ice Rink (-18.5, -21)!
  for (const sk of SKATERS) {
    const ent = world.getEntity(sk.id);
    if (!ent) continue;
    const a = state.simTime * sk.speed + sk.phase;
    const x = -18.5 + Math.sin(a) * sk.rx;
    const z = -21.0 + Math.cos(a) * sk.rz;
    const vx = Math.cos(a) * sk.rx * sk.speed;
    const vz = -Math.sin(a) * sk.rz * sk.speed;
    ent.pos[0] = x;
    ent.pos[2] = z;
    ent.rot = quatFromYawPitchRoll(Math.atan2(-vx, -vz), 0, clamp(sk.speed * 0.14, -0.18, 0.18));
  }

  // 4. Animate Gentle Drifting 3D Snowflakes!
  const showSnow = state.snowMode !== "off";
  const snowCount = state.snowMode === "heavy" ? SNOWFLAKES.length : 44;
  for (let i = 0; i < SNOWFLAKES.length; i++) {
    const f = SNOWFLAKES[i];
    const ent = world.getEntity(f.id)!;
    const active = showSnow && i < snowCount;
    ent.visible = active;
    if (!active) continue;
    f.y -= f.speed * (state.snowMode === "heavy" ? 1.35 : 1.0) * safeDt;
    if (f.y < 0.4) f.y = 28.0 + (i % 7);
    ent.pos[0] = f.x0 + Math.sin(state.simTime * 0.8 + f.phase) * 1.4;
    ent.pos[1] = f.y;
    ent.pos[2] = f.z0 + Math.cos(state.simTime * 0.65 + f.phase) * 1.4;
  }

  // 5. Santa's 6-DOF Sleigh + Reindeer Team!
  if (state.sleighManual && state.camMode === "sleigh") {
    const fwdIn = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const yawIn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    const climbIn = (keys.has("Space") || keys.has("KeyR") ? 1 : 0) - (keys.has("KeyC") || keys.has("KeyF") ? 1 : 0);
    state.sleighYaw += yawIn * 1.65 * safeDt;
    const fx = -Math.sin(state.sleighYaw), fz = -Math.cos(state.sleighYaw);
    const spd = 16.0 + fwdIn * 10.0;
    state.sleighVel = [fx * spd, climbIn * 12.0, fz * spd];
    state.sleighPos[0] = clamp(state.sleighPos[0] + state.sleighVel[0] * safeDt, -54, 54);
    state.sleighPos[1] = clamp(state.sleighPos[1] + state.sleighVel[1] * safeDt, 11.5, 42);
    state.sleighPos[2] = clamp(state.sleighPos[2] + state.sleighVel[2] * safeDt, -56, 56);
    state.sleighPitch = lerp(state.sleighPitch, climbIn * 0.22 - 0.04, 1 - Math.exp(-safeDt * 5));
    state.sleighRoll = lerp(state.sleighRoll, -yawIn * 0.42, 1 - Math.exp(-safeDt * 5));
  } else {
    const ap = sampleSleighAutopilot(state.simTime);
    const k = 1 - Math.exp(-safeDt * 4.0);
    state.sleighPos[0] = lerp(state.sleighPos[0], ap.pos[0], k);
    state.sleighPos[1] = lerp(state.sleighPos[1], ap.pos[1], k);
    state.sleighPos[2] = lerp(state.sleighPos[2], ap.pos[2], k);
    state.sleighVel = ap.vel;
    let dy = ap.yaw - state.sleighYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    state.sleighYaw += dy * k;
    state.sleighPitch = lerp(state.sleighPitch, clamp(ap.vel[1] * 0.035, -0.2, 0.2), k);
    state.sleighRoll = lerp(state.sleighRoll, ap.bank, k);
  }

  const sleigh = world.getEntity("santa_sleigh")!;
  sleigh.pos = [...state.sleighPos];
  sleigh.rot = quatFromYawPitchRoll(state.sleighYaw, state.sleighPitch, state.sleighRoll);
  world.getEntity("sleigh_shadow_proxy")!.pos = [...state.sleighPos];

  // 6. Overhead Festive Catenary String Lights + Santa's Golden Stardust Contrails!
  const ribbons: RibbonState[] = [];
  const eveGlow = state.tod === "morning" ? 0.35 : 0.88;

  // Delicate warm golden festoon Christmas light strands crisscrossed high above snowy Main Street!
  const strandAlpha = state.tod === "morning" ? 0.24 : 0.58;
  for (const z of [2, 12, 22, 32, 42]) {
    ribbons.push(
      makeCatenaryRibbon(`festoon_${z}`, [-12.6, 6.8, z], [12.6, 6.8, z], 1.1, [255, 224, 134], 0.09, strandAlpha),
    );
  }
  // Delicate festive string lights crisscrossing overhead across the Frozen Town Ice Skating Rink!
  ribbons.push(
    makeCatenaryRibbon("rink_str_a", [-10.2, 4.4, -11.2], [-26.8, 4.4, -30.8], 1.0, [255, 224, 138], 0.08, strandAlpha),
    makeCatenaryRibbon("rink_str_b", [-26.8, 4.4, -11.2], [-10.2, 4.4, -30.8], 1.0, [255, 224, 138], 0.08, strandAlpha),
  );

  // Twin sparkling golden stardust trails behind Santa's Sleigh runners!
  const rL = world.getSocketWorldPos("santa_sleigh", "runnerL");
  const rR = world.getSocketWorldPos("santa_sleigh", "runnerR");
  for (const tr of [stardustL, stardustR]) {
    for (let i = tr.length - 1; i >= 0; i--) {
      tr[i].age += safeDt * 0.95;
      if (tr[i].age >= 1.0) tr.splice(i, 1);
    }
  }
  if (rL && rR) {
    if (stardustL.length > 0 && Math.hypot(rL[0] - stardustL[0].pos[0], rL[2] - stardustL[0].pos[2]) > 7.0) {
      stardustL.length = 0; stardustR.length = 0;
    }
    stardustL.unshift({ pos: [...rL], age: 0.01, width: 0.42 });
    stardustR.unshift({ pos: [...rR], age: 0.01, width: 0.42 });
    if (stardustL.length > 26) stardustL.length = 26;
    if (stardustR.length > 26) stardustR.length = 26;
  }
  if (stardustL.length >= 2) {
    ribbons.push({ id: "sleigh_dust_l", points: stardustL, color: [255, 224, 118], alpha: 0.62, emissive: true });
    ribbons.push({ id: "sleigh_dust_r", points: stardustR, color: [255, 224, 118], alpha: 0.62, emissive: true });
  }
  world.doc.ribbons = ribbons;

  updateCamera(safeDt);
}

function updateCamera(dt: number, snap = false): void {
  const cam = world.doc.camera;
  let wantPos: Vec3;
  let wantTarget: Vec3;
  let wantUp: Vec3 = [0, 1, 0];
  let wantFov = 38;

  if (state.camMode === "street") {
    // Cozy Main Street postcard perspective looking north past the Vintage Trolley, Starlight Cinema,
    // Toy Emporium & overhead festoon lights straight toward the Giant Christmas Tree & Grand Clocktower!
    wantPos = [3.6 + Math.sin(state.orbitYawOffset) * 2.5, 4.6, 31.5];
    wantTarget = [-0.5, 5.8, -20.0];
    wantFov = 42;
  } else if (state.camMode === "plaza") {
    // Intimate close-up of the Giant Decorated Christmas Tree, Market Stalls, Presents, Ice Skaters & Clocktower!
    const a = state.orbitYawOffset;
    const dist = clamp(state.zoomDist * 0.56, 22, 48);
    const elev = clamp(state.orbitPitchOffset * 0.72, 0.22, 0.78);
    wantTarget = [-4.5, 5.2, -20.5];
    wantPos = [
      wantTarget[0] + Math.sin(a) * Math.cos(elev) * dist,
      wantTarget[1] + Math.sin(elev) * dist,
      wantTarget[2] + Math.cos(a) * Math.cos(elev) * dist,
    ];
    wantFov = 38;
  } else if (state.camMode === "sleigh") {
    // Dramatic 6-DOF Chase Cam right behind Santa's Sleigh soaring over the snowy Main Street rooftops!
    const fx = -Math.sin(state.sleighYaw);
    const fz = -Math.cos(state.sleighYaw);
    wantPos = [state.sleighPos[0] - fx * 15.5, state.sleighPos[1] + 5.2, state.sleighPos[2] - fz * 15.5];
    wantTarget = [state.sleighPos[0] + fx * 14.0, state.sleighPos[1] - 3.2, state.sleighPos[2] + fz * 14.0];
    const bankCam = state.sleighRoll * 0.26;
    const rx = Math.cos(state.sleighYaw), rz = -Math.sin(state.sleighYaw);
    wantUp = vec3Norm([rx * Math.sin(bankCam), Math.cos(bankCam), rz * Math.sin(bankCam)]);
    wantFov = 48;
  } else {
    // Sweeping Wide Miniature Diorama Establishing Shot framing ALL of Main Street, Town Square, Ice Rink & Clocktower!
    const dist = clamp(state.zoomDist, 28, 118);
    const elev = clamp(state.orbitPitchOffset, 0.22, 1.10);
    const az = state.orbitYawOffset;
    wantTarget = [-1.5, 6.2, -3.5];
    wantPos = [
      wantTarget[0] + Math.sin(az) * Math.cos(elev) * dist,
      Math.max(8, wantTarget[1] + Math.sin(elev) * dist),
      wantTarget[2] + Math.cos(az) * Math.cos(elev) * dist,
    ];
    wantFov = 38;
  }

  const k = snap ? 1 : 1 - Math.exp(-dt * 4.8);
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
// 4. HUD, Interactive Controls & Deterministic API Hook
// ---------------------------------------------------------------------------
function syncUiButtons(): void {
  const setP = (id: string, v: boolean) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("aria-pressed", v ? "true" : "false");
  };
  setP("btnCamWide", state.camMode === "wide");
  setP("btnCamStreet", state.camMode === "street");
  setP("btnCamPlaza", state.camMode === "plaza");
  setP("btnCamSleigh", state.camMode === "sleigh");
  setP("btnDetail_classic", state.detail === "classic");
  setP("btnDetail_ultra", state.detail === "ultra");
  setP("btnSplit", state.splitEnabled);
  setP("btnTod_eve", state.tod === "eve");
  setP("btnTod_midnight", state.tod === "midnight");
  setP("btnTod_morning", state.tod === "morning");
  setP("btnQual_eco", state.quality === "eco");
  setP("btnQual_balanced", state.quality === "balanced");
  setP("btnQual_ultra", state.quality === "ultra");

  const snowBtn = document.getElementById("btnSnow");
  if (snowBtn) {
    snowBtn.textContent = state.snowMode === "heavy" ? "Snow: Heavy" : state.snowMode === "gentle" ? "Snow: Gentle" : "Snow: Off";
    snowBtn.setAttribute("aria-pressed", state.snowMode !== "off" ? "true" : "false");
  }
}

function updateStatsHud(): void {
  const statsEl = document.getElementById("stats");
  if (!statsEl) return;
  const s = renderer.getStats();
  const detLabel = state.detail === "ultra" ? "Ultra HD 2x (up to 92-slice landmarks)" : "Classic 1x";
  const viewLabel =
    state.camMode === "street" ? "MAIN STREET POSTCARD"
    : state.camMode === "plaza" ? "TOWN SQUARE TREE & ICE RINK"
    : state.camMode === "sleigh" ? (state.sleighManual ? "SANTA SLEIGH MANUAL 6-DOF" : "SANTA SLEIGH AUTOPILOT")
    : "WIDE WINTER DIORAMA";
  statsEl.textContent =
    `VIEW    ${viewLabel}  |  ${detLabel}\n` +
    `ENGINE  ${s.fps.toFixed(0).padStart(2, " ")} FPS  |  ${s.drawCalls} draws (${s.visibleEntities}/${s.totalEntities} ents)  |  ${s.activeSamples}x RGSS AA`;
}

document.getElementById("btnCamWide")?.addEventListener("click", () => { state.camMode = "wide"; state.orbitYawOffset = 0.42; state.orbitPitchOffset = 0.44; state.zoomDist = 64; syncUiButtons(); });
document.getElementById("btnCamStreet")?.addEventListener("click", () => { state.camMode = "street"; state.orbitYawOffset = 0.0; syncUiButtons(); });
document.getElementById("btnCamPlaza")?.addEventListener("click", () => { state.camMode = "plaza"; state.orbitYawOffset = 0.52; state.orbitPitchOffset = 0.42; state.zoomDist = 52; syncUiButtons(); });
document.getElementById("btnCamSleigh")?.addEventListener("click", () => { state.camMode = "sleigh"; syncUiButtons(); });
document.getElementById("btnDetail_classic")?.addEventListener("click", () => { applyDetailPack("classic"); applySplit(); syncUiButtons(); });
document.getElementById("btnDetail_ultra")?.addEventListener("click", () => { applyDetailPack("ultra"); applySplit(); syncUiButtons(); });
document.getElementById("btnSplit")?.addEventListener("click", () => { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); });
document.getElementById("btnSnow")?.addEventListener("click", () => {
  state.snowMode = state.snowMode === "gentle" ? "heavy" : state.snowMode === "heavy" ? "off" : "gentle";
  syncUiButtons();
});
for (const t of ["eve", "midnight", "morning"] as TodPreset[]) {
  document.getElementById(`btnTod_${t}`)?.addEventListener("click", () => { applyTod(t); syncUiButtons(); });
}
for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) {
  document.getElementById(`btnQual_${q}`)?.addEventListener("click", () => { applyQuality(q); applySplit(); syncUiButtons(); });
}

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  keys.add(e.code);
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) && state.camMode === "sleigh") {
    state.sleighManual = true;
    if (e.code === "Space") e.preventDefault();
  }
  if (e.code === "KeyG") { applyDetailPack(state.detail === "ultra" ? "classic" : "ultra"); applySplit(); syncUiButtons(); }
  else if (e.code === "KeyV") {
    state.camMode = state.camMode === "wide" ? "street" : state.camMode === "street" ? "plaza" : state.camMode === "plaza" ? "sleigh" : "wide";
    syncUiButtons();
  } else if (e.code === "KeyE") { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); }
  else if (e.code === "KeyN") { applyTod(state.tod === "eve" ? "midnight" : state.tod === "midnight" ? "morning" : "eve"); syncUiButtons(); }
  else if (e.code === "KeyH" || e.code === "KeyU") { document.body.classList.toggle("nohud"); }
});
window.addEventListener("keyup", (e) => { keys.delete(e.code); });

const splitBar = document.getElementById("splitBar");
splitBar?.addEventListener("pointerdown", (e) => { dragSplit = true; e.stopPropagation(); splitBar.setPointerCapture(e.pointerId); });
window.addEventListener("pointermove", (e) => {
  if (dragSplit) {
    state.splitX = clamp(e.clientX / Math.max(1, window.innerWidth), 0.06, 0.94);
    applySplit();
    return;
  }
  if (!dragOrbit) return;
  const dx = e.clientX - lastPtrX, dy = e.clientY - lastPtrY;
  lastPtrX = e.clientX; lastPtrY = e.clientY;
  state.orbitYawOffset -= dx * 0.0065;
  state.orbitPitchOffset = clamp(state.orbitPitchOffset + dy * 0.0055, 0.16, 1.15);
});
window.addEventListener("pointerup", () => { dragSplit = false; dragOrbit = false; });
canvas.addEventListener("pointerdown", (e) => { dragOrbit = true; lastPtrX = e.clientX; lastPtrY = e.clientY; });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  state.zoomDist = clamp(state.zoomDist + e.deltaY * 0.045, 24, 118);
}, { passive: false });

applyDetailPack(state.detail);
applyTod(state.tod);
applyQuality(state.quality);
applySplit();
const ap0 = sampleSleighAutopilot(state.simTime);
state.sleighPos = [...ap0.pos];
state.sleighYaw = ap0.yaw;
state.sleighRoll = ap0.bank;

stepSimulation(0.016);
updateCamera(1.0, true);
renderer.render(world);
syncUiButtons();
updateStatsHud();
document.body.classList.add("ready");

declare global {
  interface Window {
    xmasDemo?: {
      world: SceneWorld;
      renderer: AASpriteRenderer;
      set: (opts: Partial<{
        detail: DetailLevel;
        camMode: CamMode;
        tod: TodPreset;
        snowMode: SnowMode;
        quality: AAQuality;
        splitEnabled: boolean;
        splitX: number;
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

window.xmasDemo = {
  world,
  renderer,
  set(opts) {
    if (opts.detail !== undefined && opts.detail !== state.detail) applyDetailPack(opts.detail);
    if (opts.camMode !== undefined) {
      state.camMode = opts.camMode;
      if (opts.camMode === "wide") { state.orbitYawOffset = 0.42; state.orbitPitchOffset = 0.44; state.zoomDist = 64; }
      else if (opts.camMode === "plaza") { state.orbitYawOffset = 0.52; state.orbitPitchOffset = 0.40; state.zoomDist = 50; }
      else if (opts.camMode === "street") { state.orbitYawOffset = 0.0; }
    }
    if (opts.tod !== undefined) applyTod(opts.tod);
    if (opts.snowMode !== undefined) state.snowMode = opts.snowMode;
    if (opts.quality !== undefined) applyQuality(opts.quality);
    if (opts.splitEnabled !== undefined) state.splitEnabled = opts.splitEnabled;
    if (opts.splitX !== undefined) state.splitX = opts.splitX;
    if (opts.orbitYawOffset !== undefined) state.orbitYawOffset = opts.orbitYawOffset;
    if (opts.orbitPitchOffset !== undefined) state.orbitPitchOffset = opts.orbitPitchOffset;
    if (opts.zoomDist !== undefined) state.zoomDist = opts.zoomDist;
    if (opts.simTime !== undefined) {
      stardustL.length = 0; stardustR.length = 0;
      state.simTime = opts.simTime;
      const ap = sampleSleighAutopilot(state.simTime);
      state.sleighPos = [...ap.pos];
      state.sleighYaw = ap.yaw;
      state.sleighRoll = ap.bank;
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

if (!holdLoop) requestAnimationFrame(tick);
