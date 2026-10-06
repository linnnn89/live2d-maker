import type { ArtworkIR, Part, Bounds } from '../editor/contracts';
import { ArtworkError, dimensions, type PixelFrame, type RasterAsset } from './contracts';
import { MemoryBudget, type MemoryLease } from './MemoryBudget';
import { artworkKey, checkCancelled, renderControl } from './content';

export type AssetLoader = (part: Part, signal?: AbortSignal) => Promise<RasterAsset & { release?: () => void }>;
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
function* layerRows(asset: RasterAsset, part: Part): Generator<void, RasterAsset> {
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
      if (x % 16384 === 16383) yield;
    }
    if (y % 32 === 31) yield;
  }
  return { width: asset.width, height: asset.height, data };
}

export function prepareLayer(asset: RasterAsset, part: Part): RasterAsset {
  const rows = layerRows(asset, part); let step = rows.next();
  while (!step.done) step = rows.next();
  return step.value;
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
  private layers = new Map<string, { key: string; asset: RasterAsset; lease: MemoryLease }>();
  private frames = new Map<string, { frame: PixelFrame; lease: MemoryLease }>();
  private compositions = 0;
  private running = false;
  constructor(private load: AssetLoader, readonly memory = new MemoryBudget(), private yieldTask?: () => Promise<void>, private sliceMs=8) {}
  get stats() { return { compositions: this.compositions, ...this.memory.stats }; }
  async render(ir: ArtworkIR, signal?: AbortSignal): Promise<PixelFrame> {
    const result = await this.acquire(ir, signal); result.release(); return result.frame;
  }
  async acquire(ir: ArtworkIR, signal?: AbortSignal): Promise<{ frame: PixelFrame; release(): void }> {
    if (this.running) throw new ArtworkError('BACKEND_BUSY', '美术合成正在执行');
    dimensions(ir.canvas.width, ir.canvas.height);
    checkCancelled(signal); this.running = true;
    const checkpoint = renderControl(signal, this.yieldTask, this.sliceMs), key = artworkKey(ir);
    let entry = this.frames.get(key), output: MemoryLease | undefined, composite: MemoryLease | undefined;
    try {
      if (entry) { this.frames.delete(key); this.frames.set(key, entry); }
      if (!entry) {
        const parts = [...ir.parts].sort((a,b)=>a.z-b.z).filter(part=>part.appearance?.visible!==false && part.appearance?.opacity!==0);
        composite = this.memory.reserve(ir.canvas.width * ir.canvas.height * 4);
        const data = new Uint8ClampedArray(ir.canvas.width * ir.canvas.height * 4);
        let left=ir.canvas.width, top=ir.canvas.height, right=0, bottom=0;
        for (const part of parts) {
          await checkpoint();
          const layerKey=JSON.stringify([part.asset,part.geometry.polygon,part.appearance?.opacity??255]);
          let cached=this.layers.get(part.id);
          if (cached?.key!==layerKey) {
            cached?.lease.release(); cached=undefined;
            const source=await this.load(part,signal);
            let storage: MemoryLease | undefined;
            try {
              checkCancelled(signal); dimensions(source.width,source.height);
              if (source.width!==part.asset.size.width || source.height!==part.asset.size.height || source.data.length!==source.width*source.height*4) throw new ArtworkError('ASSET_SIZE','素材尺寸与 IR 不一致',part.id);
              storage=this.memory.reserve(source.data.byteLength);
              const rows=layerRows(source,part); let step=rows.next();
              while (!step.done) { await checkpoint(); step=rows.next(); }
              cached={key:layerKey,asset:step.value,lease:storage};
              this.layers.set(part.id,cached);
              const owned=cached;
              storage.retain(()=>{ if(this.layers.get(part.id)===owned)this.layers.delete(part.id); });
              storage=undefined;
            } finally { storage?.release(); source.release?.(); }
          }
          const unpin=cached!.lease.pin(), layer=cached!.asset, offset=part.asset.offset;
          try {
            if (!Number.isInteger(offset.left) || !Number.isInteger(offset.top)) throw new ArtworkError('INVALID_GEOMETRY','素材位置必须是整数',part.id);
            for (let y=Math.max(0,-offset.top);y<Math.min(layer.height,ir.canvas.height-offset.top);y++) {
              for (let x=Math.max(0,-offset.left);x<Math.min(layer.width,ir.canvas.width-offset.left);x++) {
                const target=((y+offset.top)*ir.canvas.width+x+offset.left)*4;
                blend(data,target,layer.data,(y*layer.width+x)*4);
                if (data[target+3]) { left=Math.min(left,x+offset.left);top=Math.min(top,y+offset.top);right=Math.max(right,x+offset.left+1);bottom=Math.max(bottom,y+offset.top+1); }
                if (x%16384===16383) await checkpoint();
              }
              if (y%32===31) await checkpoint();
            }
          } finally { unpin(); }
        }
        checkCancelled(signal);
        const frame={width:ir.canvas.width,height:ir.canvas.height,data,bounds:right?[left,top,right,bottom] as Bounds:null};
        entry={frame,lease:composite}; this.frames.set(key,entry);
        const owned=entry; composite.retain(()=>{if(this.frames.get(key)===owned)this.frames.delete(key);}); composite=undefined;
        this.compositions++;
        while (this.frames.size>2) this.frames.values().next().value!.lease.release();
      }
      const unpin=entry.lease.pin();
      try {
        output=this.memory.reserve(entry.frame.data.byteLength);
        const frame={...entry.frame,data:new Uint8ClampedArray(entry.frame.data),bounds:entry.frame.bounds?[...entry.frame.bounds] as Bounds:null};
        const owned=output;output=undefined; return {frame,release:owned.release};
      } finally { unpin(); }
    } finally { output?.release();composite?.release();this.running=false; }
  }
}
