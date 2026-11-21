/**
 * WebGL2 ES 3.00 Shaders for @aastack/core with live RenderStyle softswitch:
 *  uStyle:
 *    0 = "arcade-8bit" (DEFAULT: vivid hue-shifted 8/16-bit palette bands with tight fwidth AA, crisp indigo shadows, snappy wave flecks, arcade cel punch + silky geometric RGSS AA)
 *    1 = "hd-2d"       (balanced atmospheric HD-2D voxel DDA + softer penumbra & hemisphere lighting)
 *    2 = "smooth-toy"  (3D SDF sphere tracing + smooth curved surfaces + soft miniature look)
 *    3 = "retro-raw"   (authentic 1x pixelated nearest-neighbor retro look for direct comparison)
 */

export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID & 1) << 2, (gl_VertexID & 2) << 1) - 1.0;
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

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

// Tight derivative-aware anti-aliased step: razor-crisp 8-bit color bands with 1-display-px AA edge!
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

float cloudShadowAt(vec3 worldPos, bool crispStyle) {
  float sh = 0.0;
  vec2 sunHoriz = uSunDir.xz / max(uSunDir.y, 0.24);
  for (int i = 0; i < 28; i++) {
    if (i >= uShadowCount) break;
    vec4 sc = uShadowCasters[i];
    if (sc.y <= worldPos.y + 0.5) continue;
    vec2 proj = sc.xz - sunHoriz * (sc.y - worldPos.y);
    // Multi-lobe organic cloud silhouette footprint instead of a generic blurry circle!
    vec2 rel = worldPos.xz - proj;
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

  if (uTerrainEnabled == 0 || rd.y >= -0.002) {
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
    for (int i = 0; i < 48; i++) {
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
      float dt = max(0.55, max(diff * 0.52, t * 0.022)) * uStepFactor;
      t += dt;
    }
    // Guarantee zero grazing-ray skip over thin coastal beaches: check exact water-plane intersection!
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
      // PUNCHY 8/16-BIT CRISP TERRACE BANDS (1-display-px derivative AA only at band borders!)
      vec3 sand     = vec3(0.95, 0.85, 0.56);
      vec3 lime     = vec3(0.45, 0.79, 0.25);
      vec3 emerald  = vec3(0.24, 0.64, 0.24);
      vec3 pine     = vec3(0.11, 0.42, 0.20);
      vec3 pineHi   = vec3(0.28, 0.68, 0.26);
      vec3 cliffLit = vec3(0.60, 0.54, 0.42);
      vec3 cliffSh  = vec3(0.34, 0.35, 0.36);

      // Crisp narrow golden beach ribbon -> lush lime meadow -> emerald hills -> pine forest!
      vec3 baseCol = mix(sand, lime, aaBand(0.552, r0, 0.004));
      baseCol = mix(baseCol, emerald, aaBand(0.605, r0, 0.006));
      baseCol = mix(baseCol, pine, aaBand(0.675, r0, 0.007));

      // Crisp clustered 8-bit tree crowns on green meadows & highlands (jittered clusters, sunlit tops over deep pine!)
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

      // Crisp steep rocky cliff risers
      float isFlat = aaBand(0.62, nrm.y, 0.04);
      vec3 cliffCol = mix(cliffSh, cliffLit, aaBand(0.15, dot(nrm, uSunDir), 0.05));
      baseCol = mix(cliffCol, baseCol, isFlat);

      // Tight 2-band hue-shifted directional light + hue-shifted cool-teal cloud shadow!
      float ndotl = dot(nrm, uSunDir);
      float litBand = aaBand(0.12, ndotl, 0.06);
      float sh = cloudShadowAt(hitPos, true);
      vec3 dayLit = mix(vec3(0.62, 0.72, 0.88), vec3(1.10, 1.07, 0.96), litBand);
      vec3 sunLit = mix(vec3(0.48, 0.44, 0.68), vec3(1.26, 0.92, 0.64), litBand);
      vec3 ngtLit = mix(vec3(0.12, 0.17, 0.32), vec3(0.34, 0.43, 0.66), litBand);
      vec3 tint = mix(mix(dayLit, sunLit, sunsetW), ngtLit, nightW);
      col = baseCol * tint;
      // Hue-shifted deep cool-indigo/teal shadow (NEVER muddy gray!)
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
      float sh = cloudShadowAt(hitPos, false);
      float lit = mix(smoothstep(-0.2, 0.75, ndotl), 0.28, sh * 0.75);
      vec3 tint = mix(mix(mix(vec3(0.56, 0.65, 0.82), vec3(1.12, 1.08, 0.98), lit),
                          mix(vec3(0.46, 0.42, 0.64), vec3(1.25, 0.94, 0.68), lit), sunsetW),
                      mix(vec3(0.14, 0.18, 0.30), vec3(0.36, 0.44, 0.64), lit), nightW);
      col = baseCol * tint;
    }
  } else {
    // Ocean surface at Y = 0
    float rW;
    terrainHeight(hitPos.xz, rW);

    if (arcade) {
      // VIVID COBALT OCEAN -> AZURE MID -> RICH TROPICAL TURQUOISE SHALLOWS -> RAZOR-THIN WHITE SURF RING!
      vec3 deepSea   = mix(mix(vec3(0.08, 0.35, 0.76), vec3(0.15, 0.27, 0.56), sunsetW), vec3(0.03, 0.09, 0.24), nightW);
      vec3 midSea    = mix(mix(vec3(0.11, 0.49, 0.84), vec3(0.23, 0.37, 0.62), sunsetW), vec3(0.05, 0.14, 0.31), nightW);
      vec3 shallow   = mix(mix(vec3(0.14, 0.68, 0.82), vec3(0.38, 0.55, 0.66), sunsetW), vec3(0.07, 0.24, 0.38), nightW);
      vec3 surfFoam  = mix(vec3(0.95, 0.99, 1.00), vec3(1.0, 0.85, 0.72), sunsetW) * (1.0 - nightW * 0.62);

      col = mix(deepSea, midSea, aaBand(0.415, rW, 0.006));
      col = mix(col, shallow, aaBand(0.478, rW, 0.005));
      col = mix(col, surfFoam, aaBand(0.519, rW, 0.0025) * 0.92);

      // Crisp 8-bit ocean wave-crest dashes (distance-filtered so horizon stays silky!)
      vec2 wGrid = hitPos.xz * vec2(0.34, 0.52) + vec2(uWaveTime * 0.65, uWaveTime * 0.22);
      vec2 wCell = floor(wGrid);
      vec2 wFrac = fract(wGrid) - 0.5;
      float wRand = hash21(wCell);
      float dash = (1.0 - aaBand(0.34, abs(wFrac.x), 0.06)) * (1.0 - aaBand(0.11, abs(wFrac.y), 0.05));
      float distFade = 1.0 - smoothstep(85.0, 230.0, tHit);
      float isCrest = dash * step(0.84, wRand) * distFade;
      col = mix(col, surfFoam, isCrest * 0.78);

      // CRISP HUE-SHIFTED DEEP ROYAL INDIGO CLOUD SHADOWS (never gray mud!)
      float sh = cloudShadowAt(hitPos, true);
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
      float sh = cloudShadowAt(hitPos, false);
      col *= mix(1.0, 0.58, sh);
    }
  }

  // Push horizon haze cleanly into the distance in arcade-8bit so midground stays vibrant & electric!
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

export const ENTITY_OBB_VS = `#version 300 es
layout(location = 0) in vec3 aUnitPos;

uniform mat4 uViewProj;
uniform mat4 uVoxelToWorld;
uniform vec3 uVolSize;

void main() {
  vec3 pad = vec3(0.45);
  vec3 voxPos = mix(-pad, uVolSize + pad, aUnitPos);
  vec4 worldPos = uVoxelToWorld * vec4(voxPos, 1.0);
  gl_Position = uViewProj * worldPos;
}`;

export const ENTITY_OBB_FS = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uAlbedoTex;
uniform sampler3D uSdfTex;
uniform sampler3D uNormalTex;
uniform sampler3D uEmisTex;

uniform vec2 uResolution;
uniform mat4 uViewProj;
uniform mat4 uInvViewProj;
uniform mat4 uVoxelToWorld;
uniform mat4 uWorldToVoxel;
uniform mat3 uNormalMat;
uniform vec3 uVolSize;
uniform float uSdfRange;

uniform int uStyle;           // 0=arcade-8bit, 1=hd-2d, 2=smooth-toy, 3=retro-raw
uniform int uModeA;
uniform int uModeB;
uniform float uSplitX;
uniform int uSamples;
uniform int uShadeStyle;
uniform int uSelfShadow;
uniform int uOutlineEnabled;
uniform float uObjectIdNorm;
uniform float uEmissiveBoost;

uniform vec3 uSunDir;
uniform vec3 uSunLocal;
uniform float uTimeOfDay;
uniform float uFogDensity;
uniform int uDebugOverlay;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;

vec3 srgbToLin(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(0.04045)));
}
vec3 linToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}

vec2 getRgssOffset(int idx, int count) {
  if (count <= 1) return vec2(0.0);
  if (count == 4) {
    const vec2 r4[4] = vec2[4](
      vec2(-0.375, -0.125), vec2(0.125, -0.375),
      vec2( 0.375,  0.125), vec2(-0.125, 0.375)
    );
    return r4[idx];
  }
  const vec2 r8[8] = vec2[8](
    vec2( 1.0, -3.0), vec2(-1.0,  3.0), vec2( 5.0,  1.0), vec2(-3.0, -5.0),
    vec2(-5.0,  5.0), vec2(-7.0, -1.0), vec2( 3.0,  7.0), vec2( 7.0, -7.0)
  );
  return r8[idx] / 16.0;
}

vec3 shadeVoxel(vec3 baseLin, vec3 worldN, float ao, float emisFlag, float selfSh, bool hardToon) {
  if (uShadeStyle == 2) return baseLin;
  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.4);
  float nightW = max(0.0, (uTimeOfDay - 0.48) / 0.52);
  bool arcade = (uStyle == 0 || uStyle == 3);

  if (emisFlag > 0.5) {
    float boost = 1.0 + (0.45 + nightW * 0.9) * uEmissiveBoost;
    return baseLin * boost + vec3(0.15, 0.09, 0.02) * uEmissiveBoost;
  }

  // Punchy hue-shifted 3-stop arcade palette multipliers (cool indigo shadows -> crisp mid -> warm golden top!)
  vec3 shMul = arcade
    ? mix(mix(vec3(0.50, 0.60, 0.84), vec3(0.44, 0.40, 0.68), sunsetW), vec3(0.18, 0.24, 0.44), nightW)
    : mix(mix(vec3(0.62, 0.69, 0.84), vec3(0.52, 0.48, 0.70), sunsetW), vec3(0.20, 0.25, 0.42), nightW);
  vec3 midMul = mix(mix(vec3(0.98, 0.98, 1.02), vec3(1.02, 0.86, 0.78), sunsetW), vec3(0.36, 0.44, 0.64), nightW);
  vec3 litMul = arcade
    ? mix(mix(vec3(1.18, 1.13, 1.02), vec3(1.32, 1.04, 0.78), sunsetW), vec3(0.60, 0.70, 0.94), nightW)
    : mix(mix(vec3(1.13, 1.10, 1.02), vec3(1.26, 1.02, 0.80), sunsetW), vec3(0.56, 0.66, 0.88), nightW);

  float ndotl = dot(worldN, uSunDir);
  float litVal = mix(ndotl, min(ndotl, -0.28), selfSh * 0.85);

  vec3 tint;
  if (hardToon) {
    if (litVal > 0.34) tint = litMul;
    else if (litVal > -0.12) tint = midMul;
    else tint = shMul;
  } else if (uShadeStyle == 0) {
    // Tight AA band width (±0.06 in arcade-8bit vs ±0.16 in hd-2d): punchy crisp cel bands with zero rotation pop!
    float bw = arcade ? 0.06 : 0.16;
    float tSh = smoothstep(-0.12 - bw, -0.12 + bw, litVal);
    float tLit = smoothstep(0.34 - bw, 0.34 + bw, litVal);
    tint = mix(mix(shMul, midMul, tSh), litMul, tLit);
  } else {
    float diff = smoothstep(-0.72, 0.95, litVal);
    tint = mix(shMul, litMul, diff);
  }
  return baseLin * srgbToLin(clamp(tint, 0.0, 2.2)) * ao;
}

bool traceLocalShadow(vec3 ro, vec3 rd) {
  vec3 invD = vec3(
    abs(rd.x) > 1e-6 ? 1.0 / rd.x : 1e20,
    abs(rd.y) > 1e-6 ? 1.0 / rd.y : 1e20,
    abs(rd.z) > 1e-6 ? 1.0 / rd.z : 1e20
  );
  vec3 t0 = (vec3(0.0) - ro) * invD;
  vec3 t1 = (uVolSize - ro) * invD;
  float tEnter = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), max(min(t0.z, t1.z), 0.0));
  float tExit = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tExit <= tEnter + 1e-4) return false;

  vec3 pos = ro + rd * (tEnter + 0.02);
  ivec3 cell = clamp(ivec3(floor(pos)), ivec3(0), ivec3(uVolSize) - 1);
  ivec3 stepDir = ivec3(
    abs(rd.x) > 1e-6 ? (rd.x > 0.0 ? 1 : -1) : 0,
    abs(rd.y) > 1e-6 ? (rd.y > 0.0 ? 1 : -1) : 0,
    abs(rd.z) > 1e-6 ? (rd.z > 0.0 ? 1 : -1) : 0
  );
  vec3 tDelta = abs(invD);
  vec3 nextB = vec3(cell) + max(vec3(stepDir), vec3(0.0));
  vec3 tMax = (nextB - pos) * invD;
  if (stepDir.x == 0) tMax.x = 1e20;
  if (stepDir.y == 0) tMax.y = 1e20;
  if (stepDir.z == 0) tMax.z = 1e20;

  for (int i = 0; i < 48; i++) {
    if (texelFetch(uAlbedoTex, cell, 0).a >= 0.5) return true;
    if (tMax.x <= tMax.y && tMax.x <= tMax.z) { cell.x += stepDir.x; tMax.x += tDelta.x; }
    else if (tMax.y <= tMax.z) { cell.y += stepDir.y; tMax.y += tDelta.y; }
    else { cell.z += stepDir.z; tMax.z += tDelta.z; }
    if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(uVolSize)))) break;
  }
  return false;
}

float sampleSdf(vec3 p) {
  vec3 dBoxV = max(-p, p - uVolSize);
  float dBox = max(max(dBoxV.x, dBoxV.y), dBoxV.z);
  vec3 uv = clamp(p / uVolSize, vec3(0.0), vec3(1.0));
  float d = (texture(uSdfTex, uv).r - 128.0 / 255.0) * (255.0 / 127.0) * uSdfRange;
  return max(d, dBox);
}

bool traceVoxelRay(
  vec3 roVox, vec3 rdVox, bool smoothSdfMode, bool hardToon,
  out vec3 outLin, out vec3 outWorldN, out float outT, out float outEmis
) {
  outLin = vec3(0.0);
  outWorldN = vec3(0.0, 1.0, 0.0);
  outT = 1e20;
  outEmis = 0.0;

  if (smoothSdfMode) {
    float rdLen = length(rdVox);
    if (rdLen < 1e-6) return false;
    vec3 rdN = rdVox / rdLen;
    vec3 invD = 1.0 / mix(rdN, vec3(1e-6), lessThan(abs(rdN), vec3(1e-6)));
    vec3 t0 = (vec3(-0.45) - roVox) * invD;
    vec3 t1 = (uVolSize + vec3(0.45) - roVox) * invD;
    float tEnter = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), max(min(t0.z, t1.z), 0.0));
    float tExit = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
    if (tExit <= tEnter + 1e-4) return false;

    float s = tEnter;
    bool hit = false;
    for (int i = 0; i < 64; i++) {
      vec3 p = roVox + rdN * s;
      float d = sampleSdf(p);
      if (d <= 0.02) {
        s = max(tEnter, s + d * 0.65);
        hit = true;
        break;
      }
      s += max(d * 0.72, 0.14);
      if (s > tExit) break;
    }
    if (!hit) return false;

    vec3 hp = roVox + rdN * s;
    const float e = 0.28;
    vec3 nLoc = normalize(
      vec3( 1, -1, -1) * sampleSdf(hp + vec3( e, -e, -e)) +
      vec3(-1, -1,  1) * sampleSdf(hp + vec3(-e, -e,  e)) +
      vec3(-1,  1, -1) * sampleSdf(hp + vec3(-e,  e, -e)) +
      vec3( 1,  1,  1) * sampleSdf(hp + vec3( e,  e,  e))
    );
    vec3 uv = clamp(hp / uVolSize, vec3(0.0), vec3(1.0));
    vec3 albedo = texture(uAlbedoTex, uv).rgb;
    float ao = texture(uNormalTex, uv).a;
    ivec3 ic = clamp(ivec3(floor(hp)), ivec3(0), ivec3(uVolSize) - 1);
    float ef = texelFetch(uEmisTex, ic, 0).r;

    vec3 worldN = normalize(uNormalMat * nLoc);
    float selfSh = (uSelfShadow == 1 && ef < 0.5 && uShadeStyle != 2) ? (traceLocalShadow(hp + nLoc * 0.35, uSunLocal) ? 1.0 : 0.0) : 0.0;
    outLin = shadeVoxel(srgbToLin(albedo), worldN, ao, ef, selfSh, false);
    outWorldN = worldN;
    outT = s / rdLen;
    outEmis = ef;
    return true;
  }

  vec3 invD = vec3(
    abs(rdVox.x) > 1e-6 ? 1.0 / rdVox.x : 1e20,
    abs(rdVox.y) > 1e-6 ? 1.0 / rdVox.y : 1e20,
    abs(rdVox.z) > 1e-6 ? 1.0 / rdVox.z : 1e20
  );
  vec3 t0 = (vec3(0.0) - roVox) * invD;
  vec3 t1 = (uVolSize - roVox) * invD;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float tExit = min(min(tmax.x, tmax.y), tmax.z);
  if (tExit <= tEnter + 1e-4) return false;

  float te = tEnter + 1e-4;
  vec3 pos = roVox + rdVox * te;
  ivec3 cell = clamp(ivec3(floor(pos)), ivec3(0), ivec3(uVolSize) - 1);
  ivec3 stepDir = ivec3(
    abs(rdVox.x) > 1e-6 ? (rdVox.x > 0.0 ? 1 : -1) : 0,
    abs(rdVox.y) > 1e-6 ? (rdVox.y > 0.0 ? 1 : -1) : 0,
    abs(rdVox.z) > 1e-6 ? (rdVox.z > 0.0 ? 1 : -1) : 0
  );
  vec3 tDelta = abs(invD);
  vec3 nextB = vec3(cell) + max(vec3(stepDir), vec3(0.0));
  vec3 tMax = (nextB - pos) * invD;
  if (stepDir.x == 0) tMax.x = 1e20;
  if (stepDir.y == 0) tMax.y = 1e20;
  if (stepDir.z == 0) tMax.z = 1e20;

  vec3 faceN = vec3(0.0, 0.0, 1.0);
  if (tmin.x >= tmin.y && tmin.x >= tmin.z) faceN = vec3(-float(stepDir.x), 0.0, 0.0);
  else if (tmin.y >= tmin.x && tmin.y >= tmin.z) faceN = vec3(0.0, -float(stepDir.y), 0.0);
  else faceN = vec3(0.0, 0.0, -float(stepDir.z));

  float tCur = 0.0;
  for (int i = 0; i < 128; i++) {
    vec4 tex = texelFetch(uAlbedoTex, cell, 0);
    if (tex.a >= 0.5) {
      vec4 na = texelFetch(uNormalTex, cell, 0);
      float ef = texelFetch(uEmisTex, cell, 0).r;
      vec3 smoothN = normalize(na.xyz * 2.0 - 1.0);
      // Crisp faceted cube-face planes on hard-surface outlined actors (24% smooth),
      // cohesive billowing SDF dome shading on soft non-outlined volumetric clouds (78% smooth, zero checkerboard risers!)
      float nBlend = (uOutlineEnabled == 0) ? 0.78 : ((uStyle == 0 || hardToon) ? 0.24 : 0.45);
      vec3 nLoc = normalize(mix(faceN, smoothN, nBlend));
      vec3 worldN = normalize(uNormalMat * nLoc);
      float selfSh = (uSelfShadow == 1 && !hardToon && ef < 0.5 && uShadeStyle != 2)
        ? (traceLocalShadow(pos + rdVox * tCur + faceN * 0.08, uSunLocal) ? 1.0 : 0.0)
        : 0.0;
      outLin = shadeVoxel(srgbToLin(tex.rgb), worldN, na.a, ef, selfSh, hardToon);
      outWorldN = worldN;
      outT = te + tCur;
      outEmis = ef;
      return true;
    }
    if (tMax.x <= tMax.y && tMax.x <= tMax.z) {
      tCur = tMax.x; cell.x += stepDir.x; tMax.x += tDelta.x;
      faceN = vec3(-float(stepDir.x), 0.0, 0.0);
    } else if (tMax.y <= tMax.z) {
      tCur = tMax.y; cell.y += stepDir.y; tMax.y += tDelta.y;
      faceN = vec3(0.0, -float(stepDir.y), 0.0);
    } else {
      tCur = tMax.z; cell.z += stepDir.z; tMax.z += tDelta.z;
      faceN = vec3(0.0, 0.0, -float(stepDir.z));
    }
    if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, ivec3(uVolSize)))) break;
  }
  return false;
}

void main() {
  int mode = (uSplitX >= 0.0 && (gl_FragCoord.x / uResolution.x) < uSplitX) ? uModeA : uModeB;
  bool isLegacy = (mode == 0);
  bool smoothSdf = (mode == 2);
  int spp = isLegacy ? 1 : uSamples;

  vec2 basePx = gl_FragCoord.xy;
  if (isLegacy) {
    float blk = max(3.0, floor(min(uResolution.x, uResolution.y) / 145.0));
    basePx = (floor(basePx / blk) + 0.5) * blk;
  }

  vec3 accLin = vec3(0.0);
  vec3 accNorm = vec3(0.0);
  float accEmis = 0.0;
  float hits = 0.0;
  float minT = 1e20;
  vec3 bestWorldHit = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    if (i >= spp) break;
    vec2 off = getRgssOffset(i, spp);
    vec2 ndc = ((basePx + off) / uResolution) * 2.0 - 1.0;
    vec4 nearP = uInvViewProj * vec4(ndc, -1.0, 1.0); nearP /= nearP.w;
    vec4 farP  = uInvViewProj * vec4(ndc,  1.0, 1.0); farP  /= farP.w;
    vec3 roW = nearP.xyz;
    vec3 rdW = normalize(farP.xyz - nearP.xyz);

    vec3 roV = (uWorldToVoxel * vec4(roW, 1.0)).xyz;
    vec3 rdV = (uWorldToVoxel * vec4(rdW, 0.0)).xyz;

    vec3 cLin; vec3 wN; float tHit; float em;
    if (traceVoxelRay(roV, rdV, smoothSdf, isLegacy, cLin, wN, tHit, em)) {
      accLin += cLin;
      accNorm += wN;
      accEmis += em;
      hits += 1.0;
      if (tHit < minT) {
        minT = tHit;
        bestWorldHit = roW + rdW * tHit;
      }
    }
  }

  if (hits < 0.5) discard;

  float cov = hits / float(spp);
  vec3 avgLin = accLin / hits;
  vec3 avgN = normalize(accNorm / hits);
  float avgEm = accEmis / hits;

  bool arcade = (uStyle == 0 || uStyle == 3);
  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.4);
  float nightW = max(0.0, (uTimeOfDay - 0.48) / 0.52);
  vec3 horCol = mix(mix(arcade ? vec3(0.66, 0.86, 0.99) : vec3(0.76, 0.89, 0.98), vec3(0.99, 0.56, 0.34), sunsetW), vec3(0.08, 0.13, 0.26), nightW);
  float fogStart = arcade ? 115.0 : 45.0;
  float fogT = clamp(1.0 - exp(-pow(max(0.0, minT - fogStart) * (arcade ? 0.0040 : 0.0046) * max(uFogDensity, 0.05), 1.6)), 0.0, 0.92);
  vec3 finalSrgb = mix(linToSrgb(avgLin), horCol, fogT * (1.0 - avgEm * 0.7));

  if (uDebugOverlay == 1) finalSrgb = avgN * 0.5 + 0.5;
  else if (uDebugOverlay == 2) finalSrgb = vec3(clamp(1.0 - minT / 220.0, 0.0, 1.0));
  else if (uDebugOverlay == 3) finalSrgb = vec3(fract(uObjectIdNorm * 7.3), fract(uObjectIdNorm * 13.7), fract(uObjectIdNorm * 23.1));

  vec4 clip = uViewProj * vec4(bestWorldHit, 1.0);
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 0.99997);

  outColor = vec4(finalSrgb, cov);
  outAux = vec4(uOutlineEnabled == 1 ? uObjectIdNorm : 0.0, avgEm, isLegacy ? 1.0 : 0.0, cov);
}`;

export const RIBBON_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aMeta;

uniform mat4 uViewProj;
out vec2 vMeta;

void main() {
  vMeta = aMeta;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

export const RIBBON_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uEmissive;

in vec2 vMeta;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;

void main() {
  float edge = 1.0 - smoothstep(uEmissive > 0.5 ? 0.62 : 0.45, 1.0, abs(vMeta.y));
  float fade = uEmissive > 0.5 ? (1.0 - vMeta.x * 0.78) : (1.0 - vMeta.x) * (1.0 - vMeta.x);
  float a = edge * fade * uAlpha;
  if (a < 0.01) discard;
  outColor = vec4(uColor, a);
  outAux = vec4(0.0, uEmissive * a, 0.0, 0.0);
}`;

export const JFA_INIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uAuxTex;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 outSeed;

vec4 encodeSeed(vec2 uv) {
  vec2 q = clamp(floor(uv * 65535.0 + 0.5), 0.0, 65535.0);
  vec2 hi = floor(q / 256.0) / 255.0;
  vec2 lo = mod(q, 256.0) / 255.0;
  return vec4(hi.x, lo.x, hi.y, lo.y);
}

void main() {
  vec4 aux = texture(uAuxTex, vUv);
  if (aux.r > 0.002 && aux.a > 0.20) {
    outSeed = encodeSeed(vUv);
  } else {
    outSeed = vec4(0.0);
  }
}`;

export const JFA_STEP_FS = `#version 300 es
precision highp float;
uniform sampler2D uSeedTex;
uniform vec2 uResolution;
uniform float uStep;
in vec2 vUv;
out vec4 outSeed;

vec2 decodeSeed(vec4 s) {
  vec2 hi = floor(s.xz * 255.0 + 0.5);
  vec2 lo = floor(s.yw * 255.0 + 0.5);
  return (hi * 256.0 + lo) / 65535.0;
}

void main() {
  vec2 px = 1.0 / uResolution;
  vec2 myPx = vUv * uResolution;
  vec4 bestSeed = vec4(0.0);
  float bestD2 = 1e20;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 suv = vUv + vec2(float(dx), float(dy)) * uStep * px;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
      vec4 s = texture(uSeedTex, suv);
      if (dot(s, vec4(1.0)) <= 0.0001) continue;
      vec2 sp = decodeSeed(s) * uResolution;
      vec2 diff = sp - myPx;
      float d2 = dot(diff, diff);
      if (d2 < bestD2) {
        bestD2 = d2;
        bestSeed = s;
      }
    }
  }
  outSeed = bestSeed;
}`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uColorTex;
uniform sampler2D uAuxTex;
uniform sampler2D uSeedTex;

uniform vec2 uResolution;
uniform float uOutlinePx;
uniform vec3 uOutlineSrgb;
uniform float uBloomStrength;
uniform int uStyle;

in vec2 vUv;
out vec4 fragColor;

vec3 srgbToLin(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(0.04045)));
}
vec3 linToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}
vec2 decodeSeed(vec4 s) {
  vec2 hi = floor(s.xz * 255.0 + 0.5);
  vec2 lo = floor(s.yw * 255.0 + 0.5);
  return (hi * 256.0 + lo) / 65535.0;
}

void main() {
  vec4 sceneCol = texture(uColorTex, vUv);
  vec4 aux = texture(uAuxTex, vUv);
  vec2 px = 1.0 / uResolution;
  bool isLegacy = aux.b > 0.5;

  float olAlpha = 0.0;
  if (uOutlinePx > 0.1 && aux.r <= 0.002) {
    if (isLegacy) {
      float blk = max(3.0, floor(min(uResolution.x, uResolution.y) / 145.0));
      float n1 = texture(uAuxTex, vUv + vec2( blk, 0.0) * px).r;
      float n2 = texture(uAuxTex, vUv + vec2(-blk, 0.0) * px).r;
      float n3 = texture(uAuxTex, vUv + vec2(0.0,  blk) * px).r;
      float n4 = texture(uAuxTex, vUv + vec2(0.0, -blk) * px).r;
      olAlpha = max(max(n1, n2), max(n3, n4)) > 0.002 ? 1.0 : 0.0;
    } else {
      vec4 seed = texture(uSeedTex, vUv);
      if (dot(seed, vec4(1.0)) > 0.0001) {
        float distPx = length(decodeSeed(seed) * uResolution - vUv * uResolution);
        olAlpha = 1.0 - smoothstep(uOutlinePx - 0.65, uOutlinePx + 0.65, distPx);
      }
    }
  }

  vec3 bloomLin = vec3(0.0);
  if (uBloomStrength > 0.02) {
    float rStep = max(1.5, min(uResolution.x, uResolution.y) * 0.004);
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec2 off = vec2(float(dx), float(dy)) * rStep * px;
        float e = texture(uAuxTex, vUv + off).g;
        if (e > 0.05) {
          float w = exp(-0.38 * float(dx * dx + dy * dy));
          bloomLin += srgbToLin(texture(uColorTex, vUv + off).rgb) * e * w;
        }
      }
    }
    bloomLin *= uBloomStrength * 0.16;
  }

  vec3 baseLin = srgbToLin(sceneCol.rgb);
  vec3 olLin = srgbToLin(uOutlineSrgb);
  vec3 finalLin = mix(baseLin, olLin, olAlpha * 0.94) + bloomLin;
  vec3 srgb = linToSrgb(finalLin);

  // Subtle arcade vibrance & contrast punch in arcade-8bit / retro-raw modes!
  if (uStyle == 0 || uStyle == 3) {
    float luma = dot(srgb, vec3(0.299, 0.587, 0.114));
    srgb = mix(vec3(luma), srgb, 1.16);
    srgb = clamp((srgb - 0.5) * 1.06 + 0.5, 0.0, 1.0);
  }
  fragColor = vec4(srgb, 1.0);
}`;
