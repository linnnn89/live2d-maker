"""Import cropped PNG layers from a source-manifest; keep rig data outside IR."""
import datetime
import hashlib
import io
import json
import uuid
from pathlib import Path

from PIL import Image

from .classifier import classify_layer
from .exporter import TOOL_VERSION, VERSION
from .validator import validate_authoring_rig


def export_manifest(manifest_path, out_dir):
    source = Path(manifest_path).resolve()
    root = source.parent
    out = Path(out_dir).resolve()
    raw = source.read_bytes()
    doc = json.loads(raw)
    allowed = {"canvas", "layers", "character", "artRevision", "layerCount", "sourceArtwork"}
    if not isinstance(doc, dict) or set(doc) - allowed:
        raise ValueError("Unsupported manifest fields; expected canvas/layers source-manifest")
    canvas = doc.get("canvas")
    if (not isinstance(canvas, list) or len(canvas) != 2
            or any(type(v) is not int or v <= 0 for v in canvas)):
        raise ValueError("Manifest canvas must be [positive integer width, height]")
    layers = doc.get("layers")
    if not isinstance(layers, list) or not layers:
        raise ValueError("Manifest layers must be a nonempty array in bottom-to-top order")
    if "layerCount" in doc and (type(doc["layerCount"]) is not int or doc["layerCount"] != len(layers)):
        raise ValueError("Manifest layerCount does not match layers")
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    upstream = hashlib.sha256(raw).hexdigest()
    composite = Image.new("RGBA", tuple(canvas))
    parts, assets = [], []
    for z, layer in enumerate(layers):
        allowed_layer = {"id", "name", "path", "bounds", "geometry", "semantic", "appearance", "provenance"}
        if not isinstance(layer, dict) or set(layer) - allowed_layer:
            raise ValueError(f"Unsupported manifest layer fields at index {z}")
        name, bounds = layer.get("name"), layer.get("bounds")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"Manifest layer {z} needs a name")
        if (not isinstance(bounds, list) or len(bounds) != 4
                or any(type(v) is not int for v in bounds)
                or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]):
            raise ValueError(f"Invalid bounds for {name}")
        rel = layer.get("path", f"{name}.png")
        if (not isinstance(rel, str) or not rel.strip() or Path(rel).is_absolute()
                or Path(rel).drive or ".." in Path(rel).parts):
            raise ValueError(f"PNG path must be relative for {name}")
        asset_path = (root / rel).resolve()
        if not asset_path.is_relative_to(root):
            raise ValueError(f"PNG path escapes manifest directory for {name}")
        data = asset_path.read_bytes()
        with Image.open(io.BytesIO(data)) as image:
            if image.format != "PNG":
                raise ValueError(f"Manifest asset is not PNG: {rel}")
            im = image.convert("RGBA")
        left, top, right, bottom = bounds
        if im.size != (right - left, bottom - top):
            raise ValueError(f"PNG dimensions do not match bounds for {name}: {im.size} vs {bounds}")
        pid = layer.get("id", f"part_{uuid.uuid4().hex}")
        if not isinstance(pid, str) or not pid.strip():
            raise ValueError(f"Invalid stable ID for {name}")
        asset_rel = f"assets/{hashlib.sha256(pid.encode('utf-8')).hexdigest()}.png"
        tag, side, confidence = classify_layer(name)
        appearance = layer.get("appearance", {"visible": True, "opacity": 255})
        part = {
            "id": pid, "name": name, "z": z, "appearance": appearance,
            "asset": {"path": asset_rel, "sha256": hashlib.sha256(data).hexdigest(),
                      "size": {"width": im.width, "height": im.height},
                      "offset": {"left": left, "top": top}},
            "geometry": layer.get("geometry", {"bbox": bounds, "polygon": [[left, top], [right, top], [right, bottom], [left, bottom]]}),
            "semantic": layer.get("semantic", {"tag": tag, "side": side, "confidence": confidence}),
            "provenance": layer.get("provenance", {"source": "manual", "toolVersion": TOOL_VERSION,
                                                   "timestamp": timestamp, "upstreamHash": upstream}),
        }
        parts.append(part)
        assets.append((asset_rel, data, im))
    # Validate all input before creating output; duplicate IDs and malformed optional fields fail here.
    ir = {"schemaVersion": VERSION, "canvas": {"width": canvas[0], "height": canvas[1]},
          "sourceImageHash": "0" * 64,
          "metadata": {"name": doc.get("character", source.stem), "createdAt": timestamp}, "parts": parts}
    validate_authoring_rig(ir)
    for part, (_, _, image) in zip(parts, assets):
        appearance = part["appearance"]
        if appearance.get("visible", True):
            image = image.copy()
            opacity = appearance.get("opacity", 255)
            image.putalpha(image.getchannel("A").point(lambda value: value * opacity // 255))
            composite.alpha_composite(image, (part["asset"]["offset"]["left"], part["asset"]["offset"]["top"]))
    buffer = io.BytesIO()
    composite.save(buffer, format="PNG")
    ir["sourceImageHash"] = hashlib.sha256(buffer.getvalue()).hexdigest()
    out.mkdir(parents=True, exist_ok=True)
    (out / "assets").mkdir(exist_ok=True)
    for rel, data, _ in assets:
        (out / rel).write_bytes(data)
    validate_authoring_rig(ir, out)
    (out / "authoring-rig.json").write_text(json.dumps(ir, ensure_ascii=False, indent=2), encoding="utf-8")
    return ir
