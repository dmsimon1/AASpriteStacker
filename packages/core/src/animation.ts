/**
 * Multi-frame Sprite-Stack Animation Controller & Animated Slice-Grid Loaders.
 * Drives frame-by-frame volumetric sprite-stack animations (walk cycles, spinning props,
 * engine pulses, explosions) with zero per-frame allocations by swapping registered VolumeAsset IDs.
 */

import { loadSliceStripPixels } from "./loaders.js";
import type { SceneWorld } from "./scene.js";
import type { SocketDef, Vec3, VolumeAsset } from "./types.js";

export interface SpriteStackClip {
  id: string;
  frames: VolumeAsset[];
  fps: number;
  loop: boolean;
  pingPong: boolean;
}

export interface CreateClipOptions {
  id: string;
  frames: VolumeAsset[];
  fps?: number;
  loop?: boolean;
  pingPong?: boolean;
}

/** Create a reusable multi-frame sprite-stack animation clip. */
export function createSpriteStackClip(opts: CreateClipOptions): SpriteStackClip {
  if (!opts.frames.length) {
    throw new Error(`SpriteStackClip "${opts.id}" requires at least 1 VolumeAsset frame.`);
  }
  return {
    id: opts.id,
    frames: opts.frames,
    fps: Math.max(0.1, opts.fps ?? 10),
    loop: opts.loop ?? true,
    pingPong: opts.pingPong ?? false,
  };
}

export interface AnimatedStripGridOptions {
  id: string;
  /** Number of horizontal voxel slices per animation frame (width = W * slices). */
  slices: number;
  /** Number of stacked rows (animation frames) in the grid image (height = L * frames). */
  frames: number;
  fps?: number;
  loop?: boolean;
  pingPong?: boolean;
  voxelScale?: number;
  pivot?: Vec3;
  computeSdf?: boolean;
  sockets?: Record<string, SocketDef>;
}

/**
 * Compile an animated sprite-stack strip grid (horizontal columns = slices, vertical rows = frames)
 * into a ready-to-play SpriteStackClip. Compatible with Aseprite & SpriteStack animation sheets.
 */
export function loadAnimatedStripGridPixels(
  gridRgba: Uint8Array | Uint8ClampedArray,
  gridWidth: number,
  gridHeight: number,
  opts: AnimatedStripGridOptions,
): SpriteStackClip {
  const numFrames = opts.frames;
  if (numFrames < 1 || gridHeight % numFrames !== 0) {
    throw new Error(`Grid height ${gridHeight} is not evenly divisible by frames=${numFrames}`);
  }
  const frameH = gridHeight / numFrames;
  const rowBytes = gridWidth * 4;
  const frameBytes = frameH * rowBytes;
  const frames: VolumeAsset[] = [];

  for (let f = 0; f < numFrames; f++) {
    const sliceBuf = gridRgba.subarray(f * frameBytes, (f + 1) * frameBytes);
    frames.push(
      loadSliceStripPixels(sliceBuf, gridWidth, frameH, {
        id: `${opts.id}#f${f}`,
        name: `${opts.id} [frame ${f}]`,
        slices: opts.slices,
        voxelScale: opts.voxelScale,
        pivot: opts.pivot,
        computeSdf: opts.computeSdf,
        sockets: opts.sockets,
      }),
    );
  }

  return createSpriteStackClip({
    id: opts.id,
    frames,
    fps: opts.fps,
    loop: opts.loop,
    pingPong: opts.pingPong,
  });
}

/** Browser drop-in loader: fetch an animated strip-grid PNG URL into a SpriteStackClip. */
export async function loadAnimatedStripGridUrl(
  url: string,
  opts: AnimatedStripGridOptions,
): Promise<SpriteStackClip> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load animated strip grid from "${url}".`));
    el.src = url;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 1 || h < 1) {
    throw new Error(`Animated strip grid "${opts.id}" has empty dimensions (${w}x${h}).`);
  }
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable for loadAnimatedStripGridUrl.");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  return loadAnimatedStripGridPixels(data, w, h, opts);
}

interface EntityTrack {
  clipId: string;
  time: number;
  speed: number;
  playing: boolean;
  frameIndex: number;
}

/** Deterministic, zero-GC frame animator that swaps registered VolumeAsset IDs on SceneWorld entities. */
export class SpriteStackAnimator {
  private clips = new Map<string, SpriteStackClip>();
  private tracks = new Map<string, EntityTrack>();

  /** Register a clip and upload/register all its frame VolumeAssets on the target SceneWorld. */
  registerClip(world: SceneWorld, clip: SpriteStackClip): void {
    this.clips.set(clip.id, clip);
    for (const frame of clip.frames) {
      world.registerAsset(frame);
    }
  }

  /** Bind an entity to a registered clip so `update(world, dt)` drives its frame assetId automatically. */
  bindEntity(
    entityId: string,
    clipId: string,
    opts: { speed?: number; phase?: number; playing?: boolean } = {},
  ): void {
    this.tracks.set(entityId, {
      clipId,
      time: opts.phase ?? 0,
      speed: opts.speed ?? 1,
      playing: opts.playing ?? true,
      frameIndex: 0,
    });
  }

  unbindEntity(entityId: string): void {
    this.tracks.delete(entityId);
  }

  setClip(entityId: string, clipId: string, resetTime = true): void {
    const tr = this.tracks.get(entityId);
    if (!tr) {
      this.bindEntity(entityId, clipId);
      return;
    }
    tr.clipId = clipId;
    if (resetTime) {
      tr.time = 0;
      tr.frameIndex = 0;
    }
  }

  play(entityId: string): void {
    const tr = this.tracks.get(entityId);
    if (tr) tr.playing = true;
  }

  pause(entityId: string): void {
    const tr = this.tracks.get(entityId);
    if (tr) tr.playing = false;
  }

  setFrame(world: SceneWorld, entityId: string, frameIndex: number): void {
    const tr = this.tracks.get(entityId);
    if (!tr) return;
    const clip = this.clips.get(tr.clipId);
    if (!clip) return;
    const n = clip.frames.length;
    const clamped = Math.max(0, Math.min(n - 1, Math.floor(frameIndex)));
    tr.frameIndex = clamped;
    tr.time = clamped / clip.fps;
    const ent = world.getEntity(entityId);
    if (ent) ent.assetId = clip.frames[clamped].id;
  }

  getFrameIndex(entityId: string): number {
    return this.tracks.get(entityId)?.frameIndex ?? 0;
  }

  /** Advance all active animation tracks by `dt` seconds and sync `entity.assetId`. */
  update(world: SceneWorld, dt: number): void {
    for (const [entityId, tr] of this.tracks.entries()) {
      const clip = this.clips.get(tr.clipId);
      if (!clip) continue;
      const n = clip.frames.length;
      if (tr.playing) tr.time += dt * tr.speed;

      let idx = 0;
      if (n > 1) {
        const raw = Math.floor(tr.time * clip.fps);
        if (clip.pingPong) {
          const span = (n - 1) * 2;
          const m = clip.loop ? ((raw % span) + span) % span : Math.max(0, Math.min(span, raw));
          idx = m < n ? m : span - m;
        } else if (clip.loop) {
          idx = ((raw % n) + n) % n;
        } else {
          idx = Math.max(0, Math.min(n - 1, raw));
        }
      }
      tr.frameIndex = idx;
      const ent = world.getEntity(entityId);
      if (ent) ent.assetId = clip.frames[idx].id;
    }
  }
}
