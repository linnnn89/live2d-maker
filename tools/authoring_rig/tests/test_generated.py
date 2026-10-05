"""P6 artwork integrity and real temporary PSD import/export regressions."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

from tools.authoring_rig.builder import build_psd
from tools.authoring_rig.exporter import export_psd
from tools.authoring_rig.generated import import_generated


class TestGenerated(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        psd = PSDImage.new(mode="RGBA", size=(8, 8))
        psd.create_pixel_layer(Image.new("RGBA", (8, 8), (210, 180, 150, 255)), name="face")
        psd.create_pixel_layer(Image.new("RGBA", (2, 2), (40, 20, 10, 255)), name="mouth", left=3, top=3)
        psd.save(self.root / "source.psd")
        self.ir = export_psd(self.root / "source.psd", self.root / "base")
        self.mouth_id = self.ir["parts"][1]["id"]
        mask = Image.new("L", (8, 8))
        mask.paste(255, (3, 3, 5, 5))
        mask.save(self.root / "mask.png")
        sprite = Image.new("RGBA", (2, 2), (160, 70, 80, 255))
        sprite.putpixel((0, 0), (0, 0, 0, 0))
        sprite.save(self.root / "sprite.png")
        (self.root / "prompt.txt").write_text("An isolated anime mouth, transparent background", encoding="utf-8")

    def run_import(self, output, **kwargs):
        args = dict(ir_path=self.root / "base/authoring-rig.json", generated_path=self.root / "sprite.png",
                    mask_path=self.root / "mask.png", bounds=[3, 3, 5, 5], name="mouth_open",
                    prompt_path=self.root / "prompt.txt", out_dir=self.root / output,
                    replace_part=self.mouth_id)
        args.update(kwargs)
        return import_generated(**args)

    def test_generated_add_replace_psd_and_mask_integrity(self):
        """A real PSD keeps original identity/assets; replacement alpha and new provenance survive."""
        original_hash = hashlib.sha256((self.root / "source.psd").read_bytes()).hexdigest()
        report = self.run_import("replacement")
        self.assertEqual((report["outside_changed_pixels"], report["outside_visible_pixels"], report["outside_max_diff"]), (0, 0, 0))
        self.assertEqual(report["changed_pixels"], 4)
        new = json.loads((self.root / "replacement/authoring-rig.json").read_text(encoding="utf-8"))
        self.assertEqual(new["parts"][0], self.ir["parts"][0])
        self.assertEqual(new["parts"][1]["id"], self.mouth_id)
        self.assertEqual(new["parts"][1]["provenance"]["source"], "imagegen")
        build_psd(self.root / "replacement/authoring-rig.json", self.root / "new.psd")
        rebuilt = PSDImage.open(self.root / "new.psd")
        self.assertEqual(rebuilt[1].name, "mouth_open")
        self.assertEqual(rebuilt[1].bbox, (3, 3, 5, 5))
        with Image.open(self.root / "sprite.png") as sprite:
            np.testing.assert_array_equal(np.asarray(rebuilt[1].topil().convert("RGBA")), np.asarray(sprite))
        added = self.run_import("added", replace_part=None)
        additional = json.loads((self.root / "added/authoring-rig.json").read_text(encoding="utf-8"))
        self.assertEqual(additional["parts"][:2], self.ir["parts"])
        self.assertEqual(additional["parts"][2]["z"], 2)
        self.assertNotEqual(added["part_id"], self.mouth_id)
        self.assertEqual(hashlib.sha256((self.root / "source.psd").read_bytes()).hexdigest(), original_hash)

    def test_protected_pixels_and_replacement_removal_are_rejected(self):
        mask = Image.open(self.root / "mask.png")
        mask.putpixel((4, 4), 0)
        mask.save(self.root / "hole.png")
        with self.assertRaisesRegex(ValueError, "visible pixels outside"):
            self.run_import("bad-visible", mask_path=self.root / "hole.png")
        self.assertFalse((self.root / "bad-visible").exists())
        # A moved replacement would erase old pixels outside the new local mask.
        moved = Image.new("L", (8, 8))
        moved.paste(255, (0, 0, 2, 2))
        moved.save(self.root / "moved.png")
        with self.assertRaisesRegex(ValueError, "replacement changes.*outside"):
            self.run_import("bad-removal", mask_path=self.root / "moved.png", bounds=[0, 0, 2, 2])
        self.assertFalse((self.root / "bad-removal").exists())

    def test_invalid_inputs_and_explicit_registration(self):
        for label, kwargs in [("bounds", {"bounds": [0, 0, 9, 9]}),
                              ("size", {"bounds": [3, 3, 6, 6]}),
                              ("unknown", {"name": "unrecognized_sprite"}),
                              ("target", {"replace_part": "missing"}),
                              ("inplace", {"out_dir": self.root / "base"})]:
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.run_import("bad-" + label, **kwargs)
            self.assertFalse((self.root / ("bad-" + label)).exists())
        for label, image in [("soft-mask", Image.new("L", (8, 8), 128)),
                             ("wrong-size", Image.new("L", (2, 2), 255)),
                             ("full-mask", Image.new("L", (8, 8), 255))]:
            path = self.root / (label + ".png")
            image.save(path)
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.run_import("bad-" + label, mask_path=path)
            self.assertFalse((self.root / ("bad-" + label)).exists())
        for label, image in [("opaque", Image.new("RGBA", (2, 2), (255, 0, 0, 255))),
                             ("blank", Image.new("RGBA", (2, 2))),
                             ("rgb", Image.new("RGB", (2, 2)))]:
            path = self.root / (label + ".png")
            image.save(path)
            with self.subTest(label=label), self.assertRaises(ValueError):
                self.run_import("bad-" + label, generated_path=path)
        large = Image.new("RGBA", (16, 16))
        large.paste((160, 70, 80, 255), (4, 4, 12, 8))
        large.save(self.root / "large.png")
        report = self.run_import("fitted", generated_path=self.root / "large.png", fit=True)
        self.assertEqual(report["registration"]["fitted_size"], [2, 1])
        self.assertEqual(report["outside_changed_pixels"], 0)
        # Explicit cropping keeps faint distant alpha from changing registration.
        large.putpixel((0, 0), (100, 100, 100, 1))
        large.save(self.root / "large.png")
        cropped = self.run_import("cropped", generated_path=self.root / "large.png", fit=True,
                                  sprite_bounds=[4, 4, 12, 8])
        self.assertEqual(cropped["registration"]["excluded_visible_pixels"], 1)
        self.assertEqual(cropped["registration"]["excluded_max_alpha"], 1)
        self.assertEqual(cropped["registration"]["fitted_size"], [2, 1])
        with self.assertRaisesRegex(ValueError, "sprite-bounds"):
            self.run_import("bad-crop", sprite_bounds=[0, 0, 30, 30])


if __name__ == "__main__":
    unittest.main()
