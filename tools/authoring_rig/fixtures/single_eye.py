"""Generate original geometric artwork for Q1/V1; no native model is built.

From the repository root:
    python -m tools.authoring_rig.fixtures.single_eye --out out/q1-single-eye
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw
from psd_tools import PSDImage


def create_fixture(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    psd = PSDImage.new("RGBA", (256, 256))

    face = Image.new("RGBA", (192, 224))
    ImageDraw.Draw(face).ellipse((0, 0, 191, 223), fill=(235, 193, 160, 255))
    psd.create_pixel_layer(face, name="face", left=32, top=16)

    # Character left = image right for this front-facing fixture.
    white = Image.new("RGBA", (60, 28))
    ImageDraw.Draw(white).ellipse((1, 1, 58, 26), fill="white")
    psd.create_pixel_layer(white, name="eyewhite Left", left=140, top=86)

    iris = Image.new("RGBA", (20, 26))
    draw = ImageDraw.Draw(iris)
    draw.ellipse((0, 0, 19, 25), fill=(35, 110, 160, 255))
    draw.ellipse((7, 5, 12, 20), fill=(15, 25, 35, 255))
    psd.create_pixel_layer(iris, name="iris Left", left=160, top=87)

    lash = Image.new("RGBA", (60, 28))
    ImageDraw.Draw(lash).arc((1, 1, 58, 26), 180, 360, fill=(35, 20, 25, 255), width=3)
    psd.create_pixel_layer(lash, name="eyelash Left", left=140, top=86)
    psd.save(out / "single-eye.psd")

    closed = Image.new("RGBA", (60, 28))
    ImageDraw.Draw(closed).line([(2, 11), (14, 16), (30, 18), (46, 16), (57, 11)],
                               fill=(35, 20, 25, 255), width=3)
    closed.save(out / "closed-eye.png")
    mask = Image.new("L", (256, 256))
    mask.paste(255, (140, 86, 200, 114))
    mask.save(out / "eye-mask.png")
    return out / "single-eye.psd"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, help="New directory for the generated PSD/PNG files")
    args = parser.parse_args()
    print(create_fixture(args.out))


if __name__ == "__main__":
    main()
