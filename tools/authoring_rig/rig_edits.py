"""Limited opacity keyforms use the existing native Overlay and project transaction."""
import copy
import math
from pathlib import Path
from .studio_protocol import StudioError, validate_protocol


def edit_state(root, state):
    from .studio import read, file_url
    result = {"edits": [], "changedModelFields": []}
    if state["overlay"]:
        overlay = read(root / "overlay.json"); overlay = overlay.get("rigEdits", overlay)
        for index, edit in enumerate(overlay.get("keyformSets", [])):
            target = edit.get("target", {})
            # Only these complete, standalone edits can be removed from the limited UI.
            if (isinstance(target, dict) and target.get("kind") == "art_mesh" and set(edit) == {"target", "coordinate", "channels"}
                    and set(edit["channels"]) == {"opacity"}):
                result["edits"].append({"index": index, "targetId": target["id"], "coordinate": edit["coordinate"], "opacity": edit["channels"]["opacity"]})
        baseline = read(root / "overlay-baseline.json")
        if "modelSha256" in baseline: result["baselineModelSha256"] = baseline["modelSha256"]
        result.update(overlayUrl=file_url(root, root / "overlay.json"), baselineUrl=file_url(root, root / "overlay-baseline.json"))
    attempt = state.get("lastBuildAttempt")
    if attempt and attempt["status"] != "ok":
        path = root / attempt["directory"] / "failed-report.json"
        failure = read(path)
        result.update(failureUrl=file_url(root, path), changedModelFields=failure.get("changed_model_fields", []))
    return result


def update_rig_edits(root, payload):
    validate_protocol("RigEditRequest", payload)
    from .studio import snapshot, locked, read, write, ROOT
    from .projects import capture, checkpoint, apply_transaction
    from .native import digest, runtime_identity
    root = Path(root).resolve(strict=True)
    with locked(root):
        view = snapshot(root); state = read(root / "studio-state.json")
        if not state.get("projectId"):
            raise StudioError("INVALID_REQUEST", "Open a managed Studio project to persist model edits", "rig-edit")
        if (payload["revision"] != view["revision"] or payload["settingsRevision"] != view["buildSettings"]["revision"]
                or payload["overlayRevision"] != view["overlayRevision"]):
            raise StudioError("BASE_CONFLICT", "Model inputs or Overlay changed before editing", "rig-edit")
        value = capture(root)
        if payload["operation"] == "set-opacity":
            if not view["build"] or view["stale"]["base_rig"] or (state["overlay"] and view["overlay"]["status"] == "broken"):
                raise StudioError("RIG_EDIT_UNAVAILABLE", "Rebuild current model inputs before creating a keyform", "rig-edit")
            if not state["overlay"]:
                if view["stale"]["moc3"]:
                    raise StudioError("RIG_EDIT_UNAVAILABLE", "Rebuild the project before establishing its first Overlay", "rig-edit")
                value["baseline"] = read(root / state["latestBuild"] / "native/native-base.json")
                value["overlay"] = {}; value["state"]["overlay"] = "overlay.json"
            baseline = value["baseline"]
            jar = ROOT / "psd2live/build/libs/psd2live-0.7.1.jar"
            if digest(baseline["modelSignatures"]) != baseline["modelSha256"] or baseline["runtime"] != runtime_identity(jar if jar.exists() else None):
                raise StudioError("RIG_EDIT_UNAVAILABLE", "Native baseline or engine identity changed; restore compatible project inputs", "rig-edit")
            edit = payload["edit"]
            if not math.isfinite(edit["value"]) or not math.isfinite(edit["opacity"]):
                raise StudioError("INVALID_PARAMETER", "Keyform values must be finite", "rig-edit")
            if not any(obj["target"] == {"kind": "art_mesh", "id": edit["targetId"]} for obj in baseline["objects"]):
                raise StudioError("INVALID_TARGET", "Native mesh target is absent from the preserved baseline", "rig-edit", field=edit["targetId"])
            parameter = next((p for p in view["build"].get("parameters", []) if p["id"] == edit["parameterId"]), None)
            if parameter is None or not parameter["min"] <= edit["value"] <= parameter["max"]:
                raise StudioError("INVALID_PARAMETER", "Unknown or out-of-range keyform parameter: " + edit["parameterId"], "rig-edit", field=edit["parameterId"])
            overlay = value["overlay"].get("rigEdits", value["overlay"])
            sets = overlay.setdefault("keyformSets", [])
            if len(sets) >= 100:
                raise StudioError("INVALID_REQUEST", "At most 100 flat keyform sets in the limited editor", "rig-edit")
            # Append rather than overwrite other authors' geometry/channels or ordered journal.
            sets.append({"target": {"kind": "art_mesh", "id": edit["targetId"]},
                         "coordinate": {edit["parameterId"]: edit["value"]}, "channels": {"opacity": edit["opacity"]}})
        else:
            if not any(edit["index"] == payload["index"] for edit in view["rigEdits"]["edits"]):
                raise StudioError("INVALID_REQUEST", "This edit is not removable by the limited opacity editor", "rig-edit")
            overlay = value["overlay"].get("rigEdits", value["overlay"])
            del overlay["keyformSets"][payload["index"]]
        # Reuse recoverable multi-file project transactions; the previous complete evidence
        # is an immutable project revision, including the original baseline and Overlay.
        checkpoint(root, "关键形修改前自动保存")
        metadata = read(root / "project.json")
        transaction = {"capture": copy.deepcopy(value), "metadata": metadata}
        write(root / ".project-transaction.json", transaction); apply_transaction(root, transaction)
    return snapshot(root)
