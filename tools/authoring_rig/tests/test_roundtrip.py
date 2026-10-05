"""Regression tests for authoring_rig toolkit."""
import copy
import json
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Group

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from authoring_rig.builder import build_psd
from authoring_rig.exporter import export_psd
from authoring_rig.manifest import export_manifest
from authoring_rig.validator import ValidationError, validate_authoring_rig
from authoring_rig.classifier import classify_layer

ROOT = Path(__file__).resolve().parent.parent.parent.parent
DS_PSD = ROOT / "psd2live" / "examples" / "ds" / "psd-input" / "ds.psd"


class TestAuthoringRig(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_roundtrip_ds_zero_diff(self):
        """Verify PSD -> IR -> PSD preserves 100% of layers, bboxes, and pixel data."""
        fixtures = ((DS_PSD, 24), (ROOT / "psd2live/examples/tml/psd-input/tml.psd", 22))
        for fixture, count in fixtures:
            with self.subTest(fixture=fixture.name):
                ir_dir = self.temp_dir / fixture.stem
                rebuilt_psd = self.temp_dir / f"{fixture.stem}-rebuilt.psd"
                ir_data = export_psd(fixture, ir_dir)
                self.assertEqual(len(ir_data["parts"]), count)
                validate_authoring_rig(ir_data, base_dir=ir_dir)
                self.assertEqual(build_psd(ir_dir / "authoring-rig.json", rebuilt_psd)["layers_built"], count)
                orig, reb = PSDImage.open(fixture), PSDImage.open(rebuilt_psd)
                self.assertEqual(orig.size, reb.size)
                self.assertEqual(len(orig), len(reb))
                for l1, l2 in zip(orig, reb):
                    self.assertEqual(l1.name, l2.name)
                    self.assertEqual(l1.bbox, l2.bbox)
                    self.assertEqual((l1.visible, l1.opacity), (l2.visible, l2.opacity))
                    im1 = np.array(l1.topil().convert("RGBA"))
                    im2 = np.array(l2.topil().convert("RGBA"))
                    self.assertEqual(np.abs(im1.astype(int) - im2.astype(int)).max(), 0)
                # A fresh composite also checks stacking, rather than only comparing layer pairs.
                im1 = np.array(orig.composite(force=True).convert("RGBA"))
                im2 = np.array(reb.composite(force=True).convert("RGBA"))
                self.assertEqual(np.abs(im1.astype(int) - im2.astype(int)).max(), 0)

    def test_red_line_rejections(self):
        """Verify IR rejects forbidden fields (parameters, deformer, etc.)."""
        ir_dir = self.temp_dir / "ir_redline"
        ir_data = export_psd(DS_PSD, ir_dir)

        # Disallowed parameter keyword
        bad_ir = copy.deepcopy(ir_data)
        bad_ir["parts"][0]["parameters"] = {}
        with self.assertRaises(ValidationError):
            validate_authoring_rig(bad_ir)

        bad_ir = copy.deepcopy(ir_data)
        bad_ir["parts"][0]["deformer"] = "Root"
        with self.assertRaises(ValidationError):
            validate_authoring_rig(bad_ir)

    def test_identity_appearance_strict_validation_and_unsupported_psd(self):
        """Protect data integrity across actual temporary PSD/IR rebuilds."""
        source = self.temp_dir / "source.psd"
        psd = PSDImage.new("RGBA", (32, 32))
        bottom = psd.create_pixel_layer(Image.new("RGBA", (12, 10), (10, 20, 30, 255)), name="face", left=2, top=3)
        bottom.opacity = 128
        top = psd.create_pixel_layer(Image.new("RGBA", (6, 8), (40, 50, 60, 200)), name="front hair", left=5, top=6)
        top.visible = False
        psd.save(source)
        ir_dir = self.temp_dir / "identity"
        ir = export_psd(source, ir_dir)
        path = ir_dir / "authoring-rig.json"
        # IDs supplied by a caller must survive a rebuild, rename and layer reorder.
        ir["parts"][0]["id"] = "stable-face-id"
        ir["parts"][1]["id"] = "stable-hair-id"
        ir["parts"][0]["name"] = "renamed"
        ir["parts"][0]["z"], ir["parts"][1]["z"] = 1, 0
        path.write_text(json.dumps(ir), encoding="utf-8")
        rebuilt = self.temp_dir / "identity.psd"
        build_psd(path, rebuilt)
        imported = export_psd(rebuilt, self.temp_dir / "reimport")
        by_id = {part["id"]: part for part in imported["parts"]}
        self.assertEqual(set(by_id), {"stable-face-id", "stable-hair-id"})
        self.assertEqual(by_id["stable-face-id"]["name"], "renamed")
        self.assertEqual(by_id["stable-face-id"]["appearance"]["opacity"], 128)
        self.assertFalse(by_id["stable-hair-id"]["appearance"]["visible"])
        for mutation in ("extra", "dimension", "bbox", "escape", "tag", "time", "nan", "hash"):
            bad = copy.deepcopy(ir)
            part = bad["parts"][0]
            if mutation == "extra": bad["canvas"]["unexpected"] = True
            elif mutation == "dimension": part["asset"]["size"]["width"] += 1
            elif mutation == "bbox": part["geometry"]["bbox"][0] += 1
            elif mutation == "escape": part["asset"]["path"] = "../source.psd"
            elif mutation == "tag": part["semantic"]["tag"] = "TYPO"
            elif mutation == "time": part["provenance"]["timestamp"] = "yesterday"
            elif mutation == "nan": part["semantic"]["confidence"] = float("nan")
            else: part["asset"]["sha256"] = "0" * 64
            with self.subTest(mutation=mutation), self.assertRaises(ValidationError):
                validate_authoring_rig(bad, ir_dir)
            path.write_text(json.dumps(bad), encoding="utf-8")
            destination = self.temp_dir / f"bad-{mutation}.psd"
            with self.assertRaises(ValidationError):
                build_psd(path, destination)
            self.assertFalse(destination.exists())
        with patch.dict(sys.modules, {"jsonschema": None}), self.assertRaises(ValidationError):
            validate_authoring_rig(ir)
        unsupported = PSDImage.new("RGBA", (32, 32))
        Group.new(parent=unsupported, name="nested")
        grouped = self.temp_dir / "grouped.psd"
        unsupported.save(grouped)
        rejected = self.temp_dir / "rejected"
        with self.assertRaisesRegex(ValueError, "Unsupported PSD layer"):
            export_psd(grouped, rejected)
        self.assertFalse(rejected.exists())
        for name in ("", "f", "haircut", "headquarters"):
            self.assertEqual(classify_layer(name)[0], "UNKNOWN")
        self.assertEqual(classify_layer("左眼白 copy 2")[:2], ("EYEWHITE", "left"))

        # The manifest path uses cropped PNGs and preserves explicit identity/metadata.
        manifest_dir = self.temp_dir / "manifest"
        manifest_dir.mkdir()
        Image.new("RGBA", (12, 10), (10, 20, 30, 255)).save(manifest_dir / "face.png")
        Image.new("RGBA", (6, 8), (40, 50, 60, 200)).save(manifest_dir / "hair.png")
        manifest = {"canvas": [32, 32], "layerCount": 2, "layers": [
            {"id": "stable-face-id", "name": "renamed", "path": "face.png", "bounds": [2, 3, 14, 13],
             "appearance": {"visible": True, "opacity": 128},
             "geometry": {"bbox": [2, 3, 14, 13], "polygon": [[2, 3], [14, 3], [14, 13]], "landmarks": {"center": [8, 8]}}},
            {"id": "stable-hair-id", "name": "front hair", "path": "hair.png", "bounds": [5, 6, 11, 14],
             "appearance": {"visible": False, "opacity": 255}}]}
        manifest_path = manifest_dir / "source-manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        imported = export_manifest(manifest_path, manifest_dir / "ir")
        self.assertEqual(imported["parts"][0]["geometry"]["landmarks"]["center"], [8, 8])
        rebuilt = manifest_dir / "rebuilt.psd"
        build_psd(manifest_dir / "ir/authoring-rig.json", rebuilt)
        model = PSDImage.open(rebuilt)
        # An explicit triangle now clips raster alpha; RGB and the interior remain intact.
        pixels = np.array(model[0].topil().convert("RGBA"))
        self.assertEqual(pixels[0, 11].tolist(), [10, 20, 30, 255])
        self.assertEqual(int(pixels[9, 0, 3]), 0)
        self.assertEqual((model[0].opacity, model[1].visible), (128, False))
        manifest["layers"].reverse()
        manifest["layers"][0]["name"] = "hair renamed"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        reordered = export_manifest(manifest_path, manifest_dir / "reordered")
        self.assertEqual([p["id"] for p in reordered["parts"]], ["stable-hair-id", "stable-face-id"])
        for mutation in ("size", "missing", "escape", "duplicate", "forbidden", "count"):
            bad = copy.deepcopy(manifest)
            if mutation == "size": bad["layers"][0]["bounds"][2] += 1
            elif mutation == "missing": bad["layers"][0]["path"] = "absent.png"
            elif mutation == "escape": bad["layers"][0]["path"] = "../source.psd"
            elif mutation == "duplicate": bad["layers"][0]["id"] = bad["layers"][1]["id"]
            elif mutation == "forbidden": bad["layers"][0].setdefault("geometry", {})["deformer"] = "root"
            else: bad["layerCount"] = 3
            manifest_path.write_text(json.dumps(bad), encoding="utf-8")
            destination = manifest_dir / f"bad-{mutation}"
            with self.subTest(manifest=mutation), self.assertRaises((ValueError, FileNotFoundError, ValidationError)):
                export_manifest(manifest_path, destination)
            self.assertFalse(destination.exists())



if __name__ == "__main__":
    unittest.main()
