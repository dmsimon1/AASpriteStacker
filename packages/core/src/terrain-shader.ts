/**
 * Optional, tree-shakeable procedural island archipelago, ocean, and sky backdrop shader (`@aastack/core/terrain`).
 * Pure 2.5D transparent/solid/studio apps do not import this module, keeping bundles compact (~16-20 KB gz).
 */

export const TERRAIN_FS = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform mat4 uViewProj;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTimeOfDay;
uniform float uFogDensity;

uniform int uStyle;        // 0=arcade-8bit, 1=hd-2d, 2=smooth-toy, 3=retro-raw
uniform int uTerrainEnabled;
uniform float uSeed;
uniform float uMaxHeight;
uniform float uTerrainScale;
uniform float uWaveTime;
uniform float uTerraceSteps;
uniform float uStepFactor; // 1.0 desktop, 1.35 mobile

uniform float uSplitX;     // < 0 disabled, else [0..1]
uniform int uLeftLegacy;
uniform int uRightLegacy;

uniform int uShadowCount;
uniform vec4 uShadowCasters[28]; // xyz = world pos, w = radius

in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;

float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float aaBand(float edge, float val, float minW) {
  float w = max(fwidth(val) * 0.85, minW);
  return smoothstep(edge - w, edge + w, val);
}

float terrainHeight(vec2 xz, out float rawNoise) {
  vec2 p = xz * uTerrainScale + vec2(uSeed * 17.31, uSeed * 31.17);
  float amp = 0.54;
  float freq = 1.0;
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p * freq);
    freq *= 2.07;
    amp *= 0.48;
  }
  rawNoise = sum;
  float raw = sum - 0.53;
  if (raw <= 0.0) return 0.0;
  float h = pow(raw / 0.47, 1.32) * uMaxHeight;
  if (uTerraceSteps > 0.5) {
    float st = uMaxHeight / uTerraceSteps;
    float band = floor(h / st);
    float fr = h / st - band;
    float sf = smoothstep(0.76, 1.0, fr);
    h = max(min(h, 0.55), (band + sf) * st);
  }
  return h;
}

float castShadowAt(vec3 worldPos, bool crispStyle) {
  float sh = 0.0;
  vec2 sunHoriz = uSunDir.xz / max(uSunDir.y, 0.24);
  for (int i = 0; i < 28; i++) {
    if (i >= uShadowCount) break;
    vec4 sc = uShadowCasters[i];
    if (sc.y <= worldPos.y + 0.5) continue;
    vec2 proj = sc.xz - sunHoriz * (sc.y - worldPos.y);
    vec2 rel = worldPos.xz - proj;
    float bound = sc.w * 1.48;
    if (abs(rel.x) > bound || abs(rel.y) > bound) continue;
    float d0 = length(rel);
    float d1 = length(rel - vec2(sc.w * 0.42, sc.w * 0.16));
    float d2 = length(rel + vec2(sc.w * 0.36, -sc.w * 0.22));
    float d = min(d0, min(d1 * 1.18, d2 * 1.22));
    float s = crispStyle
      ? (1.0 - smoothstep(sc.w * 0.78, sc.w * 0.90, d))
      : (1.0 - smoothstep(sc.w * 0.58, sc.w * 1.06, d));
    sh = max(sh, s);
  }
  return sh;
}

vec3 skyColor(vec3 rd, float sunsetW, float nightW, bool arcade) {
  float h = clamp(rd.y * 1.7, 0.0, 1.0);
  vec3 dayTop = arcade ? vec3(0.24, 0.58, 0.96) : vec3(0.32, 0.64, 0.94);
  vec3 dayHor = arcade ? vec3(0.66, 0.86, 0.99) : vec3(0.76, 0.89, 0.98);
  vec3 sunTop = vec3(0.24, 0.24, 0.56);
  vec3 sunHor = vec3(0.99, 0.56, 0.34);
  vec3 ngtTop = vec3(0.03, 0.05, 0.14);
  vec3 ngtHor = vec3(0.08, 0.13, 0.26);

  vec3 top = mix(mix(dayTop, sunTop, sunsetW), ngtTop, nightW);
  vec3 hor = mix(mix(dayHor, sunHor, sunsetW), ngtHor, nightW);
  vec3 col = mix(hor, top, pow(h, 0.52));
  float sunDot = max(dot(rd, uSunDir), 0.0);
  vec3 sunGlow = mix(vec3(1.0, 0.95, 0.78), vec3(1.0, 0.54, 0.24), sunsetW) * (1.0 - nightW * 0.7);
  col += sunGlow * pow(sunDot, 36.0) * 0.65;
  return col;
}

void main() {
  bool isLegacy = (uSplitX >= 0.0 && (gl_FragCoord.x / uResolution.x) < uSplitX) ? (uLeftLegacy == 1) : (uRightLegacy == 1);
  bool arcade = (uStyle == 0 || uStyle == 3);

  vec2 fragPx = gl_FragCoord.xy;
  if (isLegacy) {
    float blk = max(3.0, floor(min(uResolution.x, uResolution.y) / 145.0));
    fragPx = (floor(fragPx / blk) + 0.5) * blk;
  }

  vec2 ndc = (fragPx / uResolution) * 2.0 - 1.0;
  vec4 nearP = uInvViewProj * vec4(ndc, -1.0, 1.0); nearP /= nearP.w;
  vec4 farP  = uInvViewProj * vec4(ndc,  1.0, 1.0); farP  /= farP.w;
  vec3 ro = nearP.xyz;
  vec3 rd = normalize(farP.xyz - nearP.xyz);

  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.4);
  float nightW = max(0.0, (uTimeOfDay - 0.48) / 0.52);
  vec3 sky = skyColor(rd, sunsetW, nightW, arcade);

  if (uTerrainEnabled == 0) {
    vec3 stBot = mix(vec3(0.95, 0.97, 0.99), vec3(0.10, 0.14, 0.23), nightW);
    vec3 stTop = mix(vec3(0.84, 0.89, 0.96), vec3(0.05, 0.08, 0.14), nightW);
    float vy = clamp(gl_FragCoord.y / max(uResolution.y, 1.0), 0.0, 1.0);
    vec3 stCol = mix(stBot, stTop, pow(vy, 0.85));
    if (rd.y < -0.002 && uShadowCount > 0) {
      float tFloor = (0.0 - ro.y) / rd.y;
      if (tFloor > 0.0 && tFloor < 220.0) {
        vec3 fp = ro + rd * tFloor;
        float sh = castShadowAt(fp, false);
        stCol = mix(stCol, stCol * vec3(0.76, 0.81, 0.89), sh * 0.45);
      }
    }
    outColor = vec4(stCol, 1.0);
    outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
    gl_FragDepth = 0.99999;
    return;
  }

  if (rd.y >= -0.002) {
    outColor = vec4(sky, 1.0);
    outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
    gl_FragDepth = 0.99999;
    return;
  }

  float tWater = (0.0 - ro.y) / rd.y;
  float farLimit = min(tWater, 460.0);
  float tStart = max(0.5, (uMaxHeight + 0.8 - ro.y) / rd.y);
  if (ro.y <= uMaxHeight + 0.8) tStart = 0.5;

  bool hitLand = false;
  float tHit = tWater;
  float rawN = 0.0;
  float prevT = tStart;

  if (tStart < farLimit) {
    float t = tStart;
    for (int i = 0; i < 34; i++) {
      if (t >= farLimit) break;
      vec3 p = ro + rd * t;
      float th = terrainHeight(p.xz, rawN);
      float diff = p.y - th;
      if (diff <= 0.0) {
        float lo = prevT, hi = t;
        for (int b = 0; b < 3; b++) {
          float mid = 0.5 * (lo + hi);
          vec3 mp = ro + rd * mid;
          float mh = terrainHeight(mp.xz, rawN);
          if (mp.y <= mh) hi = mid; else lo = mid;
        }
        tHit = hi;
        hitLand = true;
        break;
      }
      prevT = t;
      float dt = max(0.75, max(diff * 0.62, t * 0.028)) * uStepFactor;
      t += dt;
    }
    if (!hitLand && farLimit < 459.5) {
      vec3 pw = ro + rd * farLimit;
      float thw = terrainHeight(pw.xz, rawN);
      if (thw > 0.001) {
        float lo = prevT, hi = farLimit;
        for (int b = 0; b < 4; b++) {
          float mid = 0.5 * (lo + hi);
          vec3 mp = ro + rd * mid;
          float mh = terrainHeight(mp.xz, rawN);
          if (mp.y <= mh) hi = mid; else lo = mid;
        }
        tHit = hi;
        hitLand = true;
      }
    }
  }

  vec3 hitPos = ro + rd * tHit;
  vec3 col;

  if (hitLand) {
    float e = 0.72;
    float r0, rx, rz;
    float h0 = terrainHeight(hitPos.xz, r0);
    float hx = terrainHeight(hitPos.xz + vec2(e, 0.0), rx);
    float hz = terrainHeight(hitPos.xz + vec2(0.0, e), rz);
    vec3 nrm = normalize(vec3(h0 - hx, e, h0 - hz));

    if (arcade) {
      vec3 sand     = vec3(0.95, 0.85, 0.56);
      vec3 lime     = vec3(0.45, 0.79, 0.25);
      vec3 emerald  = vec3(0.24, 0.64, 0.24);
      vec3 pine     = vec3(0.11, 0.42, 0.20);
      vec3 pineHi   = vec3(0.28, 0.68, 0.26);
      vec3 cliffLit = vec3(0.60, 0.54, 0.42);
      vec3 cliffSh  = vec3(0.34, 0.35, 0.36);

      vec3 baseCol = mix(sand, lime, aaBand(0.552, r0, 0.004));
      baseCol = mix(baseCol, emerald, aaBand(0.605, r0, 0.006));
      baseCol = mix(baseCol, pine, aaBand(0.675, r0, 0.007));

      vec2 treeGrid = floor(hitPos.xz * 0.34);
      vec2 jitter = (vec2(hash21(treeGrid + vec2(3.1, 7.4)), hash21(treeGrid + vec2(11.7, 2.3))) - 0.5) * 0.30;
      vec2 treeLocal = fract(hitPos.xz * 0.34) - 0.5 - jitter;
      float treeSeed = hash21(treeGrid);
      float treeDistFade = 1.0 - smoothstep(130.0, 250.0, tHit);
      float treeMask = aaBand(0.595, r0, 0.006) * step(0.42, treeSeed) * treeDistFade;
      float crownD = length(treeLocal);
      float inCrown = (1.0 - aaBand(0.38, crownD, 0.05)) * treeMask;
      float inSunCrown = (1.0 - aaBand(0.21, length(treeLocal + vec2(0.09, 0.09)), 0.05)) * treeMask;
      baseCol = mix(baseCol, pine, inCrown * 0.94);
      baseCol = mix(baseCol, pineHi, inSunCrown * 0.88);

      float isFlat = aaBand(0.62, nrm.y, 0.04);
      vec3 cliffCol = mix(cliffSh, cliffLit, aaBand(0.15, dot(nrm, uSunDir), 0.05));
      baseCol = mix(cliffCol, baseCol, isFlat);

      float ndotl = dot(nrm, uSunDir);
      float litBand = aaBand(0.12, ndotl, 0.06);
      float sh = castShadowAt(hitPos, true);
      vec3 dayLit = mix(vec3(0.62, 0.72, 0.88), vec3(1.10, 1.07, 0.96), litBand);
      vec3 sunLit = mix(vec3(0.48, 0.44, 0.68), vec3(1.26, 0.92, 0.64), litBand);
      vec3 ngtLit = mix(vec3(0.12, 0.17, 0.32), vec3(0.34, 0.43, 0.66), litBand);
      vec3 tint = mix(mix(dayLit, sunLit, sunsetW), ngtLit, nightW);
      col = baseCol * tint;
      vec3 shTarget = mix(vec3(0.08, 0.24, 0.32), vec3(0.04, 0.08, 0.18), nightW);
      col = mix(col, mix(col * vec3(0.46, 0.58, 0.78), shTarget, 0.35), sh);
    } else {
      vec3 sand = vec3(0.92, 0.85, 0.64);
      vec3 grass = vec3(0.39, 0.72, 0.30);
      vec3 midGrass = vec3(0.24, 0.56, 0.25);
      vec3 forest = vec3(0.13, 0.37, 0.20);
      vec3 cliff = vec3(0.54, 0.52, 0.44);

      vec3 baseCol = mix(sand, grass, smoothstep(0.542, 0.568, r0));
      baseCol = mix(baseCol, midGrass, smoothstep(0.595, 0.655, r0));
      float canopyNoise = valueNoise(hitPos.xz * 0.34);
      baseCol = mix(baseCol, forest, smoothstep(0.61, 0.67, r0) * smoothstep(0.38, 0.68, canopyNoise) * 0.85);
      baseCol = mix(cliff, baseCol, smoothstep(0.45, 0.78, nrm.y));

      float ndotl = dot(nrm, uSunDir);
      float sh = castShadowAt(hitPos, false);
      float lit = mix(smoothstep(-0.2, 0.75, ndotl), 0.28, sh * 0.75);
      vec3 tint = mix(mix(mix(vec3(0.56, 0.65, 0.82), vec3(1.12, 1.08, 0.98), lit),
                          mix(vec3(0.46, 0.42, 0.64), vec3(1.25, 0.94, 0.68), lit), sunsetW),
                      mix(vec3(0.14, 0.18, 0.30), vec3(0.36, 0.44, 0.64), lit), nightW);
      col = baseCol * tint;
    }
  } else {
    float rW;
    terrainHeight(hitPos.xz, rW);

    if (arcade) {
      vec3 deepSea   = mix(mix(vec3(0.08, 0.35, 0.76), vec3(0.15, 0.27, 0.56), sunsetW), vec3(0.03, 0.09, 0.24), nightW);
      vec3 midSea    = mix(mix(vec3(0.11, 0.49, 0.84), vec3(0.23, 0.37, 0.62), sunsetW), vec3(0.05, 0.14, 0.31), nightW);
      vec3 shallow   = mix(mix(vec3(0.14, 0.68, 0.82), vec3(0.38, 0.55, 0.66), sunsetW), vec3(0.07, 0.24, 0.38), nightW);
      vec3 surfFoam  = mix(vec3(0.95, 0.99, 1.00), vec3(1.0, 0.85, 0.72), sunsetW) * (1.0 - nightW * 0.62);

      col = mix(deepSea, midSea, aaBand(0.415, rW, 0.006));
      col = mix(col, shallow, aaBand(0.478, rW, 0.005));
      col = mix(col, surfFoam, aaBand(0.519, rW, 0.0025) * 0.92);

      vec2 wGrid = hitPos.xz * vec2(0.34, 0.52) + vec2(uWaveTime * 0.65, uWaveTime * 0.22);
      vec2 wCell = floor(wGrid);
      vec2 wFrac = fract(wGrid) - 0.5;
      float wRand = hash21(wCell);
      float dash = (1.0 - aaBand(0.34, abs(wFrac.x), 0.06)) * (1.0 - aaBand(0.11, abs(wFrac.y), 0.05));
      float distFade = 1.0 - smoothstep(85.0, 230.0, tHit);
      float isCrest = dash * step(0.84, wRand) * distFade;
      col = mix(col, surfFoam, isCrest * 0.78);

      float sh = castShadowAt(hitPos, true);
      vec3 indigoSh = mix(mix(vec3(0.06, 0.20, 0.50), vec3(0.09, 0.13, 0.32), sunsetW), vec3(0.01, 0.04, 0.12), nightW);
      col = mix(col, indigoSh, sh * 0.76);
    } else {
      float coast = smoothstep(0.36, 0.53, rW);
      float foam = smoothstep(0.505, 0.53, rW);
      vec3 deepSea = mix(mix(vec3(0.11, 0.40, 0.74), vec3(0.16, 0.30, 0.56), sunsetW), vec3(0.04, 0.10, 0.24), nightW);
      vec3 shallow = mix(mix(vec3(0.20, 0.67, 0.82), vec3(0.38, 0.52, 0.64), sunsetW), vec3(0.08, 0.24, 0.38), nightW);
      col = mix(deepSea, shallow, coast);
      vec2 wp = hitPos.xz * 0.42 + vec2(uWaveTime * 0.75, uWaveTime * 0.35);
      float wCell = valueNoise(wp * vec2(1.0, 2.6));
      float waveFleck = smoothstep(0.79, 0.89, wCell) * (1.0 - smoothstep(65.0, 220.0, tHit));
      col = mix(col, mix(vec3(0.84, 0.94, 1.0), vec3(1.0, 0.82, 0.66), sunsetW), waveFleck * (0.42 - nightW * 0.25));
      col = mix(col, vec3(0.90, 0.96, 1.0) * (1.0 - nightW * 0.65), foam * 0.55);
      float sh = castShadowAt(hitPos, false);
      col *= mix(1.0, 0.58, sh);
    }
  }

  float fogStart = arcade ? 115.0 : 45.0;
  float fogRate = arcade ? 0.0040 : 0.0046;
  float fogT = 1.0 - exp(-pow(max(0.0, tHit - fogStart) * fogRate * max(uFogDensity, 0.05), 1.6));
  vec3 horCol = skyColor(vec3(rd.x, 0.02, rd.z), sunsetW, nightW, arcade);
  col = mix(col, horCol, clamp(fogT, 0.0, 0.96));

  vec4 clip = uViewProj * vec4(hitPos, 1.0);
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 0.99998);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
}`;
