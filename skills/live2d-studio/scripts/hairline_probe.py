#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Skin-anchored hairline probe: model composite vs registered reference.

Two stable metrics for "fringe / hairline sits too high or too low", both in
canvas px and computed identically on both sides:

  * hairline   = per column, topmost row of the face skin component (the
    visible forehead edge; the fringe bottom sits just above it);
  * fringe tip = per column, lowest front-hair alpha row, model side only,
    bounded y<230 — eye-line-clipped metrics cannot see tips that hang into
    the eye opening, which is exactly the defect being measured.

The model side is composited from a source-manifest.json. Interfering layers
are dropped by default (neutral composite): the occluding hair behind the
disputed part plus every expression toggle / open mouth, which otherwise
stack duplicate features and poison blob pairing.

Usage:
  python hairline_probe.py --manifest work/<char>-native/source/source-manifest.json \
      --ref work/<char>-native/全身像参考图.png --scale 0.666 --offset 0,23

Before/after with identical art: rerun with the OLD bounds of the moved layer
(current art + old placement reconstructs the before state):
  python hairline_probe.py ... --fronthair-bounds 154,38,350,351
"""
from __future__ import annotations

import argparse
import json
import statistics as st
from pathlib import Path

import numpy as np
from PIL import Image
import scipy.ndimage as ndi

CANVAS = (512, 1024)
DEFAULT_DROP = "backhair,mouth_open,facedetail"


def skin_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 205) & (g > 170) & (b > 140) & ((r - b) > 12) & ((r - b) < 95) & ((g - b) < 50)


def composite(manifest, srcdir, drop, fronthair_bounds=None):
    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 255))
    for entry in manifest["layers"]:
        name = entry["name"]
        if any(name == d or name.startswith(d) for d in drop):
            continue
        bounds = fronthair_bounds if (fronthair_bounds and name == "fronthair") else entry["bounds"]
        png = Path(srcdir) / f"{name}.png"
        if not png.exists():
            continue
        art = Image.open(png).convert("RGBA")
        canvas.alpha_composite(art, (int(bounds[0]), int(bounds[1])))
    return canvas


def hairline(canvas_rgb, eye_y):
    """Per-column topmost face-skin row in canvas y (cheek-probe component)."""
    skin = ndi.binary_closing(skin_mask(canvas_rgb), np.ones((5, 5), bool))
    labels, _ = ndi.label(skin, np.ones((3, 3), int))
    probe = int(labels[int(eye_y + 14), 256]) if labels.max() else 0
    if not probe:
        best = max(((int((labels == i + 1).sum()), i + 1) for i in range(labels.max())), default=(0, 0))
        probe = best[1]
    face = labels == probe
    out = {}
    for x in range(216, 301, 6):
        rows = np.where(face[:, x])[0]
        rows = rows[rows < eye_y + 4]
        out[x] = int(rows.min()) if len(rows) else None
    return out


def fringe_tips(alpha, y0=40, y1=230):
    """Per-column lowest front-hair alpha row inside the window (no eye-line clip)."""
    out = {}
    for x in range(216, 301, 6):
        rows = np.where(alpha[y0:y1, x])[0]
        out[x] = y0 + int(rows.max()) if len(rows) else None
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--srcdir", default=None, help="layer PNG dir (default: the manifest's directory)")
    ap.add_argument("--ref", required=True, help="reference art; registered into canvas space via --scale/--offset")
    ap.add_argument("--scale", type=float, required=True)
    ap.add_argument("--offset", default="0,0", help="ox,oy in canvas px")
    ap.add_argument("--drop", default=DEFAULT_DROP, help="comma list of layer names/prefixes to strip")
    ap.add_argument("--eye-y-model", type=float, default=157.0)
    ap.add_argument("--eye-y-ref", type=float, default=160.0)
    ap.add_argument("--fronthair", default="fronthair")
    ap.add_argument("--fronthair-bounds", default=None, help="x0,y0,x1,y1 override for the front-hair layer")
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    srcdir = args.srcdir or str(Path(args.manifest).parent)
    drop = [d for d in args.drop.split(",") if d]
    fh_bounds = [int(v) for v in args.fronthair_bounds.split(",")] if args.fronthair_bounds else None

    model_rgb = np.array(composite(manifest, srcdir, drop, fh_bounds).convert("RGB")).astype(int)

    ox, oy = (float(v) for v in args.offset.split(","))
    ref = Image.open(args.ref).convert("RGBA")
    scaled = ref.resize((round(ref.width * args.scale), round(ref.height * args.scale)), Image.LANCZOS)
    canvas_ref = Image.new("RGBA", CANVAS, (0, 0, 0, 255))
    canvas_ref.alpha_composite(scaled, (int(ox), int(oy)))
    ref_rgb = np.array(canvas_ref.convert("RGB")).astype(int)

    m_hl = hairline(model_rgb, args.eye_y_model)
    r_hl = hairline(ref_rgb, args.eye_y_ref)

    layer = next(e for e in manifest["layers"] if e["name"] == args.fronthair)
    bounds = fh_bounds or layer["bounds"]
    fh_img = Image.open(Path(srcdir) / f"{args.fronthair}.png").convert("RGBA")
    fh_full = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    fh_full.alpha_composite(fh_img, (int(bounds[0]), int(bounds[1])))
    tips = fringe_tips(np.array(fh_full.getchannel("A")) > 32)

    print("x    ref_hairline  model_hairline  delta | front_hair_tip")
    deltas = []
    for x in sorted(r_hl):
        a, b = r_hl.get(x), m_hl.get(x)
        if a is not None and b is not None:
            deltas.append(b - a)
            delta = f"{b - a:+d}"
        else:
            delta = "n/a"
        print(f"{x:>4} {a!s:>12} {b!s:>14} {delta:>6} | {tips.get(x)}")
    if deltas:
        print(f"hairline delta median (model - ref): {st.median(deltas):+.1f}")


if __name__ == "__main__":
    main()
