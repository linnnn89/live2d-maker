import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from tools.authoring_rig.studio import open_workspace, save_build_settings, save_workspace, snapshot, write
from tools.authoring_rig.studio_protocol import StudioError


class ProjectBuildSettings(unittest.TestCase):
    def test_persist_conflicts_native_adoption_and_failed_overlay_settings_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            psd = PSDImage.new("RGBA", (140, 140))
            psd.create_pixel_layer(Image.new("RGBA", (120, 120), (70, 90, 110, 255)), name="face", left=10, top=10)
            source = root / "source.psd"; psd.save(source)
            work = root / "workspace"
            first = open_workspace(work, source_psd=source)
            def rebuild(expect=0):
                result = subprocess.run([sys.executable, "-m", "tools.authoring_rig", "studio-rebuild", "--workspace", str(work)],
                    cwd=Path(__file__).resolve().parents[3], capture_output=True, text=True, encoding="utf-8", timeout=90)
                self.assertEqual(result.returncode, expect, result.stdout + result.stderr)
                return json.loads(result.stdout)
            baseline = rebuild()
            self.assertFalse((work / "build-settings.json").exists())
            state = json.loads((work / "studio-state.json").read_text())
            base_dir = work / state["latestBuild"]
            base = json.loads((base_dir / "native/native-base.json").read_text())
            source_bytes, ir_bytes = source.read_bytes(), (work / "authoring-rig.json").read_bytes()
            settings = {**first["buildSettings"]["settings"], "atlasSize": 1024, "meshInteriorDensity": 12, "headTurnStrength": 0}
            payload = {"schemaVersion": 1, "revision": first["revision"], "settingsRevision": first["buildSettings"]["revision"], "settings": settings}
            changed = save_build_settings(work, payload)
            self.assertEqual(changed["revision"], first["revision"])
            self.assertFalse(changed["stale"]["psd"])
            self.assertTrue(changed["stale"]["moc3"])
            self.assertEqual(snapshot(work)["buildSettings"], changed["buildSettings"])
            for update, code in (({}, "SETTINGS_CONFLICT"), ({"revision": "old"}, "BASE_CONFLICT"),
                                 ({"settings": {**settings, "atlasSize": 123}}, "INVALID_REQUEST")):
                with self.assertRaises(StudioError) as caught: save_build_settings(work, {**payload, **update})
                self.assertEqual(caught.exception.detail["code"], code)
                self.assertEqual(snapshot(work)["buildSettings"], changed["buildSettings"])
            built = rebuild()
            self.assertFalse(built["stale"]["moc3"])
            self.assertEqual(built["build"]["buildSettings"], settings)
            state = json.loads((work / "studio-state.json").read_text()); directory = work / state["latestBuild"]
            labels = json.loads((directory / "native/artwork.psd2live.json").read_text())
            self.assertEqual((labels["config"]["atlasSize"], labels["config"]["meshInteriorDensity"], labels["config"]["headTurnStrength"]), (1024, 12, 0))
            adopted = json.loads((directory / "native/native-base.json").read_text())
            def vertices(value): return next(item["topologyInfo"]["vertexCount"] for item in value["objects"] if item["target"]["id"] == "ArtMeshFace")
            self.assertGreater(vertices(adopted), vertices(base))
            self.assertNotEqual(adopted["modelSha256"], base["modelSha256"])
            self.assertEqual((work / "authoring-rig.json").read_bytes(), ir_bytes)
            self.assertEqual(source.read_bytes(), source_bytes)
            note = copy.deepcopy(built["ir"]); note["parts"][0]["geometry"]["landmarks"] = {"note": [20, 20]}
            annotated = save_workspace(work, {"revision": built["revision"], "ir": note})
            self.assertFalse(annotated["stale"]["moc3"])
            # A failed attempt belongs to its captured settings, even when the IR revision is unchanged.
            write(work / "overlay.json", {"keyformSets": [{"target": {"kind": "art_mesh", "id": "ArtMeshFace"},
                                                          "coordinate": {"UnknownParameter": 30}, "channels": {"opacity": 0.5}}]})
            write(work / "overlay-baseline.json", adopted)
            state["overlay"] = "overlay.json"; write(work / "studio-state.json", state)
            rebuild(1)
            self.assertEqual(snapshot(work)["overlay"]["status"], "broken")
            current = snapshot(work)
            save_build_settings(work, {"schemaVersion": 1, "revision": current["revision"],
                "settingsRevision": current["buildSettings"]["revision"], "settings": first["buildSettings"]["settings"]})
            self.assertNotEqual(snapshot(work)["overlay"]["status"], "broken")
            self.assertEqual(json.loads((work / "studio-state.json").read_text())["latestBuild"], state["latestBuild"])
