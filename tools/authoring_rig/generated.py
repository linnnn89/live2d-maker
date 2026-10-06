"""Import a transparent ImageGen sprite with explicit placement and strict mask bounds.

Image generation is performed by the caller. This module never calls an API, clips
to a mask, paints artwork, or introduces animation fields into the artwork IR.
"""
import copy
import datetime
import hashlib
import io
import json
import shutil
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from .classifier import classify_layer
from .validator import validate_authoring_rig
from .raster import clip_polygon


def pixel_bounds(pixels):
    ys, xs = np.nonzero(pixels)
    return [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None


def png_bytes(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def composite_ir(data, root, replacement=None):
    """Render flat normal-blend artwork for the before/after mask invariant."""
    image = Image.new("RGBA", (data["canvas"]["width"], data["canvas"]["height"]))
    for part in sorted(data["parts"], key=lambda p: p["z"]):
        appearance = part.get("appearance", {"visible": True, "opacity": 255})
        if not appearance["visible"]:
            continue
        if replacement is not None and part["id"] == replacement[0]:
            layer = replacement[1].copy()
        else:
            with Image.open(root / part["asset"]["path"]) as asset:
                layer = asset.convert("RGBA")
        layer = clip_polygon(layer, part)
        if appearance["opacity"] != 255:
            opacity = appearance["opacity"]
            layer.putalpha(layer.getchannel("A").point(lambda a: round(a * opacity / 255)))
        offset = part["asset"]["offset"]
        image.alpha_composite(layer, (offset["left"], offset["top"]))
    return image


def import_generated(ir_path, generated_path, mask_path, bounds, name, prompt_path,
                     out_dir, replace_part=None, fit=False, sprite_bounds=None, origin=None):
    ir_path = Path(ir_path).resolve(strict=True)
    root = ir_path.parent
    data = json.loads(ir_path.read_text(encoding="utf-8"))
    validate_authoring_rig(data, base_dir=root)
    out = Path(out_dir).resolve()
    # A new directory preserves all inputs and prevents stale/success artifacts.
    if out.exists():
        raise ValueError("Generated import output must be a new directory")
    if out.is_relative_to(root):
        raise ValueError("Generated import output must be outside the source IR directory")
    width, height = data["canvas"]["width"], data["canvas"]["height"]
    if len(bounds) != 4 or any(type(v) is not int for v in bounds):
        raise ValueError("bounds must contain four integer canvas coordinates")
    left, top, right, bottom = bounds
    if not (0 <= left < right <= width and 0 <= top < bottom <= height):
        raise ValueError("bounds must be a nonempty rectangle inside the canvas")
    tag, side, confidence = classify_layer(name)
    if tag == "UNKNOWN":
        raise ValueError("Generated layer name must have a recognized PSD2Live semantic")
    # Legacy callers remain AI imports. Manual/external artwork has an explicit
    # source record and never needs a fabricated generation prompt.
    if origin is None:
        if not prompt_path: raise ValueError("Provide --origin-file or a legacy --prompt-file")
        prompt = Path(prompt_path).read_text(encoding="utf-8")
        origin = {"kind": "ai", "description": "Legacy generated artwork", "prompt": prompt}
    from .studio_protocol import validate_protocol
    validate_protocol("AssetOrigin", origin)
    if not origin["description"].strip() or (origin["kind"] == "ai" and not origin["prompt"].strip()):
        raise ValueError("Asset source description / AI prompt cannot be empty")
    prompt = origin.get("prompt", "")
    with Image.open(mask_path) as mask_image:
        if mask_image.format != "PNG" or mask_image.mode not in ("L", "1"):
            raise ValueError("Mask must be a grayscale binary PNG (0 protected, 255 editable)")
        if mask_image.size != (width, height):
            raise ValueError("Mask size must equal the IR canvas")
        mask = np.asarray(mask_image.convert("L"))
    if not np.isin(mask, [0, 255]).all() or not (mask == 255).any() or not (mask == 0).any():
        raise ValueError("Local mask must contain protected/editable pixels and only values 0/255")
    with Image.open(generated_path) as generated:
        if generated.format != "PNG" or generated.mode != "RGBA":
            raise ValueError("Generated sprite must be an RGBA PNG with genuine transparency")
        layer = generated.copy()
    alpha_bbox = layer.getchannel("A").getbbox()
    if alpha_bbox is None or layer.getchannel("A").getextrema()[0] != 0:
        raise ValueError("Generated sprite must have visible artwork and transparent background")
    registration = {"input_size": list(layer.size), "alpha_bbox": list(alpha_bbox), "fit": fit}
    if sprite_bounds is not None:
        if (len(sprite_bounds) != 4 or any(type(v) is not int for v in sprite_bounds)
                or not (0 <= sprite_bounds[0] < sprite_bounds[2] <= layer.width
                        and 0 <= sprite_bounds[1] < sprite_bounds[3] <= layer.height)):
            raise ValueError("sprite-bounds must be an integer rectangle inside the generated PNG")
        excluded = np.asarray(layer.getchannel("A")).copy()
        excluded[sprite_bounds[1]:sprite_bounds[3], sprite_bounds[0]:sprite_bounds[2]] = 0
        registration.update({"sprite_bounds": list(sprite_bounds),
                             "excluded_visible_pixels": int((excluded != 0).sum()),
                             "excluded_max_alpha": int(excluded.max())})
        layer = layer.crop(sprite_bounds)
        alpha_bbox = layer.getchannel("A").getbbox()
        if alpha_bbox is None:
            raise ValueError("sprite-bounds contains no visible artwork")
    size = (right - left, bottom - top)
    if fit:
        # Explicit opt-in registration; preserve aspect ratio and selected alpha.
        content = ImageOps.contain(layer.crop(alpha_bbox), size, Image.Resampling.LANCZOS)
        layer = Image.new("RGBA", size)
        layer.paste(content, ((size[0] - content.width) // 2, (size[1] - content.height) // 2))
        registration["fitted_size"] = list(content.size)
    elif layer.size != size:
        raise ValueError("Sprite size must equal bounds; use --fit for explicit alpha-crop/aspect-fit registration")
    registered = Image.new("RGBA", (width, height))
    registered.paste(layer, (left, top))
    outside = mask == 0
    outside_alpha = int(((np.asarray(registered)[:, :, 3] != 0) & outside).sum())
    if outside_alpha:
        area = pixel_bounds((np.asarray(registered)[:, :, 3] != 0) & outside)
        raise ValueError(f"Sprite has {outside_alpha} visible pixels outside the mask at canvas bounds {area}; extend the editable area or adjust placement")
    new = copy.deepcopy(data)
    if replace_part is not None:
        matches = [p for p in new["parts"] if p["id"] == replace_part]
        if len(matches) != 1:
            raise ValueError("replace-part must identify exactly one existing part")
        part = matches[0]
        if part.get("appearance", {}).get("visible", True) is False:
            raise ValueError("Cannot replace a hidden part in this visible generation workflow")
    else:
        part = {"id": f"part_{uuid.uuid4().hex}", "z": max((p["z"] for p in new["parts"]), default=-1) + 1,
                "appearance": {"visible": True, "opacity": 255}}
        new["parts"].append(part)
    if any(p["id"] != part["id"] and p["name"] == name for p in new["parts"]):
        raise ValueError("Generated layer name conflicts with another part")
    raw = png_bytes(layer)
    asset_key = hashlib.sha256(part["id"].encode()).hexdigest()
    part.update({"name": name,
                 "asset": {"path": f"assets/generated-{asset_key}.png", "sha256": hashlib.sha256(raw).hexdigest(),
                           "size": {"width": size[0], "height": size[1]}, "offset": {"left": left, "top": top}},
                 "geometry": {"bbox": list(bounds), "polygon": [[left, top], [right, top], [right, bottom], [left, bottom]]},
                 "semantic": {"tag": tag, "side": side, "confidence": confidence},
                 "provenance": {"source": {"ai": "imagegen", "manual": "manual", "external": "external"}[origin["kind"]],
                                "description": origin["description"], **({"prompt": prompt} if origin["kind"] == "ai" else {}),
                                "toolVersion": "authoring_rig_generated_0.2.0",
                                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                "upstreamHash": hashlib.sha256(Path(generated_path).read_bytes()).hexdigest()}})
    validate_authoring_rig(new)
    before = composite_ir(data, root)
    after = composite_ir(new, root, (part["id"], layer))
    delta = np.abs(np.asarray(after).astype(int) - np.asarray(before).astype(int))
    changed = np.any(delta != 0, axis=2)
    outside_diff = int((changed & outside).sum())
    if outside_diff:
        area = pixel_bounds(changed & outside)
        raise ValueError(f"Artwork replacement changes {outside_diff} pixels outside the mask at canvas bounds {area}; include the removed artwork in the editable area")
    if not changed.any():
        raise ValueError("Generated artwork produces no visible composite change")
    report = {"status": "ok", "action": "import-generated", "part_id": part["id"],
              "ir_file": str(out / "authoring-rig.json"), "bounds": list(bounds), "registration": registration,
              "mask_sha256": hashlib.sha256(Path(mask_path).read_bytes()).hexdigest(),
              "source": origin,
              **({"prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest()} if origin["kind"] == "ai" else {}),
              "outside_visible_pixels": outside_alpha, "outside_changed_pixels": outside_diff,
              "outside_max_diff": int(delta[outside].max()) if outside.any() else 0,
              "changed_pixels": int(changed.sum()), "changed_bounds": pixel_bounds(changed), "max_diff": int(delta.max()),
              "visual_acceptance": "pending native export and Pose QA"}
    out.mkdir(parents=True)
    for original in data["parts"]:
        destination = out / original["asset"]["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / original["asset"]["path"], destination)
    asset_path = out / part["asset"]["path"]
    asset_path.parent.mkdir(parents=True, exist_ok=True)
    asset_path.write_bytes(raw)
    validate_authoring_rig(new, base_dir=out)
    (out / "authoring-rig.json").write_text(json.dumps(new, indent=2, ensure_ascii=False), encoding="utf-8")
    before.save(out / "before.png")
    after.save(out / "after.png")
    shutil.copyfile(mask_path, out / "generation-mask.png")
    shutil.copyfile(generated_path, out / "generation-original.png")
    if origin["kind"] == "ai": (out / "generation-prompt.txt").write_text(prompt, encoding="utf-8")
    (out / "asset-source.json").write_text(json.dumps(origin, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "generation-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
