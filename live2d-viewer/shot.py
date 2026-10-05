"""Parameterised Live2D snapshot tool.

Renders a local Cubism model through live2d-viewer/index.html and
writes one PNG per requested pose, so a rig change can be inspected (and
diffed) without launching the Electron app.

Usage:
    python shot.py --spec spec.json [--outdir out] [--port 8899]

Spec:
{
  "model": "/public/models/pecorine-native/pecorine-practice.model3.json",
  "vendor": "/public/vendor/cubism/",
  "canvaspx": [512, 1024],          # model canvas, authored pixels
  "canvas": [1024, 1536],           # device pixels of the render surface
  "shots": [
    {"name": "eye_neutral", "params": {"ParamEyeBallX": 0}, "focus": [195,150,320,192], "scale": 3},
    {"name": "full_1x1", "params": {}, "canvas": [512, 1024], "exact": true}
  ]
}

`focus` is a rect in model canvas pixels (512x1024, origin top-left) framed by
the viewer; `scale` upscales the snapshot with nearest neighbour. Without
`focus` the whole canvas is captured.

`exact: true` requests a strict 1:1 mapping between model canvas pixels and
render pixels (the PNG *is* the canvas; measure it directly, no transform
maths). The viewer computes the mapping from the authored canvas size and Cubism
canvas units. Mesh bounds include masks and hidden geometry, so they cannot
be used as the reference for rendered alpha bounds.

Every shot prints its effective px-per-canvas-pixel; only `exact` shots are
asserted to be 1:1. Pillow and numpy verify that snapshots are non-empty.
"""
import argparse
import base64
import io
import json
import sys
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
EXACT_TOLERANCE = 0.002          # px-per-canvas accepted as 1:1


def viewer_url(spec, shot, port):
    w, h = shot.get("canvas", spec.get("canvas", [1024, 1536]))
    query = {"w": w, "h": h, "model": spec["model"]}
    if spec.get("vendor"):
        query["vendor"] = spec["vendor"]
    if spec.get("canvaspx"):
        query["canvaspx"] = ",".join(map(str, spec["canvaspx"]))
    return f"http://127.0.0.1:{port}/live2d-viewer/index.html?{urlencode(query)}"


def snapshot_pose(page, spec, shot):
    """Apply a pose and view explicitly; reject incomplete evidence."""
    page.evaluate("window.viewer.reset()")
    px = spec.get("canvaspx", [512, 1024])
    page.evaluate("v => window.viewer.view(v)", {"zoom": 1, "cx": px[0] / 2, "cy": px[1] / 2})
    requested = shot.get("params", {})
    applied = page.evaluate("v => window.viewer.setParams(v)", requested)
    missing = set(requested) - set(applied)
    if missing:
        raise ValueError(f"{shot['name']}: unknown parameters: {sorted(missing)}")
    if any(applied[k] != v for k, v in requested.items()):
        raise ValueError(f"{shot['name']}: out-of-range parameters: requested={requested}, applied={applied}")
    if shot.get("exact"):
        if shot.get("focus"):
            raise ValueError("exact and focus cannot be combined")
        page.evaluate("window.viewer.exact()")
    elif shot.get("focus"):
        page.evaluate("r => window.viewer.focus(r)", shot["focus"])
    data = page.evaluate("window.viewer.snapshot(null, 1)")
    payload = base64.b64decode(data.split(",", 1)[1])
    if content_bbox(payload) is None:
        raise ValueError(f"{shot['name']}: render is empty")
    view = page.evaluate("window.viewer.currentView()")
    if shot.get("exact") and abs(view["pxPerCanvas"] - 1) > EXACT_TOLERANCE:
        raise ValueError(f"{shot['name']}: exact 1:1 mapping failed: {view}")
    return payload, applied, view


def content_bbox(payload):
    """Opaque-pixel bbox of a PNG payload, or None when fully transparent."""
    try:
        from PIL import Image
        import numpy as np
    except ImportError as error:
        raise RuntimeError("Pillow and numpy are required for non-empty render checks") from error
    a = np.array(Image.open(io.BytesIO(payload)).convert("RGBA"))
    ys, xs = np.nonzero(a[..., 3] > 16)
    if len(ys) == 0:
        return None
    return [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]


def visible_bbox(draws):
    """Union bbox (canvas px) of drawables that actually paint."""
    boxes = [d["bbox"] for d in draws if d.get("bbox") and (d.get("opacity") or 0) > 0.01]
    if not boxes:
        return None
    return [min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes)]


def run(spec, outdir, port, keep_open=False):
    outdir.mkdir(parents=True, exist_ok=True)
    base = f"http://127.0.0.1:{port}/live2d-viewer/index.html"
    written = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=swiftshader", "--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1200, "height": 1300})
        page.on("console", lambda m: print(f"  [console:{m.type}] {m.text[:300]}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: print(f"  [pageerror] {e}"))
        for shot in spec["shots"]:
            w, h = shot.get("canvas", spec.get("canvas", [1024, 1536]))
            url = viewer_url(spec, shot, port)
            page.goto(url)
            page.wait_for_function("window.viewer && (window.viewer.ready || window.viewer.errors.length)", timeout=60_000)
            errors = page.evaluate("window.viewer.errors")
            if errors:
                raise RuntimeError(f"viewer errors: {errors}")
            payload, applied, view = snapshot_pose(page, spec, shot)
            target = outdir / f"{shot['name']}.png"
            print(f"  {shot['name']:<28} {w}x{h} view={view}")
            target.write_bytes(payload)
            written.append(str(target))
            if shot.get("exact"):
                print(f"  -> {target} ({len(payload)} B)")
            else:
                print(f"  -> {target} ({len(payload)} B)")
        if keep_open:
            input("press enter to close")
        browser.close()
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--outdir", default=str(HERE / "out"))
    ap.add_argument("--port", type=int, default=8899)
    args = ap.parse_args()
    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    written = run(spec, Path(args.outdir), args.port)
    print(f"wrote {len(written)} snapshot(s) to {args.outdir}")


if __name__ == "__main__":
    sys.exit(main())
