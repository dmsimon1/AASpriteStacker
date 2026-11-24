/**
 * Tri-Atmosphere Ground, Water & Contemporary Multifractal Terrain Shader for AA-GeoField:
 *  - uSeed < 50    -> World A: Bioluminescent Sunken Roman Sea Cave (teal Voronoi caustics + spotlight)
 *  - uSeed 50..119 -> World B: Sunlit Mediterranean Cove (crystalline turquoise sandbars + surf foam)
 *  - uSeed >= 120  -> World C: Musgrave Ridged Multifractal + Swiss-Turbulence Derivative-Eroded
 *                              Alpine Mountain Gorge & Turquoise Glacier River (1:1 parity with CPU
 *                              `@aastack/geofield` `sampleMultifractalTerrain` + Art Style coherence!)
 */

export const GEOFIELD_GROUND_FS = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform mat4 uViewProj;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uTimeOfDay;
uniform float uFogDensity;
uniform int uStyle;
uniform int uArtStyle;
uniform int uTerrainEnabled;
uniform float uSeed;
uniform float uMaxHeight;
uniform float uTerrainScale;
uniform float uWaveTime;
uniform float uTerraceSteps;
uniform float uStepFactor;
uniform float uSplitX;
uniform int uLeftLegacy;
uniform int uRightLegacy;
uniform int uShadowCount;
uniform vec4 uShadowCasters[28];

in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// C2-continuous quintic value noise with exact analytical derivatives (matches TS vnoise2Grad 1:1!)
vec3 vnoise2Grad(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;

  float v = k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
  vec2 g = du * vec2(k1 + k3 * u.y, k2 + k3 * u.x);
  return vec3(v, g);
}

const mat2 OCT_ROT = mat2(0.8, 0.6, -0.6, 0.8);

// Ken Musgrave's Ridged Multifractal (1993) for sharp knife-edge alpine peaks & arêtes
float musgraveRidged2D(vec2 p) {
  float sum = 0.0;
  float amp = 0.54;
  float weight = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = vnoise2Grad(p).x * 2.0 - 1.0;
    float sig = 1.0 - abs(n);
    sig = sig * sig * weight;
    weight = clamp(sig * 2.05, 0.0, 1.0);
    sum += sig * amp;
    p = (OCT_ROT * p) * 2.07 + vec2(17.3, 11.7);
    amp *= 0.5;
  }
  return sum;
}

// Giliam de Carpentier's Swiss-Turbulence (analytical derivative-damped pseudo-erosion)
float swissTurbulence2D(vec2 p, float erosion) {
  float sum = 0.0;
  float amp = 0.52;
  float freq = 1.0;
  vec2 dSum = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec3 g = vnoise2Grad(p + 0.24 * dSum);
    float n = 1.0 - abs(g.x * 2.0 - 1.0);
    float sgn = (g.x * 2.0 - 1.0) >= 0.0 ? -2.0 : 2.0;
    vec2 grad = g.yz * sgn;
    float damp = 1.0 / (1.0 + erosion * 1.45 * dot(dSum, dSum));
    sum += amp * n * n * damp;
    dSum += amp * grad * freq * 0.35;
    p = (OCT_ROT * p) * 2.03 + vec2(23.1, 9.4);
    freq *= 2.03;
    amp *= 0.48;
  }
  return sum;
}

float alpineRiverCenterX(float z) {
  return sin(z * 0.024) * 15.0 + sin(z * 0.056) * 4.0;
}

// Exact 1:1 GPU counterpart to @aastack/geofield sampleMultifractalHeight(x, z, cfg)!
float alpineTerrainHeight(vec2 xz) {
  float maxH = max(12.0, uMaxHeight);
  float ridgeW = clamp(uTerrainScale, 0.0, 1.8);
  float erosion = clamp(uTerraceSteps, 0.0, 1.8);
  vec2 sp = xz * 0.014 + vec2(uSeed * 0.13, -uSeed * 0.09);

  float ridged = musgraveRidged2D(sp);
  float swiss = swissTurbulence2D(sp * 1.45 + vec2(4.3, -2.7), erosion);
  float backMassif = smoothstep(-10.0, -135.0, xz.y) * 0.96;
  float flankMassif = smoothstep(38.0, 128.0, abs(xz.x)) * 0.52;
  float uplift = backMassif + flankMassif;

  float baseField = mix(swiss * 0.92, ridged * 0.66 + swiss * 0.46, clamp(ridgeW * 0.78, 0.0, 1.0));
  float h = (baseField * (0.62 + 0.50 * ridgeW) + uplift * (0.48 + 0.42 * ridged)) * maxH * 0.72 + 4.2;

  float rX = alpineRiverCenterX(xz.y);
  float dRiver = abs(xz.x - rX);
  float foreOpen = smoothstep(5.0, 48.0, xz.y);
  float chInner = 8.4 + foreOpen * 12.0;
  float chOuter = 20.5 + foreOpen * 24.0;
  float channelT = smoothstep(chInner, chOuter, dRiver);

  float wallMask = smoothstep(0.10, 0.45, channelT) * (1.0 - smoothstep(0.65, 0.96, channelT));
  float crag = (vnoise2Grad(xz * 0.10 + vec2(3.1, -1.7)).x - 0.5) * 2.1 +
    (vnoise2Grad(xz * 0.22 + vec2(-5.2, 4.3)).x - 0.5) * 1.1;

  float heroZone = smoothstep(40.0, 12.0, abs(xz.y + 4.0));
  float benchProfile = smoothstep(14.5, 20.5, dRiver) * smoothstep(42.0, 26.0, dRiver) * heroZone * (1.0 - foreOpen * 0.90);

  float canyonH = mix(-2.6, max(h, 10.2), channelT) + crag * wallMask;
  float benchH = 10.6 + (swiss - 0.42) * 2.4;
  h = mix(canyonH, benchH, benchProfile * 0.88);

  float foreClear = smoothstep(4.0, 38.0, xz.y) * smoothstep(95.0, 24.0, dRiver);
  h = mix(h, min(h, 4.8 + (swiss - 0.35) * 3.2), foreClear * 0.88);
  return h;
}

vec3 alpineTerrainNormal(vec2 xz) {
  const float e = 0.45;
  float hx = alpineTerrainHeight(xz + vec2(e, 0.0)) - alpineTerrainHeight(xz - vec2(e, 0.0));
  float hz = alpineTerrainHeight(xz + vec2(0.0, e)) - alpineTerrainHeight(xz - vec2(0.0, e));
  return normalize(vec3(-hx, 2.0 * e, -hz));
}

// Fast 14-step soft analytical mountain self-shadowing across the gorge
float alpineSoftShadow(vec3 ro, vec3 sunDir) {
  float res = 1.0;
  float t = 1.2;
  for (int i = 0; i < 14; i++) {
    vec3 p = ro + sunDir * t;
    float h = alpineTerrainHeight(p.xz);
    float diff = p.y - h;
    if (diff < 0.05) return 0.14;
    res = min(res, 3.8 * diff / t);
    t += clamp(diff * 0.65, 1.6, 14.0);
    if (t > 125.0) break;
  }
  return clamp(res, 0.14, 1.0);
}

// Animated underwater Voronoi caustic web for crystalline lagoon & cove floors
float caustic(vec2 p, float t) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      float h = hash21(ip + g);
      vec2 o = 0.5 + 0.42 * sin(t * 0.85 + 6.2831 * vec2(h, fract(h * 17.3)));
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return smoothstep(0.18, 0.01, d2 - d1);
}

void main() {
  bool isLegacy = (uSplitX >= 0.0 && (gl_FragCoord.x / uResolution.x) < uSplitX) ? (uLeftLegacy == 1) : (uRightLegacy == 1);
  if (uArtStyle == 4) isLegacy = true;
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

  bool isAlpine = uSeed >= 120.0;
  bool isCove = uSeed >= 50.0 && !isAlpine;
  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.6);
  float nightW  = clamp((uTimeOfDay - 0.46) / 0.54, 0.0, 1.0);

  vec3 skyZen, skyHor;
  if (uArtStyle == 5) {
    // Architectural Studio Clay Maquette Cyclorama Backdrop!
    skyZen = vec3(0.76, 0.79, 0.84);
    skyHor = vec3(0.91, 0.90, 0.87);
  } else if (isAlpine) {
    // Crisp high-altitude Alpine sky (brilliant glacier cerulean / golden alpenglow / starry dusk)
    vec3 dayZen = vec3(0.16, 0.42, 0.78);
    vec3 dayHor = vec3(0.74, 0.86, 0.96);
    vec3 sunZen = vec3(0.20, 0.30, 0.56);
    vec3 sunHor = vec3(0.96, 0.68, 0.46);
    vec3 nitZen = vec3(0.03, 0.06, 0.14);
    vec3 nitHor = vec3(0.11, 0.17, 0.30);
    skyZen = mix(mix(dayZen, sunZen, sunsetW), nitZen, nightW);
    skyHor = mix(mix(dayHor, sunHor, sunsetW), nitHor, nightW);
  } else if (!isCove) {
    skyZen = mix(vec3(0.024, 0.055, 0.115), vec3(0.012, 0.025, 0.058), nightW);
    skyHor = mix(vec3(0.068, 0.155, 0.215), vec3(0.032, 0.088, 0.135), nightW);
  } else {
    vec3 dayZen = vec3(0.24, 0.54, 0.86);
    vec3 dayHor = vec3(0.76, 0.88, 0.96);
    vec3 sunZen = vec3(0.22, 0.31, 0.56);
    vec3 sunHor = vec3(0.96, 0.64, 0.40);
    vec3 nitZen = vec3(0.035, 0.062, 0.145);
    vec3 nitHor = vec3(0.11, 0.16, 0.28);
    skyZen = mix(mix(dayZen, sunZen, sunsetW), nitZen, nightW);
    skyHor = mix(mix(dayHor, sunHor, sunsetW), nitHor, nightW);
  }

  float upT = pow(clamp(rd.y * 1.45, 0.0, 1.0), 0.72);
  vec3 skyCol = mix(skyHor, skyZen, upT);
  if ((isCove || isAlpine) && uArtStyle != 5) {
    float sunAmt = max(0.0, dot(rd, normalize(uSunDir)));
    vec3 sunGlowCol = mix(vec3(1.0, 0.94, 0.78), vec3(1.0, 0.58, 0.30), sunsetW);
    skyCol += sunGlowCol * pow(sunAmt, 16.0) * (1.0 - nightW * 0.85) * 0.62;
  }

  // =========================================================================
  // WORLD C: MUSGRAVE RIDGED MULTIFRACTAL + SWISS-TURBULENCE ALPINE GORGE!
  // =========================================================================
  if (isAlpine) {
    float maxTerrY = max(36.0, uMaxHeight * 1.75);
    float tWater = (ro.y > 0.0 && rd.y < -0.0005) ? (0.0 - ro.y) / rd.y : 1e9;
    float t = (ro.y > maxTerrY && rd.y < -0.001) ? (maxTerrY - ro.y) / rd.y : 0.4;
    float tPrev = t;
    bool hitTerr = false;
    float tHit = 1e9;

    if (!(ro.y > maxTerrY && rd.y >= 0.0)) {
      for (int i = 0; i < 112; i++) {
        vec3 p = ro + rd * t;
        float h = alpineTerrainHeight(p.xz);
        float diff = p.y - h;
        if (diff <= 0.04) {
          float lo = tPrev;
          float hi = t;
          for (int b = 0; b < 5; b++) {
            float mid = 0.5 * (lo + hi);
            vec3 mp = ro + rd * mid;
            if (mp.y <= alpineTerrainHeight(mp.xz)) hi = mid;
            else lo = mid;
          }
          tHit = hi;
          hitTerr = true;
          break;
        }
        tPrev = t;
        float stepD = clamp(diff * 0.38, 0.22 + t * 0.0055, 8.5) * uStepFactor;
        t += stepD;
        if (t > 430.0) break;
      }
    }

    bool hitWater = (tWater > 0.1 && tWater < 430.0 && (!hitTerr || tWater < tHit));
    if (!hitTerr && !hitWater) {
      outColor = vec4(skyCol, 1.0);
      outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
      gl_FragDepth = 0.99998;
      return;
    }

    vec3 wp;
    vec3 col;
    float emis = 0.0;
    float hitDist;
    vec3 sunD = normalize(uSunDir);

    if (hitWater) {
      hitDist = tWater;
      wp = ro + rd * tWater;
      vec2 xz = wp.xz;
      float bedH = alpineTerrainHeight(xz);
      float depth = clamp(-bedH * 0.45, 0.0, 1.0);
      // Animated downstream glacial torrent ripples flowing along +Z!
      float n1 = vnoise(xz * 0.24 - vec2(0.0, uWaveTime * 0.85));
      float n2 = vnoise(xz * 0.72 - vec2(sin(xz.y * 0.05) * 0.8, uWaveTime * 1.45));
      vec3 waterN = normalize(vec3((n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.12, 1.0, (n2 - 0.5) * 0.16 - (n1 - 0.5) * 0.10));
      float fres = pow(1.0 - max(0.0, dot(-rd, waterN)), 3.2);
      vec3 reflDir = reflect(rd, waterN);
      vec3 reflCol = mix(skyHor, skyZen, clamp(reflDir.y * 1.5, 0.0, 1.0));

      if (uArtStyle == 5) {
        col = mix(vec3(0.68, 0.76, 0.82), vec3(0.84, 0.88, 0.91), fres * 0.5);
      } else {
        vec3 glacialDeep = mix(vec3(0.05, 0.34, 0.46), vec3(0.02, 0.10, 0.18), nightW);
        vec3 glacialShal = mix(vec3(0.18, 0.68, 0.72), vec3(0.05, 0.20, 0.28), nightW);
        col = mix(glacialShal, glacialDeep, smoothstep(0.1, 0.9, depth));
        // Sparkling glacial whitewater foam hugging rocky canyon banks!
        float bankFoam = smoothstep(0.55, 0.04, depth + (n1 - 0.5) * 0.25) * (0.55 + 0.45 * smoothstep(0.35, 0.8, n2));
        col = mix(col, mix(vec3(0.92, 0.97, 1.0), vec3(0.96, 0.84, 0.72), sunsetW), bankFoam * (1.0 - nightW * 0.65) * 0.68);
        vec3 H = normalize(sunD - rd);
        float glint = pow(max(0.0, dot(waterN, H)), 56.0) * (1.0 - nightW * 0.85);
        col += mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.72, 0.42), sunsetW) * glint * 1.1;
        col = mix(col, reflCol, fres * 0.45);
        // Subtle shadow beneath the stone viaduct crossing at z ~ 0
        if (abs(xz.x) < 18.0 && abs(xz.y) < 5.0) {
          float bSh = (1.0 - smoothstep(12.0, 18.0, abs(xz.x))) * (1.0 - smoothstep(2.0, 5.0, abs(xz.y)));
          col *= (1.0 - bSh * 0.38);
        }
        // Warm dusk bridge lantern shimmer reflected in the gorge water!
        float warmW = clamp(0.25 + sunsetW * 0.65 + nightW * 0.95, 0.0, 1.1);
        for (int i = 0; i < 6; i++) {
          if (i >= uShadowCount) break;
          vec4 l = uShadowCasters[i];
          if (l.w <= 0.1) continue;
          float d = length(xz - l.xz);
          float pool = exp(-(d * d) / max(l.w * l.w * 1.4, 1.0)) * (0.75 + 0.25 * n2);
          col += vec3(0.96, 0.62, 0.22) * pool * warmW * 0.52;
          emis = max(emis, pool * warmW * 0.18);
        }
      }
    } else {
      hitDist = tHit;
      wp = ro + rd * tHit;
      vec3 N = alpineTerrainNormal(wp.xz);
      float slope = clamp(1.0 - N.y, 0.0, 1.0);
      // Clean geological stratified granite ledges & multi-scale mineral grain (zero camo rings!)
      float rockCoarse = vnoise(wp.xz * 0.18 + vec2(wp.y * 0.05, -wp.y * 0.04));
      float rockMed = vnoise(wp.xz * 0.52 + vec2(3.7, -2.1));
      float rockMicro = vnoise(wp.xz * 1.85 + vec2(wp.y * 0.65, -wp.y * 0.45));
      float rockGrain = rockCoarse * 0.45 + rockMed * 0.35 + rockMicro * 0.20;
      float strataPhase = wp.y * 0.68 + rockCoarse * 2.2 + rockMed * 0.65;
      float strata = sin(strataPhase * 3.14159) * 0.5 + 0.5;
      float ledge = smoothstep(0.06, 0.26, fract(strataPhase * 0.5));
      vec3 rockBump = vec3(
        (rockMed - 0.5) * 0.22 + (rockMicro - 0.5) * 0.16,
        (ledge - 0.5) * 0.26,
        (strata - 0.5) * 0.20 - (rockMicro - 0.5) * 0.14
      );
      N = normalize(N + rockBump * smoothstep(0.12, 0.38, slope));

      float sh = alpineSoftShadow(wp + N * 0.6, sunD);
      float ndl = dot(N, sunD);

      // Alpine geological biome layering: granite cliffs -> pine meadows -> scree -> snow-capped peaks!
      float snowline = 24.5 + (rockCoarse - 0.5) * 5.0 + smoothstep(-8.0, 26.0, wp.z) * 12.0;
      float snowMask = smoothstep(snowline - 3.5, snowline + 6.5, wp.y) * (1.0 - smoothstep(0.28, 0.52, slope));
      float grassMask = (1.0 - smoothstep(15.5, 24.5, wp.y)) * (1.0 - smoothstep(0.16, 0.38, slope)) * smoothstep(0.8, 4.2, wp.y);
      float screeMask = smoothstep(1.2, 8.0, wp.y) * (1.0 - smoothstep(0.32, 0.58, slope)) * (1.0 - grassMask);

      vec3 rockCol = mix(vec3(0.25, 0.28, 0.34), vec3(0.49, 0.46, 0.42), strata * 0.48 + rockGrain * 0.52);
      rockCol *= mix(0.84, 1.06, ledge);
      vec3 screeCol = mix(vec3(0.42, 0.40, 0.36), vec3(0.58, 0.54, 0.47), rockGrain);
      vec3 meadowCol = mix(vec3(0.18, 0.35, 0.17), vec3(0.34, 0.49, 0.22), rockGrain * 0.65 + rockCoarse * 0.35);
      vec3 snowCol = vec3(0.94, 0.96, 1.0);

      vec3 albedo = mix(rockCol, screeCol, screeMask * 0.55);
      albedo = mix(albedo, meadowCol, grassMask);
      albedo = mix(albedo, snowCol, snowMask);
      // Wet dark river-washed granite boulders near water level
      float wetMask = 1.0 - smoothstep(0.0, 2.2, wp.y);
      albedo *= mix(1.0, 0.62, wetMask);

      if (uArtStyle == 5) {
        // Architectural Studio Clay Maquette topographic stepped plaster model!
        float contour = smoothstep(0.05, 0.13, abs(fract(wp.y * 0.35) - 0.5));
        albedo = mix(vec3(0.84, 0.81, 0.76), vec3(0.94, 0.92, 0.88), snowMask * 0.5 + 0.35) * mix(0.90, 1.0, contour);
        float diff = clamp(ndl * sh, 0.0, 1.0);
        col = albedo * (vec3(0.38, 0.40, 0.44) + vec3(0.76, 0.73, 0.68) * diff);
      } else if (uArtStyle == 1) {
        // Moebius / Sable Ligne Claire Ink & Stepped Cel Alpine Terrain!
        float litV = mix(ndl, min(ndl, -0.3), (1.0 - sh) * 0.85);
        float band = litV > 0.32 ? 1.12 : (litV > -0.05 ? 0.82 : 0.48);
        vec3 bTint = litV > 0.32
          ? mix(vec3(1.05, 1.02, 0.95), vec3(0.76, 0.84, 1.0), nightW)
          : (litV > -0.05 ? vec3(0.88, 0.92, 0.99) : vec3(0.54, 0.64, 0.88));
        col = albedo * bTint * band;
        // Crisp topographic Ligne Claire contour ink lines along ridges & elevation steps!
        float topoLine = 1.0 - smoothstep(0.025, 0.065, abs(fract(wp.y * 0.22) - 0.5));
        float ridgeInk = smoothstep(0.72, 0.90, 1.0 - max(0.0, dot(N, -rd)));
        col = mix(col, vec3(0.05, 0.07, 0.12), clamp(topoLine * 0.28 + ridgeInk * 0.55, 0.0, 0.75));
      } else {
        vec3 sunCol = mix(mix(vec3(1.18, 1.13, 1.04), vec3(1.32, 0.92, 0.64), sunsetW), vec3(0.45, 0.56, 0.82), nightW);
        vec3 ambCol = mix(mix(vec3(0.32, 0.42, 0.58), vec3(0.36, 0.34, 0.52), sunsetW), vec3(0.11, 0.15, 0.28), nightW);
        float diff = max(0.0, ndl) * sh;
        col = albedo * (ambCol * (0.72 + 0.28 * N.y) + sunCol * diff);
        if (uArtStyle == 2) {
          // Painterly Gouache warm-sun vs cool-violet shadow shift!
          float wMix = smoothstep(-0.15, 0.55, ndl * sh);
          col *= mix(vec3(0.78, 0.82, 1.16), vec3(1.12, 1.03, 0.90), wMix);
        }
        // Subtle crisp alpenglow rim on sunlit snowfields
        col += vec3(0.95, 0.88, 0.82) * snowMask * pow(max(0.0, dot(reflect(-sunD, N), -rd)), 12.0) * sh * 0.22 * (1.0 - nightW * 0.8);
      }

      // Warm bridge lantern bounce onto nearby canyon cliff abutments!
      float warmW = clamp(0.25 + sunsetW * 0.55 + nightW * 0.95, 0.0, 1.1);
      for (int i = 0; i < 6; i++) {
        if (i >= uShadowCount) break;
        vec4 l = uShadowCasters[i];
        if (l.w <= 0.1) continue;
        float d = length(wp.xz - l.xz);
        float glow = exp(-(d * d) / max(l.w * l.w * 2.2, 2.0));
        col += albedo * vec3(1.0, 0.68, 0.28) * glow * warmW * 0.45;
      }
    }

    float fogStart = uArtStyle == 5 ? 95.0 : 58.0;
    float fogT = uFogDensity <= 0.001
      ? 0.0
      : clamp(1.0 - exp(-pow(max(0.0, hitDist - fogStart) * 0.0044 * max(uFogDensity, 0.16), 1.45)), 0.0, 0.92);
    vec3 finalCol = mix(col, skyHor, fogT);

    vec4 clipPos = uViewProj * vec4(wp, 1.0);
    gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 0.99997);
    outColor = vec4(finalCol, 1.0);
    outAux = vec4(0.0, emis, isLegacy ? 1.0 : 0.0, 0.0);
    return;
  }

  // =========================================================================
  // WORLDS A & B: SUNKEN ROMAN LAGOON & SUNLIT MEDITERRANEAN COVE WATER PLANE
  // =========================================================================
  if (rd.y >= -0.001) {
    outColor = vec4(skyCol, 1.0);
    outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
    gl_FragDepth = 0.99998;
    return;
  }

  float t = (0.0 - ro.y) / rd.y;
  if (t <= 0.0 || t > 620.0) {
    outColor = vec4(skyCol, 1.0);
    outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
    gl_FragDepth = 0.99998;
    return;
  }

  vec3 wp = ro + rd * t;
  vec2 xz = wp.xz;
  float n1 = vnoise(xz * 0.16 + vec2(uWaveTime * 0.18, -uWaveTime * 0.12));
  float n2 = vnoise(xz * 0.52 - vec2(uWaveTime * 0.25, uWaveTime * 0.16));
  vec3 waterN = normalize(vec3((n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.09, 1.0, (n2 - 0.5) * 0.14 - (n1 - 0.5) * 0.08));
  float fres = pow(1.0 - max(0.0, dot(-rd, waterN)), 3.5);
  vec3 reflDir = reflect(rd, waterN);
  vec3 reflCol = mix(skyHor, skyZen, clamp(reflDir.y * 1.4, 0.0, 1.0));

  vec3 col;
  float emis = 0.0;

  if (uArtStyle == 5) {
    // Architectural Studio Acrylic/Resin Water Base for Clay Maquette mode!
    float grid = smoothstep(0.02, 0.05, min(fract(xz.x * 0.25), fract(xz.y * 0.25)));
    col = mix(vec3(0.76, 0.80, 0.84), vec3(0.84, 0.86, 0.88), grid * 0.5 + fres * 0.35);
  } else if (!isCove) {
    // WORLD A: Bioluminescent Sunken Roman Lagoon Floor + Caustic Teal-Emerald Water
    float rRot = length(xz - vec2(0.0, -2.0));
    float shallow = smoothstep(26.0, 4.0, rRot);
    float caust = caustic(xz * 0.30, uWaveTime) * 0.65 + caustic(xz * 0.55 + 4.2, -uWaveTime * 0.7) * 0.35;
    vec3 deepCol = vec3(0.015, 0.055, 0.095);
    vec3 shalCol = vec3(0.045, 0.195, 0.245);
    col = mix(deepCol, shalCol, shallow * 0.85);
    if (rRot < 15.0) {
      float tile = (fract(xz.x * 0.5) < 0.07 || fract(xz.y * 0.5) < 0.07) ? 0.86 : 1.04;
      col *= mix(1.0, tile, smoothstep(15.0, 9.0, rRot));
    }
    col += vec3(0.10, 0.52, 0.58) * caust * (0.28 + shallow * 0.55);
    col += vec3(0.26, 0.72, 0.66) * exp(-rRot * rRot * 0.0085) * 0.62;
    col += vec3(0.85, 0.55, 0.18) * exp(-rRot * rRot * 0.035) * 0.45;
    float ringFoam = smoothstep(0.9, 0.0, abs(rRot - 12.2 + (n2 - 0.5) * 1.1));
    col = mix(col, vec3(0.35, 0.78, 0.82), ringFoam * 0.38);
    col = mix(col, reflCol, fres * 0.48);

    if (uShadowCount > 0) {
      vec4 sp = uShadowCasters[0];
      if (sp.w > 0.5) {
        float d = length(xz - sp.xz);
        float pool = exp(-(d * d) / max(sp.w * sp.w * 1.1, 1.0));
        col += vec3(0.75, 0.92, 0.68) * pool * 0.78;
        emis = max(emis, pool * 0.32);
      }
    }
    for (int i = 1; i < 6; i++) {
      if (i >= uShadowCount) break;
      vec4 c = uShadowCasters[i];
      if (c.w <= 0.1) continue;
      float d = length(xz - c.xz);
      float pool = exp(-(d * d) / max(c.w * c.w * 0.9, 0.5));
      vec3 glowCol = (i == 2 || i == 4) ? vec3(0.88, 0.28, 0.56) : vec3(0.16, 0.84, 0.82);
      col += glowCol * pool * 0.52;
      emis = max(emis, pool * 0.22);
    }
  } else {
    // WORLD B: Sunlit Mediterranean Turquoise Cove + Warm Sandy Shallows + Gentle Foam!
    float dWestCliff = length(xz - vec2(-18.0, -4.0));
    float dEastCliff = length(xz - vec2(20.0, -6.0));
    float shallow = clamp(
      smoothstep(22.0, 9.0, dWestCliff) +
      smoothstep(22.0, 9.0, dEastCliff) +
      smoothstep(18.0, 5.0, abs(xz.y + 8.0)) * 0.35,
      0.0, 1.0
    );
    float caust = caustic(xz * 0.34, uWaveTime * 0.9);
    vec3 deepSea = mix(mix(vec3(0.06, 0.30, 0.48), vec3(0.08, 0.22, 0.40), sunsetW), vec3(0.025, 0.075, 0.155), nightW);
    vec3 shalSea = mix(mix(vec3(0.18, 0.66, 0.68), vec3(0.24, 0.52, 0.56), sunsetW), vec3(0.055, 0.18, 0.26), nightW);
    vec3 sandBed = mix(mix(vec3(0.76, 0.70, 0.52), vec3(0.72, 0.54, 0.38), sunsetW), vec3(0.14, 0.15, 0.22), nightW);

    col = mix(deepSea, shalSea, shallow * 0.82);
    col = mix(col, sandBed, smoothstep(0.68, 1.0, shallow) * 0.42);
    col += vec3(0.28, 0.52, 0.50) * caust * shallow * (1.0 - nightW * 0.72) * 0.38;

    float shoreBand = smoothstep(0.66, 0.82, shallow + (n1 - 0.5) * 0.22) * (1.0 - smoothstep(0.84, 0.98, shallow));
    float foamWave = sin(shallow * 28.0 - uWaveTime * 2.4 + n1 * 5.5) * 0.5 + 0.5;
    float foam = shoreBand * smoothstep(0.45, 0.85, foamWave) * 0.42;
    col = mix(col, mix(vec3(0.92, 0.96, 0.99), vec3(0.96, 0.84, 0.70), sunsetW), foam * (1.0 - nightW * 0.65));

    vec3 H = normalize(normalize(uSunDir) - rd);
    float sunGlint = pow(max(0.0, dot(waterN, H)), 64.0) * (1.0 - nightW * 0.85);
    col += mix(vec3(1.0, 0.96, 0.84), vec3(1.0, 0.68, 0.36), sunsetW) * sunGlint * 1.15;
    col = mix(col, reflCol, fres * 0.44);

    if (abs(xz.x) < 15.0 && abs(xz.y + 0.5) < 4.5) {
      float sh = (1.0 - smoothstep(11.0, 15.0, abs(xz.x))) * (1.0 - smoothstep(1.8, 4.5, abs(xz.y + 0.5)));
      col *= (1.0 - sh * 0.34);
    }

    float warmW = clamp(0.25 + sunsetW * 0.65 + nightW * 0.95, 0.0, 1.1);
    for (int i = 0; i < 6; i++) {
      if (i >= uShadowCount) break;
      vec4 l = uShadowCasters[i];
      if (l.w <= 0.1) continue;
      float d = length(xz - l.xz);
      float pool = exp(-(d * d) / max(l.w * l.w * 1.2, 0.8)) * (0.75 + 0.25 * n2);
      col += vec3(0.96, 0.62, 0.22) * pool * warmW * 0.55;
      emis = max(emis, pool * warmW * 0.20);
    }
  }

  float fogT = uFogDensity <= 0.001
    ? 0.0
    : clamp(1.0 - exp(-pow(max(0.0, t - 55.0) * 0.0055 * uFogDensity, 1.5)), 0.0, 0.95);
  vec3 finalCol = mix(col, skyHor, fogT);

  vec4 clipPos = uViewProj * vec4(wp, 1.0);
  gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 0.99997);
  outColor = vec4(finalCol, 1.0);
  outAux = vec4(0.0, emis, isLegacy ? 1.0 : 0.0, 0.0);
}`;
