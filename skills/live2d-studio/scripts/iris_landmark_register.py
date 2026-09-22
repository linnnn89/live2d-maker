"""Register a (possibly cropped / rescaled) reference onto the target canvas via iris landmarks.

Why: silhouette IoU fixes the scale but NOT the offset when the canvas is a partial crop of the
reference (measured: IoU 0.747 at the true offset vs 0.754 seventy-five px away), and a re-scaled
crop flips the answer outright.  Iris blobs pair by AREA, so the same drawing at the same pixel
scale pairs exactly and the two landmarks then over-determine the transform — their disagreement
is the confidence measure.

Usage:
  python iris_landmark_register.py ref.png --target 231.2 160.0 280.5 160.6

  --target  : the two iris centres in CANVAS coordinates, left-to-right (cx0 cy0 cx1 cy1).
              Read them off an already-anchored image (e.g. the full-body reference mapped by its
              hard anchor) — they are the ground truth for this registration.

Prints k, the canvas offset, each landmark's own solution, their disagreement, and the blob areas
(equal areas for a same-scale drawing; area_ratio ~ k^2 for a rescaled one).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def iris_blobs(path: Path, band: float, min_area: int):
    a = np.array(Image.open(path).convert("RGBA")).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = (al > 60) & (b > 110) & (g > 95) & ((b - r) > 35) & ((g - r) > 25)
    lab, n = ndimage.label(ndimage.binary_closing(m, np.ones((3, 3))))
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < min_area:
            continue
        if band > 0 and ys.mean() > band * a.shape[0]:      # drop gems / clothing below the head
            continue
        out.append((float(xs.mean()), float(ys.mean()), float(len(xs))))
    if len(out) < 2:
        raise SystemExit(f"only {len(out)} candidate blobs in {path.name}: lower --min-area, raise "
                         f"--band, or loosen the mask in iris_blobs()")
    top = sorted(out, key=lambda c: -c[2])[:2]              # the two largest = the eyes
    return sorted(top)                                      # left-to-right, same order in both images


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ref")
    ap.add_argument("--target", nargs=4, type=float, required=True,
                    metavar=("CX0", "CY0", "CX1", "CY1"))
    ap.add_argument("--band", type=float, default=0.4,
                    help="keep blobs above this fraction of the image height (0 disables)")
    ap.add_argument("--min-area", type=int, default=150)
    args = ap.parse_args()

    blobs = iris_blobs(Path(args.ref), args.band, args.min_area)
    tx = (args.target[0], args.target[2])
    ty = (args.target[1], args.target[3])
    sep_x = blobs[1][0] - blobs[0][0]
    sep_y = blobs[1][1] - blobs[0][1]
    k = ((tx[1] - tx[0]) / sep_x + (ty[1] - ty[0]) / sep_y) / 2 if sep_y else (tx[1] - tx[0]) / sep_x

    sols = [(tx[i] - blobs[i][0] * k, ty[i] - blobs[i][1] * k) for i in (0, 1)]
    ox = float(np.mean([s[0] for s in sols]))
    oy = float(np.mean([s[1] for s in sols]))
    disagree = (abs(sols[0][0] - sols[1][0]), abs(sols[0][1] - sols[1][1]))

    print(f"ref {Path(args.ref).name}: blobs "
          + ", ".join(f"({c[0]:.1f},{c[1]:.1f}) a={c[2]:.0f}" for c in blobs))
    print(f"target (canvas): " + ", ".join(f"({tx[i]:.1f},{ty[i]:.1f})" for i in (0, 1)))
    print(f"landmark separation: ref ({sep_x:.1f},{sep_y:.1f}) -> k={k:.4f}")
    print(f"per-landmark solution: ({sols[0][0]:.1f},{sols[0][1]:.1f}) and "
          f"({sols[1][0]:.1f},{sols[1][1]:.1f})  | disagreement "
          f"({disagree[0]:.1f},{disagree[1]:.1f}) px")
    print(f"canvas = {k:.4f} * ref_px + ({ox:.1f}, {oy:.1f})")
    if max(disagree) > 1.5:
        print("WARNING landmarks disagree — the pair is probably not the same feature "
              "(check blob areas and that both images show the same drawing).")


if __name__ == "__main__":
    main()
