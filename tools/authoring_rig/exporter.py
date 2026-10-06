"""Export PSD file to authoring-rig intermediate representation (IR) and asset images."""
import datetime
import hashlib
import io
import json
import uuid
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from psd_tools.constants import BlendMode

from .classifier import classify_layer
from .identity import read_identities
from .validator import validate_authoring_rig

VERSION = "0.1.0"
TOOL_VERSION = "authoring_rig_exporter_0.1.0"


def inspect_psd(psd_path):
    """Report every unsupported layer before creating an output workspace."""
    psd = PSDImage.open(psd_path)
    issues = []
    def visit(layers, parent=""):
        for index, layer in enumerate(layers):
            location = f"{parent}/{index}:{layer.name}"
            reasons = []
            if layer.kind != "pixel": reasons.append(f"layer kind: {layer.kind}")
            if layer.has_mask(): reasons.append("raster mask")
            if layer.has_vector_mask(): reasons.append("vector mask")
            if layer.has_effects(): reasons.append("layer effects")
            if layer.clipping: reasons.append("clipping")
            if layer.blend_mode != BlendMode.NORMAL: reasons.append("non-normal blend")
            if layer.kind == "pixel" and layer.topil() is None: reasons.append("missing raster pixels")
            if reasons: issues.append({"location": location, "name": layer.name, "reasons": reasons})
            if layer.is_group(): visit(layer, location)
    if psd.width * psd.height > 16777216:
        issues.append({"location": "/", "name": "canvas", "reasons": ["canvas exceeds 16777216 pixels"]})
    visit(psd)
    return {"canvas": {"width": psd.width, "height": psd.height}, "layers": len(list(psd.descendants())), "issues": issues}


def export_psd(psd_path: str | Path, out_dir: str | Path) -> dict:
    psd_path = Path(psd_path).resolve()
    out_dir = Path(out_dir).resolve()
    psd = PSDImage.open(psd_path)
    w, h = psd.size
    report = inspect_psd(psd_path)
    if report["issues"]:
        details = "; ".join(f"{item['location']}: {', '.join(item['reasons'])}" for item in report["issues"])
        raise ValueError(f"Unsupported PSD layers: v0 requires flat, normal-blend pixel layers without masks, effects or clipping; {details}")
    mapping = read_identities(psd)
    native_ids = [layer.layer_id for layer in psd if layer.layer_id >= 0]
    if len(set(native_ids)) != len(native_ids):
        raise ValueError("PSD contains duplicate native layer IDs")
    source_file_hash = hashlib.sha256(psd_path.read_bytes()).hexdigest()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "assets").mkdir(parents=True, exist_ok=True)

    # Source composite hash
    composite_im = psd.composite()
    comp_buf = io.BytesIO()
    composite_im.save(comp_buf, format="PNG")
    source_hash = hashlib.sha256(comp_buf.getvalue()).hexdigest()

    parts = []
    # In psd-tools, iteration is bottom-to-top (z=0 is bottom layer)
    for z, layer in enumerate(psd):
        im = layer.topil()
        part_id = mapping.get(str(layer.layer_id)) or (
            f"psd_{layer.layer_id}" if layer.layer_id >= 0 else f"part_{uuid.uuid4().hex}")
        # Asset filenames are independent of human names and arbitrary IR IDs.
        asset_key = hashlib.sha256(part_id.encode("utf-8")).hexdigest()
        asset_rel_path = f"assets/{asset_key}.png"
        asset_full_path = out_dir / asset_rel_path

        im.save(asset_full_path, format="PNG")
        file_bytes = asset_full_path.read_bytes()
        sha = hashlib.sha256(file_bytes).hexdigest()

        left, top = layer.left, layer.top
        pw, ph = im.size
        right = left + pw
        bottom = top + ph

        tag, side, conf = classify_layer(layer.name)

        polygon = [
            [float(left), float(top)],
            [float(right), float(top)],
            [float(right), float(bottom)],
            [float(left), float(bottom)],
        ]

        part = {
            "id": part_id,
            "name": layer.name,
            "z": z,
            "appearance": {"visible": layer.visible, "opacity": layer.opacity},
            "asset": {
                "path": asset_rel_path,
                "sha256": sha,
                "size": {"width": pw, "height": ph},
                "offset": {"left": left, "top": top},
            },
            "geometry": {
                "bbox": [left, top, right, bottom],
                "polygon": polygon,
            },
            "semantic": {
                "tag": tag,
                "side": side,
                "confidence": conf,
            },
            "provenance": {
                "source": "psd-import",
                "toolVersion": TOOL_VERSION,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "upstreamHash": source_file_hash,
            },
        }
        parts.append(part)

    ir_data = {
        "schemaVersion": VERSION,
        "canvas": {"width": w, "height": h},
        "sourceImageHash": source_hash,
        "metadata": {
            "name": psd_path.stem,
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
        "parts": parts,
    }

    ir_file = out_dir / "authoring-rig.json"
    validate_authoring_rig(ir_data, base_dir=out_dir)
    ir_file.write_text(json.dumps(ir_data, indent=2, ensure_ascii=False), encoding="utf-8")

    return ir_data
