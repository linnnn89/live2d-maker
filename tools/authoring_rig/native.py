"""Replay supported keyform edits through the bundled PSD2Live, never a Python rig engine.

Full native model fingerprints include ordered vertices, UVs, triangles, rest geometry,
deformer chains and keyform grids. Equality is deliberately conservative after rebuild.
"""
import hashlib
import json
import math
from pathlib import Path

from .stale import _target_key, check_overlay_compatibility

ROOT = Path(__file__).resolve().parents[2]


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def start_native(native_jar=None):
    import jpype
    home = ROOT / "portable/PSD2Live"
    jars = sorted((home / "app").glob("*.jar"))
    jvm = home / "runtime/bin/server/jvm.dll"
    if not jvm.exists() or not jars:
        raise FileNotFoundError("Bundled PSD2Live runtime/app missing; no runtime will be downloaded")
    if native_jar is None:
        packaged = ROOT / "dependencies/native/psd2live-0.7.1.jar"
        if packaged.is_file():
            native_jar = packaged
    if native_jar is not None:
        from zipfile import ZipFile
        source_jar = Path(native_jar).resolve(strict=True)
        with ZipFile(source_jar) as archive:
            if "io/github/psd2live/core/PSD2LivePipeline.class" not in archive.namelist():
                raise ValueError("native-jar must be a built PSD2Live application JAR")
        # Replace only the application; dependency JARs and JVM remain pinned and untouched.
        jars = [source_jar] + [p for p in jars if not p.name.startswith("psd2live-")]
    resources = ROOT / "dependencies/native/cubism-runtime.jar"
    if resources.is_file():
        jars.append(resources)
    if jpype.isJVMStarted():
        raise RuntimeError("Native CLI requires a fresh process to pin the bundled JVM/classpath")
    jpype.startJVM(str(jvm), "-Djava.awt.headless=true", classpath=[str(p) for p in jars], convertStrings=True)
    jpype.JClass("java.lang.System").setOut(jpype.JClass("java.lang.System").err)
    runtime = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in jars}
    runtime["jvm.dll"] = hashlib.sha256(jvm.read_bytes()).hexdigest()
    return jpype, runtime


def getter(obj, prefix):
    methods = [m for m in obj.getClass().getMethods()
               if str(m.getName()).split("-")[0] == prefix and m.getParameterCount() == 0]
    if len(methods) != 1:
        raise ValueError(f"Native getter {prefix} missing or ambiguous in {obj.getClass().getName()}")
    return methods[0].invoke(obj)


def plain(obj, jp):
    """Serialize immutable native model values including primitive arrays; no toString geometry."""
    if obj is None or isinstance(obj, (str, bool, int, float)):
        return obj
    if isinstance(obj, jp.JClass("java.lang.Number")):
        return float(obj.doubleValue())
    if isinstance(obj, jp.JClass("java.lang.Boolean")):
        return bool(obj.booleanValue())
    if isinstance(obj, jp.JClass("java.lang.String")):
        return str(obj)
    cls = obj.getClass()
    if cls.isEnum():
        return str(obj.name())
    if cls.isArray() or isinstance(obj, jp.JClass("java.util.Collection")):
        return [plain(v, jp) for v in obj]
    if isinstance(obj, jp.JClass("java.util.Map")):
        return sorted([[plain(e.getKey(), jp), plain(e.getValue(), jp)] for e in obj.entrySet()], key=lambda e: json.dumps(e[0], sort_keys=True))
    if not str(cls.getName()).startswith("org.umamo.runtime.model."):
        raise ValueError(f"Unsupported native snapshot value: {cls.getName()}")
    values = {"type": str(cls.getName())}
    for m in cls.getMethods():
        name = str(m.getName()).split("-")[0]
        if (m.getParameterCount() == 0 and name.startswith(("get", "is"))
                and name not in {"getClass", "getCellsByLinearIndex", "getPartById"}):
            if name in values:
                raise ValueError(f"Duplicate native snapshot getter {name}")
            values[name] = plain(m.invoke(obj), jp)
    return values


def config_for(jp, overlay=None):
    config = jp.JClass("io.github.psd2live.core.PipelineConfig")()
    # Fixed configuration is part of the native-baseline contract; no dynamic option copying.
    overrides = {"atlasSize": jp.JInt(2048), "meshSpacing": jp.JInt(24),
                 "generatePhysics": jp.JBoolean(False), "exportCmo3": jp.JBoolean(False),
                 "exportMotions": jp.JBoolean(False)}
    if overlay is not None:
        overrides["rigEdits"] = overlay
        if overlay.getPhysicsEdits():
            overrides.update({"generatePhysics": jp.JBoolean(True), "physicsFrontHair": jp.JBoolean(False),
                              "physicsBackHair": jp.JBoolean(False), "physicsEyeJelly": jp.JBoolean(False)})
    args = []
    for field in config.getClass().getDeclaredFields():
        if jp.JClass("java.lang.reflect.Modifier").isStatic(field.getModifiers()):
            continue
        field.setAccessible(True)
        args.append(overrides.get(str(field.getName()), field.get(config)))
    return config.copy(*args)


def native_objects(model):
    objects = []
    for drawable in model.getDrawables():
        mesh = drawable.getMesh()
        objects.append({"target": {"kind": "art_mesh", "id": str(getter(drawable, "getId"))},
                        "topologyInfo": {"vertexCount": int(mesh.getVertexCount()), "triangleCount": int(mesh.getTriangleCount())}})
    for deformer in model.getDeformers():
        warp = str(deformer.getClass().getSimpleName()) == "Warp"
        topology = {"rows": int(deformer.getRows()), "columns": int(deformer.getColumns()),
                    "controlPointsCount": (int(deformer.getRows()) + 1) * (int(deformer.getColumns()) + 1)} if warp else {}
        objects.append({"target": {"kind": "warp" if warp else "rotation", "id": str(getter(deformer, "getId"))}, "topologyInfo": topology})
    for part in model.getParts():
        objects.append({"target": {"kind": "part", "id": str(getter(part, "getId"))}})
    for glue in model.getGlues():
        objects.append({"target": {"kind": "glue", "id": str(getter(glue, "getMeshA")), "secondaryId": str(getter(glue, "getMeshB"))}})
    return objects


def snapshot(preview, runtime, jp):
    model = preview.getRig().getPuppet()
    state = plain(model, jp)
    # Persist per-field hashes, rather than tens of MB of duplicated keyform arrays.
    signatures = {key: digest(value) for key, value in state.items()}
    return {"format": "psd2live-native-base-v1", "runtime": runtime,
            "modelSignatures": signatures, "modelSha256": digest(signatures), "objects": native_objects(model)}


def empty_output(out):
    out = Path(out).resolve()
    if out.exists() and any(out.iterdir()):
        raise ValueError(f"Native output must be empty to avoid stale bundle evidence: {out}")
    return out


def export_native(pipeline, psd, out, config, jp):
    path = jp.JClass("java.nio.file.Paths")
    listener = jp.JProxy("io.github.psd2live.core.ProgressListener", dict(update=lambda stage, fraction: None))
    return pipeline.run(path.get(str(Path(psd).resolve())), path.get(str(out)), config, listener)


def native_base(psd, out, native_jar=None):
    out = empty_output(out)
    jp, runtime = start_native(native_jar)
    pipeline = jp.JClass("io.github.psd2live.core.PSD2LivePipeline")()
    result = export_native(pipeline, psd, out, config_for(jp), jp)
    evidence = snapshot(result.getPreviewModel(), runtime, jp)
    evidence["warnings"] = [str(v) for v in result.getWarnings()]
    evidence["inputPsdSha256"] = hashlib.sha256(Path(psd).read_bytes()).hexdigest()
    file = out / "native-base.json"
    file.write_text(json.dumps(evidence, indent=2, allow_nan=False), encoding="utf-8")
    return {"status": "ok", "action": "native-base", "baseline": str(file),
            "model_sha256": evidence["modelSha256"], "objects_count": len(evidence["objects"]),
            "warnings": evidence["warnings"], "visual_acceptance": "pending Pose QA"}


SUPPORTED_SECTIONS = {"parameters", "deletedParameterIds", "keyformSets", "keyformCopies", "keyformDeletes"}
SOURCE_SECTIONS = {"warps", "physics", "structure", "authoringJournal"}


def number(value, jp):
    if value is None:
        return None
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError("Native numeric value must be finite")
    return jp.JClass("java.lang.Float")(float(value))


def float_list(values, jp):
    if values is None:
        return None
    if not isinstance(values, list) or not values:
        raise ValueError("Native float array must be nonempty")
    result = jp.JClass("java.util.ArrayList")()
    for value in values:
        result.add(number(value, jp))
    return result


def copy_native_fields(value, overrides, jp):
    args = []
    for field in value.getClass().getDeclaredFields():
        if jp.JClass("java.lang.reflect.Modifier").isStatic(field.getModifiers()):
            continue
        field.setAccessible(True)
        args.append(overrides.get(str(field.getName()), field.get(value)))
    return value.copy(*args)


def native_target(value, jp):
    kind, tid, secondary = _target_key(value)
    if set(value) - {"kind", "id", "secondaryId"}:
        raise ValueError("Unsupported target fields")
    kinds = {"art_mesh": "ART_MESH", "warp": "WARP_DEFORMER", "rotation": "ROTATION_DEFORMER", "part": "PART", "glue": "GLUE"}
    return jp.JClass("io.github.psd2live.core.RigTargetRef")(
        getattr(jp.JClass("io.github.psd2live.core.RigTargetKind"), kinds[kind]), tid, secondary)


def native_coordinate(value, jp):
    if not isinstance(value, dict) or not value or any(not isinstance(k, str) or not k.strip() for k in value):
        raise ValueError("Coordinate must have named parameter values")
    result = jp.JClass("java.util.LinkedHashMap")()
    for key, val in value.items():
        result.put(key, number(val, jp))
    return result


def validate_target_channels(target, channels):
    # Native withChannelKeyCaptured returns the unchanged model for unsupported owner channels.
    # Reject these requests before replay instead of treating a silent no-op as a successful edit.
    common = {"opacity", "multiplycolor", "screencolor"}
    allowed = {"art_mesh": common | {"draworder", "geometry"},
               "part": common | {"draworder"}, "warp": common | {"geometry"},
               "rotation": common | {"flipx", "flipy", "geometry"}, "glue": {"glueintensity"}}
    kind = _target_key(target)[0]
    if any(not isinstance(name, str) or name.lower().replace("_", "") not in allowed[kind] for name in channels):
        raise ValueError(f"Channel incompatible with target kind {kind}: {list(channels)}")


def overlay_native(overlay, jp):
    """Translate the persisted keyform/parameter contract into native immutable edits."""
    native = jp.JClass("io.github.psd2live.core.RigEditOverlay")()
    for section in SUPPORTED_SECTIONS:
        if section in overlay and not isinstance(overlay[section], list):
            raise ValueError(f"{section} must be an array")
    parameter_ids = [e["id"] for e in overlay.get("parameters", [])]
    if len(set(parameter_ids)) != len(parameter_ids):
        raise ValueError("Duplicate parameter edits")
    for edit in overlay.get("parameters", []):
        if set(edit) - {"id", "name", "min", "max", "default", "kind", "repeat", "created"}:
            raise ValueError("Unsupported parameter edit fields")
        for field in ("id", "name"):
            if not isinstance(edit[field], str) or not edit[field].strip():
                raise ValueError(f"Parameter {field} must be text")
        for field in ("repeat", "created"):
            if field in edit and type(edit[field]) is not bool:
                raise ValueError(f"Parameter {field} must be boolean")
        parameter = jp.JClass("io.github.psd2live.core.RigParameterEdit")(
            edit["id"], edit["name"], number(edit["min"], jp), number(edit["max"], jp), number(edit["default"], jp),
            getattr(jp.JClass("org.umamo.runtime.model.ParameterKind"), edit.get("kind", "NORMAL")),
            edit.get("repeat", False), edit.get("created", False))
        native = native.upsert(parameter)
    for pid in overlay.get("deletedParameterIds", []):
        if not isinstance(pid, str) or not pid.strip() or any(e["id"] == pid for e in overlay.get("parameters", [])):
            raise ValueError("Invalid/conflicting deleted parameter ID")
        native = native.delete(pid)
    for edit in overlay.get("keyformSets", []):
        if set(edit) - {"target", "coordinate", "geometry", "channels"}:
            raise ValueError("Unsupported keyform set fields")
        target = native_target(edit["target"], jp)
        kind = _target_key(edit["target"])[0]
        coordinate = native_coordinate(edit["coordinate"], jp)
        geo, channels = edit.get("geometry"), edit.get("channels")
        if geo is not None:
            geometry_fields = {"art_mesh": {"positionDeltas"}, "warp": {"controlPoints"},
                               "rotation": {"originX", "originY", "angle", "scale"}, "part": set(), "glue": set()}
            if not geo or set(geo) - geometry_fields[kind] or any(value is None for value in geo.values()):
                raise ValueError(f"Geometry fields incompatible with target kind {kind}")
            if kind == "rotation" and not {"originX", "originY", "angle"} <= set(geo):
                raise ValueError("Rotation geometry requires originX, originY and angle")
            geo = jp.JClass("io.github.psd2live.core.RigKeyformGeometryEdit")(
                float_list(geo.get("controlPoints"), jp), number(geo.get("originX"), jp), number(geo.get("originY"), jp),
                number(geo.get("angle"), jp), number(geo.get("scale"), jp), float_list(geo.get("positionDeltas"), jp))
        if channels is not None:
            if set(channels) - {"opacity", "drawOrder", "multiplyColor", "screenColor", "glueIntensity", "flipX", "flipY"}:
                raise ValueError("Unsupported native channel fields")
            if not channels or any(value is None for value in channels.values()):
                raise ValueError("Channels must contain explicit values")
            validate_target_channels(edit["target"], channels)
            for field in ("flipX", "flipY"):
                if field in channels and type(channels[field]) is not bool:
                    raise ValueError(f"Channel {field} must be boolean")
            channels = jp.JClass("io.github.psd2live.core.RigKeyformChannelsEdit")(
                number(channels.get("opacity"), jp), number(channels.get("drawOrder"), jp),
                float_list(channels.get("multiplyColor"), jp), float_list(channels.get("screenColor"), jp),
                number(channels.get("glueIntensity"), jp), channels.get("flipX"), channels.get("flipY"))
        native = native.setKeyform(jp.JClass("io.github.psd2live.core.RigKeyformSetEdit")(target, coordinate, geo, channels))
    for edit in overlay.get("keyformCopies", []):
        if set(edit) - {"sourceTarget", "sourceCoordinate", "destinationTarget", "destinationCoordinate", "channels"}:
            raise ValueError("Unsupported keyform copy fields")
        channels = edit.get("channels")
        if channels is not None:
            if not isinstance(channels, list) or not channels or any(not isinstance(v, str) or v.lower() not in {"geometry", "opacity", "draw_order", "draworder", "multiply_color", "multiplycolor", "screen_color", "screencolor", "glue_intensity", "glueintensity", "flip_x", "flipx", "flip_y", "flipy"} for v in channels):
                raise ValueError("Invalid keyform copy channel names")
            validate_target_channels(edit["sourceTarget"], channels)
            validate_target_channels(edit.get("destinationTarget", edit["sourceTarget"]), channels)
            channels = jp.JClass("java.util.ArrayList")(channels)
        if (channels is None or any(str(v).lower() == "geometry" for v in channels)) and (
                _target_key(edit["sourceTarget"])[0] != _target_key(edit.get("destinationTarget", edit["sourceTarget"]))[0]):
            raise ValueError("Geometry/all-channel copy requires matching source/destination kinds")
        native = native.copyKeyform(jp.JClass("io.github.psd2live.core.RigKeyformCopyEdit")(
            native_target(edit["sourceTarget"], jp), native_coordinate(edit["sourceCoordinate"], jp),
            native_target(edit.get("destinationTarget", edit["sourceTarget"]), jp), native_coordinate(edit["destinationCoordinate"], jp), channels))
    deletes = jp.JClass("java.util.ArrayList")()
    for edit in overlay.get("keyformDeletes", []):
        if set(edit) - {"target", "parameterId", "keyValue", "channel"}:
            raise ValueError("Unsupported keyform delete fields")
        channel = edit.get("channel")
        if channel is not None and (not isinstance(channel, str) or channel.lower() not in {"geometry", "opacity", "draw_order", "multiply_color", "screen_color", "glue_intensity", "flip_x", "flip_y"}):
            raise ValueError("Invalid keyform delete channel")
        if channel is not None:
            validate_target_channels(edit["target"], [channel])
        deletes.add(jp.JClass("io.github.psd2live.core.RigKeyformDeleteEdit")(
            native_target(edit["target"], jp), edit["parameterId"], number(edit.get("keyValue"), jp), edit.get("channel")))
    # Loading persisted edits must preserve set -> copy -> delete application order.
    # The interactive deleteKeyform API would erase preceding source sets/copies.
    native = copy_native_fields(native, {"keyformDeleteEdits": deletes}, jp)
    return native


def native_json(value, jp):
    default = jp.JClass("kotlinx.serialization.json.Json").class_.getField("Default").get(None)
    return default.parseToJsonElement(
        json.dumps(value, allow_nan=False))


def object_edit(value, kind, jp):
    fields = ({"id", "name", "parent_id", "mesh_ids", "rows", "columns", "fit_local"}
              if kind == "warp" else {"id", "name", "input_parameter", "output_parameter", "length",
                                    "mobility", "delay", "acceleration", "output_scale"})
    if not isinstance(value, dict) or set(value) - fields:
        raise ValueError(f"Unsupported {kind} fields")
    text_fields = {"id", "name", "parent_id"} if kind == "warp" else {"id", "name", "input_parameter", "output_parameter"}
    for key in text_fields:
        if not isinstance(value.get(key), str) or not value[key].strip():
            raise ValueError(f"{kind}.{key} must be text")
    if kind == "warp":
        if not isinstance(value.get("mesh_ids"), list) or any(not isinstance(v, str) or not v.strip() for v in value["mesh_ids"]):
            raise ValueError("warp.mesh_ids must contain mesh IDs")
        if any(key in value and type(value[key]) is not int for key in ("rows", "columns")):
            raise ValueError("Warp rows/columns must be integers")
        if "fit_local" in value and type(value["fit_local"]) is not bool:
            raise ValueError("fit_local must be boolean")
    else:
        for key in set(value) - text_fields:
            if value[key] is None:
                raise ValueError(f"physics.{key} must be a finite number")
            number(value[key], jp)
    cls = jp.JClass("io.github.psd2live.core.RigWarpEdit" if kind == "warp" else "io.github.psd2live.core.RigPhysicsEdit")
    return cls.class_.getField("Companion").get(None).fromJson(native_json(value, jp))


def structure_edit(edit, jp):
    if not isinstance(edit, dict):
        raise ValueError("Structure edit must be an object")
    if edit.get("action") == "create_warp":
        object_edit({key: value for key, value in edit.items() if key != "action"}, "warp", jp)
    else:
        for key in ("action", "kind", "id", "name", "space", "before_kind"):
            if key in edit and (not isinstance(edit[key], str) or not edit[key].strip()):
                raise ValueError(f"structure.{key} must be text")
        for key in ("parent_id", "before_id"):
            if key in edit and edit[key] is not None and (not isinstance(edit[key], str) or not edit[key].strip()):
                raise ValueError(f"structure.{key} must be ID or null")
        if "visible" in edit and type(edit["visible"]) is not bool:
            raise ValueError("structure.visible must be boolean")
    return native_json(edit, jp)


def source_overlay(overlay, jp):
    native = overlay_native(overlay, jp)
    overrides = {}
    for name, field, kind in (("warps", "warpEdits", "warp"), ("physics", "physicsEdits", "physics"),
                              ("structure", "structureEdits", None)):
        if name not in overlay:
            continue
        if not isinstance(overlay[name], list):
            raise ValueError(f"{name} must be an array")
        values = jp.JClass("java.util.ArrayList")()
        for edit in overlay[name]:
            values.add(structure_edit(edit, jp) if kind is None else object_edit(edit, kind, jp))
        overrides[field] = values
    return copy_native_fields(native, overrides, jp)


def validate_keyforms(overlay, model, jp):
    preflight = check_overlay_compatibility(overlay, {}, native_objects(model))
    if preflight["status"] == "broken":
        raise ValueError("; ".join(preflight["broken_targets"]))
    parameters = {str(getter(p, "getId")): p for p in model.getParameters()}
    edits = [(e, ("coordinate",)) for e in overlay.get("keyformSets", [])]
    edits += [(e, ("sourceCoordinate", "destinationCoordinate")) for e in overlay.get("keyformCopies", [])]
    for edit, fields in edits:
        for field in fields:
            for key, value in edit[field].items():
                parameter = parameters.get(key)
                if parameter is None or not float(parameter.getMin()) <= value <= float(parameter.getMax()):
                    raise ValueError(f"Unknown or out-of-range parameter: {key}={value}")
    for edit in overlay.get("keyformDeletes", []):
        p = parameters.get(edit["parameterId"])
        value = edit.get("keyValue")
        if p is None or value is not None and not float(p.getMin()) <= value <= float(p.getMax()):
            raise ValueError("Unknown or out-of-range keyform delete parameter")


def validated_journal(edits, model, jp):
    if not isinstance(edits, list) or len(edits) > 128:
        raise ValueError("authoringJournal must be an array of at most 128 materialized edits")
    journal = jp.JClass("java.util.ArrayList")()
    for edit in edits:
        if not isinstance(edit, dict):
            raise ValueError("Journal edit must be an object")
        op = edit.get("op")
        allowed = {"set": {"target", "key", "geometry", "channels"},
                   "copy": {"target", "from", "destination", "key", "channels"},
                   "delete": {"target", "parameter", "value", "channel"},
                   "warp": {"warp"}, "structure": {"edits"}}
        if op not in allowed or set(edit) - allowed[op] - {"op"}:
            raise ValueError("Unsupported materialized journal operation/fields")
        def target(key):
            if not isinstance(edit.get(key), str):
                raise ValueError("Journal target must be kind:id")
            kind, tid, secondary = _target_key(edit[key])
            return {"kind": kind, "id": tid, **({"secondaryId": secondary} if secondary else {})}
        if op in {"set", "copy", "delete"}:
            if op == "set":
                flat = {"keyformSets": [{"target": target("target"), "coordinate": edit["key"],
                                          **{key: edit[key] for key in ("geometry", "channels") if key in edit}}]}
            elif op == "copy":
                flat = {"keyformCopies": [{"sourceTarget": target("target"), "sourceCoordinate": edit["from"],
                                            "destinationTarget": target("destination") if "destination" in edit else target("target"),
                                            "destinationCoordinate": edit["key"],
                                            **({"channels": edit["channels"]} if "channels" in edit else {})}]}
            else:
                flat = {"keyformDeletes": [{"target": target("target"), "parameterId": edit["parameter"],
                                             **{"keyValue" if key == "value" else key: edit[key] for key in ("value", "channel") if key in edit}}]}
            overlay_native(flat, jp)
            validate_keyforms(flat, model, jp)
        elif op == "warp":
            object_edit(edit["warp"], "warp", jp)
        else:
            if not isinstance(edit["edits"], list):
                raise ValueError("Journal structure.edits must be an array")
            for entry in edit["edits"]:
                structure_edit(entry, jp)
        entry = native_json(edit, jp)
        # Validate references against each preceding native result, including newly created warps.
        step = copy_native_fields(overlay_native({}, jp), {"authoringJournal": jp.JClass("java.util.ArrayList")([entry])}, jp)
        model = step.applyTo(model)
        journal.add(entry)
    return journal


def native_replay(psd, overlay_file, baseline_file, out, native_jar=None):
    out = empty_output(out)
    overlay = json.loads(Path(overlay_file).read_text(encoding="utf-8"))
    overlay = overlay.get("rigEdits", overlay)
    if not isinstance(overlay, dict):
        raise ValueError("Overlay must be an object")
    supported = SUPPORTED_SECTIONS | (SOURCE_SECTIONS if native_jar is not None else set())
    unsupported = [key for key in overlay if key not in supported and overlay[key]]
    if unsupported:
        return {"status": "needs-review", "action": "native-replay", "reasons": [f"Unsupported native bridge sections: {unsupported}"], "applied": False}
    old = json.loads(Path(baseline_file).read_text(encoding="utf-8"))
    if old.get("format") != "psd2live-native-base-v1" or digest(old["modelSignatures"]) != old["modelSha256"]:
        raise ValueError("Invalid native baseline format or model hash")
    jp, runtime = start_native(native_jar)
    if any(overlay.get(key) for key in SOURCE_SECTIONS):
        fields = {str(field.getName()) for field in jp.JClass("io.github.psd2live.core.RigEditOverlay").class_.getDeclaredFields()}
        if "authoringJournal" not in fields:
            return {"status": "needs-review", "action": "native-replay", "reasons": ["Selected application lacks source authoring capabilities"], "applied": False}
    pipeline = jp.JClass("io.github.psd2live.core.PSD2LivePipeline")()
    path = jp.JClass("java.nio.file.Paths").get(str(Path(psd).resolve()))
    preview = pipeline.buildPreview(path, config_for(jp))
    current = snapshot(preview, runtime, jp)
    basic = {key: value for key, value in overlay.items() if key in SUPPORTED_SECTIONS}
    preflight = check_overlay_compatibility(basic if not any(overlay.get(key) for key in SOURCE_SECTIONS) else {}, {}, current["objects"])
    if preflight["status"] == "broken":
        return {"status": "broken", "action": "native-replay", "reasons": preflight["reasons"], "applied": False}
    if old["runtime"] != runtime or old["modelSha256"] != current["modelSha256"]:
        return {"status": "needs-review", "action": "native-replay", "reasons": ["Native runtime or complete base model changed (including topology/rest shape/keyforms); no automatic replay"],
                "changed_model_fields": sorted(key for key in set(old["modelSignatures"]) | set(current["modelSignatures"])
                                               if old["modelSignatures"].get(key) != current["modelSignatures"].get(key)),
                "current_objects": current["objects"], "applied": False}
    # Full matching evidence discharges the preflight's geometry review, not other unknown fields.
    remaining = [v for v in preflight["review_targets"] if "geometry needs native topology/rest-shape review" not in v
                 and "rotation geometry needs native rest-shape review" not in v
                 and not any(v.startswith(f"{section}:") for section in ("parameters", "deletedParameterIds"))]
    if remaining:
        return {"status": "needs-review", "action": "native-replay", "reasons": remaining, "applied": False}
    native = source_overlay(overlay, jp) if native_jar else overlay_native(overlay, jp)
    prefix = {key: value for key, value in overlay.items() if key in {"parameters", "deletedParameterIds", "warps", "structure", "physics"}}
    header = source_overlay(prefix, jp) if native_jar else overlay_native(prefix, jp)
    base_model = preview.getRig().getPuppet()
    original_parameters = {str(getter(p, "getId")) for p in base_model.getParameters()}
    if any(pid not in original_parameters for pid in overlay.get("deletedParameterIds", [])):
        return {"status": "broken", "action": "native-replay", "reasons": ["Deleted parameter not found in native base"], "applied": False}
    try:
        validate_keyforms(basic, header.applyTo(base_model), jp)
        if overlay.get("authoringJournal"):
            journal = validated_journal(overlay["authoringJournal"], native.applyTo(base_model), jp)
            native = copy_native_fields(native, {"authoringJournal": journal}, jp)
    except ValueError as error:
        return {"status": "broken", "action": "native-replay", "reasons": [str(error)], "applied": False}
    if overlay.get("keyformSets") and not native.getKeyformSetEdits():
        raise ValueError("Native overlay lost edits before application")
    # Validate the actual applyTo result before any export is written.
    applied = native.applyTo(preview.getRig().getPuppet())
    validator = jp.JClass("io.github.psd2live.core.RigIntegrityValidator").INSTANCE
    bounds = preview.getRig().getSourceBoundsByDrawableId()
    warnings = list(validator.validateNeutralPose("preview", applied, bounds).getWarnings())
    warnings += list(validator.validateHeadAnglePoses("preview", applied, bounds))
    warnings += list(validator.validateDirectionalWarpDimensions("preview", applied))
    base_model = preview.getRig().getPuppet()
    base_warnings = list(validator.validateNeutralPose("preview", base_model, bounds).getWarnings())
    base_warnings += list(validator.validateHeadAnglePoses("preview", base_model, bounds))
    base_warnings += list(validator.validateDirectionalWarpDimensions("preview", base_model))
    introduced = sorted(set(map(str, warnings)) - set(map(str, base_warnings)))
    if introduced:
        return {"status": "needs-review", "action": "native-replay", "reasons": introduced, "applied": False}
    result = export_native(pipeline, psd, out, config_for(jp, native), jp)
    introduced = sorted(set(map(str, result.getWarnings())) - set(old["warnings"]))
    report = {"status": "needs-review" if introduced else "ok", "action": "native-replay",
              "applied": True, "baseline_sha256": current["modelSha256"],
              "overlay_sha256": hashlib.sha256(Path(overlay_file).read_bytes()).hexdigest(),
              "native_keyform_sets": len(native.getKeyformSetEdits()),
              "native_keyform_copies": len(native.getKeyformCopyEdits()),
              "native_keyform_deletes": len(native.getKeyformDeleteEdits()),
              "native_parameter_edits": len(native.getParameterEdits()),
              "native_warp_edits": len(native.getWarpEdits()),
              "native_physics_edits": len(native.getPhysicsEdits()),
              "native_structure_edits": len(native.getStructureEdits()),
              "native_journal_edits": len(native.getAuthoringJournal()) if native_jar else 0,
              "reasons": introduced, "warnings": list(map(str, result.getWarnings())),
              "exported_files": [str(v.getPath()) for v in result.getExportedFiles()],
              "visual_acceptance": "pending Pose QA; native validation alone is insufficient"}
    (out / "native-replay.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
