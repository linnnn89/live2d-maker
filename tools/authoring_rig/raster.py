"""Rasterize artwork polygons at pixel centers; landmarks are annotations only."""
import numpy as np
from PIL import Image


def clip_polygon(image, part):
    polygon = part["geometry"].get("polygon")
    if not polygon:
        return image.copy()
    offset = part["asset"]["offset"]
    xs = np.arange(image.width, dtype=float) + offset["left"] + 0.5
    ys = np.arange(image.height, dtype=float)[:, None] + offset["top"] + 0.5
    inside = np.zeros((image.height, image.width), dtype=bool)
    for (x0, y0), (x1, y1) in zip(polygon, polygon[1:] + polygon[:1]):
        if y0 == y1:
            continue
        crossing = ((y0 > ys) != (y1 > ys)) & (xs < (x1 - x0) * (ys - y0) / (y1 - y0) + x0)
        inside ^= crossing
    result = image.copy()
    alpha = np.array(result.getchannel("A"))
    alpha[~inside] = 0
    result.putalpha(Image.fromarray(alpha))
    return result
