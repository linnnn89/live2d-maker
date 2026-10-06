"""Generate pixel oracles from existing Python raster/composite functions and Pillow.

Run from any directory with the repository's Pillow/numpy dependencies installed.
Extract only the composite function to avoid importing optional PSD/native tooling.
"""
import ast
import base64
import io
import json
import random
import runpy
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
clip_polygon = runpy.run_path(str(ROOT / "tools/authoring_rig/raster.py"))["clip_polygon"]
source = ast.parse((ROOT / "tools/authoring_rig/generated.py").read_text())
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "composite_ir")
namespace = {"Image": Image, "clip_polygon": clip_polygon}
exec(compile(ast.Module(body=[function], type_ignores=[]), "composite_ir", "exec"), namespace)
composite_ir = namespace["composite_ir"]


def b64(value):
    return base64.b64encode(value).decode()


def png(image):
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


randomizer = random.Random(1741)
images = {
    "base": Image.new("RGBA", (7, 6)),
    "top": Image.new("RGBA", (5, 5)),
}
for image in images.values():
    image.putdata([tuple(randomizer.randrange(256) for _ in range(4)) for _ in range(image.width * image.height)])
images["solid"] = Image.new("RGBA", (7, 6), (80, 90, 100, 255))


def part(name, z, left=0, top=0, opacity=255, polygon=None, visible=True):
    image = images[name]
    return {"id": name, "name": name, "z": z,
            "asset": {"path": name + ".png", "offset": {"left": left, "top": top},
                      "size": {"width": image.width, "height": image.height}},
            "geometry": {"bbox": [left, top, left + image.width, top + image.height],
                         **({"polygon": polygon} if polygon is not None else {})},
            "appearance": {"visible": visible, "opacity": opacity}, "semantic": {"tag": "FACE", "side": "none"}}


inputs = [
    ("integer crop", [part("solid", 0, polygon=[[1, 1], [4, 1], [4, 5], [1, 5]])]),
    ("fractional edge at pixel center", [part("solid", 0, polygon=[[1.5, .5], [3.5, .5], [3.5, 4.5], [1.5, 4.5]])]),
    ("self intersecting even odd", [part("solid", 0, polygon=[[0, 0], [6, 6], [6, 0], [0, 6]])]),
    ("RGBA stacking offsets opacity", [part("top", 8, 2, 1, 157), part("base", -2, -1, -1, 73)]),
    ("opaque foreground and off canvas", [part("base", 0, -2, 2), part("solid", 1, 3, -2)]),
    ("hidden and zero opacity", [part("base", 0, visible=False), part("top", 1, opacity=0)]),
]
cases = []
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for name, image in images.items():
        (root / (name + ".png")).write_bytes(png(image))
    for name, parts in inputs:
        ir = {"canvas": {"width": 8, "height": 7}, "parts": parts}
        reference = composite_ir(ir, root)
        cases.append({"name": name, "ir": ir, "rgba": b64(reference.tobytes()),
                      "bounds": reference.getchannel("A").getbbox()})

formats = []
for mode in ("RGBA", "RGB", "L", "LA", "1", "P"):
    image = Image.new(mode, (3, 2))
    if mode == "RGBA":
        image.putdata([(10, 99, 201, 1), (128, 13, 45, 77), (3, 4, 5, 255)] * 2)
    elif mode == "RGB":
        image.putdata([(1, 2, 3), (4, 5, 6), (90, 123, 45)] * 2)
        image.info["transparency"] = (4, 5, 6)
    elif mode == "LA":
        image.putdata([(10, 1), (99, 77), (255, 255)] * 2)
    else:
        image.putdata([0, 1, 0, 1, 0, 1] if mode in ("1", "P") else [0, 70, 255] * 2)
        if mode == "P":
            image.putpalette([10, 99, 201, 128, 13, 45] + [0] * 762)
            image.info["transparency"] = bytes([1, 77])
        elif mode == "L":
            image.info["transparency"] = 70
    formats.append({"mode": mode, "png": b64(png(image)), "rgba": b64(image.convert("RGBA").tobytes())})

destination = Path(__file__).with_name("artwork.json")
destination.write_text(json.dumps({"oracle": "Existing raster.py/composite_ir and Pillow " + Image.__version__,
    "assets": {name + ".png": b64(png(image)) for name, image in images.items()},
    "cases": cases, "formats": formats}, indent=2) + "\n")
