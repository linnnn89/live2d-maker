"""Portable archives stream binary artifacts; fixtures do not generate native models."""
import base64
import hashlib
import json
import shutil
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from psd_tools import PSDImage
from tools.authoring_rig import projects
from tools.authoring_rig.delivery import file_manifest
from tools.authoring_rig.workspace_store import read, write
from tools.authoring_rig.workspace_query import snapshot


class StreamingArchives(unittest.TestCase):
    def fixture(self, directory):
        source = directory / "source.psd"
        psd = PSDImage.new("RGBA", (32, 32))
        psd.create_pixel_layer(Image.new("RGBA", (20, 20), (30, 80, 100, 255)), name="face", left=2, top=3)
        psd.save(source)
        catalog = directory / "projects"
        created = projects.create_project(catalog, {"schemaVersion": 1, "kind": "psd", "name": "Stream fixture",
            "data": base64.b64encode(source.read_bytes()).decode()})
        return catalog, projects.project_root(catalog, created["project"]["id"])

    def artifact(self, root, blocks=32):
        path = root / "builds" / uuid.uuid4().hex / "native" / "fixture.moc3"
        path.parent.mkdir(parents=True)
        chunk = bytes(range(256)) * 4096
        digest = hashlib.sha256()
        with path.open("wb") as target:
            for _ in range(blocks): target.write(chunk); digest.update(chunk)
        return path, {"bytes": len(chunk) * blocks, "sha256": digest.hexdigest()}

    def test_streamed_archive_reopens_all_revisions_poses_and_artifacts_without_original_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary); catalog, root = self.fixture(directory)
            artifact, expected = self.artifact(root)
            relative = artifact.relative_to(root).as_posix()
            library = {"schemaVersion": 1, "items": [{"id": uuid.uuid4().hex, "name": "Fixture pose",
                "values": {"ParamAngleX": 20}, "modelSha256": "a" * 64}]}
            write(root / "poses.json", library)
            view = snapshot(root)
            projects.save_project(root, {"schemaVersion": 1, "revision": view["revision"],
                "settingsRevision": view["buildSettings"]["revision"], "head": view["project"]["head"], "message": "Saved pose"})
            real_read = Path.read_bytes
            def no_whole_binary(path):
                if path == artifact or path.suffix == ".psd":
                    raise AssertionError("Archive read a complete binary artifact")
                return real_read(path)
            with patch.object(Path, "read_bytes", no_whole_binary):
                report = projects.pack_archive(root)
                self.assertEqual(file_manifest(artifact.parent), {artifact.name: expected})
            packed = root / "downloads" / Path(report["url"]).name
            with zipfile.ZipFile(packed) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                self.assertEqual(manifest["files"][relative], expected)
                self.assertEqual(sum(entry.file_size for entry in archive.infolist()) <= projects.MAX_EXPANDED, True)
            raw = packed.read_bytes(); original = (root / "source.psd").read_bytes()
            shutil.rmtree(root); (directory / "source.psd").unlink()
            real_zip_read = zipfile.ZipFile.read
            def only_manifest(archive, name, *args, **kwargs):
                if name != "manifest.json": raise AssertionError("Import read a complete archive entry")
                return real_zip_read(archive, name, *args, **kwargs)
            with patch.object(zipfile.ZipFile, "read", only_manifest):
                reopened = projects.create_project(catalog, {"schemaVersion": 1, "kind": "archive", "name": "Reopened",
                    "data": base64.b64encode(raw).decode()})
            clone = projects.project_root(catalog, reopened["project"]["id"])
            self.assertEqual((clone / "source.psd").read_bytes(), original)
            self.assertEqual(snapshot(clone)["poses"]["library"], library)
            self.assertEqual(len(projects.revision_list(clone)["revisions"]), 2)
            self.assertEqual(file_manifest((clone / relative).parent), {artifact.name: expected})

    def test_export_limits_include_manifest_and_match_import_entry_and_case_rules(self):
        with tempfile.TemporaryDirectory() as temporary:
            _, root = self.fixture(Path(temporary)); artifact, _ = self.artifact(root, blocks=1)
            output = root / "downloads"
            total = sum(file.stat().st_size for file in root.rglob("*") if file.is_file()
                and projects.archive_path_allowed(file.relative_to(root).as_posix()))
            for limits in ({"MAX_ENTRY_BYTES": 32768}, {"MAX_EXPANDED": total},
                           {"MAX_ARCHIVE_FILES": 1}, {"MAX_MANIFEST_BYTES": 16}, {"MAX_UPLOAD": 16}):
                with self.subTest(limits=limits), patch.multiple(projects, **limits), self.assertRaises(ValueError):
                    projects.pack_archive(root)
                self.assertEqual(list(output.glob("*.zip")), [])
                self.assertEqual(list(output.glob("*.tmp")), [])
                self.assertFalse((root / ".studio.lock").exists())
                self.assertTrue(artifact.is_file())
            asset = next((root / "assets").glob("*.png"))
            shutil.copyfile(asset, root / "assets" / "A.png"); shutil.copyfile(asset, root / "assets" / "a.png")
            with self.assertRaisesRegex(ValueError, "duplicate archive paths"):
                projects.pack_archive(root)
            self.assertEqual(list(output.glob("*.zip")), [])

    def test_interrupted_archive_cleans_partial_output_and_retains_project(self):
        with tempfile.TemporaryDirectory() as temporary:
            _, root = self.fixture(Path(temporary)); artifact, expected = self.artifact(root, blocks=3)
            metadata = (root / "project.json").read_bytes()
            real_open = Path.open
            class FailingSource:
                def __init__(self, source): self.source = source; self.calls = 0
                def __enter__(self): return self
                def __exit__(self, *args): self.source.close()
                def read(self, size):
                    self.assert_chunk(size); self.calls += 1
                    if self.calls == 2: raise OSError("interrupted binary read")
                    return self.source.read(size)
                def assert_chunk(self, size):
                    if size > projects.ARCHIVE_CHUNK_BYTES or size < 0: raise AssertionError("Unbounded read")
            def interrupted(path, mode="r", *args, **kwargs):
                source = real_open(path, mode, *args, **kwargs)
                return FailingSource(source) if path == artifact and mode == "rb" else source
            with patch.object(Path, "open", interrupted), self.assertRaisesRegex(OSError, "interrupted binary read"):
                projects.pack_archive(root)
            self.assertEqual(list((root / "downloads").iterdir()), [])
            self.assertFalse((root / ".studio.lock").exists())
            self.assertEqual((root / "project.json").read_bytes(), metadata)
            self.assertEqual(file_manifest(artifact.parent), {artifact.name: expected})
