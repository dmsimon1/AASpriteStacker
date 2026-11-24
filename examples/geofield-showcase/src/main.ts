/**
 * AA-GeoField Procedural Showcase (@aastack/core + @aastack/geofield).
 * Demonstrates:
 *  - Crisp Anti-Oversmoothed R16F Continuous SDF (matte stone/wood/foliage, zero plastic gloss)
 *  - Seam-Free Periodic Wrapped Surface UVs (360-deg cylindrical bricks, radiating barrel roof tiles,
 *    and radial wedge voussoirs fanning cleanly around curved Roman bridge arches)
 *  - Contemporary High-Detail Multifractal Terrain (Ken Musgrave Ridged Multifractal + Giliam de
 *    Carpentier Swiss-Turbulence analytical erosion + 10-octave fractured rock detail normals)
 *  - Lightweight 2D Sprite-Stack Parity (1-Draw-Call Exploded Slices + slices.png Export)
 */

import {
  AASpriteRenderer,
  SceneWorld,
  clamp,
  createVolumeAsset,
  lerp,
  packHorizontalSliceStrip,
  quatFromYawPitchRoll,
  quatIdentity,
  vec3Add,
  vec3Norm,
  vec3Scale,
  type AAQuality,
  type EntityState,
  type PointLightState,
  type RibbonPoint,
  type RibbonState,
  type Vec3,
  type VolumeAsset,
} from "@aastack/core";
import {
  SimulationZone,
  sampleMultifractalTerrain,
  type MultifractalTerrainConfig,
} from "@aastack/geofield";
import { GEOFIELD_GROUND_FS } from "./ground-shader.js";
import {
  createAlpineSpruceGeo,
  createBathyspherePropeller,
  createBioCoralCluster,
  createBrassBathysphere,
  createCoastalLimestoneCliff,
  createCoastalLookoutTower,
  createCoastalSkiff,
  createCoastalStoneViaduct,
  createGlowOrbAsset,
  createGnarledOliveTree,
  createSunkenRomanRotunda,
  createTuscanCypress,
  createVolcanicCaveArch,
  type GeoParams,
} from "./worlds.js";

type WorldId = "rotunda" | "coastal" | "alpine";
type TodMode = "auto" | "day" | "golden" | "twilight" | "night";

const EXPLODE_SLICES = 46;

const params = new URLSearchParams(window.location.search);
const noHud = params.get("nohud") === "1";
const holdLoop = params.get("hold") === "1";
if (noHud) document.body.classList.add("nohud");

const initQuality = (params.get("quality") as AAQuality | null) ?? "ultra";
const rawW = params.get("world");
const initWorld: WorldId = rawW === "coastal" ? "coastal" : rawW === "alpine" ? "alpine" : "rotunda";

function worldSeed(w: WorldId): number {
  if (w === "alpine") return 137;
  if (w === "coastal") return 75;
  return 25;
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new AASpriteRenderer(canvas, {
  background: "terrain",
  terrainShader: GEOFIELD_GROUND_FS,
  quality: initQuality,
  instanceBatching: "aggressive",
  adaptiveDpr: !holdLoop,
  maxDpr: initQuality === "ultra" ? 2.0 : 1.5,
  preserveDrawingBuffer: true,
});

const world = new SceneWorld({
  seed: worldSeed(initWorld),
  style: "hd-2d",
  aaMode: "smooth-sdf",
  samples: initQuality === "eco" ? 2 : initQuality === "balanced" ? 4 : 8,
  camera: {
    mode: "free",
    pos: [26, 20, 38],
    target: [0, 8, -2],
    up: [0, 1, 0],
    fovDeg: 38,
    orthoSize: 28,
    near: 0.4,
    far: 760,
  },
  lighting: {
    sunAzimuthDeg: 36,
    sunElevationDeg: 44,
    timeOfDay: 0.72,
    fogDensity: 0.24,
    shadeStyle: "pbr-lite",
    outlineWidth: 0.0,
    selfShadow: true,
    microRelief: 0.88,
    styleDial: 0.0,
    pointLights: [],
  },
  terrain: {
    enabled: true,
    seed: worldSeed(initWorld),
    maxHeight: 64,
    scale: 1.0,
    waveTime: 0,
    terraceSteps: 1.0,
  },
  splitCompare: {
    enabled: false,
    splitX: 0.5,
    leftMode: "voxel-dda",
    rightMode: "smooth-sdf",
  },
});

function createLightProxyAsset(): VolumeAsset {
  return createVolumeAsset({
    id: "geo_light_proxy",
    name: "Light Proxy",
    w: 2, l: 2, h: 2,
    voxelScale: 0.01,
    pivot: [1, 1, 1],
    rgba: new Uint8Array(2 * 2 * 2 * 4),
    computeSdf: false,
    provenance: { kind: "geofield", source: "proxy" },
  });
}

// ---------------------------------------------------------------------------
// 1. State, Multifractal Config, Asset Cache & Simulation Zone
// ---------------------------------------------------------------------------
const state = {
  worldId: initWorld as WorldId,
  tod: "auto" as TodMode,
  quality: initQuality as AAQuality,
  microRelief: clamp(Number(params.get("relief") ?? 0.88) || 0.88, 0, 1),
  weathering: 0.45,
  drape: 0.72,
  ridgeWeight: clamp(Number(params.get("ridge") ?? 1.0) || 1.0, 0.2, 1.5),
  erosion: clamp(Number(params.get("erosion") ?? 1.0) || 1.0, 0.0, 1.5),
  maxHeight: 44.0,
  splitEnabled: params.get("split") === "1",
  splitX: clamp(Number(params.get("splitX") ?? 0.5) || 0.5, 0.08, 0.92),
  exploded: params.get("exploded") === "1",
  explodeT: params.get("exploded") === "1" ? 1 : 0,
  simTime: Number(params.get("t") ?? 4.2) || 4.2,

  orbitYaw: 0.48,
  orbitPitch: 0.34,
  zoomDist: 46,
  camTarget: [0, 8.2, -2.5] as Vec3,
  camPosSmooth: [24, 21, 38] as Vec3,
  camTargetSmooth: [0, 8.2, -2.5] as Vec3,

  bathyPos: [10.5, 7.6, 8.5] as Vec3,
  bathyYaw: 0.75,
  bathyRoll: 0.0,
  propAng: 0,
  spotGround: [2.0, 0.1, -1.0] as Vec3,
};

function currentTerrainCfg(): MultifractalTerrainConfig {
  return {
    seed: 137,
    maxHeight: state.maxHeight,
    ridgeWeight: state.ridgeWeight,
    erosion: state.erosion,
    snowline: 22.0,
    gorgeEnabled: true,
  };
}

// Deterministic Alpine Spruce scatter coordinates snapped live via sampleMultifractalTerrain
const ALPINE_SPRUCE_SLOTS: Array<{ id: string; assetId: string; x: number; z: number; yaw: number; scale: number }> = [
  { id: "spruce_0", assetId: "alpine_spruce_a", x: -34.0, z: -4.0, yaw: 0.4, scale: 1.08 },
  { id: "spruce_1", assetId: "alpine_spruce_b", x: -30.5, z: -18.5, yaw: 1.8, scale: 1.22 },
  { id: "spruce_2", assetId: "alpine_spruce_a", x: -38.5, z: -13.0, yaw: 3.1, scale: 1.15 },
  { id: "spruce_3", assetId: "alpine_spruce_b", x: -23.5, z: -21.0, yaw: 0.9, scale: 0.95 },
  { id: "spruce_4", assetId: "alpine_spruce_a", x: -29.5, z: 11.5, yaw: 2.4, scale: 1.05 },
  { id: "spruce_5", assetId: "alpine_spruce_b", x: -37.0, z: 16.0, yaw: 4.5, scale: 0.96 },
  { id: "spruce_6", assetId: "alpine_spruce_a", x: -21.0, z: 16.0, yaw: 1.2, scale: 0.86 },
  { id: "spruce_7", assetId: "alpine_spruce_b", x: 25.0, z: -10.5, yaw: 2.1, scale: 1.18 },
  { id: "spruce_8", assetId: "alpine_spruce_a", x: 31.5, z: -5.5, yaw: 0.7, scale: 1.05 },
  { id: "spruce_9", assetId: "alpine_spruce_b", x: 29.0, z: -20.5, yaw: 3.7, scale: 1.26 },
  { id: "spruce_10", assetId: "alpine_spruce_a", x: 37.5, z: -16.5, yaw: 5.0, scale: 1.10 },
  { id: "spruce_11", assetId: "alpine_spruce_b", x: 27.0, z: 10.5, yaw: 1.5, scale: 1.02 },
  { id: "spruce_12", assetId: "alpine_spruce_a", x: 34.5, z: 5.5, yaw: 2.9, scale: 0.98 },
  { id: "spruce_13", assetId: "alpine_spruce_b", x: 23.0, z: 17.5, yaw: 4.1, scale: 0.88 },
  { id: "spruce_14", assetId: "alpine_spruce_a", x: -24.0, z: -34.0, yaw: 0.2, scale: 1.25 },
  { id: "spruce_15", assetId: "alpine_spruce_b", x: 24.5, z: -35.0, yaw: 2.6, scale: 1.20 },
  { id: "spruce_16", assetId: "alpine_spruce_a", x: -42.0, z: -28.0, yaw: 1.1, scale: 1.30 },
  { id: "spruce_17", assetId: "alpine_spruce_b", x: 43.0, z: -27.0, yaw: 3.4, scale: 1.28 },
];

interface Particle {
  id: string;
  x0: number;
  z0: number;
  y: number;
  speed: number;
  phase: number;
  amp: number;
}

const particleZone = new SimulationZone<Particle[]>(
  () => {
    const arr: Particle[] = [];
    for (let i = 0; i < 42; i++) {
      const ang = (i * 2.39996) % (Math.PI * 2);
      const rad = 2.0 + ((i * 37.13) % 1) * 20.0;
      arr.push({
        id: `orb_${i}`,
        x0: Math.cos(ang) * rad,
        z0: -2.0 + Math.sin(ang) * rad,
        y: 1.0 + ((i * 19.73) % 1) * 22.0,
        speed: 0.7 + (i % 5) * 0.25,
        phase: i * 0.92,
        amp: 0.65 + (i % 4) * 0.25,
      });
    }
    return arr;
  },
  (arr, dt, time) => {
    for (const p of arr) {
      p.y += p.speed * dt;
      if (p.y > 23.0) p.y = 0.8;
      p.phase += dt * 0.25;
      void time;
    }
  },
);

const assetCache = new Map<string, VolumeAsset>();
world.registerAsset(createLightProxyAsset());
world.registerAsset(createGlowOrbAsset("orb_cyan", [98, 248, 242]));
world.registerAsset(createGlowOrbAsset("orb_gold", [255, 224, 134]));
world.registerAsset(createGlowOrbAsset("orb_snow", [235, 246, 255]));
world.registerAsset(createBathyspherePropeller());
world.registerAsset(createBrassBathysphere());
world.registerAsset(createBioCoralCluster("coral_cyan", [56, 242, 236], 11));
world.registerAsset(createBioCoralCluster("coral_magenta", [244, 86, 178], 29));
world.registerAsset(createGnarledOliveTree("olive_a", 7));
world.registerAsset(createGnarledOliveTree("olive_b", 23));
world.registerAsset(createTuscanCypress("cypress_a", 5));
world.registerAsset(createTuscanCypress("cypress_b", 19));
world.registerAsset(createAlpineSpruceGeo("alpine_spruce_a", 11, 0.56));
world.registerAsset(createAlpineSpruceGeo("alpine_spruce_b", 37, 0.42));
world.registerAsset(createCoastalSkiff());

function ensureParamAssets(worldId: WorldId): void {
  const gp: GeoParams = { weathering: state.weathering, drape: state.drape };
  const bucket = worldId === "rotunda" ? "rotunda" : "arch_tower";
  const key = `${bucket}:${gp.weathering.toFixed(2)}:${gp.drape.toFixed(2)}`;
  if (assetCache.has(key + ":done")) {
    for (const [k, a] of assetCache.entries()) {
      if (k.startsWith(key + ":") && a) world.registerAsset(a);
    }
    return;
  }
  const built: VolumeAsset[] = bucket === "rotunda"
    ? [createSunkenRomanRotunda(gp), createVolcanicCaveArch(gp)]
    : [
        createCoastalStoneViaduct(gp),
        createCoastalLookoutTower(gp),
        createCoastalLimestoneCliff("cliff_west", 13, gp),
        createCoastalLimestoneCliff("cliff_east", 41, gp),
      ];
  for (const a of built) {
    assetCache.set(`${key}:${a.id}`, a);
    world.registerAsset(a);
  }
  assetCache.set(key + ":done", built[0]);
}

function snapAlpineTerrainEntities(): void {
  if (state.worldId !== "alpine") return;
  const cfg = currentTerrainCfg();
  const tower = world.getEntity("hero_actor");
  if (tower) {
    const tSamp = sampleMultifractalTerrain(-25.5, -7.5, cfg);
    tower.pos = [-25.5, tSamp.height - 1.35, -7.5];
  }
  for (const s of ALPINE_SPRUCE_SLOTS) {
    const ent = world.getEntity(s.id);
    if (!ent) continue;
    const samp = sampleMultifractalTerrain(s.x, s.z, cfg);
    const valid = samp.height > 1.8 && samp.height < 26.0 && samp.slope < 0.46;
    ent.visible = valid;
    ent.pos = [s.x, samp.height - 0.85, s.z];
  }
}

function buildWorldEntities(worldId: WorldId): EntityState[] {
  const ents: EntityState[] = [];
  for (let i = 0; i < 6; i++) {
    ents.push({
      id: `water_glow_${i}`,
      assetId: "geo_light_proxy",
      pos: [0, 0.1, 0],
      rot: quatIdentity(),
      scale: 0.01,
      outline: false,
      castShadow: true,
      visible: true,
      tag: "proxy",
    });
  }

  if (worldId === "rotunda") {
    ents.push({
      id: "hero_rotunda",
      assetId: "roman_rotunda",
      pos: [0, -0.4, -2.0],
      rot: quatFromYawPitchRoll(0.32, 0, 0),
      scale: 1.0,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.35,
      tag: "landmark",
    });
    ents.push({
      id: "cave_arch_back",
      assetId: "volcanic_arch",
      pos: [-3.0, -0.8, -19.5],
      rot: quatFromYawPitchRoll(0.22, 0, 0),
      scale: 1.18,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.35,
      tag: "terrain",
    });
    ents.push({
      id: "cave_arch_side",
      assetId: "volcanic_arch",
      pos: [-23.0, -2.5, 4.0],
      rot: quatFromYawPitchRoll(1.38, 0, 0),
      scale: 0.85,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.25,
      tag: "terrain",
    });
    ents.push({
      id: "hero_actor",
      assetId: "bathysphere_hull",
      pos: [...state.bathyPos],
      rot: quatIdentity(),
      scale: 0.88,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.5,
      tag: "hero",
    });
    ents.push({
      id: "bathy_prop",
      assetId: "bathysphere_prop",
      pos: [0, 0, 0],
      rot: quatIdentity(),
      scale: 1.0,
      parentId: "hero_actor",
      parentSocket: "propeller",
      aaPriority: "hero",
      outline: false,
      tag: "hero",
    });
    for (let z = 0; z < EXPLODE_SLICES; z++) {
      ents.push({
        id: `explode_s${z}`,
        assetId: "bathysphere_hull",
        pos: [0, 0, 0],
        rot: quatIdentity(),
        scale: 1.0,
        parentId: "hero_actor",
        aaPriority: "hero",
        outline: false,
        emissiveBoost: 1.45,
        sliceClip: [z / EXPLODE_SLICES, (z + 1) / EXPLODE_SLICES],
        visible: false,
        tag: "explode_slice",
      });
    }
    const CORALS: Array<[string, string, number, number, number, number]> = [
      ["coral_0", "coral_cyan", -11.5, 8.2, 0.6, 1.15],
      ["coral_1", "coral_magenta", 12.2, 6.4, 2.1, 1.08],
      ["coral_2", "coral_cyan", 14.5, -9.8, 3.8, 1.22],
      ["coral_3", "coral_magenta", -14.8, -8.2, 1.2, 1.12],
      ["coral_4", "coral_cyan", -4.2, 12.6, 4.9, 0.92],
    ];
    for (const [id, assetId, cx, cz, yaw, sc] of CORALS) {
      ents.push({
        id, assetId,
        pos: [cx, -0.35, cz],
        rot: quatFromYawPitchRoll(yaw, 0, 0),
        scale: sc,
        aaPriority: "hero",
        outline: false,
        emissiveBoost: 1.45,
        tag: "coral",
      });
    }
  } else if (worldId === "coastal") {
    ents.push({
      id: "coastal_viaduct",
      assetId: "coastal_viaduct",
      pos: [0, -0.5, -1.5],
      rot: quatIdentity(),
      scale: 1.0,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.45,
      tag: "landmark",
    });
    ents.push(
      {
        id: "cliff_west",
        assetId: "cliff_west",
        pos: [-19.0, -0.6, -3.5],
        rot: quatFromYawPitchRoll(0.25, 0, 0),
        scale: 1.0,
        aaPriority: "hero",
        outline: false,
        tag: "terrain",
      },
      {
        id: "cliff_east",
        assetId: "cliff_east",
        pos: [20.5, -0.6, -5.5],
        rot: quatFromYawPitchRoll(-0.42, 0, 0),
        scale: 1.04,
        aaPriority: "hero",
        outline: false,
        tag: "terrain",
      },
    );
    ents.push({
      id: "hero_actor",
      assetId: "coastal_tower",
      pos: [-16.8, 6.8, -4.8],
      rot: quatFromYawPitchRoll(0.38, 0, 0),
      scale: 0.94,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.35,
      tag: "hero",
    });
    for (let z = 0; z < EXPLODE_SLICES; z++) {
      ents.push({
        id: `explode_s${z}`,
        assetId: "coastal_tower",
        pos: [0, 0, 0],
        rot: quatIdentity(),
        scale: 1.0,
        parentId: "hero_actor",
        aaPriority: "hero",
        outline: false,
        emissiveBoost: 1.35,
        sliceClip: [z / EXPLODE_SLICES, (z + 1) / EXPLODE_SLICES],
        visible: false,
        tag: "explode_slice",
      });
    }
    const TREES: Array<[string, string, number, number, number, number, number]> = [
      ["olive_w1", "olive_a", -24.2, 6.9, -0.8, 0.5, 1.08],
      ["olive_e1", "olive_b", 17.5, 7.1, -9.8, 2.2, 1.18],
      ["olive_e2", "olive_a", 24.8, 7.0, -3.5, 4.1, 1.02],
      ["cypress_w1", "cypress_a", -22.5, 6.9, -9.6, 0.3, 1.05],
      ["cypress_w2", "cypress_b", -25.4, 6.7, -7.2, 1.9, 0.94],
      ["cypress_e1", "cypress_a", 15.6, 7.0, -4.2, 0.9, 1.12],
      ["cypress_e2", "cypress_b", 22.8, 7.0, -10.5, 3.1, 1.00],
      ["cypress_e3", "cypress_a", 26.2, 6.8, -7.8, 2.4, 0.88],
    ];
    for (const [id, assetId, tx, ty, tz, yaw, sc] of TREES) {
      ents.push({
        id, assetId,
        pos: [tx, ty, tz],
        rot: quatFromYawPitchRoll(yaw, 0, 0),
        scale: sc,
        aaPriority: "hero",
        outline: false,
        tag: "tree",
      });
    }
    ents.push({
      id: "coastal_skiff",
      assetId: "coastal_skiff",
      pos: [3.2, -0.08, 10.5],
      rot: quatFromYawPitchRoll(-0.48, 0, 0),
      scale: 0.92,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.5,
      tag: "boat",
    });
  } else {
    // WORLD C: ALPINE MULTIFRACTAL GLACIAL VALLEY & CURVED STONE VIADUCT
    ents.push({
      id: "alpine_viaduct",
      assetId: "coastal_viaduct",
      pos: [0, -0.35, 0.0],
      rot: quatIdentity(),
      scale: 1.58,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.45,
      tag: "landmark",
    });
    const cfg = currentTerrainCfg();
    const towerY = sampleMultifractalTerrain(-25.5, -7.5, cfg).height - 1.35;
    ents.push({
      id: "hero_actor",
      assetId: "coastal_tower",
      pos: [-25.5, towerY, -7.5],
      rot: quatFromYawPitchRoll(0.55, 0, 0),
      scale: 0.96,
      aaPriority: "hero",
      outline: false,
      emissiveBoost: 1.35,
      tag: "hero",
    });
    for (let z = 0; z < EXPLODE_SLICES; z++) {
      ents.push({
        id: `explode_s${z}`,
        assetId: "coastal_tower",
        pos: [0, 0, 0],
        rot: quatIdentity(),
        scale: 1.0,
        parentId: "hero_actor",
        aaPriority: "hero",
        outline: false,
        emissiveBoost: 1.35,
        sliceClip: [z / EXPLODE_SLICES, (z + 1) / EXPLODE_SLICES],
        visible: false,
        tag: "explode_slice",
      });
    }
    for (const s of ALPINE_SPRUCE_SLOTS) {
      const samp = sampleMultifractalTerrain(s.x, s.z, cfg);
      ents.push({
        id: s.id,
        assetId: s.assetId,
        pos: [s.x, samp.height - 0.85, s.z],
        rot: quatFromYawPitchRoll(s.yaw, 0, 0),
        scale: s.scale,
        aaPriority: "hero",
        outline: false,
        visible: samp.height > 1.8 && samp.height < 26.0 && samp.slope < 0.46,
        tag: "tree",
      });
    }
  }

  const orbAsset = worldId === "rotunda" ? "orb_cyan" : worldId === "alpine" ? "orb_snow" : "orb_gold";
  for (const p of particleZone.state) {
    ents.push({
      id: p.id,
      assetId: orbAsset,
      pos: [p.x0, p.y, p.z0],
      rot: quatIdentity(),
      scale: 1.0,
      outline: false,
      emissiveBoost: 1.5,
      tag: "particle",
    });
  }
  return ents;
}

function applyLighting(): void {
  if (state.tod === "auto") {
    if (state.worldId === "rotunda") {
      world.doc.lighting.timeOfDay = 0.78;
      world.doc.lighting.sunAzimuthDeg = 32;
      world.doc.lighting.sunElevationDeg = 54;
      world.doc.lighting.fogDensity = 0.24;
    } else if (state.worldId === "coastal") {
      world.doc.lighting.timeOfDay = 0.42;
      world.doc.lighting.sunAzimuthDeg = -34;
      world.doc.lighting.sunElevationDeg = 32;
      world.doc.lighting.fogDensity = 0.15;
    } else {
      // Crisp sunlit alpine morning with dramatic East-Southeast raking cross-light across jagged peaks!
      world.doc.lighting.timeOfDay = 0.20;
      world.doc.lighting.sunAzimuthDeg = 42;
      world.doc.lighting.sunElevationDeg = 28;
      world.doc.lighting.fogDensity = 0.18;
    }
  } else if (state.tod === "day") {
    world.doc.lighting.timeOfDay = 0.08;
    world.doc.lighting.sunAzimuthDeg = 38;
    world.doc.lighting.sunElevationDeg = 46;
    world.doc.lighting.fogDensity = 0.14;
  } else if (state.tod === "golden") {
    world.doc.lighting.timeOfDay = 0.50;
    world.doc.lighting.sunAzimuthDeg = 32;
    world.doc.lighting.sunElevationDeg = 18;
    world.doc.lighting.fogDensity = 0.20;
  } else if (state.tod === "twilight") {
    world.doc.lighting.timeOfDay = 0.74;
    world.doc.lighting.sunAzimuthDeg = 28;
    world.doc.lighting.sunElevationDeg = 34;
    world.doc.lighting.fogDensity = 0.22;
  } else {
    world.doc.lighting.timeOfDay = 0.94;
    world.doc.lighting.sunAzimuthDeg = 24;
    world.doc.lighting.sunElevationDeg = 42;
    world.doc.lighting.fogDensity = 0.26;
  }

  world.doc.lighting.microRelief = state.microRelief;
  world.doc.lighting.styleDial = 0.0;
  world.doc.lighting.outlineWidth = 0.0;
  world.doc.terrain.maxHeight = state.maxHeight;
  world.doc.terrain.scale = state.ridgeWeight;
  world.doc.terrain.terraceSteps = state.erosion;
}

function loadWorld(worldId: WorldId, resetCam = true): void {
  state.worldId = worldId;
  const s = worldSeed(worldId);
  world.doc.seed = s;
  world.doc.terrain.seed = s;
  ensureParamAssets(worldId);
  world.doc.entities = buildWorldEntities(worldId);
  applyLighting();
  if (resetCam) {
    if (worldId === "rotunda") {
      state.orbitYaw = 0.44;
      state.orbitPitch = 0.32;
      state.zoomDist = 50;
      state.camTarget = [-0.5, 9.0, -3.0];
    } else if (worldId === "coastal") {
      state.orbitYaw = 0.22;
      state.orbitPitch = 0.27;
      state.zoomDist = 56;
      state.camTarget = [-1.5, 9.2, -2.5];
    } else {
      // Sweeping open glacial valley vista: viaduct + watchtower framed against snow-capped alpine skyline
      state.orbitYaw = 0.16;
      state.orbitPitch = 0.12;
      state.zoomDist = 76;
      state.camTarget = [-2.5, 20.0, -14.0];
    }
  }
  applySplit();
  syncUi();
}

function applySplit(): void {
  world.doc.splitCompare.enabled = state.splitEnabled;
  world.doc.splitCompare.splitX = state.splitX;
  world.doc.splitCompare.leftMode = "voxel-dda";
  world.doc.splitCompare.rightMode = "smooth-sdf";
  const bar = document.getElementById("splitBar");
  const lbls = document.getElementById("splitLabels");
  if (bar) {
    bar.style.display = state.splitEnabled ? "block" : "none";
    bar.style.left = `${(state.splitX * 100).toFixed(2)}%`;
  }
  if (lbls) lbls.style.display = state.splitEnabled ? "flex" : "none";
}

function stepSimulation(dt: number): void {
  const safeDt = Math.min(dt, 0.05);
  state.simTime += safeDt;
  world.stepClock(safeDt);
  particleZone.step(safeDt);

  const targetExp = state.exploded ? 1 : 0;
  state.explodeT = lerp(state.explodeT, targetExp, 1 - Math.exp(-safeDt * 6.0));
  if (Math.abs(state.explodeT - targetExp) < 0.002) state.explodeT = targetExp;

  const ribbons: RibbonState[] = [];
  const lights: PointLightState[] = [];

  if (state.worldId === "rotunda") {
    const a = 0.62 + (state.simTime - 4.2) * 0.26;
    const bx = Math.sin(a) * 15.2;
    const bz = -1.5 + Math.cos(a) * 14.5;
    const by = 8.4 + Math.sin(a * 2.0) * 1.4;
    const vx = Math.cos(a) * 15.2 * 0.26;
    const vz = -Math.sin(a) * 14.5 * 0.26;
    state.bathyPos = [bx, by, bz];
    state.bathyYaw = Math.atan2(-vx, -vz);
    state.bathyRoll = Math.sin(a) * 0.08;
    state.propAng += safeDt * 14.0;

    const hero = world.getEntity("hero_actor")!;
    hero.pos = [...state.bathyPos];
    hero.rot = quatFromYawPitchRoll(state.bathyYaw, -0.08, state.bathyRoll);
    const showSlices = state.explodeT > 0.015;
    hero.visible = !showSlices;

    const prop = world.getEntity("bathy_prop");
    if (prop) {
      prop.rot = quatFromYawPitchRoll(0, 0, state.propAng);
      prop.visible = !showSlices;
    }

    for (let z = 0; z < EXPLODE_SLICES; z++) {
      const sl = world.getEntity(`explode_s${z}`);
      if (!sl) continue;
      sl.visible = showSlices;
      if (showSlices) sl.pos[1] = (z - (EXPLODE_SLICES - 1) * 0.5) * 0.16 * state.explodeT;
    }

    const spotOrigin = world.getSocketWorldPos("hero_actor", "searchlight") ?? state.bathyPos;
    const toRotunda = vec3Norm([0 - spotOrigin[0], 5.2 - spotOrigin[1], -2.0 - spotOrigin[2]]);
    const sweepYaw = Math.sin(state.simTime * 0.85) * 0.18;
    const cs = Math.cos(sweepYaw), sn = Math.sin(sweepYaw);
    const beamDir: Vec3 = vec3Norm([
      toRotunda[0] * cs - toRotunda[2] * sn,
      clamp(toRotunda[1] - 0.12, -0.75, -0.05),
      toRotunda[0] * sn + toRotunda[2] * cs,
    ]);
    const tGround = beamDir[1] < -0.04 ? clamp((0.1 - spotOrigin[1]) / beamDir[1], 4, 34) : 24;
    const hit = world.raycastEntities(vec3Add(spotOrigin, vec3Scale(beamDir, 1.2)), beamDir, tGround);
    const beamLen = hit && hit.entityId !== "hero_actor" && !hit.entityId.startsWith("orb_") ? hit.distance + 1.2 : tGround;
    state.spotGround = vec3Add(spotOrigin, vec3Scale(beamDir, beamLen));

    const waterSpot = world.getEntity("water_glow_0");
    if (waterSpot) {
      waterSpot.pos = [state.spotGround[0], 0.1, state.spotGround[2]];
      waterSpot.scale = showSlices ? 0.01 : 4.2;
    }
    if (!showSlices) {
      const bPts: RibbonPoint[] = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        bPts.push({ pos: vec3Add(spotOrigin, vec3Scale(beamDir, 0.3 + u * beamLen)), age: 0.04 + u * 0.85, width: 0.45 + u * 5.2 });
      }
      ribbons.push({ id: "bathy_beam", points: bPts, color: [192, 248, 224], alpha: 0.34, emissive: true });
    }

    for (let s = 0; s < 2; s++) {
      const pts: RibbonPoint[] = [];
      const xOff = s === 0 ? 0.0 : 4.8;
      const zOff = s === 0 ? -2.0 : 1.2;
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        pts.push({
          pos: [xOff + (1 - u) * 5.5, 22.0 - u * 21.8, zOff - (1 - u) * 3.5],
          age: 0.08 + u * 0.78,
          width: 2.2 + u * 4.5,
        });
      }
      ribbons.push({ id: `oculus_shaft_${s}`, points: pts, color: [112, 228, 232], alpha: s === 0 ? 0.17 : 0.11, emissive: true });
    }

    const pulse = 0.88 + 0.12 * Math.sin(state.simTime * 2.4);
    lights.push(
      { pos: [0, 7.2, -2.0], radius: 22.0, color: [255, 206, 112], intensity: 1.55 * pulse },
      { pos: [0, 5.2, -2.0], radius: 26.0, color: [62, 238, 232], intensity: 1.15 },
      { pos: spotOrigin, radius: 34.0, color: [215, 252, 228], intensity: 2.25, dir: beamDir, spotCos: 0.84, spotSoft: 0.14 },
      { pos: state.bathyPos, radius: 12.0, color: [255, 198, 96], intensity: 0.85 },
      { pos: [-11.5, 2.8, 8.2], radius: 15.0, color: [52, 240, 234], intensity: 1.15 },
      { pos: [12.2, 2.8, 6.4], radius: 15.0, color: [242, 84, 174], intensity: 1.10 },
      { pos: [14.5, 2.8, -9.8], radius: 16.0, color: [52, 240, 234], intensity: 1.10 },
      { pos: [-14.8, 2.8, -8.2], radius: 16.0, color: [242, 84, 174], intensity: 1.05 },
      { pos: [1.5, 1.5, -1.5], radius: 18.0, color: [88, 222, 236], intensity: 0.80 },
    );

    const coralGlows: Array<[number, number, number]> = [
      [-11.5, 8.2, 3.6], [12.2, 6.4, 3.4], [14.5, -9.8, 3.8], [-14.8, -8.2, 3.6], [-4.2, 12.6, 2.8],
    ];
    coralGlows.forEach(([gx, gz, rad], idx) => {
      const wg = world.getEntity(`water_glow_${idx + 1}`);
      if (wg) { wg.pos = [gx, 0.1, gz]; wg.scale = rad; }
    });
  } else if (state.worldId === "coastal") {
    const hero = world.getEntity("hero_actor")!;
    const showSlices = state.explodeT > 0.015;
    hero.visible = !showSlices;
    for (let z = 0; z < EXPLODE_SLICES; z++) {
      const sl = world.getEntity(`explode_s${z}`);
      if (!sl) continue;
      sl.visible = showSlices;
      if (showSlices) sl.pos[1] = (z - (EXPLODE_SLICES - 1) * 0.5) * 0.24 * state.explodeT;
    }

    const skiff = world.getEntity("coastal_skiff");
    if (skiff) {
      skiff.pos[1] = -0.08 + Math.sin(state.simTime * 1.8) * 0.14;
      skiff.rot = quatFromYawPitchRoll(-0.48 + Math.sin(state.simTime * 0.5) * 0.04, Math.sin(state.simTime * 1.4) * 0.03, Math.cos(state.simTime * 1.6) * 0.04);
    }

    const chimPos = world.getSocketWorldPos("hero_actor", "chimney");
    if (chimPos && !showSlices) {
      const pts: RibbonPoint[] = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        pts.push({
          pos: [chimPos[0] + u * 2.2 + Math.sin(state.simTime + u * 3) * 0.5 * u, chimPos[1] + u * 5.8, chimPos[2] + u * 0.6],
          age: 0.12 + u * 0.85,
          width: 0.4 + u * 1.5,
        });
      }
      ribbons.push({ id: "cottage_smoke", points: pts, color: [232, 224, 214], alpha: 0.28, emissive: false });
    }

    const lampW = clamp(0.55 + world.doc.lighting.timeOfDay * 1.2, 0.55, 1.75);
    const lPos: Array<[number, number, number]> = [
      [-4.8, 12.2, 0.2], [-4.8, 12.2, -3.5], [4.8, 12.2, 0.2], [4.8, 12.2, -3.5],
      [-14.5, 14.5, -1.5], [5.8, 2.2, 9.6],
    ];
    lPos.forEach(([lx, ly, lz], i) => {
      lights.push({ pos: [lx, ly, lz], radius: 16.0, color: [255, 198, 102], intensity: (i < 4 ? 1.15 : 0.95) * lampW });
      const wg = world.getEntity(`water_glow_${i}`);
      if (wg) { wg.pos = [lx, 0.1, lz]; wg.scale = 3.2; }
    });
  } else {
    // WORLD C: ALPINE MULTIFRACTAL GLACIAL VALLEY
    const hero = world.getEntity("hero_actor")!;
    const showSlices = state.explodeT > 0.015;
    hero.visible = !showSlices;
    for (let z = 0; z < EXPLODE_SLICES; z++) {
      const sl = world.getEntity(`explode_s${z}`);
      if (!sl) continue;
      sl.visible = showSlices;
      if (showSlices) sl.pos[1] = (z - (EXPLODE_SLICES - 1) * 0.5) * 0.24 * state.explodeT;
    }

    const chimPos = world.getSocketWorldPos("hero_actor", "chimney");
    if (chimPos && !showSlices) {
      const pts: RibbonPoint[] = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        pts.push({
          pos: [chimPos[0] + u * 2.6 + Math.sin(state.simTime + u * 3) * 0.5 * u, chimPos[1] + u * 6.8, chimPos[2] - u * 1.2],
          age: 0.12 + u * 0.85,
          width: 0.45 + u * 1.65,
        });
      }
      ribbons.push({ id: "alpine_smoke", points: pts, color: [236, 232, 226], alpha: 0.30, emissive: false });
    }

    const lampW = clamp(0.45 + world.doc.lighting.timeOfDay * 1.25, 0.45, 1.85);
    const lPos: Array<[number, number, number]> = [
      [-7.6, 18.2, 2.2], [-7.6, 18.2, -3.5], [7.6, 18.2, 2.2], [7.6, 18.2, -3.5],
      [-23.5, hero.pos[1] + 9.0, -5.5], [0.0, 14.5, 0.0],
    ];
    lPos.forEach(([lx, ly, lz], i) => {
      lights.push({ pos: [lx, ly, lz], radius: 22.0, color: [255, 200, 108], intensity: (i < 4 ? 1.15 : 0.90) * lampW });
      const wg = world.getEntity(`water_glow_${i}`);
      if (wg) { wg.pos = [lx, 0.1, lz]; wg.scale = 4.0; }
    });
  }

  const maxOrbs = state.worldId === "rotunda" ? 36 : state.worldId === "alpine" ? 18 : (world.doc.lighting.timeOfDay > 0.6 ? 26 : 14);
  const showOrbs = state.worldId === "rotunda" || state.worldId === "alpine" || world.doc.lighting.timeOfDay > 0.38;
  for (let i = 0; i < particleZone.state.length; i++) {
    const p = particleZone.state[i];
    const ent = world.getEntity(p.id);
    if (!ent) continue;
    const active = showOrbs && i < maxOrbs;
    ent.visible = active;
    if (!active) continue;
    ent.pos[0] = p.x0 + Math.sin(state.simTime * 0.9 + p.phase) * p.amp;
    ent.pos[1] = state.worldId === "alpine" ? 26.0 - ((p.y * 0.85) % 24.0) : p.y;
    ent.pos[2] = p.z0 + Math.cos(state.simTime * 0.75 + p.phase) * p.amp;
  }

  world.doc.lighting.pointLights = lights;
  world.doc.ribbons = ribbons;
  updateCamera(safeDt);
}

function updateCamera(dt: number, snap = false): void {
  const cam = world.doc.camera;
  let wantTarget: Vec3 = [...state.camTarget];
  let dist = clamp(state.zoomDist, 16, 130);
  let elev = clamp(state.orbitPitch, 0.08, 1.12);
  let yaw = state.orbitYaw;

  if (state.explodeT > 0.25) {
    const hero = world.getEntity("hero_actor");
    if (hero) {
      wantTarget = [hero.pos[0], hero.pos[1] + (state.worldId === "rotunda" ? 0.5 : 8.5), hero.pos[2]];
      dist = state.worldId === "rotunda" ? 18.5 : 32.0;
      elev = 0.28;
      yaw = state.orbitYaw + 0.25;
    }
  }

  const wantPos: Vec3 = [
    wantTarget[0] + Math.sin(yaw) * Math.cos(elev) * dist,
    Math.max(2.5, wantTarget[1] + Math.sin(elev) * dist),
    wantTarget[2] + Math.cos(yaw) * Math.cos(elev) * dist,
  ];
  const k = snap ? 1 : 1 - Math.exp(-dt * 5.2);
  for (let i = 0; i < 3; i++) {
    state.camPosSmooth[i] = lerp(state.camPosSmooth[i], wantPos[i], k);
    state.camTargetSmooth[i] = lerp(state.camTargetSmooth[i], wantTarget[i], k);
  }
  cam.pos = [...state.camPosSmooth];
  cam.target = [...state.camTargetSmooth];
  cam.up = [0, 1, 0];
}

// ---------------------------------------------------------------------------
// 2. Lightweight 2D Horizontal Sprite-Stack PNG Exporter
// ---------------------------------------------------------------------------
function exportHeroSpriteStackPng(): { width: number; height: number; slices: number; assetId: string } | null {
  const heroId = state.worldId === "rotunda" ? "bathysphere_hull" : "coastal_tower";
  const asset = world.getAsset(heroId);
  if (!asset) return null;
  const strip = packHorizontalSliceStrip(asset);
  const c2 = document.createElement("canvas");
  c2.width = strip.width;
  c2.height = strip.height;
  const ctx = c2.getContext("2d")!;
  const imgData = new ImageData(new Uint8ClampedArray(strip.rgba), strip.width, strip.height);
  ctx.putImageData(imgData, 0, 0);
  const a = document.createElement("a");
  a.href = c2.toDataURL("image/png");
  a.download = `${heroId}_slices_${asset.w}x${asset.l}x${asset.h}.png`;
  a.click();
  return { width: strip.width, height: strip.height, slices: asset.h, assetId: heroId };
}

// ---------------------------------------------------------------------------
// 3. UI Controls, HUD & Deterministic Verification API
// ---------------------------------------------------------------------------
function syncUi(): void {
  const setP = (id: string, v: boolean) => { const el = document.getElementById(id); if (el) el.setAttribute("aria-pressed", v ? "true" : "false"); };
  setP("btnWorld_rotunda", state.worldId === "rotunda");
  setP("btnWorld_coastal", state.worldId === "coastal");
  setP("btnWorld_alpine", state.worldId === "alpine");
  setP("btnSplit", state.splitEnabled);
  setP("btnExploded", state.exploded);
  setP("btnTod_auto", state.tod === "auto");
  setP("btnTod_day", state.tod === "day");
  setP("btnTod_golden", state.tod === "golden");
  setP("btnTod_night", state.tod === "night");
  setP("btnQual_eco", state.quality === "eco");
  setP("btnQual_balanced", state.quality === "balanced");
  setP("btnQual_ultra", state.quality === "ultra");

  const rel = document.getElementById("rngRelief") as HTMLInputElement | null;
  if (rel) rel.value = String(Math.round(state.microRelief * 100));
  const relVal = document.getElementById("valRelief");
  if (relVal) relVal.textContent = `${Math.round(state.microRelief * 100)}%`;

  const drp = document.getElementById("rngDrape") as HTMLInputElement | null;
  if (drp) drp.value = String(Math.round(state.drape * 100));
  const drpVal = document.getElementById("valDrape");
  if (drpVal) drpVal.textContent = `${Math.round(state.drape * 100)}%`;

  const ts = document.getElementById("terrainSliders");
  if (ts) ts.style.display = state.worldId === "alpine" ? "flex" : "none";
  const rdg = document.getElementById("rngRidge") as HTMLInputElement | null;
  if (rdg) rdg.value = String(Math.round(state.ridgeWeight * 100));
  const rdgVal = document.getElementById("valRidge");
  if (rdgVal) rdgVal.textContent = state.ridgeWeight.toFixed(1);
  const ero = document.getElementById("rngErosion") as HTMLInputElement | null;
  if (ero) ero.value = String(Math.round(state.erosion * 100));
  const eroVal = document.getElementById("valErosion");
  if (eroVal) eroVal.textContent = state.erosion.toFixed(1);
}

function updateStatsHud(): void {
  const el = document.getElementById("stats");
  if (!el) return;
  const s = renderer.getStats();
  const wTitle = state.worldId === "rotunda"
    ? "SUNKEN ROMAN ROTUNDA & SEA CAVE"
    : state.worldId === "coastal"
      ? "MEDITERRANEAN ARCH & COASTAL TOWER"
      : "ALPINE MULTIFRACTAL VALLEY & VIADUCT";
  const lightCount = world.doc.lighting.pointLights?.length ?? 0;
  const modeLbl = state.exploded
    ? `EXPLODED ${EXPLODE_SLICES}-SLICE (1 DRAW)`
    : `WRAPPED-UV R16F SDF (${lightCount} 3D LIGHTS)`;
  el.textContent =
    `WORLD   ${wTitle}\n` +
    `MODE    ${modeLbl}\n` +
    `ENGINE  ${s.fps.toFixed(0).padStart(2, " ")} FPS  |  ${s.drawCalls} draws (${s.visibleEntities}/${s.totalEntities} ents)  |  ${s.activeSamples}x RGSS`;
}

document.getElementById("btnWorld_rotunda")?.addEventListener("click", () => { state.exploded = false; state.tod = "auto"; loadWorld("rotunda", true); });
document.getElementById("btnWorld_coastal")?.addEventListener("click", () => { state.exploded = false; state.tod = "auto"; loadWorld("coastal", true); });
document.getElementById("btnWorld_alpine")?.addEventListener("click", () => { state.exploded = false; state.tod = "auto"; loadWorld("alpine", true); });
document.getElementById("btnSplit")?.addEventListener("click", () => { state.splitEnabled = !state.splitEnabled; applySplit(); syncUi(); });
document.getElementById("btnExploded")?.addEventListener("click", () => { state.exploded = !state.exploded; syncUi(); });
document.getElementById("btnExportSlices")?.addEventListener("click", () => { exportHeroSpriteStackPng(); });
for (const t of ["auto", "day", "golden", "night"] as TodMode[]) {
  document.getElementById(`btnTod_${t}`)?.addEventListener("click", () => { state.tod = t; applyLighting(); syncUi(); });
}
for (const q of ["eco", "balanced", "ultra"] as AAQuality[]) {
  document.getElementById(`btnQual_${q}`)?.addEventListener("click", () => { state.quality = q; renderer.setQuality(q, world); syncUi(); });
}
document.getElementById("rngRelief")?.addEventListener("input", (e) => {
  state.microRelief = Number((e.target as HTMLInputElement).value) / 100;
  applyLighting();
  syncUi();
});
document.getElementById("rngDrape")?.addEventListener("change", (e) => {
  state.drape = Number((e.target as HTMLInputElement).value) / 100;
  ensureParamAssets(state.worldId);
  syncUi();
});
document.getElementById("rngRidge")?.addEventListener("input", (e) => {
  state.ridgeWeight = Number((e.target as HTMLInputElement).value) / 100;
  applyLighting();
  snapAlpineTerrainEntities();
  syncUi();
});
document.getElementById("rngErosion")?.addEventListener("input", (e) => {
  state.erosion = Number((e.target as HTMLInputElement).value) / 100;
  applyLighting();
  snapAlpineTerrainEntities();
  syncUi();
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === "KeyE") { state.splitEnabled = !state.splitEnabled; applySplit(); syncUi(); }
  else if (e.code === "KeyX") { state.exploded = !state.exploded; syncUi(); }
  else if (e.code === "KeyW") {
    state.exploded = false;
    state.tod = "auto";
    const nextW: WorldId = state.worldId === "rotunda" ? "coastal" : state.worldId === "coastal" ? "alpine" : "rotunda";
    loadWorld(nextW, true);
  }
  else if (e.code === "KeyH") { document.body.classList.toggle("nohud"); }
});

let dragOrbit = false, dragSplit = false, lastX = 0, lastY = 0;
const splitBar = document.getElementById("splitBar");
splitBar?.addEventListener("pointerdown", (e) => { dragSplit = true; e.stopPropagation(); splitBar.setPointerCapture(e.pointerId); });
window.addEventListener("pointermove", (e) => {
  if (dragSplit) { state.splitX = clamp(e.clientX / Math.max(1, window.innerWidth), 0.06, 0.94); applySplit(); return; }
  if (!dragOrbit) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  state.orbitYaw -= dx * 0.0065;
  state.orbitPitch = clamp(state.orbitPitch + dy * 0.0055, 0.08, 1.12);
});
window.addEventListener("pointerup", () => { dragOrbit = false; dragSplit = false; });
canvas.addEventListener("pointerdown", (e) => { dragOrbit = true; lastX = e.clientX; lastY = e.clientY; });
canvas.addEventListener("wheel", (e) => { e.preventDefault(); state.zoomDist = clamp(state.zoomDist + e.deltaY * 0.05, 16, 130); }, { passive: false });

loadWorld(state.worldId, true);
stepSimulation(0.016);
updateCamera(1.0, true);
renderer.render(world);
syncUi();
updateStatsHud();
document.body.classList.add("ready");

declare global {
  interface Window {
    geoDemo?: {
      world: SceneWorld;
      renderer: AASpriteRenderer;
      set: (opts: Partial<{
        worldId: WorldId;
        tod: TodMode;
        microRelief: number;
        weathering: number;
        drape: number;
        ridgeWeight: number;
        erosion: number;
        splitEnabled: boolean;
        splitX: number;
        exploded: boolean;
        orbitYaw: number;
        orbitPitch: number;
        zoomDist: number;
        camTarget: Vec3;
        simTime: number;
        noHud: boolean;
      }>) => void;
      step: (dt: number) => void;
      getStats: () => ReturnType<AASpriteRenderer["getStats"]>;
      getSliceStripMeta: () => { width: number; height: number; slices: number; assetId: string } | null;
    };
  }
}

window.geoDemo = {
  world,
  renderer,
  set(opts) {
    const worldChanged = opts.worldId !== undefined && opts.worldId !== state.worldId;
    if (opts.weathering !== undefined) state.weathering = opts.weathering;
    if (opts.drape !== undefined) state.drape = opts.drape;
    if (opts.ridgeWeight !== undefined) state.ridgeWeight = clamp(opts.ridgeWeight, 0.2, 1.5);
    if (opts.erosion !== undefined) state.erosion = clamp(opts.erosion, 0.0, 1.5);
    if (worldChanged && opts.worldId) {
      state.tod = opts.tod ?? "auto";
      loadWorld(opts.worldId, true);
    } else if (opts.weathering !== undefined || opts.drape !== undefined) {
      ensureParamAssets(state.worldId);
    }
    if (opts.tod !== undefined) state.tod = opts.tod;
    if (opts.microRelief !== undefined) state.microRelief = clamp(opts.microRelief, 0, 1);
    if (opts.splitEnabled !== undefined) state.splitEnabled = opts.splitEnabled;
    if (opts.splitX !== undefined) state.splitX = opts.splitX;
    if (opts.exploded !== undefined) {
      state.exploded = opts.exploded;
      state.explodeT = opts.exploded ? 1 : 0;
    }
    if (opts.orbitYaw !== undefined) state.orbitYaw = opts.orbitYaw;
    if (opts.orbitPitch !== undefined) state.orbitPitch = opts.orbitPitch;
    if (opts.zoomDist !== undefined) state.zoomDist = opts.zoomDist;
    if (opts.camTarget !== undefined) state.camTarget = [...opts.camTarget];
    if (opts.simTime !== undefined) state.simTime = opts.simTime;
    if (opts.noHud !== undefined) document.body.classList.toggle("nohud", opts.noHud);
    applyLighting();
    snapAlpineTerrainEntities();
    applySplit();
    stepSimulation(0.016);
    updateCamera(1.0, true);
    renderer.render(world);
    syncUi();
    updateStatsHud();
  },
  step(dt) { stepSimulation(dt); renderer.render(world); updateStatsHud(); },
  getStats: () => renderer.getStats(),
  getSliceStripMeta() {
    const heroId = state.worldId === "rotunda" ? "bathysphere_hull" : "coastal_tower";
    const asset = world.getAsset(heroId);
    if (!asset) return null;
    const strip = packHorizontalSliceStrip(asset);
    return { width: strip.width, height: strip.height, slices: asset.h, assetId: heroId };
  },
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
