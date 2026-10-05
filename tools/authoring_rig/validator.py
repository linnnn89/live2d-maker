"""Validator for authoring-rig.json intermediate representation.

Enforces:
1. Strict schema compliance (all required fields, types, enums).
2. RED LINE checks: strictly forbids any parameter, deformer, keyform, or physics fields.
3. Asset integrity: existence, dimensions, and SHA-256 validation.
4. Part ID and z-order uniqueness.
"""
import hashlib
import json
import re
import math
import datetime
from pathlib import Path
from PIL import Image

FORBIDDEN_KEYWORDS = {"parameter", "parameters", "deformer", "deformers", "keyform", "keyforms", "physics"}
SHA256_REGEX = re.compile(r"^[a-f0-9]{64}$")
SCHEMA_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "authoring-rig" / "authoring-rig.schema.json"


class ValidationError(Exception):
    pass


def _check_forbidden(obj, path=""):
    """Recursively check for forbidden rig/engine keys."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            current_path = f"{path}.{k}" if path else k
            if k.lower() in FORBIDDEN_KEYWORDS:
                raise ValidationError(
                    f"Red line violation: forbidden field '{k}' found at '{current_path}'. "
                    f"Authoring rig IR must not contain rigging engine concepts."
                )
            _check_forbidden(v, current_path)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _check_forbidden(item, f"{path}[{idx}]")
    elif isinstance(obj, float) and not math.isfinite(obj):
        raise ValidationError(f"Non-finite JSON number at '{path}'")


def validate_authoring_rig(data: dict, base_dir: Path | None = None) -> list[str]:
    """Validates an authoring-rig dictionary.

    Returns a list of warning/info messages if valid, or raises ValidationError.
    """
    # 1. Red-line check
    _check_forbidden(data)

    # A missing dependency or schema must never weaken validation.
    try:
        from jsonschema import Draft202012Validator, FormatChecker
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(data)
    except ImportError as e:
        raise ValidationError("jsonschema is required; install requirements-tools.txt in the project Python") from e
    except Exception as e:
        raise ValidationError(f"JSON Schema validation failed: {getattr(e, 'message', str(e))}") from e

    def check_timestamp(value):
        try:
            parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None or "T" not in value:
                raise ValueError("RFC3339 timestamp needs a time and timezone")
        except ValueError as e:
            raise ValidationError(f"Invalid timestamp: {value}") from e

    for key in ("createdAt", "updatedAt"):
        if key in data.get("metadata", {}):
            check_timestamp(data["metadata"][key])

    # 3. Native semantic check
    if data.get("schemaVersion") != "0.1.0":
        raise ValidationError(f"Invalid schemaVersion: {data.get('schemaVersion')}, expected '0.1.0'")

    canvas = data.get("canvas")
    if not isinstance(canvas, dict) or canvas.get("width", 0) <= 0 or canvas.get("height", 0) <= 0:
        raise ValidationError(f"Invalid canvas dimensions: {canvas}")

    src_hash = data.get("sourceImageHash")
    if not src_hash or not SHA256_REGEX.match(src_hash):
        raise ValidationError(f"Invalid sourceImageHash: {src_hash}")

    parts = data.get("parts")
    if not isinstance(parts, list):
        raise ValidationError("Missing or invalid 'parts' list")

    seen_ids = set()
    seen_z = set()

    for idx, part in enumerate(parts):
        pid = part.get("id")
        if not pid or not isinstance(pid, str):
            raise ValidationError(f"Part [{idx}] missing or invalid 'id'")
        if pid in seen_ids:
            raise ValidationError(f"Duplicate part id '{pid}' at index {idx}")
        seen_ids.add(pid)

        z = part.get("z")
        if z is None or not isinstance(z, int):
            raise ValidationError(f"Part '{pid}' missing integer 'z'")
        if z in seen_z:
            raise ValidationError(f"Duplicate z-index '{z}' on part '{pid}'")
        seen_z.add(z)

        # Asset validation
        asset = part.get("asset")
        if not isinstance(asset, dict):
            raise ValidationError(f"Part '{pid}' missing 'asset' object")
        rel_path = asset.get("path")
        expected_sha = asset.get("sha256")
        size = asset.get("size")
        offset = asset.get("offset")

        if not rel_path or not expected_sha or not size or not offset:
            raise ValidationError(f"Part '{pid}' asset missing required fields")

        if not SHA256_REGEX.match(expected_sha):
            raise ValidationError(f"Part '{pid}' asset has invalid sha256 hex: {expected_sha}")

        # If base_dir is given, check physical file
        if Path(rel_path).is_absolute() or Path(rel_path).drive:
            raise ValidationError(f"Part '{pid}' asset path must be relative: {rel_path}")
        if ".." in Path(rel_path).parts:
            raise ValidationError(f"Part '{pid}' asset path cannot escape the IR directory")
        if base_dir is not None:
            root = Path(base_dir).resolve()
            file_path = (root / rel_path).resolve()
            if not file_path.is_relative_to(root):
                raise ValidationError(f"Part '{pid}' asset resolves outside the IR directory")
            if not file_path.exists():
                raise ValidationError(f"Part '{pid}' asset file does not exist: {file_path}")
            file_bytes = file_path.read_bytes()
            real_sha = hashlib.sha256(file_bytes).hexdigest()
            if real_sha != expected_sha:
                raise ValidationError(
                    f"Part '{pid}' asset sha256 mismatch: recorded {expected_sha}, actual {real_sha}"
                )
            with Image.open(file_path) as image:
                if image.format != "PNG" or image.size != (size["width"], size["height"]):
                    raise ValidationError(f"Part '{pid}' asset PNG dimensions do not match asset.size")

        # Geometry validation
        geom = part.get("geometry")
        if not isinstance(geom, dict) or "bbox" not in geom:
            raise ValidationError(f"Part '{pid}' missing geometry.bbox")
        bbox = geom["bbox"]
        if len(bbox) != 4 or bbox[2] < bbox[0] or bbox[3] < bbox[1]:
            raise ValidationError(f"Part '{pid}' invalid bbox: {bbox}")
        expected_bbox = [offset["left"], offset["top"],
                         offset["left"] + size["width"], offset["top"] + size["height"]]
        if bbox != expected_bbox:
            raise ValidationError(f"Part '{pid}' geometry.bbox must agree with asset size and offset")

        # Semantic validation
        sem = part.get("semantic")
        if not isinstance(sem, dict) or "tag" not in sem or "side" not in sem:
            raise ValidationError(f"Part '{pid}' missing semantic tag or side")
        if sem["side"] not in ("none", "left", "right"):
            raise ValidationError(f"Part '{pid}' invalid semantic side: {sem['side']}")

        # Provenance validation
        prov = part.get("provenance")
        if not isinstance(prov, dict) or "source" not in prov or "timestamp" not in prov:
            raise ValidationError(f"Part '{pid}' missing provenance")
        check_timestamp(prov["timestamp"])

    return [f"Validated {len(parts)} part(s) successfully."]
