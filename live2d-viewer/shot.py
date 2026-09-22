"""Parameterised Live2D snapshot tool.

Renders a local Cubism model through work/tools/live2d-viewer/index.html and
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
maths). It is calibrated empirically against the model's own drawable bounds
and re-checked after the render, because the viewer's "zoom 1" is actually
~0.93 px per canvas pixel — measuring pixels off an uncalibrated snapshot
silently scales every number you read.

Every shot prints its effective px-per-canvas-pixel; only `exact` shots are
asserted to be 1:1. Use the `None`-scale mode (no PIL import) for pure
screenshots.
"""
import argparse
import base64
import io
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
EXACT_TOLERANCE = 0.002          # px-per-canvas accepted as 1:1
EXACT_ALIGN_TOLERANCE = 2.0      # px, final bbox agreement


def content_bbox(payload):
    """Opaque-pixel bbox of a PNG payload, or None when fully transparent."""
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        return None
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


def calibrate(page, shot, outdir, name, w, h, canvaspx):
    """Render, measure, adjust the zoom until the PNG is the canvas at 1:1."""
    page.evaluate("() => window.viewer.view({zoom: 1, cx: %s, cy: %s})" % (w / 2, h / 2))
    want = visible_bbox(page.evaluate("() => window.viewer.drawables()"))
    if want is None:
        return None, None
    payload = got = None
    ok = False
    attempt = -1
    for attempt in range(6):
        data = page.evaluate("(c) => window.viewer.snapshot(c || null, 1)", None)
        payload = base64.b64decode(data.split(",", 1)[1])
        got = content_bbox(payload)
        if not got:
            print(f"  ! {name}: render is empty, cannot calibrate")
            return payload, None
        kx = (got[2] - got[0]) / max(1.0, want[2] - want[0])
        ky = (got[3] - got[1]) / max(1.0, want[3] - want[1])
        k = (kx + ky) / 2
        if abs(k - 1) <= EXACT_TOLERANCE:
            ok = True
            break
        cur = page.evaluate("() => window.viewer.currentView()")["zoom"]
        page.evaluate("(v) => window.viewer.view(v)",
                      {"zoom": cur / k, "cx": w / 2, "cy": h / 2})
    align = max(abs(got[i] - want[i]) for i in range(4)) if got else None
    if ok and align is not None and align <= EXACT_ALIGN_TOLERANCE:
        print(f"  {name:<28} exact 1:1 verified (px/canvas=1.000, "
              f"bbox png={[round(v) for v in got]} vs drawables={[round(v, 1) for v in want]}, Δ≤{align:.1f}px)")
    else:
        print(f"  !! {name}: exact 1:1 NOT achieved (iterate={attempt}, "
              f"png={[round(v) for v in got] if got else None}, drawables={[round(v, 1) for v in want]})")
    return payload, got


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
            url = f"{base}?w={w}&h={h}&model={spec['model']}"
            if spec.get("vendor"):
                url += f"&vendor={spec['vendor']}"
            if spec.get("canvaspx"):
                url += f"&canvaspx={spec['canvaspx'][0]},{spec['canvaspx'][1]}"
            page.goto(url)
            page.wait_for_function("window.viewer && (window.viewer.ready || window.viewer.errors.length)", timeout=60_000)
            errors = page.evaluate("window.viewer.errors")
            if errors:
                raise RuntimeError(f"viewer errors: {errors}")
            params = page.evaluate("window.viewer.reset()")
            if shot.get("params"):
                applied = page.evaluate("(v) => window.viewer.setParams(v)", shot["params"])
                missing = set(shot["params"]) - set(applied)
                if missing:
                    print(f"  ! unknown parameters ignored: {sorted(missing)}")
            if shot.get("focus"):
                page.evaluate("(r) => window.viewer.focus(r)", shot["focus"])
            target = outdir / f"{shot['name']}.png"
            if shot.get("exact"):
                canvaspx = spec.get("canvaspx")
                if canvaspx and [w, h] != list(canvaspx):
                    print(f"  ! exact=true needs canvas == canvaspx; {w}x{h} != {canvaspx} — refusing to calibrate")
                payload, _ = calibrate(page, shot, outdir, shot["name"], w, h, canvaspx)
                if payload is None:
                    continue
            else:
                data = page.evaluate("(c) => window.viewer.snapshot(c || null, 1)", None)
                payload = base64.b64decode(data.split(",", 1)[1])
                view = page.evaluate("window.viewer.currentView()")
                ppc = view.pop("pxPerCanvas", None)
                print(f"  {shot['name']:<28} {w}x{h} view={view} "
                      f"(px/canvas≈{ppc:.3f} — NOT 1:1, do not measure pixels off this PNG)")
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
