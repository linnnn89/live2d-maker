"""Snapshot assembly and saved-model evidence; does not invoke native build operations."""
import hashlib
import uuid
from pathlib import Path
from PIL import Image
from .workspace_store import read, write, locked, file_url, revision
from .generated import composite_ir
from .stale import evaluate_dag_stale, check_overlay_compatibility, model_input_signature, _canonical_hash
from .validator import validate_authoring_rig
from .build_settings import load_settings, settings_signature, settings_record_matches


def model_record_matches(record, data, built_ir, settings=None, built_settings=None):
    """Versioned reports bind exact model inputs; legacy reports require their captured build IR."""
    from .build_settings import DEFAULT_SETTINGS
    if not settings_record_matches(record, settings if settings is not None else DEFAULT_SETTINGS,
                                   built_settings if built_settings is not None else DEFAULT_SETTINGS):
        return False
    if record.get("signatureVersion") == 2:
        return record.get("modelInputSignature") == model_input_signature(built_ir) == model_input_signature(data)
    if "signatureVersion" in record:
        return False
    return record.get("revision") == revision(built_ir) and model_input_signature(built_ir) == model_input_signature(data)


def overlay_inputs(root, state):
    if not state["overlay"]:
        return None
    return {name: hashlib.sha256((root / file).read_bytes()).hexdigest()
            for name, file in (("overlay", state["overlay"]), ("baseline", "overlay-baseline.json"))}


def snapshot(root):
    root = Path(root).resolve(strict=True)
    data = read(root / "authoring-rig.json")
    validate_authoring_rig(data, root)
    state = read(root / "studio-state.json")
    if not state.get("workspaceId"):
        # Migrate old workspaces under the existing writer lock; do not touch the IR/source/builds.
        with locked(root):
            state = read(root / "studio-state.json")
            if not state.get("workspaceId"):
                state["workspaceId"] = uuid.uuid4().hex
                write(root / "studio-state.json", state)
    build = state["latestBuild"]
    settings = load_settings(root)
    built_settings = load_settings(root / build) if build else load_settings(root)
    previous = read(root / build / "build-ir.json") if build else read(root / "origin-ir.json")
    # Browser JSON serializes 484.0 as 484. Equal IR values still describe the same artwork.
    same_ir = data == previous
    stale = evaluate_dag_stale(previous, previous if same_ir else data)["stale"]
    report = read(root / build / "build-report.json") if build else None
    model_matches = bool(report and model_record_matches(report, data, previous, settings, built_settings))
    if report and not model_matches:
        for stage in ("base_rig", "overlay_apply", "moc3", "review"):
            stale[stage] = True
    if not build:
        for stage in ("psd", "base_rig", "overlay_apply", "moc3", "review"):
            stale[stage] = True
    qa = state["latestQa"]
    review = read(root / qa / "review.json") if qa else None
    qa_matches = bool(review and model_matches and settings_record_matches(review, settings, built_settings) and (
        (review.get("signatureVersion") == 2 and review.get("buildId") == build
         and review.get("modelInputSignature") == model_input_signature(data))
        or ("signatureVersion" not in review and review.get("studioRevision") == report.get("revision"))))
    stale["review"] = stale["review"] or not qa_matches
    overlay = {"status": "not-loaded", "reasons": []}
    if state["overlay"]:
        inputs = overlay_inputs(root, state)
        evidence = read(root / "overlay-baseline.json")
        overlay = check_overlay_compatibility(read(root / "overlay.json"), data, evidence["objects"])
        applied = (model_matches and not stale["base_rig"] and report.get("overlayInputs") == inputs)
        if not applied:
            for stage in ("overlay_apply", "moc3", "review"):
                stale[stage] = True
        if stale["base_rig"] and overlay["status"] == "ok":
            overlay = {"status": "needs-review", "reasons": ["Base rig changed; native replay must compare complete signatures"]}
        attempt = state.get("lastBuildAttempt")
        failed_ir = root / attempt["directory"] / "build-ir.json" if attempt else None
        attempt_settings = load_settings(root / attempt["directory"]) if attempt else settings
        same_attempt = attempt and settings_record_matches(attempt, settings, attempt_settings) and (
            attempt["revision"] == revision(data)
            or (failed_ir.exists() and model_record_matches(attempt, data, read(failed_ir), settings, attempt_settings)))
        if (same_attempt and attempt.get("overlayInputs") == inputs and attempt["status"] != "ok"):
            for stage in ("overlay_apply", "moc3", "review"):
                stale[stage] = True
            failure = read(root / attempt["directory"] / "failed-report.json")
            overlay = {"status": failure["status"] if failure["status"] in ("broken", "needs-review") else "needs-review",
                       "reasons": failure.get("reasons", []), "native_apply_required": True, "applied": False,
                       "evidence": "failed-native-replay"}
        elif applied:
            overlay = {"status": "ok", "reasons": [], "native_apply_required": False, "applied": True,
                       "evidence": "native-replay"}
        elif overlay["status"] == "ok":
            overlay = {"status": "needs-review", "reasons": ["Current Overlay/baseline requires native replay"],
                       "native_apply_required": True, "applied": False}
    with Image.open(root / "source.png") as image:
        bounds = image.getchannel("A").getbbox()
    result = {"schemaVersion": 1, "workspaceId": state["workspaceId"], "status": "ok", "ir": data, "revision": revision(data), "stale": stale,
              "overlay": overlay, "sourceImage": file_url(root, root / "source.png"), "sourceBounds": bounds,
              "artworkBounds": bounds, "build": None, "qa": None,
              "buildSettings": {"settings": settings, "revision": settings_signature(settings)}}
    if state.get("projectId"):
        metadata = read(root / "project.json")
        result["project"] = {"id": state["projectId"], "name": metadata["name"], "updatedAt": metadata["updatedAt"],
                             "parts": len(data["parts"]), "head": metadata["head"]}
    from .poses import pose_state
    result["poses"] = pose_state(root)
    result["overlayRevision"] = _canonical_hash(overlay_inputs(root, state))
    result["export"] = None
    if state.get("latestExport"):
        delivery = read(root / state["latestExport"] / "export-report.json")
        delivery["url"] = file_url(root, root / "downloads" / (Path(state["latestExport"]).name + ".model.zip"))
        if "modelUrl" in delivery:
            model = root / state["latestExport"] / "model" / Path(delivery["modelUrl"]).name
            if model.name.endswith(".model3.json") and model.is_file():
                delivery["modelUrl"] = file_url(root, model)
            else:
                delivery.pop("modelUrl")
        result["export"] = {"result": delivery, "current": delivery["modelInputSignature"] == model_input_signature(data)
                            and delivery["buildSettings"] == settings and delivery["overlayRevision"] == result["overlayRevision"]}
    if state.get("latestImport"):
        artwork = root / state["latestImport"] / "after.png"
        result["artworkImage"] = file_url(root, artwork)
        with Image.open(artwork) as image:
            result["artworkBounds"] = image.getchannel("A").getbbox()
    if build:
        report = read(root / build / "build-report.json")
        # Older successful builds have no bounds in their report. Derive them from
        # that build's IR, never from a newer import or an unsaved editing draft.
        model_bounds = (report["modelBounds"] if "modelBounds" in report
                        else composite_ir(previous, root).getchannel("A").getbbox())
        result["build"] = {**report, "modelBounds": model_bounds,
                           "modelUrl": file_url(root, root / build / report["modelFile"])}
    if qa:
        review = read(root / qa / "review.json")
        result["qa"] = {"status": review["status"], "revision": review["studioRevision"],
                        "contactSheet": file_url(root, root / qa / "contact-sheet.png"),
                        "reviewUrl": file_url(root, root / qa / "review.json"), "poses": len(review["shots"]),
                        "shots": [{"name": shot["name"], "values": shot["params"], "image": file_url(root, root / qa / shot["full"])} for shot in review["shots"] if all(key in shot for key in ("name", "params", "full"))]}
    from .rig_edits import edit_state
    from .issues import model_issues
    result["rigEdits"] = edit_state(root, state)
    result["issues"] = model_issues(result, root, state)
    return result

