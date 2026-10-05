"""Pose QA runner for Live2D models.

Renders all required poses from a QA spec, produces localized crops
(eye, mouth, hair), tiles contact sheets, and writes review.json.

Usage:
    python qa.py [--spec specs/qa-default.json] [--outdir review] [--port 8899]
"""
import argparse
import datetime
import hashlib
import io
import json
import sys
import urllib.request
import functools
import re
import threading
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sheet import sheet
from shot import snapshot_pose, viewer_url

DEFAULT_SPEC = HERE / "specs" / "qa-default.json"
DEFAULT_OUTDIR = HERE / "review"
DEFAULT_PORT = 8899


def check_server(port):
    """Verify local HTTP server is listening."""
    url = f"http://127.0.0.1:{port}/live2d-viewer/index.html"
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=3):
            return True
    except Exception:
        return False


@contextmanager
def local_server(port):
    """Reuse the local renderer server or serve this repository for this run only."""
    if check_server(port):
        yield
        return
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(HERE.parent))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def run_qa(spec_path, outdir, port=DEFAULT_PORT, keep_open=False):
    spec_path = Path(spec_path).resolve()
    outdir = Path(outdir).resolve()
    spec = json.loads(spec_path.read_text(encoding="utf-8"))

    shots = spec.get("shots", [])
    if not shots:
        raise ValueError("QA spec must contain at least one shot")
    names = [shot["name"] for shot in shots]
    if len(set(names)) != len(names) or any(not re.fullmatch(r"[A-Za-z0-9_-]+", name) for name in names):
        raise ValueError("Shot names must be unique, safe filenames")
    crops_cfg = spec.get("crops", {})
    for crop_name, box in crops_cfg.items():
        if not re.fullmatch(r"[A-Za-z0-9_-]+", crop_name) or crop_name == "full":
            raise ValueError(f"Invalid crop directory: {crop_name}")
        for shot in shots:
            w, h = shot.get("canvas", spec.get("canvas", [1024, 1536]))
            if (len(box) != 4 or any(type(v) is not int for v in box)
                    or not (0 <= box[0] < box[2] <= w and 0 <= box[1] < box[3] <= h)):
                raise ValueError(f"Invalid render-pixel crop '{crop_name}' for {shot['name']}: {box}")
    # A failed rerun must not leave a previous successful review as the current gate.
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "review.json").write_text(json.dumps({"status": "running"}), encoding="utf-8")

    full_dir = outdir / "full"
    full_dir.mkdir(parents=True, exist_ok=True)

    crop_dirs = {}
    for crop_name in crops_cfg:
        cdir = outdir / crop_name
        cdir.mkdir(parents=True, exist_ok=True)
        crop_dirs[crop_name] = cdir

    shots_info = []

    with local_server(port), sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--use-angle=swiftshader", "--disable-gpu-sandbox"],
        )
        page = browser.new_page(viewport={"width": 1200, "height": 1600})
        page.on(
            "console",
            lambda m: print(f"  [console:{m.type}] {m.text[:300]}", file=sys.stderr)
            if m.type in ("error", "warning")
            else None,
        )
        page.on("pageerror", lambda e: print(f"  [pageerror] {e}", file=sys.stderr))

        print(f"[qa] Loading viewer for model {spec['model']}...", file=sys.stderr)
        current_url = None
        runtime = None
        total = len(shots)
        print(f"[qa] Rendering {total} poses...", file=sys.stderr)

        for idx, shot in enumerate(shots, start=1):
            name = shot["name"]
            url = viewer_url(spec, shot, port)
            if url != current_url:
                page.goto(url)
                page.wait_for_function("window.viewer && (window.viewer.ready || window.viewer.errors.length)", timeout=60_000)
                errors = page.evaluate("window.viewer.errors")
                if errors:
                    raise RuntimeError(f"viewer errors: {errors}")
                current_url = url
                runtime = page.evaluate("({coreVersion: viewer.coreVersion, mocVersion: viewer.mocVersion, parameters: viewer.params()})")
            payload, applied, view = snapshot_pose(page, spec, shot)
            im = Image.open(io.BytesIO(payload)).convert("RGBA")

            full_path = full_dir / f"{name}.png"
            full_path.write_bytes(payload)

            shot_crops = {}
            for crop_name, box in crops_cfg.items():
                crop_im = im.crop(box)
                crop_path = crop_dirs[crop_name] / f"{name}.png"
                crop_im.save(crop_path, format="PNG")
                shot_crops[crop_name] = f"{crop_name}/{name}.png"

            shots_info.append({
                "name": name,
                "params": shot.get("params", {}),
                "applied_params": applied,
                "canvas": list(im.size),
                "view": view,
                "full": f"full/{name}.png",
                "crops": shot_crops,
            })
            print(f"  [{idx}/{total}] {name:<24} -> full + {len(shot_crops)} crop(s)", file=sys.stderr)

        if keep_open:
            input("Press Enter to close browser...")
        browser.close()

    # Generate contact sheets
    print("[qa] Composing contact sheets...", file=sys.stderr)
    contact_sheets = {}

    full_items = [(s["name"], str(full_dir / f"{s['name']}.png")) for s in shots_info]
    main_sheet_path = outdir / "contact-sheet.png"
    sheet(full_items, str(main_sheet_path), cols=4)
    contact_sheets["full"] = "contact-sheet.png"

    for crop_name, cdir in crop_dirs.items():
        crop_items = [(s["name"], str(cdir / f"{s['name']}.png")) for s in shots_info]
        c_sheet_path = cdir / "contact-sheet.png"
        sheet(crop_items, str(c_sheet_path), cols=4)
        contact_sheets[crop_name] = f"{crop_name}/contact-sheet.png"

    review_data = {
        "status": "ok",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "model": spec.get("model"),
        "vendor": spec.get("vendor"),
        "canvas": spec.get("canvas", [1024, 1536]),
        "canvaspx": spec.get("canvaspx", [512, 1024]),
        "runtime": runtime,
        "spec": spec,
        "spec_sha256": hashlib.sha256(spec_path.read_bytes()).hexdigest(),
        "acceptance": "rendered; visual acceptance requires inspection",
        "crops": crops_cfg,
        "shots_count": len(shots_info),
        "shots": shots_info,
        "contact_sheets": contact_sheets,
    }

    review_file = outdir / "review.json"
    review_file.write_text(json.dumps(review_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[qa] Done! Review report written to {review_file}", file=sys.stderr)

    return review_data


def main():
    ap = argparse.ArgumentParser(description="Live2D Pose QA Pack Runner")
    ap.add_argument("--spec", default=str(DEFAULT_SPEC), help="Path to QA spec JSON")
    ap.add_argument("--outdir", default=str(DEFAULT_OUTDIR), help="Output directory for review")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port of local HTTP server")
    ap.add_argument("--keep-open", action="store_true", help="Keep browser open after rendering")
    args = ap.parse_args()

    try:
        report = run_qa(args.spec, args.outdir, args.port, args.keep_open)
        # Decision contract: CLI stdout is JSON, non-zero exit on error
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        failure = {"status": "error", "error": str(e)}
        outdir = Path(args.outdir)
        outdir.mkdir(parents=True, exist_ok=True)
        (outdir / "review.json").write_text(json.dumps(failure), encoding="utf-8")
        print(json.dumps(failure, indent=2, ensure_ascii=False))
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
