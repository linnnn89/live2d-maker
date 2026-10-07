"""Workspace file primitives shared by pure use cases and compatibility entry points."""
import hashlib
import json
import os
import uuid
from contextlib import contextmanager
from pathlib import Path
from .studio_protocol import StudioError


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + f".{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def revision(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()


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
    state = read(Path(root) / "studio-state.json")
    prefix = f"/projects/{state['projectId']}" if state.get("projectId") else ""
    return prefix + "/studio-files/" + Path(file).relative_to(root).as_posix()
