/**
 * Main Street Christmas v3: Airwolf Christmas Eve Patrol (@aastack/core).
 * Micro-Voxel HD-2D Winter Village Diorama featuring:
 *  - HD 56-Slice / Classic 28-Slice Articulated Airwolf (Bell 222A) patrolling above snowy
 *    Main Street with real-time volumetric golden nose searchlight + exact 3D voxel-DDA
 *    raycast, live Bayer-dithered spotlight pool, 6-DOF manual flight, Mach Turbo afterburners,
 *    and 1-draw-call Exploded 56-Slice Assembly Mode (X)!
 *  - 9 bespoke historic buildings (132-slice Clocktower Town Hall, Turret Toy Emporium,
 *    Starlight Art Deco Cinema, Jetted Tudor Bakery, Dutch Stepped-Gable Bookshop, Veranda Inn,
 *    Victorian Bandstand Gazebo, Arched Granite Creek Bridge, and 4 Hillside Valley Cottages)
 *  - 116-slice Giant Christmas Tree, 1900s Heritage Trolley, Victorian Horse-Drawn Sleigh
 *    Carriage, Fairy-Lit Winter Birches, Crackling Ice-Rink Braziers, Storybook Villagers,
 *    and 6-DOF Santa's Sleigh escort formation!
 */

import {
  AASpriteRenderer,
  SceneWorld,
  clamp,
  createVolumeAsset,
  lerp,
  quatFromYawPitchRoll,
  quatIdentity,
  vec3Add,
  vec3Norm,
  vec3Scale,
  type AAQuality,
  type EntityState,
  type RibbonPoint,
  type RibbonState,
  type Vec3,
  type VolumeAsset,
} from "@aastack/core";
import {
  createAirwolfFuselageAsset,
  createMainRotorAsset,
  createTailRotorAsset,
} from "../../airwolf-city/src/assets.js";
import {
  createDutchGableBookshop,
  createGrandClocktowerHall,
  createHillsideCottage,
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

type CamMode = "wide" | "street" | "plaza" | "airwolf" | "sleigh";
type TodPreset = "eve" | "midnight" | "morning";
type SnowMode = "gentle" | "heavy" | "off";

const MAX_SLICES = 56;
const AIRWOLF_SCALE = 0.72;

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

// HD-2D + pbr-lite velvety lighting + whisper-thin outline (0.24) so 18-neighbor cavity AO shines!
const world = new SceneWorld({
  seed: 25,
  style: "hd-2d",
  aaMode: "voxel-dda",
  samples: initQuality === "eco" ? 2 : initQuality === "balanced" ? 4 : 8,
  camera: {
    mode: "free",
    pos: [32, 30, 58],
    target: [-1, 6.5, 4],
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
    provenance: { kind: "blueprint", source: "xmas-mainstreet-v3" },
  });
}

// ---------------------------------------------------------------------------
// 1. Dual-Resolution Micro-Voxel Asset Pack (Classic 1x <-> Ultra HD 2x!)
// ---------------------------------------------------------------------------
const assetPacks: Partial<Record<DetailLevel, VolumeAsset[]>> = {};
world.registerAsset(createLightProxyAsset());
world.registerAsset(createSnowflakeAsset());

function buildAssetPack(detail: DetailLevel): VolumeAsset[] {
  const awDetail = detail === "ultra" ? "hd" : "classic";
  return [
    // Hero Airwolf Bell 222A (56-slice Ultra HD / 28-slice Classic) + Articulated Rotors
    createAirwolfFuselageAsset(awDetail),
    createMainRotorAsset(awDetail),
    createTailRotorAsset(awDetail),
    // 9 Bespoke Architectural Landmarks
    createGrandClocktowerHall(detail),
    createTurretToyEmporium(detail),
    createStarlightCinema(detail),
    createTudorBakeryCafe(detail),
    createDutchGableBookshop(detail),
    createVerandaNorthStarInn(detail),
    createParkBandstandGazebo(detail),
    createStoneArchBridge(detail),
    createHillsideCottage(detail),
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

  // Keep Airwolf exploded slice clips synced to active slice resolution (56 for Ultra, 28 for Classic)
  const activeSlices = detail === "ultra" ? 56 : 28;
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
// 2. Populate Micro-Voxel Main Street Christmas Village + Airwolf Patrol
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

// Shadow-caster slot 1 (ALWAYS present): Airwolf Soft Aerial Drop Shadow
initialEntities.push({
  id: "airwolf_shadow_proxy",
  assetId: "light_proxy",
  pos: [6.5, 16.0, -11.5],
  rot: quatIdentity(),
  scale: 3.6,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Shadow-caster slot 2 (ALWAYS present): Airwolf Real-Time Bayer Searchlight Pool
initialEntities.push({
  id: "airwolf_spot_proxy",
  assetId: "light_proxy",
  pos: [0, 0.2, 0],
  rot: quatIdentity(),
  scale: 4.8,
  outline: false,
  castShadow: true,
  visible: true,
  tag: "proxy",
});

// Hero Airwolf Bell 222A Fuselage + Articulated Rotors + 56 Instanced Exploded Slices
initialEntities.push({
  id: "airwolf",
  assetId: "airwolf_hull",
  pos: [6.5, 16.0, -11.5],
  rot: quatIdentity(),
  scale: AIRWOLF_SCALE,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.55,
  castShadow: false,
  visible: true,
  tag: "player",
});

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

// Hero Landmark 4: Arched Granite Footbridge dead-center over our winding frozen winter creek (Z = 45.5)!
initialEntities.push({
  id: "creek_bridge",
  assetId: "xmas_bridge",
  pos: [0, 0, 45.5],
  rot: quatFromYawPitchRoll(Math.PI / 2, 0, 0),
  scale: 1.25,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.35,
  tag: "landmark",
});

// 4 Cozy Snow-Draped Hillside Valley Cottages tucked into the surrounding evergreen hills!
const COTTAGES: Array<[string, number, number, number, number]> = [
  ["cottage_nw", -35.5, -31.5, -Math.PI * 0.34, 1.05],
  ["cottage_ne", 34.5, -28.0, Math.PI * 0.36, 1.02],
  ["cottage_w", -34.5, 14.5, -Math.PI * 0.44, 1.04],
  ["cottage_e", 34.5, 16.5, Math.PI * 0.46, 1.00],
];
for (const [id, cx, cz, yaw, sc] of COTTAGES) {
  initialEntities.push({
    id,
    assetId: "xmas_cottage",
    pos: [cx, 0, cz],
    rot: quatFromYawPitchRoll(yaw, 0, 0),
    scale: sc,
    aaPriority: "hero",
    outline: true,
    emissiveBoost: 1.32,
    tag: "building",
  });
}

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

// 8 Bespoke Main Street Historic Buildings (varied silhouettes, turrets, Dutch gables & marquees!)
const WEST_ROW: Array<[string, string, number]> = [
  ["w_toys", "shop_toys", 2.0],
  ["w_bakery", "shop_bakery", 13.5],
  ["w_books", "shop_books", 25.0],
  ["w_inn_sw", "shop_inn", 36.2],
];
const EAST_ROW: Array<[string, string, number]> = [
  ["e_cinema", "shop_cinema", 2.0],
  ["e_books", "shop_books", 13.5],
  ["e_toys", "shop_toys", 25.0],
  ["e_bakery", "shop_bakery", 36.2],
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

// Baroque Santa's 6-DOF Sleigh + 5 Galloping Reindeer flying high escort formation!
initialEntities.push({
  id: "santa_sleigh",
  assetId: "santa_sleigh",
  pos: [-16, 24.5, -18],
  rot: quatIdentity(),
  scale: 0.92,
  aaPriority: "hero",
  outline: true,
  emissiveBoost: 1.5,
  tag: "sleigh",
});

// Ornate Victorian Twin-Globe Streetlamps lining Main Street, Plaza & Ice Rink!
const LAMP_POS: Array<[number, number, number]> = [
  [-7.1, -4, 0], [7.1, -4, 0],
  [-7.1, 8, 0], [7.1, 8, 0],
  [-7.1, 20, 0], [7.1, 20, 0],
  [-7.1, 32, 0], [7.1, 32, 0],
  [-7.1, 39.2, 0], [7.1, 39.2, 0],
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
  [-10.4, 38.6, -Math.PI * 0.25],
];
SNOWMEN.forEach(([sx, sz, yaw], i) => {
  initialEntities.push({ id: `snowman_${i}`, assetId: "xmas_snowman", pos: [sx, 0, sz], rot: quatFromYawPitchRoll(yaw, 0, 0), scale: 1.0, aaPriority: "hero", outline: true, tag: "prop" });
});

// Delicate Fairy-Lit White Winter Birch Trees framing Town Square & Creek Bridge!
const BIRCHES: Array<[number, number, number]> = [
  [-10.8, -36.5, 1.05],
  [11.4, -36.0, 0.98],
  [13.8, -9.8, 0.92],
  [-11.2, 49.6, 1.0],
  [11.2, 51.0, 0.95],
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
  ["shopper_8", "villager_plum", -12.0, -14.2, 0.2],
  ["shopper_9", "villager_navy", -11.8, -27.2, -0.5],
];
for (const [id, assetId, px, pz, yaw] of SHOPPERS) {
  initialEntities.push({ id, assetId, pos: [px, 0, pz], rot: quatFromYawPitchRoll(yaw, 0, 0), scale: 1.0, aaPriority: "hero", outline: true, tag: "shopper" });
}

// Dense Multi-Species Snow-Laden Alpine Forest wrapping around the village, cottages & winter creek!
const FOREST: Array<[number, number, number, boolean]> = [
  [-32, -46, 1.32, true], [-24, -48, 1.20, false], [-15, -49, 1.38, true], [-7, -50, 1.15, false],
  [8, -50, 1.28, true], [16, -48, 1.42, true], [25, -46, 1.24, false], [33, -43, 1.35, true],
  [-42, -39, 1.32, false], [-36, -18, 1.26, false], [-34, -8, 1.30, true],
  [-29, 4, 1.24, false], [-29, 27, 1.22, false], [-31, 36, 1.35, true],
  [-24, 54, 1.28, true], [-14, 55, 1.15, false], [15, 55, 1.26, true], [25, 54, 1.34, false],
  [41, -35, 1.34, true], [36, -14, 1.32, true], [34, -4, 1.24, false],
  [29, 4, 1.22, false], [29, 28, 1.24, false], [31, 37, 1.32, true],
  [-44, -26, 1.45, true], [-43, -10, 1.30, false], [-44, 16, 1.42, true], [44, -18, 1.40, true], [44, 18, 1.35, false],
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
// 3. Simulation State: Airwolf Patrol, Searchlight, Exploded Slices & Sleigh
// ---------------------------------------------------------------------------
const state = {
  detail: initDetail as DetailLevel,
  camMode: ((): CamMode => {
    const c = params.get("cam");
    if (c === "street" || c === "plaza" || c === "airwolf" || c === "sleigh") return c;
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
  orbitPitchOffset: 0.41,
  zoomDist: 78,
  camPosSmooth: [32, 34, 68] as Vec3,
  camTargetSmooth: [-1, 5.5, 7] as Vec3,
  camUpSmooth: [0, 1, 0] as Vec3,

  // Airwolf Bell 222A Patrol & 6-DOF Flight State
  awManual: false,
  awPos: [6.5, 16.0, -11.5] as Vec3,
  awVel: [0, 0, 0] as Vec3,
  awYaw: -2.35,
  awPitch: -0.14,
  awRoll: 0.14,
  awRotorAng: 0,
  awTailAng: 0,
  awTurbo: 0,
  turboForced: params.get("turbo") === "1",
  searchlightOn: params.get("searchlight") !== "0",
  exploded: params.get("exploded") === "1",
  explodeT: params.get("exploded") === "1" ? 1 : 0,
  spotWorld: [0, 0.2, 4] as Vec3,
  spotTargetLabel: "Main Street Snow",

  // Santa's 6-DOF Sleigh High Escort State
  sleighManual: false,
  sleighPos: [-16, 24.5, -18] as Vec3,
  sleighVel: [0, 0, 0] as Vec3,
  sleighYaw: 0.4,
  sleighPitch: -0.05,
  sleighRoll: 0.12,
};

const jetTrailL: RibbonPoint[] = [];
const jetTrailR: RibbonPoint[] = [];
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

/**
 * Airwolf Christmas Eve Patrol Loop:
 * Sweeps smoothly down Main Street, over the Heritage Trolley & Granite Bridge, across the
 * Frozen Ice Rink, and past the Giant Christmas Tree while staying clear of tall landmarks.
 * At default t = 4.5, Airwolf is framed heroically at [-3.0, 15.3, -5.9] sweeping southeast
 * across open airspace with its golden nose searchlight cutting across snowy Main Street!
 */
function sampleAirwolfAutopilot(t: number): { pos: Vec3; vel: Vec3; yaw: number; bank: number; turboPulse: number } {
  const w = 0.25;
  const a = 1.34 + (t - 4.5) * w;
  const xAt = (s: number) => -13.0 * Math.cos(s);
  const zAt = (s: number) => 12.0 - 22.0 * Math.cos(s - 0.72);
  const yAt = (s: number) => 14.2 + Math.cos(s - 0.72) * 1.4;

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

  const bank = clamp((-dYaw / dtSec) * 0.65, -0.46, 0.46);
  const turboPulse = clamp(Math.sin(a * 2.0 - 1.4) * 1.3 - 0.75, 0, 1);
  return { pos: [x, y, z], vel: [vx, vy, vz], yaw, bank, turboPulse };
}

function sampleSleighAutopilot(t: number): { pos: Vec3; vel: Vec3; yaw: number; bank: number } {
  const w = 0.21;
  const a = t * w + 2.4;
  const xAt = (s: number) => Math.sin(s) * 28.0;
  const zAt = (s: number) => -4.0 + Math.cos(s) * 35.0;
  const yAt = (s: number) => 24.5 + Math.sin(s * 2.0) * 2.4;
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
  return { pos: [x, y, z], vel: [vx, vy, vz], yaw, bank: clamp((-dy / dt) * 0.62, -0.42, 0.42) };
}

function stepSimulation(dt: number): void {
  const safeDt = Math.min(dt, 0.05);
  state.simTime += safeDt;
  world.stepClock(safeDt);

  const targetExplode = state.exploded ? 1 : 0;
  state.explodeT = lerp(state.explodeT, targetExplode, 1 - Math.exp(-safeDt * 6.0));
  if (Math.abs(state.explodeT - targetExplode) < 0.002) state.explodeT = targetExplode;

  // 1. Glide Heritage 1900s Holiday Trolley smoothly down center rails!
  const trolley = world.getEntity("holiday_trolley")!;
  const trCycle = Math.sin(state.simTime * 0.18 - 1.15);
  const trVel = Math.cos(state.simTime * 0.18 - 1.15);
  const trZ = 15.0 + trCycle * 19.0;
  const trHeadingSouth = trVel > 0;
  trolley.pos = [0, 0, trZ];
  trolley.rot = quatFromYawPitchRoll(trHeadingSouth ? Math.PI : 0, 0, 0);
  world.getEntity("trolley_headlight_proxy")!.pos = [0, 0.2, trZ + (trHeadingSouth ? 8.2 : -8.2)];

  // 2. Trot Victorian Horse-Drawn Sleigh Carriage northbound & cruise 1950s Woody Wagon southbound!
  const carriage = world.getEntity("horse_carriage")!;
  let zc = carriage.pos[2] - safeDt * 4.4;
  if (zc < -8) zc = 38;
  carriage.pos[2] = zc;

  const wSouth = world.getEntity("woody_southbound")!;
  let zs = wSouth.pos[2] + safeDt * 5.8;
  if (zs > 38) zs = -8;
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

  // 5. Airwolf Bell 222A Patrol / 6-DOF Manual Flight / Exploded 56-Slice Inspection!
  const turboKey = keys.has("ShiftLeft") || keys.has("ShiftRight") || state.turboForced;
  if (state.exploded) {
    state.awVel[0] *= 0.85;
    state.awVel[1] *= 0.85;
    state.awVel[2] *= 0.85;
    state.awPitch = lerp(state.awPitch, -0.04, 1 - Math.exp(-safeDt * 5));
    state.awRoll = lerp(state.awRoll, 0.05, 1 - Math.exp(-safeDt * 5));
    state.awPos[1] = lerp(state.awPos[1], 19.5, 1 - Math.exp(-safeDt * 3.5));
    state.awTurbo = lerp(state.awTurbo, 0, 1 - Math.exp(-safeDt * 6));
    state.awRotorAng += safeDt * 4.5;
    state.awTailAng += safeDt * 9.0;
  } else if (state.awManual) {
    const fwdIn = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const yawIn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    const climbIn = (keys.has("Space") || keys.has("KeyR") ? 1 : 0) - (keys.has("KeyC") || keys.has("KeyF") ? 1 : 0);
    const wantTurbo = turboKey && fwdIn >= 0 ? 1 : 0;
    state.awTurbo = lerp(state.awTurbo, wantTurbo, 1 - Math.exp(-safeDt * 5.5));
    state.awYaw += yawIn * (state.awTurbo > 0.3 ? 1.5 : 1.9) * safeDt;

    const fx = -Math.sin(state.awYaw);
    const fz = -Math.cos(state.awYaw);
    const thrust = (fwdIn + (state.awTurbo > 0.25 && fwdIn >= 0 ? 1.35 * state.awTurbo : 0)) * 30.0;
    const drag = Math.exp(-safeDt * (state.awTurbo > 0.25 ? 1.1 : 1.9));
    state.awVel[0] = state.awVel[0] * drag + fx * thrust * safeDt;
    state.awVel[2] = state.awVel[2] * drag + fz * thrust * safeDt;
    state.awVel[1] = state.awVel[1] * Math.exp(-safeDt * 3.0) + climbIn * 22.0 * safeDt;

    state.awPos[0] = clamp(state.awPos[0] + state.awVel[0] * safeDt, -54, 54);
    state.awPos[1] = clamp(state.awPos[1] + state.awVel[1] * safeDt, 11.5, 42);
    state.awPos[2] = clamp(state.awPos[2] + state.awVel[2] * safeDt, -56, 58);

    const fwdSpeed = state.awVel[0] * fx + state.awVel[2] * fz;
    state.awPitch = lerp(state.awPitch, -clamp(fwdSpeed * 0.015 + fwdIn * 0.14 + state.awTurbo * 0.12, -0.26, 0.38), 1 - Math.exp(-safeDt * 6));
    state.awRoll = lerp(state.awRoll, clamp(-yawIn * (0.28 + Math.min(Math.abs(fwdSpeed), 20) * 0.014), -0.55, 0.55), 1 - Math.exp(-safeDt * 6));
    state.awRotorAng += safeDt * (27.0 + state.awTurbo * 16.0);
    state.awTailAng += safeDt * 40.0;
  } else {
    const ap = sampleAirwolfAutopilot(state.simTime);
    const blend = 1 - Math.exp(-safeDt * 4.2);
    state.awPos[0] = lerp(state.awPos[0], ap.pos[0], blend);
    state.awPos[1] = lerp(state.awPos[1], ap.pos[1], blend);
    state.awPos[2] = lerp(state.awPos[2], ap.pos[2], blend);
    state.awVel = ap.vel;

    let dy = ap.yaw - state.awYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    state.awYaw += dy * (1 - Math.exp(-safeDt * 5.0));

    const spd = Math.hypot(ap.vel[0], ap.vel[2]);
    const wantTurbo = turboKey ? 1 : ap.turboPulse * 0.65;
    state.awTurbo = lerp(state.awTurbo, wantTurbo, 1 - Math.exp(-safeDt * 4.5));
    state.awPitch = lerp(state.awPitch, -clamp(spd * 0.015 + state.awTurbo * 0.12, 0.05, 0.34), 1 - Math.exp(-safeDt * 4.5));
    state.awRoll = lerp(state.awRoll, ap.bank, 1 - Math.exp(-safeDt * 4.5));
    state.awRotorAng += safeDt * (26.0 + state.awTurbo * 14.0);
    state.awTailAng += safeDt * 38.0;
  }

  // Apply transforms to Airwolf hull, shadow proxy, articulated rotors & 56/28 exploded slices!
  const airwolf = world.getEntity("airwolf")!;
  airwolf.pos = [...state.awPos];
  airwolf.rot = quatFromYawPitchRoll(state.awYaw, state.awPitch, state.awRoll);
  const showSlices = state.explodeT > 0.015;
  airwolf.visible = !showSlices;

  world.getEntity("airwolf_shadow_proxy")!.pos = [...state.awPos];

  const mainRotor = world.getEntity("airwolf_main_rotor")!;
  mainRotor.pos = [0, state.explodeT * 4.0, 0];
  mainRotor.rot = quatFromYawPitchRoll(state.awRotorAng, 0, 0);

  const tailRotor = world.getEntity("airwolf_tail_rotor")!;
  tailRotor.pos = [-state.explodeT * 1.8, 0, 0];
  tailRotor.rot = quatFromYawPitchRoll(0, state.awTailAng, 0);

  const activeSlices = state.detail === "ultra" ? 56 : 28;
  const gapPerSlice = state.detail === "ultra" ? 0.14 : 0.28;
  for (let z = 0; z < MAX_SLICES; z++) {
    const sl = world.getEntity(`airwolf_s${z}`)!;
    const active = showSlices && z < activeSlices;
    sl.visible = active;
    if (active) {
      sl.pos[1] = (z - (activeSlices - 1) * 0.5) * gapPerSlice * state.explodeT;
    }
  }

  // 6. Santa's 6-DOF Sleigh + Galloping Reindeer (High Escort Formation!)
  if (state.sleighManual && state.camMode === "sleigh") {
    const fwdIn = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const yawIn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    const climbIn = (keys.has("Space") || keys.has("KeyR") ? 1 : 0) - (keys.has("KeyC") || keys.has("KeyF") ? 1 : 0);
    state.sleighYaw += yawIn * 1.65 * safeDt;
    const fx = -Math.sin(state.sleighYaw), fz = -Math.cos(state.sleighYaw);
    const spd = 16.0 + fwdIn * 10.0;
    state.sleighVel = [fx * spd, climbIn * 12.0, fz * spd];
    state.sleighPos[0] = clamp(state.sleighPos[0] + state.sleighVel[0] * safeDt, -54, 54);
    state.sleighPos[1] = clamp(state.sleighPos[1] + state.sleighVel[1] * safeDt, 14.0, 44);
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

  // 7. Overhead Festoon Lights, Chimney Smoke, Airwolf Volumetric Searchlight, Mach Afterburners & Stardust!
  const ribbons: RibbonState[] = [];
  const nightW = clamp((world.doc.lighting.timeOfDay - 0.42) / 0.58, 0, 1);
  const strandAlpha = state.tod === "morning" ? 0.22 : 0.56;

  for (const z of [2, 13.5, 25, 36.2]) {
    ribbons.push(makeCatenaryRibbon(`festoon_${z}`, [-12.6, 7.2, z], [12.6, 7.2, z], 1.15, [255, 224, 134], 0.08, strandAlpha));
  }
  ribbons.push(
    makeCatenaryRibbon("rink_str_a", [-10.2, 4.1, -11.2], [-26.8, 4.1, -30.8], 0.95, [255, 224, 138], 0.075, strandAlpha),
    makeCatenaryRibbon("rink_str_b", [-26.8, 4.1, -11.2], [-10.2, 4.1, -30.8], 0.95, [255, 224, 138], 0.075, strandAlpha),
  );

  // Soft curling warm chimney smoke wisps rising from the Tudor Bakery, Veranda Inn & Hillside Cottages!
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
        width: 0.45 + u * 1.35,
      });
    }
    ribbons.push({ id, points: pts, color: [194, 206, 228], alpha: 0.24, emissive: false });
  };
  addSmoke("smoke_bakery", [-15.8, 12.1, 18.0], 0.0);
  addSmoke("smoke_inn", [25.5, 12.8, -21.0], 2.1);
  addSmoke("smoke_cot_nw", [-34.2, 7.8, -32.2], 1.1);
  addSmoke("smoke_cot_e", [35.0, 7.5, 15.2], 3.4);

  // Airwolf Real-Time Volumetric Golden Nose Searchlight Cone + Exact 3D Voxel-DDA Raycast!
  const spotEnt = world.getEntity("airwolf_spot_proxy")!;
  if (state.searchlightOn && state.explodeT < 0.15) {
    const sockPos = world.getSocketWorldPos("airwolf", "searchlight") ?? state.awPos;
    const sweep = !state.awManual ? Math.sin(state.simTime * 0.95) * 0.22 : Math.sin(state.simTime * 0.65) * 0.10;
    const aimYaw = state.awYaw + sweep;
    const aimPitch = clamp(-0.56 + state.awPitch * 0.45, -1.05, -0.28);
    const cp = Math.cos(aimPitch);
    const beamDir: Vec3 = vec3Norm([-Math.sin(aimYaw) * cp, Math.sin(aimPitch), -Math.cos(aimYaw) * cp]);

    const tGround = beamDir[1] < -0.04 ? clamp((0.15 - sockPos[1]) / beamDir[1], 4, 82) : 60;
    const rayStart: Vec3 = vec3Add(sockPos, vec3Scale(beamDir, 1.4));
    const hit = world.raycastEntities(rayStart, beamDir, Math.max(1, tGround - 1.4));
    let beamLen = tGround;
    let targetLabel = "Main Street Snow";
    const validHit = hit
      && hit.entityId !== "airwolf"
      && !hit.entityId.startsWith("airwolf_")
      && !hit.entityId.endsWith("_proxy")
      && !hit.entityId.startsWith("flake_");
    if (validHit && hit) {
      beamLen = hit.distance + 1.4;
      state.spotWorld = [hit.point[0], hit.point[1], hit.point[2]];
      targetLabel = hit.entityId === "town_hall" ? "Clocktower Hall"
        : hit.entityId === "giant_tree" ? "Giant Christmas Tree"
        : hit.entityId === "park_gazebo" ? "Bandstand Gazebo"
        : hit.entityId === "creek_bridge" ? "Granite Creek Bridge"
        : hit.entityId === "holiday_trolley" ? "Heritage Trolley"
        : hit.entityId === "horse_carriage" ? "Horse Sleigh"
        : hit.entityId === "santa_sleigh" ? "Santa's Sleigh"
        : hit.entityId.startsWith("cottage_") ? "Hillside Cottage"
        : hit.entityId.startsWith("w_") || hit.entityId.startsWith("e_") || hit.entityId === "east_plaza_inn" ? "Main St Shops"
        : "Winter Village";
    } else {
      state.spotWorld = [sockPos[0] + beamDir[0] * tGround, 0.2, sockPos[2] + beamDir[2] * tGround];
      const sx = state.spotWorld[0], sz = state.spotWorld[2];
      const inRink = Math.abs(sx + 18.5) < 8.0 && Math.abs(sz + 21.0) < 9.5;
      const inPlaza = Math.abs(sx) < 28 && sz >= -42 && sz <= -8;
      const nearCreek = Math.abs(sz - 45.5) < 5.0;
      targetLabel = inRink ? "Frozen Ice Rink" : inPlaza ? "Town Square" : nearCreek ? "Frozen Winter Creek" : "Main Street Snow";
    }
    state.spotTargetLabel = targetLabel;
    spotEnt.pos = [state.spotWorld[0], 0.2, state.spotWorld[2]];
    spotEnt.scale = validHit ? 3.5 : 5.2;

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
      outerPts.push({ pos: p, age: 0.04 + u * 0.84, width: 0.72 + u * 16.5 });
      innerPts.push({ pos: p, age: 0.02 + u * 0.80, width: 0.36 + u * 6.8 });
    }
    ribbons.push({
      id: "aw_searchlight_outer",
      points: outerPts,
      color: [255, 228, 138],
      alpha: (0.14 + nightW * 0.22) * (1 - state.explodeT * 6),
      emissive: true,
    });
    ribbons.push({
      id: "aw_searchlight_core",
      points: innerPts,
      color: [255, 250, 214],
      alpha: (0.18 + nightW * 0.28) * (1 - state.explodeT * 6),
      emissive: true,
    });
  } else {
    spotEnt.scale = 0.001;
    state.spotTargetLabel = state.exploded ? `${activeSlices}-Slice Inspect` : "Off";
  }

  // Airwolf Twin Dorsal Turbojet Afterburner Ribbons (cyan-blue Mach boost or warm cruise!)
  const jetLPos = world.getSocketWorldPos("airwolf", "jetL");
  const jetRPos = world.getSocketWorldPos("airwolf", "jetR");
  const awSpeed = Math.hypot(state.awVel[0], state.awVel[1], state.awVel[2]);
  const emitJet = !state.exploded && (state.awTurbo > 0.14 || awSpeed > 7.5);
  if (state.exploded) {
    jetTrailL.length = 0;
    jetTrailR.length = 0;
  } else {
    const decay = safeDt * (state.awTurbo > 0.35 ? 1.45 : 3.6);
    for (const tr of [jetTrailL, jetTrailR]) {
      for (let i = tr.length - 1; i >= 0; i--) {
        tr[i].age += decay;
        if (tr[i].age >= 1.0) tr.splice(i, 1);
      }
    }
    if (emitJet && jetLPos && jetRPos) {
      if (jetTrailL.length > 0 && Math.hypot(jetLPos[0] - jetTrailL[0].pos[0], jetLPos[2] - jetTrailL[0].pos[2]) > 6.0) {
        jetTrailL.length = 0; jetTrailR.length = 0;
      }
      const w = 0.32 + state.awTurbo * 0.48;
      jetTrailL.unshift({ pos: [...jetLPos], age: 0.01, width: w });
      jetTrailR.unshift({ pos: [...jetRPos], age: 0.01, width: w });
      if (jetTrailL.length > 24) jetTrailL.length = 24;
      if (jetTrailR.length > 24) jetTrailR.length = 24;
    }
    if (jetTrailL.length >= 2) {
      const col: [number, number, number] = state.awTurbo > 0.4 ? [116, 232, 255] : [255, 178, 86];
      const alpha = clamp(0.32 + state.awTurbo * 0.54, 0.26, 0.86);
      ribbons.push({ id: "aw_jet_l", points: jetTrailL, color: col, alpha, emissive: true });
      ribbons.push({ id: "aw_jet_r", points: jetTrailR, color: col, alpha, emissive: true });
    }
  }

  // Santa's Sleigh Magical Golden Stardust Trails
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
    stardustL.unshift({ pos: [...rL], age: 0.01, width: 0.34 });
    stardustR.unshift({ pos: [...rR], age: 0.01, width: 0.34 });
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

  if (state.explodeT > 0.25) {
    const orbYaw = state.awYaw + state.orbitYawOffset + state.simTime * 0.16;
    const dist = clamp(state.zoomDist * 0.36, 24, 38);
    const elev = clamp(state.orbitPitchOffset * 0.62, 0.14, 0.62);
    wantPos = [
      state.awPos[0] + Math.sin(orbYaw) * Math.cos(elev) * dist,
      state.awPos[1] + Math.sin(elev) * dist + 1.4,
      state.awPos[2] + Math.cos(orbYaw) * Math.cos(elev) * dist,
    ];
    wantTarget = [state.awPos[0], state.awPos[1] + 1.4, state.awPos[2]];
    wantFov = 40;
  } else if (state.camMode === "street") {
    wantPos = [3.2 + Math.sin(state.orbitYawOffset) * 2.5, 4.4, 30.5];
    wantTarget = [-0.4, 6.2, -20.0];
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
  } else if (state.camMode === "airwolf") {
    const fx = -Math.sin(state.awYaw), fz = -Math.cos(state.awYaw);
    const rx = Math.cos(state.awYaw), rz = -Math.sin(state.awYaw);
    const dist = 13.6 + state.awTurbo * 2.6;
    const sideOff = 3.2;
    const height = 4.4 - state.awTurbo * 0.5;
    wantPos = [
      state.awPos[0] - fx * dist + rx * sideOff,
      Math.max(4.5, state.awPos[1] + height),
      state.awPos[2] - fz * dist + rz * sideOff,
    ];
    wantTarget = [state.awPos[0] + fx * 11.5, state.awPos[1] - 2.0, state.awPos[2] + fz * 11.5];
    const bankCam = state.awRoll * 0.26;
    wantUp = vec3Norm([rx * Math.sin(bankCam), Math.cos(bankCam), rz * Math.sin(bankCam)]);
    wantFov = 46 + state.awTurbo * 5;
  } else if (state.camMode === "sleigh") {
    const fx = -Math.sin(state.sleighYaw), fz = -Math.cos(state.sleighYaw);
    wantPos = [state.sleighPos[0] - fx * 15.5, state.sleighPos[1] + 5.2, state.sleighPos[2] - fz * 15.5];
    wantTarget = [state.sleighPos[0] + fx * 14.0, state.sleighPos[1] - 3.2, state.sleighPos[2] + fz * 14.0];
    const bankCam = state.sleighRoll * 0.26;
    const rx = Math.cos(state.sleighYaw), rz = -Math.sin(state.sleighYaw);
    wantUp = vec3Norm([rx * Math.sin(bankCam), Math.cos(bankCam), rz * Math.sin(bankCam)]);
    wantFov = 48;
  } else {
    const dist = clamp(state.zoomDist, 28, 124);
    const elev = clamp(state.orbitPitchOffset, 0.20, 1.10);
    const az = state.orbitYawOffset;
    wantTarget = [-1.0, 5.5, 7.0];
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
  setP("btnCamWide", !state.exploded && state.camMode === "wide");
  setP("btnCamStreet", !state.exploded && state.camMode === "street");
  setP("btnCamPlaza", !state.exploded && state.camMode === "plaza");
  setP("btnCamAirwolf", !state.exploded && state.camMode === "airwolf");
  setP("btnCamSleigh", !state.exploded && state.camMode === "sleigh");
  setP("btnExploded", state.exploded);
  setP("btnTurbo", state.turboForced || state.awTurbo > 0.45);
  setP("btnSearchlight", state.searchlightOn);
  setP("btnDetail_classic", state.detail === "classic");
  setP("btnDetail_ultra", state.detail === "ultra");
  setP("btnSplit", state.splitEnabled);
  setP("btnTod_eve", state.tod === "eve");
  setP("btnTod_midnight", state.tod === "midnight");
  setP("btnTod_morning", state.tod === "morning");
  setP("btnQual_eco", state.quality === "eco");
  setP("btnQual_balanced", state.quality === "balanced");
  setP("btnQual_ultra", state.quality === "ultra");
  const expBtn = document.getElementById("btnExploded");
  if (expBtn) expBtn.textContent = state.detail === "ultra" ? "Exploded 56-Slice (X)" : "Exploded 28-Slice (X)";
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
  const awSlices = state.detail === "ultra" ? 56 : 28;
  const detLabel = state.detail === "ultra" ? "Ultra HD 2x (56-sl Airwolf, 132-sl Village)" : "Classic 1x";
  const viewLabel = state.exploded
    ? `EXPLODED ${awSlices}-SLICE (1 DRAW)`
    : state.camMode === "airwolf"
      ? (state.awManual ? "AIRWOLF MANUAL 6-DOF" : "AIRWOLF PATROL CHASE")
      : state.camMode === "street" ? "MAIN STREET POSTCARD"
      : state.camMode === "plaza" ? "TOWN SQUARE TREE, RINK & GAZEBO"
      : state.camMode === "sleigh" ? (state.sleighManual ? "SANTA SLEIGH MANUAL 6-DOF" : "SANTA SLEIGH ESCORT")
      : "WIDE WINTER VILLAGE + AIRWOLF";
  const turboLabel = state.awTurbo > 0.45 ? "MACH BOOST" : "CRUISE";
  statsEl.textContent =
    `VIEW    ${viewLabel}  |  ${detLabel}\n` +
    `AIRWOLF ALT ${state.awPos[1].toFixed(1).padStart(4, " ")}m  |  ${turboLabel}  |  SPOT: ${state.spotTargetLabel}\n` +
    `ENGINE  ${s.fps.toFixed(0).padStart(2, " ")} FPS  |  ${s.drawCalls} draws (${s.visibleEntities}/${s.totalEntities} ents)  |  ${s.activeSamples}x RGSS AA`;
}

document.getElementById("btnCamWide")?.addEventListener("click", () => { state.exploded = false; state.camMode = "wide"; state.orbitYawOffset = 0.42; state.orbitPitchOffset = 0.41; state.zoomDist = 78; syncUiButtons(); });
document.getElementById("btnCamStreet")?.addEventListener("click", () => { state.exploded = false; state.camMode = "street"; state.orbitYawOffset = 0.0; syncUiButtons(); });
document.getElementById("btnCamPlaza")?.addEventListener("click", () => { state.exploded = false; state.camMode = "plaza"; state.orbitYawOffset = 0.52; state.orbitPitchOffset = 0.40; state.zoomDist = 52; syncUiButtons(); });
document.getElementById("btnCamAirwolf")?.addEventListener("click", () => { state.exploded = false; state.camMode = "airwolf"; syncUiButtons(); });
document.getElementById("btnCamSleigh")?.addEventListener("click", () => { state.exploded = false; state.camMode = "sleigh"; syncUiButtons(); });
document.getElementById("btnExploded")?.addEventListener("click", () => { state.exploded = !state.exploded; syncUiButtons(); });
document.getElementById("btnTurbo")?.addEventListener("click", () => { state.turboForced = !state.turboForced; syncUiButtons(); });
document.getElementById("btnSearchlight")?.addEventListener("click", () => { state.searchlightOn = !state.searchlightOn; syncUiButtons(); });
document.getElementById("btnDetail_classic")?.addEventListener("click", () => { applyDetailPack("classic"); applySplit(); syncUiButtons(); });
document.getElementById("btnDetail_ultra")?.addEventListener("click", () => { applyDetailPack("ultra"); applySplit(); syncUiButtons(); });
document.getElementById("btnSplit")?.addEventListener("click", () => { state.splitEnabled = !state.splitEnabled; applySplit(); syncUiButtons(); });
document.getElementById("btnSnow")?.addEventListener("click", () => { state.snowMode = state.snowMode === "gentle" ? "heavy" : state.snowMode === "heavy" ? "off" : "gentle"; syncUiButtons(); });
for (const t of ["eve", "midnight", "morning"] as TodPreset[]) document.getElementById(`btnTod_${t}`)?.addEventListener("click", () => { applyTod(t); syncUiButtons(); });
for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) document.getElementById(`btnQual_${q}`)?.addEventListener("click", () => { applyQuality(q); applySplit(); syncUiButtons(); });

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  keys.add(e.code);
  const isFlightKey = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyC"].includes(e.code);
  if (isFlightKey) {
    if (e.code === "Space") e.preventDefault();
    if (state.camMode === "sleigh") {
      state.sleighManual = true;
    } else {
      state.exploded = false;
      state.awManual = true;
      if (state.camMode !== "airwolf") state.camMode = "airwolf";
      syncUiButtons();
    }
  }
  if (e.code === "KeyG") { applyDetailPack(state.detail === "ultra" ? "classic" : "ultra"); applySplit(); syncUiButtons(); }
  else if (e.code === "KeyX") { state.exploded = !state.exploded; syncUiButtons(); }
  else if (e.code === "KeyM") { state.searchlightOn = !state.searchlightOn; syncUiButtons(); }
  else if (e.code === "KeyP") { state.awManual = false; state.sleighManual = false; syncUiButtons(); }
  else if (e.code === "KeyV") {
    state.exploded = false;
    state.camMode = state.camMode === "wide" ? "street"
      : state.camMode === "street" ? "plaza"
      : state.camMode === "plaza" ? "airwolf"
      : state.camMode === "airwolf" ? "sleigh"
      : "wide";
    syncUiButtons();
  }
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
canvas.addEventListener("wheel", (e) => { e.preventDefault(); state.zoomDist = clamp(state.zoomDist + e.deltaY * 0.045, 24, 124); }, { passive: false });

applyDetailPack(state.detail);
applyTod(state.tod);
applyQuality(state.quality);
applySplit();

const aw0 = sampleAirwolfAutopilot(state.simTime);
state.awPos = [...aw0.pos];
state.awYaw = aw0.yaw;
state.awRoll = aw0.bank;

const sl0 = sampleSleighAutopilot(state.simTime);
state.sleighPos = [...sl0.pos];
state.sleighYaw = sl0.yaw;
state.sleighRoll = sl0.bank;

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
        exploded: boolean;
        turboForced: boolean;
        searchlightOn: boolean;
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
      if (opts.camMode === "wide") { state.orbitYawOffset = 0.42; state.orbitPitchOffset = 0.41; state.zoomDist = 78; }
      else if (opts.camMode === "plaza") { state.orbitYawOffset = 0.52; state.orbitPitchOffset = 0.40; state.zoomDist = 52; }
      else if (opts.camMode === "street") { state.orbitYawOffset = 0.0; }
    }
    if (opts.exploded !== undefined) {
      state.exploded = opts.exploded;
      state.explodeT = opts.exploded ? 1 : 0;
      if (opts.exploded) { jetTrailL.length = 0; jetTrailR.length = 0; }
    }
    if (opts.turboForced !== undefined) {
      state.turboForced = opts.turboForced;
      state.awTurbo = opts.turboForced ? 1.0 : 0.0;
    }
    if (opts.searchlightOn !== undefined) state.searchlightOn = opts.searchlightOn;
    if (opts.tod !== undefined) applyTod(opts.tod);
    if (opts.snowMode !== undefined) state.snowMode = opts.snowMode;
    if (opts.quality !== undefined) applyQuality(opts.quality);
    if (opts.splitEnabled !== undefined) state.splitEnabled = opts.splitEnabled;
    if (opts.splitX !== undefined) state.splitX = opts.splitX;
    if (opts.orbitYawOffset !== undefined) state.orbitYawOffset = opts.orbitYawOffset;
    if (opts.orbitPitchOffset !== undefined) state.orbitPitchOffset = opts.orbitPitchOffset;
    if (opts.zoomDist !== undefined) state.zoomDist = opts.zoomDist;
    if (opts.simTime !== undefined) {
      jetTrailL.length = 0; jetTrailR.length = 0;
      stardustL.length = 0; stardustR.length = 0;
      state.simTime = opts.simTime;
      const aw = sampleAirwolfAutopilot(state.simTime);
      state.awPos = [...aw.pos];
      state.awYaw = aw.yaw;
      state.awRoll = aw.bank;
      const sl = sampleSleighAutopilot(state.simTime);
      state.sleighPos = [...sl.pos];
      state.sleighYaw = sl.yaw;
      state.sleighRoll = sl.bank;
    }
    if (opts.noHud !== undefined) document.body.classList.toggle("nohud", opts.noHud);
    applySplit();
    stepSimulation(0.016);
    if (opts.turboForced) {
      for (let i = 0; i < 18; i++) stepSimulation(0.04);
    }
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
