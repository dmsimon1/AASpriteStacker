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

import {
  mat4Invert,
  mat4LookAt,
  mat4Mul,
  mat4Ortho,
  mat4Perspective,
  vec3Cross,
  vec3Len,
  vec3Norm,
  vec3Sub,
} from "./math.js";
import type { SceneWorld } from "./scene.js";
import {
  COMPOSITE_FS,
  ENTITY_OBB_FS,
  ENTITY_OBB_VS,
  FULLSCREEN_VS,
  JFA_INIT_FS,
  JFA_STEP_FS,
  RIBBON_FS,
  RIBBON_VS,
  TERRAIN_FS,
} from "./shaders.js";
import type { AAMode, EngineTelemetry, QualityTier, RenderStyle, Vec3, VolumeAsset } from "./types.js";

export interface RendererOptions {
  quality?: QualityTier;
  adaptiveDpr?: boolean;
  maxDpr?: number;
  preserveDrawingBuffer?: boolean;
}

interface CompiledProg {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

interface GpuAssetTex {
  hash: string;
  albedo: WebGLTexture;
  sdf: WebGLTexture;
  norm: WebGLTexture;
  emis: WebGLTexture;
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

export class AASpriteRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly isMobile: boolean;
  private gl: WebGL2RenderingContext | null = null;
  private ready = false;
  private quality: QualityTier;
  private adaptiveDpr: boolean;
  private maxDpr: number;
  private drsScale = 1.0;

  private progs!: {
    terrain: CompiledProg;
    entity: CompiledProg;
    ribbon: CompiledProg;
    jfaInit: CompiledProg;
    jfaStep: CompiledProg;
    comp: CompiledProg;
  };

  private emptyVao: WebGLVertexArrayObject | null = null;
  private cubeVao: WebGLVertexArrayObject | null = null;
  private ribbonVao: WebGLVertexArrayObject | null = null;
  private ribbonVbo: WebGLBuffer | null = null;
  private ribbonBuf = new Float32Array(2048 * 5);

  private assetCache = new Map<string, GpuAssetTex>();
  private fbo = {
    w: 0, h: 0,
    scene: null as WebGLFramebuffer | null,
    color: null as WebGLTexture | null,
    aux: null as WebGLTexture | null,
    depth: null as WebGLRenderbuffer | null,
    jfaA: null as WebGLFramebuffer | null,
    jfaB: null as WebGLFramebuffer | null,
    seedA: null as WebGLTexture | null,
    seedB: null as WebGLTexture | null,
  };

  private rollingMs = 8.0;
  private lastDrawCalls = 0;
  private lastVisible = 0;
  private lastTotal = 0;
  private lastDpr = 1;
  private lastSamples = 4;
  private lastTick = 0;
  private lastTime = 0;
  private shadowBuf = new Float32Array(28 * 4);

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.quality = opts.quality ?? "auto";
    this.adaptiveDpr = opts.adaptiveDpr ?? true;
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const narrow = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 760;
    this.isMobile = this.quality === "mobile" || (this.quality === "auto" && Boolean(coarse || narrow));
    this.maxDpr = opts.maxDpr ?? (this.isMobile ? 1.5 : 2.0);
    this.initGL(opts.preserveDrawingBuffer ?? true);
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

  private initGL(preserveDrawingBuffer: boolean): void {
    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: this.isMobile ? "default" : "high-performance",
      preserveDrawingBuffer,
    });
    if (!gl) return;
    this.gl = gl;

    this.progs = {
      terrain: this.link(gl, FULLSCREEN_VS, TERRAIN_FS),
      entity: this.link(gl, ENTITY_OBB_VS, ENTITY_OBB_FS),
      ribbon: this.link(gl, RIBBON_VS, RIBBON_FS),
      jfaInit: this.link(gl, FULLSCREEN_VS, JFA_INIT_FS),
      jfaStep: this.link(gl, FULLSCREEN_VS, JFA_STEP_FS),
      comp: this.link(gl, FULLSCREEN_VS, COMPOSITE_FS),
    };

    this.emptyVao = gl.createVertexArray();

    // Unit OBB cube VAO
    this.cubeVao = gl.createVertexArray();
    gl.bindVertexArray(this.cubeVao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_CUBE_VERTS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, UNIT_CUBE_INDICES, gl.STATIC_DRAW);

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
    if (f.w === w && f.h === h && f.scene) return;

    for (const tex of [f.color, f.aux, f.seedA, f.seedB]) if (tex) gl.deleteTexture(tex);
    if (f.depth) gl.deleteRenderbuffer(f.depth);
    for (const fb of [f.scene, f.jfaA, f.jfaB]) if (fb) gl.deleteFramebuffer(fb);

    f.w = w; f.h = h;
    f.color = this.create2DTex(gl, w, h);
    f.aux = this.create2DTex(gl, w, h);
    f.seedA = this.create2DTex(gl, w, h);
    f.seedB = this.create2DTex(gl, w, h);

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

  private ensureAssetGPU(asset: VolumeAsset): GpuAssetTex {
    const gl = this.gl!;
    const existing = this.assetCache.get(asset.id);
    if (existing && existing.hash === asset.hash) return existing;
    if (existing) {
      gl.deleteTexture(existing.albedo);
      gl.deleteTexture(existing.sdf);
      gl.deleteTexture(existing.norm);
      gl.deleteTexture(existing.emis);
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const make3D = (intFmt: number, fmt: number, data: Uint8Array, filter: number): WebGLTexture => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texImage3D(gl.TEXTURE_3D, 0, intFmt, asset.w, asset.l, asset.h, 0, fmt, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      return t;
    };

    const entry: GpuAssetTex = {
      hash: asset.hash,
      albedo: make3D(gl.RGBA8, gl.RGBA, asset.rgba, gl.LINEAR),
      sdf: make3D(gl.R8, gl.RED, asset.sdfU8, gl.LINEAR),
      norm: make3D(gl.RGBA8, gl.RGBA, asset.normAo, gl.LINEAR),
      emis: make3D(gl.R8, gl.RED, asset.emisU8, gl.NEAREST),
    };
    this.assetCache.set(asset.id, entry);
    return entry;
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
    const gl = this.gl;
    const doc = world.doc;

    this.resizeToDisplay();
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.ensureFBOs(cw, ch);

    const aspect = cw / Math.max(ch, 1);
    const cam = doc.camera;
    const view = mat4LookAt(cam.pos, cam.target, cam.up);
    const proj =
      cam.mode === "ortho"
        ? mat4Ortho(cam.orthoSize, aspect, cam.near, cam.far)
        : mat4Perspective((cam.fovDeg * Math.PI) / 180, aspect, cam.near, cam.far);
    const viewProj = mat4Mul(proj, view);
    const invViewProj = mat4Invert(viewProj);

    // World sun direction
    const az = (doc.lighting.sunAzimuthDeg * Math.PI) / 180;
    const el = (doc.lighting.sunElevationDeg * Math.PI) / 180;
    const sunDir: Vec3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];

    // Collect shadow casters (clouds + hero aircraft) for ground projection
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

    let drawCalls = 0;
    gl.viewport(0, 0, cw, ch);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.scene);
    gl.clearDepth(1.0);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // ------------------------------------------------------------
    // PASS 0: Perspective/Overhead Voxel-Space Terrain, Ocean & Sky
    // ------------------------------------------------------------
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

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
    gl.uniform1i(tp.u.uTerrainEnabled, doc.terrain.enabled ? 1 : 0);
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;

    // ------------------------------------------------------------
    // PASS 1: 6-DOF Anti-Aliased Sprite-Stacked Entities (OBB Proxies)
    // Back-to-front sorted for silky premultiplied silhouette edges,
    // with hardware LEQUAL depth test against terrain & exact gl_FragDepth!
    // ------------------------------------------------------------
    const visibleList: Array<{ ent: typeof doc.entities[number]; asset: VolumeAsset; dist: number; idx: number }> = [];
    for (let i = 0; i < doc.entities.length; i++) {
      const ent = doc.entities[i];
      if (ent.visible === false) continue;
      const asset = world.getAsset(ent.assetId);
      if (!asset) continue;
      const d = vec3Len(vec3Sub(ent.pos, cam.pos));
      if (d > cam.far * 1.15) continue;
      visibleList.push({ ent, asset, dist: d, idx: i + 1 });
    }
    visibleList.sort((a, b) => b.dist - a.dist); // back-to-front

    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT); // Render BACK faces of OBB so camera can fly INSIDE volumetric clouds!
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const ep = this.progs.entity;
    gl.useProgram(ep.program);
    gl.bindVertexArray(this.cubeVao);
    gl.uniform2f(ep.u.uResolution, cw, ch);
    gl.uniformMatrix4fv(ep.u.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(ep.u.uInvViewProj, false, invViewProj);
    gl.uniform1f(ep.u.uSplitX, splitX);
    gl.uniform1i(ep.u.uStyle, styleInt);
    gl.uniform1i(ep.u.uShadeStyle, shadeStyleToInt(doc.lighting.shadeStyle));
    gl.uniform3fv(ep.u.uSunDir, sunDir);
    gl.uniform1f(ep.u.uTimeOfDay, doc.lighting.timeOfDay);
    gl.uniform1f(ep.u.uFogDensity, doc.lighting.fogDensity);
    gl.uniform1i(ep.u.uDebugOverlay, debugOverlayToInt(doc.debugOverlay));

    const maxSamples = this.isMobile ? Math.min(doc.samples, 4) : doc.samples;
    this.lastSamples = maxSamples;

    for (const item of visibleList) {
      const { ent, asset, dist, idx } = item;
      const v2w = world.getVoxelToWorldMatrix(ent);
      if (!v2w) continue;
      const w2v = mat4Invert(v2w);
      const gpuTex = this.ensureAssetGPU(asset);

      // Extract orthonormal 3x3 normal matrix from VoxelToWorld
      const sx = Math.hypot(v2w[0], v2w[1], v2w[2]) || 1;
      const sy = Math.hypot(v2w[4], v2w[5], v2w[6]) || 1;
      const sz = Math.hypot(v2w[8], v2w[9], v2w[10]) || 1;
      const normMat = new Float32Array([
        v2w[0] / sx, v2w[1] / sx, v2w[2] / sx,
        v2w[4] / sy, v2w[5] / sy, v2w[6] / sy,
        v2w[8] / sz, v2w[9] / sz, v2w[10] / sz,
      ]);

      // Transform sun direction into entity's local voxel coordinates
      const sunLocal = vec3Norm([
        w2v[0] * sunDir[0] + w2v[4] * sunDir[1] + w2v[8] * sunDir[2],
        w2v[1] * sunDir[0] + w2v[5] * sunDir[1] + w2v[9] * sunDir[2],
        w2v[2] * sunDir[0] + w2v[6] * sunDir[1] + w2v[10] * sunDir[2],
      ]);

      // Distance-adaptive RGSS LOD (keeps mobile at 60fps while keeping hero crisp at 4x/8x!)
      const isHero = ent.tag === "player" || dist < 48;
      const entSamples = isHero ? maxSamples : dist < 120 ? Math.min(maxSamples, 4) : 1;

      const mA = aaModeToInt(doc.splitCompare.enabled ? leftMode : ent.aaMode ?? effectiveMode);
      const mB = aaModeToInt(doc.splitCompare.enabled ? rightMode : ent.aaMode ?? effectiveMode);

      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, gpuTex.albedo); gl.uniform1i(ep.u.uAlbedoTex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, gpuTex.sdf);    gl.uniform1i(ep.u.uSdfTex, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, gpuTex.norm);   gl.uniform1i(ep.u.uNormalTex, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, gpuTex.emis);   gl.uniform1i(ep.u.uEmisTex, 3);

      gl.uniformMatrix4fv(ep.u.uVoxelToWorld, false, v2w);
      gl.uniformMatrix4fv(ep.u.uWorldToVoxel, false, w2v);
      gl.uniformMatrix3fv(ep.u.uNormalMat, false, normMat);
      gl.uniform3f(ep.u.uVolSize, asset.w, asset.l, asset.h);
      gl.uniform1f(ep.u.uSdfRange, asset.sdfRange);
      gl.uniform1i(ep.u.uModeA, mA);
      gl.uniform1i(ep.u.uModeB, mB);
      gl.uniform1i(ep.u.uSamples, entSamples);
      gl.uniform1i(ep.u.uSelfShadow, doc.lighting.selfShadow && isHero ? 1 : 0);
      gl.uniform1i(ep.u.uOutlineEnabled, ent.outline === false ? 0 : 1);
      gl.uniform1f(ep.u.uObjectIdNorm, ((idx % 250) + 1) / 255.0);
      gl.uniform1f(ep.u.uEmissiveBoost, ent.emissiveBoost ?? 1.0);
      gl.uniform3fv(ep.u.uSunLocal, sunLocal);

      gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
      drawCalls++;
    }

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

    const outlinePx = doc.lighting.outlineWidth * Math.max(1.2, Math.min(3.5, Math.min(cw, ch) / 260));
    let finalSeed = this.fbo.seedA!;
    if (outlinePx > 0.15) {
      const ji = this.progs.jfaInit;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.jfaA);
      gl.useProgram(ji.program);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbo.aux); gl.uniform1i(ji.u.uAuxTex, 0);
      gl.uniform2f(ji.u.uResolution, cw, ch);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawCalls++;

      let step = 1;
      const maxRad = Math.ceil(outlinePx) + 2;
      while (step * 2 < maxRad) step *= 2;
      const js = this.progs.jfaStep;
      gl.useProgram(js.program);
      gl.uniform2f(js.u.uResolution, cw, ch);

      let readTex = this.fbo.seedA!;
      let writeFbo = this.fbo.jfaB!;
      let writeTex = this.fbo.seedB!;
      for (let s = step; s >= 1; s >>= 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, readTex); gl.uniform1i(js.u.uSeedTex, 0);
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
    }

    const cp = this.progs.comp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(cp.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbo.color); gl.uniform1i(cp.u.uColorTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fbo.aux);   gl.uniform1i(cp.u.uAuxTex, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, finalSeed);      gl.uniform1i(cp.u.uSeedTex, 2);
    gl.uniform2f(cp.u.uResolution, cw, ch);
    gl.uniform1f(cp.u.uOutlinePx, outlinePx);
    const nightW = Math.max(0, (doc.lighting.timeOfDay - 0.48) / 0.52);
    gl.uniform3f(cp.u.uOutlineSrgb, 0.08 * (1 - nightW * 0.6), 0.10 * (1 - nightW * 0.6), 0.14 * (1 - nightW * 0.4));
    gl.uniform1f(cp.u.uBloomStrength, 0.75 + nightW * 0.85);
    gl.uniform1i(cp.u.uStyle, styleInt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawCalls++;

    // Adaptive Mobile Performance Governor (keeps locked 60fps on constrained mobile GPUs)
    const dtMs = performance.now() - t0;
    this.rollingMs = this.rollingMs * 0.88 + dtMs * 0.12;
    if (this.adaptiveDpr && this.isMobile) {
      if (this.rollingMs > 15.5 && this.drsScale > 0.68) {
        this.drsScale = Math.max(0.68, this.drsScale - 0.02);
      } else if (this.rollingMs < 8.5 && this.drsScale < 1.0) {
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
      fps: Math.min(120, Math.round(1000 / Math.max(this.rollingMs, 0.5))),
      frameMs: Number(this.rollingMs.toFixed(2)),
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      dpr: Number(this.lastDpr.toFixed(2)),
      drsScale: Number(this.drsScale.toFixed(2)),
      drawCalls: this.lastDrawCalls,
      visibleEntities: this.lastVisible,
      totalEntities: this.lastTotal,
      isMobile: this.isMobile,
      backend: this.ready ? "webgl2" : "none",
      activeSamples: this.lastSamples,
      tick: this.lastTick,
      time: Number(this.lastTime.toFixed(3)),
    };
  }

  /** Deterministic frame capture for closed-loop visual QA & MCP screenshots. */
  captureDataUrl(world: SceneWorld, mimeType: "image/png" | "image/webp" = "image/png"): string {
    this.render(world);
    return this.canvas.toDataURL(mimeType);
  }
}
