"""Pose policy and workspace persistence checks; no native build or renderer."""
import base64
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.authoring_rig.qa_specs import build_pose_spec
from tools.authoring_rig.fixtures.single_eye import create_fixture
from tools.authoring_rig.builder import build_psd
from tools.authoring_rig.binding import build_configuration
from tools.authoring_rig.studio_protocol import validate_protocol
from tools.authoring_rig.studio import (open_workspace, qa_workspace, read, write, preview_generated,
                                      commit_generated, save_workspace)
from PIL import Image
from psd_tools import PSDImage


def parameter(name, low=0, high=1, default=0):
    return {"id": name, "min": low, "max": high, "default": default}


def spec(parameters):
    return build_pose_spec("/model.model3.json", {"width": 256, "height": 256}, parameters)


class PoseSpecs(unittest.TestCase):
    def test_single_eye_without_hair_has_three_distinct_poses(self):
        result = spec([parameter("ParamEyeLOpen", default=1)])
        self.assertEqual(result["shots"], [
            {"name": "neutral", "params": {}},
            {"name": "eyes_closed", "params": {"ParamEyeLOpen": 0}},
            {"name": "eyes_half", "params": {"ParamEyeLOpen": 0.5}},
        ])
        self.assertEqual(result["coverage"]["sampledParameters"], ["ParamEyeLOpen"])
        self.assertIn("hair", result["coverage"]["unavailable"])
        self.assertEqual(result["coverage"]["scope"], "parameter-poses")

    def test_standard_model_has_bounded_interactions_and_no_duplicate_default_poses(self):
        parameters = [parameter(key, -30, 30) for key in ("ParamAngleX", "ParamAngleY", "ParamAngleZ")]
        parameters += [parameter("ParamBodyAngleX", -10, 10), parameter("ParamMouthOpenY"),
                       parameter("ParamEyeLOpen", default=1), parameter("ParamEyeROpen", default=1),
                       parameter("ParamHairFront", -1, 1), parameter("ParamHairBack", -1, 1)]
        original = copy.deepcopy(parameters)
        result = spec(parameters)
        poses = {shot["name"]: shot["params"] for shot in result["shots"]}
        self.assertEqual(poses["head_x_min_y_max"], {"ParamAngleX": -30, "ParamAngleY": 30})
        self.assertEqual(poses["head_x_max_eyes_closed"],
                         {"ParamAngleX": 30, "ParamEyeLOpen": 0, "ParamEyeROpen": 0})
        self.assertEqual(poses["eyes_closed_mouth_open"],
                         {"ParamEyeLOpen": 0, "ParamEyeROpen": 0, "ParamMouthOpenY": 1})
        self.assertEqual(poses["hair_min"], {"ParamHairFront": -1, "ParamHairBack": -1})
        defaults = {p["id"]: p["default"] for p in parameters}
        states = {tuple(sorted({**defaults, **pose}.items())) for pose in poses.values()}
        self.assertEqual(len(states), len(result["shots"]))
        self.assertLessEqual(len(states), 24)
        self.assertEqual(result["coverage"]["notSampledParameters"], [])
        self.assertEqual(result["coverage"]["unavailable"], {})
        self.assertEqual(parameters, original)
        self.assertEqual(result, spec(list(reversed(parameters))))

    def test_nonstandard_ranges_are_sampled_without_clamping_named_actions(self):
        parameters = [parameter("ParamAngleX", 5, 45, 20), parameter("ParamAngleY", -12, 8, 1),
                      parameter("ParamBodyAngleX", -8, 12, 2), parameter("ParamEyeROpen", 0.2, 1.5, 1),
                      parameter("ParamMouthOpenY", 0.2, 0.8, 0.2), parameter("ParamHairSide", -2, 3, 0.5)]
        result = spec(parameters)
        ranges = {p["id"]: p for p in parameters}
        for shot in result["shots"]:
            for key, value in shot["params"].items():
                self.assertLessEqual(ranges[key]["min"], value)
                self.assertLessEqual(value, ranges[key]["max"])
        poses = {shot["name"]: shot["params"] for shot in result["shots"]}
        self.assertEqual(poses["ParamAngleX_min"], {"ParamAngleX": 5})
        self.assertEqual(poses["ParamMouthOpenY_max"], {"ParamMouthOpenY": 0.8})
        self.assertEqual(poses["ParamEyeROpen_min"], {"ParamEyeROpen": 0.2})
        self.assertEqual(poses["hair_max"], {"ParamHairSide": 3})
        self.assertNotIn("eyes_closed", poses)
        self.assertNotIn("eyes_closed_mouth_open", poses)
        self.assertIn("eyes_closed", result["coverage"]["unavailable"])
        self.assertIn("mouth_open", result["coverage"]["unavailable"])

    def test_unrecognized_or_fixed_parameters_are_only_a_neutral_smoke_check(self):
        for parameters in ([], [parameter("CustomSwitch")], [parameter("ParamAngleX", 5, 5, 5)]):
            with self.subTest(parameters=parameters):
                result = spec(parameters)
                self.assertEqual(result["shots"], [{"name": "neutral", "params": {}}])
                self.assertEqual(result["coverage"]["scope"], "neutral-only")
                self.assertEqual(result["coverage"]["notSampledParameters"], [p["id"] for p in parameters])

    def test_both_eye_actions_do_not_silently_omit_an_out_of_range_eye(self):
        result = spec([parameter("ParamEyeLOpen", default=1), parameter("ParamEyeROpen", 0.2, 1, 1)])
        poses = {shot["name"]: shot["params"] for shot in result["shots"]}
        self.assertNotIn("eyes_closed", poses)
        self.assertEqual(poses["ParamEyeLOpen_min"], {"ParamEyeLOpen": 0})
        self.assertIn("ParamEyeROpen", result["coverage"]["unavailable"]["eyes_closed"])


class WorkspacePoseSpecs(unittest.TestCase):
    def test_single_eye_fixture_import_keeps_source_and_binds_explicit_left_side(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = create_fixture(root / "artwork")
            original = source.read_bytes()
            workspace = root / "workspace"
            initial = open_workspace(workspace, source_psd=source)
            self.assertEqual([(p["semantic"]["tag"], p["semantic"]["side"]) for p in initial["ir"]["parts"]],
                             [("FACE", "none"), ("EYEWHITE", "left"), ("IRIDES", "left"), ("EYELASH", "left")])
            encode = lambda name: base64.b64encode((source.parent / name).read_bytes()).decode("ascii")
            payload = {"revision": initial["revision"], "name": "closed_eye Left",
                       "bounds": [140, 86, 200, 114], "generatedPng": encode("closed-eye.png"),
                       "maskPng": encode("eye-mask.png"),
                       "origin": {"kind": "manual", "description": "Original geometric single-eye fixture"}}
            preview = preview_generated(workspace, payload)
            self.assertEqual(preview["report"]["outside_changed_pixels"], 0)
            self.assertEqual(preview["report"]["outside_visible_pixels"], 0)
            imported = commit_generated(workspace, {"revision": initial["revision"], "id": preview["id"]})
            self.assertEqual(imported["ir"]["parts"][:-1], initial["ir"]["parts"])
            closed = imported["ir"]["parts"][-1]
            self.assertEqual(closed["semantic"]["tag"], "EYE_CLOSE")
            closed["semantic"]["override"] = {"tag": "EYE_CLOSE", "side": "left"}
            saved = save_workspace(workspace, {"revision": imported["revision"], "ir": imported["ir"]})
            built = build_psd(workspace / "authoring-rig.json", root / "with-closed-eye.psd")
            config = build_configuration(saved["ir"], built["layers"])
            source_id = next(layer["sourceLayerId"] for layer in built["layers"] if layer["partId"] == closed["id"])
            self.assertEqual(config["layerOverrides"][source_id], {"tag": "EYE_CLOSE", "side": "LEFT"})
            self.assertEqual(len(PSDImage.open(root / "with-closed-eye.psd")), 5)
            self.assertEqual(source.read_bytes(), original)

    def test_workspace_uses_build_ranges_and_persists_coverage_without_a_cdi_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            psd = PSDImage.new("RGBA", (32, 32))
            psd.create_pixel_layer(Image.new("RGBA", (16, 16), "white"), name="face")
            psd.save(root / "source.psd")
            workspace = root / "workspace"
            initial = open_workspace(workspace, source_psd=root / "source.psd")
            build = workspace / "builds" / "fixture"
            build.mkdir(parents=True)
            write(build / "build-ir.json", initial["ir"])
            report = {"status": "ok", "revision": initial["revision"],
                      "modelFile": "native/fixture.model3.json",
                      "parameters": [parameter("ParamEyeLOpen", default=1)]}
            write(build / "build-report.json", report)
            state = read(workspace / "studio-state.json")
            state["latestBuild"] = "builds/fixture"
            write(workspace / "studio-state.json", state)

            def render_stub(spec_path, directory, port):
                actual = read(spec_path)
                self.assertEqual(actual["shots"], spec(report["parameters"])["shots"])
                self.assertEqual(actual["model"], "/studio-files/builds/fixture/native/fixture.model3.json")
                self.assertEqual(actual["canvaspx"], [32, 32])
                # Only the renderer is replaced; actual workspace/signature/query code runs.
                return {"status": "ok", "spec": actual,
                        "shots": [{**shot, "full": "full/" + shot["name"] + ".png"} for shot in actual["shots"]]}

            # qa_workspace imports qa lazily from live2d-viewer.
            import sys
            sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "live2d-viewer"))
            with patch("qa.run_qa", side_effect=render_stub):
                result = qa_workspace(workspace, 8899)
            review_dir = workspace / read(workspace / "studio-state.json")["latestQa"]
            review = read(review_dir / "review.json")
            self.assertEqual(review["spec"]["coverage"]["scope"], "parameter-poses")
            self.assertIn("hair", review["spec"]["coverage"]["unavailable"])
            self.assertEqual(review["buildId"], "builds/fixture")
            self.assertEqual(review["studioRevision"], initial["revision"])
            self.assertEqual(result["qa"]["poses"], 3)
            self.assertFalse(result["stale"]["review"])
            validate_protocol("Snapshot", json.loads(json.dumps(result)))

            # A failed rerun cannot retain the preceding successful review.
            with patch("qa.run_qa", side_effect=ValueError("out-of-range parameters")):
                with self.assertRaisesRegex(ValueError, "out-of-range parameters"):
                    qa_workspace(workspace, 8899)
            self.assertIsNone(read(workspace / "studio-state.json")["latestQa"])

            report.pop("parameters")
            write(build / "build-report.json", report)
            with patch("qa.run_qa") as renderer:
                with self.assertRaisesRegex(ValueError, "rebuild"):
                    qa_workspace(workspace, 8899)
                renderer.assert_not_called()


if __name__ == "__main__":
    unittest.main()
