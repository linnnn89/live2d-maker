import type { ArtworkIR, Part, Bounds } from '../editor/contracts';
import { ArtworkError, dimensions, type PixelFrame, type RasterAsset } from './contracts';

export type AssetLoader = (part: Part) => Promise<RasterAsset>;
const div255 = (value: number) => Math.floor((Math.floor(value / 256) + value) / 256);

/** Pillow-compatible normal source-over, using its seven-bit integer coefficients. */
function blend(destination: Uint8ClampedArray, offset: number, source: Uint8ClampedArray, index: number): void {
  const alpha = source[index + 3];
  if (!alpha) return;
  const previous = destination[offset + 3];
  if (alpha === 255 || !previous) { destination.set(source.subarray(index, index + 4), offset); return; }
  const outAlpha255 = alpha * 255 + previous * (255 - alpha);
  const coefficient = Math.floor(alpha * 255 * 255 * 128 / outAlpha255);
  const remaining = 255 * 128 - coefficient;
  for (let channel = 0; channel < 3; channel++) {
    destination[offset + channel] = Math.floor(div255(source[index + channel] * coefficient + destination[offset + channel] * remaining + 128 * 128) / 128);
  }
  destination[offset + 3] = div255(outAlpha255 + 128);
}

/** Even-odd at pixel centers, with the same strict crossing comparison as raster.py. */
export function prepareLayer(asset: RasterAsset, part: Part): RasterAsset {
  const data = new Uint8ClampedArray(asset.data);
  const polygon = part.geometry.polygon;
  const opacity = part.appearance?.opacity ?? 255;
  if (polygon && (polygon.length < 3 || polygon.some(p => p.length !== 2 || !p.every(Number.isFinite)))) throw new ArtworkError('INVALID_GEOMETRY', '轮廓坐标无效', part.id);
  if (!Number.isInteger(opacity) || opacity < 0 || opacity > 255) throw new ArtworkError('INVALID_APPEARANCE', '透明度必须是 0–255 整数', part.id);
  const { left, top } = part.asset.offset;
  for (let y = 0; y < asset.height; y++) {
    const centerY = y + top + 0.5;
    const crossings: number[] = [];
    if (polygon) for (let edge = 0; edge < polygon.length; edge++) {
      const [x0, y0] = polygon[edge], [x1, y1] = polygon[(edge + 1) % polygon.length];
      if ((y0 > centerY) !== (y1 > centerY)) crossings.push((x1 - x0) * (centerY - y0) / (y1 - y0) + x0);
    }
    crossings.sort((a, b) => a - b);
    let crossing = 0, inside = crossings.length % 2 === 1;
    for (let x = 0; x < asset.width; x++) {
      const centerX = x + left + 0.5;
      while (crossing < crossings.length && crossings[crossing] <= centerX) { inside = !inside; crossing++; }
      const alphaIndex = (y * asset.width + x) * 4 + 3;
      data[alphaIndex] = polygon && !inside ? 0 : Math.round(data[alphaIndex] * opacity / 255);
    }
  }
  return { width: asset.width, height: asset.height, data };
}

export function alphaBounds(frame: Pick<PixelFrame, 'width' | 'height' | 'data'>): Bounds | null {
  let left = frame.width, top = frame.height, right = 0, bottom = 0;
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    if (frame.data[(y * frame.width + x) * 4 + 3]) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    }
  }
  return right ? [left, top, right, bottom] : null;
}

/** Shared pixel engine for the worker, UI and explicit PNG capture. No DOM or native calls. */
export class ArtworkRenderer {
  private layers = new Map<string, { key: string; asset: RasterAsset }>();
  constructor(private load: AssetLoader) {}
  async render(ir: ArtworkIR): Promise<PixelFrame> {
    dimensions(ir.canvas.width, ir.canvas.height);
    const parts = [...ir.parts].sort((a, b) => a.z - b.z).filter(p => p.appearance?.visible !== false && p.appearance?.opacity !== 0);
    // Start independent reads together; the loader deduplicates identical assets.
    const assets = await Promise.all(parts.map(part => this.load(part)));
    const data = new Uint8ClampedArray(ir.canvas.width * ir.canvas.height * 4);
    const currentLayers = new Map<string, { key: string; asset: RasterAsset }>();
    let cacheBytes = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], source = assets[i];
      dimensions(source.width, source.height);
      if (source.width !== part.asset.size.width || source.height !== part.asset.size.height || source.data.length !== source.width * source.height * 4) throw new ArtworkError('ASSET_SIZE', '素材尺寸与 IR 不一致', part.id);
      const { left, top } = part.asset.offset;
      if (!Number.isInteger(left) || !Number.isInteger(top)) throw new ArtworkError('INVALID_GEOMETRY', '素材位置必须是整数', part.id);
      const key = JSON.stringify([part.asset, part.geometry.polygon, part.appearance?.opacity ?? 255]);
      const previous = this.layers.get(part.id);
      const layer = previous?.key === key ? previous.asset : prepareLayer(source, part);
      // Keep only current layers, with a bounded cache; landmarks never invalidate it.
      cacheBytes += layer.data.byteLength;
      if (cacheBytes <= 128 * 1024 * 1024) currentLayers.set(part.id, { key, asset: layer });
      for (let y = Math.max(0, -top); y < Math.min(layer.height, ir.canvas.height - top); y++) {
        for (let x = Math.max(0, -left); x < Math.min(layer.width, ir.canvas.width - left); x++) {
          blend(data, ((y + top) * ir.canvas.width + x + left) * 4, layer.data, (y * layer.width + x) * 4);
        }
      }
    }
    this.layers = currentLayers;
    const frame = { width: ir.canvas.width, height: ir.canvas.height, data };
    return { ...frame, bounds: alphaBounds(frame) };
  }
}
