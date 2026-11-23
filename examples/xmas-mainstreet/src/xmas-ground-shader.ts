/**
 * Custom @aastack/core WebGL2 Ground & Christmas Eve Winter Village Fragment Shader.
 * Renders:
 *  - Starry Christmas Eve twilight / Midnight / Crisp Morning winter sky with subtle northern glow
 *  - Snow-dusted Cobblestone Main Street (X in [-6.4, 6.4], Z in [-8, 54]) with twin gleaming iron trolley tracks
 *  - Shoveled herringbone brick sidewalks with organic fluffy snowbanks along every curb
 *  - Grand Cobblestone Town Square Plaza (X in [-30, 30], Z in [-44, -8])
 *  - Reflective Frozen Ice Skating Rink (X in [-27, -11], Z in [-32, -12]) with timber boards, skate marks,
 *    and shimmering warm reflections of the giant Town Square Christmas Tree!
 *  - Warm golden storefront light spill pools & Victorian streetlamp halos glowing across the snow
 *  - Moving Vintage Holiday Trolley headlight beam (uShadowCasters[0]) + Sleigh shadow (uShadowCasters[1])
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

  float eveW   = max(0.0, 1.0 - abs(uTimeOfDay - 0.68) * 3.0);
  float nightW = clamp((uTimeOfDay - 0.45) / 0.55, 0.0, 1.0);
  float warmGlowW = clamp(0.15 + nightW * 0.95 + eveW * 0.45, 0.0, 1.15);

  // Christmas Eve Twilight / Deep Midnight / Crisp Morning Sky + Pinpoint Stars + Subtle Winter Horizon Glow!
  vec3 skyZen = mix(mix(vec3(0.32, 0.58, 0.88), vec3(0.055, 0.085, 0.21), eveW), vec3(0.025, 0.042, 0.105), nightW);
  vec3 skyHor = mix(mix(vec3(0.82, 0.91, 0.98), vec3(0.18, 0.21, 0.38), eveW), vec3(0.075, 0.105, 0.21), nightW);
  float upT = pow(clamp(rd.y * 1.45, 0.0, 1.0), 0.72);
  vec3 skyCol = mix(skyHor, skyZen, upT);
  if (nightW > 0.25 && rd.y > 0.04) {
    vec2 sph = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, 0.0, 1.0)));
    vec2 sc = floor(sph * vec2(82.0, 82.0));
    vec2 sf = fract(sph * vec2(82.0, 82.0)) - 0.5;
    float st = hash21(sc);
    if (st > 0.985 && length(sf) < 0.34) {
      float tw = 0.62 + 0.38 * sin(uWaveTime * 2.6 + st * 105.0);
      skyCol += vec3(0.86, 0.92, 1.0) * tw * nightW * smoothstep(0.04, 0.16, rd.y) * 0.88;
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
  float nSlow = vnoise(xz * 0.14);
  float nMed  = vnoise(xz * 0.65);
  float grain = (hash21(floor(xz * 2.2)) - 0.5) * 0.04;

  // Geometry regions of our Christmas Main Street Village:
  // 1. Main Street Road: X in [-6.2, 6.2], Z in [-10, 56]
  bool inMainRoad = abs(xz.x) <= 6.2 && xz.y >= -10.0 && xz.y <= 56.0;
  // 2. Shoveled Brick Sidewalks flanking Main Street: X in [-12.2, 12.2], Z in [-10, 54]
  bool inSidewalk = abs(xz.x) <= 12.2 && xz.y >= -10.0 && xz.y <= 54.0 && !inMainRoad;
  // 3. Grand Cobblestone Town Square Plaza: X in [-29, 29], Z in [-42, -8]
  bool inPlaza = abs(xz.x) <= 29.0 && xz.y >= -42.0 && xz.y <= -8.0;
  // 4. Frozen Town Ice Skating Rink on West Plaza wing: X in [-26.5, -10.5], Z in [-30.5, -11.5]
  vec2 rinkRel = abs(xz - vec2(-18.5, -21.0)) - vec2(8.0, 9.5);
  float rinkSdf = length(max(rinkRel, 0.0)) + min(max(rinkRel.x, rinkRel.y), 0.0);
  bool inRink = rinkSdf < -0.55;
  bool inRinkBoard = rinkSdf >= -0.55 && rinkSdf <= 0.25;

  // Base winter snowfield colors (crisp daylight white -> moonlit sapphire snow at night!)
  vec3 snowBase = mix(mix(vec3(0.88, 0.92, 0.98), vec3(0.42, 0.49, 0.64), eveW), vec3(0.24, 0.30, 0.44), nightW);
  vec3 snowShade = mix(mix(vec3(0.72, 0.80, 0.92), vec3(0.28, 0.35, 0.52), eveW), vec3(0.14, 0.19, 0.31), nightW);

  vec3 col = mix(snowShade, snowBase, 0.45 + nSlow * 0.55) + grain;
  float emis = 0.0;

  if (inRink) {
    // Gleaming Frozen Ice Skating Rink with skate-blade scratch arcs & warm reflected tree shimmer!
    vec3 iceDeep = mix(vec3(0.46, 0.74, 0.92), vec3(0.11, 0.24, 0.40), nightW);
    vec3 iceSpec = mix(vec3(0.82, 0.94, 1.0), vec3(0.26, 0.46, 0.68), nightW);
    float scratch = sin(length(xz - vec2(-18.5, -21.0)) * 3.8 + nMed * 3.0) * 0.5 + 0.5;
    float sheen = smoothstep(0.65, 0.95, scratch * (0.6 + 0.4 * nMed));
    col = mix(iceDeep, iceSpec, sheen * 0.65);
    // Warm golden Christmas Tree & string-light reflection dancing on the ice!
    float dTreeRef = length(xz - vec2(-12.5, -19.5));
    float twinkle = 0.65 + 0.35 * sin(uWaveTime * 2.4 + xz.x * 1.4 + xz.y * 1.1);
    col += vec3(0.78, 0.52, 0.18) * exp(-dTreeRef * 0.14) * twinkle * warmGlowW * 0.42;
    // Frosty snow drift tucked cleanly inside the rink corners
    col = mix(col, snowBase, smoothstep(-1.6, -0.55, rinkSdf) * 0.55);
  } else if (inRinkBoard) {
    // Warm cedar timber rink railing dusted with snow
    col = mix(vec3(0.42, 0.27, 0.18), vec3(0.20, 0.13, 0.10), nightW);
  } else if (inMainRoad) {
    // Snow-dusted Cobblestone Main Street + Twin Gleaming Steel Trolley Tracks!
    vec2 cob = floor(vec2(xz.x * 1.9, xz.y * 1.5));
    float cobVar = (hash21(cob) - 0.5) * 0.08;
    vec3 cobCol = mix(vec3(0.34, 0.36, 0.42), vec3(0.10, 0.125, 0.19), nightW) + cobVar;
    // Patchy drifted snow along road shoulders & between cobblestones
    float curbSnow = smoothstep(3.6, 6.2, abs(xz.x) + (nMed - 0.5) * 1.6);
    float lightDust = smoothstep(0.56, 0.85, nMed) * 0.36;
    col = mix(cobCol, snowBase, clamp(curbSnow * 0.85 + lightDust, 0.0, 0.92));

    // Twin gleaming iron streetcar trolley rails right down the center (X = -1.05 & +1.05)!
    float railDist = min(abs(abs(xz.x) - 1.05), 9.0);
    if (railDist < 0.16) {
      col = mix(vec3(0.68, 0.74, 0.82), vec3(0.32, 0.38, 0.50), nightW);
    }
    // Festive stone crosswalk near Town Square entrance (Z in [-9.6, -7.6])
    if (xz.y >= -9.6 && xz.y <= -7.6 && fract(xz.x * 0.72) < 0.55) {
      col = mix(col, mix(vec3(0.76, 0.78, 0.84), vec3(0.30, 0.36, 0.48), nightW), 0.72);
    }
  } else if (inSidewalk || inPlaza) {
    // Shoveled warm Heritage Brick Sidewalks & Concentric Cobblestone Town Square!
    vec2 bCell = floor(vec2(xz.x * 1.6, xz.y * 1.6));
    float bVar = (hash21(bCell) - 0.5) * 0.07;
    vec3 brickCol = inPlaza
      ? mix(vec3(0.46, 0.44, 0.46), vec3(0.145, 0.16, 0.23), nightW) + bVar
      : mix(vec3(0.54, 0.44, 0.42), vec3(0.17, 0.16, 0.22), nightW) + bVar;

    // Decorative concentric plaza paving ring around the Giant Christmas Tree at (0, -19)!
    if (inPlaza) {
      float dTree = length(xz - vec2(0.0, -19.0));
      if (abs(dTree - 5.6) < 0.45 || abs(dTree - 9.4) < 0.38) {
        brickCol *= 1.32;
      }
    }
    // Soft snowbanks tucked along curbs & plaza borders
    float edgeSnow = inSidewalk
      ? smoothstep(7.4, 6.2, abs(xz.x) - (nMed - 0.5) * 0.9) * 0.65
      : smoothstep(24.0, 29.0, abs(xz.x)) * 0.78 + smoothstep(-37.0, -42.0, xz.y) * 0.75;
    float walkDust = smoothstep(0.62, 0.92, nMed) * 0.32;
    col = mix(brickCol, snowBase, clamp(edgeSnow + walkDust, 0.0, 0.9));
  } else {
    // Soft snow-covered village meadow + subtle near-field winter sparkle glints (zero far moire!)
    float sparkle = hash21(floor(xz * 2.7));
    if (sparkle > 0.995 && t < 75.0) {
      float distFade = 1.0 - smoothstep(35.0, 75.0, t);
      col += vec3(0.32, 0.40, 0.56) * distFade * (0.5 + 0.5 * sin(uWaveTime * 2.8 + sparkle * 90.0));
    }
  }

  // -------------------------------------------------------------------------
  // WARM COZY CHRISTMAS EVE LIGHTING POOLS ON THE SNOWY STREETS & PLAZA!
  // -------------------------------------------------------------------------
  if (warmGlowW > 0.1) {
    // 1. Warm golden glow radiating from the Giant Town Square Christmas Tree (0, -19)!
    float dTree = length(xz - vec2(0.0, -19.0));
    float treeGlow = exp(-dTree * dTree * 0.011) * warmGlowW;
    col += vec3(0.52, 0.34, 0.11) * treeGlow * 0.85;

    // 2. Warm storefront window spill pools along both Victorian Main Street sidewalks (X = +-11.5, Z in [0, 44])!
    if (xz.y >= -4.0 && xz.y <= 48.0 && abs(xz.x) <= 22.0) {
      float dShopX = abs(abs(xz.x) - 11.2);
      float zMod = mod(xz.y + 2.0, 12.0) - 6.0;
      float dShop = length(vec2(dShopX, zMod * 0.72));
      float shopPool = exp(-dShop * dShop * 0.042) * warmGlowW;
      col += vec3(0.56, 0.34, 0.10) * shopPool * 0.68;
    }

    // 3. Ornate Victorian Streetlamp golden snow pools (X = +-7.0, Z = -4, 8, 20, 32, 44)!
    if (xz.y >= -10.0 && xz.y <= 50.0 && abs(xz.x) <= 16.0) {
      float zLamp = mod(xz.y + 10.0, 12.0) - 6.0;
      float dLamp = length(vec2(abs(xz.x) - 7.0, zLamp));
      float lampPool = exp(-dLamp * dLamp * 0.075) * warmGlowW;
      col += vec3(0.62, 0.42, 0.14) * lampPool * 0.65;
    }

    // 4. Warm golden portico glow in front of the Grand Clocktower Town Hall (0, -30)!
    float dHall = length(xz - vec2(0.0, -29.5));
    col += vec3(0.50, 0.33, 0.12) * exp(-dHall * dHall * 0.025) * warmGlowW * 0.72;
  }

  // 5. LIVE MOVING TROLLEY HEADLIGHT BEAM ON THE SNOWY RAILS (uShadowCasters[0])!
  if (uShadowCount > 0) {
    vec4 tr = uShadowCasters[0];
    if (tr.w > 0.5) {
      float dSpot = length(xz - tr.xz);
      float rad = tr.w * 2.2;
      float pool = exp(-(dSpot * dSpot) / max(rad * rad * 0.45, 0.5)) * warmGlowW;
      col += vec3(0.75, 0.58, 0.24) * pool * 0.72;
      emis = max(emis, pool * 0.25);
    }
  }

  // 6. SANTA'S SLEIGH SOFT SHADOW GLIDING OVER THE SNOW (uShadowCasters[1])!
  if (uShadowCount > 1) {
    vec4 sl = uShadowCasters[1];
    if (sl.y > 1.0) {
      vec2 sunHoriz = uSunDir.xz / max(uSunDir.y, 0.35);
      vec2 proj = sl.xz - sunHoriz * sl.y;
      float d = length(xz - proj);
      float sh = 1.0 - smoothstep(sl.w * 0.45, sl.w * 1.25, d);
      col *= (1.0 - sh * 0.32);
    }
  }

  // Soft winter distance horizon mist
  float fogT = uFogDensity <= 0.001
    ? 0.0
    : clamp(1.0 - exp(-pow(max(0.0, t - 65.0) * 0.0058 * uFogDensity, 1.5)), 0.0, 0.96);
  vec3 finalCol = mix(col, skyHor, fogT);

  vec4 clipPos = uViewProj * vec4(wp, 1.0);
  gl_FragDepth = clamp((clipPos.z / clipPos.w) * 0.5 + 0.5, 0.0, 0.99997);
  outColor = vec4(finalCol, 1.0);
  outAux = vec4(0.0, emis, isLegacy ? 1.0 : 0.0, 0.0);
}`;
