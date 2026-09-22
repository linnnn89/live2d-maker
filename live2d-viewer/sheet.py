"""Build a labelled contact sheet from snapshot PNGs (nearest-neighbour, no resize of content)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

def sheet(items, out, cols=3, pad=8, label_h=18):
    """items: list of (label, path)"""
    images = [(label, Image.open(path).convert("RGBA")) for label, path in items]
    cw = max(im.width for _, im in images)
    ch = max(im.height for _, im in images)
    rows = (len(images) + cols - 1) // cols
    W = cols * (cw + pad) + pad
    H = rows * (ch + label_h + pad) + pad
    canvas = Image.new("RGBA", (W, H), (24, 24, 28, 255))
    draw = ImageDraw.Draw(canvas)
    for index, (label, im) in enumerate(images):
        r, c = divmod(index, cols)
        x = pad + c * (cw + pad)
        y = pad + r * (ch + label_h + pad)
        canvas.alpha_composite(im, (x, y))
        draw.text((x + 2, y + ch + 3), label, fill=(230, 230, 230))
    canvas.convert("RGB").save(out)
    return out

if __name__ == "__main__":
    out = Path(sys.argv[1])
    items = []
    for spec in sys.argv[2:]:
        label, _, path = spec.partition("=")
        items.append((label, Path(path)))
    print(sheet(items, out))
