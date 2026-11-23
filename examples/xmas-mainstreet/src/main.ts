/**
 * Main Street Christmas v2 — Micro-Voxel HD-2D Winter Village Diorama (@aastack/core).
 * Combines 18-neighbor baked cavity AO, HD-2D pbr-lite velvety shading, 8 bespoke historic
 * buildings (Clocktower Town Hall, Turret Toy Emporium, Starlight Art Deco Cinema, Jetted
 * Tudor Bakery, Dutch Stepped-Gable Bookshop, Veranda Inn, Victorian Bandstand Gazebo, and
 * Arched Granite Creek Bridge), 116-slice Giant Christmas Tree, 1900s Heritage Trolley,
 * Victorian Horse-Drawn Sleigh Carriage, Fairy-Lit Winter Birches, Crackling Ice-Rink Braziers,
 * Storybook Villagers holding presents, and 6-DOF Santa's Sleigh!
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
  createDutchGableBookshop,
  createGrandClocktowerHall,
  createParkBandstandGazebo,
  createStarlightCinema,
  createStoneArchBridge,
  createTudorBakeryCafe,
  createTurretToyEmporium,
  createVerandaNorthStarInn,
} from "./buildings.js";
import {
  createDetailedSnowman,
  createFairyBirchTree,
  createFireBrazier,
  createGiantChristmasTree,
  createHeritageTrolley,
  createHorseSleighCarriage,
  createLightProxyAsset,
  createMarketStall,
  createOrganicSnowConifer,
  createSantaSleighAerial,
  createSnowBench,
  createStorybookVillager,
  createVictorianTripleLamp,
  createVintagePostbox,
  createWoodyWagon,
} from "./props.js";
import type { DetailLevel } from "./voxel-kit.js";
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

// Use HD-2D + pbr-lite velvety lighting + whisper-thin outline (0.26) so 18-neighbor cavity AO shines!
const world = new SceneWorld({
  seed: 25,
  style: "hd-2d",
  aaMode: "voxel-dda",
  samples: initQuality === "eco" ? 2 : initQuality === "balanced" ? 4 : 8,
  camera: {
    mode: "free",
    pos: [32, 30, 56],
    target: [-1, 6, -2],
    up: [0, 1, 0],
    fovDeg: 38,
    orthoSize: 32,
    near: 0.4,
    far: 650,
  },
  lighting: {
    sunAzimuthDeg: 34,
    sunElevationDeg: 32,
    timeOfDay: 0.80,
    fogDensity: 0.22,
    shadeStyle: "pbr-lite",
    outlineWidth: 0.24,
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

function createSnowflakeAsset(): VolumeAsset {
  return createVolumeAsset({
    id: "snow_flake",
    name: "Snowflake",
    w: 2,
    l: 2,
    h: 2,
    voxelScale: 0.13,
    pivot: [1, 1, 1],
    rgba: new Uint8Array([
      244, 248, 255, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]),
    explicitEmissive: new Uint8Array([145, 0, 0, 0, 0, 0, 0, 0]),
    computeSdf: false,
    provenance: { kind: "blueprint", source: "xmas-mainstreet-v2" },
  });
}

// ---------------------------------------------------------------------------
// 1. Dual-Resolution Micro-Voxel Asset Pack (Classic 1x <-> Ultra HD 2x!)
// ---------------------------------------------------------------------------
const assetPacks: Partial<Record<DetailLevel, VolumeAsset[]>> = {};
world.registerAsset(createLightProxyAsset());
world.registerAsset(createSnowflakeAsset());

function buildAssetPack(detail: DetailLevel): VolumeAsset[] {
  return [
    // 8 Bespoke Architectural Landmarks
    createGrandClocktowerHall(detail),
    createTurretToyEmporium(detail),
    createStarlightCinema(detail),
    createTudorBakeryCafe(detail),
    createDutchGableBookshop(detail),
    createVerandaNorthStarInn(detail),
    createParkBandstandGazebo(detail),
    createStoneArchBridge(detail),
    // Hero Tree, Heritage Vehicles & Aerial Sleigh
    createGiantChristmasTree(detail),
    createHeritageTrolley(detail),
    createHorseSleighCarriage(detail),
    createWoodyWagon("woody_green", [30, 80, 54], detail),
    createSantaSleighAerial(detail),
    // Market Chalets, Storybook Villagers & Rich Street Clutter
    createMarketStall("stall_red", [168, 36, 44], detail),
    createMarketStall("stall_green", [32, 92, 58], detail),
    createVictorianTripleLamp(detail),
    createFairyBirchTree(detail),
    createOrganicSnowConifer("xmas_spruce_tall", true, detail),
    createOrganicSnowConifer("xmas_fir_broad", false, detail),
    createDetailedSnowman(detail),
    createSnowBench(detail),
    createFireBrazier(detail),
    createVintagePostbox(detail),
    createStorybookVillager("villager_red", [164, 38, 46], [234, 198, 102], "gift", detail),
    createStorybookVillager("villager_navy", [38, 66, 118], [186, 42, 48], "cocoa", detail),
    createStorybookVillager("villager_green", [34, 92, 58], [234, 224, 206], "skate", detail),
    createStorybookVillager("villager_plum", [112, 46, 86], [232, 192, 92], "skate", detail),
  ];
}

function applyDetailPack(detail: DetailLevel): void {
  state.detail = detail;
  if (!assetPacks[detail]) {
    assetPacks[detail] = buildAssetPack(detail);
  }
  for (const a of assetPacks[detail]!) world.registerAsset(a);
  world.doc.lighting.outlineWidth = detail === "ultra" ? 0.24 : 0.42;
}

// ---------------------------------------------------------------------------
// 2. Populate Micro-Voxel Main Street Christmas Village
// ---------------------------------------------------------------------------
const initialEntities: EntityState[] = [];

// Shadow-caster slot 0 (ALWAYS present): Moving Heritage Trolley Headlight Pool
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

// Shadow-caster slot 1 (ALWAYS present): Santa's Sleigh Soft Aerial Shadow
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

// Hero Landmark 1: Grand Victorian Clocktower & Town Hall anchoring North Main Street!
initialEntities.push({
  id: "town_hall",
  assetId: "xmas_clocktower",
  pos: [0, 0, -36.5],
  rot: quatFromYawPitchRoll(Math.PI, 0, 0),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.25,
  tag: "landmark",
});

// Hero Landmark 2: 116-Slice Giant Town Square Christmas Tree!
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

// Hero Landmark 3: Victorian Park Bandstand Gazebo beside the Frozen Ice Skating Rink!
initialEntities.push({
  id: "park_gazebo",
  assetId: "xmas_gazebo",
  pos: [-22.0, 0, -35.5],
  rot: quatFromYawPitchRoll(Math.PI * 0.78, 0, 0),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.4,
  tag: "landmark",
});

// Hero Landmark 4: Arched Granite Footbridge spanning our winding frozen winter creek at South Main St (Z = 49)!
initialEntities.push({
  id: "creek_bridge",
  assetId: "xmas_bridge",
  pos: [0, 0, 49.0],
  rot: quatFromYawPitchRoll(Math.PI / 2, 0, 0),
  scale: 1.25,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "landmark",
});

// 4 Timber Christmas Market Chalets framing the Giant Christmas Tree in Town Square
const STALLS: Array<[string, string, number, number, number]> = [
  ["stall_ne", "stall_red", 9.8, -24.5, Math.PI * 0.72],
  ["stall_se", "stall_green", 9.8, -13.5, Math.PI * 0.28],
  ["stall_nw", "stall_green", -8.4, -26.2, -Math.PI * 0.75],
  ["stall_sw", "stall_red", -8.4, -11.8, -Math.PI * 0.25],
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

// 8 Bespoke Main Street Historic Buildings (varied silhouettes, roof angles, turrets, Dutch gables & marquees!)
const WEST_ROW: Array<[string, string, number]> = [
  ["w_toys", "shop_toys", 2.0],         // Corner Turret Toy Emporium!
  ["w_bakery", "shop_bakery", 13.5],    // Jetted Tudor Alpine Bakery!
  ["w_books", "shop_books", 25.0],      // Dutch Stepped-Gable Bookshop + Iron Balcony!
  ["w_inn_sw", "shop_inn", 36.8],       // Wrap-Around Veranda Corner Lodge!
];
const EAST_ROW: Array<[string, string, number]> = [
  ["e_cinema", "shop_cinema", 2.0],     // Grand Starlight Art Deco Cinema!
  ["e_books", "shop_books", 13.5],      // Dutch Stepped-Gable Emporium!
  ["e_toys", "shop_toys", 25.0],        // Turret Confectionery & Toys!
  ["e_bakery", "shop_bakery", 36.5],    // Timber Cocoa & Pastry House!
];
for (const [id, assetId, z] of WEST_ROW) {
  initialEntities.push({
    id,
    assetId,
    pos: [-15.8, 0, z],
    rot: quatFromYawPitchRoll(-Math.PI / 2, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.25,
    tag: "building",
  });
}
for (const [id, assetId, z] of EAST_ROW) {
  initialEntities.push({
    id,
    assetId,
    pos: [15.8, 0, z],
    rot: quatFromYawPitchRoll(Math.PI / 2, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.25,
    tag: "building",
  });
}

// Cozy North Star Veranda Inn framing the East Town Square wing (windows glowing on ALL 4 sides!)
initialEntities.push({
  id: "east_plaza_inn",
  assetId: "shop_inn",
  pos: [22.0, 0, -21.0],
  rot: quatFromYawPitchRoll(Math.PI * 0.72, 0, 0),
  scale: 1.06,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.25,
  tag: "building",
});

// Heritage 1900s Mahogany Holiday Trolley gliding along the center rails!
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

// Victorian Horse-Drawn Christmas Sleigh Carriage trotting northbound along East lane!
initialEntities.push({
  id: "horse_carriage",
  assetId: "xmas_carriage",
  pos: [4.1, 0, 26],
  rot: quatIdentity(),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "vehicle",
});

// 1950s Woody Station Wagon with snowy pine tree tied to the roof cruising southbound!
initialEntities.push({
  id: "woody_southbound",
  assetId: "woody_green",
  pos: [-4.1, 0, 8],
  rot: quatFromYawPitchRoll(Math.PI, 0, 0),
  scale: 1.0,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "vehicle",
});

// Baroque Santa's 6-DOF Sleigh + 5 Galloping Reindeer soaring overhead!
initialEntities.push({
  id: "santa_sleigh",
  assetId: "santa_sleigh",
  pos: [12, 22, -6],
  rot: quatIdentity(),
  scale: 0.94,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.5,
  tag: "player",
});

// Ornate Victorian Twin-Globe Streetlamps lining Main Street, Plaza & Ice Rink!
const LAMP_POS: Array<[number, number, number]> = [
  [-7.1, -4, 0], [7.1, -4, 0],
  [-7.1, 8, 0], [7.1, 8, 0],
  [-7.1, 20, 0], [7.1, 20, 0],
  [-7.1, 32, 0], [7.1, 32, 0],
  [-7.1, 42, 0], [7.1, 42, 0],
  [-10.2, -11.2, 0], [-26.8, -11.2, 0],
  [-10.2, -30.8, 0], [-26.8, -30.8, 0],
  [-7.8, -31.5, 0], [7.8, -31.5, 0],
];
LAMP_POS.forEach(([lx, lz, yaw], i) => {
  initialEntities.push({
    id: `lamp_${i}`,
    assetId: "xmas_lamp",
    pos: [lx, 0, lz],
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: 1.0,
    aaPriority: "hero",
    outline: false,
    emissiveBoost: 1.6,
    tag: "lamp",
  });
});

// Micro-Scale Street Dressing: Snow Benches, Crackling Ice-Rink Braziers, Vintage Red Postboxes & Snowmen!
const BENCHES: Array<[number, number, number]> = [
  [-9.8, -19.5, -Math.PI / 2],
  [5.8, -12.0, Math.PI * 0.25],
  [-5.8, -26.5, -Math.PI * 0.75],
  [-9.5, 19.0, -Math.PI / 2],
  [9.5, 19.0, Math.PI / 2],
];
BENCHES.forEach(([bx, bz, yaw], i) => {
  initialEntities.push({ id: `bench_${i}`, assetId: "xmas_bench", pos: [bx, 0, bz], rot: quatFromYawPitchRoll(yaw, 0, 0), scale: 1.0, outline: true, tag: "prop" });
});

// 2 Glowing Crackling Firepit Braziers warming ice skaters beside the Frozen Rink!
initialEntities.push(
  { id: "brazier_1", assetId: "xmas_brazier", pos: [-10.4, 0, -14.5], rot: quatIdentity(), scale: 1.0, aaPriority: "hero", outline: false, emissiveBoost: 1.75, tag: "prop" },
  { id: "brazier_2", assetId: "xmas_brazier", pos: [-10.4, 0, -27.5], rot: quatIdentity(), scale: 1.0, aaPriority: "hero", outline: false, emissiveBoost: 1.75, tag: "prop" },
);

// Vintage Red Pillar Postboxes on Main Street corners
initialEntities.push(
  { id: "postbox_w", assetId: "xmas_postbox", pos: [-8.2, 0, -1.5], rot: quatFromYawPitchRoll(-Math.PI / 2, 0, 0), scale: 1.0, outline: true, tag: "prop" },
  { id: "postbox_e", assetId: "xmas_postbox", pos: [8.2, 0, 29.0], rot: quatFromYawPitchRoll(Math.PI / 2, 0, 0), scale: 1.0, outline: true, tag: "prop" },
);

// Detailed Classic Snowmen (twig arms, coal smile, plaid scarf, carrot nose & top hat!)
const SNOWMEN: Array<[number, number, number]> = [
  [-10.4, -22.8, -Math.PI * 0.55],
  [9.4, -30.5, Math.PI * 0.82],
  [-10.2, 43.2, -Math.PI * 0.25],
];
SNOWMEN.forEach(([sx, sz, yaw], i) => {
  initialEntities.push({ id: `snowman_${i}`, assetId: "xmas_snowman", pos: [sx, 0, sz], rot: quatFromYawPitchRoll(yaw, 0, 0), scale: 1.0, aaPriority: "hero", outline: true, tag: "prop" });
});

// Delicate Fairy-Lit White Winter Birch Trees framing Town Square & Creek Bridge!
const BIRCHES: Array<[number, number, number]> = [
  [-10.8, -36.5, 1.05],
  [11.4, -36.0, 0.98],
  [13.8, -9.8, 0.92],
  [-9.5, 45.2, 1.0],
  [9.5, 45.2, 0.95],
];
BIRCHES.forEach(([bx, bz, sc], i) => {
  initialEntities.push({
    id: `birch_${i}`,
    assetId: "xmas_birch",
    pos: [bx, 0, bz],
    rot: quatFromYawPitchRoll(i * 1.4, 0, 0),
    scale: sc,
    aaPriority: "hero",
    outline: false,
    emissiveBoost: 1.65,
    tag: "tree",
  });
});

// 5 Storybook Ice Skaters gliding smooth loops across the Frozen Ice Rink (-18.5, -21)!
interface SkaterSpec { id: string; asset: string; phase: number; speed: number; rx: number; rz: number; }
const SKATERS: SkaterSpec[] = [
  { id: "skater_0", asset: "villager_green", phase: 0.0, speed: 0.72, rx: 5.2, rz: 6.4 },
  { id: "skater_1", asset: "villager_plum", phase: 1.5, speed: 0.64, rx: 4.0, rz: 5.2 },
  { id: "skater_2", asset: "villager_navy", phase: 3.0, speed: 0.80, rx: 5.5, rz: 6.0 },
  { id: "skater_3", asset: "villager_green", phase: 4.5, speed: -0.68, rx: 3.4, rz: 4.4 },
  { id: "skater_4", asset: "villager_plum", phase: 5.5, speed: 0.56, rx: 4.8, rz: 6.8 },
];
for (const sk of SKATERS) {
  initialEntities.push({ id: sk.id, assetId: sk.asset, pos: [-18.5, 0, -21], rot: quatIdentity(), scale: 1.0, aaPriority: "hero", outline: true, tag: "skater" });
}

// Storybook Main Street Shoppers carrying wrapped gifts & hot cocoa along the snowy sidewalks!
const SHOPPERS: Array<[string, string, number, number, number]> = [
  ["shopper_0", "villager_red", -9.6, 3.2, -Math.PI * 0.45],
  ["shopper_1", "villager_navy", -8.8, 14.2, 0.25],
  ["shopper_2", "villager_red", 9.4, 4.0, Math.PI * 0.45],
  ["shopper_3", "villager_plum", 8.8, 17.5, Math.PI],
  ["shopper_4", "villager_navy", -9.2, 26.8, -0.2],
  ["shopper_5", "villager_red", 9.0, 31.0, Math.PI * 0.8],
  ["shopper_6", "villager_navy", 4.6, -13.5, 0.4],
  ["shopper_7", "villager_red", -4.4, -13.8, -0.4],
  ["shopper_8", "villager_plum", -12.0, -14.2, 0.2], // warming hands by the rink fire brazier!
  ["shopper_9", "villager_navy", -11.8, -27.2, -0.5],
];
for (const [id, assetId, px, pz, yaw] of SHOPPERS) {
  initialEntities.push({ id, assetId, pos: [px, 0, pz], rot: quatFromYawPitchRoll(yaw, 0, 0), scale: 1.0, aaPriority: "hero", outline: true, tag: "shopper" });
}

// Dense Multi-Species Snow-Laden Alpine Forest wrapping cozily around the village & winter creek!
const FOREST: Array<[number, number, number, boolean]> = [
  [-32, -46, 1.32, true], [-24, -48, 1.20, false], [-15, -49, 1.38, true], [-7, -50, 1.15, false],
  [8, -50, 1.28, true], [16, -48, 1.42, true], [25, -46, 1.24, false], [33, -43, 1.35, true],
  [-36, -38, 1.28, false], [-35, -28, 1.38, true], [-35, -18, 1.22, false], [-34, -8, 1.30, true],
  [-29, 4, 1.24, false], [-31, 15, 1.40, true], [-29, 27, 1.22, false], [-31, 38, 1.35, true],
  [-24, 58, 1.28, true], [-14, 59, 1.15, false], [15, 58, 1.26, true], [25, 57, 1.34, false],
  [35, -34, 1.32, true], [36, -22, 1.25, false], [35, -10, 1.38, true],
  [29, 4, 1.22, false], [31, 16, 1.36, true], [29, 28, 1.24, false], [31, 39, 1.32, true],
  [-42, -32, 1.45, true], [-43, -12, 1.30, false], [-41, 12, 1.42, true], [43, -16, 1.40, true], [42, 14, 1.35, false],
];
FOREST.forEach(([px, pz, sc, tall], i) => {
  initialEntities.push({
    id: `conifer_${i}`,
    assetId: tall ? "xmas_spruce_tall" : "xmas_fir_broad",
    pos: [px, 0, pz],
    rot: quatFromYawPitchRoll(i * 1.47, 0, 0),
    scale: sc,
    outline: true,
    tag: "tree",
  });
});

// 80 Gentle Drifting 3D Snowflakes (1 single WebGL2 instanced draw call!)
interface SnowflakeParticle { id: string; x0: number; z0: number; y: number; speed: number; phase: number; }
const SNOWFLAKES: SnowflakeParticle[] = [];
for (let i = 0; i < 80; i++) {
  const rx = ((i * 73.13) % 1) * 76 - 38;
  const rz = ((i * 41.79) % 1) * 102 - 44;
  const ry = ((i * 19.37) % 1) * 28 + 1.5;
  SNOWFLAKES.push({ id: `flake_${i}`, x0: rx, z0: rz, y: ry, speed: 1.9 + (i % 5) * 0.42, phase: i * 0.85 });
  initialEntities.push({ id: `flake_${i}`, assetId: "snow_flake", pos: [rx, ry, rz], rot: quatIdentity(), scale: 1.0, outline: false, emissiveBoost: 1.0, tag: "snow" });
}

world.doc.entities = initialEntities;

// ---------------------------------------------------------------------------
// 3. Simulation State, Overhead Festoon Lights & Camera Rig
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
  orbitYawOffset: 0.44,
  orbitPitchOffset: 0.42,
  zoomDist: 68,
  camPosSmooth: [30, 30, 56] as Vec3,
  camTargetSmooth: [-1, 6, -1] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,

  sleighManual: false,
  sleighPos: [10, 22, -8] as Vec3,
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
    world.doc.lighting.timeOfDay = 0.80;
    world.doc.lighting.sunAzimuthDeg = 34;
    world.doc.lighting.sunElevationDeg = 32;
    world.doc.lighting.fogDensity = 0.22;
  } else if (preset === "midnight") {
    world.doc.lighting.timeOfDay = 0.96;
    world.doc.lighting.sunAzimuthDeg = 28;
    world.doc.lighting.sunElevationDeg = 38;
    world.doc.lighting.fogDensity = 0.26;
  } else {
    world.doc.lighting.timeOfDay = 0.06;
    world.doc.lighting.sunAzimuthDeg = 42;
    world.doc.lighting.sunElevationDeg = 52;
    world.doc.lighting.fogDensity = 0.14;
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
    const d = state.detail === "ultra" ? "Micro-Voxel Ultra HD" : "Classic 1x";
    rightLbl.textContent = `RIGHT: AASpriteStacker (${s} RGSS AA + ${d})`;
  }
}

function makeCatenaryRibbon(id: string, p0: Vec3, p1: Vec3, sag: number, color: [number, number, number], width: number, alpha: number): RibbonState {
  const pts: RibbonPoint[] = [];
  const segs = 10;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    pts.push({
      pos: [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u) - Math.sin(u * Math.PI) * sag, lerp(p0[2], p1[2], u)],
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
  const yAt = (s: number) => 22.0 + Math.sin(s * 2.0) * 3.0;
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

  // 1. Glide Heritage 1900s Holiday Trolley smoothly down center rails!
  const trolley = world.getEntity("holiday_trolley")!;
  const trCycle = Math.sin(state.simTime * 0.18 - 1.15);
  const trVel = Math.cos(state.simTime * 0.18 - 1.15);
  const trZ = 15.0 + trCycle * 20.0;
  const trHeadingSouth = trVel > 0;
  trolley.pos = [0, 0, trZ];
  trolley.rot = quatFromYawPitchRoll(trHeadingSouth ? Math.PI : 0, 0, 0);
  world.getEntity("trolley_headlight_proxy")!.pos = [0, 0.2, trZ + (trHeadingSouth ? 8.2 : -8.2)];

  // 2. Trot Victorian Horse-Drawn Sleigh Carriage northbound & cruise 1950s Woody Wagon southbound!
  const carriage = world.getEntity("horse_carriage")!;
  let zc = carriage.pos[2] - safeDt * 4.4;
  if (zc < -8) zc = 42;
  carriage.pos[2] = zc;

  const wSouth = world.getEntity("woody_southbound")!;
  let zs = wSouth.pos[2] + safeDt * 5.8;
  if (zs > 42) zs = -8;
  wSouth.pos[2] = zs;

  // 3. Glide 5 Storybook Ice Skaters on the Frozen Rink (-18.5, -21)
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

  // 4. Drifting 3D Snowflakes
  const showSnow = state.snowMode !== "off";
  const snowCount = state.snowMode === "heavy" ? SNOWFLAKES.length : 48;
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

  // 5. Santa's 6-DOF Sleigh + Galloping Reindeer
  if (state.sleighManual && state.camMode === "sleigh") {
    const fwdIn = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const yawIn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    const climbIn = (keys.has("Space") || keys.has("KeyR") ? 1 : 0) - (keys.has("KeyC") || keys.has("KeyF") ? 1 : 0);
    state.sleighYaw += yawIn * 1.65 * safeDt;
    const fx = -Math.sin(state.sleighYaw), fz = -Math.cos(state.sleighYaw);
    const spd = 16.0 + fwdIn * 10.0;
    state.sleighVel = [fx * spd, climbIn * 12.0, fz * spd];
    state.sleighPos[0] = clamp(state.sleighPos[0] + state.sleighVel[0] * safeDt, -54, 54);
    state.sleighPos[1] = clamp(state.sleighPos[1] + state.sleighVel[1] * safeDt, 12.0, 42);
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

  // 6. Delicate Overhead Festoon Lights + Chimney Fireplace Smoke Ribbons + Sleigh Stardust!
  const ribbons: RibbonState[] = [];
  const strandAlpha = state.tod === "morning" ? 0.22 : 0.56;
  for (const z of [2, 13.5, 25, 36.5]) {
    ribbons.push(makeCatenaryRibbon(`festoon_${z}`, [-12.6, 7.2, z], [12.6, 7.2, z], 1.15, [255, 224, 134], 0.08, strandAlpha));
  }
  ribbons.push(
    makeCatenaryRibbon("rink_str_a", [-10.2, 4.1, -11.2], [-26.8, 4.1, -30.8], 0.95, [255, 224, 138], 0.075, strandAlpha),
    makeCatenaryRibbon("rink_str_b", [-26.8, 4.1, -11.2], [-10.2, 4.1, -30.8], 0.95, [255, 224, 138], 0.075, strandAlpha),
  );

  // Soft curling warm chimney smoke wisps rising from the Tudor Bakery & Veranda Inn!
  const addSmoke = (id: string, base: Vec3, phase: number) => {
    const pts: RibbonPoint[] = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      pts.push({
        pos: [
          base[0] + Math.sin(state.simTime * 0.9 + phase + u * 3.0) * 0.9 * u + u * 1.4,
          base[1] + u * 5.2,
          base[2] + Math.cos(state.simTime * 0.7 + phase + u * 2.5) * 0.6 * u,
        ],
        age: 0.1 + u * 0.85,
        width: 0.45 + u * 1.4,
      });
    }
    ribbons.push({ id, points: pts, color: [194, 206, 228], alpha: 0.24, emissive: false });
  };
  addSmoke("smoke_bakery", [-15.8, 12.1, 18.0], 0.0);
  addSmoke("smoke_inn", [25.5, 12.8, -21.0], 2.1);

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
    stardustL.unshift({ pos: [...rL], age: 0.01, width: 0.36 });
    stardustR.unshift({ pos: [...rR], age: 0.01, width: 0.36 });
    if (stardustL.length > 26) stardustL.length = 26;
    if (stardustR.length > 26) stardustR.length = 26;
  }
  if (stardustL.length >= 2) {
    ribbons.push({ id: "sleigh_dust_l", points: stardustL, color: [255, 224, 118], alpha: 0.56, emissive: true });
    ribbons.push({ id: "sleigh_dust_r", points: stardustR, color: [255, 224, 118], alpha: 0.56, emissive: true });
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
    wantPos = [3.2 + Math.sin(state.orbitYawOffset) * 2.5, 4.4, 30.5];
    wantTarget = [-0.4, 5.8, -20.0];
    wantFov = 42;
  } else if (state.camMode === "plaza") {
    const a = state.orbitYawOffset;
    const dist = clamp(state.zoomDist * 0.56, 22, 48);
    const elev = clamp(state.orbitPitchOffset * 0.72, 0.22, 0.78);
    wantTarget = [-5.0, 5.6, -21.5];
    wantPos = [
      wantTarget[0] + Math.sin(a) * Math.cos(elev) * dist,
      wantTarget[1] + Math.sin(elev) * dist,
      wantTarget[2] + Math.cos(a) * Math.cos(elev) * dist,
    ];
    wantFov = 38;
  } else if (state.camMode === "sleigh") {
    const fx = -Math.sin(state.sleighYaw), fz = -Math.cos(state.sleighYaw);
    wantPos = [state.sleighPos[0] - fx * 15.5, state.sleighPos[1] + 5.2, state.sleighPos[2] - fz * 15.5];
    wantTarget = [state.sleighPos[0] + fx * 14.0, state.sleighPos[1] - 3.2, state.sleighPos[2] + fz * 14.0];
    const bankCam = state.sleighRoll * 0.26;
    const rx = Math.cos(state.sleighYaw), rz = -Math.sin(state.sleighYaw);
    wantUp = vec3Norm([rx * Math.sin(bankCam), Math.cos(bankCam), rz * Math.sin(bankCam)]);
    wantFov = 48;
  } else {
    const dist = clamp(state.zoomDist, 28, 122);
    const elev = clamp(state.orbitPitchOffset, 0.20, 1.10);
    const az = state.orbitYawOffset;
    wantTarget = [-1.0, 6.0, 2.0];
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
  const setP = (id: string, v: boolean) => { const el = document.getElementById(id); if (el) el.setAttribute("aria-pressed", v ? "true" : "false"); };
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
  const detLabel = state.detail === "ultra" ? "Micro-Voxel Ultra HD (132-slice + 18-nbr AO)" : "Classic 1x";
  const viewLabel =
    state.camMode === "street" ? "MAIN STREET POSTCARD"
    : state.camMode === "plaza" ? "TOWN SQUARE TREE, RINK & GAZEBO"
    : state.camMode === "sleigh" ? (state.sleighManual ? "SANTA SLEIGH MANUAL 6-DOF" : "SANTA SLEIGH AUTOPILOT")
    : "WIDE WINTER VILLAGE DIORAMA";
  statsEl.textContent =
    `VIEW    ${viewLabel}  |  ${detLabel}\n` +
    `ENGINE  ${s.fps.toFixed(0).padStart(2, " ")} FPS  |  ${s.drawCalls} draws (${s.visibleEntities}/${s.totalEntities} ents)  |  ${s.activeSamples}x RGSS AA`;
}

document.getElementById("btnCamWide")?.addEventListener("click", () => { state.camMode = "wide"; state.orbitYawOffset = 0.44; state.orbitPitchOffset = 0.42; state.zoomDist = 68; syncUiButtons(); });
document.getElementById("btnCamStreet")?.addEventListener("click", () => { state.camMode = "street"; state.orbitYawOffset = 0.0; syncUiButtons(); });
document.getElementById("btnCamPlaza")?.addEventListener("click", () => { state.camMode = "plaza"; state.orbitYawOffset = 0.52; state.orbitPitchOffset = 0.40; state.zoomDist = 52; syncUiButtons(); });
document.getElementById("btnCamSleigh")?.addEventListener("click", () => { state.camMode = "sleigh"; syncUiButtons(); });
document.getElementById("btnDetail_classic")?.addEventListener("click", () => { applyDetailPack("classic"); applySplit(); syncUiButtons(); });
document.getElementById("btnDetail_ultra")?.addEventListener("click", () => { applyDetailPack("ultra"); applySplit(); syncUiButtons(); });
document.getElementById("btnSplit")?.addEventListener("click", () => { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); });
document.getElementById("btnSnow")?.addEventListener("click", () => { state.snowMode = state.snowMode === "gentle" ? "heavy" : state.snowMode === "heavy" ? "off" : "gentle"; syncUiButtons(); });
for (const t of ["eve", "midnight", "morning"] as TodPreset[]) document.getElementById(`btnTod_${t}`)?.addEventListener("click", () => { applyTod(t); syncUiButtons(); });
for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) document.getElementById(`btnQual_${q}`)?.addEventListener("click", () => { applyQuality(q); applySplit(); syncUiButtons(); });

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  keys.add(e.code);
  if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) && state.camMode === "sleigh") {
    state.sleighManual = true;
    if (e.code === "Space") e.preventDefault();
  }
  if (e.code === "KeyG") { applyDetailPack(state.detail === "ultra" ? "classic" : "ultra"); applySplit(); syncUiButtons(); }
  else if (e.code === "KeyV") { state.camMode = state.camMode === "wide" ? "street" : state.camMode === "street" ? "plaza" : state.camMode === "plaza" ? "sleigh" : "wide"; syncUiButtons(); }
  else if (e.code === "KeyE") { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); }
  else if (e.code === "KeyN") { applyTod(state.tod === "eve" ? "midnight" : state.tod === "midnight" ? "morning" : "eve"); syncUiButtons(); }
  else if (e.code === "KeyH" || e.code === "KeyU") { document.body.classList.toggle("nohud"); }
});
window.addEventListener("keyup", (e) => { keys.delete(e.code); });

const splitBar = document.getElementById("splitBar");
splitBar?.addEventListener("pointerdown", (e) => { dragSplit = true; e.stopPropagation(); splitBar.setPointerCapture(e.pointerId); });
window.addEventListener("pointermove", (e) => {
  if (dragSplit) { state.splitX = clamp(e.clientX / Math.max(1, window.innerWidth), 0.06, 0.94); applySplit(); return; }
  if (!dragOrbit) return;
  const dx = e.clientX - lastPtrX, dy = e.clientY - lastPtrY;
  lastPtrX = e.clientX; lastPtrY = e.clientY;
  state.orbitYawOffset -= dx * 0.0065;
  state.orbitPitchOffset = clamp(state.orbitPitchOffset + dy * 0.0055, 0.16, 1.15);
});
window.addEventListener("pointerup", () => { dragSplit = false; dragOrbit = false; });
canvas.addEventListener("pointerdown", (e) => { dragOrbit = true; lastPtrX = e.clientX; lastPtrY = e.clientY; });
canvas.addEventListener("wheel", (e) => { e.preventDefault(); state.zoomDist = clamp(state.zoomDist + e.deltaY * 0.045, 24, 122); }, { passive: false });

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
      if (opts.camMode === "wide") { state.orbitYawOffset = 0.44; state.orbitPitchOffset = 0.42; state.zoomDist = 68; }
      else if (opts.camMode === "plaza") { state.orbitYawOffset = 0.52; state.orbitPitchOffset = 0.40; state.zoomDist = 52; }
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
  step(dt) { stepSimulation(dt); renderer.render(world); updateStatsHud(); },
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
  if (hudAcc >= 0.14) { hudAcc = 0; updateStatsHud(); }
  requestAnimationFrame(tick);
}
if (!holdLoop) requestAnimationFrame(tick);
