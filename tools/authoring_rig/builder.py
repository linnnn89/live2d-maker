"""Build PSD file from authoring-rig intermediate representation (IR) and asset images."""
import hashlib
import json
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from .identity import write_identities
from .validator import validate_authoring_rig
from .raster import clip_polygon


def build_psd(ir_path: str | Path, out_psd_path: str | Path) -> dict:
    ir_path = Path(ir_path).resolve()
    base_dir = ir_path.parent
    out_psd_path = Path(out_psd_path).resolve()
    data = json.loads(ir_path.read_text(encoding="utf-8"))
    validate_authoring_rig(data, base_dir=base_dir)
    out_psd_path.parent.mkdir(parents=True, exist_ok=True)
    canvas = data["canvas"]
    w, h = canvas["width"], canvas["height"]

    parts = sorted(data.get("parts", []), key=lambda p: p["z"])

    new_psd = PSDImage.new(mode="RGBA", size=(w, h))

    built_layers = []
    identities = []
    for part in parts:
        asset_info = part["asset"]
        asset_file = base_dir / asset_info["path"]
        if not asset_file.exists():
            raise FileNotFoundError(f"Asset file not found: {asset_file}")

        file_bytes = asset_file.read_bytes()
        actual_sha = hashlib.sha256(file_bytes).hexdigest()
        if actual_sha != asset_info["sha256"]:
            raise ValueError(
                f"Asset sha256 mismatch for part '{part['id']}': expected {asset_info['sha256']}, got {actual_sha}"
            )

        with Image.open(asset_file) as asset_image:
            im = clip_polygon(asset_image.convert("RGBA"), part)
        left = asset_info["offset"]["left"]
        top = asset_info["offset"]["top"]

        layer = new_psd.create_pixel_layer(
            im,
            name=part["name"],
            left=left,
            top=top,
        )
        appearance = part.get("appearance", {})
        layer.visible = appearance.get("visible", True)
        layer.opacity = appearance.get("opacity", 255)
        identities.append((layer, part))
        built_layers.append({"name": part["name"], "z": part["z"], "offset": [left, top],
                             "partId": part["id"], "sourceLayerId": f"lyid:{len(identities)}"})

    write_identities(new_psd, identities)
    new_psd.save(out_psd_path)

    return {
        "status": "ok",
        "canvas": [w, h],
        "layers_built": len(built_layers),
        "output_psd": str(out_psd_path),
        "layers": built_layers,
    }
