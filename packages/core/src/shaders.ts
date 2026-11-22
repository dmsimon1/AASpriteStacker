/**
 * Core WebGL2 ES 3.00 Shaders for @aastack/core:
 *  - Compact studio cyclorama backdrop (procedural island terrain lives in tree-shakeable `@aastack/core/terrain`)
 *  - WebGL2 Hardware-Instanced OBB Entity Raycaster (16 vertex attribs, 13 flat varyings, sliceClip, exact column-step RGSS + overdraw pass)
 *  - Depth-tested 3D Ribbon shader
 *  - 16-bit RGBA8 Jump Flooding Algorithm (JFA) SDF outline + bloom + premultiplied transparent composite
 */

export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID & 1) << 2, (gl_VertexID & 2) << 1) - 1.0;
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const STUDIO_BG_FS = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform mat4 uInvViewProj;
uniform vec3 uSunDir;
uniform float uTimeOfDay;
uniform float uSplitX;
uniform int uLeftLegacy;
uniform int uRightLegacy;
uniform int uShadowCount;
uniform vec4 uShadowCasters[28];

in vec2 vUv;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outAux;

float castShadowAt(vec3 worldPos) {
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
    sh = max(sh, 1.0 - smoothstep(sc.w * 0.58, sc.w * 1.06, d));
  }
  return sh;
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

  float nightW = max(0.0, (uTimeOfDay - 0.48) / 0.52);
  vec3 stBot = mix(vec3(0.95, 0.97, 0.99), vec3(0.10, 0.14, 0.23), nightW);
  vec3 stTop = mix(vec3(0.84, 0.89, 0.96), vec3(0.05, 0.08, 0.14), nightW);
  float vy = clamp(gl_FragCoord.y / max(uResolution.y, 1.0), 0.0, 1.0);
  vec3 stCol = mix(stBot, stTop, pow(vy, 0.85));
  if (rd.y < -0.002 && uShadowCount > 0) {
    float tFloor = (0.0 - ro.y) / rd.y;
    if (tFloor > 0.0 && tFloor < 220.0) {
      vec3 fp = ro + rd * tFloor;
      float sh = castShadowAt(fp);
      stCol = mix(stCol, stCol * vec3(0.76, 0.81, 0.89), sh * 0.45);
    }
  }
  outColor = vec4(stCol, 1.0);
  outAux = vec4(0.0, 0.0, isLegacy ? 1.0 : 0.0, 0.0);
  gl_FragDepth = 0.99999;
}`;

export const ENTITY_OBB_VS = `#version 300 es
layout(location = 0)  in vec3 aUnitPos;
layout(location = 1)  in vec4 aVoxToClip0;
layout(location = 2)  in vec4 aVoxToClip1;
layout(location = 3)  in vec4 aVoxToClip2;
layout(location = 4)  in vec4 aVoxToClip3;
layout(location = 5)  in vec4 aClipToVox0;
layout(location = 6)  in vec4 aClipToVox1;
layout(location = 7)  in vec4 aClipToVox2;
layout(location = 8)  in vec4 aClipToVox3;
layout(location = 9)  in vec3 aNorm0;
layout(location = 10) in vec3 aNorm1;
layout(location = 11) in vec3 aNorm2;
layout(location = 12) in vec4 aSunAndScale;
layout(location = 13) in vec4 aMeta;
layout(location = 14) in vec4 aFlags;
layout(location = 15) in vec2 aSliceClip;

uniform vec3 uVolSize;

flat out vec4 vVoxToClipZ;
flat out vec4 vVoxToClipW;
flat out vec4 vClipCol0;
flat out vec4 vClipCol1;
flat out vec4 vClipCol2;
flat out vec4 vClipCol3;
flat out vec3 vNorm0;
flat out vec3 vNorm1;
flat out vec3 vNorm2;
flat out vec4 vSunAndScale;
flat out vec4 vMeta;
flat out vec4 vFlags;
flat out vec2 vSliceClip;

void main() {
  vec3 pad = vec3(0.45);
  float zMin = clamp(aSliceClip.x, 0.0, 1.0) * uVolSize.z;
  float zMax = clamp(aSliceClip.y, 0.0, 1.0) * uVolSize.z;
  vec3 bMin = vec3(-pad.x, -pad.y, zMin - pad.z);
  vec3 bMax = vec3(uVolSize.x + pad.x, uVolSize.y + pad.y, zMax + pad.z);
  vec3 voxPos = mix(bMin, bMax, aUnitPos);
  mat4 voxToClip = mat4(aVoxToClip0, aVoxToClip1, aVoxToClip2, aVoxToClip3);
  gl_Position = voxToClip * vec4(voxPos, 1.0);

  vVoxToClipZ = vec4(aVoxToClip0.z, aVoxToClip1.z, aVoxToClip2.z, aVoxToClip3.z);
  vVoxToClipW = vec4(aVoxToClip0.w, aVoxToClip1.w, aVoxToClip2.w, aVoxToClip3.w);
  vClipCol0 = aClipToVox0;
  vClipCol1 = aClipToVox1;
  vClipCol2 = aClipToVox2;
  vClipCol3 = aClipToVox3;
  vNorm0 = aNorm0;
  vNorm1 = aNorm1;
  vNorm2 = aNorm2;
  vSunAndScale = aSunAndScale;
  vMeta = aMeta;
  vFlags = aFlags;
  vSliceClip = vec2(zMin, zMax);
}`;

export const ENTITY_OBB_FS = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uAlbedoTex;
uniform sampler3D uSdfTex;
uniform sampler3D uNormalTex;
uniform sampler3D uEmisTex;

uniform vec2 uResolution;
uniform vec3 uVolSize;
uniform float uSdfRange;

uniform int uStyle;           // 0=arcade-8bit, 1=hd-2d, 2=smooth-toy, 3=retro-raw
uniform float uSplitX;
uniform int uShadeStyle;
uniform vec3 uSunDir;
uniform float uTimeOfDay;
uniform float uFogDensity;
uniform int uDebugOverlay;
uniform float uOverdrawUnit;

flat in vec4 vVoxToClipZ;
flat in vec4 vVoxToClipW;
flat in vec4 vClipCol0;
flat in vec4 vClipCol1;
flat in vec4 vClipCol2;
flat in vec4 vClipCol3;
flat in vec3 vNorm0;
flat in vec3 vNorm1;
flat in vec3 vNorm2;
flat in vec4 vSunAndScale;
flat in vec4 vMeta;
flat in vec4 vFlags;
flat in vec2 vSliceClip;

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
  if (count == 2) {
    return idx == 0 ? vec2(-0.25, -0.25) : vec2(0.25, 0.25);
  }
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

vec3 shadeVoxel(vec3 baseLin, vec3 worldN, float ao, float emisFlag, float selfSh, bool hardToon, float emisBoost) {
  if (uShadeStyle == 2) return baseLin;
  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.4);
  float nightW = max(0.0, (uTimeOfDay - 0.48) / 0.52);
  bool arcade = (uStyle == 0 || uStyle == 3);

  if (emisFlag > 0.5) {
    float boost = 1.0 + (0.45 + nightW * 0.9) * emisBoost;
    return baseLin * boost + vec3(0.15, 0.09, 0.02) * emisBoost;
  }

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
    float bw = arcade ? 0.06 : 0.16;
    float tSh = smoothstep(-0.12 - bw, -0.12 + bw, litVal);
    float tLit = smoothstep(0.34 - bw, 0.34 + bw, litVal);
    tint = mix(mix(shMul, midMul, tSh), litMul, tLit);
  } else {
    float diff = smoothstep(-0.72, 0.95, litVal);
    tint = mix(shMul, litMul, diff);
  }
  // Hemisphere sky/earth fill + warm sunlit ground bounce so shadow faces keep crisp form
  float hemi = worldN.y * 0.5 + 0.5;
  vec3 skyBounce = mix(vec3(1.03, 0.96, 0.88), vec3(0.96, 1.01, 1.06), hemi);
  float bounceBack = max(0.0, -ndotl) * (1.0 - nightW * 0.7) * 0.10;
  tint = tint * mix(vec3(1.0), skyBounce, 0.35) + vec3(0.14, 0.10, 0.06) * bounceBack;
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

  for (int i = 0; i < 32; i++) {
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

bool traceVoxelDdaHit(
  vec3 roVox, vec3 rdVox,
  out ivec3 outCell, out vec3 outFaceN, out vec3 outHitPos, out float outT, out vec3 outRgb
) {
  outCell = ivec3(-1);
  outFaceN = vec3(0.0, 0.0, 1.0);
  outHitPos = vec3(0.0);
  outT = 1e20;
  outRgb = vec3(0.0);

  vec3 invD = vec3(
    abs(rdVox.x) > 1e-6 ? 1.0 / rdVox.x : 1e20,
    abs(rdVox.y) > 1e-6 ? 1.0 / rdVox.y : 1e20,
    abs(rdVox.z) > 1e-6 ? 1.0 / rdVox.z : 1e20
  );
  vec3 bMin = vec3(0.0, 0.0, vSliceClip.x);
  vec3 bMax = vec3(uVolSize.x, uVolSize.y, vSliceClip.y);
  if (bMax.z <= bMin.z + 1e-4) return false;
  vec3 t0 = (bMin - roVox) * invD;
  vec3 t1 = (bMax - roVox) * invD;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  float tExit = min(min(tmax.x, tmax.y), tmax.z);
  if (tExit <= tEnter + 1e-4) return false;

  float te = tEnter + 1e-4;
  vec3 pos = roVox + rdVox * te;
  ivec3 cMin = ivec3(0, 0, clamp(int(floor(bMin.z + 1e-4)), 0, int(uVolSize.z) - 1));
  ivec3 cMax = ivec3(int(uVolSize.x) - 1, int(uVolSize.y) - 1, clamp(int(ceil(bMax.z - 1e-4)) - 1, 0, int(uVolSize.z) - 1));
  ivec3 cell = clamp(ivec3(floor(pos)), cMin, cMax);
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
  for (int i = 0; i < 96; i++) {
    vec4 tex = texelFetch(uAlbedoTex, cell, 0);
    if (tex.a >= 0.5) {
      outCell = cell;
      outFaceN = faceN;
      outHitPos = pos + rdVox * tCur;
      outT = te + tCur;
      outRgb = tex.rgb;
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
    if (any(lessThan(cell, cMin)) || any(greaterThan(cell, cMax))) break;
  }
  return false;
}

bool traceSmoothSdfRay(
  vec3 roVox, vec3 rdVox, mat3 normalMat, vec3 sunLocal, bool doSelfShadow, float emisBoost,
  out vec3 outLin, out vec3 outWorldN, out float outT, out float outEmis
) {
  outLin = vec3(0.0);
  outWorldN = vec3(0.0, 1.0, 0.0);
  outT = 1e20;
  outEmis = 0.0;

  float rdLen = length(rdVox);
  if (rdLen < 1e-6) return false;
  vec3 rdN = rdVox / rdLen;
  vec3 invD = 1.0 / mix(rdN, vec3(1e-6), lessThan(abs(rdN), vec3(1e-6)));
  vec3 t0 = (vec3(-0.45, -0.45, vSliceClip.x - 0.45) - roVox) * invD;
  vec3 t1 = (vec3(uVolSize.x + 0.45, uVolSize.y + 0.45, vSliceClip.y + 0.45) - roVox) * invD;
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

  vec3 worldN = normalize(normalMat * nLoc);
  float selfSh = (doSelfShadow && ef < 0.5 && uShadeStyle != 2 && dot(worldN, uSunDir) > -0.28)
    ? (traceLocalShadow(hp + nLoc * 0.35, sunLocal) ? 1.0 : 0.0)
    : 0.0;
  outLin = shadeVoxel(srgbToLin(albedo), worldN, ao, ef, selfSh, false, emisBoost);
  outWorldN = worldN;
  outT = s / rdLen;
  outEmis = ef;
  return true;
}

void main() {
  if (uDebugOverlay == 5) {
    outColor = vec4(0.0, uOverdrawUnit, 0.0, 1.0);
    outAux = vec4(0.0);
    return;
  }
  int iModeA = int(vFlags.z + 0.5);
  int iModeB = int(vFlags.w + 0.5);
  int mode = (uSplitX >= 0.0 && (gl_FragCoord.x / uResolution.x) < uSplitX) ? iModeA : iModeB;
  bool isLegacy = (mode == 0);
  bool smoothSdf = (mode == 2);
  int spp = isLegacy ? 1 : int(vMeta.w + 0.5);
  bool doSelfShadow = vFlags.x > 0.5;
  bool outlineOn = vFlags.y > 0.5;
  float objIdNorm = vMeta.x;
  float emisBoost = vMeta.y;
  float normSmooth = vMeta.z;
  vec3 sunLocal = vSunAndScale.xyz;
  float voxWorldScale = vSunAndScale.w;
  mat3 normalMat = mat3(vNorm0, vNorm1, vNorm2);

  vec2 basePx = gl_FragCoord.xy;
  if (isLegacy) {
    float blk = max(3.0, floor(min(uResolution.x, uResolution.y) / 145.0));
    basePx = (floor(basePx / blk) + 0.5) * blk;
  }

  // Exact homogeneous column-step RGSS ray setup using flat clip columns (zero redundant mat4 muls!)
  vec2 baseNdc = (basePx / uResolution) * 2.0 - 1.0;
  vec4 xyBase = vClipCol0 * baseNdc.x + vClipCol1 * baseNdc.y + vClipCol3;
  vec4 nearBase = xyBase - vClipCol2;
  vec4 farBase  = xyBase + vClipCol2;
  vec4 dVoxDx   = vClipCol0 * (2.0 / uResolution.x);
  vec4 dVoxDy   = vClipCol1 * (2.0 / uResolution.y);

  vec3 accLin = vec3(0.0);
  vec3 accNorm = vec3(0.0);
  float accEmis = 0.0;
  float hits = 0.0;
  float minT = 1e20;
  vec3 bestVoxHit = vec3(0.0);

  ivec3 cCell = ivec3(-1);
  vec3 cFace = vec3(0.0);
  vec3 cBaseLin = vec3(0.0);
  vec3 cWorldN = vec3(0.0, 1.0, 0.0);
  float cAo = 1.0;
  float cEmis = 0.0;
  float cNdotL = 0.0;
  float cLastSh = -1.0;
  vec3 cShadedLin = vec3(0.0);
  float nBlend = (normSmooth >= 0.0) ? clamp(normSmooth, 0.0, 1.0) : ((uStyle == 0 || isLegacy) ? 0.24 : 0.45);

  for (int i = 0; i < 8; i++) {
    if (i >= spp) break;
    vec2 off = getRgssOffset(i, spp);
    vec4 delta = dVoxDx * off.x + dVoxDy * off.y;
    vec4 nearV = nearBase + delta; nearV /= nearV.w;
    vec4 farV  = farBase  + delta; farV  /= farV.w;
    vec3 roV = nearV.xyz;
    vec3 rdV = normalize(farV.xyz - nearV.xyz);

    if (smoothSdf) {
      vec3 cLin; vec3 wN; float tHit; float em;
      if (traceSmoothSdfRay(roV, rdV, normalMat, sunLocal, doSelfShadow, emisBoost, cLin, wN, tHit, em)) {
        accLin += cLin;
        accNorm += wN;
        accEmis += em;
        hits += 1.0;
        if (tHit < minT) {
          minT = tHit;
          bestVoxHit = roV + rdV * tHit;
        }
      }
    } else {
      ivec3 hitCell; vec3 faceN; vec3 hitPos; float tHit; vec3 albedoRgb;
      if (traceVoxelDdaHit(roV, rdV, hitCell, faceN, hitPos, tHit, albedoRgb)) {
        bool sameCell = (hitCell == cCell && all(equal(faceN, cFace)));
        if (!sameCell) {
          vec4 na = texelFetch(uNormalTex, hitCell, 0);
          cEmis = texelFetch(uEmisTex, hitCell, 0).r;
          vec3 smoothN = normalize(na.xyz * 2.0 - 1.0);
          vec3 nLoc = normalize(mix(faceN, smoothN, nBlend));
          cWorldN = normalize(normalMat * nLoc);
          cBaseLin = srgbToLin(albedoRgb);
          cAo = na.a;
          cNdotL = dot(cWorldN, uSunDir);
          cCell = hitCell;
          cFace = faceN;
          cLastSh = -1.0;
        }
        float selfSh = (doSelfShadow && !isLegacy && cEmis < 0.5 && uShadeStyle != 2 && cNdotL > -0.28)
          ? (traceLocalShadow(hitPos + faceN * 0.08, sunLocal) ? 1.0 : 0.0)
          : 0.0;
        if (!sameCell || selfSh != cLastSh) {
          cShadedLin = shadeVoxel(cBaseLin, cWorldN, cAo, cEmis, selfSh, isLegacy, emisBoost);
          cLastSh = selfSh;
        }
        accLin += cShadedLin;
        accNorm += cWorldN;
        accEmis += cEmis;
        hits += 1.0;
        if (tHit < minT) {
          minT = tHit;
          bestVoxHit = roV + rdV * tHit;
        }
      }
    }
  }

  if (hits < 0.5) discard;

  float cov = hits / float(spp);
  vec3 avgLin = accLin / hits;
  vec3 avgN = normalize(accNorm / hits);
  float avgEm = accEmis / hits;
  float worldDist = minT * voxWorldScale;

  bool arcade = (uStyle == 0 || uStyle == 3);
  float sunsetW = max(0.0, 1.0 - abs(uTimeOfDay - 0.5) * 2.4);
  float nightW = max(0.0, (uTimeOfDay - 0.48) / 0.52);
  vec3 horCol = mix(mix(arcade ? vec3(0.66, 0.86, 0.99) : vec3(0.76, 0.89, 0.98), vec3(0.99, 0.56, 0.34), sunsetW), vec3(0.08, 0.13, 0.26), nightW);
  float fogStart = arcade ? 115.0 : 45.0;
  float fogT = uFogDensity <= 0.001
    ? 0.0
    : clamp(1.0 - exp(-pow(max(0.0, worldDist - fogStart) * (arcade ? 0.0040 : 0.0046) * uFogDensity, 1.6)), 0.0, 0.92);
  vec3 finalSrgb = mix(linToSrgb(avgLin), horCol, fogT * (1.0 - avgEm * 0.7));

  if (uDebugOverlay == 1) finalSrgb = avgN * 0.5 + 0.5;
  else if (uDebugOverlay == 2) finalSrgb = vec3(clamp(1.0 - worldDist / 220.0, 0.0, 1.0));
  else if (uDebugOverlay == 3) finalSrgb = vec3(fract(objIdNorm * 7.3), fract(objIdNorm * 13.7), fract(objIdNorm * 23.1));

  vec4 bvh = vec4(bestVoxHit, 1.0);
  gl_FragDepth = clamp((dot(vVoxToClipZ, bvh) / dot(vVoxToClipW, bvh)) * 0.5 + 0.5, 0.0, 0.99997);

  if (uDebugOverlay == 4) {
    outColor = vec4(uOverdrawUnit, 0.0, 0.0, 1.0);
    outAux = vec4(0.0);
    return;
  }

  outColor = vec4(finalSrgb, cov);
  outAux = vec4(outlineOn ? objIdNorm : 0.0, avgEm, isLegacy ? 1.0 : 0.0, cov);
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
uniform float uJfaScale;
in vec2 vUv;
out vec4 outSeed;

vec4 encodeSeed(vec2 uv) {
  vec2 q = clamp(floor(uv * 65535.0 + 0.5), 0.0, 65535.0);
  vec2 hi = floor(q / 256.0) / 255.0;
  vec2 lo = mod(q, 256.0) / 255.0;
  return vec4(hi.x, lo.x, hi.y, lo.y);
}

void main() {
  if (uJfaScale >= 0.75) {
    vec4 aux = texture(uAuxTex, vUv);
    if (aux.r > 0.002 && aux.a > 0.20) {
      outSeed = encodeSeed(vUv);
      return;
    }
    outSeed = vec4(0.0);
    return;
  }
  vec2 hp = 0.25 / uResolution;
  vec2 offs[4] = vec2[4](vec2(-hp.x, -hp.y), vec2(hp.x, -hp.y), vec2(-hp.x, hp.y), vec2(hp.x, hp.y));
  for (int i = 0; i < 4; i++) {
    vec2 suv = clamp(vUv + offs[i], vec2(0.0), vec2(1.0));
    vec4 aux = texture(uAuxTex, suv);
    if (aux.r > 0.002 && aux.a > 0.20) {
      outSeed = encodeSeed(suv);
      return;
    }
  }
  outSeed = vec4(0.0);
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
uniform int uTransparent;

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
    float probe = aux.g;
    probe = max(probe, texture(uAuxTex, vUv + vec2( rStep * 2.0, 0.0) * px).g);
    probe = max(probe, texture(uAuxTex, vUv + vec2(-rStep * 2.0, 0.0) * px).g);
    probe = max(probe, texture(uAuxTex, vUv + vec2(0.0,  rStep * 2.0) * px).g);
    probe = max(probe, texture(uAuxTex, vUv + vec2(0.0, -rStep * 2.0) * px).g);
    if (probe > 0.02) {
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
  }

  vec3 olLin = srgbToLin(uOutlineSrgb);

  if (uTransparent == 1) {
    float fgA = clamp(sceneCol.a, 0.0, 1.0);
    vec3 fgStraightSrgb = fgA > 1e-4 ? clamp(sceneCol.rgb / fgA, 0.0, 1.0) : vec3(0.0);
    vec3 fgLin = srgbToLin(fgStraightSrgb);
    float olA = clamp(olAlpha * 0.94, 0.0, 1.0);
    float outA = clamp(fgA + olA * (1.0 - fgA), 0.0, 1.0);
    vec3 premulLin = fgLin * fgA + olLin * (olA * (1.0 - fgA));
    vec3 straightLin = outA > 1e-4 ? premulLin / outA : vec3(0.0);
    float bloomA = clamp(max(bloomLin.r, max(bloomLin.g, bloomLin.b)) * 0.72, 0.0, 1.0);
    float finalA = clamp(outA + bloomA * (1.0 - outA), 0.0, 1.0);
    if (finalA < 1e-4) {
      fragColor = vec4(0.0);
      return;
    }
    vec3 srgb = linToSrgb(straightLin + bloomLin / max(finalA, 0.15));
    if (uStyle == 0 || uStyle == 3) {
      float luma = dot(srgb, vec3(0.299, 0.587, 0.114));
      srgb = mix(vec3(luma), srgb, 1.16);
      srgb = clamp((srgb - 0.5) * 1.06 + 0.5, 0.0, 1.0);
    }
    fragColor = vec4(srgb * finalA, finalA);
    return;
  }

  vec3 baseLin = srgbToLin(sceneCol.rgb);
  vec3 finalLin = mix(baseLin, olLin, olAlpha * 0.94) + bloomLin;
  vec3 srgb = linToSrgb(finalLin);

  if (uStyle == 0 || uStyle == 3) {
    float luma = dot(srgb, vec3(0.299, 0.587, 0.114));
    srgb = mix(vec3(luma), srgb, 1.16);
    srgb = clamp((srgb - 0.5) * 1.06 + 0.5, 0.0, 1.0);
  }
  fragColor = vec4(srgb, 1.0);
}`;

/** Overdraw heat map shader (black 0, blue 1, green 4, yellow 16, red 64, white 256). */
export const OVERDRAW_HEAT_FS = `#version 300 es
precision highp float;
uniform sampler2D uCountTex;
uniform int uChannel;
uniform float uUnit;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 c = texture(uCountTex, vUv);
  float v = (uChannel == 0 ? c.r : c.g) / max(uUnit, 1e-6);
  if (v < 0.05) { fragColor = vec4(0.04, 0.05, 0.08, 1.0); return; }
  float t = clamp(log2(v + 1.0) / 8.0, 0.0, 1.0);
  vec3 col = t < 0.25 ? mix(vec3(0.05, 0.22, 0.72), vec3(0.06, 0.75, 0.38), t * 4.0)
    : t < 0.50 ? mix(vec3(0.06, 0.75, 0.38), vec3(0.95, 0.88, 0.14), (t - 0.25) * 4.0)
    : t < 0.75 ? mix(vec3(0.95, 0.88, 0.14), vec3(0.96, 0.18, 0.12), (t - 0.50) * 4.0)
    : mix(vec3(0.96, 0.18, 0.12), vec3(1.0, 1.0, 1.0), (t - 0.75) * 4.0);
  fragColor = vec4(col, 1.0);
}`;
