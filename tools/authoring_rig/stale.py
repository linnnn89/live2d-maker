"""Pipeline DAG stale evaluation and Overlay compatibility checks.

DAG pipeline:
    source -> segmentation -> IR -> PSD -> PSD2Live base rig -> Overlay apply -> moc3 -> review

Rules (docs/PLAN.md Section 1 P4):
    - Changing polygon or raster asset: PSD and all downstream stages stale.
    - Changing z-order: PSD and all downstream stages stale.
    - Changing semantic only: PSD2Live and downstream stale; PSD is NOT stale.
    - Changing view state or metadata: NOT stale.
    - Overlay status: 'ok' | 'needs-review' | 'broken'. Unresolvable targets or
      topology mismatches mark the overlay as broken and must NOT be silently applied.
"""
import hashlib
import json
import math


def _canonical_hash(obj) -> str:
    """Compute deterministic SHA-256 hash of a JSON-serializable object."""
    encoded = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def compute_signatures(ir_data: dict) -> dict:
    """Computes categorized signatures for an IR dictionary.

    Groups:
        - psd: canvas dimensions, layer names, z-order, asset details, geometry.
        - semantic: semantic tags and sides per part.
        - view_meta: metadata and provenance (does not affect model output).
    """
    canvas = ir_data.get("canvas", {})
    parts = ir_data.get("parts", [])

    psd_payload = {
        "canvas": canvas,
        "parts": [
            {
                "id": p["id"],
                "name": p["name"],
                "z": p["z"],
                "asset": p["asset"],
                "geometry": p["geometry"],
                "appearance": p.get("appearance", {"visible": True, "opacity": 255}),
            }
            for p in sorted(parts, key=lambda x: x.get("z", 0))
        ],
    }

    semantic_payload = {
        "parts": [
            {
                "id": p["id"],
                "semantic": p.get("semantic", {}),
            }
            for p in sorted(parts, key=lambda x: x.get("id", ""))
        ]
    }

    view_meta_payload = {
        "metadata": ir_data.get("metadata", {}),
        "provenance": [p.get("provenance", {}) for p in parts],
    }

    return {
        "source": _canonical_hash(ir_data.get("sourceImageHash")),
        "psd": _canonical_hash(psd_payload),
        "semantic": _canonical_hash(semantic_payload),
        "view_meta": _canonical_hash(view_meta_payload),
    }


def evaluate_dag_stale(old_ir: dict, new_ir: dict) -> dict:
    """Evaluates which stages of the DAG are stale between two IR revisions."""
    old_sigs = compute_signatures(old_ir)
    new_sigs = compute_signatures(new_ir)

    psd_changed = old_sigs["psd"] != new_sigs["psd"]
    source_changed = old_sigs["source"] != new_sigs["source"]
    semantic_changed = old_sigs["semantic"] != new_sigs["semantic"]

    reasons = {
        "segmentation": [],
        "ir": [],
        "psd": [],
        "base_rig": [],
        "overlay_apply": [],
        "moc3": [],
        "review": [],
    }

    # Detailed breakdown of changes
    if source_changed:
        for stage in reasons:
            reasons[stage].append("Source image changed; downstream artifacts require regeneration.")
    old_parts = {p["id"]: p for p in old_ir.get("parts", [])}
    new_parts = {p["id"]: p for p in new_ir.get("parts", [])}

    # Check canvas
    if old_ir.get("canvas") != new_ir.get("canvas"):
        reasons["psd"].append(f"Canvas size changed: {old_ir.get('canvas')} -> {new_ir.get('canvas')}")

    # Check part additions/removals
    added = set(new_parts) - set(old_parts)
    removed = set(old_parts) - set(new_parts)
    if added:
        reasons["psd"].append(f"Parts added: {sorted(added)}")
    if removed:
        reasons["psd"].append(f"Parts removed: {sorted(removed)}")

    for pid in set(old_parts) & set(new_parts):
        op = old_parts[pid]
        np_ = new_parts[pid]

        if op.get("name") != np_.get("name"):
            reasons["psd"].append(f"Part '{pid}' renamed: {op.get('name')} -> {np_.get('name')}")
        if op.get("z") != np_.get("z"):
            reasons["psd"].append(f"Part '{pid}' z-order changed: {op.get('z')} -> {np_.get('z')}")
        if op.get("asset") != np_.get("asset"):
            reasons["psd"].append(f"Part '{pid}' asset changed")
        if op.get("geometry") != np_.get("geometry"):
            reasons["psd"].append(f"Part '{pid}' geometry/polygon changed")
        if op.get("appearance") != np_.get("appearance"):
            reasons["psd"].append(f"Part '{pid}' visibility or opacity changed")

        if op.get("semantic") != np_.get("semantic"):
            reasons["base_rig"].append(
                f"Part '{pid}' semantic changed: {op.get('semantic')} -> {np_.get('semantic')}"
            )

    # DAG propagation
    is_psd_stale = psd_changed or source_changed
    is_base_rig_stale = is_psd_stale or semantic_changed
    is_overlay_stale = is_base_rig_stale
    is_moc3_stale = is_overlay_stale
    is_review_stale = is_moc3_stale

    if psd_changed:
        for stage in ("base_rig", "overlay_apply", "moc3", "review"):
            reasons[stage].append("Upstream PSD stage is stale.")
    elif semantic_changed:
        for stage in ("overlay_apply", "moc3", "review"):
            reasons[stage].append("Upstream base_rig stage is stale.")

    return {
        "stale": {
            "segmentation": source_changed,
            "ir": source_changed,
            "psd": is_psd_stale,
            "base_rig": is_base_rig_stale,
            "overlay_apply": is_overlay_stale,
            "moc3": is_moc3_stale,
            "review": is_review_stale,
        },
        "signatures": {
            "old": old_sigs,
            "new": new_sigs,
        },
        "reasons": reasons,
    }


_TARGET_KINDS = {
    "art_mesh": "art_mesh", "artmesh": "art_mesh", "drawable": "art_mesh", "mesh": "art_mesh",
    "warp_deformer": "warp", "warpdeformer": "warp", "warp": "warp",
    "rotation_deformer": "rotation", "rotationdeformer": "rotation", "rotation": "rotation",
    "part": "part", "glue": "glue",
}


def _target_key(target):
    if isinstance(target, str):
        kind, _, tid = target.partition(":")
        target = {"kind": kind, "id": tid}
    if not isinstance(target, dict):
        raise ValueError("Target must be a RigTargetRef object or kind:id")
    kind = _TARGET_KINDS.get(str(target.get("kind", "")).lower())
    tid = target.get("id")
    if kind is None or not isinstance(tid, str) or not tid.strip():
        raise ValueError(f"Invalid RigTargetRef: {target}")
    secondary = target.get("secondaryId")
    if kind == "glue" and (not isinstance(secondary, str) or not secondary.strip()):
        raise ValueError("Glue requires secondaryId")
    return kind, tid, secondary if kind == "glue" else None


def check_overlay_compatibility(overlay: dict, ir_data: dict, base_objects=None) -> dict:
    """Conservative preflight against native rig_get_object snapshots.

    IR parts cannot resolve rig IDs: RigBuilder derives ArtMesh IDs from semantics.
    Missing native evidence is needs-review, never inferred from a layer name.
    Counts alone cannot establish ArtMesh vertex ordering or triangle topology.
    Native applyTo + RigIntegrityValidator remain the final application gate.
    """
    overlay = overlay.get("rigEdits", overlay)
    if not isinstance(overlay, dict):
        raise ValueError("Overlay must be an object")
    broken, review = [], []
    objects = {}
    introduced = set()
    if base_objects is not None:
        if not isinstance(base_objects, list):
            raise ValueError("base-objects must be a complete array of rig_get_object snapshots")
        for obj in base_objects:
            key = _target_key(obj["target"])
            if key in objects:
                raise ValueError(f"Duplicate base rig target: {key}")
            objects[key] = obj

    def resolve(target, context):
        try:
            key = _target_key(target)
        except ValueError as error:
            broken.append(f"{context}: {error}")
            return None, None
        if base_objects is None:
            review.append(f"{context}: {key} cannot be resolved without native base rig snapshots")
        elif key not in objects:
            if key in introduced:
                review.append(f"{context}: journal-created target {key} requires ordered native validation")
            else:
                broken.append(f"{context}: target {key} not found in base rig")
        return key, objects.get(key)

    def geometry_check(edit, key, obj, context):
        geo = edit.get("geometry") or {}
        if not isinstance(geo, dict):
            broken.append(f"{context}: geometry must be an object")
            return
        allowed = {"positionDeltas", "position_deltas", "controlPoints", "control_points", "originX", "originY", "angle", "scale"}
        if set(geo) - allowed:
            review.append(f"{context}: unsupported geometry fields {sorted(set(geo) - allowed)}")
        for field in ("positionDeltas", "position_deltas", "controlPoints", "control_points"):
            values = geo.get(field)
            if values is None:
                continue
            if (not isinstance(values, list) or not values or len(values) % 2
                    or any(type(v) not in (int, float) or not math.isfinite(v) for v in values)):
                broken.append(f"{context}: invalid or odd {field} array")
                continue
            mesh = field in ("positionDeltas", "position_deltas")
            if key and key[0] != ("art_mesh" if mesh else "warp"):
                broken.append(f"{context}: {field} is incompatible with target kind {key[0]}")
            topology = (obj or {}).get("topologyInfo", {})
            count = topology.get("vertexCount" if mesh else "controlPointsCount")
            if count is not None and len(values) != 2 * int(count):
                broken.append(f"{context}: {field} size mismatch: expected {2 * int(count)}, got {len(values)}")
            # Even matching counts leave topology/rest geometry unproven after rebuild.
            review.append(f"{context}: geometry needs native topology/rest-shape review")
        if geo and not any(field in geo for field in ("positionDeltas", "position_deltas", "controlPoints", "control_points")):
            review.append(f"{context}: rotation geometry needs native rest-shape review")

    known = set()
    sections = (
        (("keyformSets", "keyformSetEdits", "keyform_sets"), ("target",)),
        (("keyformDeletes", "keyformDeleteEdits", "keyform_deletes"), ("target",)),
        (("keyformCopies", "keyformCopyEdits", "keyform_copies"), ("sourceTarget", "destinationTarget")),
    )
    for aliases, fields in sections:
        known.update(aliases)
        present = [name for name in aliases if name in overlay]
        if len(present) > 1:
            broken.append(f"Conflicting Overlay sections: {present}")
        for name in present:
            edits = overlay[name]
            if not isinstance(edits, list):
                broken.append(f"{name} must be an array")
                continue
            for idx, edit in enumerate(edits):
                context = f"{name}[{idx}]"
                if not isinstance(edit, dict):
                    broken.append(f"{context}: edit must be an object")
                    continue
                coordinates = ("coordinate",) if name in sections[0][0] else (
                    ("sourceCoordinate", "destinationCoordinate") if name in sections[2][0] else ())
                for field in coordinates:
                    values = edit.get(field)
                    if (not isinstance(values, dict) or not values
                            or any(not isinstance(k, str) or not k.strip() or type(v) not in (int, float)
                                   or not math.isfinite(v) for k, v in values.items())):
                        broken.append(f"{context}: invalid {field}")
                if name in sections[0][0] and not (edit.get("geometry") or edit.get("channels")):
                    broken.append(f"{context}: keyform set requires geometry or channels")
                if name in sections[1][0] and not edit.get("parameterId"):
                    broken.append(f"{context}: keyform delete requires parameterId")
                for field in fields:
                    target = edit.get(field, edit.get("sourceTarget") if field == "destinationTarget" else None)
                    key, obj = resolve(target, f"{context}.{field}")
                    if field == "target":
                        geometry_check(edit, key, obj, context)
    known.add("authoringJournal")
    if not isinstance(overlay.get("authoringJournal", []), list):
        raise ValueError("authoringJournal must be an array")
    for idx, edit in enumerate(overlay.get("authoringJournal", [])):
        context = f"authoringJournal[{idx}]"
        if not isinstance(edit, dict):
            raise ValueError("Journal edit must be an object")
        for field in ("target", "destination"):
            if field in edit:
                key, obj = resolve(edit[field], f"{context}.{field}")
                if field == "target":
                    geometry_check(edit, key, obj, context)
        review.append(f"{context}: ordered journal requires native replay validation")
        creations = [edit.get("warp")] if edit.get("op") == "warp" else (
            [entry for entry in edit.get("edits", []) if isinstance(entry, dict) and entry.get("action") == "create_warp"]
            if edit.get("op") == "structure" and isinstance(edit.get("edits"), list) else [])
        for creation in creations:
            if isinstance(creation, dict) and isinstance(creation.get("id"), str) and creation["id"].strip():
                introduced.add(("warp", creation["id"], None))
    for name in set(overlay) - known:
        if overlay[name]:
            review.append(f"{name}: requires native validation; not covered by target preflight")
    status = "broken" if broken else "needs-review" if review else "ok"
    return {"status": status, "native_apply_required": True,
            "broken_targets": broken, "review_targets": review,
            "reasons": broken + review}
