"""Local Studio operations. The browser bridge only invokes this CLI contract."""
import copy
import base64
import hashlib
import json
import os
import shutil
import sys
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from PIL import Image

from .builder import build_psd
from .exporter import export_psd
from .generated import composite_ir, import_generated
from .stale import evaluate_dag_stale, check_overlay_compatibility
from .validator import validate_authoring_rig
from .studio_protocol import StudioError, validate_protocol

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    os.replace(temporary, path)


def revision(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def overlay_inputs(root, state):
    if not state["overlay"]:
        return None
    return {name: hashlib.sha256((root / file).read_bytes()).hexdigest()
            for name, file in (("overlay", state["overlay"]), ("baseline", "overlay-baseline.json"))}


@contextmanager
def locked(root):
    lock = root / ".studio.lock"
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise StudioError("BACKEND_BUSY", "Studio workspace is busy; wait for the current command", retryable=True) from error
    try:
        os.close(fd)
        yield
    finally:
        lock.unlink()


def file_url(root, file):
    return "/studio-files/" + Path(file).relative_to(root).as_posix()


def open_workspace(root, source_ir=None, source_psd=None, overlay=None, overlay_baseline=None):
    root = Path(root).resolve()
    if (root / "studio-state.json").exists():
        return snapshot(root)
    if root.exists():
        raise ValueError("New Studio workspace must not already exist")
    if overlay and not overlay_baseline:
        raise ValueError("Attached Overlay requires its original native-base.json")
    if overlay_baseline and not overlay:
        raise ValueError("Overlay baseline requires an Overlay")
    if source_ir:
        source = Path(source_ir).resolve(strict=True)
        data = read(source)
        validate_authoring_rig(data, source.parent)
        if root.is_relative_to(source.parent):
            raise ValueError("Workspace must be outside the source IR directory")
        root.mkdir(parents=True)
        # Copy only validated raster assets. No unrelated files or local configuration.
        for part in data["parts"]:
            original = source.parent / part["asset"]["path"]
            relative = "assets/" + part["asset"]["sha256"] + ".png"
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, target)
            part["asset"]["path"] = relative
        write(root / "authoring-rig.json", data)
    else:
        source = Path(source_psd or ROOT / "psd2live/examples/ds/psd-input/ds.psd").resolve(strict=True)
        data = export_psd(source, root)
        shutil.copy2(source, root / "source.psd")
    write(root / "origin-ir.json", data)
    composite_ir(data, root).save(root / "source.png")
    state = {"source": str(source), "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
             "workspaceId": uuid.uuid4().hex, "latestBuild": None, "latestQa": None, "overlay": None}
    if overlay:
        write(root / "overlay.json", read(overlay))
        write(root / "overlay-baseline.json", read(overlay_baseline))
        state["overlay"] = "overlay.json"
    write(root / "studio-state.json", state)
    return snapshot(root)


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
    previous = read(root / build / "build-ir.json") if build else read(root / "origin-ir.json")
    # Browser JSON serializes 484.0 as 484. Equal IR values still describe the same artwork.
    same_ir = data == previous
    current_revision = revision(data)
    previous_revision = revision(previous)
    stale = evaluate_dag_stale(previous, previous if same_ir else data)["stale"]
    if not build:
        for stage in ("psd", "base_rig", "overlay_apply", "moc3", "review"):
            stale[stage] = True
    qa = state["latestQa"]
    qa_revision = read(root / qa / "review.json").get("studioRevision") if qa else None
    stale["review"] = stale["review"] or not qa or not (qa_revision == current_revision
                                                       or (same_ir and qa_revision == previous_revision))
    overlay = {"status": "not-loaded", "reasons": []}
    if state["overlay"]:
        inputs = overlay_inputs(root, state)
        evidence = read(root / "overlay-baseline.json")
        overlay = check_overlay_compatibility(read(root / "overlay.json"), data, evidence["objects"])
        report = read(root / build / "build-report.json") if build else None
        applied = (report and not stale["base_rig"] and report.get("overlayInputs") == inputs
                   and (report.get("revision") == current_revision
                        or (same_ir and report.get("revision") == previous_revision)))
        if not applied:
            for stage in ("overlay_apply", "moc3", "review"):
                stale[stage] = True
        if stale["base_rig"] and overlay["status"] == "ok":
            overlay = {"status": "needs-review", "reasons": ["Base rig changed; native replay must compare complete signatures"]}
        attempt = state.get("lastBuildAttempt")
        failed_ir = root / attempt["directory"] / "build-ir.json" if attempt else None
        same_attempt = attempt and (attempt["revision"] == current_revision
                                     or (failed_ir.exists() and read(failed_ir) == data))
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
              "overlay": overlay, "sourceImage": "/studio-files/source.png", "sourceBounds": bounds,
              "artworkBounds": bounds, "build": None, "qa": None}
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
                        "reviewUrl": file_url(root, root / qa / "review.json"), "poses": len(review["shots"])}
    return result


def save_workspace(root, payload):
    validate_protocol("SaveRequest", payload)
    root = Path(root).resolve(strict=True)
    with locked(root):
        current = read(root / "authoring-rig.json")
        if payload.get("revision") != revision(current):
            raise StudioError("BASE_CONFLICT", "IR changed in another editor; reload before saving", "save")
        candidate = payload["ir"]
        validate_authoring_rig(candidate, root)
        # This editing surface owns geometry and appearance; paths, IDs and source are immutable.
        old = copy.deepcopy(current)
        new = copy.deepcopy(candidate)
        for data in (old, new):
            for part in data["parts"]:
                part.pop("geometry", None)
                part.pop("appearance", None)
        if old != new:
            raise StudioError("EDIT_SCOPE", "Studio may edit only geometry and appearance", "save")
        for part, previous in zip(candidate["parts"], current["parts"]):
            if part["geometry"]["bbox"] != previous["geometry"]["bbox"]:
                raise StudioError("EDIT_SCOPE", "Raster bbox is fixed; edit polygon or landmarks", "save", part_id=part["id"], field="geometry.bbox")
        write(root / "authoring-rig.json", candidate)
    return snapshot(root)


def preview_generated(root, payload):
    """Run the existing import contract in isolation; the active IR stays untouched."""
    validate_protocol("ImportPreviewRequest", payload)
    root = Path(root).resolve(strict=True)
    with locked(root):
        current = read(root / "authoring-rig.json")
        if payload.get("revision") != revision(current):
            raise StudioError("BASE_CONFLICT", "IR changed in another editor; reload before importing", "import-preview")
        name, prompt = payload.get("name"), payload.get("prompt", "")
        if not isinstance(name, str) or not name.strip() or len(name) > 128:
            raise ValueError("Layer name must contain 1–128 characters")
        if not isinstance(prompt, str) or len(prompt) > 16000:
            raise ValueError("Generation description must be text of at most 16000 characters")
        if type(payload.get("fit", False)) is not bool:
            raise ValueError("fit must be a boolean")
        if not isinstance(payload.get("bounds"), list):
            raise ValueError("bounds must contain four integer canvas coordinates")
        # The CLI output must live outside the source IR directory. Only validated
        # results are copied into a permanent archive in this workspace.
        with tempfile.TemporaryDirectory(prefix=".studio-import-", dir=root.parent) as temp:
            temporary = Path(temp).resolve()
            if temporary.parent != root.parent:
                raise ValueError("Import staging directory must be beside the workspace")
            for field, filename in (("generatedPng", "generated.png"), ("maskPng", "mask.png")):
                encoded = payload.get(field)
                if not isinstance(encoded, str) or len(encoded) > 24 * 1024 * 1024:
                    raise ValueError("Each PNG must be at most 16 MB")
                try:
                    raw = base64.b64decode(encoded, validate=True)
                except ValueError as error:
                    raise ValueError("Invalid base64 PNG upload") from error
                if len(raw) > 16 * 1024 * 1024 or not raw.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Each upload must be a PNG of at most 16 MB")
                (temporary / filename).write_bytes(raw)
            (temporary / "prompt.txt").write_text(prompt, encoding="utf-8")
            report = import_generated(root / "authoring-rig.json", temporary / "generated.png",
                                      temporary / "mask.png", payload.get("bounds"), name.strip(),
                                      temporary / "prompt.txt", temporary / "result",
                                      replace_part=payload.get("replacePart"), fit=payload.get("fit", False),
                                      sprite_bounds=payload.get("spriteBounds"))
            token = uuid.uuid4().hex
            archive = root / "imports" / token
            shutil.copytree(temporary / "result", archive)
        candidate = read(archive / "authoring-rig.json")
        part = next(p for p in candidate["parts"] if p["id"] == report["part_id"])
        part["asset"]["path"] = (archive.relative_to(root) / part["asset"]["path"]).as_posix()
        validate_authoring_rig(candidate, root)
        write(archive / "candidate-ir.json", candidate)
        report["ir_file"] = str(archive / "authoring-rig.json")
        write(archive / "generation-report.json", report)
        preview = {"schemaVersion": 1, "id": token, "revision": revision(current), "candidateRevision": revision(candidate),
                   "partId": part["id"], "name": part["name"], "semantic": part["semantic"],
                   "report": report, "beforeImage": file_url(root, archive / "before.png"),
                   "afterImage": file_url(root, archive / "after.png")}
        write(archive / "preview.json", preview)
        return preview


def commit_generated(root, payload):
    validate_protocol("ImportCommitRequest", payload)
    root = Path(root).resolve(strict=True)
    token = payload.get("id")
    with locked(root):
        archive = root / "imports" / token
        preview = read(archive / "preview.json")
        current = read(root / "authoring-rig.json")
        if payload.get("revision") != revision(current) or preview["revision"] != revision(current):
            raise StudioError("BASE_CONFLICT", "IR changed in another editor; reload and run import preflight again", "import-commit")
        candidate = read(archive / "candidate-ir.json")
        if revision(candidate) != preview["candidateRevision"]:
            raise StudioError("IMPORT_CONFLICT", "Import candidate changed; run preflight again", "import-commit")
        validate_authoring_rig(candidate, root)
        state = read(root / "studio-state.json")
        changed_state = {**state, "latestImport": archive.relative_to(root).as_posix()}
        write(root / "authoring-rig.json", candidate)
        try:
            write(root / "studio-state.json", changed_state)
        except Exception:
            write(root / "authoring-rig.json", current)
            raise
    return snapshot(root)


def rebuild_workspace(root):
    from .native import native_base, native_replay
    root = Path(root).resolve(strict=True)
    with locked(root):
        data = read(root / "authoring-rig.json")
        validate_authoring_rig(data, root)
        state = read(root / "studio-state.json")
        context = {"revision": revision(data), "overlayInputs": overlay_inputs(root, state)}
        build = root / "builds" / uuid.uuid4().hex
        build.mkdir(parents=True)
        write(build / "build-ir.json", data)
        build_psd(root / "authoring-rig.json", build / "artwork.psd")
        native_dir = build / "native"
        jar = ROOT / "psd2live/build/libs/psd2live-0.7.1.jar"
        native_jar = jar if jar.exists() else None
        def failed(result):
            write(build / "failed-report.json", {**result, **context})
            state["lastBuildAttempt"] = {**context, "directory": build.relative_to(root).as_posix(), "status": result["status"]}
            write(root / "studio-state.json", state)

        try:
            if state["overlay"]:
                result = native_replay(build / "artwork.psd", root / "overlay.json", root / "overlay-baseline.json", native_dir, native_jar)
            else:
                result = native_base(build / "artwork.psd", native_dir, native_jar)
        except Exception as error:
            failed({"status": "error", "applied": False, "reasons": [str(error)]})
            raise
        if result["status"] != "ok":
            failed(result)
            raise ValueError(f"Overlay {result['status']}: {result.get('reasons', [])}; previous build retained")
        if overlay_inputs(root, state) != context["overlayInputs"]:
            failed({"status": "needs-review", "reasons": ["Overlay/baseline changed during rebuild"], "applied": False})
            raise ValueError("Overlay/baseline changed during rebuild; previous build retained")
        model = next(native_dir.glob("*.model3.json"))
        labels_path = next(native_dir.glob("*.psd2live.json"))
        labels = read(labels_path)
        layers = labels["layers"]
        unknown = [layer for layer in layers if layer.get("tag", "").lower() == "unknown"]
        audit = {"layers": layers, "unknown": unknown, "count": len(layers),
                 "fresh": labels_path.stat().st_mtime >= (build / "artwork.psd").stat().st_mtime}
        write(build / "label-audit.json", audit)
        if unknown or not audit["fresh"]:
            raise ValueError("Label audit failed; previous build retained")
        report = {"status": "ok", **context, "modelFile": model.relative_to(build).as_posix(),
                  "warnings": result.get("warnings", []), "labelCount": len(layers), "unknownCount": 0,
                  "modelBounds": composite_ir(data, root).getchannel("A").getbbox(),
                  "modelSha256": hashlib.sha256(model.with_suffix("").with_suffix(".moc3").read_bytes()).hexdigest()}
        write(build / "build-report.json", report)
        state["latestBuild"] = build.relative_to(root).as_posix()
        state["lastBuildAttempt"] = {**context, "directory": state["latestBuild"], "status": "ok"}
        state["latestQa"] = None
        write(root / "studio-state.json", state)
    return snapshot(root)


def qa_workspace(root, port):
    sys.path.insert(0, str(ROOT / "live2d-viewer"))
    from qa import run_qa
    root = Path(root).resolve(strict=True)
    with locked(root):
        view = snapshot(root)
        if not view["build"] or view["stale"]["moc3"]:
            raise ValueError("Save and rebuild current IR before running Pose QA")
        data = view["ir"]
        state = read(root / "studio-state.json")
        state["latestQa"] = None
        write(root / "studio-state.json", state)
        # Fixed authored coordinates and full-frame crops; no visual coordinate guessing.
        shots = [{"name": "neutral", "params": {}}]
        for parameter in ("ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamBodyAngleX"):
            limit = 10 if parameter == "ParamBodyAngleX" else 30
            for value in (-limit, limit):
                shots.append({"name": parameter + ("_minus" if value < 0 else "_plus"), "params": {parameter: value}})
        for value in (0, 0.5, 1):
            shots.append({"name": "mouth_" + str(value).replace(".", "_"), "params": {"ParamMouthOpenY": value}})
        shots.extend([{"name": "eyes_closed", "params": {"ParamEyeLOpen": 0, "ParamEyeROpen": 0}},
                      {"name": "eyes_closed_mouth_open", "params": {"ParamEyeLOpen": 0, "ParamEyeROpen": 0, "ParamMouthOpenY": 1}}])
        cdi = next((root / state["latestBuild"] / "native").glob("*.cdi3.json"))
        available = {parameter["Id"] for parameter in read(cdi)["Parameters"]}
        hair = [parameter for parameter in ("ParamHairFront", "ParamHairBack", "ParamHairSide") if parameter in available]
        if not hair:
            raise ValueError("Pose QA requires at least one generated hair parameter")
        shots.extend({"name": "hair_minus" if value < 0 else "hair_plus", "params": {parameter: value for parameter in hair}} for value in (-1, 1))
        spec = {"model": view["build"]["modelUrl"], "vendor": "/public/vendor/cubism/",
                "canvas": [640, 640], "canvaspx": [data["canvas"]["width"], data["canvas"]["height"]], "shots": shots}
        directory = root / "reviews" / uuid.uuid4().hex
        directory.mkdir(parents=True)
        write(directory / "spec.json", spec)
        try:
            review = run_qa(directory / "spec.json", directory, port)
        except Exception as error:
            write(directory / "review.json", {"status": "error", "error": str(error)})
            raise
        review["studioRevision"] = view["revision"]
        write(directory / "review.json", review)
        state["latestQa"] = directory.relative_to(root).as_posix()
        write(root / "studio-state.json", state)
    return snapshot(root)
