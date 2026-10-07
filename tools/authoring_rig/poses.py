"""Project preview poses; these values never change artwork or native model bindings."""
import math
import uuid
from pathlib import Path
from .stale import _canonical_hash
from .studio_protocol import StudioError, validate_protocol

EMPTY = {"schemaVersion": 1, "items": []}


def validate_library(library):
    validate_protocol("PoseLibrary", library)
    ids = [pose["id"] for pose in library["items"]]
    if len(ids) != len(set(ids)) or any(not math.isfinite(v) for pose in library["items"] for v in pose["values"].values()):
        raise StudioError("INVALID_REQUEST", "Pose library contains duplicate identities or non-finite values", "poses")


def load_library(root):
    from .workspace_store import read
    path = Path(root) / "poses.json"
    library = read(path) if path.exists() else {"schemaVersion": 1, "items": []}
    validate_library(library)
    return library


def pose_state(root):
    library = load_library(root)
    return {"revision": _canonical_hash(library), "library": library}


def update_poses(root, payload):
    validate_protocol("PoseRequest", payload)
    from .workspace_store import locked, read, write
    from .workspace_query import snapshot
    root = Path(root).resolve(strict=True)
    with locked(root):
        library = load_library(root)
        if payload["posesRevision"] != _canonical_hash(library):
            raise StudioError("POSE_CONFLICT", "Saved poses changed; read the current project before saving", "poses")
        if payload["operation"] == "delete":
            if not any(pose["id"] == payload["id"] for pose in library["items"]):
                raise StudioError("INVALID_REQUEST", "Saved pose not found", "poses")
            library["items"] = [pose for pose in library["items"] if pose["id"] != payload["id"]]
        else:
            view = snapshot(root);state = read(root / "studio-state.json")
            if not view["build"] or view["stale"]["moc3"] or not view["build"].get("parameters"):
                raise StudioError("POSE_MODEL_UNAVAILABLE", "Save and rebuild the current project to obtain native parameter ranges", "poses")
            if (payload["revision"] != view["revision"] or payload["settingsRevision"] != view["buildSettings"]["revision"]
                    or payload["overlayRevision"] != view["overlayRevision"] or payload["buildId"] != state["latestBuild"]):
                raise StudioError("BASE_CONFLICT", "Model inputs changed before saving the pose", "poses")
            parameters = {parameter["id"]: parameter for parameter in view["build"]["parameters"]}
            for identifier, value in payload["values"].items():
                parameter = parameters.get(identifier)
                if parameter is None or not math.isfinite(value) or not parameter["min"] <= value <= parameter["max"]:
                    raise StudioError("INVALID_PARAMETER", f"Unknown or out-of-range pose parameter: {identifier}={value}", "poses", field=identifier)
            if not payload["name"].strip(): raise StudioError("INVALID_REQUEST", "Pose name cannot be empty", "poses")
            if len(library["items"]) >= 100: raise StudioError("INVALID_REQUEST", "At most 100 saved poses per project", "poses")
            library["items"].append({"id": uuid.uuid4().hex, "name": payload["name"].strip(), "values": payload["values"],
                                     "modelSha256": view["build"]["modelSha256"]})
        validate_library(library);write(root / "poses.json", library)
    return snapshot(root)
