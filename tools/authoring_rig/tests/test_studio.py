import copy
import base64
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

from tools.authoring_rig.studio import (open_workspace, save_workspace, snapshot, overlay_inputs, write,
                                      preview_generated, commit_generated)


class StudioPersistence(unittest.TestCase):
    def test_manual_external_and_ai_origins_preserve_protection_and_committed_source_records(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);workspace,first,payload=self.import_fixture(root)
            payload.pop("prompt")
            original={file:(workspace/file).read_bytes() for file in ("authoring-rig.json","source.png","origin-ir.json")}
            for kind in ("manual","external","ai"):
                origin={"kind":kind,"description":"Fixture author / source"}
                if kind=="ai": origin["prompt"]="Isolated hand-drawn tongue"
                preview=preview_generated(workspace,{**payload,"origin":origin})
                archive=workspace/"imports"/preview["id"]
                self.assertEqual(json.loads((archive/"asset-source.json").read_text()),origin)
                self.assertEqual(preview["report"]["source"],origin)
                self.assertEqual(preview["report"]["changed_bounds"],[9,9,10,10])
                self.assertEqual(preview["report"]["outside_changed_pixels"],0)
                self.assertEqual((archive/"generation-prompt.txt").exists(),kind=="ai")
                self.assertEqual({file:(workspace/file).read_bytes() for file in original},original)
                if kind=="manual": manual=preview
            candidate=json.loads((workspace/"imports"/manual["id"]/"candidate-ir.json").read_text())
            part=next(p for p in candidate["parts"] if p["id"]==manual["partId"])
            self.assertEqual(part["provenance"]["source"],"manual");self.assertNotIn("prompt",part["provenance"])
            self.assertEqual(part["provenance"]["upstreamHash"],hashlib.sha256(base64.b64decode(payload["generatedPng"])).hexdigest())
            imports=list((workspace/"imports").iterdir())
            mask=Image.new("L",(32,32));mask.putpixel((0,0),255);raw=io.BytesIO();mask.save(raw,format="PNG")
            with self.assertRaisesRegex(ValueError,r"outside the mask at canvas bounds \[9, 9, 10, 10\]"):
                preview_generated(workspace,{**payload,"origin":{"kind":"manual","description":"source"},"maskPng":base64.b64encode(raw.getvalue()).decode()})
            self.assertEqual(list((workspace/"imports").iterdir()),imports)
            archive=workspace/"imports"/manual["id"]
            for filename in ("generation-original.png","generation-mask.png","asset-source.json"):
                path=archive/filename;raw=path.read_bytes();path.write_bytes(b'{}' if filename.endswith('.json') else b'changed')
                with self.assertRaisesRegex(ValueError,"Import .*changed|Import evidence changed"):
                    commit_generated(workspace,{"id":manual["id"],"revision":first["revision"]})
                self.assertEqual((workspace/"authoring-rig.json").read_bytes(),original["authoring-rig.json"])
                path.write_bytes(raw)
            imported=commit_generated(workspace,{"id":manual["id"],"revision":first["revision"]})
            self.assertEqual(next(p for p in imported["ir"]["parts"] if p["id"]==manual["partId"])["provenance"],part["provenance"])
            with self.assertRaisesRegex(ValueError,"IR changed"):
                commit_generated(workspace,{"id":preview["id"],"revision":first["revision"]})
            rebuilt=root/"manual.psd"
            from tools.authoring_rig.builder import build_psd
            build_psd(workspace/"authoring-rig.json",rebuilt)
            self.assertEqual(len(PSDImage.open(rebuilt)),2)
            self.assertEqual((workspace/"source.png").read_bytes(),original["source.png"])

    def test_import_bounds_follow_reference_and_successful_model_versions(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace, first, payload = self.import_fixture(Path(temp))
            source = (workspace / "source.png").read_bytes()
            build = workspace / "builds" / "original"
            build.mkdir(parents=True)
            write(build / "build-ir.json", first["ir"])
            write(build / "build-report.json", {"status": "ok", "revision": first["revision"],
                                               "modelFile": "native/artwork.model3.json"})
            state = json.loads((workspace / "studio-state.json").read_text())
            state["latestBuild"] = "builds/original"
            write(workspace / "studio-state.json", state)
            mask = Image.new("L", (32, 32))
            mask.paste(255, (24, 24, 28, 28))
            raw = io.BytesIO()
            mask.save(raw, format="PNG")
            preview = preview_generated(workspace, {**payload, "bounds": [24, 24, 28, 28],
                                        "maskPng": base64.b64encode(raw.getvalue()).decode()})
            imported = commit_generated(workspace, {"id": preview["id"], "revision": first["revision"]})
            self.assertEqual(list(imported["sourceBounds"]), [4, 4, 20, 20])
            self.assertEqual(list(imported["artworkBounds"]), [4, 4, 26, 26])
            self.assertEqual(list(imported["build"]["modelBounds"]), [4, 4, 20, 20])
            self.assertEqual(imported["build"]["modelUrl"], "/studio-files/builds/original/native/artwork.model3.json")
            newer = workspace / "builds" / "imported"
            newer.mkdir()
            write(newer / "build-ir.json", imported["ir"])
            write(newer / "build-report.json", {"status": "ok", "revision": imported["revision"],
                                               "modelFile": "native/artwork.model3.json"})
            state = json.loads((workspace / "studio-state.json").read_text())
            state["latestBuild"] = "builds/imported"
            write(workspace / "studio-state.json", state)
            self.assertEqual(list(snapshot(workspace)["build"]["modelBounds"]), [4, 4, 26, 26])
            self.assertEqual((workspace / "source.png").read_bytes(), source)

    def import_fixture(self, root):
        source = root / "source.psd"
        psd = PSDImage.new("RGBA", (32, 32))
        psd.create_pixel_layer(Image.new("RGBA", (16, 16), (30, 60, 90, 255)), name="face", left=4, top=4)
        psd.save(source)
        workspace = root / "work"
        first = open_workspace(workspace, source_psd=source)
        sprite = Image.new("RGBA", (4, 4))
        sprite.putpixel((1, 1), (240, 20, 20, 255))
        mask = Image.new("L", (32, 32))
        mask.paste(255, (8, 8, 12, 12))
        def encoded(image):
            raw = io.BytesIO()
            image.save(raw, format="PNG")
            return base64.b64encode(raw.getvalue()).decode()
        return workspace, first, {"revision": first["revision"], "bounds": [8, 8, 12, 12],
                                  "name": "tongue", "prompt": "External transparent tongue fixture",
                                  "generatedPng": encoded(sprite), "maskPng": encoded(mask)}

    def test_import_preflight_commit_and_replace_preserve_original_resources(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace, first, payload = self.import_fixture(root)
            protected = {file: (workspace / file).read_bytes()
                         for file in ("authoring-rig.json", "studio-state.json", "source.png", "origin-ir.json")}
            source_bytes = (root / "source.psd").read_bytes()
            preview = preview_generated(workspace, payload)
            for file, content in protected.items():
                self.assertEqual((workspace / file).read_bytes(), content)
            self.assertEqual(preview["report"]["outside_changed_pixels"], 0)
            self.assertEqual(preview["report"]["outside_visible_pixels"], 0)
            self.assertEqual(preview["report"]["changed_pixels"], 1)
            added = commit_generated(workspace, {"id": preview["id"], "revision": first["revision"]})
            self.assertEqual(added["ir"]["parts"][:-1], first["ir"]["parts"])
            part = added["ir"]["parts"][-1]
            original_asset = (workspace / part["asset"]["path"]).read_bytes()
            self.assertEqual(part["id"], preview["partId"])
            self.assertTrue(added["stale"]["moc3"])
            self.assertTrue((workspace / added["artworkImage"].removeprefix("/studio-files/")).is_file())
            replacement = Image.new("RGBA", (4, 4))
            replacement.putpixel((1, 1), (20, 240, 20, 255))
            raw = io.BytesIO()
            replacement.save(raw, format="PNG")
            second = preview_generated(workspace, {**payload, "revision": added["revision"],
                                       "replacePart": part["id"], "generatedPng": base64.b64encode(raw.getvalue()).decode()})
            replaced = commit_generated(workspace, {"id": second["id"], "revision": added["revision"]})
            new_part = replaced["ir"]["parts"][-1]
            for key in ("id", "z", "appearance"):
                self.assertEqual(new_part[key], part[key])
            self.assertEqual(len(replaced["ir"]["parts"]), len(added["ir"]["parts"]))
            self.assertEqual((workspace / part["asset"]["path"]).read_bytes(), original_asset)
            for file in ("source.png", "origin-ir.json"):
                self.assertEqual((workspace / file).read_bytes(), protected[file])
            self.assertEqual((root / "source.psd").read_bytes(), source_bytes)

    def test_import_rejects_protected_pixels_stale_and_modified_candidates(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace, first, payload = self.import_fixture(Path(temp))
            with self.assertRaisesRegex(ValueError, "outside the mask"):
                preview_generated(workspace, {**payload, "bounds": [16, 16, 20, 20]})
            self.assertFalse((workspace / "imports").exists())
            self.assertEqual(snapshot(workspace)["ir"], first["ir"])
            preview = preview_generated(workspace, payload)
            edited = copy.deepcopy(first["ir"])
            edited["parts"][0]["geometry"]["polygon"][0] = [8, 8]
            saved = save_workspace(workspace, {"revision": first["revision"], "ir": edited})
            with self.assertRaisesRegex(ValueError, "another editor"):
                commit_generated(workspace, {"id": preview["id"], "revision": saved["revision"]})
            self.assertEqual(snapshot(workspace)["ir"], edited)
            fresh = preview_generated(workspace, {**payload, "revision": saved["revision"]})
            candidate_path = workspace / "imports" / fresh["id"] / "candidate-ir.json"
            candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
            candidate["parts"][-1]["z"] += 1
            write(candidate_path, candidate)
            with self.assertRaisesRegex(ValueError, "candidate changed"):
                commit_generated(workspace, {"id": fresh["id"], "revision": saved["revision"]})
            with self.assertRaisesRegex(ValueError, "preview ID"):
                commit_generated(workspace, {"id": "../authoring-rig.json", "revision": saved["revision"]})
            self.assertEqual(snapshot(workspace)["ir"], edited)

    def test_overlay_gate_tracks_native_evidence_and_current_inputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.psd"
            psd = PSDImage.new("RGBA", (32, 32))
            psd.create_pixel_layer(Image.new("RGBA", (16, 16), (30, 60, 90, 255)), name="face", left=4, top=4)
            psd.save(source)
            overlay = root / "overlay.json"
            baseline = root / "baseline.json"
            write(overlay, {"keyformSets": [{"target": {"kind": "ART_MESH", "id": "ArtMeshFace"},
                  "coordinate": {"ParamAngleX": 30}, "geometry": {"positionDeltas": [0.02, 0] * 3}}]})
            write(baseline, {"objects": [{"target": {"kind": "ART_MESH", "id": "ArtMeshFace"},
                                         "topologyInfo": {"vertexCount": 3}}]})
            workspace = root / "work"
            first = open_workspace(workspace, source_psd=source, overlay=overlay, overlay_baseline=baseline)
            self.assertEqual(first["overlay"]["status"], "needs-review")
            build = workspace / "builds" / "successful"
            build.mkdir(parents=True)
            write(build / "build-ir.json", first["ir"])
            state = json.loads((workspace / "studio-state.json").read_text())
            context = {"revision": first["revision"], "overlayInputs": overlay_inputs(workspace, state)}
            write(build / "build-report.json", {"status": "ok", **context, "modelFile": "native/artwork.model3.json"})
            state["latestBuild"] = "builds/successful"
            write(workspace / "studio-state.json", state)
            applied = snapshot(workspace)
            self.assertEqual(applied["overlay"]["status"], "ok")
            self.assertTrue(applied["overlay"]["applied"])
            self.assertFalse(applied["stale"]["moc3"])
            qa = workspace / "reviews" / "successful"
            qa.mkdir(parents=True)
            write(qa / "review.json", {"status": "ok", "studioRevision": first["revision"], "shots": []})
            state["latestQa"] = "reviews/successful"
            write(workspace / "studio-state.json", state)
            browser_ir = copy.deepcopy(first["ir"])
            for part in browser_ir["parts"]:
                part["geometry"]["polygon"] = [[int(x), int(y)] for x, y in part["geometry"]["polygon"]]
            roundtrip = save_workspace(workspace, {"revision": first["revision"], "ir": browser_ir})
            self.assertEqual(roundtrip["overlay"]["status"], "ok")
            self.assertFalse(roundtrip["stale"]["moc3"])
            self.assertFalse(roundtrip["stale"]["review"])
            candidate = copy.deepcopy(first["ir"])
            candidate["parts"][0]["geometry"]["polygon"][0] = [8, 8]
            changed = save_workspace(workspace, {"revision": roundtrip["revision"], "ir": candidate})
            self.assertEqual(changed["overlay"]["status"], "needs-review")
            self.assertTrue(changed["stale"]["moc3"])
            save_workspace(workspace, {"revision": changed["revision"], "ir": first["ir"]})
            # Failure for the same inputs must close QA, even when an older success exists.
            failed = workspace / "builds" / "failed"
            failed.mkdir()
            write(failed / "build-ir.json", first["ir"])
            write(failed / "failed-report.json", {"status": "broken", "reasons": ["Target missing"]})
            state["lastBuildAttempt"] = {**context, "directory": "builds/failed", "status": "broken"}
            write(workspace / "studio-state.json", state)
            rejected = snapshot(workspace)
            self.assertEqual(rejected["overlay"]["status"], "broken")
            self.assertTrue(rejected["stale"]["moc3"])
            self.assertEqual(rejected["build"]["modelUrl"], applied["build"]["modelUrl"])
            numeric_roundtrip = save_workspace(workspace, {"revision": rejected["revision"], "ir": browser_ir})
            self.assertEqual(numeric_roundtrip["overlay"]["status"], "broken")
            self.assertTrue(numeric_roundtrip["stale"]["moc3"])
            # Replacing the Overlay or its baseline cannot inherit a previous success.
            write(workspace / "overlay.json", {"parameters": []})
            replaced = snapshot(workspace)
            self.assertEqual(replaced["overlay"]["status"], "needs-review")
            self.assertTrue(replaced["stale"]["moc3"])
            (workspace / "overlay.json").write_bytes(overlay.read_bytes())
            write(workspace / "overlay-baseline.json", {"objects": [], "runtime": {"changed": True}})
            self.assertTrue(snapshot(workspace)["stale"]["moc3"])

    def test_revision_and_immutable_inputs_with_real_workspace(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.psd"
            psd = PSDImage.new("RGBA", (32, 32))
            psd.create_pixel_layer(Image.new("RGBA", (16, 16), (30, 60, 90, 255)), name="face", left=4, top=4)
            psd.save(source)
            original = source.read_bytes()
            workspace = root / "work"
            first = open_workspace(workspace, source_psd=source)
            candidate = copy.deepcopy(first["ir"])
            candidate["parts"][0]["geometry"]["polygon"][0] = [8, 8]
            result = save_workspace(workspace, {"revision": first["revision"], "ir": candidate})
            self.assertNotEqual(result["revision"], first["revision"])
            self.assertTrue(result["stale"]["psd"])
            self.assertEqual(snapshot(workspace)["ir"], candidate)
            with self.assertRaisesRegex(ValueError, "another editor"):
                save_workspace(workspace, {"revision": first["revision"], "ir": first["ir"]})
            forbidden = copy.deepcopy(candidate)
            forbidden["parts"][0]["id"] = "rewritten"
            with self.assertRaisesRegex(ValueError, "only geometry"):
                save_workspace(workspace, {"revision": result["revision"], "ir": forbidden})
            invalid = copy.deepcopy(candidate)
            invalid["parts"][0]["parameters"] = {}
            with self.assertRaises(Exception):
                save_workspace(workspace, {"revision": result["revision"], "ir": invalid})
            self.assertEqual(snapshot(workspace)["ir"], candidate)
            self.assertEqual(source.read_bytes(), original)
            origin = json.loads((workspace / "origin-ir.json").read_text(encoding="utf-8"))
            self.assertEqual(origin, first["ir"])
