"""Material advice from adopted classifications; no native runtime is required."""
import copy
import tempfile
import unittest
from pathlib import Path

from tools.authoring_rig.issues import model_issues
from tools.authoring_rig.studio import save_workspace
from tools.authoring_rig.studio_protocol import validate_protocol
from tools.authoring_rig.tests import test_studio as fixtures
from tools.authoring_rig.workspace_query import snapshot
from tools.authoring_rig.workspace_store import read, write


def layer(part_id, tag, side="NONE", drawable=None):
    return {"partId": part_id, "semanticTag": tag, "side": side,
            "drawable": part_id if drawable is None else drawable}


class MaterialIssues(unittest.TestCase):
    def issues(self, layers, stale=False):
        view = {"ir": {"parts": [
            {"id": part_id, "name": part_id, "semantic": {"tag": "FACE", "side": "none"}}
            for part_id in dict.fromkeys(row["partId"] for row in layers)]},
            "build": {"classifications": layers}, "stale": {"base_rig": stale},
            "overlay": {"reasons": []}}
        original = copy.deepcopy(view)
        result = model_issues(view, Path("unused"), {})
        self.assertEqual(view, original)
        for issue in result:
            validate_protocol("ModelIssue", issue)
            self.assertEqual(issue["severity"], "warning")
            self.assertEqual(issue["action"], "select-part")
        return result

    def test_iris_uses_same_side_or_unsided_eye_white_not_opposite_side(self):
        for iris_side, white_side, missing in (
            ("LEFT", "LEFT", False), ("RIGHT", "RIGHT", False),
            ("LEFT", "NONE", False), ("RIGHT", "NONE", False), ("NONE", "NONE", False),
            ("LEFT", "RIGHT", True), ("RIGHT", "LEFT", True), ("NONE", "LEFT", True),
        ):
            with self.subTest(iris=iris_side, white=white_side):
                issues = self.issues([layer("iris", "IRIDES", iris_side),
                                      layer("white", "EYEWHITE", white_side)])
                self.assertEqual([(i["code"], i["partId"]) for i in issues],
                                 [("MISSING_EYEWHITE", "iris")] if missing else [])

    def test_mouth_internals_accept_any_mouth_but_not_a_closed_mouth_line(self):
        internals = [layer("tooth-top", "TOOTH_T", "LEFT"),
                     layer("tooth-bottom", "TOOTH_B", "LEFT"), layer("tongue", "TONGUE", "LEFT")]
        for tag in ("MOUTH", "MOUTH_OPEN", "MOUTH_CLOSE"):
            with self.subTest(mouth=tag):
                issues = self.issues(internals + [layer("mouth", tag, "RIGHT")])
                self.assertEqual({i["partId"] for i in issues},
                                 {"tooth-top", "tooth-bottom", "tongue"} if tag == "MOUTH_CLOSE" else set())
                self.assertTrue(all(i["code"] == "MISSING_MOUTH_APERTURE" for i in issues))

    def test_empty_layers_are_not_masks_or_warning_targets_and_split_parts_are_deduplicated(self):
        issues = self.issues([layer("eyes", "IRIDES", "LEFT", "IrisL"),
                              layer("eyes", "IRIDES", "RIGHT", "IrisR"),
                              layer("white", "EYEWHITE", drawable=""),
                              layer("empty-mouth", "MOUTH_OPEN", drawable=""),
                              layer("tongue", "TONGUE"), layer("empty-iris", "IRIDES", drawable="")])
        self.assertEqual([(i["code"], i["partId"]) for i in issues],
                         [("MISSING_EYEWHITE", "eyes"), ("MISSING_MOUTH_APERTURE", "tongue")])

    def test_stale_or_absent_evidence_does_not_become_a_missing_material_warning(self):
        self.assertEqual(self.issues([layer("iris", "IRIDES")], stale=True), [])
        self.assertEqual(self.issues([]), [])
        self.assertEqual(self.issues([layer("face", "FACE"), layer("closed", "EYE_CLOSE")]), [])
        self.assertEqual(self.issues([layer("iris", "IRIDES", "LEFT"),
                                      layer("white", "EYEWHITE", "LEFT")]), [])  # Single eye, no hair.

    def test_snapshot_uses_adopted_override_and_drops_warning_after_a_new_revision(self):
        with tempfile.TemporaryDirectory() as temporary:
            root, first, _ = fixtures.StudioPersistence().import_fixture(Path(temporary))
            candidate = copy.deepcopy(first["ir"])
            part = candidate["parts"][0]
            part["semantic"]["override"] = {"tag": "IRIDES", "side": "left"}
            saved = save_workspace(root, {"revision": first["revision"], "ir": candidate})
            self.assertEqual(saved["issues"], [])  # Import classifications alone are not binding evidence.
            build = root / "builds" / "fixture"
            build.mkdir(parents=True)
            write(build / "build-ir.json", saved["ir"])
            write(build / "build-report.json", {"status": "ok", "revision": saved["revision"],
                  "modelFile": "native/artwork.model3.json", "classifications": [
                      {**layer(part["id"], "IRIDES", "LEFT"), "automaticTag": "FACE"}]})
            state = read(root / "studio-state.json")
            state["latestBuild"] = "builds/fixture"
            write(root / "studio-state.json", state)
            before = {p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            current = snapshot(root)
            self.assertFalse(current["stale"]["base_rig"])
            self.assertEqual([(i["code"], i["partId"]) for i in current["issues"]],
                             [("MISSING_EYEWHITE", part["id"])])
            self.assertEqual(snapshot(root), current)
            self.assertEqual({p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()}, before)
            del candidate["parts"][0]["semantic"]["override"]
            changed = save_workspace(root, {"revision": current["revision"], "ir": candidate})
            self.assertTrue(changed["stale"]["base_rig"])
            self.assertEqual(changed["issues"], [])
            self.assertEqual(changed["build"], current["build"])  # Old success is retained, not used as current advice.
