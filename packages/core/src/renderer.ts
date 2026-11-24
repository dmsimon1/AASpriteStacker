/**
 * Mobile-first, WebGL2 6-DOF & 2.5D Anti-Aliased Sprite-Stacking Renderer.
 * Built behind a clean RenderBackend contract (WebGPU drop-in ready) with:
 *  - Adaptive DPR & Dynamic Resolution Scaling (DRS) governor for locked 60fps on mobile
 *  - Distance-adaptive RGSS LOD (8x hero -> 4x mid -> 1x distant)
 *  - Tight 12-triangle OBB proxies with back-face rendering (camera can fly INSIDE clouds!)
 *  - True gl_FragDepth occlusion across terrain, clouds, actors, and 3D contrail ribbons
 *  - Object-ID-aware 4-pass 2D JFA SDF outlines + emissive bloom + live A/B split compare
 *  - Built-in introspection: getStats() & captureDataUrl()
 */

import { computeCameraViewProj } from "./camera.js";
import {
  extractFrustumPlanes,
  mat4Invert,
  mat4Mul,
  sphereInFrustum,
  vec3Cross,
  vec3Norm,
  vec3Sub,
} from "./math.js";
import type { SceneWorld } from "./scene.js";
import { float32ToFloat16Array } from "./volume.js";
import {
  COMPOSITE_FS,
  ENTITY_OBB_FS,
  ENTITY_OBB_VS,
  FULLSCREEN_VS,
  JFA_INIT_FS,
  JFA_STEP_FS,
  OVERDRAW_HEAT_FS,
  RIBBON_FS,
  RIBBON_VS,
  STUDIO_BG_FS,
} from "./shaders.js";
import type {
  AAMode,
  AAQuality,
  BackgroundMode,
  EngineTelemetry,
  OverdrawReport,
  QualityTier,
  RGB,
  RenderStyle,
  VolumeAsset,
} from "./types.js";

export type InstanceBatchingMode = "auto" | "aggressive" | "off";

export interface RendererOptions {
  quality?: QualityTier;
  /** Canvas background mode ("terrain" | "studio" | "solid" | "transparent"). Use "transparent" to overlay existing 2D games. */
  background?: BackgroundMode;
  /** Solid background RGB [0..255] used when background === "solid". */
  backgroundColor?: RGB;
  /**
   * Optional procedural terrain fragment shader (import `{ TERRAIN_FS } from "@aastack/core/terrain"`).
   * Keeping terrain opt-in lets 2D/isometric/studio apps tree-shake the ocean & island raymarcher out of their bundle.
   */
  terrainShader?: string;
  /**
   * WebGL2 hardware instancing strategy for entities sharing the same VolumeAsset:
   *  - `"auto"` (default): batches contiguous same-asset runs while preserving strict back-to-front painter's order.
   *  - `"aggressive"`: groups all visible instances by asset ID (1 draw call per unique asset), sorted back-to-front per asset.
   *  - `"off"`: 1 entity per draw call (useful for A/B profiling).
   */
  instanceBatching?: InstanceBatchingMode;
  adaptiveDpr?: boolean;
  maxDpr?: number;
  preserveDrawingBuffer?: boolean;
  /** WebGL2 GPU power hint (defaults to "default" so laptops stay cool; use "low-power" for embedded widgets). */
  powerPreference?: "default" | "low-power" | "high-performance";
}

interface CompiledProg {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface GpuAssetTex {
  hash: string;
  albedo: WebGLTexture;
  sdf: WebGLTexture | null;
  sdfIsFloat: boolean;
  norm: WebGLTexture;
  emis: WebGLTexture;
}

interface VisibleSlot {
  ent: SceneWorld["doc"]["entities"][number];
  asset: VolumeAsset;
  dist: number;
  sortKey: number;
  idx: number;
}

function aaModeToInt(m: AAMode): number {
  if (m === "legacy") return 0;
  if (m === "smooth-sdf") return 2;
  if (m === "bandlimited") return 3;
  return 1; // voxel-dda
}

function styleToInt(s: RenderStyle): number {
  if (s === "hd-2d") return 1;
  if (s === "smooth-toy") return 2;
  if (s === "retro-raw") return 3;
  return 0; // arcade-8bit
}

function defaultAAModeForStyle(s: RenderStyle, fallback: AAMode): AAMode {
  if (s === "retro-raw") return "legacy";
  if (s === "smooth-toy") return "smooth-sdf";
  return fallback;
}

function shadeStyleToInt(s: string): number {
  if (s === "pbr-lite") return 1;
  if (s === "unlit") return 2;
  return 0;
}

function debugOverlayToInt(d: string): number {
  if (d === "normals") return 1;
  if (d === "depth") return 2;
  if (d === "object-id") return 3;
  return 0;
}

const UNIT_CUBE_VERTS = new Float32Array([
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
]);
const UNIT_CUBE_INDICES = new Uint16Array([
  0, 2, 1, 0, 3, 2, // -Z
  4, 5, 6, 4, 6, 7, // +Z
  0, 4, 7, 0, 7, 3, // -X
  1, 2, 6, 1, 6, 5, // +X
  0, 1, 5, 0, 5, 4, // -Y
  3, 7, 6, 3, 6, 2, // +Y
]);

// 55 float32 values = 220 bytes per instanced entity OBB:
// 16 voxToClip + 16 clipToVox + 9 normMat + 4 sunAndScale + 4 meta + 4 flags + 2 sliceClip
const INSTANCE_FLOATS = 55;
const INSTANCE_STRIDE = INSTANCE_FLOATS * 4;

export class AASpriteRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly isMobile: boolean;
  private gl: WebGL2RenderingContext | null = null;
  private ready = false;
  private quality: QualityTier;
  private aaQuality: AAQuality;
  private background: BackgroundMode;
  private backgroundColor: RGB;
  private terrainShaderSrc: string | null;
  private instanceBatching: InstanceBatchingMode;
  private jfaScale = 0.5;
  private adaptiveDpr: boolean;
  private maxDpr: number;
  private drsScale = 1.0;

  private progs!: {
    studioBg: CompiledProg | null;
    terrain: CompiledProg | null;
    overdrawHeat: CompiledProg | null;
    entity: CompiledProg;
    ribbon: CompiledProg;
    jfaInit: CompiledProg;
    jfaStep: CompiledProg;
    comp: CompiledProg;
  };
  private floatColorExt = false;
  private dummySdfTex: WebGLTexture | null = null;

  private emptyVao: WebGLVertexArrayObject | null = null;
  private cubeVao: WebGLVertexArrayObject | null = null;
  private cubeVbo: WebGLBuffer | null = null;
  private cubeEbo: WebGLBuffer | null = null;
  private instanceVbo: WebGLBuffer | null = null;
  private instanceCapacity = 256;
  private instanceBuf = new Float32Array(256 * INSTANCE_FLOATS);
  private ribbonVao: WebGLVertexArrayObject | null = null;
  private ribbonVbo: WebGLBuffer | null = null;
  private ribbonBuf = new Float32Array(2048 * 5);

  // Reusable per-frame scratch buffers (zero heap allocations inside render loop!)
  private viewMat = new Float32Array(16);
  private projMat = new Float32Array(16);
  private viewProjMat = new Float32Array(16);
  private invViewProjMat = new Float32Array(16);
  private v2wMat = new Float32Array(16);
  private w2vMat = new Float32Array(16);
  private voxToClipMat = new Float32Array(16);
  private clipToVoxMat = new Float32Array(16);
  private frustumPlanes = new Float32Array(24);
  private sunDirBuf = new Float32Array(3);
  private visiblePool: VisibleSlot[] = [];
  private visibleActive: VisibleSlot[] = [];

  private preserveDrawingBufferOpt = true;
  private powerPreferenceOpt: "default" | "low-power" | "high-performance" = "default";
  private onContextLostBound: ((e: Event) => void) | null = null;
  private onContextRestoredBound: (() => void) | null = null;

  private assetCache = new Map<string, GpuAssetTex>();
  private fbo = {
    w: 0, h: 0,
    jfaW: 0, jfaH: 0,
    scene: null as WebGLFramebuffer | null,
    color: null as WebGLTexture | null,
    aux: null as WebGLTexture | null,
    depth: null as WebGLRenderbuffer | null,
    jfaA: null as WebGLFramebuffer | null,
    jfaB: null as WebGLFramebuffer | null,
    seedA: null as WebGLTexture | null,
    seedB: null as WebGLTexture | null,
    overdrawFbo: null as WebGLFramebuffer | null,
    overdrawTex: null as WebGLTexture | null,
  };

  private timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private activeTimerQueries: WebGLQuery[] = [];
  private rollingMs = 2.0;
  private rollingGpuMs: number | undefined = undefined;
  private rollingCadenceMs = 16.67;
  private lastRenderStart = 0;
  private lastDrawCalls = 0;
  private lastVisible = 0;
  private lastTotal = 0;
  private lastDpr = 1;
  private lastSamples = 4;
  private lastTick = 0;
  private lastTime = 0;
  private shadowBuf = new Float32Array(28 * 4);
  private pointLightPosBuf = new Float32Array(16 * 4);
  private pointLightColBuf = new Float32Array(16 * 4);
  private pointLightDirBuf = new Float32Array(16 * 4);

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.quality = opts.quality ?? "auto";
    this.background = opts.background ?? "terrain";
    this.backgroundColor = opts.backgroundColor ?? [12, 18, 32];
    this.terrainShaderSrc = opts.terrainShader ?? null;
    this.instanceBatching = opts.instanceBatching ?? "auto";
    this.adaptiveDpr = opts.adaptiveDpr ?? true;
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const narrow = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 760;
    this.isMobile = this.quality === "mobile" || (this.quality === "auto" && Boolean(coarse || narrow));
    this.aaQuality =
      this.quality === "ultra"
        ? "ultra"
        : this.quality === "eco" || this.quality === "mobile"
          ? "eco"
          : "balanced";
    this.jfaScale = this.aaQuality === "ultra" ? 1.0 : 0.5;
    // Retina-aware default DPR cap: Ultra = 2.0x full Retina + full-res JFA; Balanced = 1.5x; Eco = 1.25x.
    const defaultDpr =
      this.aaQuality === "ultra"
        ? 2.0
        : this.aaQuality === "eco"
          ? this.isMobile ? 1.15 : 1.25
          : this.isMobile ? 1.35 : 1.5;
    this.maxDpr = opts.maxDpr ?? defaultDpr;
    this.preserveDrawingBufferOpt = opts.preserveDrawingBuffer ?? true;
    this.powerPreferenceOpt = opts.powerPreference ?? "default";
    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
      this.ready = false;
      this.activeTimerQueries.length = 0;
    };
    this.onContextRestoredBound = () => {
      this.assetCache.clear();
      this.fbo.w = 0;
      this.fbo.h = 0;
      this.fbo.scene = null;
      this.fbo.overdrawFbo = null;
      this.fbo.overdrawTex = null;
      this.initGL(this.preserveDrawingBufferOpt, this.powerPreferenceOpt);
    };
    this.canvas.addEventListener("webglcontextlost", this.onContextLostBound);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestoredBound);
    this.initGL(this.preserveDrawingBufferOpt, this.powerPreferenceOpt);
  }

  /** Release all GPU textures, FBOs, buffers, VAOs, programs, and event listeners cleanly. */
  dispose(): void {
    if (this.onContextLostBound) {
      this.canvas.removeEventListener("webglcontextlost", this.onContextLostBound);
      this.onContextLostBound = null;
    }
    if (this.onContextRestoredBound) {
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestoredBound);
      this.onContextRestoredBound = null;
    }
    const gl = this.gl;
    if (gl) {
      for (const q of this.activeTimerQueries) gl.deleteQuery(q);
      this.activeTimerQueries.length = 0;
      const f = this.fbo;
      for (const tex of [f.color, f.aux, f.seedA, f.seedB, f.overdrawTex]) if (tex) gl.deleteTexture(tex);
      if (f.depth) gl.deleteRenderbuffer(f.depth);
      for (const fb of [f.scene, f.jfaA, f.jfaB, f.overdrawFbo]) if (fb) gl.deleteFramebuffer(fb);
      f.w = f.h = f.jfaW = f.jfaH = 0;
      f.color = f.aux = f.seedA = f.seedB = f.overdrawTex = null;
      f.depth = null;
      f.scene = f.jfaA = f.jfaB = f.overdrawFbo = null;
      for (const entry of this.assetCache.values()) {
        gl.deleteTexture(entry.albedo);
        if (entry.sdf) gl.deleteTexture(entry.sdf);
        gl.deleteTexture(entry.norm);
        gl.deleteTexture(entry.emis);
      }
      this.assetCache.clear();
      if (this.dummySdfTex) {
        gl.deleteTexture(this.dummySdfTex);
        this.dummySdfTex = null;
      }
      for (const vao of [this.emptyVao, this.cubeVao, this.ribbonVao]) if (vao) gl.deleteVertexArray(vao);
      for (const buf of [this.cubeVbo, this.cubeEbo, this.instanceVbo, this.ribbonVbo]) if (buf) gl.deleteBuffer(buf);
      this.emptyVao = this.cubeVao = this.ribbonVao = null;
      this.cubeVbo = this.cubeEbo = this.instanceVbo = this.ribbonVbo = null;
      if (this.progs) {
        for (const p of Object.values(this.progs)) if (p) gl.deleteProgram(p.program);
      }
    }
    this.ready = false;
    this.gl = null;
  }

  /** Free GPU 3D textures for a single asset without disposing the renderer (useful when streaming levels). */
  evictAsset(assetId: string): boolean {
    const entry = this.assetCache.get(assetId);
    if (!entry) return false;
    const gl = this.gl;
    if (gl) {
      gl.deleteTexture(entry.albedo);
      if (entry.sdf) gl.deleteTexture(entry.sdf);
      gl.deleteTexture(entry.norm);
      gl.deleteTexture(entry.emis);
    }
    this.assetCache.delete(assetId);
    return true;
  }

  /** Live runtime AA quality softswitch for developers and end-users ("eco" | "balanced" | "ultra"). */
  setQuality(preset: AAQuality, world?: SceneWorld): void {
    this.aaQuality = preset;
    this.drsScale = 1.0;
    if (preset === "ultra") {
      this.maxDpr = 2.0;
      this.jfaScale = 1.0;
      if (world) world.doc.samples = 8;
    } else if (preset === "eco") {
      this.maxDpr = this.isMobile ? 1.15 : 1.25;
      this.jfaScale = 0.5;
      if (world) world.doc.samples = 2;
    } else {
      this.maxDpr = this.isMobile ? 1.35 : 1.5;
      this.jfaScale = 0.5;
      if (world) world.doc.samples = 4;
    }
  }

  getQuality(): AAQuality {
    return this.aaQuality;
  }

  /** Switch canvas background mode at runtime ("terrain" | "studio" | "solid" | "transparent"). */
  setBackground(mode: BackgroundMode, color?: RGB): void {
    this.background = mode;
    if (color) this.backgroundColor = color;
  }

  getBackground(): BackgroundMode {
    return this.background;
  }

  /** Register or replace the optional procedural terrain fragment shader (`@aastack/core/terrain`). */
  setTerrainShader(glsl: string | null): void {
    this.terrainShaderSrc = glsl;
    if (this.gl && this.progs?.terrain) {
      this.gl.deleteProgram(this.progs.terrain.program);
      this.progs.terrain = null;
    }
  }

  /** Switch hardware instancing strategy at runtime ("auto" | "aggressive" | "off"). */
  setInstanceBatching(mode: InstanceBatchingMode): void {
    this.instanceBatching = mode;
  }

  getInstanceBatching(): InstanceBatchingMode {
    return this.instanceBatching;
  }

  get isReady(): boolean {
    return this.ready;
  }

  private compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? "unknown";
      gl.deleteShader(sh);
      throw new Error(`Shader compile error: ${log}`);
    }
    return sh;
  }

  private link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): CompiledProg {
    const vs = this.compile(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.detachShader(program, vs);
    gl.detachShader(program, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "unknown";
      throw new Error(`Program link error: ${log}`);
    }
    const u: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const cleanName = info.name.replace(/\[0\]$/, "");
        u[cleanName] = gl.getUniformLocation(program, info.name);
      }
    }
    return { program, u };
  }

  private initGL(preserveDrawingBuffer: boolean, powerPreference: "default" | "low-power" | "high-performance"): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      powerPreference,
      preserveDrawingBuffer,
    });
    if (!gl) return;
    this.gl = gl;
    this.timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2") as
      | { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
      | null;
    this.floatColorExt = Boolean(gl.getExtension("EXT_color_buffer_float"));

    this.progs = {
      studioBg: null,     // Lazily compiled only when background === "studio" (or terrain fallback)
      terrain: null,      // Lazily compiled only when background === "terrain" && terrainShader provided
      overdrawHeat: null, // Lazily compiled only when debugOverlay === "overdraw"
      entity: this.link(gl, ENTITY_OBB_VS, ENTITY_OBB_FS),
      ribbon: this.link(gl, RIBBON_VS, RIBBON_FS),
      jfaInit: this.link(gl, FULLSCREEN_VS, JFA_INIT_FS),
      jfaStep: this.link(gl, FULLSCREEN_VS, JFA_STEP_FS),
      comp: this.link(gl, FULLSCREEN_VS, COMPOSITE_FS),
    };

    // Bind constant texture unit indices once at startup instead of per-entity/per-frame
    gl.useProgram(this.progs.entity.program);
    gl.uniform1i(this.progs.entity.u.uAlbedoTex, 0);
    gl.uniform1i(this.progs.entity.u.uSdfTex, 1);
    gl.uniform1i(this.progs.entity.u.uNormalTex, 2);
    gl.uniform1i(this.progs.entity.u.uEmisTex, 3);
    gl.useProgram(this.progs.jfaInit.program);
    gl.uniform1i(this.progs.jfaInit.u.uAuxTex, 0);
    gl.useProgram(this.progs.jfaStep.program);
    gl.uniform1i(this.progs.jfaStep.u.uSeedTex, 0);
    gl.useProgram(this.progs.comp.program);
    gl.uniform1i(this.progs.comp.u.uColorTex, 0);
    gl.uniform1i(this.progs.comp.u.uAuxTex, 1);
    gl.uniform1i(this.progs.comp.u.uSeedTex, 2);
    gl.useProgram(null);

    // 1x1x1 dummy 3D SDF texture so voxel-dda assets skip uploading unused uSdfTex VRAM
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const dummy = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, dummy);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, 1, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([128]));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.dummySdfTex = dummy;

    this.emptyVao = gl.createVertexArray();

    // Unit OBB cube VAO + hardware-instanced per-entity attribute stream (locations 1..14)
    this.cubeVao = gl.createVertexArray();
    gl.bindVertexArray(this.cubeVao);
    this.cubeVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVbo);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_CUBE_VERTS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.cubeEbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cubeEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, UNIT_CUBE_INDICES, gl.STATIC_DRAW);

    this.instanceVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceBuf.byteLength, gl.DYNAMIC_DRAW);
    // loc 1..4: aVoxToClip0..3 (mat4, 16 floats @ byte offsets 0, 16, 32, 48)
    for (let c = 0; c < 4; c++) {
      gl.enableVertexAttribArray(1 + c);
      gl.vertexAttribPointer(1 + c, 4, gl.FLOAT, false, INSTANCE_STRIDE, c * 16);
      gl.vertexAttribDivisor(1 + c, 1);
    }
    // loc 5..8: aClipToVox0..3 (mat4, 16 floats @ byte offsets 64, 80, 96, 112)
    for (let c = 0; c < 4; c++) {
      gl.enableVertexAttribArray(5 + c);
      gl.vertexAttribPointer(5 + c, 4, gl.FLOAT, false, INSTANCE_STRIDE, 64 + c * 16);
      gl.vertexAttribDivisor(5 + c, 1);
    }
    // loc 9..11: aNorm0..2 (mat3, 9 floats @ byte offsets 128, 140, 152)
    for (let c = 0; c < 3; c++) {
      gl.enableVertexAttribArray(9 + c);
      gl.vertexAttribPointer(9 + c, 3, gl.FLOAT, false, INSTANCE_STRIDE, 128 + c * 12);
      gl.vertexAttribDivisor(9 + c, 1);
    }
    // loc 12: aSunAndScale (vec4 @ byte offset 164)
    gl.enableVertexAttribArray(12);
    gl.vertexAttribPointer(12, 4, gl.FLOAT, false, INSTANCE_STRIDE, 164);
    gl.vertexAttribDivisor(12, 1);
    // loc 13: aMeta (vec4 @ byte offset 180)
    gl.enableVertexAttribArray(13);
    gl.vertexAttribPointer(13, 4, gl.FLOAT, false, INSTANCE_STRIDE, 180);
    gl.vertexAttribDivisor(13, 1);
    // loc 14: aFlags (vec4 @ byte offset 196)
    gl.enableVertexAttribArray(14);
    gl.vertexAttribPointer(14, 4, gl.FLOAT, false, INSTANCE_STRIDE, 196);
    gl.vertexAttribDivisor(14, 1);
    // loc 15: aSliceClip (vec2 @ byte offset 212)
    gl.enableVertexAttribArray(15);
    gl.vertexAttribPointer(15, 2, gl.FLOAT, false, INSTANCE_STRIDE, 212);
    gl.vertexAttribDivisor(15, 1);

    // Dynamic 3D ribbon VAO
    this.ribbonVao = gl.createVertexArray();
    gl.bindVertexArray(this.ribbonVao);
    this.ribbonVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.ribbonBuf.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);

    gl.bindVertexArray(null);
    this.ready = true;
  }

  private create2DTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private ensureFBOs(w: number, h: number): void {
    const gl = this.gl!;
    const f = this.fbo;
    const targetJfaW = this.jfaScale >= 0.75 ? w : Math.max(32, Math.ceil(w * 0.5));
    const targetJfaH = this.jfaScale >= 0.75 ? h : Math.max(32, Math.ceil(h * 0.5));
    if (f.w === w && f.h === h && f.jfaW === targetJfaW && f.jfaH === targetJfaH && f.scene) return;

    for (const tex of [f.color, f.aux, f.seedA, f.seedB, f.overdrawTex]) if (tex) gl.deleteTexture(tex);
    if (f.depth) gl.deleteRenderbuffer(f.depth);
    for (const fb of [f.scene, f.jfaA, f.jfaB, f.overdrawFbo]) if (fb) gl.deleteFramebuffer(fb);
    f.overdrawTex = null;
    f.overdrawFbo = null;

    f.w = w; f.h = h;
    f.jfaW = targetJfaW;
    f.jfaH = targetJfaH;
    f.color = this.create2DTex(gl, w, h);
    f.aux = this.create2DTex(gl, w, h);
    // Ultra uses full-res JFA for razor-smooth outlines under zoom; Eco/Balanced use half-res JFA (-75% bandwidth).
    f.seedA = this.create2DTex(gl, f.jfaW, f.jfaH);
    f.seedB = this.create2DTex(gl, f.jfaW, f.jfaH);

    f.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, f.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

    f.scene = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.scene);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, f.aux, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    f.jfaA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.jfaA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.seedA, 0);

    f.jfaB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.jfaB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.seedB, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private ensureOverdrawFbo(w: number, h: number): {
    fbo: WebGLFramebuffer;
    tex: WebGLTexture;
    unit: number;
    exact: boolean;
  } {
    const gl = this.gl!;
    const f = this.fbo;
    const exact = this.floatColorExt;
    const unit = exact ? 1.0 : 1.0 / 255.0;
    if (f.overdrawFbo && f.overdrawTex && f.w === w && f.h === h) {
      return { fbo: f.overdrawFbo, tex: f.overdrawTex, unit, exact };
    }
    if (f.overdrawTex) gl.deleteTexture(f.overdrawTex);
    if (f.overdrawFbo) gl.deleteFramebuffer(f.overdrawFbo);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      exact ? gl.RGBA16F : gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      exact ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    f.overdrawTex = tex;
    f.overdrawFbo = fbo;
    return { fbo, tex, unit, exact };
  }

  private collectVisibleEntities(
    world: SceneWorld,
    frustum: Float32Array,
    isParallel: boolean,
    fwdX: number,
    fwdY: number,
    fwdZ: number,
  ): VisibleSlot[] {
    const doc = world.doc;
    const cam = doc.camera;
    const visibleList = this.visibleActive;
    visibleList.length = 0;
    let slotIdx = 0;
    for (let i = 0; i < doc.entities.length; i++) {
      const ent = doc.entities[i];
      if (ent.visible === false) continue;
      const asset = world.getAsset(ent.assetId);
      if (!asset) continue;

      const ex = ent.pos[0], ey = ent.pos[1], ez = ent.pos[2];
      // Exact rotation-invariant bounding sphere around ent.pos (skips unparented off-screen entities before matrix/GL work)
      if (!ent.parentId) {
        const rx = Math.max(asset.pivot[0], asset.w - asset.pivot[0]);
        const ry = Math.max(asset.pivot[1], asset.l - asset.pivot[1]);
        const rz = Math.max(asset.pivot[2], asset.h - asset.pivot[2]);
        const boundR = Math.hypot(rx, ry, rz) * asset.voxelScale * ent.scale * 1.12;
        if (!sphereInFrustum(frustum, ex, ey, ez, boundR)) continue;
      }

      const dx = ex - cam.pos[0];
      const dy = ey - cam.pos[1];
      const dz = ez - cam.pos[2];
      const dist = Math.hypot(dx, dy, dz);
      const sortKey = isParallel ? (dx * fwdX + dy * fwdY + dz * fwdZ) : dist;

      let slot = this.visiblePool[slotIdx];
      if (!slot) {
        slot = { ent, asset, dist, sortKey, idx: i + 1 };
        this.visiblePool[slotIdx] = slot;
      } else {
        slot.ent = ent;
        slot.asset = asset;
        slot.dist = dist;
        slot.sortKey = sortKey;
        slot.idx = i + 1;
      }
      visibleList.push(slot);
      slotIdx++;
    }
    if (this.instanceBatching === "aggressive") {
      visibleList.sort((a, b) => {
        if (a.asset.id !== b.asset.id) return a.asset.id < b.asset.id ? -1 : 1;
        return b.sortKey - a.sortKey;
      });
    } else {
      visibleList.sort((a, b) => b.sortKey - a.sortKey); // back-to-front
    }
    return visibleList;
  }

  private drawEntityBatches(
    world: SceneWorld,
    cw: number,
    ch: number,
    viewProj: Float32Array,
    invViewProj: Float32Array,
    sunDir: Float32Array,
    isParallel: boolean,
    isTransparent: boolean,
    isSolid: boolean,
    styleInt: number,
    effectiveMode: AAMode,
    splitX: number,
    leftMode: AAMode,
    rightMode: AAMode,
    debugModeInt: number,
    overdrawUnit: number,
  ): { drawCalls: number; hasOutlinedEntity: boolean } {
    const gl = this.gl!;
    const doc = world.doc;
    const visibleList = this.visibleActive;
    const ep = this.progs.entity;
    gl.useProgram(ep.program);
    gl.bindVertexArray(this.cubeVao);
    gl.uniform2f(ep.u.uResolution, cw, ch);
    gl.uniform1f(ep.u.uSplitX, splitX);
    gl.uniformMatrix4fv(ep.u.uInvViewProj, false, invViewProj);
    gl.uniform3fv(ep.u.uCamPos, doc.camera.pos);
    gl.uniform1i(ep.u.uStyle, styleInt);
    gl.uniform1i(ep.u.uShadeStyle, shadeStyleToInt(doc.lighting.shadeStyle));
    gl.uniform3fv(ep.u.uSunDir, sunDir);
    gl.uniform1f(ep.u.uTimeOfDay, doc.lighting.timeOfDay);
    gl.uniform1f(ep.u.uFogDensity, isTransparent || isSolid ? 0.0 : doc.lighting.fogDensity);
    gl.uniform1f(ep.u.uMicroRelief, doc.lighting.microRelief ?? 0.0);
    gl.uniform1f(ep.u.uStyleDial, doc.lighting.styleDial ?? 0.0);
    gl.uniform1i(ep.u.uDebugOverlay, debugModeInt);
    gl.uniform1f(ep.u.uOverdrawUnit, overdrawUnit);

    // Upload up to 16 live 3D point & spot lights directly to the entity fragment shader
    const pLights = doc.lighting.pointLights;
    const pCount = pLights ? Math.min(pLights.length, 16) : 0;
    gl.uniform1i(ep.u.uPointLightCount, pCount);
    if (pCount > 0 && pLights) {
      for (let i = 0; i < pCount; i++) {
        const l = pLights[i];
        const b = i * 4;
        const inten = l.intensity ?? 1.0;
        this.pointLightPosBuf[b + 0] = l.pos[0];
        this.pointLightPosBuf[b + 1] = l.pos[1];
        this.pointLightPosBuf[b + 2] = l.pos[2];
        this.pointLightPosBuf[b + 3] = Math.max(0.1, l.radius);
        // Convert sRGB color to approximate linear intensity for accurate additive lighting
        this.pointLightColBuf[b + 0] = Math.pow(l.color[0] / 255, 2.2) * inten;
        this.pointLightColBuf[b + 1] = Math.pow(l.color[1] / 255, 2.2) * inten;
        this.pointLightColBuf[b + 2] = Math.pow(l.color[2] / 255, 2.2) * inten;
        this.pointLightColBuf[b + 3] = l.dir ? (l.spotCos ?? 0.80) : -1.0;
        if (l.dir) {
          const dLen = Math.hypot(l.dir[0], l.dir[1], l.dir[2]) || 1;
          this.pointLightDirBuf[b + 0] = l.dir[0] / dLen;
          this.pointLightDirBuf[b + 1] = l.dir[1] / dLen;
          this.pointLightDirBuf[b + 2] = l.dir[2] / dLen;
          this.pointLightDirBuf[b + 3] = l.spotSoft ?? 0.14;
        } else {
          this.pointLightDirBuf[b + 0] = 0;
          this.pointLightDirBuf[b + 1] = -1;
          this.pointLightDirBuf[b + 2] = 0;
          this.pointLightDirBuf[b + 3] = 0.14;
        }
      }
      gl.uniform4fv(ep.u.uPointLights, this.pointLightPosBuf);
      gl.uniform4fv(ep.u.uPointLightCols, this.pointLightColBuf);
      gl.uniform4fv(ep.u.uPointLightDirs, this.pointLightDirBuf);
    }

    const maxSamples = debugModeInt >= 4
      ? 1
      : this.isMobile && this.aaQuality !== "ultra"
        ? Math.min(doc.samples, 4)
        : doc.samples;
    if (debugModeInt < 4) this.lastSamples = maxSamples;

    let drawCalls = 0;
    let hasOutlinedEntity = false;
    let lastBoundAssetKey = "";
    let lastBoundNeedSdf = false;

    for (let vi = 0; vi < visibleList.length; ) {
      const leadAsset = visibleList[vi].asset;
      let runEnd = vi + 1;
      if (this.instanceBatching !== "off") {
        while (
          runEnd < visibleList.length &&
          visibleList[runEnd].asset.id === leadAsset.id &&
          visibleList[runEnd].asset.hash === leadAsset.hash
        ) {
          runEnd++;
        }
      }

      const runMax = runEnd - vi;
      this.ensureInstanceCapacity(runMax);
      const ib = this.instanceBuf;
      let instCount = 0;
      let runNeedSdf = false;

      for (let k = vi; k < runEnd; k++) {
        const { ent, asset, dist, idx } = visibleList[k];
        const v2w = world.getVoxelToWorldMatrix(ent, this.v2wMat);
        if (!v2w) continue;
        if (ent.outline !== false) hasOutlinedEntity = true;
        const w2v = mat4Invert(v2w, this.w2vMat);
        const voxToClip = mat4Mul(viewProj, v2w, this.voxToClipMat);
        const clipToVox = mat4Mul(w2v, invViewProj, this.clipToVoxMat);

        const mA = aaModeToInt(doc.splitCompare.enabled ? leftMode : ent.aaMode ?? effectiveMode);
        const mB = aaModeToInt(doc.splitCompare.enabled ? rightMode : ent.aaMode ?? effectiveMode);
        if (mA === 2 || mB === 2) runNeedSdf = true;

        const sx = Math.hypot(v2w[0], v2w[1], v2w[2]) || 1;
        const sy = Math.hypot(v2w[4], v2w[5], v2w[6]) || 1;
        const sz = Math.hypot(v2w[8], v2w[9], v2w[10]) || 1;

        const slx = w2v[0] * sunDir[0] + w2v[4] * sunDir[1] + w2v[8] * sunDir[2];
        const sly = w2v[1] * sunDir[0] + w2v[5] * sunDir[1] + w2v[9] * sunDir[2];
        const slz = w2v[2] * sunDir[0] + w2v[6] * sunDir[1] + w2v[10] * sunDir[2];
        const slInv = 1 / (Math.hypot(slx, sly, slz) || 1);

        // Distance-adaptive RGSS LOD (parallel ortho/isometric/oblique projections keep full samples across depth!)
        const isHero = isParallel || ent.aaPriority === "hero" || ent.tag === "player" || dist < 44;
        const entSamples = debugModeInt >= 4 ? 1 : isHero ? maxSamples : dist < 96 ? Math.min(maxSamples, 2) : 1;
        const sc = ent.sliceClip;

        const base = instCount * INSTANCE_FLOATS;
        // 0..15: aVoxToClip0..3
        ib.set(voxToClip, base);
        // 16..31: aClipToVox0..3
        ib.set(clipToVox, base + 16);
        // 32..40: aNorm0..2
        ib[base + 32] = v2w[0] / sx; ib[base + 33] = v2w[1] / sx; ib[base + 34] = v2w[2] / sx;
        ib[base + 35] = v2w[4] / sy; ib[base + 36] = v2w[5] / sy; ib[base + 37] = v2w[6] / sy;
        ib[base + 38] = v2w[8] / sz; ib[base + 39] = v2w[9] / sz; ib[base + 40] = v2w[10] / sz;
        // 41..44: aSunAndScale
        ib[base + 41] = slx * slInv;
        ib[base + 42] = sly * slInv;
        ib[base + 43] = slz * slInv;
        ib[base + 44] = asset.voxelScale * ent.scale;
        // 45..48: aMeta
        ib[base + 45] = ((idx % 250) + 1) / 255.0;
        ib[base + 46] = ent.emissiveBoost ?? 1.0;
        ib[base + 47] = ent.normalSmoothness ?? -1.0;
        ib[base + 48] = entSamples;
        // 49..52: aFlags
        ib[base + 49] = doc.lighting.selfShadow && isHero ? 1.0 : 0.0;
        ib[base + 50] = ent.outline === false ? 0.0 : 1.0;
        ib[base + 51] = mA;
        ib[base + 52] = mB;
        // 53..54: aSliceClip
        ib[base + 53] = sc ? sc[0] : 0.0;
        ib[base + 54] = sc ? sc[1] : 1.0;
        instCount++;
      }

      vi = runEnd;
      if (instCount === 0) continue;

      const gpuTex = this.ensureAssetGPU(leadAsset, runNeedSdf);
      const assetKey = `${leadAsset.id}:${leadAsset.hash}`;
      if (assetKey !== lastBoundAssetKey || (runNeedSdf && !lastBoundNeedSdf)) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, gpuTex.albedo);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, gpuTex.sdf ?? this.dummySdfTex);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, gpuTex.norm);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, gpuTex.emis);
        lastBoundAssetKey = assetKey;
        lastBoundNeedSdf = runNeedSdf;
      }

      gl.uniform3f(ep.u.uVolSize, leadAsset.w, leadAsset.l, leadAsset.h);
      gl.uniform1f(ep.u.uSdfRange, leadAsset.sdfRange);
      gl.uniform1f(ep.u.uSdfIsFloat, gpuTex.sdf && gpuTex.sdfIsFloat ? 1.0 : 0.0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ib.subarray(0, instCount * INSTANCE_FLOATS));
      gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, instCount);
      drawCalls++;
    }

    return { drawCalls, hasOutlinedEntity };
  }

  private runOverdrawPass(
    world: SceneWorld,
    cw: number,
    ch: number,
    viewProj: Float32Array,
    invViewProj: Float32Array,
    sunDir: Float32Array,
    isParallel: boolean,
    isTransparent: boolean,
    isSolid: boolean,
    styleInt: number,
    effectiveMode: AAMode,
    splitX: number,
    leftMode: AAMode,
    rightMode: AAMode,
  ): { tex: WebGLTexture; fbo: WebGLFramebuffer; unit: number; exact: boolean; drawCalls: number } {
    const gl = this.gl!;
    const od = this.ensureOverdrawFbo(cw, ch);
    gl.viewport(0, 0, cw, ch);
    gl.bindFramebuffer(gl.FRAMEBUFFER, od.fbo);
    gl.clearDepth(1.0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Channel R: fragments written (passes voxel DDA hit + depth test)
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    const writtenRes = this.drawEntityBatches(
      world, cw, ch, viewProj, invViewProj, sunDir, isParallel, isTransparent, isSolid,
      styleInt, effectiveMode, splitX, leftMode, rightMode, 4, od.unit,
    );

    // Channel G: fragments covered (all rasterized OBB proxy fragments, depth test disabled)
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.drawEntityBatches(
      world, cw, ch, viewProj, invViewProj, sunDir, isParallel, isTransparent, isSolid,
      styleInt, effectiveMode, splitX, leftMode, rightMode, 5, od.unit,
    );
    gl.depthMask(true);

    return { ...od, drawCalls: writtenRes.drawCalls };
  }

  private make3DTex(
    gl: WebGL2RenderingContext,
    w: number,
    l: number,
    h: number,
    intFmt: number,
    fmt: number,
    data: Uint8Array,
    filter: number,
  ): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, intFmt, w, l, h, 0, fmt, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return t;
  }

  private make3DTexF16(
    gl: WebGL2RenderingContext,
    w: number,
    l: number,
    h: number,
    data: Float32Array,
  ): WebGLTexture {
    const f16 = float32ToFloat16Array(data);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, w, l, h, 0, gl.RED, gl.HALF_FLOAT, f16);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return t;
  }

  private uploadSdfTex(gl: WebGL2RenderingContext, asset: VolumeAsset): { tex: WebGLTexture; isFloat: boolean } {
    if (asset.hasExactSdf) {
      return { tex: this.make3DTexF16(gl, asset.w, asset.l, asset.h, asset.sdfF32), isFloat: true };
    }
    return {
      tex: this.make3DTex(gl, asset.w, asset.l, asset.h, gl.R8, gl.RED, asset.sdfU8, gl.LINEAR),
      isFloat: false,
    };
  }

  private uploadEmisMatTex(gl: WebGL2RenderingContext, asset: VolumeAsset): WebGLTexture {
    if (asset.materialU8 && asset.materialU8.length === asset.emisU8.length) {
      const n = asset.emisU8.length;
      const rg = new Uint8Array(n * 2);
      for (let i = 0; i < n; i++) {
        rg[i * 2] = asset.emisU8[i];
        rg[i * 2 + 1] = asset.materialU8[i];
      }
      return this.make3DTex(gl, asset.w, asset.l, asset.h, gl.RG8, gl.RG, rg, gl.NEAREST);
    }
    return this.make3DTex(gl, asset.w, asset.l, asset.h, gl.R8, gl.RED, asset.emisU8, gl.NEAREST);
  }

  private ensureAssetGPU(asset: VolumeAsset, needSdf: boolean): GpuAssetTex {
    const gl = this.gl!;
    const existing = this.assetCache.get(asset.id);
    if (existing && existing.hash === asset.hash) {
      if (needSdf && !existing.sdf) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        const up = this.uploadSdfTex(gl, asset);
        existing.sdf = up.tex;
        existing.sdfIsFloat = up.isFloat;
      }
      return existing;
    }
    if (existing) {
      gl.deleteTexture(existing.albedo);
      if (existing.sdf) gl.deleteTexture(existing.sdf);
      gl.deleteTexture(existing.norm);
      gl.deleteTexture(existing.emis);
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const upSdf = needSdf ? this.uploadSdfTex(gl, asset) : null;
    const entry: GpuAssetTex = {
      hash: asset.hash,
      albedo: this.make3DTex(gl, asset.w, asset.l, asset.h, gl.RGBA8, gl.RGBA, asset.rgba, gl.LINEAR),
      sdf: upSdf ? upSdf.tex : null,
      sdfIsFloat: upSdf ? upSdf.isFloat : false,
      norm: this.make3DTex(gl, asset.w, asset.l, asset.h, gl.RGBA8, gl.RGBA, asset.normAo, gl.LINEAR),
      emis: this.uploadEmisMatTex(gl, asset),
    };
    this.assetCache.set(asset.id, entry);
    return entry;
  }

  private ensureInstanceCapacity(count: number): void {
    if (count <= this.instanceCapacity) return;
    let cap = this.instanceCapacity;
    while (cap < count) cap *= 2;
    this.instanceCapacity = cap;
    this.instanceBuf = new Float32Array(cap * INSTANCE_FLOATS);
    const gl = this.gl;
    if (gl && this.instanceVbo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.instanceBuf.byteLength, gl.DYNAMIC_DRAW);
    }
  }

  /** Resize canvas cleanly respecting container CSS size, DPR cap, and adaptive mobile DRS. */
  resizeToDisplay(cssWidth?: number, cssHeight?: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const cwCss = Math.max(1, cssWidth ?? rect.width);
    const chCss = Math.max(1, cssHeight ?? rect.height);
    const rawDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const effDpr = Math.min(rawDpr, this.maxDpr) * this.drsScale;
    this.lastDpr = effDpr;
    const w = Math.max(64, Math.round(cwCss * effDpr));
    const h = Math.max(64, Math.round(chCss * effDpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(world: SceneWorld): void {
    if (!this.ready || !this.gl) return;
    const t0 = performance.now();
    if (this.lastRenderStart > 0) {
      const gap = t0 - this.lastRenderStart;
      if (gap > 2 && gap < 250) {
        this.rollingCadenceMs = this.rollingCadenceMs * 0.85 + gap * 0.15;
      }
    }
    this.lastRenderStart = t0;
    const gl = this.gl;
    const doc = world.doc;

    // Drain any finished non-blocking GPU timer queries to surface true GPU frame time
    if (this.timerExt && this.activeTimerQueries.length > 0) {
      const disjoint = gl.getParameter(this.timerExt.GPU_DISJOINT_EXT);
      while (this.activeTimerQueries.length > 0) {
        const q = this.activeTimerQueries[0];
        const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
        if (!available) break;
        this.activeTimerQueries.shift();
        if (!disjoint) {
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
          const ms = ns / 1e6;
          this.rollingGpuMs = this.rollingGpuMs === undefined ? ms : this.rollingGpuMs * 0.85 + ms * 0.15;
        }
        gl.deleteQuery(q);
      }
    }
    let curGpuQuery: WebGLQuery | null = null;
    if (this.timerExt && this.activeTimerQueries.length < 4) {
      curGpuQuery = gl.createQuery();
      if (curGpuQuery) gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, curGpuQuery);
    }

    this.resizeToDisplay();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.ensureFBOs(cw, ch);

    const aspect = cw / Math.max(ch, 1);
    const cam = doc.camera;
    const isParallel = cam.mode === "ortho" || cam.mode === "oblique";
    const viewProj = computeCameraViewProj(cam, aspect, this.viewMat, this.projMat, this.viewProjMat);
    const invViewProj = mat4Invert(viewProj, this.invViewProjMat);
    const frustum = extractFrustumPlanes(viewProj, this.frustumPlanes);

    // Camera forward unit vector for exact back-to-front painter's sorting in parallel projections
    const fxRaw = cam.target[0] - cam.pos[0];
    const fyRaw = cam.target[1] - cam.pos[1];
    const fzRaw = cam.target[2] - cam.pos[2];
    const fInv = 1 / (Math.hypot(fxRaw, fyRaw, fzRaw) || 1);
    const fwdX = fxRaw * fInv;
    const fwdY = fyRaw * fInv;
    const fwdZ = fzRaw * fInv;

    // World sun direction (reused scratch buffer)
    const az = (doc.lighting.sunAzimuthDeg * Math.PI) / 180;
    const el = (doc.lighting.sunElevationDeg * Math.PI) / 180;
    const sunDir = this.sunDirBuf;
    sunDir[0] = Math.cos(az) * Math.cos(el);
    sunDir[1] = Math.sin(el);
    sunDir[2] = Math.sin(az) * Math.cos(el);

    // Collect shadow casters (clouds + hero actors) for ground projection
    let shCount = 0;
    for (const ent of doc.entities) {
      if (ent.visible === false || !ent.castShadow || shCount >= 28) continue;
      const asset = world.getAsset(ent.assetId);
      if (!asset) continue;
      const radius = Math.max(asset.w, asset.l) * 0.52 * asset.voxelScale * ent.scale;
      this.shadowBuf[shCount * 4 + 0] = ent.pos[0];
      this.shadowBuf[shCount * 4 + 1] = ent.pos[1];
      this.shadowBuf[shCount * 4 + 2] = ent.pos[2];
      this.shadowBuf[shCount * 4 + 3] = radius;
      shCount++;
    }

    const styleInt = styleToInt(doc.style ?? "arcade-8bit");
    const effectiveMode = defaultAAModeForStyle(doc.style ?? "arcade-8bit", doc.aaMode);
    const splitX = doc.splitCompare.enabled ? doc.splitCompare.splitX : -1.0;
    const leftMode = doc.splitCompare.enabled ? doc.splitCompare.leftMode : effectiveMode;
    const rightMode = doc.splitCompare.enabled ? doc.splitCompare.rightMode : effectiveMode;

    const isTransparent = this.background === "transparent";
    const isSolid = this.background === "solid";
    let drawCalls = 0;

    if (doc.debugOverlay === "overdraw") {
      const visibleList = this.collectVisibleEntities(world, frustum, isParallel, fwdX, fwdY, fwdZ);
      const od = this.runOverdrawPass(
        world, cw, ch, viewProj, invViewProj, sunDir, isParallel, isTransparent, isSolid,
        styleInt, effectiveMode, splitX, leftMode, rightMode,
      );
      if (!this.progs.overdrawHeat) {
        this.progs.overdrawHeat = this.link(gl, FULLSCREEN_VS, OVERDRAW_HEAT_FS);
        gl.useProgram(this.progs.overdrawHeat.program);
        gl.uniform1i(this.progs.overdrawHeat.u.uCountTex, 0);
      }
      const hp = this.progs.overdrawHeat;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(hp.program);
      gl.bindVertexArray(this.emptyVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, od.tex);
      gl.uniform1i(hp.u.uChannel, 1);
      gl.uniform1f(hp.u.uUnit, od.unit);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls = od.drawCalls * 2 + 1;

      if (curGpuQuery && this.timerExt) {
        gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
        this.activeTimerQueries.push(curGpuQuery);
      }
      const dtMs = performance.now() - t0;
      this.rollingMs = this.rollingMs * 0.88 + dtMs * 0.12;
      this.lastDrawCalls = drawCalls;
      this.lastVisible = visibleList.length;
      this.lastTotal = doc.entities.length;
      this.lastTick = doc.tick;
      this.lastTime = doc.time;
      return;
    }

    gl.viewport(0, 0, cw, ch);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.scene);
    gl.clearDepth(1.0);
    if (isTransparent) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else if (isSolid) {
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.clearColor(
        this.backgroundColor[0] / 255,
        this.backgroundColor[1] / 255,
        this.backgroundColor[2] / 255,
        1.0,
      );
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawBuffers([gl.COLOR_ATTACHMENT1]);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    } else {
      gl.clear(gl.DEPTH_BUFFER_BIT);

      // ------------------------------------------------------------
      // PASS 0: Tree-shakeable Terrain/Ocean OR compact Studio Backdrop (lazily compiled)
      // ------------------------------------------------------------
      const useTerrain = this.background === "terrain" && doc.terrain.enabled && this.terrainShaderSrc !== null;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);

      if (useTerrain) {
        if (!this.progs.terrain) {
          this.progs.terrain = this.link(gl, FULLSCREEN_VS, this.terrainShaderSrc!);
        }
        const tp = this.progs.terrain;
        gl.useProgram(tp.program);
        gl.bindVertexArray(this.emptyVao);
        gl.uniform2f(tp.u.uResolution, cw, ch);
        gl.uniformMatrix4fv(tp.u.uViewProj, false, viewProj);
        gl.uniformMatrix4fv(tp.u.uInvViewProj, false, invViewProj);
        gl.uniform3fv(tp.u.uCamPos, cam.pos);
        gl.uniform3fv(tp.u.uSunDir, sunDir);
        gl.uniform1f(tp.u.uTimeOfDay, doc.lighting.timeOfDay);
        gl.uniform1f(tp.u.uFogDensity, doc.lighting.fogDensity);
        gl.uniform1i(tp.u.uStyle, styleInt);
        gl.uniform1i(tp.u.uTerrainEnabled, 1);
        gl.uniform1f(tp.u.uSeed, doc.terrain.seed);
        gl.uniform1f(tp.u.uMaxHeight, doc.terrain.maxHeight);
        gl.uniform1f(tp.u.uTerrainScale, doc.terrain.scale);
        gl.uniform1f(tp.u.uWaveTime, doc.terrain.waveTime);
        gl.uniform1f(tp.u.uTerraceSteps, doc.terrain.terraceSteps);
        gl.uniform1f(tp.u.uStepFactor, this.isMobile ? 1.35 : 1.0);
        gl.uniform1f(tp.u.uSplitX, splitX);
        gl.uniform1i(tp.u.uLeftLegacy, leftMode === "legacy" ? 1 : 0);
        gl.uniform1i(tp.u.uRightLegacy, rightMode === "legacy" ? 1 : 0);
        gl.uniform1i(tp.u.uShadowCount, shCount);
        if (shCount > 0) gl.uniform4fv(tp.u.uShadowCasters, this.shadowBuf);
      } else {
        if (!this.progs.studioBg) {
          this.progs.studioBg = this.link(gl, FULLSCREEN_VS, STUDIO_BG_FS);
        }
        const sp = this.progs.studioBg;
        gl.useProgram(sp.program);
        gl.bindVertexArray(this.emptyVao);
        gl.uniform2f(sp.u.uResolution, cw, ch);
        gl.uniformMatrix4fv(sp.u.uInvViewProj, false, invViewProj);
        gl.uniform3fv(sp.u.uSunDir, sunDir);
        gl.uniform1f(sp.u.uTimeOfDay, doc.lighting.timeOfDay);
        gl.uniform1f(sp.u.uSplitX, splitX);
        gl.uniform1i(sp.u.uLeftLegacy, leftMode === "legacy" ? 1 : 0);
        gl.uniform1i(sp.u.uRightLegacy, rightMode === "legacy" ? 1 : 0);
        gl.uniform1i(sp.u.uShadowCount, shCount);
        if (shCount > 0) gl.uniform4fv(sp.u.uShadowCasters, this.shadowBuf);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;
    }

    // ------------------------------------------------------------
    // PASS 1: Hardware-Instanced 6-DOF & 2.5D Anti-Aliased Entities (OBB Proxies)
    // 6-plane Gribb-Hartmann frustum culled + back-to-front sorted + contiguous
    // same-asset batching via WebGL2 drawElementsInstanced, with exact gl_FragDepth!
    // ------------------------------------------------------------
    const visibleList = this.collectVisibleEntities(world, frustum, isParallel, fwdX, fwdY, fwdZ);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT); // Render BACK faces of OBB so camera can fly INSIDE volumetric clouds!
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const batchRes = this.drawEntityBatches(
      world, cw, ch, viewProj, invViewProj, sunDir, isParallel, isTransparent, isSolid,
      styleInt, effectiveMode, splitX, leftMode, rightMode, debugOverlayToInt(doc.debugOverlay), 1.0,
    );
    drawCalls += batchRes.drawCalls;
    const hasOutlinedEntity = batchRes.hasOutlinedEntity;

    // ------------------------------------------------------------
    // PASS 2: Depth-Tested 3D Contrail Ribbons & Thruster Plumes
    // ------------------------------------------------------------
    if (doc.ribbons.length > 0) {
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const rp = this.progs.ribbon;
      gl.useProgram(rp.program);
      gl.bindVertexArray(this.ribbonVao);
      gl.uniformMatrix4fv(rp.u.uViewProj, false, viewProj);

      for (const rib of doc.ribbons) {
        const pts = rib.points;
        if (pts.length < 2) continue;
        let vCount = 0;
        const maxPts = Math.min(pts.length, 900);
        for (let i = 0; i < maxPts; i++) {
          const p = pts[i];
          const prev = pts[Math.max(0, i - 1)].pos;
          const next = pts[Math.min(maxPts - 1, i + 1)].pos;
          const tang = vec3Norm(vec3Sub(next, prev));
          const toCam = vec3Norm(vec3Sub(cam.pos, p.pos));
          const side = vec3Norm(vec3Cross(tang, toCam));
          const hw = p.width * 0.5 * (1.0 - p.age * 0.55);

          const base = vCount * 5;
          this.ribbonBuf[base + 0] = p.pos[0] - side[0] * hw;
          this.ribbonBuf[base + 1] = p.pos[1] - side[1] * hw;
          this.ribbonBuf[base + 2] = p.pos[2] - side[2] * hw;
          this.ribbonBuf[base + 3] = p.age;
          this.ribbonBuf[base + 4] = -1.0;

          this.ribbonBuf[base + 5] = p.pos[0] + side[0] * hw;
          this.ribbonBuf[base + 6] = p.pos[1] + side[1] * hw;
          this.ribbonBuf[base + 7] = p.pos[2] + side[2] * hw;
          this.ribbonBuf[base + 8] = p.age;
          this.ribbonBuf[base + 9] = 1.0;
          vCount += 2;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.ribbonBuf.subarray(0, vCount * 5));
        gl.uniform3f(rp.u.uColor, rib.color[0] / 255, rib.color[1] / 255, rib.color[2] / 255);
        gl.uniform1f(rp.u.uAlpha, rib.alpha);
        gl.uniform1f(rp.u.uEmissive, rib.emissive ? 1.0 : 0.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, vCount);
        drawCalls++;
      }
      gl.depthMask(true);
    }

    // ------------------------------------------------------------
    // PASS 3: Object-ID-Aware 2D JFA SDF Outlines + Bloom Composite
    // ------------------------------------------------------------
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVao);

    const rawOutlinePx = doc.lighting.outlineWidth * Math.max(1.2, Math.min(3.5, Math.min(cw, ch) / 260));
    const outlinePx = hasOutlinedEntity ? rawOutlinePx : 0.0;
    let finalSeed = this.fbo.seedA!;
    if (outlinePx > 0.15) {
      const jw = this.fbo.jfaW;
      const jh = this.fbo.jfaH;
      gl.viewport(0, 0, jw, jh);
      const ji = this.progs.jfaInit;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.jfaA);
      gl.useProgram(ji.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbo.aux);
      gl.uniform2f(ji.u.uResolution, jw, jh);
      gl.uniform1f(ji.u.uJfaScale, this.jfaScale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;

      let step = 1;
      const maxRad = Math.ceil(outlinePx * this.jfaScale) + 2;
      while (step * 2 < maxRad) step *= 2;
      const js = this.progs.jfaStep;
      gl.useProgram(js.program);
      gl.uniform2f(js.u.uResolution, jw, jh);

      let readTex = this.fbo.seedA!;
      let writeFbo = this.fbo.jfaB!;
      let writeTex = this.fbo.seedB!;
      for (let s = step; s >= 1; s >>= 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1f(js.u.uStep, s);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        drawCalls++;
        finalSeed = writeTex;
        if (writeFbo === this.fbo.jfaB) {
          readTex = this.fbo.seedB!; writeFbo = this.fbo.jfaA!; writeTex = this.fbo.seedA!;
        } else {
          readTex = this.fbo.seedA!; writeFbo = this.fbo.jfaB!; writeTex = this.fbo.seedB!;
        }
      }
      gl.viewport(0, 0, cw, ch);
    }

    const cp = this.progs.comp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(cp.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbo.color);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fbo.aux);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, finalSeed);
    gl.uniform2f(cp.u.uResolution, cw, ch);
    gl.uniform1f(cp.u.uOutlinePx, outlinePx);
    const nightW = Math.max(0, (doc.lighting.timeOfDay - 0.48) / 0.52);
    gl.uniform3f(cp.u.uOutlineSrgb, 0.08 * (1 - nightW * 0.6), 0.10 * (1 - nightW * 0.6), 0.14 * (1 - nightW * 0.4));
    gl.uniform1f(cp.u.uBloomStrength, 0.75 + nightW * 0.85);
    gl.uniform1i(cp.u.uStyle, styleInt);
    gl.uniform1i(cp.u.uTransparent, isTransparent ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;

    if (curGpuQuery && this.timerExt) {
      gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
      this.activeTimerQueries.push(curGpuQuery);
    }

    // Adaptive GPU & Thermal Performance Governor (watches real gpuMs when available + CPU time!)
    const dtMs = performance.now() - t0;
    this.rollingMs = this.rollingMs * 0.88 + dtMs * 0.12;
    const workloadMs = Math.max(this.rollingMs, this.rollingGpuMs ?? 0);
    if (this.adaptiveDpr) {
      const hiBudget = this.isMobile ? 14.0 : 12.5;
      const loBudget = this.isMobile ? 7.5 : 6.0;
      const minDrs = this.isMobile ? 0.68 : 0.75;
      if (workloadMs > hiBudget && this.drsScale > minDrs) {
        this.drsScale = Math.max(minDrs, this.drsScale - 0.02);
      } else if (workloadMs < loBudget && this.drsScale < 1.0) {
        this.drsScale = Math.min(1.0, this.drsScale + 0.01);
      }
    }

    this.lastDrawCalls = drawCalls;
    this.lastVisible = visibleList.length;
    this.lastTotal = doc.entities.length;
    this.lastTick = doc.tick;
    this.lastTime = doc.time;
  }

  /** First-class introspection telemetry for profiler HUD & AI agents. */
  getStats(): EngineTelemetry {
    return {
      fps: Math.min(120, Math.round(1000 / Math.max(this.rollingCadenceMs, 4.0))),
      frameMs: Number(this.rollingMs.toFixed(2)),
      ...(this.rollingGpuMs !== undefined ? { gpuMs: Number(this.rollingGpuMs.toFixed(2)) } : {}),
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      dpr: Number(this.lastDpr.toFixed(2)),
      drsScale: Number(this.drsScale.toFixed(2)),
      drawCalls: this.lastDrawCalls,
      visibleEntities: this.lastVisible,
      totalEntities: this.lastTotal,
      isMobile: this.isMobile,
      backend: this.ready ? "webgl2" : "none",
      quality: this.aaQuality,
      activeSamples: this.lastSamples,
      tick: this.lastTick,
      time: Number(this.lastTime.toFixed(3)),
    };
  }

  /** Measure exact per-pixel written and covered overdraw via an additive GPU count pass. */
  measureOverdraw(world: SceneWorld): OverdrawReport {
    if (!this.ready || !this.gl) {
      return {
        writtenAvg: 0, writtenMax: 0, coveredAvg: 0, coveredMax: 0,
        drawCalls: 0, visibleEntities: 0, pixels: 0, exact: false,
      };
    }
    const gl = this.gl;
    const doc = world.doc;
    this.resizeToDisplay();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.ensureFBOs(cw, ch);

    const aspect = cw / Math.max(ch, 1);
    const cam = doc.camera;
    const isParallel = cam.mode === "ortho" || cam.mode === "oblique";
    const viewProj = computeCameraViewProj(cam, aspect, this.viewMat, this.projMat, this.viewProjMat);
    const invViewProj = mat4Invert(viewProj, this.invViewProjMat);
    const frustum = extractFrustumPlanes(viewProj, this.frustumPlanes);

    const fxRaw = cam.target[0] - cam.pos[0];
    const fyRaw = cam.target[1] - cam.pos[1];
    const fzRaw = cam.target[2] - cam.pos[2];
    const fInv = 1 / (Math.hypot(fxRaw, fyRaw, fzRaw) || 1);
    const fwdX = fxRaw * fInv;
    const fwdY = fyRaw * fInv;
    const fwdZ = fzRaw * fInv;

    const az = (doc.lighting.sunAzimuthDeg * Math.PI) / 180;
    const el = (doc.lighting.sunElevationDeg * Math.PI) / 180;
    const sunDir = this.sunDirBuf;
    sunDir[0] = Math.cos(az) * Math.cos(el);
    sunDir[1] = Math.sin(el);
    sunDir[2] = Math.sin(az) * Math.cos(el);

    const styleInt = styleToInt(doc.style ?? "arcade-8bit");
    const effectiveMode = defaultAAModeForStyle(doc.style ?? "arcade-8bit", doc.aaMode);
    const splitX = doc.splitCompare.enabled ? doc.splitCompare.splitX : -1.0;
    const leftMode = doc.splitCompare.enabled ? doc.splitCompare.leftMode : effectiveMode;
    const rightMode = doc.splitCompare.enabled ? doc.splitCompare.rightMode : effectiveMode;

    const visibleList = this.collectVisibleEntities(world, frustum, isParallel, fwdX, fwdY, fwdZ);
    const od = this.runOverdrawPass(
      world, cw, ch, viewProj, invViewProj, sunDir, isParallel,
      this.background === "transparent", this.background === "solid",
      styleInt, effectiveMode, splitX, leftMode, rightMode,
    );

    const pixels = cw * ch;
    let wSum = 0;
    let wMax = 0;
    let cSum = 0;
    let cMax = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, od.fbo);
    if (od.exact) {
      const buf = new Float32Array(pixels * 4);
      gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.FLOAT, buf);
      for (let i = 0; i < buf.length; i += 4) {
        const wv = buf[i];
        const cv = buf[i + 1];
        wSum += wv;
        if (wv > wMax) wMax = wv;
        cSum += cv;
        if (cv > cMax) cMax = cv;
      }
    } else {
      const buf = new Uint8Array(pixels * 4);
      gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      for (let i = 0; i < buf.length; i += 4) {
        const wv = buf[i];
        const cv = buf[i + 1];
        wSum += wv;
        if (wv > wMax) wMax = wv;
        cSum += cv;
        if (cv > cMax) cMax = cv;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
      writtenAvg: Number((wSum / Math.max(pixels, 1)).toFixed(3)),
      writtenMax: Math.round(wMax),
      coveredAvg: Number((cSum / Math.max(pixels, 1)).toFixed(3)),
      coveredMax: Math.round(cMax),
      drawCalls: od.drawCalls,
      visibleEntities: visibleList.length,
      pixels,
      exact: od.exact,
    };
  }

  /** Deterministic frame capture for closed-loop visual QA & MCP screenshots. */
  captureDataUrl(world: SceneWorld, mimeType: "image/png" | "image/webp" = "image/png"): string {
    this.render(world);
    return this.canvas.toDataURL(mimeType);
  }
}
