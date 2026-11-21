# Anti-Aliased Sprite Stacking — Engine Shaders & Recipes

Every recipe below eliminates the core aliasing failure modes of naive 2D slice stacking:
1. **No 1× nearest-neighbor rotation crawl or 1px post blinking** (uses RGSS Orthographic 3D Voxel DDA or Exact Euclidean-Jacobian Bandlimited Filtering).
2. **No Z-slice gaps** at any `squash` or `spacing`.
3. **No correlated-coverage alpha buildup** on vertical walls (`1 - (1 - α)^N → 1`).
4. **No dark bilinear halo fringes** (paired with RGB edge-dilated slice strips from `aa_views_to_slices.py`).
5. **Single draw call** for the GPU shaders (works directly on a standard horizontal 2D `slices.png` strip — no 3D texture asset pipeline required!).

---

## 1. Godot 4 (`CanvasItem` — Single-Quad AA Voxel DDA + 4× RGSS)

Attach this shader to a single `Sprite2D` or `ColorRect` whose `sheet` uniform is the standard horizontal slice strip PNG (`W * slices × H`, Filter = Nearest or Linear with edge bleed). Render at native display resolution (not a low-res integer viewport) for crisp fat-pixel anti-aliasing.

```gdshader
shader_type canvas_item;

uniform sampler2D sheet : filter_nearest, repeat_disable;
uniform int slices = 36;
uniform float angle_rad = 0.6;
uniform float squash = 0.75;
uniform float spacing = 1.0;
uniform float display_scale = 6.0;
uniform vec3 sun_dir = vec3(0.45, 0.40, 0.80);

const vec2 RGSS4[4] = vec2[4](
    vec2(-0.375, -0.125),
    vec2( 0.125, -0.375),
    vec2( 0.375,  0.125),
    vec2(-0.125,  0.375)
);

vec3 srgb_to_lin(vec3 c) {
    return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(0.04045)));
}
vec3 lin_to_srgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308)));
}

vec4 fetch_voxel(ivec3 cell, ivec2 slice_size) {
    ivec2 tc = ivec2(cell.z * slice_size.x + cell.x, cell.y);
    return texelFetch(sheet, tc, 0);
}

vec4 trace_stack_ray(vec2 art_coord, ivec3 vol, float ca, float sa, vec3 obj_light) {
    float inv_sq = 1.0 / max(squash, 0.1);
    vec3 bmax = vec3(vol);
    float v0 = (art_coord.y + bmax.z * spacing) * inv_sq;
    vec3 ro = vec3(
        bmax.x * 0.5 + art_coord.x * ca + v0 * sa,
        bmax.y * 0.5 - art_coord.x * sa + v0 * ca,
        bmax.z
    );
    vec3 rd = vec3(-spacing * sa, -spacing * ca, -squash);
    vec3 inv_d = vec3(
        abs(rd.x) > 1e-6 ? 1.0 / rd.x : 1e20,
        abs(rd.y) > 1e-6 ? 1.0 / rd.y : 1e20,
        abs(rd.z) > 1e-6 ? 1.0 / rd.z : 1e20
    );

    vec3 t0 = (vec3(0.0) - ro) * inv_d;
    vec3 t1 = (bmax - ro) * inv_d;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float t_enter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
    float t_exit = min(min(tmax.x, tmax.y), tmax.z);
    if (t_exit <= t_enter + 1e-4) return vec4(0.0);

    vec3 pos = ro + rd * (t_enter + 1e-4);
    ivec3 cell = clamp(ivec3(floor(pos)), ivec3(0), vol - 1);
    ivec3 step_dir = ivec3(
        abs(rd.x) > 1e-6 ? (rd.x > 0.0 ? 1 : -1) : 0,
        abs(rd.y) > 1e-6 ? (rd.y > 0.0 ? 1 : -1) : 0,
        abs(rd.z) > 1e-6 ? (rd.z > 0.0 ? 1 : -1) : 0
    );
    vec3 t_delta = abs(inv_d);
    vec3 next_b = vec3(cell) + max(vec3(step_dir), vec3(0.0));
    vec3 t_max = (next_b - pos) * inv_d;
    if (step_dir.x == 0) t_max.x = 1e20;
    if (step_dir.y == 0) t_max.y = 1e20;
    if (step_dir.z == 0) t_max.z = 1e20;

    vec3 face_n = vec3(0.0, 0.0, 1.0);
    if (tmin.x >= tmin.y && tmin.x >= tmin.z) face_n = vec3(-float(step_dir.x), 0.0, 0.0);
    else if (tmin.y >= tmin.x && tmin.y >= tmin.z) face_n = vec3(0.0, -float(step_dir.y), 0.0);

    for (int i = 0; i < 160; i++) {
        vec4 tex = fetch_voxel(cell, vol.xy);
        if (tex.a >= 0.5) {
            float ndotl = dot(face_n, obj_light);
            float t_sh = smoothstep(-0.25, 0.05, ndotl);
            float t_lit = smoothstep(0.22, 0.52, ndotl);
            vec3 tint = mix(mix(vec3(0.66, 0.72, 0.86), vec3(0.97, 0.98, 1.0), t_sh), vec3(1.12, 1.10, 1.04), t_lit);
            float h_ao = mix(0.88, 1.0, float(cell.z) / max(bmax.z - 1.0, 1.0));
            return vec4(srgb_to_lin(tex.rgb) * srgb_to_lin(tint) * h_ao, 1.0);
        }
        if (t_max.x <= t_max.y && t_max.x <= t_max.z) {
            cell.x += step_dir.x; t_max.x += t_delta.x;
            face_n = vec3(-float(step_dir.x), 0.0, 0.0);
        } else if (t_max.y <= t_max.z) {
            cell.y += step_dir.y; t_max.y += t_delta.y;
            face_n = vec3(0.0, -float(step_dir.y), 0.0);
        } else {
            cell.z += step_dir.z; t_max.z += t_delta.z;
            face_n = vec3(0.0, 0.0, -float(step_dir.z));
        }
        if (any(lessThan(cell, ivec3(0))) || any(greaterThanEqual(cell, vol))) break;
    }
    return vec4(0.0);
}

void fragment() {
    ivec2 tex_sz = textureSize(sheet, 0);
    ivec3 vol = ivec3(tex_sz.x / slices, tex_sz.y, slices);
    // Size the quad in art-pixel units so UV in [0..1] covers the full rotated bounding box
    float diag = ceil(length(vec2(vol.xy))) + 8.0;
    vec2 box_art = vec2(diag + 8.0, ceil(diag * squash) + float(slices) * spacing + 12.0);
    vec2 origin = vec2(box_art.x * 0.5, box_art.y - diag * squash * 0.5 - 6.0);

    float ca = cos(angle_rad);
    float sa = sin(angle_rad);
    vec3 w_l = normalize(sun_dir);
    vec3 obj_l = normalize(vec3(w_l.x * ca + w_l.y * sa, -w_l.x * sa + w_l.y * ca, w_l.z));

    vec4 acc = vec4(0.0);
    for (int i = 0; i < 4; i++) {
        vec2 art_coord = (UV * box_art) + (RGSS4[i] / display_scale) - origin;
        acc += trace_stack_ray(art_coord, vol, ca, sa, obj_l);
    }
    acc *= 0.25;
    vec3 rgb = acc.a > 1e-4 ? lin_to_srgb(acc.rgb / acc.a) : vec3(0.0);
    COLOR = vec4(rgb, acc.a);
}
```

**Anti-Aliased Outline in Godot 4:** Render the sprite quad into a `SubViewport` (same display resolution) and apply a 2D circular distance outline shader (or 4-pass JFA) to the viewport texture so corners stay uniformly round and anti-aliased.

---

## 2. Unity URP 2D (HLSL — Single-Quad AA Voxel DDA + 4× RGSS)

Use an `Unlit` URP 2D Shader Graph custom function or HLSL shader on a single quad mesh sized to the projected art bounds. Set `_MainTex` (`slices.png`) to **Point (no filter)**, **sRGB**, and **Non-Power of Two: None**:

```hlsl
static const float2 RGSS4[4] = {
    float2(-0.375, -0.125),
    float2( 0.125, -0.375),
    float2( 0.375,  0.125),
    float2(-0.125,  0.375)
};

float4 FetchVoxel(Texture2D sheet, int3 cell, int2 sliceSize) {
    return sheet.Load(int3(cell.z * sliceSize.x + cell.x, sliceSize.y - 1 - cell.y, 0));
}

// Same Amanatides-Woo 3D DDA traversal as Godot 4 above:
// 1. Ray origin: ro = float3(W*0.5 + ax*ca + v0*sa, L*0.5 - ax*sa + v0*ca, slices)
// 2. Ray dir:    rd = float3(-spacing*sa, -spacing*ca, -squash)
// 3. Accumulate 4 RGSS4 sub-pixel hits in Linear color space (Unity's native pipeline when Color Space = Linear!),
//    then divide by 4.0 and output straight alpha.
```

---

## 3. Pure 2D Slice-Stacking Shader (Bandlimited Fat-Pixel + Correlated Coverage)

If your engine or effect *must* stack individual 2D slices (e.g., per-slice wind shear or articulated layer offsets), avoid naive bilinear filtering! Use **exact Euclidean L2 Jacobian widths** + **edge-dilated slices** + the **Correlated-Coverage Over Operator**:

```glsl
// Exact L2 Jacobian texel-space filter width for rotation (ca, sa), squash, and display scale S:
float wu = sqrt(ca * ca + (sa / squash) * (sa / squash)) / scale;
float wv = sqrt(sa * sa + (ca / squash) * (ca / squash)) / scale;
vec2 fw = max(vec2(wu, wv), vec2(0.02));

// Bandlimited fat-pixel UV warp (keeps texel centers 100% crisp, smooths only the 1-display-px edge):
vec2 pShift = sliceCoord - 0.5;
vec2 base = floor(pShift);
vec2 frac = pShift - base;
vec2 aaUv = (base + 0.5 + clamp((frac - 0.5) / fw + 0.5, 0.0, 1.0)) / sliceSize;
vec4 tex = texture(edgeDilatedSliceTex, aaUv); // GL_LINEAR on edge-bleed-padded texture!

// Correlated-Coverage Over Operator (prevents vertical-wall alpha buildup across N stacked slices!):
float newA = max(accA, tex.a);
float w = tex.a / max(newA, 1e-5);
accLinRgb = mix(accLinRgb, srgbToLin(tex.rgb), w);
accA = newA;
```

---

## 4. Web Canvas 2D (Zero-WebGL Fallback / Pre-Baked Export)

For environments without WebGL2:
- **Best option (Zero runtime cost):** Pre-bake an anti-aliased 16- or 32-direction sheet via:
  ```bash
  python3 scripts/aa_views_to_slices.py views.png slices.png --slices 36 --export-dirs 16 --export-scale 2 --samples 8
  ```
  and draw the nearest angle frame directly with `drawImage`.
- **Dynamic Canvas 2D option:** Render the stack onto an offscreen canvas at **2× supersampled resolution** with symmetric centers `-(w * 0.5), -(h * 0.5)` and sub-slice steps (`dz = 0.5`), apply a 2D distance-field outline, then downsample onto the display canvas with `imageSmoothingEnabled = true; imageSmoothingQuality = "high"`.

---

## 5. WebGL2 Full Studio Reference

See [`scripts/viewer.html`](scripts/viewer.html) for the complete WebGL2 multi-pass implementation featuring:
- Single-draw-call `TEXTURE_3D` **RGSS Orthographic Voxel DDA** (`1× / 4× / 8× / 16×`)
- **Bandlimited Fat-Pixel Slices** with Correlated-Coverage Over
- **CleanEdge Diagonal-Reconstructing Slices**
- **3D Visual-Hull SDF Sphere Tracing** with IQ soft-penumbra shadows
- **4-pass Jump Flooding Algorithm (JFA)** 2D Euclidean SDF anti-aliased outlines (using standard `RGBA8` 16-bit packed coords — zero float-FBO extensions needed!)
