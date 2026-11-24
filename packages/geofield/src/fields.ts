/**
 * Blender Geometry Nodes-inspired Functional Fields (Field<T>).
 * Lazy, deterministic, sin-free 3D noise & spatial masking functions evaluated across
 * volume grids, continuous SDF surfaces, splines, and scattered instances.
 */

export type Field<T> = (x: number, y: number, z: number, t?: number) => T;

export function fract(x: number): number {
  return x - Math.floor(x);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sin-free Dave Hoskins 3D hash: deterministic across JS and WebGL2 GPUs. */
export function hash31(px: number, py: number, pz: number): number {
  let x = fract(px * 0.1031);
  let y = fract(py * 0.1031);
  let z = fract(pz * 0.1031);
  const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32);
  x += d;
  y += d;
  z += d;
  return fract((x + y) * z);
}

/** Smooth continuous 3D value noise in [0, 1]. */
export function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash31(ix, iy, iz);
  const n100 = hash31(ix + 1, iy, iz);
  const n010 = hash31(ix, iy + 1, iz);
  const n110 = hash31(ix + 1, iy + 1, iz);
  const n001 = hash31(ix, iy, iz + 1);
  const n101 = hash31(ix + 1, iy, iz + 1);
  const n011 = hash31(ix, iy + 1, iz + 1);
  const n111 = hash31(ix + 1, iy + 1, iz + 1);

  const x00 = n000 + (n100 - n000) * ux;
  const x10 = n010 + (n110 - n010) * ux;
  const x01 = n001 + (n101 - n001) * ux;
  const x11 = n011 + (n111 - n011) * ux;

  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** Multi-octave fractal Brownian motion in [-1, 1]. */
export function fbm3(x: number, y: number, z: number, octaves = 3, lacunarity = 2.04, gain = 0.5): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (vnoise3(x * freq, y * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Ridged multifractal noise in [0, 1] for eroded basalt cliffs, rocky ridges, and gnarled bark. */
export function ridge3(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(vnoise3(x * freq, y * freq, z * freq) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    freq *= 2.08;
    amp *= 0.48;
  }
  return norm > 0 ? sum / norm : 0;
}

/** 3D cellular Voronoi distance (F1 in ~[0, 1.2]) for irregular stonework, coral, cracks, and crystals. */
export function voronoi3(x: number, y: number, z: number): { f1: number; cellId: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  let minD2 = 9.0;
  let bestId = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const ox = dx + hash31(cx + 1.1, cy + 2.3, cz + 3.7) - fx;
        const oy = dy + hash31(cx + 5.3, cy + 7.1, cz + 11.9) - fy;
        const oz = dz + hash31(cx + 13.7, cy + 17.3, cz + 19.1) - fz;
        const d2 = ox * ox + oy * oy + oz * oz;
        if (d2 < minD2) {
          minD2 = d2;
          bestId = hash31(cx * 3.1, cy * 5.7, cz * 7.3);
        }
      }
    }
  }
  return { f1: Math.sqrt(minD2), cellId: bestId };
}

// Composable Geometry-Node-style Field Constructors
export function fieldConst(v: number): Field<number> {
  return () => v;
}

export function fieldFbm(scale: number, octaves = 3, seed = 0): Field<number> {
  const ox = seed * 17.31;
  const oy = seed * 31.17;
  const oz = seed * 11.73;
  return (x, y, z) => fbm3(x * scale + ox, y * scale + oy, z * scale + oz, octaves);
}

export function fieldRidge(scale: number, octaves = 3, seed = 0): Field<number> {
  const ox = seed * 19.13;
  const oy = seed * 29.41;
  const oz = seed * 7.89;
  return (x, y, z) => ridge3(x * scale + ox, y * scale + oy, z * scale + oz, octaves);
}

export function fieldMapRange(
  src: Field<number>,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  clampOut = true,
): Field<number> {
  const span = inMax - inMin || 1e-6;
  return (x, y, z, t) => {
    let u = (src(x, y, z, t) - inMin) / span;
    if (clampOut) u = Math.max(0, Math.min(1, u));
    return outMin + (outMax - outMin) * u;
  };
}

export function fieldHeight(zMin: number, zMax: number): Field<number> {
  return (_x, _y, z) => smoothstep(zMin, zMax, z);
}

export function fieldRadial(cx: number, cy: number, rInner: number, rOuter: number): Field<number> {
  return (x, y) => smoothstep(rInner, rOuter, Math.hypot(x - cx, y - cy));
}
