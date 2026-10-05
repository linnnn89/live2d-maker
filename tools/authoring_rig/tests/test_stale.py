"""Tests for P4 stale DAG evaluation and Overlay compatibility checks."""
import copy
import sys
import json
import subprocess
import tempfile
import unittest
import os
import hashlib
import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from authoring_rig.stale import check_overlay_compatibility, compute_signatures, evaluate_dag_stale


class TestStaleAndOverlay(unittest.TestCase):
    def setUp(self):
        # Base fixture IR with 2 parts
        self.base_ir = {
            "schemaVersion": "0.1.0",
            "canvas": {"width": 1280, "height": 1280},
            "sourceImageHash": "a" * 64,
            "metadata": {"name": "test_model", "author": "tester"},
            "parts": [
                {
                    "id": "part_000_back_hair",
                    "name": "back hair",
                    "z": 0,
                    "asset": {
                        "path": "assets/part_000_back_hair.png",
                        "sha256": "b" * 64,
                        "size": {"width": 100, "height": 100},
                        "offset": {"left": 50, "top": 50},
                    },
                    "geometry": {
                        "bbox": [50, 50, 150, 150],
                        "polygon": [[50.0, 50.0], [150.0, 50.0], [150.0, 150.0], [50.0, 150.0]],
                    },
                    "semantic": {
                        "tag": "BACK_HAIR",
                        "side": "none",
                        "confidence": 1.0,
                    },
                    "provenance": {
                        "source": "psd-import",
                        "toolVersion": "test_1.0",
                        "timestamp": "2026-10-05T00:00:00Z",
                    },
                },
                {
                    "id": "part_001_face",
                    "name": "face",
                    "z": 1,
                    "asset": {
                        "path": "assets/part_001_face.png",
                        "sha256": "c" * 64,
                        "size": {"width": 200, "height": 200},
                        "offset": {"left": 200, "top": 200},
                    },
                    "geometry": {
                        "bbox": [200, 200, 400, 400],
                        "polygon": [[200.0, 200.0], [400.0, 200.0], [400.0, 400.0], [200.0, 400.0]],
                    },
                    "semantic": {
                        "tag": "FACE",
                        "side": "none",
                        "confidence": 1.0,
                    },
                    "provenance": {
                        "source": "psd-import",
                        "toolVersion": "test_1.0",
                        "timestamp": "2026-10-05T00:00:00Z",
                    },
                },
            ],
        }

    def test_case_1_modify_polygon_stales_psd_and_downstream(self):
        """Case 1: Modifying polygon stales PSD and all downstream stages."""
        new_ir = copy.deepcopy(self.base_ir)
        new_ir["parts"][0]["geometry"]["polygon"][0] = [60.0, 60.0]

        result = evaluate_dag_stale(self.base_ir, new_ir)
        stale = result["stale"]

        self.assertTrue(stale["psd"], "PSD must be stale when polygon changes")
        self.assertTrue(stale["base_rig"], "base_rig must be stale when PSD is stale")
        self.assertTrue(stale["overlay_apply"], "overlay_apply must be stale when base_rig is stale")
        self.assertTrue(stale["moc3"], "moc3 must be stale")
        self.assertTrue(stale["review"], "review must be stale")

    def test_case_2_modify_semantic_only_stales_base_rig_not_psd(self):
        """Case 2: Modifying semantic ONLY stales PSD2Live base_rig and downstream; PSD is NOT stale."""
        new_ir = copy.deepcopy(self.base_ir)
        new_ir["parts"][0]["semantic"]["tag"] = "FRONT_HAIR"

        result = evaluate_dag_stale(self.base_ir, new_ir)
        stale = result["stale"]

        self.assertFalse(stale["psd"], "PSD must NOT be stale when only semantic changes")
        self.assertTrue(stale["base_rig"], "base_rig MUST be stale when semantic changes")
        self.assertTrue(stale["overlay_apply"], "overlay_apply must be stale")
        self.assertTrue(stale["moc3"], "moc3 must be stale")
        self.assertTrue(stale["review"], "review must be stale")

    def test_case_3_modify_view_metadata_only_not_stale(self):
        """Case 3: Modifying metadata or view state does not stale any stage."""
        new_ir = copy.deepcopy(self.base_ir)
        new_ir["metadata"]["author"] = "another_author"
        new_ir["metadata"]["updatedAt"] = "2026-10-05T12:00:00Z"
        new_ir["parts"][0]["provenance"]["timestamp"] = "2026-10-05T12:00:00Z"

        result = evaluate_dag_stale(self.base_ir, new_ir)
        stale = result["stale"]

        self.assertFalse(stale["psd"], "PSD must not be stale")
        self.assertFalse(stale["base_rig"], "base_rig must not be stale")
        self.assertFalse(stale["overlay_apply"], "overlay_apply must not be stale")
        self.assertFalse(stale["moc3"], "moc3 must not be stale")
        self.assertFalse(stale["review"], "review must not be stale")

    def test_case_4_overlay_broken_on_deleted_target(self):
        """Case 4: Overlay referencing a deleted target is marked broken (never silently applied)."""
        overlay = {
            "keyformSets": [
                {
                    "target": {
                        "kind": "art_mesh",
                        "id": "part_000_back_hair",
                    },
                    "coordinate": {"ParamAngleX": 30.0},
                    "geometry": {"positionDeltas": [0.0, 0.0, 1.0, 1.0]},
                },
                {
                    "target": {
                        "kind": "art_mesh",
                        "id": "deleted_target_id",
                    },
                    "coordinate": {"ParamAngleX": 30.0},
                    "channels": {"opacity": 0.5},
                },
            ]
        }

        compat = check_overlay_compatibility(overlay, self.base_ir, [
            {"target": {"kind": "art_mesh", "id": "part_000_back_hair"}, "topologyInfo": {"vertexCount": "2"}}
        ])
        self.assertEqual(compat["status"], "broken")
        self.assertTrue(any("deleted_target_id" in b for b in compat["broken_targets"]))

    def test_case_5_overlay_requires_real_rig_targets(self):
        """IR names and IDs alone cannot prove that a native rig target exists."""
        overlay = {
            "keyformSets": [
                {
                    "target": {
                        "kind": "art_mesh",
                        "id": "part_000_back_hair",
                    },
                    "coordinate": {"ParamAngleX": 30.0},
                    "channels": {"opacity": 0.8},
                }
            ]
        }

        compat = check_overlay_compatibility(overlay, self.base_ir)
        self.assertEqual(compat["status"], "needs-review")
        compat = check_overlay_compatibility(overlay, self.base_ir, [
            {"target": {"kind": "art_mesh", "id": "part_000_back_hair"}}
        ])
        self.assertEqual(compat["status"], "ok")
        self.assertEqual(len(compat["broken_targets"]), 0)

    def test_native_overlay_sections_and_upstream_changes(self):
        """Persisted native sections and ambiguous topology must never pass silently."""
        native_objects = [
            {"target": {"kind": "ART_MESH", "id": "ArtMeshFace"}, "topologyInfo": {"vertexCount": "3", "triangleCount": "1"}},
            {"target": {"kind": "WARP_DEFORMER", "id": "head"}, "topologyInfo": {"controlPointsCount": "4"}},
        ]
        native_overlay = {"rigEdits": {"keyformSets": [{
            "target": {"kind": "ART_MESH", "id": "ArtMeshFace"},
            "coordinate": {"ParamAngleX": 30}, "geometry": {"positionDeltas": [0.0] * 6}
        }]}}
        self.assertEqual(check_overlay_compatibility(native_overlay, self.base_ir, native_objects)["status"], "needs-review")
        native_overlay["rigEdits"]["keyformSets"][0]["geometry"]["positionDeltas"] = [0.0] * 4
        self.assertEqual(check_overlay_compatibility(native_overlay, self.base_ir, native_objects)["status"], "broken")
        for overlay in (
            {"keyformDeletes": [{"target": {"kind": "WARP_DEFORMER", "id": "deleted"}}]},
            {"keyformCopies": [{"sourceTarget": {"kind": "ART_MESH", "id": "ArtMeshFace"},
                                "destinationTarget": {"kind": "ROTATION_DEFORMER", "id": "deleted"}}]},
            {"authoringJournal": [{"op": "delete", "target": "mesh:deleted", "parameter": "ParamAngleX"}]},
            {"keyformSets": [{"target": {"kind": "unknown", "id": "face"}}]},
            {"keyformSets": [{"target": {"kind": "glue", "id": "ArtMeshFace"}}]},
        ):
            with self.subTest(overlay=overlay):
                self.assertEqual(check_overlay_compatibility(overlay, self.base_ir, native_objects)["status"], "broken")
        self.assertEqual(check_overlay_compatibility({"structure": [{"action": "create_warp"}]}, self.base_ir)["status"], "needs-review")
        ordered = {"authoringJournal": [{"op": "warp", "warp": {"id": "new-warp"}},
                    {"op": "set", "target": "warp:new-warp", "key": {"ParamAngleX": 30},
                     "channels": {"opacity": 0.5}}]}
        self.assertEqual(check_overlay_compatibility(ordered, self.base_ir, [])['status'], 'needs-review')
        ordered['authoringJournal'].reverse()
        self.assertEqual(check_overlay_compatibility(ordered, self.base_ir, [])['status'], 'broken')
        # Exercise the public module entry point: an unsafe preflight must be non-zero.
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            ir_path, overlay_path = directory / "ir.json", directory / "overlay.json"
            ir_path.write_text(json.dumps(self.base_ir), encoding="utf-8")
            overlay_path.write_text(json.dumps(native_overlay), encoding="utf-8")
            result = subprocess.run([sys.executable, "-m", "tools.authoring_rig", "check-overlay",
                                     "--ir", str(ir_path), "--overlay", str(overlay_path)],
                                    cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)["status"], "needs-review")
        for change in ("source", "z", "appearance", "asset"):
            edited = copy.deepcopy(self.base_ir)
            if change == "source":
                edited["sourceImageHash"] = "d" * 64
            elif change == "z":
                edited["parts"][0]["z"], edited["parts"][1]["z"] = 1, 0
            elif change == "appearance":
                edited["parts"][0]["appearance"] = {"visible": False, "opacity": 255}
            else:
                edited["parts"][0]["asset"]["sha256"] = "e" * 64
            result = evaluate_dag_stale(self.base_ir, edited)
            self.assertTrue(result["stale"]["psd"])
            self.assertTrue(result["stale"]["review"])
            self.assertEqual(result["stale"]["ir"], change == "source")

        # Exercise native rebuild -> applyTo -> integrity validators -> MOC3 export.
        # Fresh processes pin the bundled JVM; no system Java/Gradle or download is used.
        from psd_tools import PSDImage
        (ROOT / "out").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="native-overlay-test-", dir=ROOT / "out") as temporary:
            directory = Path(temporary)
            source = ROOT / "psd2live/examples/ds/psd-input/ds.psd"

            def run_native(*args):
                result = subprocess.run([sys.executable, "-m", "tools.authoring_rig", *map(str, args)],
                                        cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                                        env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=90)
                data = json.loads(result.stdout)
                self.assertEqual(result.returncode, 0 if data["status"] == "ok" else 1, result.stderr)
                return data

            report = run_native("native-base", "--psd", source, "--outdir", directory / "base")
            self.assertEqual(report["status"], "ok", report)
            baseline_file = Path(report["baseline"])
            baseline = json.loads(baseline_file.read_text(encoding="utf-8"))
            count = next(obj["topologyInfo"]["vertexCount"] for obj in baseline["objects"] if obj["target"]["id"] == "ArtMeshFace")
            overlay = {"keyformSets": [{"target": {"kind": "ART_MESH", "id": "ArtMeshFace"},
                        "coordinate": {"ParamAngleX": 30}, "geometry": {"positionDeltas": [0.02, 0.0] * count},
                        "channels": {"opacity": 0.45}}]}
            overlay_file = directory / "overlay.json"
            overlay_file.write_text(json.dumps(overlay), encoding="utf-8")
            report = run_native("native-replay", "--psd", source, "--overlay", overlay_file,
                                "--baseline", baseline_file, "--outdir", directory / "replayed")
            self.assertEqual(report["status"], "ok", report)
            self.assertTrue(report["applied"])
            self.assertTrue((directory / "replayed/ds.moc3").is_file())
            self.assertNotEqual(hashlib.sha256((directory / "base/ds.moc3").read_bytes()).hexdigest(),
                                hashlib.sha256((directory / "replayed/ds.moc3").read_bytes()).hexdigest())
            # Verify the original workflow in the actual Cubism renderer, not just file existence.
            import numpy as np
            from PIL import Image
            with socket.socket() as server:
                server.bind(("127.0.0.1", 0))
                port = server.getsockname()[1]
            for label in ("base", "replayed"):
                spec = {"model": f"/{(directory / label / 'ds.model3.json').relative_to(ROOT).as_posix()}",
                        "vendor": "/live2d-viewer/public/vendor/cubism/", "canvas": [320, 320], "canvaspx": [1280, 1280],
                        "shots": [{"name": "neutral", "params": {}}, {"name": "edited", "params": {"ParamAngleX": 30}},
                                  {"name": "minus", "params": {"ParamAngleX": -30}}]}
                spec_path = directory / f"{label}-spec.json"
                spec_path.write_text(json.dumps(spec), encoding="utf-8")
                result = subprocess.run([sys.executable, str(ROOT / "live2d-viewer/qa.py"), "--spec", str(spec_path),
                                         "--outdir", str(directory / f"{label}-review"), "--port", str(port)],
                                        cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                                        env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=45)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)["status"], "ok")
            for name in ("neutral", "edited"):
                a = np.array(Image.open(directory / f"base-review/full/{name}.png"))
                b = np.array(Image.open(directory / f"replayed-review/full/{name}.png"))
                changed_pixels = np.count_nonzero(np.any(a != b, axis=2))
                self.assertEqual(changed_pixels == 0, name == "neutral")
            for label, mutation, expected in (
                ("missing", "target", "broken"), ("short", "geometry", "broken"),
                ("parameter", "coordinate", "broken"), ("journal", "journal", "needs-review"),
                ("channel", "channels", "error")):
                bad = copy.deepcopy(overlay)
                if mutation == "target": bad["keyformSets"][0]["target"]["id"] = "deleted"
                elif mutation == "geometry": bad["keyformSets"][0]["geometry"]["positionDeltas"] = [0.0, 0.0]
                elif mutation == "coordinate": bad["keyformSets"][0]["coordinate"] = {"ParamDoesNotExist": 1}
                elif mutation == "channels": bad["keyformSets"][0]["channels"] = {"flipX": True}
                else: bad["authoringJournal"] = [{"op": "rename", "target": "mesh:ArtMeshFace"}]
                overlay_file.write_text(json.dumps(bad), encoding="utf-8")
                destination = directory / label
                with self.subTest(native=label):
                    report = run_native("native-replay", "--psd", source, "--overlay", overlay_file,
                                        "--baseline", baseline_file, "--outdir", destination)
                    self.assertEqual(report["status"], expected, report)
                    self.assertFalse(report.get("applied", False))
                    self.assertFalse(destination.exists())
            # Shift a layer without changing its pixels or dimensions: point counts still match,
            # but the native rest geometry/deformer basis differs and replay must stop.
            psd = PSDImage.open(source)
            face = next(layer for layer in psd if layer.name == "face")
            face._record.left += 1
            face._record.right += 1
            changed = directory / "changed.psd"
            psd.save(changed)
            overlay_file.write_text(json.dumps(overlay), encoding="utf-8")
            report = run_native("native-replay", "--psd", changed, "--overlay", overlay_file,
                                "--baseline", baseline_file, "--outdir", directory / "changed")
            self.assertEqual(report["status"], "needs-review", report)
            self.assertFalse(report["applied"])
            self.assertFalse((directory / "changed").exists())
            current_count = next(obj["topologyInfo"]["vertexCount"] for obj in report["current_objects"] if obj["target"]["id"] == "ArtMeshFace")
            self.assertEqual(current_count, count)
            self.assertTrue(report["changed_model_fields"])

            # Persisted sets/copies/deletes replay in native order. The interactive delete
            # method must not discard the source set before the copy has sampled it.
            target = {"kind": "ART_MESH", "id": "ArtMeshFace"}
            copy_delete = {
                "keyformSets": [{"target": target, "coordinate": {"ParamAngleX": 30}, "channels": {"opacity": 0.45}}],
                "keyformCopies": [{"sourceTarget": target, "sourceCoordinate": {"ParamAngleX": 30},
                                   "destinationTarget": target, "destinationCoordinate": {"ParamAngleX": -30}, "channels": ["opacity"]}],
                "keyformDeletes": [{"target": target, "parameterId": "ParamAngleX", "keyValue": 30, "channel": "opacity"}]}
            parameter_overlay = {
                "parameters": [{"id": "ParamAuditVisibility", "name": "Audit visibility", "min": 0, "max": 1, "default": 0,
                                "kind": "NORMAL", "repeat": False, "created": True}],
                "keyformSets": [{"target": target, "coordinate": {"ParamAuditVisibility": 1}, "channels": {"opacity": 0.45}}]}
            for label, edits, shots in (
                ("copy-delete", copy_delete, [{"name": "neutral", "params": {}}, {"name": "edited", "params": {"ParamAngleX": 30}},
                                             {"name": "minus", "params": {"ParamAngleX": -30}}]),
                ("parameter", parameter_overlay, [{"name": "neutral", "params": {}}, {"name": "half", "params": {"ParamAuditVisibility": 0.5}},
                                                  {"name": "one", "params": {"ParamAuditVisibility": 1}}])):
                overlay_file.write_text(json.dumps(edits), encoding="utf-8")
                destination = directory / label
                report = run_native("native-replay", "--psd", source, "--overlay", overlay_file,
                                    "--baseline", baseline_file, "--outdir", destination)
                self.assertEqual(report["status"], "ok", report)
                if label == "copy-delete":
                    self.assertEqual((report["native_keyform_sets"], report["native_keyform_copies"], report["native_keyform_deletes"]), (1, 1, 1))
                else:
                    self.assertEqual(report["native_parameter_edits"], 1)
                spec = {"model": f"/{(destination / 'ds.model3.json').relative_to(ROOT).as_posix()}",
                        "vendor": "/live2d-viewer/public/vendor/cubism/", "canvas": [320, 320], "canvaspx": [1280, 1280], "shots": shots}
                spec_path = directory / f"{label}-spec.json"
                spec_path.write_text(json.dumps(spec), encoding="utf-8")
                result = subprocess.run([sys.executable, str(ROOT / "live2d-viewer/qa.py"), "--spec", str(spec_path),
                                         "--outdir", str(directory / f"{label}-review"), "--port", str(port)],
                                        cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                                        env={**os.environ, "PYTHONIOENCODING": "utf-8"}, timeout=45)
                self.assertEqual(result.returncode, 0, result.stderr)
                for shot in shots:
                    original = shot["name"] if label == "copy-delete" else "neutral"
                    a = np.array(Image.open(directory / f"base-review/full/{original}.png"), dtype=int)
                    b = np.array(Image.open(directory / f"{label}-review/full/{shot['name']}.png"), dtype=int)
                    change = np.abs(a - b).max()
                    unchanged = shot["name"] in ({"neutral", "edited"} if label == "copy-delete" else {"neutral"})
                    self.assertEqual(change == 0, unchanged)
                    if label == "parameter":
                        if shot["name"] == "half": half_difference = change
                        if shot["name"] == "one": self.assertGreater(change, half_difference)


if __name__ == "__main__":
    unittest.main()
