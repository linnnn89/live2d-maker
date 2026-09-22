"""Register a reference artwork onto a Live2D model canvas by silhouette IoU search.

Builds the model's silhouette from <model-dir>/source/source-manifest.json (layers pasted in
manifest order), then searches (uniform scale, translation) that maximises
    score = IoU * (1 + 0.35 * min(1, covered_fraction))
coarse at 1/sub resolution, then refines at full resolution around the winner.

Usage:
  python register_art.py <reference.png> --model-dir work/<char>-native \
      [--lo 0.3] [--hi 0.9] [--step 0.01] [--sub 4] [--json out.json] [--tag name]

Writes <model-dir>/debug_analysis/align_<tag>.json, overlay_<tag>.png and prints the transform.
Typical reading: same drawing -> IoU >= 0.9 and covered >= 0.95; a cut-out rebuild scores
0.75-0.85 with covered still near 1. If the best offset pins the art to a canvas edge, the
canvas was derived from that art by exactly that scale (e.g. canvas = art * 2/3).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

CANVAS = (512, 1024)


def composite(model_dir):
    manifest = json.loads((model_dir / "source" / "source-manifest.json").read_text(encoding="utf-8"))
    canvas = manifest.get("canvas", list(CANVAS))
    out = Image.new("RGBA", tuple(canvas), (0, 0, 0, 0))
    for layer in manifest["layers"]:
        left, top, right, bottom = layer["bounds"]
        asset = model_dir / "source" / f"{layer['name']}.png"
        if asset.exists():
            out.alpha_composite(Image.open(asset).convert("RGBA"), (left, top))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--lo", type=float, default=0.3)
    parser.add_argument("--hi", type=float, default=0.9)
    parser.add_argument("--step", type=float, default=0.01)
    parser.add_argument("--sub", type=int, default=4)
    parser.add_argument("--json", default=None)
    parser.add_argument("--tag", default="art")
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    debug = model_dir / "debug_analysis"
    debug.mkdir(parents=True, exist_ok=True)
    art_path = Path(args.image)
    if not art_path.is_absolute():
        art_path = model_dir / args.image

    sub = args.sub
    model = composite(model_dir)
    width, height = model.size
    full_mask = np.array(model.getchannel("A")) > 60
    small = np.array(model.getchannel("A").resize((width // sub, height // sub), Image.BILINEAR)) > 60

    art = Image.open(art_path).convert("RGBA")
    alpha = np.array(art.getchannel("A"))
    print(f"art {art_path.name} size={art.size} alpha>60: {(alpha > 60).sum()} px "
          f"({(alpha > 60).mean() * 100:.1f}% of frame)")

    coarse = []
    for scale in np.arange(args.lo, args.hi, args.step):
        size = (max(8, round(art.width * scale / sub)), max(8, round(art.height * scale / sub)))
        ref_mask = np.array(art.getchannel("A").resize(size, Image.BILINEAR)) > 60
        area = int(ref_mask.sum())
        for dy in range(0, small.shape[0] - size[1], 2):
            for dx in range(0, small.shape[1] - size[0], 2):
                window = small[dy:dy + size[1], dx:dx + size[0]]
                inter = int((window & ref_mask).sum())
                if inter == 0:
                    continue
                union = int(window.sum()) + area - inter
                iou = inter / union
                score = iou * (1 + 0.35 * min(1.0, inter / area))
                coarse.append((score, scale, dx * sub, dy * sub, iou, inter / area))
    if not coarse:
        raise SystemExit("no overlap found — widen --lo/--hi or check the reference alpha channel")
    coarse.sort(reverse=True)
    print(f"coarse: {len(coarse)} candidates, best scale={coarse[0][1]:.3f} "
          f"offset=({coarse[0][2]},{coarse[0][3]}) IoU={coarse[0][4]:.3f} covered={coarse[0][5]:.3f}")

    # refine the winning coarse candidate at full resolution
    refined = []
    for _, coarse_scale, coarse_x, coarse_y, _, _ in coarse[:1]:
        for fine_scale in np.arange(coarse_scale - 0.02, coarse_scale + 0.02, 0.002):
            size = (round(art.width * fine_scale), round(art.height * fine_scale))
            if size[0] > width or size[1] > height:
                continue
            ref_mask = np.array(art.getchannel("A").resize(size, Image.BILINEAR)) > 60
            area = int(ref_mask.sum())
            for oy in range(max(0, coarse_y - sub), coarse_y + sub + 1):
                for ox in range(max(0, coarse_x - sub), coarse_x + sub + 1):
                    if oy + size[1] > height or ox + size[0] > width:
                        continue
                    window = full_mask[oy:oy + size[1], ox:ox + size[0]]
                    inter = int((window & ref_mask).sum())
                    if inter == 0:
                        continue
                    union = int(window.sum()) + area - inter
                    iou_f = inter / union
                    score = iou_f * (1 + 0.35 * min(1.0, inter / area))
                    refined.append((score, fine_scale, ox, oy, iou_f, inter / area))
    refined.sort(reverse=True)
    _, scale, ox, oy, iou, covered = refined[0]
    print(f"refined: scale={scale:.4f} offset=({ox},{oy}) IoU={iou:.3f} covered={covered:.3f}")

    out = debug / (args.json or f"align_{args.tag}.json")
    json.dump(dict(image=art_path.name, scale=scale, offset=[ox, oy], iou=iou, coverage=covered),
              out.open("w", encoding="utf-8"))

    scaled = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    overlay.alpha_composite(model)
    tint = scaled.copy()
    tint.putalpha(tint.getchannel("A").point(lambda v: int(v * 0.5)))
    overlay.alpha_composite(tint, (ox, oy))
    crop = overlay.crop((130, 15, 400, 350))
    crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS).convert("RGB").save(
        debug / f"overlay_{args.tag}.png")
    print(f"wrote {out} and {debug / f'overlay_{args.tag}.png'} (canvas = {scale:.4f}*art + ({ox},{oy}))")


if __name__ == "__main__":
    main()
