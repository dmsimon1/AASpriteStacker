"""Comprehensive verification suite for AASpriteStacker.

Run:
  .venv/bin/python tests/test_aa_stacker.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills" / "aa-sprite-stacking" / "scripts"))

from aa_views_to_slices import (  # noqa: E402
    alpha_to_sdf_2d,
    build_comparison_preview,
    build_html_viewer,
    compute_normals_from_sdf,
    detect_emissive,
    dilate_rgb_edges,
    find_views,
    pack_sdf_u8,
    remove_background,
    render_stack_aa_sdf,
    render_stack_aa_voxel,
    render_stack_legacy,
    views_to_slices_aa,
)

RED, DRK, TYR, BARK, LEAF = (210, 40, 50), (40, 50, 70), (30, 30, 34), (110, 70, 40), (60, 150, 70)


def _view(w: int, h: int, rects: list[tuple[int, int, int, int, tuple[int, int, int]]]) -> np.ndarray:
    a = np.zeros((h, w, 4), dtype=np.uint8)
    for x0, y0, x1, y1, c in rects:
        a[y0:y1, x0:x1] = (*c, 255)
    return a


def _outlined(v: np.ndarray) -> np.ndarray:
    h, w = v.shape[:2]
    o = np.zeros((h + 2, w + 2, 4), dtype=np.uint8)
    o[1:-1, 1:-1] = v
    m = o[..., 3] > 0
    p = np.pad(m, 1)
    o[~m & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])] = (15, 15, 20, 255)
    return o


def _sheet(views: list[np.ndarray], scale: int = 8, gap: int = 40) -> np.ndarray:
    vs = [_outlined(v) for v in views]
    w = sum(v.shape[1] * scale for v in vs) + gap * (len(vs) + 1)
    h = max(v.shape[0] * scale for v in vs) + gap * 2
    out = Image.new("RGBA", (w, h), (250, 250, 250, 255))
    x = gap
    for v in vs:
        im = Image.fromarray(v).resize((v.shape[1] * scale, v.shape[0] * scale), Image.NEAREST)
        out.paste(im, (x, (h - im.height) // 2), im)
        x += im.width + gap
    return np.array(out.convert("RGB").convert("RGBA"))


def test_view_order_and_carving() -> None:
    L, W = 40, 20
    car_top = _view(W, L, [(0, 0, W, L, RED), (4, 9, W - 4, 31, DRK)])
    car_side = _view(L, 16, [(0, 6, L, 13, RED), (10, 1, 30, 6, DRK), (4, 11, 11, 16, TYR), (29, 11, 36, 16, TYR)])
    car_front = _view(W, 16, [(0, 6, W, 13, RED), (4, 1, W - 4, 6, DRK), (1, 11, 4, 16, TYR), (W - 4, 11, W - 1, 16, TYR)])
    car = [car_top, car_side, car_front, car_front.copy()]

    for perm in ([0, 1, 2, 3], [1, 2, 0, 3]):
        found = find_views(remove_background(_sheet([car[i] for i in perm])))
        assert found[0].shape[:2] == ((L + 2) * 8, (W + 2) * 8), found[0].shape
        assert found[1].shape[:2] == ((15 + 2) * 8, (L + 2) * 8), found[1].shape

    vol, sdf, _ = views_to_slices_aa(_sheet(car), slices=24, hard_alpha=True)
    assert vol.shape[0] == 24
    assert sdf.shape == vol.shape[:3]
    # Cabin slices should not carry red body bleed
    red = (vol[..., 0] > 150) & (vol[..., 1] < 80) & (vol[..., 3] >= 128)
    assert red[18:24].sum() == 0, f"unexpected red body voxels in cabin: {red[18:24].sum()}"


def test_rgb_edge_dilation_prevents_halos() -> None:
    vol = np.zeros((6, 10, 10, 4), dtype=np.uint8)
    vol[1:5, 3:7, 3:7] = (220, 60, 40, 255)
    dilated = dilate_rgb_edges(vol, iterations=3)
    # Alpha mask MUST remain identical
    assert np.array_equal(dilated[..., 3], vol[..., 3])
    # Adjacent transparent pixel (alpha==0) MUST carry nearest surface color instead of (0,0,0)!
    assert dilated[2, 2, 5, 3] == 0
    assert dilated[2, 2, 5, 0] > 200 and dilated[2, 2, 5, 1] > 40, f"expected dilated RGB, got {dilated[2, 2, 5]}"


def test_3d_sdf_and_round_lathe() -> None:
    yy, xx = np.mgrid[0:24, 0:24]
    disc = _view(24, 24, [])
    disc[(yy - 11.5) ** 2 + (xx - 11.5) ** 2 < 132] = (*RED, 255)
    tower_side = _view(24, 28, [(7, 0, 17, 24, RED), (0, 24, 24, 28, LEAF)])
    tower = [disc, tower_side, tower_side.copy(), tower_side.copy()]

    vol_sq, sdf_sq, _ = views_to_slices_aa(_sheet(tower), slices=28, order="reading", round_=False, hard_alpha=True)
    vol_rd, sdf_rd, _ = views_to_slices_aa(_sheet(tower), slices=28, order="reading", round_=True, hard_alpha=True)

    mid_sq = vol_sq[14, ..., 3] >= 128
    mid_rd = vol_rd[14, ..., 3] >= 128
    ys, xs = np.nonzero(mid_sq)
    assert mid_sq[ys.min(), xs.min()], "square tower corner should be filled when round_=False"
    assert not mid_rd[ys.min(), xs.min()], "round tower corner should be carved when round_=True"
    # SDF inside tower center must be negative, far outside must be positive
    assert sdf_rd[14, 12, 12] < -1.0, f"expected negative SDF inside tower, got {sdf_rd[14, 12, 12]}"
    assert sdf_rd[14, 0, 0] > 2.0, f"expected positive SDF outside tower, got {sdf_rd[14, 0, 0]}"

    # Normals computed from SDF must point +Z at top cap
    norms = compute_normals_from_sdf(vol_rd, sdf_rd)
    assert norms[26, 12, 12, 2] > 200, f"top normal z={norms[26, 12, 12, 2]}"


def test_symmetric_rotation_center_zero_wobble() -> None:
    """Verify even-sized cube renders with exact symmetric horizontal centroid across 0/90/180/270 deg."""
    vol = np.zeros((12, 16, 16, 4), dtype=np.uint8)
    vol[1:11, 3:13, 3:13] = (180, 90, 60, 255)

    centroids_x = []
    for ang in (0.0, 90.0, 180.0, 270.0):
        im = np.array(render_stack_aa_voxel(vol, ang, scale=4, samples=4, shadow=False, outline=False, lighting=False))
        a = im[..., 3].astype(np.float64)
        xs = np.arange(im.shape[1])[None, :]
        cx = (a * xs).sum() / a.sum()
        centroids_x.append(cx)

    drift = max(centroids_x) - min(centroids_x)
    assert drift < 0.05, f"symmetric rotation drift too large: {drift:.4f} px ({centroids_x})"


def test_1px_thin_post_never_blinks_in_aa() -> None:
    """A 1-voxel-wide vertical mast drops pixels in legacy 1x nearest, but stays unbroken across ALL angles in AA DDA!"""
    vol = np.zeros((16, 12, 12, 4), dtype=np.uint8)
    vol[0:16, 6, 6] = (230, 180, 40, 255)  # 1x1x16 thin vertical rod

    min_aa_mass = 1e9
    for ang in range(0, 90, 7):
        im_aa = np.array(render_stack_aa_voxel(vol, float(ang), scale=4, samples=4, shadow=False, outline=False, lighting=False))
        mass = float((im_aa[..., 3] / 255.0).sum())
        min_aa_mass = min(min_aa_mass, mass)

    # A 16-slice 1x1 rod at scale=4 covers ~16*4*4 = 256 display px area; mass must stay solid at every angle
    assert min_aa_mass > 180.0, f"1px rod lost coverage during rotation: min mass = {min_aa_mass:.1f}"


def test_correlated_coverage_no_alpha_bloat_on_tall_walls() -> None:
    """Verify edge fractional alpha stays genuinely anti-aliased (not bloated to 1.0) on a 40-slice vertical wall."""
    vol = np.zeros((40, 16, 16, 4), dtype=np.uint8)
    vol[:, 4:12, 4:12] = (70, 140, 210, 255)

    im_aa = np.array(render_stack_aa_voxel(vol, 27.0, scale=4, samples=8, shadow=False, outline=False, lighting=False))
    alpha = im_aa[..., 3]
    partial_edge_px = ((alpha > 10) & (alpha < 245)).sum()
    assert partial_edge_px > 80, f"expected rich fractional anti-aliased edge pixels, got {partial_edge_px}"

    im_leg = np.array(render_stack_legacy(vol, 27.0, scale=4, shadow=False, outline=False))
    leg_partial = ((im_leg[..., 3] > 10) & (im_leg[..., 3] < 245)).sum()
    assert leg_partial == 0, "legacy baseline should have binary alpha (0 partial edge pixels)"


def test_aliasing_temporal_stability_metric() -> None:
    """Measure frame-to-frame temporal pixel-crawl (L2 energy of tiny 1-deg rotation delta).
    AA Crisp Voxel & AA Smooth SDF should show dramatically lower high-frequency popping than Legacy 1x Nearest.
    """
    vol = np.zeros((18, 20, 20, 4), dtype=np.uint8)
    yy, xx = np.mgrid[0:20, 0:20]
    for z in range(18):
        r = 7.5 - z * 0.25
        vol[z, np.hypot(xx - 9.5, yy - 9.5) <= r] = (200, 75, 65, 255)
    sdf = np.stack([alpha_to_sdf_2d(vol[z, ..., 3].astype(np.float32) / 255.0) for z in range(18)], axis=0)

    leg_a = np.array(render_stack_legacy(vol, 35.0, scale=4, shadow=False, outline=True), dtype=np.float32)
    leg_b = np.array(render_stack_legacy(vol, 36.0, scale=4, shadow=False, outline=True), dtype=np.float32)
    aa_a = np.array(render_stack_aa_voxel(vol, 35.0, sdf=sdf, scale=4, samples=8, shadow=False, outline=True), dtype=np.float32)
    aa_b = np.array(render_stack_aa_voxel(vol, 36.0, sdf=sdf, scale=4, samples=8, shadow=False, outline=True), dtype=np.float32)
    sdf_a = np.array(render_stack_aa_sdf(vol, sdf, 35.0, scale=4, samples=4, shadow=False, outline=True), dtype=np.float32)
    sdf_b = np.array(render_stack_aa_sdf(vol, sdf, 36.0, scale=4, samples=4, shadow=False, outline=True), dtype=np.float32)

    # Frame-to-frame RMS change across a 1-degree turn (popping/shimmer metric — lower is smoother!)
    rms_leg = float(np.sqrt(np.mean((leg_b - leg_a) ** 2)))
    rms_aa = float(np.sqrt(np.mean((aa_b - aa_a) ** 2)))
    rms_sdf = float(np.sqrt(np.mean((sdf_b - sdf_a) ** 2)))
    print(f"  1-deg rotation shimmer RMS: legacy={rms_leg:.2f}, aa_voxel={rms_aa:.2f}, aa_sdf={rms_sdf:.2f}")
    assert rms_aa < rms_leg * 0.85, f"expected AA Voxel shimmer ({rms_aa:.2f}) << Legacy ({rms_leg:.2f})"
    assert rms_sdf < rms_leg * 0.85, f"expected AA SDF shimmer ({rms_sdf:.2f}) << Legacy ({rms_leg:.2f})"


def test_emissive_and_viewer_packaging() -> None:
    box_vol = np.zeros((10, 12, 12, 4), dtype=np.uint8)
    box_vol[1:9, 2:10, 2:10] = (*DRK, 255)
    box_vol[4:6, 2, 4:6] = (255, 245, 160, 255)
    em = detect_emissive(box_vol)
    assert (em[4:6, 2, 4:6, 3] > 0).all()
    assert em[8, 6, 6, 3] == 0

    sdf = np.stack([alpha_to_sdf_2d(box_vol[z, ..., 3].astype(np.float32) / 255.0) for z in range(10)], axis=0)
    assert pack_sdf_u8(sdf).dtype == np.uint8

    with tempfile.TemporaryDirectory() as td:
        p = Path(td)
        build_comparison_preview(box_vol, sdf, [box_vol[5]] * 4, p / "cmp.png", scale=2, samples=4)
        assert (p / "cmp.png").stat().st_size > 1000
        build_html_viewer(box_vol, sdf, [box_vol[5]] * 4, p / "viewer.html", "Test")
        html = (p / "viewer.html").read_text(encoding="utf-8")
        for needle in (
            "evalVoxelDDA",
            "evalBandlimitedSlices",
            "evalCleanEdgeSlices",
            "evalSmoothSdf",
            "JFA_INIT_FS",
            "contentvisibilityautostatechange",
            'name="color-scheme"',
            "light-dark(",
        ):
            assert needle in html, f"missing {needle} in viewer.html"


if __name__ == "__main__":
    tests = [
        test_view_order_and_carving,
        test_rgb_edge_dilation_prevents_halos,
        test_3d_sdf_and_round_lathe,
        test_symmetric_rotation_center_zero_wobble,
        test_1px_thin_post_never_blinks_in_aa,
        test_correlated_coverage_no_alpha_bloat_on_tall_walls,
        test_aliasing_temporal_stability_metric,
        test_emissive_and_viewer_packaging,
    ]
    for fn in tests:
        print(f"Running {fn.__name__}...")
        fn()
    print("ALL TESTS PASSED!")
