/**
 * Dual-Atmosphere Water, Caustics & Sky Ground Shader for the AA-GeoField Non-Legoland Showcase.
 *  - uSeed < 50  -> World A: Bioluminescent Sunken Roman Sea Cave (emerald-teal animated Voronoi
 *                   caustics, subterranean cavern sky dome, warm thermal core & Bathysphere spotlight!)
 *  - uSeed >= 50 -> World B: Sunlit Mediterranean Cove (crystalline shallow turquoise sandbars,
 *                   golden-hour sky, sunlit wave specular glints, bridge shadow & warm lantern spill!)
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

  bool isCove = uSeed >= 50.0;
  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.6);
  float nightW  = clamp((uTimeOfDay - 0.46) / 0.54, 0.0, 1.0);

  vec3 skyZen, skyHor;
  if (!isCove) {
    // Subterranean volcanic sea-cave twilight indigo & bioluminescent teal mist
    skyZen = mix(vec3(0.024, 0.055, 0.115), vec3(0.012, 0.025, 0.058), nightW);
    skyHor = mix(vec3(0.068, 0.155, 0.215), vec3(0.032, 0.088, 0.135), nightW);
  } else {
    // Mediterranean sunlit sky / warm golden hour / romantic coastal twilight
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
  // Subtle warm sun halo on the Mediterranean horizon
  if (isCove) {
    float sunAmt = max(0.0, dot(rd, normalize(uSunDir)));
    vec3 sunGlowCol = mix(vec3(1.0, 0.92, 0.72), vec3(1.0, 0.58, 0.28), sunsetW);
    skyCol += sunGlowCol * pow(sunAmt, 16.0) * (1.0 - nightW * 0.85) * 0.65;
  }

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
    // WORLD A: Bioluminescent Sunken Roman Lagoon Floor + Caustic Teal-Emerald Water
    float rRot = length(xz - vec2(0.0, -2.0));
    float shallow = smoothstep(26.0, 4.0, rRot);
    float caust = caustic(xz * 0.30, uWaveTime) * 0.65 + caustic(xz * 0.55 + 4.2, -uWaveTime * 0.7) * 0.35;
    vec3 deepCol = vec3(0.015, 0.055, 0.095);
    vec3 shalCol = vec3(0.045, 0.195, 0.245);
    col = mix(deepCol, shalCol, shallow * 0.85);
    // Crisp underwater marble tile hint beneath shallow center of the sunken Rotunda!
    if (rRot < 15.0) {
      float tile = (fract(xz.x * 0.5) < 0.07 || fract(xz.y * 0.5) < 0.07) ? 0.86 : 1.04;
      col *= mix(1.0, tile, smoothstep(15.0, 9.0, rRot));
    }
    // Luminous teal-cyan caustics dancing across the sunken floor
    col += vec3(0.10, 0.52, 0.58) * caust * (0.28 + shallow * 0.55);
    // Warm golden brazier & sunlit oculus shimmer at lagoon center
    col += vec3(0.26, 0.72, 0.66) * exp(-rRot * rRot * 0.0085) * 0.62;
    col += vec3(0.85, 0.55, 0.18) * exp(-rRot * rRot * 0.035) * 0.45;
    // Soft foam ring right along submerged rotunda plinth & surrounding basalt rocks
    float ringFoam = smoothstep(0.9, 0.0, abs(rRot - 12.2 + (n2 - 0.5) * 1.1));
    col = mix(col, vec3(0.35, 0.78, 0.82), ringFoam * 0.38);
    col = mix(col, reflCol, fres * 0.48);

    // Live Bathysphere underwater golden-cyan spotlight pool (uShadowCasters[0])
    if (uShadowCount > 0) {
      vec4 sp = uShadowCasters[0];
      if (sp.w > 0.5) {
        float d = length(xz - sp.xz);
        float pool = exp(-(d * d) / max(sp.w * sp.w * 1.1, 1.0));
        col += vec3(0.75, 0.92, 0.68) * pool * 0.78;
        emis = max(emis, pool * 0.32);
      }
    }
    // Live glowing coral & crystal pools (uShadowCasters[1..4])
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
    float dChannel = abs(xz.x - sin(xz.y * 0.06) * 4.0);
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

    // Gentle organic shoreline surf foam lapping around both limestone headlands & bridge piers!
    float shoreBand = smoothstep(0.66, 0.82, shallow + (n1 - 0.5) * 0.22) * (1.0 - smoothstep(0.84, 0.98, shallow));
    float foamWave = sin(shallow * 28.0 - uWaveTime * 2.4 + n1 * 5.5) * 0.5 + 0.5;
    float foam = shoreBand * smoothstep(0.45, 0.85, foamWave) * 0.42;
    col = mix(col, mix(vec3(0.92, 0.96, 0.99), vec3(0.96, 0.84, 0.70), sunsetW), foam * (1.0 - nightW * 0.65));

    // Specular sunlit wave sparkle + Fresnel sky reflection
    vec3 H = normalize(normalize(uSunDir) - rd);
    float sunGlint = pow(max(0.0, dot(waterN, H)), 64.0) * (1.0 - nightW * 0.85);
    col += mix(vec3(1.0, 0.96, 0.84), vec3(1.0, 0.68, 0.36), sunsetW) * sunGlint * 1.15;
    col = mix(col, reflCol, fres * 0.44);

    // Soft cast shadow directly beneath the curved stone bridge (Z ~ 0, X in [-14..14])
    if (abs(xz.x) < 15.0 && abs(xz.y + 0.5) < 4.5) {
      float sh = (1.0 - smoothstep(11.0, 15.0, abs(xz.x))) * (1.0 - smoothstep(1.8, 4.5, abs(xz.y + 0.5)));
      col *= (1.0 - sh * 0.34);
    }

    // Warm golden reflection of bridge & cottage lanterns shimmering on the cove water!
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
    // Keep dChannel referenced cleanly
    col *= (1.0 - smoothstep(0.0, 1.0, -dChannel) * 0.0);
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
