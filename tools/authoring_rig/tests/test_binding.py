import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage
from tools.authoring_rig.studio import open_workspace, save_workspace
from tools.authoring_rig.studio_protocol import StudioError


class NativeClassification(unittest.TestCase):
    def test_native_identity_override_split_and_reset_round_trip(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.psd"
            psd = PSDImage.new("RGBA", (64, 64))
            for left in (4, 32):
                psd.create_pixel_layer(Image.new("RGBA", (20, 20), (90, 50, 20, 255)), name="face", left=left, top=4)
            eyes = Image.new("RGBA", (48, 10))
            eyes.paste((255, 255, 255, 255), (0, 0, 8, 10))
            eyes.paste((255, 255, 255, 255), (40, 0, 48, 10))
            psd.create_pixel_layer(eyes, name="eyewhite", left=8, top=12)
            psd.save(source)
            work = root / "workspace"
            first = open_workspace(work, source_psd=source)
            names = [part["name"] for part in first["ir"]["parts"]]
            source_bytes = source.read_bytes()
            def rebuild():
                process = subprocess.run([sys.executable, "-m", "tools.authoring_rig", "studio-rebuild", "--workspace", str(work)],
                    cwd=Path(__file__).resolve().parents[3], capture_output=True, text=True, encoding="utf-8", timeout=90)
                self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
                return json.loads(process.stdout)
            baseline = rebuild()
            mapping = baseline["build"]["classifications"]
            faces = [item for item in mapping if item["semanticTag"] == "FACE"]
            self.assertEqual(len(faces), 2)
            self.assertEqual(len({item["drawable"] for item in faces}), 2)
            self.assertEqual(len({item["partId"] for item in faces}), 2)
            eye = next(part for part in first["ir"]["parts"] if part["name"] == "eyewhite")
            components = [item for item in mapping if item["partId"] == eye["id"]]
            self.assertEqual({item["side"] for item in components}, {"LEFT", "RIGHT"})
            self.assertEqual(len({item["componentId"] for item in components}), 2)
            selected = first["ir"]["parts"][0]["id"]
            candidate = copy.deepcopy(first["ir"])
            candidate["parts"][0]["semantic"]["override"] = {"tag": "TAIL", "side": "left"}
            saved = save_workspace(work, {"revision": baseline["revision"], "ir": candidate})
            self.assertFalse(saved["stale"]["psd"])
            self.assertTrue(saved["stale"]["moc3"])
            changed = rebuild()
            adopted = [item for item in changed["build"]["classifications"] if item["partId"] == selected]
            self.assertEqual(len(adopted), 1)
            self.assertEqual((adopted[0]["automaticTag"], adopted[0]["semanticTag"], adopted[0]["side"]), ("FACE", "TAIL", "LEFT"))
            self.assertEqual(adopted[0]["requestedOverride"], {"tag": "TAIL", "side": "left"})
            self.assertEqual([part["name"] for part in changed["ir"]["parts"]], names)
            self.assertEqual(source.read_bytes(), source_bytes)
            for mutate in ("automatic", "invalid"):
                invalid = copy.deepcopy(candidate)
                if mutate == "automatic": invalid["parts"][0]["semantic"]["tag"] = "TAIL"
                else: invalid["parts"][0]["semantic"]["override"]["tag"] = "TYPO"
                with self.assertRaises(StudioError) as caught:
                    save_workspace(work, {"revision": changed["revision"], "ir": invalid})
                self.assertEqual(caught.exception.detail["code"], "EDIT_SCOPE" if mutate == "automatic" else "INVALID_REQUEST")
            reset = copy.deepcopy(candidate)
            del reset["parts"][0]["semantic"]["override"]
            save_workspace(work, {"revision": changed["revision"], "ir": reset})
            restored = rebuild()
            self.assertEqual(restored["build"]["classifications"], baseline["build"]["classifications"])
            self.assertEqual(restored["build"]["modelSha256"], baseline["build"]["modelSha256"])
