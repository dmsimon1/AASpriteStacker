#!/usr/bin/env python3
"""AASpriteStacker: Anti-aliased 4-view visual-hull voxel & 3D SDF sprite stacker.

Turns four orthographic views (top, side, front, back) into:
  - An edge-dilated RGBA slice strip PNG (drop-in compatible with 2D engines & WebGL2)
  - A continuous 3D Visual-Hull Signed Distance Field (SDF) slice strip PNG
  - A smooth SDF-gradient 3D normal-map slice strip PNG
  - An auto-detected emissive mask slice strip PNG
  - A side-by-side comparison preview (Legacy 1x Nearest vs AA Crisp Voxel vs AA Smooth SDF)
  - An interactive WebGL2 + Canvas2D AA viewer with live A/B split-screen comparison
  - An anti-aliased N-direction baked sprite sheet PNG

Examples:
  python aa_views_to_slices.py sheet.png slices.png --slices 36 --preview check.png --html viewer.html
  python aa_views_to_slices.py sheet.png slices.png --slices 36 --sdf sdf.png --normals normals.png --export-dirs 16
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


# ============================================================
# COLOR SPACE UTILITIES (Exact IEC 61966-2-1 sRGB <-> Linear & Oklab)
# ============================================================

def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    """Convert sRGB in [0, 1] to linear light in [0, 1]."""
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    """Convert linear light in [0, 1] to sRGB in [0, 1]."""
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1.0 / 2.4)) - 0.055)


def srgb_u8_to_oklab(rgb_u8: np.ndarray) -> np.ndarray:
    """Convert uint8 sRGB (..., 3) to perceptual Oklab (..., 3) (Bjorn Ottosson)."""
    lin = srgb_to_linear(rgb_u8.astype(np.float32) / 255.0)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = np.cbrt(np.maximum(0.0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b))
    m = np.cbrt(np.maximum(0.0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b))
    s = np.cbrt(np.maximum(0.0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    b_ = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return np.stack([L, a, b_], axis=-1)


# ============================================================
# EXACT 2D EUCLIDEAN DISTANCE TRANSFORM & SIGNED DISTANCE FIELD
# ============================================================

def _edt_1d_exact_small(f: np.ndarray) -> np.ndarray:
    """Exact 1D squared distance transform along the last axis for small n (<= 256)."""
    n = f.shape[-1]
    idx = np.arange(n, dtype=np.float32)
    d2 = (idx[:, None] - idx[None, :]) ** 2  # (n, n)
    out = np.empty_like(f)
    # Chunk along axis 0 to cap temporary memory < 4 MB
    h = f.shape[0]
    step = max(1, min(h, (1024 * 1024) // max(1, n * n)))
    for y0 in range(0, h, step):
        y1 = min(h, y0 + step)
        out[y0:y1] = (f[y0:y1, None, :] + d2[None, :, :]).min(axis=2)
    return out


def _edt_1d_banded(f: np.ndarray, radius: int) -> np.ndarray:
    """Exact 1D squared distance transform within +-radius along axis 1."""
    h, w = f.shape
    out = f.copy()
    for d in range(1, radius + 1):
        d2 = float(d * d)
        np.minimum(out[:, d:], f[:, :-d] + d2, out=out[:, d:])
        np.minimum(out[:, :-d], f[:, d:] + d2, out=out[:, :-d])
    return out


def edt_2d(mask: np.ndarray, max_radius: int | None = None) -> np.ndarray:
    """Compute exact 2D Euclidean distance to True pixels in `mask` (float32).

    When `max_radius` is None and image dims <= 256, computes exact full-domain EDT.
    Otherwise uses a fast exact banded separable EDT up to `max_radius`.
    """
    h, w = mask.shape
    inf = np.float32(1e9)
    f = np.where(mask, np.float32(0.0), inf)
    if max_radius is None and max(h, w) <= 256:
        g = _edt_1d_exact_small(f)
        d2 = _edt_1d_exact_small(g.T).T
    else:
        r = max_radius if max_radius is not None else max(h, w)
        g = _edt_1d_banded(f, r)
        d2 = _edt_1d_banded(g.T, r).T
    return np.sqrt(np.maximum(d2, np.float32(0.0)))


def alpha_to_sdf_2d(alpha01: np.ndarray, max_radius: int | None = None) -> np.ndarray:
    """Compute sub-pixel 2D Signed Distance Field from continuous alpha in [0, 1].

    Convention: negative INSIDE foreground, positive OUTSIDE foreground, 0 on the 0.5 contour.
    Treats pixels outside the image domain as empty air (alpha = 0) so tightly cropped
    views still have exact outward distances and normals along boundary edges.
    """
    inside = alpha01 >= 0.5
    if not inside.any():
        return np.full(alpha01.shape, 1e3, dtype=np.float32)

    d_out = edt_2d(inside, max_radius=max_radius)
    # Pad with 1px air border so foreground touching the image frame knows distance to exterior air
    inside_pad = np.pad(inside, 1, mode="constant", constant_values=False)
    d_in = edt_2d(~inside_pad, max_radius=max_radius)[1:-1, 1:-1]
    # Shift by 0.5 so zero crossing sits cleanly halfway between boundary pixel centers
    sdf = np.where(inside, -(d_in - 0.5), d_out - 0.5).astype(np.float32)

    # Sub-pixel refinement on anti-aliased boundary band (0 < alpha < 1)
    frac = (alpha01 > 0.004) & (alpha01 < 0.996)
    if frac.any():
        near_edge = frac & (np.abs(sdf) <= 1.0)
        sdf = np.where(near_edge, 0.5 - alpha01, sdf).astype(np.float32)
    return sdf


# ============================================================
# STAGE 1: SOFT BACKGROUND REMOVAL, COLOR DECONTAMINATION & VIEW FINDING
# ============================================================

def remove_background(
    rgba: np.ndarray,
    tol: int = 28,
    soft_band: int = 16,
    hard_alpha: bool = False,
) -> np.ndarray:
    """Return RGBA array with clean transparent background.

    Unlike binary thresholding, preserves existing anti-aliased alpha when transparent,
    and for flat-background sheets uses border-seeded flood-fill plus soft boundary
    matting and foreground color decontamination (preventing white/gray edge fringes).
    """
    h, w = rgba.shape[:2]
    if (rgba[..., 3] < 128).mean() > 0.05:
        out = rgba.copy()
        if hard_alpha:
            out[..., 3] = np.where(out[..., 3] >= 128, 255, 0)
        return out

    rgb = rgba[..., :3].astype(np.float32)
    corners = np.array([rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]])
    bg = np.median(corners, axis=0)
    dist = np.abs(rgb - bg).max(axis=-1)
    close = dist <= tol

    bg_mask = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        if close[0, x] and not bg_mask[0, x]:
            bg_mask[0, x] = True
            q.append((0, x))
        if close[h - 1, x] and not bg_mask[h - 1, x]:
            bg_mask[h - 1, x] = True
            q.append((h - 1, x))
    for y in range(1, h - 1):
        if close[y, 0] and not bg_mask[y, 0]:
            bg_mask[y, 0] = True
            q.append((y, 0))
        if close[y, w - 1] and not bg_mask[y, w - 1]:
            bg_mask[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        if y > 0 and close[y - 1, x] and not bg_mask[y - 1, x]:
            bg_mask[y - 1, x] = True
            q.append((y - 1, x))
        if y + 1 < h and close[y + 1, x] and not bg_mask[y + 1, x]:
            bg_mask[y + 1, x] = True
            q.append((y + 1, x))
        if x > 0 and close[y, x - 1] and not bg_mask[y, x - 1]:
            bg_mask[y, x - 1] = True
            q.append((y, x - 1))
        if x + 1 < w and close[y, x + 1] and not bg_mask[y, x + 1]:
            bg_mask[y, x + 1] = True
            q.append((y, x + 1))

    out = rgba.copy()
    alpha = np.where(bg_mask, 0.0, 1.0).astype(np.float32)

    if not hard_alpha and soft_band > 0:
        # Soft-matte the 1px outer foreground frontier that lies close to the background color
        pad_bg = np.pad(bg_mask, 1, constant_values=True)
        touches_bg = (~bg_mask) & (
            pad_bg[:-2, 1:-1] | pad_bg[2:, 1:-1] | pad_bg[1:-1, :-2] | pad_bg[1:-1, 2:]
        )
        fringe = touches_bg & (dist < tol + soft_band)
        if fringe.any():
            a_soft = np.clip((dist[fringe] - tol) / float(soft_band), 0.05, 1.0)
            alpha[fringe] = a_soft
            # Decontaminate observed RGB from blended background: C_fg = (C_obs - (1-a)*C_bg) / a
            c_obs = rgb[fringe]
            c_fg = (c_obs - (1.0 - a_soft[:, None]) * bg[None, :]) / np.maximum(a_soft[:, None], 0.15)
            out[fringe, :3] = np.clip(np.round(c_fg), 0, 255).astype(np.uint8)

    out[..., 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return out


def find_views(sheet: np.ndarray, order: str = "auto") -> list[np.ndarray]:
    """Locate the four views [top, side, front, back], preserving continuous alpha."""
    solid = sheet[..., 3] >= 32
    h, w = solid.shape
    dilate_steps = max(2, min(6, round(min(h, w) / 260)))
    grown = solid.copy()
    for _ in range(dilate_steps):
        g = grown.copy()
        g[1:] |= grown[:-1]
        g[:-1] |= grown[1:]
        g[:, 1:] |= grown[:, :-1]
        g[:, :-1] |= grown[:, 1:]
        grown = g

    seen = np.zeros_like(solid)
    boxes: list[tuple[int, int, int, int, int]] = []
    for y0, x0 in zip(*np.nonzero(grown)):
        if seen[y0, x0]:
            continue
        stack = [(int(y0), int(x0))]
        seen[y0, x0] = True
        min_x = max_x = int(x0)
        min_y = max_y = int(y0)
        count = 0
        while stack:
            y, x = stack.pop()
            count += 1
            if x < min_x:
                min_x = x
            if x > max_x:
                max_x = x
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y
            if y + 1 < h and grown[y + 1, x] and not seen[y + 1, x]:
                seen[y + 1, x] = True
                stack.append((y + 1, x))
            if y > 0 and grown[y - 1, x] and not seen[y - 1, x]:
                seen[y - 1, x] = True
                stack.append((y - 1, x))
            if x + 1 < w and grown[y, x + 1] and not seen[y, x + 1]:
                seen[y, x + 1] = True
                stack.append((y, x + 1))
            if x > 0 and grown[y, x - 1] and not seen[y, x - 1]:
                seen[y, x - 1] = True
                stack.append((y, x - 1))
        if count > 40:
            boxes.append((min_x, min_y, max_x + 1, max_y + 1, count))

    if not boxes:
        raise ValueError("No foreground drawings found. Check --bg-tol or image alpha.")

    big = max((b[2] - b[0]) * (b[3] - b[1]) for b in boxes)
    boxes = [b for b in boxes if (b[2] - b[0]) * (b[3] - b[1]) >= 0.14 * big]
    row_band = max(1.0, h / 2.2)
    boxes.sort(key=lambda b: (round((b[1] + b[3]) / 2 / row_band), b[0]))

    if len(boxes) != 4:
        summary = [(b[0], b[1], b[2] - b[0], b[3] - b[1]) for b in boxes]
        raise ValueError(
            f"Found {len(boxes)} drawings {summary}, expected 4 (top, side, front, back). "
            "Check spacing between views or adjust --bg-tol."
        )

    views: list[np.ndarray] = []
    for x0, y0, x1, y1, _ in boxes:
        v = sheet[y0:y1, x0:x1].copy()
        ys, xs = np.nonzero(v[..., 3] >= 32)
        v = v[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        views.append(v)

    if order == "reading":
        return views

    def err(t: int, s: int) -> float:
        tv, sv = views[t], views[s]
        rest = [views[i] for i in range(4) if i not in (t, s)]
        e = abs(math.log(tv.shape[0] / sv.shape[1]))
        e += sum(abs(math.log(tv.shape[1] / f.shape[1])) + abs(math.log(sv.shape[0] / f.shape[0])) for f in rest) / 2
        return e

    pairs = [(t, s) for t in range(4) for s in range(4) if t != s]
    best = min(err(t, s) for t, s in pairs)
    t, s = next(p for p in pairs if err(*p) <= best + 0.1)
    rest = [views[i] for i in range(4) if i not in (t, s)]
    return [views[t], views[s], rest[0], rest[1]]


def strip_outline(v: np.ndarray, dark: int = 70) -> np.ndarray:
    """Replace 1px dark outer contour pixels with the median color of interior neighbors."""
    if dark <= 0:
        return v
    m = v[..., 3] >= 64
    pad = np.pad(m, 1)
    edge = m & ~(
        pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        & pad[:-2, :-2] & pad[:-2, 2:] & pad[2:, :-2] & pad[2:, 2:]
    )
    line = edge & (v[..., :3].astype(np.int32).sum(-1) / 3.0 < dark)
    out = v.copy()
    for y, x in zip(*np.nonzero(line)):
        samples = []
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not line[yy, xx]:
                samples.append(v[yy, xx, :3])
        if samples:
            out[y, x, :3] = np.median(np.stack(samples, axis=0), axis=0).astype(np.uint8)
    return out


# ============================================================
# STAGE 2: LINEAR-LIGHT PREMULTIPLIED RESAMPLING & OKLAB QUANTIZATION
# ============================================================

def detect_pixel_grid_scale(v: np.ndarray) -> int:
    """Detect integer pixel-art upscaling factor (e.g. 4x or 8x) if the view is block-upscaled."""
    h, w = v.shape[:2]
    if min(h, w) < 16:
        return 1
    rgba = v.astype(np.int16)
    row_diff = np.abs(rgba[1:] - rgba[:-1]).max(axis=-1).mean(axis=1)
    col_diff = np.abs(rgba[:, 1:] - rgba[:, :-1]).max(axis=-1).mean(axis=0)
    best_s = 1
    best_score = 0.0
    for s in range(2, 17):
        if h % s != 0 or w % s != 0 or h // s < 4 or w // s < 4:
            continue
        # Inside uniform s x s blocks, internal diffs should be nearly zero
        r_mask = np.ones(h - 1, dtype=bool)
        r_mask[s - 1 :: s] = False
        c_mask = np.ones(w - 1, dtype=bool)
        c_mask[s - 1 :: s] = False
        inner = 0.5 * (row_diff[r_mask].mean() + col_diff[c_mask].mean())
        outer = 0.5 * (row_diff[~r_mask].mean() + col_diff[~c_mask].mean())
        if inner < 1.5 and outer > inner * 4.0 + 2.0:
            score = outer / (inner + 0.1)
            if score > best_score:
                best_score = score
                best_s = s
    return best_s


def fit_aa(v: np.ndarray, w: int, h: int, resample: str = "auto") -> np.ndarray:
    """Resize a view to (h, w) without premultiplied dark halos or gamma darkening.

    - 'nearest': classic point sampling (only for exact integer pixel grids)
    - 'area': premultiplied linear-light area/box-Lanczos downsampling (preserves smooth alpha!)
    - 'auto': snaps integer block-upscaled pixel art cleanly; uses linear premultiplied Lanczos otherwise.
    """
    tw, th = max(1, w), max(1, h)
    sh, sw = v.shape[:2]
    if sh == th and sw == tw:
        return v.copy()

    mode = resample
    if mode == "auto":
        g = detect_pixel_grid_scale(v)
        if g > 1 and abs(sw / g - tw) <= 1.0 and abs(sh / g - th) <= 1.0:
            mode = "nearest"
        else:
            mode = "area"

    if mode == "nearest":
        return np.array(Image.fromarray(v).resize((tw, th), Image.NEAREST))

    # Premultiplied linear-light resampling prevents dark fringes and gamma dimming
    lin_rgb = srgb_to_linear(v[..., :3].astype(np.float32) / 255.0)
    alpha = v[..., 3].astype(np.float32) / 255.0
    premul = lin_rgb * alpha[..., None]

    pil_filter = Image.Resampling.BOX if (sw >= tw * 2 and sh >= th * 2) else Image.Resampling.LANCZOS

    def _resize_f32(ch: np.ndarray) -> np.ndarray:
        return np.array(Image.fromarray(ch, mode="F").resize((tw, th), pil_filter), dtype=np.float32)

    a_out = np.clip(_resize_f32(alpha), 0.0, 1.0)
    r_out = np.maximum(0.0, _resize_f32(premul[..., 0]))
    g_out = np.maximum(0.0, _resize_f32(premul[..., 1]))
    b_out = np.maximum(0.0, _resize_f32(premul[..., 2]))

    safe_a = np.where(a_out > 1e-4, a_out, 1.0)
    rgb_lin = np.stack([r_out / safe_a, g_out / safe_a, b_out / safe_a], axis=-1)
    rgb_srgb = linear_to_srgb(np.clip(rgb_lin, 0.0, 1.0))

    out = np.zeros((th, tw, 4), dtype=np.uint8)
    out[..., :3] = np.clip(np.round(rgb_srgb * 255.0), 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(np.round(a_out * 255.0), 0, 255).astype(np.uint8)
    return out


def one_palette_oklab(views: list[np.ndarray], n: int) -> list[np.ndarray]:
    """Quantize all four views onto one shared palette using perceptual Oklab distance."""
    if n <= 0:
        return views
    px_list = [v[v[..., 3] >= 64][:, :3] for v in views if (v[..., 3] >= 64).any()]
    if not px_list:
        return views
    px = np.concatenate(px_list, axis=0)
    px = np.unique(px // 4 * 4 + 2, axis=0).astype(np.uint8)
    k = min(n, len(px))
    pal_img = Image.fromarray(px.reshape(1, -1, 3)).quantize(k, method=Image.MEDIANCUT, dither=Image.NONE)
    pal_u8 = np.array(pal_img.getpalette()[: k * 3], dtype=np.uint8).reshape(-1, 3)
    pal_lab = srgb_u8_to_oklab(pal_u8)  # (k, 3)

    out: list[np.ndarray] = []
    for v in views:
        q = v.copy()
        v_lab = srgb_u8_to_oklab(v[..., :3])  # (H, W, 3)
        dist = ((v_lab[..., None, :] - pal_lab[None, None, :, :]) ** 2).sum(axis=-1)
        q[..., :3] = pal_u8[dist.argmin(axis=-1)]
        out.append(q)
    return out


def match_top(top: np.ndarray, side: np.ndarray) -> str:
    """Return 'down' or 'up' so dark cabin/window pixels sit over the tallest span of the side view."""
    tall = (side[..., 3] >= 64).sum(0)
    tall = np.interp(np.linspace(0, len(tall) - 1, top.shape[0]), np.arange(len(tall)), tall)
    tall_mask = tall >= 0.8 * max(tall.max(), 1e-6)
    dark = ((top[..., :3].astype(int).sum(-1) < 240) & (top[..., 3] >= 64)).mean(1)
    return "down" if (dark * tall_mask).sum() >= (dark[::-1] * tall_mask).sum() else "up"


def _edge_row(view: np.ndarray, row: int, length: int) -> np.ndarray | None:
    xs = np.nonzero(view[row, :, 3] >= 64)[0]
    if len(xs) == 0:
        xs = np.nonzero(view[row, :, 3] > 0)[0]
    if len(xs) == 0:
        return None
    idx = np.clip(np.arange(length), int(xs[0]), int(xs[-1]))
    return view[row, idx, :3]


# ============================================================
# STAGE 3: SOFT VISUAL-HULL CARVING, 3D SDF FUSION & RGB EDGE DILATION
# ============================================================

def dilate_rgb_edges(vol: np.ndarray, iterations: int = 4) -> np.ndarray:
    """Bleed surface RGB colors into adjacent transparent voxels (keeping alpha == 0).

    Prevents dark/black edge halos whenever GPU bilinear/trilinear or bandlimited AA
    shaders interpolate across solid/transparent voxel borders.
    """
    out = vol.copy()
    valid = out[..., 3] > 0
    rgb = out[..., :3].astype(np.float32)

    for _ in range(iterations):
        if valid.all():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(valid.shape, dtype=np.float32)
        p_rgb = np.pad(rgb, ((1, 1), (1, 1), (1, 1), (0, 0)), mode="edge")
        p_val = np.pad(valid, ((1, 1), (1, 1), (1, 1)), mode="constant", constant_values=False)

        # 6-connected axial neighbors (weighted 2) + 12 XY/Z diagonals (weighted 1)
        offsets = (
            (-1, 0, 0, 2.0), (1, 0, 0, 2.0),
            (0, -1, 0, 2.0), (0, 1, 0, 2.0),
            (0, 0, -1, 2.0), (0, 0, 1, 2.0),
            (0, -1, -1, 1.0), (0, -1, 1, 1.0),
            (0, 1, -1, 1.0), (0, 1, 1, 1.0),
        )
        H, L, W = valid.shape
        for dz, dy, dx, wt in offsets:
            m = p_val[1 + dz : 1 + dz + H, 1 + dy : 1 + dy + L, 1 + dx : 1 + dx + W]
            c = p_rgb[1 + dz : 1 + dz + H, 1 + dy : 1 + dy + L, 1 + dx : 1 + dx + W]
            w_arr = m.astype(np.float32) * wt
            acc += c * w_arr[..., None]
            cnt += w_arr

        fill = (~valid) & (cnt > 0)
        if not fill.any():
            break
        rgb[fill] = acc[fill] / cnt[fill, None]
        valid |= fill

    out[..., :3] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    # Alpha remains completely unchanged!
    return out


def smooth_sdf_3d(sdf: np.ndarray, strength: float = 0.25) -> np.ndarray:
    """Optional light separable 3D smoothing pass on the continuous SDF."""
    if strength <= 0.0:
        return sdf
    w_side = float(np.clip(strength * 0.5, 0.0, 0.25))
    w_mid = 1.0 - 2.0 * w_side
    out = sdf.astype(np.float32).copy()
    for axis in (0, 1, 2):
        pad = np.pad(out, [(1, 1) if a == axis else (0, 0) for a in range(3)], mode="edge")
        sl_m = [slice(1, -1) if a == axis else slice(None) for a in range(3)]
        sl_l = [slice(0, -2) if a == axis else slice(None) for a in range(3)]
        sl_r = [slice(2, None) if a == axis else slice(None) for a in range(3)]
        out = w_mid * pad[tuple(sl_m)] + w_side * (pad[tuple(sl_l)] + pad[tuple(sl_r)])
    return out


def carve_aa(
    top: np.ndarray,
    side: np.ndarray,
    front: np.ndarray,
    back: np.ndarray,
    *,
    shade: float = 0.0,
    round_: bool = False,
    hard_alpha: bool = False,
    bleed: bool = True,
    smooth_sdf: float = 0.15,
) -> tuple[np.ndarray, np.ndarray]:
    """Soft visual-hull carve + continuous 3D Visual-Hull SDF fusion.

    Returns:
        vol: (H, L, W, 4) uint8 RGBA slices (with continuous edge coverage & RGB bleed padding)
        sdf: (H, L, W) float32 3D signed distance field (negative inside, positive outside)
    """
    L, W = top.shape[:2]
    H = side.shape[0]

    a_top = top[..., 3].astype(np.float32) / 255.0
    a_side = side[..., 3].astype(np.float32) / 255.0
    a_front = front[..., 3].astype(np.float32) / 255.0
    a_back = back[..., 3].astype(np.float32) / 255.0

    # 2D Signed Distance Fields for each orthographic projection (negative inside)
    d_top = alpha_to_sdf_2d(a_top)      # (L, W)
    d_side = alpha_to_sdf_2d(a_side)    # (H, L)
    d_front = alpha_to_sdf_2d(a_front)  # (H, W)
    d_back = alpha_to_sdf_2d(a_back)    # (H, W)

    # Fuse into continuous 3D Visual-Hull SDF:
    #   hull = top ∩ side ∩ (front ∪ back)
    #   SDF(A ∩ B) = max(d_A, d_B), SDF(A ∪ B) = min(d_A, d_B)
    d_side_z = d_side[::-1]                             # z=0 on ground
    d_fb_z = np.minimum(d_front[::-1], d_back[::-1])    # (H, W)
    sdf = np.maximum(d_top[None, :, :], np.maximum(d_side_z[:, :, None], d_fb_z[:, None, :]))

    # Soft occupancy coverage in [0, 1]
    a_side_z = a_side[::-1]                             # (H, L)
    a_fb_z = np.maximum(a_front[::-1], a_back[::-1])    # (H, W)
    cov = np.minimum(a_top[None, :, :], np.minimum(a_side_z[:, :, None], a_fb_z[:, None, :]))

    yy_grid = xx_grid = None
    if round_:
        for z in range(H):
            along = a_side_z[z] >= 0.5
            across = a_fb_z[z] >= 0.5
            if not (along.any() and across.any()):
                continue
            ys, xs = np.nonzero(along)[0], np.nonzero(across)[0]
            if not (along[ys[0] : ys[-1] + 1].all() and across[xs[0] : xs[-1] + 1].all()):
                continue  # gapped rows (legs, posts) stay non-elliptical
            if yy_grid is None:
                yy_grid, xx_grid = np.mgrid[0:L, 0:W].astype(np.float32)
            cy = 0.5 * (ys[0] + ys[-1])
            cx = 0.5 * (xs[0] + xs[-1])
            ry = 0.5 * (ys[-1] - ys[0]) + 0.5
            rx = 0.5 * (xs[-1] - xs[0]) + 0.5
            ny = (yy_grid - cy) / max(ry, 0.5)
            nx = (xx_grid - cx) / max(rx, 0.5)
            r_norm = np.sqrt(nx * nx + ny * ny)
            # Analytic gradient-normalized distance to the ellipse boundary (exact at boundary)
            grad = np.sqrt((nx / max(rx, 0.5)) ** 2 + (ny / max(ry, 0.5)) ** 2)
            d_ell = np.where(r_norm > 1e-6, (r_norm - 1.0) * r_norm / np.maximum(grad, 1e-6), -min(rx, ry))
            sdf[z] = np.maximum(sdf[z], d_ell)
            if hard_alpha:
                cov[z] = np.where(r_norm < 1.0, cov[z], 0.0)
            else:
                cov_ell = np.clip(0.5 - d_ell, 0.0, 1.0)
                cov[z] = np.minimum(cov[z], cov_ell)

    if smooth_sdf > 0.0:
        sdf = smooth_sdf_3d(sdf, strength=smooth_sdf)

    if hard_alpha:
        cov = np.where(cov >= 0.5, 1.0, 0.0).astype(np.float32)

    occ = cov >= 0.5 if hard_alpha else cov > 0.02

    # Multi-view surface coloring (vectorized top-down pass)
    vol = np.zeros((H, L, W, 4), dtype=np.uint8)
    covered = np.zeros((L, W), dtype=bool)
    ix = np.arange(W)[None, :].repeat(L, 0)
    iy = np.arange(L)[:, None].repeat(W, 1)
    top_rgb = top[..., :3]

    for z in range(H - 1, -1, -1):
        r = H - 1 - z
        above = covered.copy()
        o = occ[z]
        covered |= (cov[z] >= 0.5)
        if not o.any():
            continue
        d = np.stack(
            [
                ix - np.maximum.accumulate(np.where(~o, ix, -1), axis=1),
                np.minimum.accumulate(np.where(~o, ix, W)[:, ::-1], axis=1)[:, ::-1] - ix,
                iy - np.maximum.accumulate(np.where(~o, iy, -1), axis=0),
                np.minimum.accumulate(np.where(~o, iy, L)[::-1], axis=0)[::-1] - iy,
            ]
        )
        face, depth = d.argmin(0), d.min(0)
        pad_a = np.pad(above, 2)
        near_above = np.zeros_like(above)
        for dy in range(5):
            for dx in range(5):
                near_above |= pad_a[dy : dy + L, dx : dx + W]

        is_steep_step = (~above) & (depth <= 2) & near_above
        use_top = (~above) & (~is_steep_step)
        if z + 1 < H:
            use_above = above & (depth > 2) & (vol[z + 1, :, :, 3] >= 128)
        else:
            use_above = np.zeros((L, W), dtype=bool)

        side_row = _edge_row(side, r, L)
        back_row = _edge_row(back, r, W)
        front_row = _edge_row(front, r, W)

        edge_rgb = top_rgb.copy()
        if side_row is not None:
            m = face < 2
            edge_rgb[m] = np.broadcast_to(side_row[:, None, :], (L, W, 3))[m]
        if back_row is not None:
            m = face == 2
            edge_rgb[m] = np.broadcast_to(back_row[None, :, :], (L, W, 3))[m]
        if front_row is not None:
            m = face > 2
            edge_rgb[m] = np.broadcast_to(front_row[None, :, :], (L, W, 3))[m]

        slice_rgb = np.where(use_top[..., None], top_rgb, edge_rgb)
        if z + 1 < H:
            slice_rgb = np.where(use_above[..., None], vol[z + 1, :, :, :3], slice_rgb)

        if shade:
            shade_mask = (above | is_steep_step) & (depth <= 2) & o
            if shade_mask.any():
                factor = 1.0 - shade * (1.0 - z / max(H - 1, 1)) - shade * 0.4
                shaded = np.clip(slice_rgb[shade_mask].astype(float) * factor, 0, 255).astype(np.uint8)
                slice_rgb = slice_rgb.copy()
                slice_rgb[shade_mask] = shaded

        vol[z, o, :3] = slice_rgb[o]
        vol[z, o, 3] = np.clip(np.round(cov[z, o] * 255.0), 0, 255).astype(np.uint8)

    if bleed:
        vol = dilate_rgb_edges(vol, iterations=4)
    return vol, sdf


def pack_sdf_u8(sdf: np.ndarray, sdf_range: float = 6.0) -> np.ndarray:
    """Pack continuous float32 SDF (H, L, W) into an 8-bit grayscale strip (H, L, W) uint8.

    128 represents the zero iso-surface (0.0); values < 128 are inside, > 128 are outside.
    """
    norm = np.clip(sdf / sdf_range, -1.0, 1.0)
    return np.clip(np.round(norm * 127.0 + 128.0), 0, 255).astype(np.uint8)


def compute_normals_from_sdf(vol: np.ndarray, sdf: np.ndarray | None = None) -> np.ndarray:
    """Estimate smooth outward 3D unit normals via continuous SDF gradient (packed RGBA uint8)."""
    if sdf is None:
        # Derive continuous 3D SDF from slice occupancy when loading a legacy strip
        occ = (vol[..., 3].astype(np.float32) / 255.0)
        sdf = np.stack([alpha_to_sdf_2d(occ[z]) for z in range(vol.shape[0])], axis=0)
        sdf = smooth_sdf_3d(sdf, strength=0.3)

    p = np.pad(sdf.astype(np.float32), 1, mode="edge")
    # Out-of-bounds domain faces sit in exterior air: SDF grows by +1 voxel outward
    p[0, :, :] += 1.0
    p[-1, :, :] += 1.0
    p[:, 0, :] += 1.0
    p[:, -1, :] += 1.0
    p[:, :, 0] += 1.0
    p[:, :, -1] += 1.0
    # Outward normal points in the direction of increasing SDF (from negative inside to positive outside)
    nz = p[2:, 1:-1, 1:-1] - p[:-2, 1:-1, 1:-1]
    ny = p[1:-1, 2:, 1:-1] - p[1:-1, :-2, 1:-1]
    nx = p[1:-1, 1:-1, 2:] - p[1:-1, 1:-1, :-2]

    mag = np.sqrt(nx * nx + ny * ny + nz * nz)
    zero = mag < 1e-5
    nz = np.where(zero, 1.0, nz)
    mag = np.where(zero, 1.0, mag)
    nx /= mag
    ny /= mag
    nz /= mag

    out = np.zeros_like(vol)
    solid = vol[..., 3] > 0
    out[solid, 0] = np.clip(np.round((nx[solid] * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    out[solid, 1] = np.clip(np.round((ny[solid] * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    out[solid, 2] = np.clip(np.round((nz[solid] * 0.5 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    out[solid, 3] = vol[solid, 3]
    return out


def detect_emissive(vol: np.ndarray) -> np.ndarray:
    """Detect small bright/vivid surface accents (headlights, windows, neon) as RGBA emissive volume."""
    solid = vol[..., 3] >= 64
    out = np.zeros_like(vol)
    if not solid.any():
        return out

    p = np.pad(solid, 1, mode="constant", constant_values=False)
    surface = solid & ~(
        p[:-2, 1:-1, 1:-1] & p[2:, 1:-1, 1:-1]
        & p[1:-1, :-2, 1:-1] & p[1:-1, 2:, 1:-1]
        & p[1:-1, 1:-1, :-2] & p[1:-1, 1:-1, 2:]
    )
    surf_count = int(surface.sum())
    if surf_count == 0:
        return out

    rgb = vol[..., :3].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    sat = (max_c - min_c) / np.maximum(max_c, 1.0)

    cand = surface & (
        ((luma >= 180.0) & ((sat >= 0.30) | (luma >= 232.0)))
        | ((max_c >= 215.0) & (sat >= 0.62) & (luma >= 110.0))
    )
    if not cand.any():
        return out

    surf_rgb = vol[surface, :3]
    surf_keys = (
        (surf_rgb[:, 0].astype(np.uint32) << 16)
        | (surf_rgb[:, 1].astype(np.uint32) << 8)
        | surf_rgb[:, 2].astype(np.uint32)
    )
    uniq, counts = np.unique(surf_keys, return_counts=True)
    dominant = set(int(k) for k, c in zip(uniq, counts) if c / surf_count > 0.14)

    cz, cy, cx = np.nonzero(cand)
    cand_rgb = vol[cz, cy, cx, :3]
    cand_keys = (
        (cand_rgb[:, 0].astype(np.uint32) << 16)
        | (cand_rgb[:, 1].astype(np.uint32) << 8)
        | cand_rgb[:, 2].astype(np.uint32)
    )
    keep = np.array([int(k) not in dominant for k in cand_keys], dtype=bool)
    if keep.any():
        out[cz[keep], cy[keep], cx[keep]] = vol[cz[keep], cy[keep], cx[keep]]
    return out


def views_to_slices_aa(
    sheet: np.ndarray,
    *,
    slices: int | None = None,
    top_nose: str = "auto",
    side_nose: str = "left",
    order: str = "auto",
    colours: int = 0,
    shade: float = 0.15,
    dark_thresh: int = 70,
    bg_tol: int = 28,
    round_: bool = False,
    hard_alpha: bool = False,
    resample: str = "auto",
    bleed: bool = True,
    smooth_sdf: float = 0.15,
) -> tuple[np.ndarray, np.ndarray, list[np.ndarray]]:
    """Full AA pipeline: clean background -> find views -> fit -> carve -> 3D SDF."""
    clean = remove_background(sheet, tol=bg_tol, hard_alpha=hard_alpha)
    raw_views = find_views(clean, order=order)
    top, side, front, back = raw_views

    side_aligned = side[:, ::-1] if side_nose == "left" else side
    back_aligned = back[:, ::-1]

    # Collapse integer block-upscaled pixel-art views to native resolution and strip dark
    # outer outlines BEFORE anti-aliased resampling so outline pigment never bleeds inward!
    def _collapse_and_prestrip(v: np.ndarray) -> np.ndarray:
        g = detect_pixel_grid_scale(v)
        if g > 1:
            v_nat = v[g // 2 :: g, g // 2 :: g].copy()
            return strip_outline(v_nat, dark=dark_thresh)
        return v

    top_c = _collapse_and_prestrip(top)
    side_c = _collapse_and_prestrip(side_aligned)
    front_c = _collapse_and_prestrip(front)
    back_c = _collapse_and_prestrip(back_aligned)
    prestripped = any(detect_pixel_grid_scale(v) > 1 for v in (top, side_aligned, front, back_aligned))

    raw_h = side_c.shape[0]
    if slices is None:
        target_h = 36 if raw_h > 64 else raw_h
    elif slices == 0:
        target_h = raw_h
    else:
        target_h = slices

    if target_h != raw_h:
        L = max(4, round(target_h * side_c.shape[1] / side_c.shape[0]))
        W = max(4, round(L * top_c.shape[1] / top_c.shape[0]))
        H = target_h
        top = fit_aa(top_c, W, L, resample=resample)
        side_aligned = fit_aa(side_c, L, H, resample=resample)
        front = fit_aa(front_c, W, H, resample=resample)
        back_aligned = fit_aa(back_c, W, H, resample=resample)
    else:
        L, W = top_c.shape[:2]
        H = max(2, round(side_c.shape[0] * L / side_c.shape[1]))
        top = top_c
        side_aligned = fit_aa(side_c, L, H, resample=resample)
        front = fit_aa(front_c, W, H, resample=resample)
        back_aligned = fit_aa(back_c, W, H, resample=resample)

    if not prestripped:
        cleaned = [strip_outline(v, dark=dark_thresh) for v in (top, side_aligned, front, back_aligned)]
    else:
        cleaned = [top, side_aligned, front, back_aligned]
    top, side_aligned, front, back_aligned = one_palette_oklab(cleaned, colours)

    if top_nose == "auto":
        top_nose = match_top(top, side_aligned)
    if top_nose == "up":
        top = top[::-1]

    vol, sdf = carve_aa(
        top, side_aligned, front, back_aligned,
        shade=shade,
        round_=round_,
        hard_alpha=hard_alpha,
        bleed=bleed,
        smooth_sdf=smooth_sdf,
    )
    display_views = [
        top,
        side_aligned[:, ::-1] if side_nose == "left" else side_aligned,
        front,
        back_aligned[:, ::-1],
    ]
    return vol, sdf, display_views


# ============================================================
# STAGE 4: RENDERERS (Legacy 1x Nearest vs AA RGSS Voxel DDA vs AA Smooth SDF)
# ============================================================

# Stratified Rotated Grid Supersampling (RGSS) sub-pixel offsets in [-0.5, 0.5]
RGSS_OFFSETS: dict[int, list[tuple[float, float]]] = {
    1: [(0.0, 0.0)],
    4: [(-0.375, -0.125), (0.125, -0.375), (0.375, 0.125), (-0.125, 0.375)],
    8: [
        (1 / 16, -3 / 16), (-1 / 16, 3 / 16), (5 / 16, 1 / 16), (-3 / 16, -5 / 16),
        (-5 / 16, 5 / 16), (-7 / 16, -1 / 16), (3 / 16, 7 / 16), (7 / 16, -7 / 16),
    ],
    16: [
        ((-0.5 + (i + 0.5) / 4.0) * 0.92 + ((j - 1.5) * 0.055),
         (-0.5 + (j + 0.5) / 4.0) * 0.92 - ((i - 1.5) * 0.055))
        for j in range(4) for i in range(4)
    ],
}


def _compute_canvas_metrics(n: int, h: int, w: int, squash: float, spacing: float) -> tuple[int, int, float, float]:
    """Symmetric art-pixel canvas dimensions & center."""
    diag = int(math.ceil(math.hypot(w, h))) + 8
    lift_max = int(math.ceil(n * spacing))
    cw = diag + 14
    ch = int(math.ceil(diag * squash)) + lift_max + 18
    cx = cw * 0.5
    base_y = ch - diag * squash * 0.5 - 7.0
    return cw, ch, cx, base_y


def render_stack_legacy(
    vol: np.ndarray,
    angle_deg: float,
    *,
    squash: float = 0.75,
    spacing: float = 1.0,
    scale: int = 4,
    shadow: bool = True,
    outline: bool = True,
) -> Image.Image:
    """Faithful baseline replica of legacy 1x nearest-neighbor sprite stacking (for A/B comparison)."""
    n, h, w = vol.shape[:3]
    cw, ch, cx_f, base_y_f = _compute_canvas_metrics(n, h, w, squash, spacing)
    cx = int(cx_f)
    base_y = int(base_y_f)

    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)

    canvas = np.zeros((ch, cw, 4), dtype=np.uint8)
    yy, xx = np.mgrid[0:ch, 0:cw]
    dx = xx - cx

    if shadow:
        footprint = (vol[..., 3] >= 128).any(axis=0)
        dy_s = (yy - (base_y + 3)) / squash
        dx_s = xx - (cx + 2)
        sx = np.floor(dx_s * ca + dy_s * sa + w / 2.0).astype(np.int32)
        sy = np.floor(-dx_s * sa + dy_s * ca + h / 2.0).astype(np.int32)
        valid = (sx >= 0) & (sx < w) & (sy >= 0) & (sy < h)
        vy, vx = np.nonzero(valid)
        hit = footprint[sy[vy, vx], sx[vy, vx]]
        canvas[vy[hit], vx[hit]] = (186, 198, 212, 255)

    body = np.zeros((ch, cw, 4), dtype=np.uint8)
    for z in range(n):
        lift_y = round(z * spacing)
        dy = (yy - (base_y - lift_y)) / squash
        sx = np.floor(dx * ca + dy * sa + w / 2.0).astype(np.int32)
        sy = np.floor(-dx * sa + dy * ca + h / 2.0).astype(np.int32)
        valid = (sx >= 0) & (sx < w) & (sy >= 0) & (sy < h)
        vy, vx = np.nonzero(valid)
        px = vol[z, sy[vy, vx], sx[vy, vx]]
        opaque = px[:, 3] >= 128
        body[vy[opaque], vx[opaque]] = px[opaque]

    if outline:
        alpha = body[..., 3] >= 128
        pad = np.pad(alpha, 1)
        ring = ~alpha & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
        canvas[ring] = (24, 28, 36, 255)

    solid = body[..., 3] >= 128
    canvas[solid] = body[solid]
    img = Image.fromarray(canvas)
    if scale > 1:
        img = img.resize((cw * scale, ch * scale), Image.NEAREST)
    return img


def _apply_sdf_outline_and_composite(
    body_lin: np.ndarray,
    body_alpha: np.ndarray,
    shadow_alpha: np.ndarray | None,
    *,
    outline_px: float = 0.0,
    outline_color: tuple[int, int, int] = (24, 28, 36),
    shadow_color: tuple[int, int, int] = (150, 166, 188),
    shadow_opacity: float = 0.52,
) -> np.ndarray:
    """Composite shadow -> exact 2D SDF anti-aliased outline -> premultiplied linear sprite body."""
    H, W = body_alpha.shape
    out_premul = np.zeros((H, W, 3), dtype=np.float32)
    out_a = np.zeros((H, W), dtype=np.float32)

    # 1. Anti-aliased ground shadow
    if shadow_alpha is not None and shadow_opacity > 0:
        sa = np.clip(shadow_alpha * shadow_opacity, 0.0, 1.0)
        sh_lin = srgb_to_linear(np.array(shadow_color, dtype=np.float32) / 255.0)
        out_premul = sh_lin[None, None, :] * sa[..., None]
        out_a = sa

    # 2. Exact 2D Euclidean SDF anti-aliased silhouette outline (uniform circular thickness!)
    if outline_px > 0.05 and (body_alpha > 0.05).any():
        rad_i = int(math.ceil(outline_px)) + 3
        sdf_2d = alpha_to_sdf_2d(body_alpha, max_radius=rad_i)
        aa_w = 0.75
        # Smoothstep(outline_px + aa_w, outline_px - aa_w, sdf_2d)
        t = np.clip((outline_px + aa_w - sdf_2d) / (2.0 * aa_w), 0.0, 1.0)
        ol_a = t * t * (3.0 - 2.0 * t)
        ol_lin = srgb_to_linear(np.array(outline_color, dtype=np.float32) / 255.0)
        # Porter-Duff Over: outline over shadow
        out_premul = ol_lin[None, None, :] * ol_a[..., None] + out_premul * (1.0 - ol_a[..., None])
        out_a = ol_a + out_a * (1.0 - ol_a)

    # 3. Porter-Duff Over: premultiplied linear sprite body over (outline + shadow)
    out_premul = body_lin + out_premul * (1.0 - body_alpha[..., None])
    out_a = body_alpha + out_a * (1.0 - body_alpha)

    safe_a = np.where(out_a > 1e-5, out_a, 1.0)
    rgb_srgb = linear_to_srgb(np.clip(out_premul / safe_a[..., None], 0.0, 1.0))

    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(np.round(rgb_srgb * 255.0), 0, 255).astype(np.uint8)
    rgba[..., 3] = np.clip(np.round(np.clip(out_a, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8)
    return rgba


def _ray_dda_batch(
    occ: np.ndarray,
    p0x: np.ndarray,
    p0y: np.ndarray,
    p0z: np.ndarray,
    dx: float,
    dy: float,
    dz: float,
    slab_thick: float = 1.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Vectorized 3D Amanatides-Woo DDA raycaster against occupancy grid `occ` (H, L, W).

    Returns (hit_mask, hit_z, hit_y, hit_x, hit_face) where hit_face is:
      0 = +Z top, 1 = -Z bottom, 2 = +X, 3 = -X, 4 = +Y, 5 = -Y.
    """
    H, L, W = occ.shape
    N = p0x.shape[0]
    eps = 1e-7

    inv_x = (1.0 / dx) if abs(dx) > eps else 1e30
    inv_y = (1.0 / dy) if abs(dy) > eps else 1e30
    inv_z = (1.0 / dz) if abs(dz) > eps else 1e30

    # Ray-AABB intersection with [0, W] x [0, L] x [0, H]
    tx0 = (0.0 - p0x) * inv_x
    tx1 = (W - p0x) * inv_x
    ty0 = (0.0 - p0y) * inv_y
    ty1 = (L - p0y) * inv_y
    tz0 = (0.0 - p0z) * inv_z
    tz1 = (H - p0z) * inv_z

    tmin_x, tmax_x = np.minimum(tx0, tx1), np.maximum(tx0, tx1)
    tmin_y, tmax_y = np.minimum(ty0, ty1), np.maximum(ty0, ty1)
    tmin_z, tmax_z = np.minimum(tz0, tz1), np.maximum(tz0, tz1)

    t_enter = np.maximum(np.maximum(tmin_x, tmin_y), np.maximum(tmin_z, 0.0))
    t_exit = np.minimum(np.minimum(tmax_x, tmax_y), tmax_z)

    active = np.nonzero(t_exit > t_enter + 1e-5)[0]
    hit_mask = np.zeros(N, dtype=bool)
    hit_z = np.zeros(N, dtype=np.int32)
    hit_y = np.zeros(N, dtype=np.int32)
    hit_x = np.zeros(N, dtype=np.int32)
    hit_face = np.zeros(N, dtype=np.int8)

    if active.size == 0:
        return hit_mask, hit_z, hit_y, hit_x, hit_face

    te = t_enter[active] + 1e-4
    px = p0x[active] + te * dx
    py = p0y[active] + te * dy
    pz = p0z[active] + te * dz

    ix = np.clip(np.floor(px).astype(np.int32), 0, W - 1)
    iy = np.clip(np.floor(py).astype(np.int32), 0, L - 1)
    iz = np.clip(np.floor(pz).astype(np.int32), 0, H - 1)

    step_x = 1 if dx > eps else (-1 if dx < -eps else 0)
    step_y = 1 if dy > eps else (-1 if dy < -eps else 0)
    step_z = 1 if dz > eps else (-1 if dz < -eps else 0)

    tdx = abs(inv_x) if step_x != 0 else 1e30
    tdy = abs(inv_y) if step_y != 0 else 1e30
    tdz = abs(inv_z) if step_z != 0 else 1e30

    next_x = (ix + (1 if step_x > 0 else 0)).astype(np.float32)
    next_y = (iy + (1 if step_y > 0 else 0)).astype(np.float32)
    next_z = (iz + (1 if step_z > 0 else 0)).astype(np.float32)

    tmx = (next_x - px) * inv_x if step_x != 0 else np.full_like(px, 1e30)
    tmy = (next_y - py) * inv_y if step_y != 0 else np.full_like(py, 1e30)
    tmz = (next_z - pz) * inv_z if step_z != 0 else np.full_like(pz, 1e30)

    # Determine initial entry face
    ex = tmin_x[active]
    ey = tmin_y[active]
    ez = tmin_z[active]
    face = np.zeros(active.size, dtype=np.int8)
    face_x_id = 3 if dx > 0 else 2
    face_y_id = 5 if dy > 0 else 4
    face_z_id = 1 if dz > 0 else 0
    face[:] = face_z_id
    m_x = (ex >= ey) & (ex >= ez)
    m_y = (ey > ex) & (ey >= ez)
    face[m_x] = face_x_id
    face[m_y] = face_y_id

    max_steps = W + L + H + 2
    t_cur = np.zeros_like(px)

    for _ in range(max_steps):
        if active.size == 0:
            break
        # Check current voxel occupancy
        solid = occ[iz, iy, ix]
        if slab_thick < 0.999 and solid.any():
            # In exploded mode, check whether ray actually passes through the slice slab [iz, iz+slab_thick]
            z_at_enter = pz + t_cur * dz
            t_next = np.minimum(np.minimum(tmx, tmy), tmz)
            z_at_leave = pz + t_next * dz
            z_lo = np.minimum(z_at_enter, z_at_leave) - iz
            z_hi = np.maximum(z_at_enter, z_at_leave) - iz
            solid = solid & (z_lo <= slab_thick) & (z_hi >= 0.0)

        if solid.any():
            hit_idx = active[solid]
            hit_mask[hit_idx] = True
            hit_z[hit_idx] = iz[solid]
            hit_y[hit_idx] = iy[solid]
            hit_x[hit_idx] = ix[solid]
            hit_face[hit_idx] = face[solid]

            keep = ~solid
            if not keep.any():
                break
            active = active[keep]
            ix, iy, iz = ix[keep], iy[keep], iz[keep]
            tmx, tmy, tmz = tmx[keep], tmy[keep], tmz[keep]
            face = face[keep]
            if slab_thick < 0.999:
                pz = pz[keep]
                t_cur = t_cur[keep]

        # Advance DDA to next voxel boundary
        go_x = (tmx <= tmy) & (tmx <= tmz)
        go_y = (~go_x) & (tmy <= tmz)
        go_z = (~go_x) & (~go_y)

        if slab_thick < 0.999:
            t_cur = np.where(go_x, tmx, np.where(go_y, tmy, tmz))

        if step_x != 0:
            ix[go_x] += step_x
            tmx[go_x] += tdx
            face[go_x] = face_x_id
        if step_y != 0:
            iy[go_y] += step_y
            tmy[go_y] += tdy
            face[go_y] = face_y_id
        if step_z != 0:
            iz[go_z] += step_z
            tmz[go_z] += tdz
            face[go_z] = face_z_id

        in_bounds = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < L) & (iz >= 0) & (iz < H)
        if not in_bounds.all():
            active = active[in_bounds]
            ix, iy, iz = ix[in_bounds], iy[in_bounds], iz[in_bounds]
            tmx, tmy, tmz = tmx[in_bounds], tmy[in_bounds], tmz[in_bounds]
            face = face[in_bounds]
            if slab_thick < 0.999:
                pz = pz[in_bounds]
                t_cur = t_cur[in_bounds]

    return hit_mask, hit_z, hit_y, hit_x, hit_face


def render_stack_aa_voxel(
    vol: np.ndarray,
    angle_deg: float,
    *,
    sdf: np.ndarray | None = None,
    squash: float = 0.75,
    spacing: float = 1.0,
    scale: int = 4,
    samples: int = 4,
    shadow: bool = True,
    outline: bool = True,
    outline_width: float = 0.85,
    lighting: bool = True,
    sun_angle_deg: float = 42.0,
    sun_elev_deg: float = 52.0,
    slab_thick: float = 1.0,
    normal_smooth: float = 0.45,
) -> Image.Image:
    """Render an anti-aliased crisp pixel-art sprite stack via RGSS Orthographic 3D Voxel DDA.

    - Preserves crisp voxel/texel readability with ZERO rotation crawl, ZERO 1px post blinking,
      ZERO slice gaps, ZERO correlated-coverage alpha buildup, and exact 2D SDF AA outlines!
    - Uses symmetric (W*0.5, L*0.5) voxel coordinates and linear-light premultiplied compositing.
    """
    H, L, W = vol.shape[:3]
    cw_art, ch_art, cx_art, base_y_art = _compute_canvas_metrics(H, L, W, squash, spacing)
    out_w = cw_art * scale
    out_h = ch_art * scale

    occ = vol[..., 3] >= 128
    lin_vol = srgb_to_linear(vol[..., :3].astype(np.float32) / 255.0)

    # Smooth normals from 3D SDF (blended with exact DDA face normals)
    normals_u8 = compute_normals_from_sdf(vol, sdf)
    smooth_n = normals_u8[..., :3].astype(np.float32) / 127.5 - 1.0

    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)

    # Orthographic sprite-stacking ray direction (camera -> volume)
    dx = -spacing * sa
    dy = -spacing * ca
    dz = -squash

    # Sun direction rotated into object-local coordinates
    sun_az = math.radians(sun_angle_deg)
    sun_el = math.radians(sun_elev_deg)
    w_lx = math.cos(sun_az) * math.cos(sun_el)
    w_ly = math.sin(sun_az) * math.cos(sun_el)
    w_lz = math.sin(sun_el)
    obj_lx = w_lx * ca + w_ly * sa
    obj_ly = -w_lx * sa + w_ly * ca
    obj_lz = w_lz

    face_normals = np.array(
        [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]],
        dtype=np.float32,
    )

    offsets = RGSS_OFFSETS.get(samples, RGSS_OFFSETS[4])
    k = len(offsets)

    yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
    inv_scale = 1.0 / float(scale)
    inv_sq = 1.0 / max(squash, 0.1)

    acc_rgb = np.zeros((out_h, out_w, 3), dtype=np.float32)
    acc_alpha = np.zeros((out_h, out_w), dtype=np.float32)
    acc_shadow = np.zeros((out_h, out_w), dtype=np.float32) if shadow else None

    for ox, oy in offsets:
        ax = ((xx + 0.5 + ox) * inv_scale) - cx_art
        ay = ((yy + 0.5 + oy) * inv_scale) - base_y_art

        v0 = (ay + H * spacing) * inv_sq
        p0x = (W * 0.5 + ax * ca + v0 * sa).ravel()
        p0y = (L * 0.5 - ax * sa + v0 * ca).ravel()
        p0z = np.full_like(p0x, float(H))

        hit, hz, hy, hx, hface = _ray_dda_batch(occ, p0x, p0y, p0z, dx, dy, dz, slab_thick=slab_thick)

        if hit.any():
            rgb_h = lin_vol[hz[hit], hy[hit], hx[hit]]
            if lighting:
                fn = face_normals[hface[hit]]
                sn = smooth_n[hz[hit], hy[hit], hx[hit]]
                nrm = fn * (1.0 - normal_smooth) + sn * normal_smooth
                n_len = np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-5)
                nrm /= n_len
                ndotl = nrm[:, 0] * obj_lx + nrm[:, 1] * obj_ly + nrm[:, 2] * obj_lz

                # Smooth hue-shifted 3-band lighting (no hard popping thresholds!)
                t_lit = np.clip((ndotl - 0.18) / 0.36, 0.0, 1.0)
                t_lit = t_lit * t_lit * (3.0 - 2.0 * t_lit)
                t_sh = np.clip((ndotl + 0.32) / 0.36, 0.0, 1.0)
                t_sh = t_sh * t_sh * (3.0 - 2.0 * t_sh)

                sh_col = np.array([0.58, 0.65, 0.80], dtype=np.float32)
                mid_col = np.array([0.96, 0.97, 1.00], dtype=np.float32)
                lit_col = np.array([1.15, 1.12, 1.04], dtype=np.float32)

                tint = sh_col * (1.0 - t_sh[:, None]) + mid_col * t_sh[:, None]
                tint = tint * (1.0 - t_lit[:, None]) + lit_col * t_lit[:, None]
                # Subtle height AO
                h_ao = 0.88 + 0.12 * (hz[hit].astype(np.float32) / max(H - 1, 1))
                rgb_h = rgb_h * tint * h_ao[:, None]

            acc_rgb.reshape(-1, 3)[hit] += rgb_h
            acc_alpha.ravel()[hit] += 1.0

        if shadow and acc_shadow is not None:
            # Ground plane intersection at z = 0, cast 3D shadow ray toward sun!
            gx = (W * 0.5 + ax * ca + (ay * inv_sq) * sa).ravel()
            gy = (L * 0.5 - ax * sa + (ay * inv_sq) * ca).ravel()
            gz = np.full_like(gx, 0.02)
            # Only trace shadow rays on pixels not hit by body (or all for clean ground pass)
            sh_hit, _, _, _, _ = _ray_dda_batch(occ, gx, gy, gz, obj_lx, obj_ly, obj_lz, slab_thick=1.0)
            acc_shadow.ravel()[sh_hit] += 1.0

    acc_rgb /= float(k)
    acc_alpha /= float(k)
    if acc_shadow is not None:
        acc_shadow /= float(k)

    rgba = _apply_sdf_outline_and_composite(
        acc_rgb,
        acc_alpha,
        acc_shadow,
        outline_px=(outline_width * scale) if outline else 0.0,
    )
    return Image.fromarray(rgba)


def _sample_trilinear_f32(vol: np.ndarray, z: np.ndarray, y: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Trilinear interpolation of a 3D float32 grid (H, L, W) at voxel coordinates (z, y, x)."""
    H, L, W = vol.shape
    zc = np.clip(z - 0.5, 0.0, H - 1.0001)
    yc = np.clip(y - 0.5, 0.0, L - 1.0001)
    xc = np.clip(x - 0.5, 0.0, W - 1.0001)

    z0 = np.floor(zc).astype(np.int32)
    y0 = np.floor(yc).astype(np.int32)
    x0 = np.floor(xc).astype(np.int32)
    z1 = np.minimum(z0 + 1, H - 1)
    y1 = np.minimum(y0 + 1, L - 1)
    x1 = np.minimum(x0 + 1, W - 1)

    fz = zc - z0
    fy = yc - y0
    fx = xc - x0

    c000 = vol[z0, y0, x0]
    c001 = vol[z0, y0, x1]
    c010 = vol[z0, y1, x0]
    c011 = vol[z0, y1, x1]
    c100 = vol[z1, y0, x0]
    c101 = vol[z1, y0, x1]
    c110 = vol[z1, y1, x0]
    c111 = vol[z1, y1, x1]

    c00 = c000 * (1.0 - fx) + c001 * fx
    c01 = c010 * (1.0 - fx) + c011 * fx
    c10 = c100 * (1.0 - fx) + c101 * fx
    c11 = c110 * (1.0 - fx) + c111 * fx

    c0 = c00 * (1.0 - fy) + c01 * fy
    c1 = c10 * (1.0 - fy) + c11 * fy
    return c0 * (1.0 - fz) + c1 * fz


def _sample_trilinear_rgb(vol_lin: np.ndarray, z: np.ndarray, y: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Trilinear interpolation of edge-dilated linear RGB volume (H, L, W, 3)."""
    return np.stack(
        [
            _sample_trilinear_f32(vol_lin[..., 0], z, y, x),
            _sample_trilinear_f32(vol_lin[..., 1], z, y, x),
            _sample_trilinear_f32(vol_lin[..., 2], z, y, x),
        ],
        axis=-1,
    )


def render_stack_aa_sdf(
    vol: np.ndarray,
    sdf: np.ndarray,
    angle_deg: float,
    *,
    squash: float = 0.75,
    spacing: float = 1.0,
    scale: int = 4,
    samples: int = 4,
    shadow: bool = True,
    outline: bool = True,
    outline_width: float = 0.85,
    lighting: bool = True,
    sun_angle_deg: float = 42.0,
    sun_elev_deg: float = 52.0,
) -> Image.Image:
    """Render a continuous, stair-step-free 3D Visual-Hull SDF sprite via RGSS Sphere Tracing."""
    H, L, W = vol.shape[:3]
    cw_art, ch_art, cx_art, base_y_art = _compute_canvas_metrics(H, L, W, squash, spacing)
    out_w = cw_art * scale
    out_h = ch_art * scale

    # Ensure volume has edge-dilated RGB for clean trilinear surface color lookups
    vol_bleed = dilate_rgb_edges(vol, iterations=3)
    lin_vol = srgb_to_linear(vol_bleed[..., :3].astype(np.float32) / 255.0)
    sdf_f = sdf.astype(np.float32)
    occ = vol[..., 3] >= 128

    rad = math.radians(angle_deg)
    ca, sa = math.cos(rad), math.sin(rad)

    d_raw = np.array([-spacing * sa, -spacing * ca, -squash], dtype=np.float32)
    d_len = float(np.linalg.norm(d_raw))
    dx, dy, dz = float(d_raw[0] / d_len), float(d_raw[1] / d_len), float(d_raw[2] / d_len)

    sun_az = math.radians(sun_angle_deg)
    sun_el = math.radians(sun_elev_deg)
    w_lx = math.cos(sun_az) * math.cos(sun_el)
    w_ly = math.sin(sun_az) * math.cos(sun_el)
    w_lz = math.sin(sun_el)
    obj_lx = w_lx * ca + w_ly * sa
    obj_ly = -w_lx * sa + w_ly * ca
    obj_lz = w_lz

    offsets = RGSS_OFFSETS.get(samples, RGSS_OFFSETS[4])
    k = len(offsets)

    yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
    inv_scale = 1.0 / float(scale)
    inv_sq = 1.0 / max(squash, 0.1)

    acc_rgb = np.zeros((out_h, out_w, 3), dtype=np.float32)
    acc_alpha = np.zeros((out_h, out_w), dtype=np.float32)
    acc_shadow = np.zeros((out_h, out_w), dtype=np.float32) if shadow else None

    eps = 1e-7
    inv_x = (1.0 / dx) if abs(dx) > eps else 1e30
    inv_y = (1.0 / dy) if abs(dy) > eps else 1e30
    inv_z = (1.0 / dz) if abs(dz) > eps else 1e30

    for ox, oy in offsets:
        ax = ((xx + 0.5 + ox) * inv_scale) - cx_art
        ay = ((yy + 0.5 + oy) * inv_scale) - base_y_art

        v0 = (ay + H * spacing) * inv_sq
        p0x = (W * 0.5 + ax * ca + v0 * sa).ravel()
        p0y = (L * 0.5 - ax * sa + v0 * ca).ravel()
        p0z = np.full_like(p0x, float(H))

        # Intersect padded AABB [-0.5, W+0.5] x [-0.5, L+0.5] x [-0.5, H+0.5]
        tx0, tx1 = (-0.5 - p0x) * inv_x, (W + 0.5 - p0x) * inv_x
        ty0, ty1 = (-0.5 - p0y) * inv_y, (L + 0.5 - p0y) * inv_y
        tz0, tz1 = (-0.5 - p0z) * inv_z, (H + 0.5 - p0z) * inv_z
        t_enter = np.maximum(np.maximum(np.minimum(tx0, tx1), np.minimum(ty0, ty1)), np.maximum(np.minimum(tz0, tz1), 0.0))
        t_exit = np.minimum(np.minimum(np.maximum(tx0, tx1), np.maximum(ty0, ty1)), np.maximum(tz0, tz1))

        active = np.nonzero(t_exit > t_enter + 1e-4)[0]
        if active.size > 0:
            t = t_enter[active].copy()
            t_max = t_exit[active]
            hit_idx_list = []
            hit_pos_list = []

            # Sphere-trace with conservative step factor (0.75) for smoothed 3D visual-hull SDF
            for _ in range(72):
                if active.size == 0:
                    break
                px = p0x[active] + t * dx
                py = p0y[active] + t * dy
                pz = p0z[active] + t * dz
                # Add box SDF clamp outside [0, W] x [0, L] x [0, H]
                bx = np.maximum(0.0 - px, px - W)
                by = np.maximum(0.0 - py, py - L)
                bz = np.maximum(0.0 - pz, pz - H)
                d_box = np.maximum(np.maximum(bx, by), bz)
                d_val = np.maximum(_sample_trilinear_f32(sdf_f, pz, py, px), d_box)

                hit_now = d_val <= 0.02
                if hit_now.any():
                    # Refine zero crossing slightly backward if overshot
                    t_ref = np.maximum(t_enter[active[hit_now]], t[hit_now] + d_val[hit_now] * 0.5)
                    h_act = active[hit_now]
                    hit_idx_list.append(h_act)
                    hit_pos_list.append((
                        p0x[h_act] + t_ref * dx,
                        p0y[h_act] + t_ref * dy,
                        p0z[h_act] + t_ref * dz,
                    ))

                still = (~hit_now) & (t < t_max)
                if not still.any():
                    break
                active = active[still]
                t = t[still] + np.maximum(d_val[still] * 0.72, 0.12)
                t_max = t_max[still]

            if hit_idx_list:
                h_idx = np.concatenate(hit_idx_list)
                hx = np.concatenate([p[0] for p in hit_pos_list])
                hy = np.concatenate([p[1] for p in hit_pos_list])
                hz = np.concatenate([p[2] for p in hit_pos_list])

                rgb_h = _sample_trilinear_rgb(lin_vol, hz, hy, hx)
                if lighting:
                    e = 0.35
                    gx = _sample_trilinear_f32(sdf_f, hz, hy, hx + e) - _sample_trilinear_f32(sdf_f, hz, hy, hx - e)
                    gy = _sample_trilinear_f32(sdf_f, hz, hy + e, hx) - _sample_trilinear_f32(sdf_f, hz, hy - e, hx)
                    gz = _sample_trilinear_f32(sdf_f, hz + e, hy, hx) - _sample_trilinear_f32(sdf_f, hz - e, hy, hx)
                    # Add boundary box normal contribution at domain caps (ground/roof)
                    gz = np.where(hz > H - 0.25, np.maximum(gz, 0.8), gz)
                    nrm = np.stack([gx, gy, gz], axis=-1)
                    nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-5)

                    ndotl = nrm[:, 0] * obj_lx + nrm[:, 1] * obj_ly + nrm[:, 2] * obj_lz
                    diff = np.clip(ndotl * 0.5 + 0.5, 0.0, 1.0)
                    # Smooth stylized hemisphere + sun lighting with subtle rim highlight
                    sh_col = np.array([0.56, 0.64, 0.80], dtype=np.float32)
                    lit_col = np.array([1.16, 1.13, 1.05], dtype=np.float32)
                    tint = sh_col * (1.0 - diff[:, None]) + lit_col * diff[:, None]
                    h_ao = 0.88 + 0.12 * np.clip(hz / max(H, 1), 0.0, 1.0)
                    rgb_h = rgb_h * tint * h_ao[:, None]

                acc_rgb.reshape(-1, 3)[h_idx] += rgb_h
                acc_alpha.ravel()[h_idx] += 1.0

        if shadow and acc_shadow is not None:
            gx = (W * 0.5 + ax * ca + (ay * inv_sq) * sa).ravel()
            gy = (L * 0.5 - ax * sa + (ay * inv_sq) * ca).ravel()
            gz = np.full_like(gx, 0.02)
            sh_hit, _, _, _, _ = _ray_dda_batch(occ, gx, gy, gz, obj_lx, obj_ly, obj_lz, slab_thick=1.0)
            acc_shadow.ravel()[sh_hit] += 1.0

    acc_rgb /= float(k)
    acc_alpha /= float(k)
    if acc_shadow is not None:
        acc_shadow /= float(k)

    rgba = _apply_sdf_outline_and_composite(
        acc_rgb,
        acc_alpha,
        acc_shadow,
        outline_px=(outline_width * scale) if outline else 0.0,
    )
    return Image.fromarray(rgba)


# ============================================================
# PREVIEW SHEET, 16-DIR AA EXPORT & STANDALONE VIEWER PACKAGING
# ============================================================

def build_comparison_preview(
    vol: np.ndarray,
    sdf: np.ndarray,
    views: list[np.ndarray],
    out_path: Path,
    *,
    scale: int = 4,
    samples: int = 4,
) -> None:
    """Save a high-clarity comparison sheet:
    Row 1: Extracted 4 orthographic views
    Row 2: Legacy 1x Nearest vs AA Crisp Voxel (RGSS DDA) vs AA Smooth SDF Hull + Exploded
    """
    ang = 35.0
    renders = [
        ("Legacy 1x Nearest (35°)", render_stack_legacy(vol, ang, scale=scale)),
        (f"AA Crisp Voxel ({samples}x RGSS)", render_stack_aa_voxel(vol, ang, sdf=sdf, scale=scale, samples=samples)),
        (f"AA Smooth SDF ({samples}x RGSS)", render_stack_aa_sdf(vol, sdf, ang, scale=scale, samples=samples)),
        ("AA Crisp Voxel (145°)", render_stack_aa_voxel(vol, 145.0, sdf=sdf, scale=scale, samples=samples)),
        ("AA Exploded", render_stack_aa_voxel(vol, ang, sdf=sdf, spacing=2.1, slab_thick=0.45, scale=scale, samples=samples)),
    ]

    pad = 18
    cell_w = max(im.width for _, im in renders) + pad
    cell_h = max(im.height for _, im in renders) + pad + 24

    view_scale = max(2, min(6, round(130 / max(views[0].shape[0], views[0].shape[1], 1))))
    top_row_h = max(v.shape[0] for v in views) * view_scale + 42
    total_w = max(cell_w * len(renders) + pad, sum(v.shape[1] * view_scale + pad * 2 for v in views))
    total_h = top_row_h + cell_h + pad * 2

    bg = Image.new("RGBA", (total_w, total_h), (242, 245, 249, 255))
    draw = ImageDraw.Draw(bg)

    x = pad
    for label, v in zip(("TOP", "SIDE", "FRONT", "BACK"), views):
        im = Image.fromarray(v).resize((v.shape[1] * view_scale, v.shape[0] * view_scale), Image.NEAREST)
        bg.paste(im, (x, pad + 20), im)
        draw.text((x, pad), f"{label} ({v.shape[1]}x{v.shape[0]})", fill=(55, 65, 81, 255))
        x += im.width + pad * 2

    y0 = top_row_h + pad
    for i, (label, im) in enumerate(renders):
        cx = pad + i * cell_w + (cell_w - im.width) // 2
        cy = y0 + 22 + (cell_h - 24 - im.height) // 2
        bg.paste(im, (cx, cy), im)
        draw.text((pad + i * cell_w + 4, y0), label, fill=(30, 41, 59, 255))

    bg.convert("RGB").save(out_path)


def export_aa_turntable_sheet(
    vol: np.ndarray,
    sdf: np.ndarray,
    out_path: Path,
    *,
    dirs: int = 16,
    mode: str = "voxel",
    scale: int = 2,
    samples: int = 8,
    squash: float = 0.75,
    spacing: float = 1.0,
) -> tuple[int, int]:
    """Export an anti-aliased N-direction baked PNG sprite sheet (horizontal strip)."""
    frames = []
    for i in range(dirs):
        ang = (i * 360.0) / dirs
        if mode == "sdf":
            im = render_stack_aa_sdf(vol, sdf, ang, squash=squash, spacing=spacing, scale=scale, samples=samples)
        else:
            im = render_stack_aa_voxel(vol, ang, sdf=sdf, squash=squash, spacing=spacing, scale=scale, samples=samples)
        frames.append(im)
    fw, fh = frames[0].size
    sheet = Image.new("RGBA", (fw * dirs, fh), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im, (i * fw, 0))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    return fw, fh


def to_data_uri(arr: np.ndarray) -> str:
    buf = io.BytesIO()
    if arr.ndim == 2:
        Image.fromarray(arr, mode="L").save(buf, format="PNG")
    else:
        Image.fromarray(arr).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def build_html_viewer(
    vol: np.ndarray,
    sdf: np.ndarray,
    views: list[np.ndarray],
    out_path: Path,
    title: str,
) -> None:
    """Write a standalone WebGL2 + Canvas2D AA viewer with embedded albedo, SDF, and views."""
    template_path = Path(__file__).with_name("viewer.html")
    html = template_path.read_text(encoding="utf-8")
    strip = np.concatenate(list(vol), axis=1)
    sdf_u8 = np.concatenate(list(pack_sdf_u8(sdf)), axis=1)
    payload = {
        "title": title,
        "slices": int(vol.shape[0]),
        "sliceWidth": int(vol.shape[2]),
        "sliceHeight": int(vol.shape[1]),
        "sdfRange": 6.0,
        "sheet": to_data_uri(strip),
        "sdfSheet": to_data_uri(sdf_u8),
        "top": to_data_uri(views[0]),
        "side": to_data_uri(views[1]),
        "front": to_data_uri(views[2]),
        "back": to_data_uri(views[3]),
    }
    marker = "/*__EMBEDDED_STACK__*/null"
    if marker not in html:
        raise RuntimeError(f"Template marker not found in {template_path}")
    out_path.write_text(html.replace(marker, json.dumps(payload), 1), encoding="utf-8")


def main() -> None:
    p = argparse.ArgumentParser(
        description="AASpriteStacker: Carve 4 orthographic views into an anti-aliased voxel + 3D SDF slice strip."
    )
    p.add_argument("sheet", type=Path, help="Input 4-view PNG (transparent or solid background)")
    p.add_argument("out", type=Path, help="Output horizontal RGBA slice strip PNG (ground slice on left)")
    p.add_argument("--slices", type=int, default=None, help="Target slice count / height (default: auto, 0 = native)")
    p.add_argument("--top-nose", choices=["auto", "up", "down"], default="auto")
    p.add_argument("--side-nose", choices=["left", "right"], default="left")
    p.add_argument("--order", choices=["auto", "reading"], default="auto")
    p.add_argument("--colours", type=int, default=0, help="Shared Oklab palette size (0 = keep full colors/AA)")
    p.add_argument("--shade", type=float, default=0.15, help="Subtle height-based depth shading (0 = none)")
    p.add_argument("--round", action="store_true", help="Smooth elliptical lathe carving for towers/barrels/pots")
    p.add_argument("--hard-alpha", action="store_true", help="Force binary alpha on source views (strict pixel art)")
    p.add_argument("--resample", choices=["auto", "area", "nearest"], default="auto", help="View downsampling filter")
    p.add_argument("--no-bleed", action="store_true", help="Disable 3D RGB edge dilation padding")
    p.add_argument("--smooth-sdf", type=float, default=0.15, help="3D SDF smoothing factor (0 = raw visual hull)")
    p.add_argument("--dark-thresh", type=int, default=70, help="Luminance cutoff for stripping 1px dark outlines")
    p.add_argument("--bg-tol", type=int, default=28, help="Color tolerance for flood-fill background removal")
    p.add_argument("--sdf", type=Path, default=None, help="Save packed 3D SDF slice strip PNG")
    p.add_argument("--normals", type=Path, default=None, help="Save smooth SDF-gradient 3D normal-map strip PNG")
    p.add_argument("--emissive", type=Path, default=None, help="Save auto-detected emissive mask strip PNG")
    p.add_argument("--preview", type=Path, default=None, help="Save Legacy vs AA comparison contact sheet PNG")
    p.add_argument("--html", type=Path, default=None, help="Save standalone WebGL2 AA interactive viewer HTML")
    p.add_argument("--export-dirs", type=int, default=0, help="Also export an AA N-direction sprite sheet PNG")
    p.add_argument("--export-mode", choices=["voxel", "sdf"], default="voxel")
    p.add_argument("--export-scale", type=int, default=2, help="Display scale for baked N-dir export")
    p.add_argument("--samples", type=int, choices=[1, 4, 8, 16], default=4, help="RGSS AA samples per display pixel")
    a = p.parse_args()

    sheet = np.array(Image.open(a.sheet).convert("RGBA"))
    vol, sdf, views = views_to_slices_aa(
        sheet,
        slices=a.slices,
        top_nose=a.top_nose,
        side_nose=a.side_nose,
        order=a.order,
        colours=a.colours,
        shade=a.shade,
        dark_thresh=a.dark_thresh,
        bg_tol=a.bg_tol,
        round_=a.round,
        hard_alpha=a.hard_alpha,
        resample=a.resample,
        bleed=not a.no_bleed,
        smooth_sdf=a.smooth_sdf,
    )

    a.out.parent.mkdir(parents=True, exist_ok=True)
    strip = np.concatenate(list(vol), axis=1)
    Image.fromarray(strip).save(a.out)
    print(f"{vol.shape[0]} slices of {vol.shape[2]} x {vol.shape[1]} px -> {a.out}")

    if a.sdf:
        a.sdf.parent.mkdir(parents=True, exist_ok=True)
        sdf_strip = np.concatenate(list(pack_sdf_u8(sdf)), axis=1)
        Image.fromarray(sdf_strip, mode="L").save(a.sdf)
        print(f"3D SDF -> {a.sdf}")

    if a.normals:
        a.normals.parent.mkdir(parents=True, exist_ok=True)
        norm_strip = np.concatenate(list(compute_normals_from_sdf(vol, sdf)), axis=1)
        Image.fromarray(norm_strip).save(a.normals)
        print(f"SDF normals -> {a.normals}")

    if a.emissive:
        a.emissive.parent.mkdir(parents=True, exist_ok=True)
        emis_strip = np.concatenate(list(detect_emissive(vol)), axis=1)
        Image.fromarray(emis_strip).save(a.emissive)
        print(f"emissive -> {a.emissive}")

    if a.preview:
        a.preview.parent.mkdir(parents=True, exist_ok=True)
        build_comparison_preview(vol, sdf, views, a.preview, samples=a.samples)
        print(f"comparison preview -> {a.preview}")

    if a.export_dirs > 0:
        exp_path = a.out.with_name(f"{a.out.stem}-{a.export_dirs}dir-aa.png")
        fw, fh = export_aa_turntable_sheet(
            vol, sdf, exp_path,
            dirs=a.export_dirs, mode=a.export_mode, scale=a.export_scale, samples=a.samples,
        )
        print(f"{a.export_dirs}-dir AA sheet ({fw}x{fh}/frame) -> {exp_path}")

    if a.html:
        a.html.parent.mkdir(parents=True, exist_ok=True)
        build_html_viewer(vol, sdf, views, a.html, title=a.out.stem)
        print(f"AA WebGL2 viewer -> {a.html}")


if __name__ == "__main__":
    main()
