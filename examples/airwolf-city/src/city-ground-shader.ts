/**
 * Custom @aastack/core WebGL2 Ground & Midnight Harbor Fragment Shader for Airwolf City.
 * Plugs cleanly into `new AASpriteRenderer(canvas, { background: "terrain", terrainShader: CITY_GROUND_FS })`
 * with exact gl_FragDepth occlusion against all 3D buildings, lighthouse, street cars, and Airwolf!
 *
 * Uses uShadowCasters[0] as Airwolf's world position (for real drop shadow) and
 * uShadowCasters[1] as Airwolf's live nose searchlight ground hit point [spotX, _, spotZ, spotRadius]!
 */

export const CITY_GROUND_FS = `#version 300 es
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
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Crisp 4x4 Bayer threshold for subtle pixel-art searchlight dither edge!
float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(floor(p), 4.0));
  int idx = ip.y * 4 + ip.x;
  const float b[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (b[idx] + 0.5) / 16.0;
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

  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.4);
  float nightW  = max(0.0, (uTimeOfDay - 0.48) / 0.52);

  // Midnight / Sunset / Day Sky gradient + twinkling stars at night
  vec3 skyZen = mix(mix(vec3(0.24, 0.54, 0.88), vec3(0.18, 0.14, 0.34), sunsetW), vec3(0.025, 0.04, 0.095), nightW);
  vec3 skyHor = mix(mix(vec3(0.68, 0.86, 0.98), vec3(0.96, 0.48, 0.30), sunsetW), vec3(0.065, 0.095, 0.19), nightW);
  float upT = pow(clamp(rd.y * 1.4, 0.0, 1.0), 0.72);
  vec3 skyCol = mix(skyHor, skyZen, upT);
  if (nightW > 0.35 && rd.y > 0.04) {
    // Crisp spherical-projected pinpoint stars (zero horizon vertical stretching!)
    vec2 sph = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, 0.0, 1.0)));
    vec2 sc = floor(sph * vec2(78.0, 78.0));
    vec2 sf = fract(sph * vec2(78.0, 78.0)) - 0.5;
    float st = hash21(sc);
    if (st > 0.986 && length(sf) < 0.34) {
      float tw = 0.60 + 0.40 * sin(uWaveTime * 2.8 + st * 95.0);
      float elevFade = smoothstep(0.04, 0.16, rd.y);
      skyCol += vec3(0.80, 0.88, 1.0) * tw * nightW * elevFade * 0.85;
    }
  }

  // Intersect ray with horizontal city island / harbor plane Y = 0
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

  // City Island footprint: X in [-56, 56], Z in [-48, 52] + North Lighthouse Pier (Z in [-80, -48]) + Boat Dock Slips
  bool inIsland = abs(xz.x) <= 56.0 && xz.y >= -48.0 && xz.y <= 52.0;
  bool inPier = (abs(xz.x) <= 6.2 && xz.y < -48.0 && xz.y >= -80.0) ||
                (abs(xz.x) <= 13.5 && xz.y <= -55.0 && xz.y >= -58.5);
  bool inLand = inIsland || inPier;

  vec3 col = vec3(0.0);
  float emis = 0.0;

  if (inLand) {
    vec2 cell = floor(xz * 1.4);
    float grain = (hash21(cell) - 0.5) * 0.05;

    if (inPier) {
      // Stone lighthouse pier with wooden deck boards & seawall curb extending out into the harbor!
      bool rim = abs(xz.x) > 5.0 || xz.y < -78.6;
      float plank = fract(xz.y * 0.65) < 0.14 ? -0.04 : 0.0;
      col = mix(mix(vec3(0.56, 0.58, 0.62), vec3(0.46, 0.40, 0.42), sunsetW), vec3(0.16, 0.21, 0.30), nightW);
      if (rim) col *= 1.24;
      col += plank + grain;
    } else {
      // Crisp city avenue grid: avenues at X = -26, 0, 26 and Z = -24, 0, 24 (width = 8.8)
      float ax = min(min(abs(xz.x), abs(xz.x - 26.0)), abs(xz.x + 26.0));
      float az = min(min(abs(xz.y), abs(xz.y - 24.0)), abs(xz.y + 24.0));
      bool isRoadX = ax < 4.4 && xz.y >= -48.0 && xz.y <= 46.0;
      bool isRoadZ = az < 4.4 && abs(xz.x) <= 50.0;
      bool isRoad = isRoadX || isRoadZ;
      bool isSeawall = abs(xz.x) > 53.5 || xz.y < -45.5 || xz.y > 49.5;
      bool isPark = xz.x > -21.0 && xz.x < -5.0 && xz.y > 5.0 && xz.y < 19.0;

      if (isSeawall) {
        col = mix(mix(vec3(0.62, 0.65, 0.70), vec3(0.52, 0.44, 0.46), sunsetW), vec3(0.17, 0.21, 0.30), nightW) + grain;
      } else if (isRoad) {
        col = mix(mix(vec3(0.24, 0.27, 0.33), vec3(0.20, 0.18, 0.24), sunsetW), vec3(0.065, 0.082, 0.135), nightW) + grain * 0.5;
        // Yellow dashed center lines (skipping intersections)
        bool inInter = isRoadX && isRoadZ;
        if (!inInter) {
          if (isRoadX && ax < 0.32 && fract(xz.y * 0.18) < 0.48) {
            col = mix(vec3(0.95, 0.78, 0.24), vec3(0.76, 0.58, 0.20), nightW);
          } else if (isRoadZ && az < 0.32 && fract(xz.x * 0.18) < 0.48) {
            col = mix(vec3(0.95, 0.78, 0.24), vec3(0.76, 0.58, 0.20), nightW);
          }
        }
        // Zebra crosswalk stripes right outside intersections
        if ((isRoadX && az >= 4.4 && az <= 6.2 && fract(xz.x * 0.75) < 0.52) ||
            (isRoadZ && ax >= 4.4 && ax <= 6.2 && fract(xz.y * 0.75) < 0.52)) {
          col = mix(vec3(0.84, 0.87, 0.92), vec3(0.32, 0.38, 0.50), nightW);
        }
      } else if (isPark) {
        // Cozy downtown pocket park + water fountain
        float fDist = length(xz - vec2(-13.0, 12.0));
        if (fDist < 2.2) {
          col = mix(vec3(0.26, 0.62, 0.88), vec3(0.12, 0.34, 0.58), nightW);
          emis = nightW * 0.25;
        } else {
          col = mix(mix(vec3(0.28, 0.56, 0.32), vec3(0.32, 0.40, 0.24), sunsetW), vec3(0.075, 0.17, 0.13), nightW) + grain * 1.1;
        }
      } else {
        // Concrete sidewalk & block plazas
        float tile = (fract(xz.x * 0.45) < 0.08 || fract(xz.y * 0.45) < 0.08) ? -0.025 : 0.0;
        col = mix(mix(vec3(0.46, 0.50, 0.56), vec3(0.38, 0.34, 0.38), sunsetW), vec3(0.115, 0.145, 0.215), nightW) + tile + grain;
      }

      // Warm golden streetlamp pools along main avenues at dusk/night!
      if (nightW > 0.15 || sunsetW > 0.2) {
        float lpGlow = max(nightW, sunsetW * 0.6);
        vec2 gCell = (floor((xz + 13.0) / 26.0) * 26.0);
        float dLamp = length(xz - (gCell + vec2(5.2, 5.2)));
        float dLamp2 = length(xz - (gCell + vec2(-5.2, -5.2)));
        float dMin = min(dLamp, dLamp2);
        float pool = exp(-dMin * dMin * 0.055) * lpGlow;
        col += vec3(0.52, 0.36, 0.14) * pool * 0.65;
      }
    }
  } else {
    // Shimmering Midnight Harbor Water + Fine Moonlit Ripples + Coastal City Reflections!
    float w1 = sin(xz.x * 0.18 + xz.y * 0.52 + uWaveTime * 1.8) * 0.5 + 0.5;
    float w2 = sin(xz.x * 0.34 - xz.y * 0.68 - uWaveTime * 1.45) * 0.5 + 0.5;
    float glint = pow(w1 * w2, 2.2) * exp(-t * 0.0055);
    vec3 deepW = mix(mix(vec3(0.09, 0.34, 0.62), vec3(0.12, 0.16, 0.32), sunsetW), vec3(0.022, 0.048, 0.115), nightW);
    vec3 crestW = mix(mix(vec3(0.28, 0.64, 0.90), vec3(0.76, 0.44, 0.36), sunsetW), vec3(0.10, 0.19, 0.34), nightW);
    col = mix(deepW, crestW, glint * 0.65 + (w1 * 0.10));

    // Subtle shoreline foam near seawall & north lighthouse pier
    float dIsland = max(abs(xz.x) - 56.0, max(xz.y - 52.0, -48.0 - xz.y));
    float dPier = max(abs(xz.x) - 6.2, max(xz.y - (-48.0), -80.0 - xz.y));
    float dShore = min(dIsland, dPier);
    float shoreFoam = (1.0 - smoothstep(0.0, 2.2, dShore)) * (0.55 + 0.45 * sin(uWaveTime * 2.5 + xz.x * 0.5 + xz.y * 0.5));
    col = mix(col, mix(vec3(0.78, 0.92, 1.0), vec3(0.24, 0.36, 0.56), nightW), shoreFoam * 0.55);

    // Warm golden city & pier glow shimmering on harbor water at night
    if (nightW > 0.2 && dShore < 22.0) {
      float refRipple = 0.55 + 0.45 * sin(xz.y * 1.1 - uWaveTime * 3.2 + sin(xz.x * 0.4));
      col += vec3(0.32, 0.24, 0.14) * exp(-dShore * 0.11) * refRipple * nightW * 0.62;
    }

    // Rotating Coastal Lighthouse Beacon sweeping across the north bay (centered at (0, -73))!
    vec2 fromLH = xz - vec2(0.0, -73.0);
    float lhDist = length(fromLH);
    if (lhDist > 2.0 && lhDist < 105.0) {
      float lhAng = uWaveTime * 0.72 + 0.65;
      vec2 lhDir = vec2(cos(lhAng), sin(lhAng));
      float align = dot(normalize(fromLH), lhDir);
      float beam = smoothstep(0.92, 0.994, align) * exp(-lhDist * 0.018);
      col += vec3(1.0, 0.88, 0.50) * beam * (0.34 + nightW * 0.92);
    }
  }

  // 1. Airwolf projected drop shadow (uShadowCasters[0])
  if (uShadowCount > 0) {
    vec4 heli = uShadowCasters[0];
    if (heli.y > 0.5) {
      vec2 sunHoriz = uSunDir.xz / max(uSunDir.y, 0.32);
      vec2 proj = heli.xz - sunHoriz * heli.y;
      vec2 rel = xz - proj;
      float r = heli.w * (1.0 + heli.y * 0.012);
      float d = length(rel);
      float sh = 1.0 - smoothstep(r * 0.42, r * 1.12, d);
      col *= (1.0 - sh * (inLand ? 0.52 : 0.30));
    }
  }

  // 2. AIRWOLF REAL-TIME NOSE SEARCHLIGHT POOL ON STREETS & BAY (uShadowCasters[1])!
  if (uShadowCount > 1) {
    vec4 spot = uShadowCasters[1];
    if (spot.w > 0.5) {
      vec2 toSpot = xz - spot.xz;
      float d = length(toSpot);
      float rad = spot.w * 2.6;
      if (d < rad * 1.35) {
        float normD = d / max(rad, 0.1);
        float softPool = exp(-normD * normD * 1.85);
        // Subtle 4x4 Bayer pixel-art dither edge echoing @dwhitedesign's pixel spotlight aesthetic!
        float ditherMask = step(bayer4(xz * 1.6), clamp(1.15 - normD, 0.0, 1.0));
        float spotStrength = mix(softPool, max(softPool, ditherMask * 0.48), 0.38) * (0.35 + nightW * 0.95);
        vec3 spotCol = vec3(1.0, 0.92, 0.64);
        col = col * (1.0 + spotStrength * 1.55) + spotCol * spotStrength * 0.44;
        emis = max(emis, spotStrength * 0.42);
      }
    }
  }

  // Atmospheric distance horizon fog
  float fogT = uFogDensity <= 0.001
    ? 0.0
    : clamp(1.0 - exp(-pow(max(0.0, t - 75.0) * 0.0052 * uFogDensity, 1.55)), 0.0, 0.96);
  vec3 finalCol = mix(col, skyHor, fogT);

  vec4 clipPos = uViewProj * vec4(wp, 1.0);
  gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 0.99997);
  outColor = vec4(finalCol, 1.0);
  outAux = vec4(0.0, emis, isLegacy ? 1.0 : 0.0, 0.0);
}`;
