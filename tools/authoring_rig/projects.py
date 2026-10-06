"""Studio project entry points and immutable saved revisions; no desktop archive emulation."""
import base64
import copy
import datetime
import hashlib
import io
import json
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from .build_settings import load_settings, settings_signature
from .exporter import inspect_psd
from .studio_protocol import StudioError, validate_protocol
from .validator import validate_authoring_rig

ID = re.compile(r"^[a-f0-9]{32}$")
MAX_UPLOAD = 128 * 1024 * 1024
MAX_EXPANDED = 1024 * 1024 * 1024
ROOT_FILES = {"authoring-rig.json", "origin-ir.json", "studio-state.json", "source.psd", "source.png",
              "build-settings.json", "overlay.json", "overlay-baseline.json", "project.json"}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def project_root(catalog, project_id):
    catalog = Path(catalog).resolve()
    if not isinstance(project_id, str) or not ID.fullmatch(project_id):
        raise StudioError("INVALID_REQUEST", "Invalid project ID", "project")
    root = (catalog / project_id).resolve(strict=True)
    if root.parent != catalog or root.is_symlink():
        raise StudioError("INVALID_REQUEST", "Project is outside its catalog", "project")
    from .studio import read
    if read(root / "studio-state.json").get("projectId") != project_id:
        raise StudioError("INVALID_REQUEST", "Project identity mismatch", "project")
    return root


def summary(root):
    from .studio import read
    metadata = read(root / "project.json")
    data = read(root / "authoring-rig.json")
    return {"id": root.name, "name": metadata["name"], "updatedAt": metadata["updatedAt"],
            "parts": len(data["parts"]), "head": metadata.get("head")}


def list_projects(catalog):
    catalog = Path(catalog).resolve()
    projects = []
    if catalog.exists():
        for child in catalog.iterdir():
            if ID.fullmatch(child.name) and (child / "project.json").is_file():
                projects.append(summary(project_root(catalog, child.name)))
    return {"schemaVersion": 1, "projects": sorted(projects, key=lambda entry: entry["updatedAt"], reverse=True)}


def decoded_upload(value):
    if not isinstance(value, str) or len(value) > (MAX_UPLOAD + 2) // 3 * 4:
        raise StudioError("REQUEST_SIZE", "Upload exceeds 128 MiB", "project")
    try: raw = base64.b64decode(value, validate=True)
    except ValueError as error: raise StudioError("INVALID_REQUEST", "Invalid base64 upload", "project") from error
    if len(raw) > MAX_UPLOAD: raise StudioError("REQUEST_SIZE", "Upload exceeds 128 MiB", "project")
    return raw


def create_project(catalog, payload):
    validate_protocol("ProjectCreateRequest", payload)
    from .studio import open_workspace, read, write
    catalog = Path(catalog).resolve(); catalog.mkdir(parents=True, exist_ok=True)
    project_id = uuid.uuid4().hex
    raw = decoded_upload(payload["data"])
    with tempfile.TemporaryDirectory(prefix=".project-import-", dir=catalog) as temporary:
        temp = Path(temporary)
        root = temp / "workspace"
        if payload["kind"] == "psd":
            source = temp / "input.psd"; source.write_bytes(raw)
            report = inspect_psd(source)
            if report["issues"]:
                return {"schemaVersion": 1, "status": "unsupported", "project": None, "issues": report["issues"]}
            open_workspace(root, source_psd=source)
        else:
            unpack_archive(raw, root)
        state = read(root / "studio-state.json")
        state.update(workspaceId=project_id, projectId=project_id, source="source.psd" if (root / "source.psd").exists() else "imported artwork")
        write(root / "studio-state.json", state)
        stamp = now()
        metadata = read(root / "project.json") if (root / "project.json").exists() else {"head": None}
        metadata.update(schemaVersion=1, name=payload["name"].strip(), updatedAt=stamp)
        metadata.setdefault("createdAt", stamp)
        write(root / "project.json", metadata)
        if not metadata["head"]: checkpoint(root, "导入 PSD")
        # Only the fully validated project becomes visible; existing projects are never replaced.
        root.rename(catalog / project_id)
    return {"schemaVersion": 1, "status": "ok", "project": summary(catalog / project_id), "issues": []}


def check_state_paths(state):
    for key, folder in (("latestBuild", "builds"), ("latestQa", "reviews"), ("latestImport", "imports"), ("latestExport", "deliveries")):
        value = state.get(key)
        if value is not None and not re.fullmatch(folder + r"/[a-f0-9]{32}", value):
            raise StudioError("INVALID_REQUEST", f"Invalid project reference: {key}", "project")
    if state.get("overlay") not in (None, "overlay.json"):
        raise StudioError("INVALID_REQUEST", "Invalid project Overlay reference", "project")
    attempt = state.get("lastBuildAttempt")
    if attempt and not re.fullmatch(r"builds/[a-f0-9]{32}", attempt.get("directory", "")):
        raise StudioError("INVALID_REQUEST", "Invalid build attempt reference", "project")
    for key, value in state.get("exportCache", {}).items():
        if not re.fullmatch(r"[a-f0-9]{64}", key) or not re.fullmatch(r"export-builds/[a-f0-9]{32}", value):
            raise StudioError("INVALID_REQUEST", "Invalid project export cache reference", "project")


def capture(root):
    from .studio import read
    data = read(root / "authoring-rig.json"); validate_authoring_rig(data, root)
    state = read(root / "studio-state.json"); check_state_paths(state)
    return {"ir": data, "settings": load_settings(root), "state": state,
            "overlay": read(root / "overlay.json") if state["overlay"] else None,
            "baseline": read(root / "overlay-baseline.json") if state["overlay"] else None}


def checkpoint(root, message, expected=None):
    from .studio import read, revision, write
    value = capture(root)
    if expected:
        if expected["revision"] != revision(value["ir"]):
            raise StudioError("BASE_CONFLICT", "Artwork changed before project save", "project")
        if expected["settingsRevision"] != settings_signature(value["settings"]):
            raise StudioError("SETTINGS_CONFLICT", "Settings changed before project save", "project")
        from .delivery import overlay_revision
        if "overlayRevision" in expected and expected["overlayRevision"] != overlay_revision(root, value["state"]):
            raise StudioError("BASE_CONFLICT", "Overlay changed before project save", "project")
    metadata = read(root / "project.json")
    if expected and expected["head"] != metadata["head"]:
        raise StudioError("PROJECT_CONFLICT", "Saved project head changed; read revisions before saving", "project")
    revision_id = uuid.uuid4().hex; stamp = now()
    record = {"schemaVersion": 1, "id": revision_id, "parent": metadata.get("head"), "createdAt": stamp,
              "message": message, **value}
    directory = root / "project-revisions" / revision_id; directory.mkdir(parents=True)
    write(directory / "revision.json", record)
    write(root / "project.json", {**metadata, "head": revision_id, "updatedAt": stamp})
    return revision_id


def revision_list(root):
    from .studio import read
    root = Path(root).resolve(strict=True)
    metadata = read(root / "project.json")
    records = []
    for file in (root / "project-revisions").glob("*/revision.json"):
        value = read(file)
        records.append({key: value[key] for key in ("id", "parent", "createdAt", "message")})
    return {"schemaVersion": 1, "head": metadata["head"], "revisions": sorted(records, key=lambda item: item["createdAt"], reverse=True)}


def save_project(root, payload):
    validate_protocol("ProjectSaveRequest", payload)
    from .studio import locked
    root = Path(root).resolve(strict=True)
    with locked(root): checkpoint(root, payload["message"], payload)
    return revision_list(root)


def validate_capture(value, root):
    validate_authoring_rig(value["ir"], root)
    validate_protocol("BuildSettings", value["settings"])
    check_state_paths(value["state"])
    if value["state"]["overlay"] and (not isinstance(value["overlay"], dict) or not isinstance(value["baseline"], dict)):
        raise StudioError("INVALID_REQUEST", "Revision is missing its Overlay or baseline", "project")
    for key in ("latestBuild", "latestQa", "latestImport", "latestExport"):
        relative = value["state"].get(key)
        if relative and (not (root / relative).is_dir() or not (root / relative).resolve().is_relative_to(root)):
            raise StudioError("INVALID_REQUEST", f"Revision resource missing: {relative}", "project")


def apply_transaction(root, transaction):
    """The next CLI entry completes an interrupted restore once the workspace lock is released."""
    from .studio import write
    validate_capture(transaction["capture"], root)
    value = transaction["capture"]
    write(root / "authoring-rig.json", value["ir"])
    write(root / "build-settings.json", value["settings"])
    if value["state"]["overlay"]:
        write(root / "overlay.json", value["overlay"]); write(root / "overlay-baseline.json", value["baseline"])
    write(root / "studio-state.json", value["state"])
    write(root / "project.json", transaction["metadata"])
    (root / ".project-transaction.json").unlink()


def recover_project(root):
    from .studio import locked, read
    root = Path(root)
    if (root / ".project-transaction.json").exists():
        with locked(root): apply_transaction(root, read(root / ".project-transaction.json"))


def restore_project(root, payload):
    validate_protocol("ProjectRestoreRequest", payload)
    from .studio import locked, read, write, revision, snapshot
    root = Path(root).resolve(strict=True)
    with locked(root):
        current = capture(root)
        if read(root / "project.json")["head"] != payload["head"]:
            raise StudioError("PROJECT_CONFLICT", "Saved project head changed before restore", "project")
        if payload["revision"] != revision(current["ir"]) or payload["settingsRevision"] != settings_signature(current["settings"]):
            raise StudioError("BASE_CONFLICT", "Project changed before restore; read the current project", "project")
        from .delivery import overlay_revision
        if "overlayRevision" in payload and payload["overlayRevision"] != overlay_revision(root, current["state"]):
            raise StudioError("BASE_CONFLICT", "Overlay changed before restore", "project")
        record = read(root / "project-revisions" / payload["id"] / "revision.json")
        validate_capture(record, root)
        # Preserve the current working state before moving to an older branch point.
        checkpoint(root, "恢复前自动保存")
        metadata = read(root / "project.json")
        target = {key: copy.deepcopy(record[key]) for key in ("ir", "settings", "state", "overlay", "baseline")}
        target["state"].update(workspaceId=current["state"]["workspaceId"], projectId=current["state"]["projectId"], source=current["state"]["source"])
        transaction = {"capture": target, "metadata": {**metadata, "head": record["id"], "updatedAt": now()}}
        write(root / ".project-transaction.json", transaction)
        apply_transaction(root, transaction)
    return snapshot(root)


def archive_path_allowed(name):
    path = PurePosixPath(name)
    if path.as_posix() != name or path.is_absolute() or any(part in ("", ".", "..") for part in path.parts) or "\\" in name or ":" in name:
        return False
    if len(path.parts) == 1: return name in ROOT_FILES
    if path.parts[0] == "assets": return len(path.parts) == 2 and path.suffix == ".png"
    if path.parts[0] == "downloads": return len(path.parts) == 2 and bool(re.fullmatch(r"[a-f0-9]{32}\.model\.zip", path.parts[1]))
    if path.parts[0] not in ("imports", "builds", "reviews", "project-revisions", "export-builds", "deliveries") or not ID.fullmatch(path.parts[1]): return False
    return path.suffix.lower() in (".png", ".json", ".txt", ".psd", ".moc3", ".cmo3")


def pack_archive(root):
    from .studio import read, locked
    root = Path(root).resolve(strict=True)
    with locked(root):
        capture(root)
        output = root / "downloads"; output.mkdir(exist_ok=True)
        paths = []
        for file in root.rglob("*"):
            relative = file.relative_to(root).as_posix()
            if file.is_file() and archive_path_allowed(relative):
                if not file.resolve().is_relative_to(root): raise ValueError("Project contains an external linked file")
                paths.append((relative, file))
        if len(paths) > 10000 or sum(file.stat().st_size for _, file in paths) > MAX_EXPANDED: raise ValueError("Project exceeds archive limits")
        for file in (root / "project-revisions").glob("*/revision.json"): validate_capture(read(file), root)
        files = [(relative, file.read_bytes()) for relative, file in paths]
        manifest = {"format": "live2d-studio-project", "schemaVersion": 1,
                    "files": {name: {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()} for name, raw in files}}
        filename = uuid.uuid4().hex + ".studio-project.zip"
        temporary = output / (filename + ".tmp")
        try:
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False))
                for name, raw in files: archive.writestr(name, raw)
            if temporary.stat().st_size > MAX_UPLOAD: raise ValueError("Portable project archive exceeds the 128 MiB import limit")
            os.replace(temporary, output / filename)
        finally: temporary.unlink(missing_ok=True)
    from .studio import file_url
    return {"schemaVersion": 1, "url": file_url(root, output / filename), "filename": read(root / "project.json")["name"] + ".studio-project.zip", "files": len(files)}


def unpack_archive(raw, root):
    from .studio import read
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(name.casefold() for name in names)) or len(names) > 10001 or sum(entry.file_size for entry in entries) > MAX_EXPANDED:
            raise ValueError("Invalid or oversized project archive")
        if archive.getinfo("manifest.json").file_size > 16 * 1024 * 1024 or any(entry.file_size > 256 * 1024 * 1024 for entry in entries):
            raise ValueError("Project archive entry exceeds size limit")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("format") != "live2d-studio-project" or manifest.get("schemaVersion") != 1:
            raise ValueError("Expected a Studio project archive version 1; desktop .psd2live is a different format")
        if set(names) != set(manifest["files"]) | {"manifest.json"}: raise ValueError("Archive manifest does not match its files")
        root.mkdir()
        for entry in entries:
            name = entry.filename
            if name == "manifest.json": continue
            if not archive_path_allowed(name) or entry.is_dir() or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Invalid project archive entry")
            data = archive.read(entry)
            expected = manifest["files"][name]
            if expected != {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}: raise ValueError("Project archive checksum mismatch")
            file = root / name; file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(data)
    validate_capture(capture(root), root)
    validate_authoring_rig(read(root / "origin-ir.json"), root)
    metadata = read(root / "project.json")
    if not ID.fullmatch(metadata.get("head", "")): raise ValueError("Invalid saved project head")
    for file in (root / "project-revisions").glob("*/revision.json"):
        value = read(file); validate_capture(value, root)
        if value["id"] != file.parent.name or value["parent"] is not None and not ID.fullmatch(value["parent"]): raise ValueError("Invalid project revision identity")
    if not (root / "project-revisions" / metadata["head"] / "revision.json").is_file(): raise ValueError("Project head revision is missing")
