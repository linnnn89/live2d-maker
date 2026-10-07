"""Pure workspace storage/query boundaries; no native runtime is launched."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.authoring_rig import workspace_store as store
from tools.authoring_rig.workspace_query import snapshot
from tools.authoring_rig.studio_protocol import StudioError
from tools.authoring_rig.tests import test_studio as fixtures


class WorkspaceStorage(unittest.TestCase):
    def test_failed_atomic_replace_keeps_previous_file_and_removes_staging(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "record.json"
            store.write(path, {"name": "已保存"})
            original = path.read_bytes()
            with patch("tools.authoring_rig.workspace_store.os.replace", side_effect=OSError("disk failure")):
                with self.assertRaises(OSError):
                    store.write(path, {"name": "new"})
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(list(Path(temporary).glob("*.tmp")), [])
            with self.assertRaises(ValueError):
                store.write(path, {"number": float("nan")})
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(list(Path(temporary).glob("*.tmp")), [])

    def test_writer_lock_rejects_competition_and_releases_on_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(RuntimeError, "operation failed"):
                with store.locked(root):
                    with self.assertRaises(StudioError) as competing:
                        with store.locked(root):
                            self.fail("competing writer entered")
                    self.assertEqual(competing.exception.detail["code"], "BACKEND_BUSY")
                    self.assertTrue((root / ".studio.lock").is_file())
                    raise RuntimeError("operation failed")
            self.assertFalse((root / ".studio.lock").exists())
            with store.locked(root):
                self.assertTrue((root / ".studio.lock").is_file())

    def test_query_migrates_identity_under_existing_lock_and_keeps_compatibility_cli(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, first, _ = fixtures.StudioPersistence().import_fixture(Path(temporary))
            originals = {name: (root / name).read_bytes() for name in ("source.png", "origin-ir.json", "authoring-rig.json")}
            state = store.read(root / "studio-state.json"); state.pop("workspaceId")
            store.write(root / "studio-state.json", state)
            with store.locked(root), self.assertRaises(StudioError):
                snapshot(root)
            self.assertNotIn("workspaceId", store.read(root / "studio-state.json"))
            view = snapshot(root)
            self.assertEqual(view["workspaceId"], snapshot(root)["workspaceId"])
            self.assertEqual(view["revision"], first["revision"])
            from tools.authoring_rig import studio
            self.assertIs(studio.read, store.read); self.assertIs(studio.locked, store.locked)
            self.assertIs(studio.snapshot, snapshot)
            result = subprocess.run([sys.executable, "-m", "tools.authoring_rig", "studio-open", "--workspace", str(root)],
                cwd=Path(__file__).resolve().parents[3], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads(result.stdout), json.loads(json.dumps(view)))
            self.assertEqual({name: (root / name).read_bytes() for name in originals}, originals)

    def test_standalone_query_import_does_not_load_cli_or_native_orchestration(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, _, _ = fixtures.StudioPersistence().import_fixture(Path(temporary))
            result = subprocess.run([sys.executable, "-c", "import sys; from tools.authoring_rig.workspace_query import snapshot; "
                "snapshot(sys.argv[1]); assert 'tools.authoring_rig.studio' not in sys.modules; "
                "assert 'tools.authoring_rig.native' not in sys.modules", str(root)],
                cwd=Path(__file__).resolve().parents[3], capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
