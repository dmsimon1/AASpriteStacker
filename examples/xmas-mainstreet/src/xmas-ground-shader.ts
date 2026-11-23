/**
 * Upgraded HD-2D Winter Village Ground & Creek Fragment Shader for Main Street Christmas v2.
 * Features:
 *  - Deep velvety Christmas Eve indigo-cobalt sky with subtle warm village horizon glow & pinpoint stars
 *  - Winding Frozen Winter Creek (Z ~ +48) passing right under the 3D Arched Granite Bridge!
 *  - Crisp snow-dusted cobblestone Main Street + twin iron streetcar rails + granite curb snowbanks
 *  - Grounded contact-AO darkening around buildings, Town Square tree, and rink perimeter
 *  - Reflective Frozen Ice Skating Rink with skate swirls & warm twinkling Christmas tree reflections
 *  - Warm golden window spill, Starlight Cinema marquee glow, twin-globe Victorian lamps, firepit braziers,
 *    moving Heritage Trolley headlight pool (uShadowCasters[0]) & Sleigh aerial shadow (uShadowCasters[1])
 */

export const XMAS_GROUND_FS = `#version 300 es
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

  float eveW   = max(0.0, 1.0 - abs(uTimeOfDay - 0.78) * 3.0);
  float nightW = clamp((uTimeOfDay - 0.42) / 0.58, 0.0, 1.0);
  float warmGlowW = clamp(0.14 + nightW * 0.96 + eveW * 0.35, 0.0, 1.18);

  // Rich velvety Christmas Eve indigo-cobalt sky (never dull flat grey!)
  vec3 skyZen = mix(mix(vec3(0.28, 0.54, 0.86), vec3(0.032, 0.056, 0.155), eveW), vec3(0.015, 0.026, 0.072), nightW);
  vec3 skyHor = mix(mix(vec3(0.78, 0.88, 0.97), vec3(0.115, 0.145, 0.285), eveW), vec3(0.048, 0.072, 0.155), nightW);
  float upT = pow(clamp(rd.y * 1.5, 0.0, 1.0), 0.70);
  vec3 skyCol = mix(skyHor, skyZen, upT);
  if (nightW > 0.25 && rd.y > 0.04) {
    vec2 sph = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, 0.0, 1.0)));
    vec2 sc = floor(sph * vec2(84.0, 84.0));
    vec2 sf = fract(sph * vec2(84.0, 84.0)) - 0.5;
    float st = hash21(sc);
    if (st > 0.985 && length(sf) < 0.34) {
      float tw = 0.62 + 0.38 * sin(uWaveTime * 2.5 + st * 105.0);
      skyCol += vec3(0.88, 0.93, 1.0) * tw * nightW * smoothstep(0.04, 0.16, rd.y) * 0.92;
    }
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
  float nSlow = vnoise(xz * 0.12);
  float nMed  = vnoise(xz * 0.55);
  float nFine = vnoise(xz * 1.85);
  float grain = (hash21(floor(xz * 2.6)) - 0.5) * 0.032;

  // 1. Winding Frozen Winter Creek meandering across the southern village entrance (Z ~ 49)!
  float creekCenterZ = 49.0 + sin(xz.x * 0.085) * 3.4 + cos(xz.x * 0.035) * 2.0;
  float creekDist = abs(xz.y - creekCenterZ);
  bool inCreek = creekDist < 4.2;
  bool inCreekBank = creekDist >= 4.2 && creekDist < 6.4;

  // 2. Main Street Roadway, Shoveled Heritage Brick Sidewalks, Grand Town Square & Frozen Ice Skating Rink
  bool inMainRoad = abs(xz.x) <= 6.2 && xz.y >= -10.0 && xz.y <= 56.0 && !inCreek;
  bool inSidewalk = abs(xz.x) <= 12.6 && xz.y >= -10.0 && xz.y <= 45.0 && !inMainRoad && !inCreek;
  bool inPlaza = abs(xz.x) <= 29.5 && xz.y >= -43.0 && xz.y <= -8.0;

  vec2 rinkRel = abs(xz - vec2(-18.5, -21.0)) - vec2(7.8, 9.2);
  float rinkSdf = length(max(rinkRel, 0.0)) + min(max(rinkRel.x, rinkRel.y), 0.0);
  bool inRink = rinkSdf < -0.55;
  bool inRinkBoard = rinkSdf >= -0.55 && rinkSdf <= 0.25;

  // Velvety moonlit winter snow palette (deep cobalt shadows + crisp silver-blue snow highlights!)
  vec3 snowHiCol = mix(mix(vec3(0.90, 0.94, 0.99), vec3(0.30, 0.37, 0.54), eveW), vec3(0.18, 0.24, 0.38), nightW);
  vec3 snowLoCol = mix(mix(vec3(0.70, 0.78, 0.90), vec3(0.17, 0.23, 0.38), eveW), vec3(0.095, 0.135, 0.24), nightW);

  // Rolling contour shading across outer snowy winter hills
  float hillWave = sin(xz.x * 0.065 + nSlow * 2.2) * cos(xz.y * 0.055 - nSlow * 1.8) * 0.5 + 0.5;
  vec3 col = mix(snowLoCol, snowHiCol, clamp(0.32 + hillWave * 0.52 + nMed * 0.22, 0.0, 1.0)) + grain;
  float emis = 0.0;

  if (inCreek) {
    // Reflective frozen creek winding beneath the 3D Granite Arch Bridge!
    float iceMix = smoothstep(0.5, 4.2, creekDist + (nMed - 0.5) * 1.5);
    vec3 creekDeep = mix(vec3(0.28, 0.56, 0.78), vec3(0.055, 0.135, 0.25), nightW);
    vec3 creekFrost = mix(vec3(0.76, 0.88, 0.98), vec3(0.20, 0.34, 0.52), nightW);
    float ripple = sin(xz.x * 0.9 + xz.y * 2.2 + uWaveTime * 1.2) * 0.5 + 0.5;
    col = mix(creekDeep, creekFrost, clamp(iceMix * 0.75 + ripple * 0.16, 0.0, 0.92));
    // Warm bridge lantern reflection dancing on the creek ice around X = 0!
    float dBr = length(vec2(xz.x, xz.y - 49.0));
    col += vec3(0.85, 0.56, 0.20) * exp(-dBr * 0.14) * warmGlowW * 0.45;
  } else if (inRink) {
    // Gleaming Frozen Ice Skating Rink with skate-blade scratch swirls & twinkling Christmas Tree reflection!
    vec3 iceDeep = mix(vec3(0.42, 0.70, 0.88), vec3(0.075, 0.175, 0.32), nightW);
    vec3 iceSpec = mix(vec3(0.84, 0.95, 1.0), vec3(0.22, 0.40, 0.62), nightW);
    float scratch = sin(length(xz - vec2(-18.5, -21.0)) * 4.2 + nMed * 3.4) * 0.5 + 0.5;
    float sheen = smoothstep(0.62, 0.94, scratch * (0.55 + 0.45 * nFine));
    col = mix(iceDeep, iceSpec, sheen * 0.62);
    float dTreeRef = length(xz - vec2(-12.0, -19.5));
    float tw = 0.68 + 0.32 * sin(uWaveTime * 2.3 + xz.x * 1.3 + xz.y * 1.2);
    col += vec3(0.84, 0.54, 0.18) * exp(-dTreeRef * 0.13) * tw * warmGlowW * 0.46;
    col = mix(col, snowHiCol, smoothstep(-1.5, -0.55, rinkSdf) * 0.62);
  } else if (inRinkBoard) {
    col = mix(vec3(0.38, 0.24, 0.16), vec3(0.14, 0.09, 0.07), nightW);
  } else if (inMainRoad) {
    // Crisp Snow-Dusted Cobblestone Main Street + Twin Gleaming Steel Streetcar Tracks!
    vec2 cob = floor(vec2(xz.x * 2.2, xz.y * 1.8));
    float cobVar = (hash21(cob) - 0.5) * 0.09;
    float mortar = (fract(xz.x * 2.2) < 0.12 || fract(xz.y * 1.8) < 0.12) ? -0.025 : 0.0;
    vec3 cobCol = mix(vec3(0.30, 0.33, 0.40), vec3(0.075, 0.095, 0.155), nightW) + cobVar + mortar;
    float curbSnow = smoothstep(3.8, 6.2, abs(xz.x) + (nMed - 0.5) * 1.3);
    float snowDust = smoothstep(0.58, 0.88, nFine) * 0.34;
    col = mix(cobCol, snowHiCol, clamp(curbSnow * 0.88 + snowDust, 0.0, 0.92));

    // Twin gleaming steel streetcar tracks (X = -1.05 & +1.05) + timber rail ties peeking through snow!
    float railDist = abs(abs(xz.x) - 1.05);
    if (railDist < 0.16) {
      col = mix(vec3(0.68, 0.75, 0.84), vec3(0.28, 0.35, 0.48), nightW);
    } else if (abs(xz.x) < 1.35 && fract(xz.y * 0.9) < 0.24) {
      col *= 0.82;
    }
    // Granite stone crosswalk at Town Square mouth (Z in [-9.6, -7.6])
    if (xz.y >= -9.6 && xz.y <= -7.6 && fract(xz.x * 0.72) < 0.52) {
      col = mix(col, mix(vec3(0.74, 0.76, 0.82), vec3(0.24, 0.30, 0.42), nightW), 0.70);
    }
  } else if (inSidewalk || inPlaza) {
    // Warm Heritage Herringbone Brick Sidewalks & Concentric Granite Town Square!
    vec2 bCell = floor(vec2(xz.x * 2.0, xz.y * 2.0));
    float bVar = (hash21(bCell) - 0.5) * 0.065;
    vec3 paveCol = inPlaza
      ? mix(vec3(0.42, 0.40, 0.44), vec3(0.11, 0.125, 0.19), nightW) + bVar
      : mix(vec3(0.48, 0.38, 0.36), vec3(0.13, 0.125, 0.18), nightW) + bVar;

    if (inPlaza) {
      float dTree = length(xz - vec2(0.0, -19.0));
      if (abs(dTree - 5.2) < 0.42 || abs(dTree - 8.8) < 0.35 || abs(dTree - 12.2) < 0.25) {
        paveCol *= 1.34;
      }
    }
    float curbLine = inSidewalk && abs(xz.x) < 6.8 ? 1.0 : 0.0;
    float edgeSnow = inSidewalk
      ? smoothstep(7.5, 6.2, abs(xz.x) - (nMed - 0.5) * 0.8) * 0.72
      : smoothstep(25.0, 29.5, abs(xz.x)) * 0.82 + smoothstep(-38.0, -43.0, xz.y) * 0.80;
    float walkDust = smoothstep(0.66, 0.94, nFine) * 0.26;
    col = mix(paveCol, snowHiCol, clamp(edgeSnow + walkDust + curbLine * 0.35, 0.0, 0.92));
  } else if (inCreekBank) {
    col = mix(snowLoCol * 0.78, snowHiCol, smoothstep(4.2, 6.2, creekDist));
  } else {
    // Distant subtle snow sparkle glints (only near field to prevent far moire!)
    float sparkle = hash21(floor(xz * 2.6));
    if (sparkle > 0.995 && t < 72.0) {
      float df = 1.0 - smoothstep(32.0, 72.0, t);
      col += vec3(0.32, 0.40, 0.56) * df * (0.5 + 0.5 * sin(uWaveTime * 2.8 + sparkle * 90.0));
    }
  }

  // Grounded Contact AO beneath Victorian shop rows & Town Hall so every structure sits heavily in the snow!
  if (!inMainRoad && !inCreek) {
    if (xz.y >= -4.0 && xz.y <= 43.0 && abs(xz.x) >= 11.4 && abs(xz.x) <= 21.5) {
      float edgeSoft = smoothstep(11.4, 12.8, abs(xz.x)) * (1.0 - smoothstep(19.5, 21.5, abs(xz.x)));
      col *= (1.0 - edgeSoft * 0.42);
    }
    if (xz.y <= -31.5 && xz.y >= -41.0 && abs(xz.x) <= 7.0) {
      col *= 0.68;
    }
  }

  // -------------------------------------------------------------------------
  // CINEMATIC WARM-VS-COOL CHRISTMAS EVE LIGHTING SPILL ON SNOW & COBBLESTONE!
  // -------------------------------------------------------------------------
  if (warmGlowW > 0.1) {
    // 1. Giant Town Square Christmas Tree warm radial glow (0, -19)
    float dTree = length(xz - vec2(0.0, -19.0));
    col += vec3(0.58, 0.35, 0.10) * exp(-dTree * dTree * 0.013) * warmGlowW * 0.82;

    // 2. Crisp warm storefront display light spilling out across both brick sidewalks!
    if (xz.y >= -3.0 && xz.y <= 43.0 && abs(xz.x) <= 18.0) {
      float dShopX = abs(abs(xz.x) - 11.4);
      float zMod = mod(xz.y + 3.75, 11.5) - 5.75;
      float dShop = length(vec2(dShopX * 1.15, zMod * 0.68));
      col += vec3(0.60, 0.34, 0.09) * exp(-dShop * dShop * 0.055) * warmGlowW * 0.62;
    }

    // 3. Starlight Cinema glowing golden marquee spill right at East Town Square corner (+11.5, +2)!
    float dCin = length(xz - vec2(11.0, 2.0));
    col += vec3(0.72, 0.48, 0.16) * exp(-dCin * dCin * 0.035) * warmGlowW * 0.68;

    // 4. Twin-Globe Victorian Streetlamp pools (X = +-7.1, Z = -4, 8, 20, 32, 42)
    if (xz.y >= -10.0 && xz.y <= 48.0 && abs(xz.x) <= 14.0) {
      float zLamp = mod(xz.y + 10.0, 12.0) - 6.0;
      float dLamp = length(vec2(abs(xz.x) - 7.1, zLamp));
      col += vec3(0.64, 0.42, 0.13) * exp(-dLamp * dLamp * 0.095) * warmGlowW * 0.58;
    }

    // 5. Crackling Ice Rink Warming Firepit Braziers (-10.4, -14.5 & -10.4, -27.5) + Gazebo (-22, -35)!
    float dBr1 = length(xz - vec2(-10.4, -14.5));
    float dBr2 = length(xz - vec2(-10.4, -27.5));
    float dGaz = length(xz - vec2(-22.0, -35.0));
    float flick = 0.88 + 0.12 * sin(uWaveTime * 9.0 + xz.x);
    col += vec3(0.88, 0.40, 0.10) * (exp(-dBr1 * dBr1 * 0.12) + exp(-dBr2 * dBr2 * 0.12)) * flick * warmGlowW * 0.72;
    col += vec3(0.62, 0.40, 0.14) * exp(-dGaz * dGaz * 0.045) * warmGlowW * 0.65;

    // 6. Grand Clocktower Town Hall portico lanterns (0, -29.5)
    float dHall = length(xz - vec2(0.0, -29.5));
    col += vec3(0.55, 0.34, 0.11) * exp(-dHall * dHall * 0.032) * warmGlowW * 0.68;
  }

  // 7. Live Moving Heritage Trolley Golden Headlamp Beam (uShadowCasters[0])
  if (uShadowCount > 0) {
    vec4 tr = uShadowCasters[0];
    if (tr.w > 0.5) {
      float dSpot = length(xz - tr.xz);
      float rad = tr.w * 2.1;
      float pool = exp(-(dSpot * dSpot) / max(rad * rad * 0.42, 0.5)) * warmGlowW;
      col += vec3(0.76, 0.56, 0.22) * pool * 0.72;
      emis = max(emis, pool * 0.24);
    }
  }

  // 8. Santa's Sleigh Soft Aerial Shadow (uShadowCasters[1])
  if (uShadowCount > 1) {
    vec4 sl = uShadowCasters[1];
    if (sl.y > 1.0) {
      vec2 sunHoriz = uSunDir.xz / max(uSunDir.y, 0.35);
      vec2 proj = sl.xz - sunHoriz * sl.y;
      float d = length(xz - proj);
      float sh = 1.0 - smoothstep(sl.w * 0.45, sl.w * 1.25, d);
      col *= (1.0 - sh * 0.30);
    }
  }

  // Velvety winter mist fading smoothly into the twilight horizon
  float fogT = uFogDensity <= 0.001
    ? 0.0
    : clamp(1.0 - exp(-pow(max(0.0, t - 62.0) * 0.0062 * uFogDensity, 1.55)), 0.0, 0.96);
  vec3 finalCol = mix(col, skyHor, fogT);

  vec4 clipPos = uViewProj * vec4(wp, 1.0);
  gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 0.99997);
  outColor = vec4(finalCol, 1.0);
  outAux = vec4(0.0, emis, isLegacy ? 1.0 : 0.0, 0.0);
}`;
