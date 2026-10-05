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


def export_psd(psd_path: str | Path, out_dir: str | Path) -> dict:
    psd_path = Path(psd_path).resolve()
    out_dir = Path(out_dir).resolve()
    psd = PSDImage.open(psd_path)
    w, h = psd.size
    # v0 supports flat raster PSDs. Never silently drop groups or change blending.
    for layer in psd:
        if (layer.kind != "pixel" or layer.has_mask() or layer.has_vector_mask()
                or layer.has_effects() or layer.clipping or layer.blend_mode != BlendMode.NORMAL):
            raise ValueError(f"Unsupported PSD layer '{layer.name}': v0 requires flat, normal-blend "
                             "pixel layers without masks, effects or clipping")
        if layer.topil() is None:
            raise ValueError(f"Layer '{layer.name}' has no raster pixels")
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
