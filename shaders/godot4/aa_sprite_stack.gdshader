// AASpriteStacker — Godot 4 CanvasItem Reference Shader
// Single-quad 4x RGSS Orthographic 3D Voxel DDA over a standard horizontal `slices.png` strip.
// Eliminates rotation shimmer, black bilinear halos, and Z-slice gaps in 1 draw call.
shader_type canvas_item;

uniform sampler2D sheet : filter_nearest, repeat_disable;
uniform int slices = 20;
uniform float angle_rad = 0.6;
uniform float squash = 0.75;
uniform float spacing = 1.0;
uniform float display_scale = 6.0;
uniform int samples : hint_range(1, 8) = 4;
uniform vec3 sun_dir = vec3(0.45, 0.40, 0.80);

vec2 get_rgss_offset(int idx, int count) {
    if (count <= 1) return vec2(0.0);
    if (count == 2) return idx == 0 ? vec2(-0.25, -0.25) : vec2(0.25, 0.25);
    if (count <= 4) {
        const vec2 r4[4] = vec2[4](
            vec2(-0.375, -0.125), vec2( 0.125, -0.375),
            vec2( 0.375,  0.125), vec2(-0.125,  0.375)
        );
        return r4[idx];
    }
    const vec2 r8[8] = vec2[8](
        vec2( 1.0, -3.0), vec2(-1.0,  3.0), vec2( 5.0,  1.0), vec2(-3.0, -5.0),
        vec2(-5.0,  5.0), vec2(-7.0, -1.0), vec2( 3.0,  7.0), vec2( 7.0, -7.0)
    );
    return r8[idx] / 16.0;
}

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
    float diag = ceil(length(vec2(vol.xy))) + 8.0;
    vec2 box_art = vec2(diag + 8.0, ceil(diag * squash) + float(slices) * spacing + 12.0);
    vec2 origin = vec2(box_art.x * 0.5, box_art.y - diag * squash * 0.5 - 6.0);

    float ca = cos(angle_rad);
    float sa = sin(angle_rad);
    vec3 w_l = normalize(sun_dir);
    vec3 obj_l = normalize(vec3(w_l.x * ca + w_l.y * sa, -w_l.x * sa + w_l.y * ca, w_l.z));

    int spp = samples <= 1 ? 1 : (samples <= 2 ? 2 : (samples <= 4 ? 4 : 8));
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 8; i++) {
        if (i >= spp) break;
        vec2 art_coord = (UV * box_art) + (get_rgss_offset(i, spp) / max(display_scale, 1.0)) - origin;
        acc += trace_stack_ray(art_coord, vol, ca, sa, obj_l);
    }
    acc /= float(spp);
    vec3 rgb = acc.a > 1e-4 ? lin_to_srgb(acc.rgb / acc.a) : vec3(0.0);
    COLOR = vec4(rgb, acc.a);
}
