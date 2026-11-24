/**
 * Tri-Atmosphere Ground, Water & Modern Multifractal Terrain Shader for AA-GeoField:
 *  - uSeed < 50    -> World A: Bioluminescent Sunken Roman Sea Cave (teal Voronoi caustics + spotlight)
 *  - uSeed 50..119 -> World B: Sunlit Mediterranean Cove (crystalline turquoise sandbars + surf foam)
 *  - uSeed >= 120  -> World C: Modern High-Detail Musgrave Ridged Multifractal + Swiss-Turbulence
 *                              Alpine Glacial Valley (6-octave raymarch + 10-octave faceted rock/gully
 *                              detail normals, concavity AO, crisp wind-drifted snowpack, matte
 *                              geological lighting with ZERO plastic gloss, and Rayleigh aerial haze!)
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

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
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

// Angular Worley/Voronoi fractured alpine rock cleavage (returns F1, F2-F1 crack edge, cellId)
vec3 rockVoronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = o.x;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}

const mat2 OCT_ROT = mat2(0.8, 0.6, -0.6, 0.8);

// Ken Musgrave's Ridged Multifractal (1993) with 6 octaves for sharp alpine arêtes
float musgraveRidged2D(vec2 p) {
  float sum = 0.0;
  float amp = 0.56;
  float weight = 1.0;
  for (int i = 0; i < 6; i++) {
    float n = vnoise2Grad(p).x * 2.0 - 1.0;
    float sig = 1.0 - abs(n);
    sig = sig * sig * weight;
    weight = clamp(sig * 2.15, 0.0, 1.0);
    sum += sig * amp;
    p = (OCT_ROT * p) * 2.09 + vec2(17.3, 11.7);
    amp *= 0.49;
  }
  return sum;
}

// Giliam de Carpentier's Swiss-Turbulence (analytical derivative-damped pseudo-erosion, 6 octaves)
float swissTurbulence2D(vec2 p, float erosion) {
  float sum = 0.0;
  float amp = 0.52;
  float freq = 1.0;
  vec2 dSum = vec2(0.0);
  for (int i = 0; i < 6; i++) {
    vec3 g = vnoise2Grad(p + 0.28 * dSum);
    float signedV = g.x * 2.0 - 1.0;
    float n = 1.0 - abs(signedV);
    float sgn = signedV >= 0.0 ? -2.0 : 2.0;
    vec2 grad = g.yz * sgn;
    float damp = 1.0 / (1.0 + erosion * 1.65 * dot(dSum, dSum));
    sum += amp * n * n * damp;
    dSum += amp * grad * freq * 0.36;
    p = (OCT_ROT * p) * 2.05 + vec2(23.1, 9.4);
    freq *= 2.05;
    amp *= 0.48;
  }
  return sum;
}

float alpineRiverCenterX(float z) {
  return sin(z * 0.019) * 18.0 + sin(z * 0.047) * 5.0;
}

// Exact 1:1 GPU counterpart to @aastack/geofield sampleMultifractalHeight(x, z, cfg)!
float alpineTerrainHeight(vec2 xz) {
  float maxH = max(16.0, uMaxHeight);
  float ridgeW = clamp(uTerrainScale, 0.0, 1.8);
  float erosion = clamp(uTerraceSteps, 0.0, 1.8);

  vec2 w = xz * 0.0095 + vec2(uSeed * 0.13, -uSeed * 0.09);
  vec2 warp = vec2(
    vnoise2Grad(w * 1.2 + vec2(3.1, -1.4)).x - 0.5,
    vnoise2Grad(w * 1.2 + vec2(-4.7, 2.8)).x - 0.5
  ) * 0.65;
  vec2 sp = w + warp;

  float ridged = musgraveRidged2D(sp);
  float swiss = swissTurbulence2D(sp * 1.38 + vec2(4.3, -2.7), erosion);

  float distMassif = smoothstep(-28.0, -185.0, xz.y) * 0.92;
  float sideRanges = smoothstep(34.0, 150.0, abs(xz.x)) * 0.58;
  float macroEnv = 0.28 + distMassif + sideRanges;

  float rawField = mix(swiss * 0.92, ridged * 0.72 + swiss * 0.38, clamp(ridgeW * 0.80, 0.0, 1.0));
  float peaked = pow(max(0.0, rawField * 2.05), 1.32) * (0.64 + 0.52 * ridgeW);
  float h = peaked * macroEnv * maxH * 0.88 + 2.4;

  float rX = alpineRiverCenterX(xz.y);
  float dRiver = abs(xz.x - rX);
  float pinch = exp(-((xz.y + 1.0) * (xz.y + 1.0)) / (24.0 * 24.0));
  float headwallClose = smoothstep(-115.0, -230.0, xz.y);
  float vFloor = mix(15.5, 8.6, pinch) * (1.0 - headwallClose * 0.78);
  float vSlope = mix(52.0, 22.5, pinch) * (1.0 - headwallClose * 0.45);
  float valleyT = smoothstep(vFloor, vSlope, dRiver);

  float riverBed = -2.2 + (vnoise2Grad(xz * 0.09).x - 0.5) * 1.1;
  float valleyH = mix(riverBed, h, max(valleyT, headwallClose * 0.82));

  float spurBand = smoothstep(26.0, 8.0, abs(xz.y + 3.0)) *
    smoothstep(13.5, 20.5, dRiver) *
    smoothstep(42.0, 26.0, dRiver);
  float spurRock = 10.6 + (swiss - 0.45) * 2.2;
  h = mix(valleyH, spurRock, spurBand * 0.90);

  float foreMouth = smoothstep(6.0, 38.0, xz.y) * smoothstep(88.0, 20.0, dRiver);
  h = mix(h, min(h, riverBed + smoothstep(12.0, 48.0, dRiver) * 8.5), foreMouth * 0.90);
  return h;
}

// High-frequency 4-octave micro-crag + fractured Voronoi rock relief (Evaluated ONLY at shading hit!)
// Gives razor-sharp faceted alpine granite faces and dendritic scree chutes up close without raymarch cost!
float alpineMicroDetail(vec2 xz, float slope, float erosion) {
  // 4 extra sharp ridged octaves (10 octaves total!)
  vec2 p = xz * 0.14;
  float d = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 4; i++) {
    float r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    d += r * r * amp;
    p = (OCT_ROT * p) * 2.18 + vec2(9.1, 5.7);
    amp *= 0.48;
  }
  // Sharp angular fractured Voronoi granite planes on steep faces (ZERO smooth putty!)
  vec3 vor = rockVoronoi(xz * 0.24 + vec2(d * 0.35, -d * 0.25));
  float rockCleavage = smoothstep(0.02, 0.24, vor.y) * (0.45 + 0.55 * vor.z);
  float steepW = smoothstep(0.12, 0.42, slope);
  return (d * 1.25 + rockCleavage * 0.85 * steepW) * (0.55 + 0.45 * erosion);
}

vec3 alpineTerrainNormalHigh(vec2 xz, float dist, float erosion, out float macroSlope) {
  float eMacro = max(0.35, dist * 0.0035);
  float hL = alpineTerrainHeight(xz - vec2(eMacro, 0.0));
  float hR = alpineTerrainHeight(xz + vec2(eMacro, 0.0));
  float hD = alpineTerrainHeight(xz - vec2(0.0, eMacro));
  float hU = alpineTerrainHeight(xz + vec2(0.0, eMacro));
  vec3 nMacro = normalize(vec3(hL - hR, 2.0 * eMacro, hD - hU));
  macroSlope = clamp(1.0 - nMacro.y, 0.0, 1.0);

  // Add high-frequency 10-octave rocky micro-facets attenuated cleanly with distance (zero aliasing!)
  float detailFade = 1.0 - smoothstep(45.0, 260.0, dist);
  if (detailFade > 0.01) {
    float eMic = max(0.14, dist * 0.0022);
    float mL = alpineMicroDetail(xz - vec2(eMic, 0.0), macroSlope, erosion);
    float mR = alpineMicroDetail(xz + vec2(eMic, 0.0), macroSlope, erosion);
    float mD = alpineMicroDetail(xz - vec2(0.0, eMic), macroSlope, erosion);
    float mU = alpineMicroDetail(xz + vec2(0.0, eMic), macroSlope, erosion);
    vec3 nMicro = vec3((mL - mR) / (2.0 * eMic), 0.0, (mD - mU) / (2.0 * eMic));
    return normalize(nMacro + nMicro * (0.52 * detailFade));
  }
  return nMacro;
}

// Fast 18-step analytical soft mountain self-shadows across the glacial valley
float alpineSoftShadow(vec3 ro, vec3 sunDir) {
  float res = 1.0;
  float t = 1.4;
  for (int i = 0; i < 18; i++) {
    vec3 p = ro + sunDir * t;
    float h = alpineTerrainHeight(p.xz);
    float diff = p.y - h;
    if (diff < 0.06) return 0.12;
    res = min(res, 4.4 * diff / t);
    t += clamp(diff * 0.58, 1.6, 18.0);
    if (t > 210.0) break;
  }
  return clamp(res, 0.12, 1.0);
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
  vec3 sunD = normalize(uSunDir);

  vec3 skyZen, skyHor;
  if (isAlpine) {
    // Crisp photographic high-altitude Rayleigh alpine sky
    vec3 dayZen = vec3(0.17, 0.40, 0.74);
    vec3 dayHor = vec3(0.68, 0.80, 0.92);
    vec3 sunZen = vec3(0.19, 0.28, 0.52);
    vec3 sunHor = vec3(0.94, 0.67, 0.48);
    vec3 nitZen = vec3(0.03, 0.055, 0.13);
    vec3 nitHor = vec3(0.10, 0.16, 0.28);
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
  if (isCove || isAlpine) {
    float sunAmt = max(0.0, dot(rd, sunD));
    vec3 sunGlowCol = mix(vec3(1.0, 0.94, 0.82), vec3(1.0, 0.62, 0.34), sunsetW);
    skyCol += sunGlowCol * pow(sunAmt, 14.0) * (1.0 - nightW * 0.85) * 0.52;
  }

  // =========================================================================
  // WORLD C: MODERN HIGH-DETAIL MULTIFRACTAL ALPINE VALLEY (ZERO BRYCE LOOK!)
  // =========================================================================
  if (isAlpine) {
    float maxTerrY = max(55.0, uMaxHeight * 2.15);
    float tWater = (ro.y > 0.0 && rd.y < -0.0005) ? (0.0 - ro.y) / rd.y : 1e9;
    float t = (ro.y > maxTerrY && rd.y < -0.001) ? (maxTerrY - ro.y) / rd.y : 0.4;
    float tPrev = t;
    bool hitTerr = false;
    float tHit = 1e9;

    if (!(ro.y > maxTerrY && rd.y >= 0.0)) {
      for (int i = 0; i < 124; i++) {
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
        float stepD = clamp(diff * 0.36, 0.20 + t * 0.0045, 11.0) * uStepFactor;
        t += stepD;
        if (t > 560.0) break;
      }
    }

    bool hitWater = (tWater > 0.1 && tWater < 560.0 && (!hitTerr || tWater < tHit));
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

    if (hitWater) {
      hitDist = tWater;
      wp = ro + rd * tWater;
      vec2 xz = wp.xz;
      float bedH = alpineTerrainHeight(xz);
      float depth = clamp(-bedH * 0.48, 0.0, 1.0);

      // Crisp glacial mountain stream ripples + rocky shoal cobbles visible in shallow edge!
      float n1 = vnoise(xz * 0.28 - vec2(0.0, uWaveTime * 0.95));
      float n2 = vnoise(xz * 0.85 - vec2(sin(xz.y * 0.04) * 0.8, uWaveTime * 1.55));
      float cobble = rockVoronoi(xz * 0.95).x;
      vec3 waterN = normalize(vec3((n1 - 0.5) * 0.16 + (n2 - 0.5) * 0.10, 1.0, (n2 - 0.5) * 0.14 - (n1 - 0.5) * 0.09));
      float fres = pow(1.0 - max(0.0, dot(-rd, waterN)), 3.4);
      vec3 reflDir = reflect(rd, waterN);
      vec3 reflCol = mix(skyHor, skyZen, clamp(reflDir.y * 1.5, 0.0, 1.0));

      vec3 glacialDeep = mix(vec3(0.05, 0.26, 0.35), vec3(0.02, 0.08, 0.15), nightW);
      vec3 glacialShal = mix(vec3(0.16, 0.48, 0.52), vec3(0.05, 0.16, 0.22), nightW);
      vec3 pebbleBed = mix(vec3(0.32, 0.31, 0.29), vec3(0.10, 0.11, 0.15), nightW) * (0.78 + 0.32 * cobble);

      col = mix(glacialShal, glacialDeep, smoothstep(0.15, 0.85, depth));
      col = mix(pebbleBed, col, smoothstep(0.02, 0.32, depth));
      // Subtle rocky bank whitewater foam
      float bankFoam = smoothstep(0.28, 0.03, depth + (n1 - 0.5) * 0.14) * smoothstep(0.35, 0.78, n2);
      col = mix(col, mix(vec3(0.88, 0.93, 0.97), vec3(0.92, 0.82, 0.72), sunsetW), bankFoam * (1.0 - nightW * 0.65) * 0.55);

      vec3 H = normalize(sunD - rd);
      float glint = pow(max(0.0, dot(waterN, H)), 72.0) * (1.0 - nightW * 0.85);
      col += mix(vec3(1.0, 0.97, 0.88), vec3(1.0, 0.72, 0.42), sunsetW) * glint * 0.95;
      col = mix(col, reflCol, fres * 0.46);

      if (abs(xz.x) < 18.0 && abs(xz.y) < 5.0) {
        float bSh = (1.0 - smoothstep(12.0, 18.0, abs(xz.x))) * (1.0 - smoothstep(2.0, 5.0, abs(xz.y)));
        col *= (1.0 - bSh * 0.38);
      }
      float warmW = clamp(0.22 + sunsetW * 0.55 + nightW * 0.95, 0.0, 1.1);
      for (int i = 0; i < 6; i++) {
        if (i >= uShadowCount) break;
        vec4 l = uShadowCasters[i];
        if (l.w <= 0.1) continue;
        float d = length(xz - l.xz);
        float pool = exp(-(d * d) / max(l.w * l.w * 1.4, 1.0)) * (0.75 + 0.25 * n2);
        col += vec3(0.96, 0.62, 0.22) * pool * warmW * 0.48;
        emis = max(emis, pool * warmW * 0.16);
      }
    } else {
      hitDist = tHit;
      wp = ro + rd * tHit;
      float erosion = clamp(uTerraceSteps, 0.0, 1.8);
      float macroSlope;
      vec3 N = alpineTerrainNormalHigh(wp.xz, hitDist, erosion, macroSlope);
      float fineSlope = clamp(1.0 - N.y, 0.0, 1.0);

      // Analytical terrain concavity AO (gullies & couloirs darken organically, sharp crests catch light!)
      float hAvg = 0.25 * (
        alpineTerrainHeight(wp.xz + vec2(3.5, 0.0)) +
        alpineTerrainHeight(wp.xz - vec2(3.5, 0.0)) +
        alpineTerrainHeight(wp.xz + vec2(0.0, 3.5)) +
        alpineTerrainHeight(wp.xz - vec2(0.0, 3.5))
      );
      float concavity = wp.y - hAvg; // positive on ridge crests, negative in eroded gullies
      float terrAo = clamp(0.76 + concavity * 0.14, 0.42, 1.08);

      // Sharp geological rock cleavage & scree rubble texture (ZERO horizontal zebra bands!)
      vec3 vor = rockVoronoi(wp.xz * 0.24);
      float rPatch = vnoise(wp.xz * 0.075);
      float rFine = vnoise(wp.xz * 0.95);
      float crackDark = smoothstep(0.015, 0.14, vor.y);

      // Realistic desaturated alpine palettes (alpine granite, talus scree, olive pine heath, matte snow!)
      vec3 graniteDark = vec3(0.24, 0.26, 0.30);
      vec3 graniteMid  = vec3(0.39, 0.38, 0.37);
      vec3 graniteWarm = vec3(0.47, 0.44, 0.40);
      vec3 rockCol = mix(graniteDark, mix(graniteMid, graniteWarm, rPatch), 0.35 + 0.65 * vor.z);
      rockCol *= mix(0.68, 1.05, crackDark) * (0.90 + 0.18 * rFine);

      vec3 screeCol = mix(vec3(0.38, 0.37, 0.35), vec3(0.50, 0.48, 0.44), rFine * 0.7 + vor.z * 0.3);
      vec3 grassCol = mix(vec3(0.20, 0.30, 0.16), vec3(0.31, 0.38, 0.20), rPatch * 0.6 + rFine * 0.4);
      vec3 snowCol  = vec3(0.91, 0.93, 0.96);

      // Crisp geological biome masks (tight boundaries modulated by fracture noise, NEVER blurry airbrush!)
      float screeMask = smoothstep(0.20, 0.34, macroSlope) * (1.0 - smoothstep(0.46, 0.62, macroSlope));
      float meadowField = (1.0 - smoothstep(14.0, 21.5, wp.y + (rPatch - 0.5) * 4.0))
                        * (1.0 - smoothstep(0.24, 0.40, fineSlope))
                        * smoothstep(1.2, 3.0, wp.y);
      float meadowMask = smoothstep(0.32, 0.58, meadowField + (rFine - 0.5) * 0.20);

      // Wind-drifted alpine snowpack crowns high ridges & concave couloirs while sheer rock needles pierce through!
      float snowAlt = smoothstep(16.5, 29.0, wp.y - concavity * 2.0 + (rPatch - 0.5) * 4.5);
      float snowSlope = 1.0 - smoothstep(0.34, 0.58, fineSlope);
      float snowField = snowAlt * snowSlope + (rFine - 0.5) * 0.14;
      float snowMask = smoothstep(0.34, 0.45, snowField);

      vec3 albedo = mix(rockCol, screeCol, screeMask * 0.68);
      albedo = mix(albedo, grassCol, meadowMask);
      albedo = mix(albedo, snowCol, snowMask);

      // Damp river-washed granite cobblestones right along the glacial river waterline
      float wetBank = 1.0 - smoothstep(0.0, 2.2, wp.y);
      albedo = mix(albedo, screeCol * 0.62, wetBank * 0.85);

      // Physically-grounded MATTE diffuse + soft analytical mountain shadows (ZERO plastic specular sheen!)
      float sh = alpineSoftShadow(wp + N * 0.75, sunD);
      float ndl = max(0.0, dot(N, sunD));
      float backBounce = max(0.0, dot(N, normalize(vec3(-sunD.x, 0.25, -sunD.z))));

      vec3 sunCol = mix(mix(vec3(1.16, 1.11, 1.02), vec3(1.34, 0.88, 0.60), sunsetW), vec3(0.42, 0.54, 0.80), nightW);
      vec3 skyAmb = mix(mix(vec3(0.30, 0.41, 0.58), vec3(0.34, 0.33, 0.50), sunsetW), vec3(0.10, 0.14, 0.26), nightW);
      vec3 bounceCol = mix(vec3(0.22, 0.24, 0.22), vec3(0.32, 0.24, 0.20), sunsetW) * (1.0 - nightW * 0.7);

      col = albedo * (skyAmb * (0.55 + 0.45 * N.y) * terrAo + bounceCol * backBounce * 0.35 * terrAo + sunCol * ndl * sh);

      // Warm dusk bridge lantern spill onto nearby granite abutments
      float warmW = clamp(0.22 + sunsetW * 0.55 + nightW * 0.95, 0.0, 1.1);
      for (int i = 0; i < 6; i++) {
        if (i >= uShadowCount) break;
        vec4 l = uShadowCasters[i];
        if (l.w <= 0.1) continue;
        float d = length(wp.xz - l.xz);
        float glow = exp(-(d * d) / max(l.w * l.w * 2.2, 2.0));
        col += albedo * vec3(1.0, 0.68, 0.28) * glow * warmW * 0.42;
      }
    }

    // Physical Rayleigh + Mie alpine aerial perspective (separates foreground, valley & distant snowy massifs!)
    float fogDensity = max(uFogDensity, 0.16);
    float fogT = clamp(1.0 - exp(-max(0.0, hitDist - 42.0) * 0.0024 * (0.65 + fogDensity * 1.4)), 0.0, 0.86);
    float mieSun = pow(max(0.0, dot(rd, sunD)), 6.0) * (1.0 - nightW * 0.85);
    vec3 hazeCol = mix(skyHor, mix(vec3(1.0, 0.90, 0.76), vec3(1.0, 0.64, 0.38), sunsetW), mieSun * 0.38);
    vec3 finalCol = mix(col, hazeCol, fogT);

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

  if (!isCove) {
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

    vec3 H = normalize(sunD - rd);
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
