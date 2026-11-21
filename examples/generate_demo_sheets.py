#!/usr/bin/env python3
"""Generate 4-view orthographic demo sheets and run AASpriteStacker to produce
slices, 3D SDFs, side-by-side Legacy vs AA comparison previews, and standalone viewers.

Run:
  .venv/bin/python examples/generate_demo_sheets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills" / "aa-sprite-stacking" / "scripts"))

from aa_views_to_slices import (  # noqa: E402
    build_comparison_preview,
    build_html_viewer,
    compute_normals_from_sdf,
    detect_emissive,
    export_aa_turntable_sheet,
    pack_sdf_u8,
    views_to_slices_aa,
)


def _outlined(v: np.ndarray, col=(20, 24, 34, 255)) -> np.ndarray:
    h, w = v.shape[:2]
    out = np.zeros((h + 2, w + 2, 4), dtype=np.uint8)
    out[1:-1, 1:-1] = v
    m = out[..., 3] > 0
    p = np.pad(m, 1)
    ring = ~m & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
    out[ring] = col
    return out


def _compose_sheet(views: list[np.ndarray], scale: int = 8, gap: int = 40) -> np.ndarray:
    outlined = [_outlined(v) for v in views]
    w = sum(v.shape[1] * scale for v in outlined) + gap * (len(outlined) + 1)
    h = max(v.shape[0] * scale for v in outlined) + gap * 2
    canvas = Image.new("RGBA", (w, h), (248, 249, 252, 255))
    x = gap
    for v in outlined:
        im = Image.fromarray(v).resize((v.shape[1] * scale, v.shape[0] * scale), Image.NEAREST)
        canvas.paste(im, (x, (h - im.height) // 2), im)
        x += im.width + gap
    return np.array(canvas.convert("RGB").convert("RGBA"))


def make_cottage_4view() -> np.ndarray:
    """Cozy pitched-roof cottage with a 1px weathervane mast (classic nearest-neighbor blinking stress test)."""
    W, L, H = 26, 30, 32
    GRASS = (86, 158, 70, 255)
    GRASS_HI = (114, 180, 78, 255)
    SOIL = (96, 66, 48, 255)
    WALL = (238, 224, 198, 255)
    TIMBER = (112, 74, 48, 255)
    ROOF = (74, 100, 148, 255)
    ROOF_HI = (104, 134, 186, 255)
    WIN = (255, 228, 134, 255)
    DOOR = (54, 134, 126, 255)
    BRICK = (176, 72, 60, 255)
    IRON = (46, 54, 70, 255)
    GOLD = (244, 196, 68, 255)

    # TOP (L x W)
    top = np.zeros((L, W, 4), dtype=np.uint8)
    yy, xx = np.mgrid[0:L, 0:W]
    dx = np.maximum(0, np.abs(xx - (W - 1) / 2) - 8.5)
    dy = np.maximum(0, np.abs(yy - (L - 1) / 2) - 10.5)
    top[np.hypot(dx, dy) <= 4.0] = GRASS
    top[(np.hypot(dx, dy) <= 4.0) & (((xx + yy) % 5) == 0)] = GRASS_HI
    top[5:25, 4:22] = ROOF
    top[5:25, 4:22:2] = ROOF_HI
    top[5:25, 12:14] = ROOF_HI
    # Single centered spire / weathervane above the ridge (avoids visual-hull ghosting with a second protrusion)
    top[14:17, 12:15] = BRICK
    top[15, 13] = IRON

    # SIDE (H x L), front pointing LEFT (x=0 is front -> y=L-1 in top)
    side = np.zeros((H, L, 4), dtype=np.uint8)
    side[H - 3 : H, :] = SOIL
    side[H - 3, :] = GRASS
    side[H - 14 : H - 3, 6:24] = WALL
    side[H - 14, 6:24] = TIMBER
    side[H - 14 : H - 3, 6] = TIMBER
    side[H - 14 : H - 3, 23] = TIMBER
    side[H - 11 : H - 7, 9:13] = WIN
    side[H - 11 : H - 7, 17:21] = WIN
    side[H - 23 : H - 13, 5:25] = ROOF
    side[H - 23 : H - 13 : 2, 5:25] = ROOF_HI
    # Brick chimney base (H-26..H-23) + 1px iron weathervane spire rising above it (0..H-26)
    side[H - 26 : H - 22, 13:16] = BRICK
    side[0 : H - 26, 14] = IRON
    side[2, 11:18] = GOLD

    # FRONT (H x W)
    front = np.zeros((H, W, 4), dtype=np.uint8)
    front[H - 3 : H, :] = SOIL
    front[H - 3, :] = GRASS
    front[H - 14 : H - 3, 5:21] = WALL
    front[H - 14 : H - 3, 5] = TIMBER
    front[H - 14 : H - 3, 20] = TIMBER
    front[H - 14, 5:21] = TIMBER
    front[H - 10 : H - 3, 11:15] = DOOR
    front[H - 10 : H - 7, 7:10] = WIN
    front[H - 10 : H - 7, 16:19] = WIN
    for k in range(10):
        r = H - 14 - k
        x0, x1 = 4 + k, W - 4 - k
        if x0 < x1:
            front[r, x0:x1] = WALL
            front[r, x0] = ROOF
            front[r, x1 - 1] = ROOF
            if k >= 8:
                front[r, x0:x1] = ROOF_HI
    front[H - 19 : H - 16, 11:15] = WIN
    front[H - 26 : H - 22, 12:15] = BRICK
    front[0 : H - 26, 13] = IRON
    front[2, 13] = GOLD

    # BACK (H x W)
    back = front.copy()
    back[H - 10 : H - 3, 11:15] = WALL
    back[H - 10 : H - 6, 11:15] = TIMBER
    back[H - 26 : H - 22, 12:15] = 0
    back[H - 26 : H - 22, W - 15 : W - 12] = BRICK
    back[0 : H - 26, 13] = 0
    back[0 : H - 26, W - 1 - 13] = IRON
    back[2, W - 1 - 13] = GOLD

    return _compose_sheet([top, side, front, back])


def make_lighthouse_4view() -> np.ndarray:
    """Rounded striped lighthouse on rocky plinth (showcases --round smooth ellipse SDF)."""
    W, L, H = 26, 26, 38
    ROCK = (114, 124, 142, 255)
    GRASS = (86, 154, 72, 255)
    WHITE = (242, 244, 248, 255)
    RED = (214, 52, 58, 255)
    DARK = (46, 56, 76, 255)
    GLOW = (255, 236, 154, 255)

    yy, xx = np.mgrid[0:L, 0:W]
    r_top = np.hypot(xx - (W - 1) / 2, yy - (L - 1) / 2)
    top = np.zeros((L, W, 4), dtype=np.uint8)
    top[r_top <= 11.5] = GRASS
    top[r_top <= 6.8] = WHITE
    top[r_top <= 4.5] = RED

    side = np.zeros((H, L, 4), dtype=np.uint8)
    for r in range(H):
        z = H - 1 - r
        if z < 5:
            rad = 11.5 - z * 0.5
            col = GRASS if z == 4 else ROCK
        elif z < 26:
            rad = 6.8 - (z - 5) * 0.11
            col = WHITE if ((z - 5) // 5) % 2 == 0 else RED
        elif z < 28:
            rad = 5.6
            col = DARK
        elif z < 33:
            rad = 3.6
            col = GLOW
        elif z < 36:
            rad = 4.4 - (z - 33) * 1.3
            col = RED
        else:
            rad = 0.7
            col = DARK
        mask = np.abs(np.arange(L) - (L - 1) / 2) <= rad
        side[r, mask] = col

    return _compose_sheet([top, side, side.copy(), side.copy()])


def main() -> None:
    out_dir = ROOT / "examples" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)

    demos = [
        ("cottage", make_cottage_4view(), dict(slices=0, order="reading", top_nose="down", round_=False)),
        ("lighthouse", make_lighthouse_4view(), dict(slices=0, order="reading", top_nose="down", round_=True)),
    ]

    for name, sheet, kwargs in demos:
        sheet_path = out_dir / f"{name}_4view.png"
        Image.fromarray(sheet).save(sheet_path)

        vol, sdf, views = views_to_slices_aa(sheet, **kwargs)
        strip = np.concatenate(list(vol), axis=1)
        Image.fromarray(strip).save(out_dir / f"{name}_slices.png")
        Image.fromarray(np.concatenate(list(pack_sdf_u8(sdf)), axis=1), mode="L").save(out_dir / f"{name}_sdf.png")
        Image.fromarray(np.concatenate(list(compute_normals_from_sdf(vol, sdf)), axis=1)).save(out_dir / f"{name}_normals.png")
        Image.fromarray(np.concatenate(list(detect_emissive(vol)), axis=1)).save(out_dir / f"{name}_emissive.png")

        build_comparison_preview(vol, sdf, views, out_dir / f"{name}_comparison.png", scale=4, samples=8)
        build_html_viewer(vol, sdf, views, out_dir / f"{name}_viewer.html", title=f"{name.title()} — AASpriteStacker")
        export_aa_turntable_sheet(vol, sdf, out_dir / f"{name}_16dir_aa.png", dirs=16, scale=2, samples=4)
        print(f"Generated {name}: {vol.shape[0]} slices ({vol.shape[2]}x{vol.shape[1]}) -> {out_dir}")


if __name__ == "__main__":
    main()
