import copy
import json
import tempfile
import unittest
from pathlib import Path

from tools.authoring_rig.stale import compute_signatures, evaluate_dag_stale, model_input_signature
from tools.authoring_rig.studio import snapshot, save_workspace, write, overlay_inputs
from tools.authoring_rig.tests import test_studio as studio_fixtures


class ModelInputSignatures(unittest.TestCase):
    def test_annotations_and_browser_numbers_preserve_model_inputs_but_pixel_or_binding_edits_expire_them(self):
        base = {"canvas": {"width": 32, "height": 32}, "parts": [{"id": "face", "name": "face", "z": 0,
            "asset": {"path": "face.png"}, "geometry": {"bbox": [4, 4, 20, 20],
            "polygon": [[4.0, 4.0], [20.0, 4.0], [20.0, 20.0], [4.0, 20.0]]}, "semantic": {"tag": "FACE"}}]}
        annotated = copy.deepcopy(base)
        annotated["parts"][0]["geometry"]["polygon"] = [[int(x), int(y)] for x, y in base["parts"][0]["geometry"]["polygon"]]
        annotated["parts"][0]["geometry"]["landmarks"] = {"note": [8, 8]}
        self.assertEqual(model_input_signature(base), model_input_signature(annotated))
        self.assertNotEqual(compute_signatures(base)["annotation"], compute_signatures(annotated)["annotation"])
        result = evaluate_dag_stale(base, annotated)
        self.assertFalse(any(result["stale"].values()))
        self.assertFalse(any(result["reasons"].values()))
        for field in ("polygon", "appearance", "semantic", "sourceImageHash"):
            changed = copy.deepcopy(annotated)
            if field == "polygon": changed["parts"][0]["geometry"]["polygon"][0] = [5, 5]
            elif field == "appearance": changed["parts"][0]["appearance"] = {"opacity": 90}
            elif field == "semantic": changed["parts"][0]["semantic"] = {"tag": "OBJECTS"}
            else: changed[field] = "new-source"
            self.assertNotEqual(model_input_signature(base), model_input_signature(changed))
            self.assertTrue(evaluate_dag_stale(base, changed)["stale"]["moc3"])

    def test_legacy_and_versioned_build_review_records_preserve_annotation_edits_and_reject_unknown_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace, first, _ = studio_fixtures.StudioPersistence().import_fixture(Path(temp))
            build = workspace / "builds/successful"; build.mkdir(parents=True)
            write(build / "build-ir.json", first["ir"])
            report = {"status": "ok", "revision": first["revision"], "modelFile": "native/artwork.model3.json"}
            write(build / "build-report.json", report)
            review_dir = workspace / "reviews/successful"; review_dir.mkdir(parents=True)
            review = {"status": "ok", "studioRevision": first["revision"], "shots": []}
            write(review_dir / "review.json", review)
            state = json.loads((workspace / "studio-state.json").read_text()); state.update(latestBuild="builds/successful", latestQa="reviews/successful")
            write(workspace / "studio-state.json", state)
            source = (workspace / "source.png").read_bytes(); built = (build / "build-ir.json").read_bytes()
            candidate = copy.deepcopy(first["ir"]); candidate["parts"][0]["geometry"]["landmarks"] = {"note": [8, 8]}
            saved = save_workspace(workspace, {"revision": first["revision"], "ir": candidate})
            self.assertNotEqual(saved["revision"], first["revision"])
            self.assertFalse(any(saved["stale"].values()))
            self.assertEqual(saved["build"]["revision"], first["revision"])
            self.assertEqual((workspace / "source.png").read_bytes(), source)
            self.assertEqual((build / "build-ir.json").read_bytes(), built)
            report.update(signatureVersion=2, modelInputSignature=model_input_signature(first["ir"]))
            review.update(signatureVersion=2, modelInputSignature=model_input_signature(first["ir"]), buildId=state["latestBuild"])
            write(build / "build-report.json", report); write(review_dir / "review.json", review)
            self.assertFalse(snapshot(workspace)["stale"]["review"])
            for change in ({"buildId": "builds/other"}, {"signatureVersion": 3}, {"modelInputSignature": "wrong"}):
                write(review_dir / "review.json", {**review, **change})
                view = snapshot(workspace); self.assertTrue(view["stale"]["review"]); self.assertFalse(view["stale"]["moc3"])
            write(review_dir / "review.json", review)
            for change in ({"signatureVersion": 3}, {"modelInputSignature": "wrong"}):
                write(build / "build-report.json", {**report, **change})
                self.assertTrue(snapshot(workspace)["stale"]["moc3"])

    def test_annotation_changes_preserve_overlay_evidence_and_do_not_hide_failed_replay(self):
        with tempfile.TemporaryDirectory() as temp:
            workspace, first, _ = studio_fixtures.StudioPersistence().import_fixture(Path(temp))
            write(workspace / "overlay.json", {"keyformSets": [{"target": {"kind": "art_mesh", "id": "ArtMeshFace"},
                "coordinate": {"ParamAngleX": 30}, "channels": {"opacity": .5}}]})
            write(workspace / "overlay-baseline.json", {"objects": [{"target": {"kind": "art_mesh", "id": "ArtMeshFace"}}]})
            state = json.loads((workspace / "studio-state.json").read_text());state.update(overlay="overlay.json",latestBuild="builds/successful")
            context = {"revision": first["revision"], "overlayInputs": overlay_inputs(workspace, state),
                       "signatureVersion": 2, "modelInputSignature": model_input_signature(first["ir"])}
            build = workspace / state["latestBuild"];build.mkdir(parents=True);write(build / "build-ir.json", first["ir"])
            write(build / "build-report.json", {**context,"status":"ok","modelFile":"native/artwork.model3.json"})
            write(workspace / "studio-state.json", state)
            candidate = copy.deepcopy(first["ir"]);candidate["parts"][0]["geometry"]["landmarks"] = {"note":[8,8]}
            saved = save_workspace(workspace, {"revision":first["revision"],"ir":candidate})
            self.assertEqual(saved["overlay"]["status"], "ok");self.assertFalse(saved["stale"]["moc3"])
            failed = workspace / "builds/failed";failed.mkdir();write(failed / "build-ir.json", first["ir"])
            write(failed / "failed-report.json", {"status":"broken","reasons":["Target missing"]})
            state["lastBuildAttempt"] = {**context,"status":"broken","directory":"builds/failed"};write(workspace / "studio-state.json",state)
            failed_view = snapshot(workspace);self.assertEqual(failed_view["overlay"]["status"],"broken");self.assertTrue(failed_view["stale"]["moc3"])
            candidate["parts"][0]["geometry"]["landmarks"]["note"] = [9,9]
            next_view = save_workspace(workspace,{"revision":saved["revision"],"ir":candidate})
            self.assertEqual(next_view["overlay"]["status"],"broken")
            self.assertEqual(next_view["build"]["modelUrl"],saved["build"]["modelUrl"])
            # Legacy failures for this exact revision remain authoritative even without captured IR.
            state["lastBuildAttempt"]["revision"] = next_view["revision"]
            write(workspace / "studio-state.json",state);(failed / "build-ir.json").unlink()
            self.assertEqual(snapshot(workspace)["overlay"]["status"],"broken")
