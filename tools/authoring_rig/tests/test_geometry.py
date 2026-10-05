import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage

from tools.authoring_rig.builder import build_psd
from tools.authoring_rig.exporter import export_psd
from tools.authoring_rig.generated import composite_ir


class GeometryRegression(unittest.TestCase):
    def test_polygon_changes_real_psd_and_composite_without_touching_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            psd = PSDImage.new("RGBA", (12, 12))
            psd.create_pixel_layer(Image.new("RGBA", (8, 8), (80, 90, 100, 255)), name="face", left=2, top=2)
            psd.save(root / "source.psd")
            data = export_psd(root / "source.psd", root / "ir")
            part = data["parts"][0]
            asset = root / "ir" / part["asset"]["path"]
            original = asset.read_bytes()
            # Left half of the square: independent fixed coordinates, including fractional edges.
            part["geometry"]["polygon"] = [[2, 2], [6, 2], [6, 10], [2, 10]]
            ir = root / "ir/authoring-rig.json"
            ir.write_text(json.dumps(data), encoding="utf-8")
            build_psd(ir, root / "result.psd")
            image = PSDImage.open(root / "result.psd")[0].topil().convert("RGBA")
            self.assertEqual(image.getpixel((3, 4)), (80, 90, 100, 255))
            self.assertEqual(image.getpixel((4, 4))[3], 0)
            self.assertEqual(sum(a != 0 for a in image.getchannel("A").getdata()), 32)
            composite = composite_ir(data, ir.parent)
            self.assertEqual(composite.getpixel((5, 6)), (80, 90, 100, 255))
            self.assertEqual(composite.getpixel((6, 6))[3], 0)
            self.assertEqual(asset.read_bytes(), original)
