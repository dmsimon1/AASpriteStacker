/**
 * Strict Draft 2020-12 JSON Schemas and vendor-neutral LLM tool definitions
 * (MCP / Gemini / Anthropic / OpenAI). Re-exports runtime validators from ./validators.js.
 */

import {
  VALID_AA_MODES,
  VALID_BLUEPRINT_OPS,
  VALID_CAMERA_MODES,
  VALID_DEBUG_OVERLAYS,
  VALID_RENDER_STYLES,
  VALID_SHADE_STYLES,
} from "./validators.js";
export * from "./validators.js";

const VEC3_SCHEMA = {
  type: "array",
  items: { type: "number" },
  minItems: 3,
  maxItems: 3,
} as const;

const RGB_SCHEMA = {
  type: "array",
  items: { type: "number", minimum: 0, maximum: 255 },
  minItems: 3,
  maxItems: 3,
} as const;

const QUAT_SCHEMA = {
  type: "array",
  items: { type: "number" },
  minItems: 4,
  maxItems: 4,
} as const;

export const BLUEPRINT_SPEC_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "BlueprintSpec",
  type: "object",
  required: ["id", "size", "ops"],
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1 },
    name: { type: "string" },
    size: {
      type: "array",
      items: { type: "integer", minimum: 1, maximum: 256 },
      minItems: 3,
      maxItems: 3,
      description: "[W (right +X), L (nose +Y), H (up +Z)] voxel dimensions",
    },
    voxelScale: { type: "number", exclusiveMinimum: 0 },
    pivot: VEC3_SCHEMA,
    smoothSdf: { type: "number", minimum: 0, maximum: 1 },
    ops: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["op"],
        properties: {
          op: { type: "string", enum: [...VALID_BLUEPRINT_OPS] },
          min: VEC3_SCHEMA,
          max: VEC3_SCHEMA,
          center: VEC3_SCHEMA,
          radius: { type: "number", exclusiveMinimum: 0 },
          radii: VEC3_SCHEMA,
          a: VEC3_SCHEMA,
          b: VEC3_SCHEMA,
          rA: { type: "number", exclusiveMinimum: 0 },
          rB: { type: "number", exclusiveMinimum: 0 },
          taperAxis: { type: "string", enum: ["+x", "-x", "+y", "-y", "+z", "-z"] },
          shrinkAxis: { type: "string", enum: ["x", "y", "z"] },
          minScale: { type: "number", minimum: 0, maximum: 1 },
          majorRadius: { type: "number", exclusiveMinimum: 0 },
          minorRadius: { type: "number", exclusiveMinimum: 0 },
          axis: { type: "string", enum: ["x", "y", "z"] },
          color: RGB_SCHEMA,
          emissive: { type: "boolean" },
          subtract: { type: "boolean" },
          mirrorX: { type: "boolean" },
        },
      },
    },
    sockets: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["pos"],
        properties: {
          pos: VEC3_SCHEMA,
          dir: VEC3_SCHEMA,
        },
      },
    },
  },
} as const;

export const SCENE_PATCH_OPS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ScenePatchOpList",
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    required: ["op"],
    properties: {
      op: { type: "string", enum: ["set", "spawn", "remove", "updateEntity"] },
      path: { type: "string" },
      value: {},
      entityId: { type: "string" },
      entity: {
        type: "object",
        required: ["id", "assetId", "pos", "rot", "scale"],
        properties: {
          id: { type: "string", minLength: 1 },
          assetId: { type: "string", minLength: 1 },
          pos: VEC3_SCHEMA,
          rot: QUAT_SCHEMA,
          scale: { type: "number", exclusiveMinimum: 0 },
          parentId: { type: "string" },
          parentSocket: { type: "string" },
          aaMode: { type: "string", enum: [...VALID_AA_MODES] },
          outline: { type: "boolean" },
          castShadow: { type: "boolean" },
          emissiveBoost: { type: "number", minimum: 0, maximum: 5 },
          tag: { type: "string" },
          visible: { type: "boolean" },
        },
      },
      patch: { type: "object" },
    },
  },
} as const;

export const SCENE_DOCUMENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "SceneDocument",
  type: "object",
  properties: {
    version: { const: 1 },
    seed: { type: "number" },
    time: { type: "number" },
    tick: { type: "integer", minimum: 0 },
    style: { type: "string", enum: [...VALID_RENDER_STYLES] },
    aaMode: { type: "string", enum: [...VALID_AA_MODES] },
    samples: { type: "integer", enum: [1, 4, 8] },
    debugOverlay: { type: "string", enum: [...VALID_DEBUG_OVERLAYS] },
    camera: {
      type: "object",
      properties: {
        mode: { type: "string", enum: [...VALID_CAMERA_MODES] },
        pos: VEC3_SCHEMA,
        target: VEC3_SCHEMA,
        up: VEC3_SCHEMA,
        fovDeg: { type: "number", minimum: 10, maximum: 140 },
        orthoSize: { type: "number", exclusiveMinimum: 0 },
        near: { type: "number", exclusiveMinimum: 0 },
        far: { type: "number", exclusiveMinimum: 0 },
      },
    },
    lighting: {
      type: "object",
      properties: {
        sunAzimuthDeg: { type: "number" },
        sunElevationDeg: { type: "number", minimum: 1, maximum: 89 },
        timeOfDay: { type: "number", minimum: 0, maximum: 1 },
        fogDensity: { type: "number", minimum: 0, maximum: 2 },
        shadeStyle: { type: "string", enum: [...VALID_SHADE_STYLES] },
        outlineWidth: { type: "number", minimum: 0, maximum: 6 },
        selfShadow: { type: "boolean" },
      },
    },
    terrain: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        seed: { type: "number" },
        maxHeight: { type: "number", minimum: 0 },
        scale: { type: "number", exclusiveMinimum: 0 },
        waveTime: { type: "number" },
        terraceSteps: { type: "number", minimum: 0 },
      },
    },
    entities: { type: "array", items: { type: "object" } },
    ribbons: { type: "array", items: { type: "object" } },
  },
} as const;

export interface VendorNeutralToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Single source of truth for live engine tools shared across MCP, Gemini, Anthropic, OpenAI, and BYOK UIs.
 */
export const ENGINE_TOOL_DEFINITIONS: VendorNeutralToolDef[] = [
  {
    name: "aastack_live_state",
    description:
      "Inspect the connected browser tab's live SceneIR state: active RenderStyle, camera, lighting, entity roster, registered assets, undo/redo depth, and WebGL2 telemetry.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Target browser sessionId (defaults to most recently active tab)." },
        includeEntities: { type: "boolean", description: "Include full entity transform list (default true)." },
      },
    },
  },
  {
    name: "aastack_live_patch",
    description:
      "Apply atomic surgical ScenePatchOp[] edits (set, spawn, remove, updateEntity) to the live WebGL2 scene with schema validation, automatic pre-patch undo snapshot, and geometric linting.",
    inputSchema: {
      type: "object",
      required: ["ops"],
      properties: {
        sessionId: { type: "string" },
        ops: SCENE_PATCH_OPS_SCHEMA,
        label: { type: "string", description: "Short human-readable toast label for the browser Agent Live pill." },
      },
    },
  },
  {
    name: "aastack_live_undo",
    description: "Undo the most recent patch on the live browser SceneWorld.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
    },
  },
  {
    name: "aastack_live_redo",
    description: "Redo the last undone patch on the live browser SceneWorld.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
    },
  },
  {
    name: "aastack_live_hot_swap_blueprint",
    description:
      "Validate, lint (floating voxel & socket checks), compile, and hot-swap a declarative BlueprintSpec JSON live into the running WebGL2 browser canvas with zero reload.",
    inputSchema: {
      type: "object",
      required: ["spec"],
      properties: {
        sessionId: { type: "string" },
        spec: BLUEPRINT_SPEC_SCHEMA,
        spawnEntity: {
          type: "object",
          description: "Optional entity to spawn or update immediately using this blueprint's id.",
          properties: {
            id: { type: "string" },
            pos: VEC3_SCHEMA,
            scale: { type: "number" },
            outline: { type: "boolean" },
            castShadow: { type: "boolean" },
            tag: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "aastack_live_query",
    description:
      "Run exact 1:1 CPU/GPU spatial queries against the live scene: sampleTerrainHeight(x,z), raycastEntities(ro,rd), or getSocketWorldPos(entityId,socket).",
    inputSchema: {
      type: "object",
      required: ["kind"],
      properties: {
        sessionId: { type: "string" },
        kind: { type: "string", enum: ["terrainHeight", "raycast", "socket"] },
        x: { type: "number" },
        z: { type: "number" },
        ro: VEC3_SCHEMA,
        rd: VEC3_SCHEMA,
        maxDist: { type: "number" },
        entityId: { type: "string" },
        socket: { type: "string" },
      },
    },
  },
  {
    name: "aastack_live_snapshot",
    description: "Capture a deterministic SceneIR JSON snapshot from the live browser tab for time-travel comparison.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
    },
  },
  {
    name: "aastack_live_restore",
    description: "Restore a previously captured deterministic SceneIR snapshot in the live browser tab.",
    inputSchema: {
      type: "object",
      required: ["snapshot"],
      properties: {
        sessionId: { type: "string" },
        snapshot: { type: "string", description: "JSON string previously returned by aastack_live_snapshot." },
      },
    },
  },
  {
    name: "aastack_live_capture",
    description:
      "Render and return a single PNG screenshot + WebGL2 telemetry from the live browser tab (capped <= 1024px) with optional temporary camera, RenderStyle, or debugOverlay override.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        maxSize: { type: "integer", minimum: 128, maximum: 1024, description: "Max width/height in pixels (default 768)." },
        style: { type: "string", enum: [...VALID_RENDER_STYLES] },
        cameraMode: { type: "string", enum: [...VALID_CAMERA_MODES] },
        debugOverlay: { type: "string", enum: [...VALID_DEBUG_OVERLAYS] },
        camera: {
          type: "object",
          properties: { pos: VEC3_SCHEMA, target: VEC3_SCHEMA, up: VEC3_SCHEMA, fovDeg: { type: "number" } },
        },
        savePath: { type: "string", description: "Optional workspace-relative PNG path to also save on disk (MCP server only)." },
      },
    },
  },
  {
    name: "aastack_live_capture_views",
    description:
      "Render a single 2x2 labeled PNG contact sheet (<= 1024x1024) for rapid multi-angle visual self-critique: preset 'turntable' (0/45/90/180 deg around an entity) or 'scene' (Chase/Overhead/Cockpit/Normals). Automatically restores prior camera & state.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        preset: { type: "string", enum: ["turntable", "scene"], description: "Default 'scene'." },
        entityId: { type: "string", description: "Target entity for 'turntable' preset (defaults to player/first entity)." },
        distance: { type: "number", description: "Orbit distance for 'turntable' preset (auto-sized from asset if omitted)." },
        style: { type: "string", enum: [...VALID_RENDER_STYLES] },
        maxSize: { type: "integer", minimum: 256, maximum: 1024, description: "Contact sheet max size (default 960)." },
        savePath: { type: "string", description: "Optional workspace-relative PNG path to also save on disk (MCP server only)." },
      },
    },
  },
];

/** Convert vendor-neutral definitions to OpenAI tool-calling schema. */
export function toOpenAITools(defs = ENGINE_TOOL_DEFINITIONS) {
  return defs.map((d) => ({
    type: "function" as const,
    function: { name: d.name, description: d.description, parameters: d.inputSchema },
  }));
}

/** Convert vendor-neutral definitions to Anthropic Claude tool_use schema. */
export function toAnthropicTools(defs = ENGINE_TOOL_DEFINITIONS) {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.inputSchema,
  }));
}

/** Convert vendor-neutral definitions to Gemini functionDeclarations schema. */
export function toGeminiFunctionDeclarations(defs = ENGINE_TOOL_DEFINITIONS) {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    parameters: d.inputSchema,
  }));
}
